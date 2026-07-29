import "server-only";

import { completeTripChangeProposalDraft } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel } from "@/features/ai/models";
import { buildTripChangeProposalDraftMessages, tripChangeProposalDraftPromptVersion } from "@/features/ai/prompts";
import { readOwnedTripProjectAggregateForProposalDraft } from "@/features/chat-trips/trip-projects";
import { aiUsagePurposes } from "@/features/usage/constants";
import { writeAiUsageEvent } from "@/features/audit/usage";
import type { AuthenticatedSession } from "@/server/auth";
import { getDb } from "@/db/client";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;

// Story 7.4: AI Orchestration proposal-draft module. Reads the current Trip
// Planning aggregate via the Chat/Trips-owned query helper
// (readOwnedTripProjectAggregateForProposalDraft), builds the prompt, calls the
// AI Gateway with a schema-validated JSON contract, parses the result, and
// returns an UNTRUSTED typed draft. This module persists nothing and writes no
// tables; persistence is delegated to persistAiTripChangeProposalDraft. It does
// not import Chat/Trips-owned tables directly (AD-29/AD-30 ownership boundary).

const tripChangeProposalDraftPurpose = aiUsagePurposes.tripChangeProposalDraft;

export type UntrustedTripChangeProposalDraft = {
  ok: true;
  rationale: string;
  operations: unknown;
  alternatives: unknown;
  orderingPreconditions: unknown;
  expiresAt: string | null;
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
  beforeProviderCall,
}: {
  session: AuthenticatedSession;
  tripProjectId: string;
  question: string;
  abortSignal?: AbortSignal;
  beforeProviderCall?: () => Promise<boolean>;
}): Promise<UntrustedTripChangeProposalDraft> {
  const aggregate = await readOwnedTripProjectAggregateForProposalDraft(tripProjectId, session);

  if (!aggregate) {
    return { ok: false, reason: "no_project" };
  }

  const selectedModel = await selectActiveAiGatewayModel({
    purpose: "extraction",
    requiredCapabilities: { textInput: true, extraction: true },
  });

  if (!selectedModel) {
    return { ok: false, reason: "no_model" };
  }

  const pricingSnapshot = getAiGatewayPricingSnapshot(selectedModel);

  const currentAggregateSummary = {
    aggregateVersion: aggregate.aggregateVersion,
    items: aggregate.items.map((row) => ({
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
    constraints: aggregate.constraints ?? null,
  };

  const messages = buildTripChangeProposalDraftMessages({ question, currentAggregateSummary });
  if (beforeProviderCall && !await beforeProviderCall()) return { ok: false, reason: "no_project" };
  const result = await completeTripChangeProposalDraft({ model: selectedModel.gatewayModelName, messages, abortSignal });

  if (!result.ok) {
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
  for (const row of aggregate.items) {
    expectedItemVersions[row.id] = row.version;
  }

  return {
    ok: true,
    rationale: parsed.rationale,
    operations: parsed.operations,
    alternatives: parsed.alternatives,
    orderingPreconditions: parsed.orderingPreconditions,
    expiresAt: parsed.expiresAt,
    expectedAggregateVersion: aggregate.aggregateVersion,
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

export async function writeTripChangeProposalDraftUsageInTransaction(transaction: Transaction, input: {
  session: AuthenticatedSession;
  tripProjectId: string;
  draft: UntrustedTripChangeProposalDraft;
}) {
  if (!input.draft.usage || !input.draft.aiGatewayModelId || !input.draft.pricingSnapshot) return;
  await writeAiUsageEvent(transaction, {
    initiatedByUserId: input.session.userId,
    executorSystem: "system-ai-orchestration",
    tripProjectId: input.tripProjectId,
    purpose: tripChangeProposalDraftPurpose,
    provider: input.draft.usage.provider,
    model: input.draft.usage.model,
    aiGatewayModelId: input.draft.aiGatewayModelId,
    promptVersion: tripChangeProposalDraftPromptVersion,
    status: input.draft.ok ? "success" : "failure",
    latencyMs: input.draft.usage.latencyMs,
    promptTokens: input.draft.usage.promptTokens,
    completionTokens: input.draft.usage.completionTokens,
    totalTokens: input.draft.usage.totalTokens,
    cachedPromptTokens: input.draft.usage.cachedPromptTokens,
    cacheWritePromptTokens: input.draft.usage.cacheWritePromptTokens,
    pricingSnapshot: input.draft.pricingSnapshot,
    providerRequestId: input.draft.usage.providerRequestId,
    errorCode: input.draft.ok ? undefined : input.draft.reason === "parse_failed" ? "invalid_gateway_response" : "provider_failed",
  });
}

type ParsedDraft = {
  rationale: string;
  operations: unknown;
  alternatives: unknown;
  orderingPreconditions: unknown;
  expiresAt: string | null;
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
  // orderingPreconditions is optional (AC1: "ordering/parent preconditions when
  // applicable"). When the model omits it or emits null/invalid shape, default to
  // null so the column is nullable and 7.5 apply can still run.
  // E7R2-F2: the system prompt and expected_output example emit the snake_case
  // key `ordering_preconditions` (see prompts.ts buildTripChangeProposalDraftMessages).
  // The prior parser read only camelCase `orderingPreconditions`, so the model's
  // snake_case output was never read and the column was always null for AI drafts.
  // Read snake_case first (the documented prompt contract) and fall back to
  // camelCase for robustness/legacy callers so both shapes are parsed and persisted.
  const orderingPreconditionsRaw = parsed.ordering_preconditions ?? parsed.orderingPreconditions;
  const orderingPreconditions = isRecord(orderingPreconditionsRaw) || Array.isArray(orderingPreconditionsRaw) ? orderingPreconditionsRaw : null;
  // expires_at is optional (AC1: "optional expiry"). When the model omits it or
  // emits an invalid value, default to null so the column is nullable.
  // E7R2-F3: the prompt expected_output contract emits `expires_at` (snake_case);
  // accept the snake_case key the model is instructed to emit. A camelCase
  // `expiresAt` fallback is kept for robustness/legacy callers.
  const expiresAtRaw = parsed.expires_at ?? parsed.expiresAt;
  const expiresAt = typeof expiresAtRaw === "string" && expiresAtRaw.trim() && !Number.isNaN(Date.parse(expiresAtRaw.trim())) ? expiresAtRaw.trim() : null;
  return { rationale: parsed.rationale, operations: parsed.operations, alternatives, orderingPreconditions, expiresAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
