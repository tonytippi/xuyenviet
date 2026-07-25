import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { tripPlanItems, tripProjectConstraints, tripProjects } from "@/db/schema";
import { completeTripChangeProposalDraft } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel } from "@/features/ai/models";
import { buildTripChangeProposalDraftMessages, tripChangeProposalDraftPromptVersion } from "@/features/ai/prompts";
import { aiUsagePurposes } from "@/features/usage/constants";
import { writeAiUsageEvent } from "@/features/usage/events";
import type { AuthenticatedSession } from "@/server/auth";

// Story 7.4: AI Orchestration proposal-draft module. Reads the current Trip
// Planning aggregate via Chat/Trips-owned tables (read-only), builds the prompt,
// calls the AI Gateway with a schema-validated JSON contract, parses the result,
// and returns an UNTRUSTED typed draft. This module persists nothing and writes
// no tables; persistence is delegated to persistAiTripChangeProposalDraft.

const tripChangeProposalDraftPurpose = aiUsagePurposes.tripChangeProposalDraft;

export type UntrustedTripChangeProposalDraft = {
  ok: true;
  rationale: string;
  operations: unknown;
  alternatives: unknown;
  expectedAggregateVersion: number;
  expectedItemVersions: Record<string, number>;
  usage: {
    provider: string;
    model: string;
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    cachedPromptTokens: number | null;
    cacheWritePromptTokens: number | null;
    providerRequestId: string | null;
  };
  aiGatewayModelId: string;
  pricingSnapshot: ReturnType<typeof getAiGatewayPricingSnapshot>;
} | {
  ok: false;
  reason: "no_model" | "no_project" | "gateway_failed" | "parse_failed";
  usage?: {
    provider: string;
    model: string;
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    cachedPromptTokens: number | null;
    cacheWritePromptTokens: number | null;
    providerRequestId: string | null;
  };
  aiGatewayModelId?: string;
  pricingSnapshot?: ReturnType<typeof getAiGatewayPricingSnapshot>;
};

export async function draftTripChangeProposal({
  session,
  tripProjectId,
  question,
  abortSignal,
}: {
  session: AuthenticatedSession;
  tripProjectId: string;
  question: string;
  abortSignal?: AbortSignal;
}): Promise<UntrustedTripChangeProposalDraft> {
  const db = getDb();

  const [project] = await db
    .select({ id: tripProjects.id, aggregateVersion: tripProjects.aggregateVersion })
    .from(tripProjects)
    .where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId)))
    .limit(1);

  if (!project) {
    return { ok: false, reason: "no_project" };
  }

  const itemRows = await db
    .select({
      id: tripPlanItems.id,
      kind: tripPlanItems.kind,
      anchorRole: tripPlanItems.anchorRole,
      type: tripPlanItems.type,
      state: tripPlanItems.state,
      label: tripPlanItems.label,
      ordinal: tripPlanItems.ordinal,
      parentItemId: tripPlanItems.parentItemId,
      backupTargetItemId: tripPlanItems.backupTargetItemId,
      transportOriginLabel: tripPlanItems.transportOriginLabel,
      transportDestinationLabel: tripPlanItems.transportDestinationLabel,
      accommodationPlaceAreaLabel: tripPlanItems.accommodationPlaceAreaLabel,
      version: tripPlanItems.version,
    })
    .from(tripPlanItems)
    .where(and(eq(tripPlanItems.tripProjectId, tripProjectId), eq(tripPlanItems.userId, session.userId)));

  const [constraintsRow] = await db
    .select({
      adultCount: tripProjectConstraints.adultCount,
      childCount: tripProjectConstraints.childCount,
      children: tripProjectConstraints.children,
      vehicleType: tripProjectConstraints.vehicleType,
      evChargingNeed: tripProjectConstraints.evChargingNeed,
      drivingToleranceHours: tripProjectConstraints.drivingToleranceHours,
      budgetCurrency: tripProjectConstraints.budgetCurrency,
      budgetMinVnd: tripProjectConstraints.budgetMinVnd,
      budgetMaxVnd: tripProjectConstraints.budgetMaxVnd,
      preferenceTags: tripProjectConstraints.preferenceTags,
      avoidItems: tripProjectConstraints.avoidItems,
    })
    .from(tripProjectConstraints)
    .where(and(eq(tripProjectConstraints.tripProjectId, tripProjectId), eq(tripProjectConstraints.userId, session.userId)))
    .limit(1);

  const selectedModel = await selectActiveAiGatewayModel({
    purpose: "extraction",
    requiredCapabilities: { textInput: true, extraction: true },
  });

  if (!selectedModel) {
    return { ok: false, reason: "no_model" };
  }

  const pricingSnapshot = getAiGatewayPricingSnapshot(selectedModel);

  const currentAggregateSummary = {
    aggregateVersion: project.aggregateVersion,
    items: itemRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      anchorRole: row.anchorRole,
      type: row.type,
      state: row.state,
      label: row.label,
      ordinal: row.ordinal,
      parentItemId: row.parentItemId,
      backupTargetItemId: row.backupTargetItemId,
      transportOriginLabel: row.transportOriginLabel,
      transportDestinationLabel: row.transportDestinationLabel,
      accommodationPlaceAreaLabel: row.accommodationPlaceAreaLabel,
    })),
    constraints: constraintsRow ?? null,
  };

  const messages = buildTripChangeProposalDraftMessages({ question, currentAggregateSummary });
  const result = await completeTripChangeProposalDraft({ model: selectedModel.gatewayModelName, messages, abortSignal });

  if (!result.ok) {
    await recordDraftUsage(db, {
      userId: session.userId,
      tripProjectId,
      purpose: tripChangeProposalDraftPurpose,
      provider: result.provider,
      model: result.model,
      aiGatewayModelId: selectedModel.id,
      promptVersion: tripChangeProposalDraftPromptVersion,
      status: "failure",
      latencyMs: result.latencyMs,
      pricingSnapshot,
      errorCode: result.errorCode,
      providerRequestId: result.requestMetadata.providerRequestId,
    });

    return {
      ok: false,
      reason: "gateway_failed",
      usage: {
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        cachedPromptTokens: null,
        cacheWritePromptTokens: null,
        providerRequestId: result.requestMetadata.providerRequestId,
      },
      aiGatewayModelId: selectedModel.id,
      pricingSnapshot,
    };
  }

  const parsed = parseDraftPayload(result.content);

  if (!parsed) {
    await recordDraftUsage(db, {
      userId: session.userId,
      tripProjectId,
      purpose: tripChangeProposalDraftPurpose,
      provider: result.provider,
      model: result.model,
      aiGatewayModelId: selectedModel.id,
      promptVersion: tripChangeProposalDraftPromptVersion,
      status: "failure",
      latencyMs: result.latencyMs,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      cachedPromptTokens: result.usage.cachedPromptTokens,
      cacheWritePromptTokens: result.usage.cacheWritePromptTokens,
      pricingSnapshot,
      errorCode: "invalid_gateway_response",
      providerRequestId: result.requestMetadata.providerRequestId,
    });

    return {
      ok: false,
      reason: "parse_failed",
      usage: {
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        cachedPromptTokens: result.usage.cachedPromptTokens,
        cacheWritePromptTokens: result.usage.cacheWritePromptTokens,
        providerRequestId: result.requestMetadata.providerRequestId,
      },
      aiGatewayModelId: selectedModel.id,
      pricingSnapshot,
    };
  }

  const expectedItemVersions: Record<string, number> = {};
  for (const row of itemRows) {
    expectedItemVersions[row.id] = row.version;
  }

  return {
    ok: true,
    rationale: parsed.rationale,
    operations: parsed.operations,
    alternatives: parsed.alternatives,
    expectedAggregateVersion: project.aggregateVersion,
    expectedItemVersions,
    usage: {
      provider: result.provider,
      model: result.model,
      latencyMs: result.latencyMs,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      totalTokens: result.usage.totalTokens,
      cachedPromptTokens: result.usage.cachedPromptTokens,
      cacheWritePromptTokens: result.usage.cacheWritePromptTokens,
      providerRequestId: result.requestMetadata.providerRequestId,
    },
    aiGatewayModelId: selectedModel.id,
    pricingSnapshot,
  };
}

