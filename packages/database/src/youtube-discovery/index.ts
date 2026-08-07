import { recordAuditEvent, type AuditEventWriter } from "../audit-writers";
import { createSystemAuditActor, type AuditActor } from "../actors";
import { getDb } from "../client";
import { youtubeDiscoveryPolicyVersions, youtubeDiscoveryQueryProposals, youtubeDiscoveryQueryProposalReasonValues, youtubeDiscoveryRuns, type YoutubeDiscoveryQueryProposalOrigin, type YoutubeDiscoveryQueryProposalReason } from "../schema";
import type { YoutubeDiscoveryPolicyAuditSummary, YoutubeDiscoveryQueryProposalAuditSummary, YoutubeDiscoveryRunAuditSummary } from "@xuyenviet/contracts";
import { parseYoutubeDiscoveryPolicy } from "@xuyenviet/domain";
import { eq } from "drizzle-orm";

type DiscoveryWriter = Pick<ReturnType<typeof getDb>, "insert" | "select" | "update" | "transaction"> & AuditEventWriter;

export type CreateYoutubeDiscoveryPolicyVersionInput = Readonly<{ version: number; isCurrent: boolean; policy?: unknown; actor: AuditActor }>;
export type CreateYoutubeDiscoveryQueryProposalInput = Readonly<{ origin: YoutubeDiscoveryQueryProposalOrigin; reason: YoutubeDiscoveryQueryProposalReason; priority: number; queryText: string; enabled?: boolean; cadenceMinutes: number; actor: AuditActor }>;
export type CreateYoutubeDiscoveryRunInput = Readonly<{ policyVersionId: string; queryProposalId?: string }>;

export async function createYoutubeDiscoveryPolicyVersion(input: CreateYoutubeDiscoveryPolicyVersionInput, database: DiscoveryWriter = getDb()) {
  const policy = parseYoutubeDiscoveryPolicy(input.policy === undefined ? {} : input.policy);
  assertDiscoveryPolicyActor(input.actor);
  return database.transaction(async (transaction) => {
    if (input.isCurrent) await transaction.update(youtubeDiscoveryPolicyVersions).set({ isCurrent: false }).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true));
    const [created] = await transaction.insert(youtubeDiscoveryPolicyVersions).values({ version: input.version, isCurrent: input.isCurrent, ...policy }).returning();
    if (!created) throw new Error("YouTube Discovery policy creation failed.");
    await recordAuditEvent({ actor: input.actor, operation: "create", targetType: "youtube_discovery_policy_version", targetId: created.id, afterSummary: JSON.stringify(policyAuditSummary(created)) }, transaction);
    return created;
  });
}

export async function createYoutubeDiscoveryQueryProposal(input: CreateYoutubeDiscoveryQueryProposalInput, database: DiscoveryWriter = getDb()) {
  assertDiscoveryQueryActor(input.origin, input.actor);
  assertSafeDiscoveryQueryProposal(input);
  return database.transaction(async (transaction) => {
    const { actor, ...proposal } = input;
    const [created] = await transaction.insert(youtubeDiscoveryQueryProposals).values({ ...proposal, enabled: input.enabled ?? true }).returning();
    if (!created) throw new Error("YouTube Discovery query proposal creation failed.");
    await recordAuditEvent({ actor, operation: "create", targetType: "youtube_discovery_query_proposal", targetId: created.id, afterSummary: JSON.stringify(queryProposalAuditSummary(created)) }, transaction);
    return created;
  });
}

export async function createYoutubeDiscoveryRun(input: CreateYoutubeDiscoveryRunInput, database: DiscoveryWriter = getDb()) {
  return database.transaction(async (transaction) => {
    const [policy] = await transaction.select({ id: youtubeDiscoveryPolicyVersions.id, enabled: youtubeDiscoveryPolicyVersions.enabled }).from(youtubeDiscoveryPolicyVersions).where(eq(youtubeDiscoveryPolicyVersions.isCurrent, true)).limit(1).for("update");
    if (!policy) throw new Error("YouTube Discovery runs require the current policy version.");
    if (policy.id !== input.policyVersionId) throw new Error("YouTube Discovery runs require the current policy version.");
    if (!policy.enabled) throw new Error("YouTube Discovery runs require an enabled current policy version.");
    if (input.queryProposalId) {
      const [proposal] = await transaction.select({ id: youtubeDiscoveryQueryProposals.id, enabled: youtubeDiscoveryQueryProposals.enabled }).from(youtubeDiscoveryQueryProposals).where(eq(youtubeDiscoveryQueryProposals.id, input.queryProposalId)).limit(1).for("update");
      if (!proposal || !proposal.enabled) throw new Error("YouTube Discovery runs require an enabled query proposal.");
    }
    const [created] = await transaction.insert(youtubeDiscoveryRuns).values({ policyVersionId: input.policyVersionId, queryProposalId: input.queryProposalId, state: "queued" }).returning();
    if (!created) throw new Error("YouTube Discovery run creation failed.");
    await recordAuditEvent({ actor: createSystemAuditActor("system-youtube-discovery"), operation: "create", targetType: "youtube_discovery_run", targetId: created.id, afterSummary: JSON.stringify(runAuditSummary(created)) }, transaction);
    return created;
  });
}

function assertDiscoveryPolicyActor(actor: AuditActor) {
  if (actor.kind === "system" && actor.system !== "system-youtube-discovery") {
    throw new Error("YouTube Discovery automated policy work requires the Discovery system actor.");
  }
}

function assertDiscoveryQueryActor(origin: YoutubeDiscoveryQueryProposalOrigin, actor: AuditActor) {
  if (origin === "system" && (actor.kind !== "system" || actor.system !== "system-youtube-discovery")) {
    throw new Error("YouTube Discovery system query proposals require the Discovery system actor.");
  }
  if (origin === "operator" && actor.kind !== "user") {
    throw new Error("YouTube Discovery operator query proposals require a user actor.");
  }
}

function assertSafeDiscoveryQueryProposal(input: CreateYoutubeDiscoveryQueryProposalInput) {
  if (!youtubeDiscoveryQueryProposalReasonValues.includes(input.reason) || !/^[\p{L}\p{N} '-]{1,240}$/u.test(input.queryText.trim())) {
    throw new Error("Invalid YouTube Discovery query proposal.");
  }
}

function policyAuditSummary(policy: YoutubeDiscoveryPolicyAuditSummary): YoutubeDiscoveryPolicyAuditSummary {
  return { version: policy.version, enabled: policy.enabled, minimumCandidateScore: policy.minimumCandidateScore, priorityScoreWeight: policy.priorityScoreWeight, freshnessScoreWeight: policy.freshnessScoreWeight, cadenceMinutes: policy.cadenceMinutes, retentionDays: policy.retentionDays, commentSignalTtlDays: policy.commentSignalTtlDays, maxConcurrentRuns: policy.maxConcurrentRuns, maxRetryAttempts: policy.maxRetryAttempts, retryDelayMinutes: policy.retryDelayMinutes };
}

function queryProposalAuditSummary(proposal: YoutubeDiscoveryQueryProposalAuditSummary): YoutubeDiscoveryQueryProposalAuditSummary {
  return { origin: proposal.origin, priority: proposal.priority, enabled: proposal.enabled, cadenceMinutes: proposal.cadenceMinutes };
}

function runAuditSummary(run: YoutubeDiscoveryRunAuditSummary): YoutubeDiscoveryRunAuditSummary {
  return { policyVersionId: run.policyVersionId, state: run.state };
}