export async function recordTripChangeProposalDraftUsage(input: {
  session: AuthenticatedSession;
  tripProjectId: string;
  draft: UntrustedTripChangeProposalDraft;
}) {
  if (!input.draft.ok) return;
  await recordDraftUsage(getDb(), {
    userId: input.session.userId,
    tripProjectId: input.tripProjectId,
    purpose: tripChangeProposalDraftPurpose,
    provider: input.draft.usage.provider,
    model: input.draft.usage.model,
    aiGatewayModelId: input.draft.aiGatewayModelId,
    promptVersion: tripChangeProposalDraftPromptVersion,
    status: "success",
    latencyMs: input.draft.usage.latencyMs,
    promptTokens: input.draft.usage.promptTokens,
    completionTokens: input.draft.usage.completionTokens,
    totalTokens: input.draft.usage.totalTokens,
    cachedPromptTokens: input.draft.usage.cachedPromptTokens,
    cacheWritePromptTokens: input.draft.usage.cacheWritePromptTokens,
    pricingSnapshot: input.draft.pricingSnapshot,
    providerRequestId: input.draft.usage.providerRequestId,
  });
}

type DraftUsageInput = {
  userId: string;
  tripProjectId: string;
  purpose: string;
  provider: string;
  model: string;
  aiGatewayModelId: string;
  promptVersion: string;
  status: "success" | "failure";
  latencyMs: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  cachedPromptTokens?: number | null;
  cacheWritePromptTokens?: number | null;
  pricingSnapshot: ReturnType<typeof getAiGatewayPricingSnapshot>;
  errorCode?: string | null;
  providerRequestId?: string | null;
};

async function recordDraftUsage(db: ReturnType<typeof getDb>, input: DraftUsageInput) {
  try {
    await writeAiUsageEvent(db, {
      userId: input.userId,
      purpose: input.purpose,
      provider: input.provider,
      model: input.model,
      aiGatewayModelId: input.aiGatewayModelId,
      promptVersion: input.promptVersion,
      status: input.status,
      latencyMs: input.latencyMs,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      cachedPromptTokens: input.cachedPromptTokens,
      cacheWritePromptTokens: input.cacheWritePromptTokens,
      pricingSnapshot: input.pricingSnapshot,
      errorCode: input.errorCode,
      providerRequestId: input.providerRequestId,
    });
  } catch (error) {
    console.warn("Trip change proposal draft usage event could not be recorded", {
      tripProjectId: input.tripProjectId,
      status: input.status,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
  }
}

type ParsedDraft = {
  rationale: string;
  operations: unknown;
  alternatives: unknown;
};

function parseDraftPayload(content: string): ParsedDraft | null {
  const stripped = content.trim().replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (typeof parsed.rationale !== "string" || !parsed.rationale.trim()) return null;
  if (!Array.isArray(parsed.operations) || parsed.operations.length === 0) return null;
  const alternatives = Array.isArray(parsed.alternatives) ? parsed.alternatives : null;
  return { rationale: parsed.rationale, operations: parsed.operations, alternatives };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
