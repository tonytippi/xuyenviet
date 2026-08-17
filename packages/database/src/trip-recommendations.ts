import { createHash } from "node:crypto";

import { and, desc, eq, sql } from "drizzle-orm";
import type { AcceptTripCreationRecommendationCommand, AcceptTripCreationRecommendationResult, ContinueInTripCommand, ContinueInTripResult, RecommendationActionResult, RecommendationDecisionCommand, TripRecommendationResponse } from "@xuyenviet/contracts";
import { parsePlanningContextSession } from "@xuyenviet/contracts";
import type { TripRecommendationReadRepository } from "@xuyenviet/domain";

import { toUserAuditActor } from "./actors";
import { recordAuditEvent } from "./audit-writers";
import { getDb } from "./client";
import { aiAskCommands, conversations, messages, planningContextSessions, tripRecommendationAcceptances, tripRecommendationContexts, tripRecommendationDecisions, tripRecommendationDeclines, tripProjects, users } from "./schema";
import { resolveOwnedPrimaryConversationInTransaction } from "./primary-conversation";
import { insertPendingTripChangeProposalInTransaction } from "./traveler-proposal-commands";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;
type CurrentContext = { revision: number; fingerprint: string; facts: Array<{ field: string; value: string }>; operations: unknown[] };

export function normalizeTripRecommendationFacts(facts: Array<{ field: string; value: string }>) {
  return facts.map((fact) => ({ field: fact.field, value: fact.value.trim().replace(/\s+/g, " ").toLocaleLowerCase("vi-VN") })).filter((fact) => fact.value).sort((left, right) => left.field.localeCompare(right.field) || left.value.localeCompare(right.value));
}
export function fingerprintTripRecommendationFacts(facts: Array<{ field: string; value: string }>) { return createHash("sha256").update(JSON.stringify(normalizeTripRecommendationFacts(facts))).digest("hex"); }

export function createPostgresTripRecommendationReadRepository(): TripRecommendationReadRepository {
  return { async loadOwnedTripRecommendations(userId, conversationId) { return getDb().transaction((transaction) => loadRecommendations(transaction, userId, conversationId)); } };
}

export async function declineTripCreationRecommendation(userId: string, input: RecommendationDecisionCommand): Promise<RecommendationActionResult> {
  try { return await getDb().transaction(async (transaction) => {
    const [decision] = await transaction.select().from(tripRecommendationDecisions).where(and(eq(tripRecommendationDecisions.id, input.decisionId), eq(tripRecommendationDecisions.userId, userId), eq(tripRecommendationDecisions.kind, "creation"))).limit(1).for("update");
    if (!decision || decision.status !== "open" || !(await currentDecision(transaction, decision))) return { success: false, reason: "refresh_required" };
    await transaction.insert(tripRecommendationDeclines).values({ userId, conversationId: decision.conversationId, contextRevision: decision.contextRevision, fingerprint: decision.contextFingerprint }).onConflictDoNothing();
    // A decline hides this revision from automatic offers. The still-current
    // decision remains usable only when the traveler explicitly saves later.
    return { success: true };
  }); } catch { return { success: false, reason: "failed" }; }
}

export async function choosePrivateTripRecommendation(userId: string, input: RecommendationDecisionCommand): Promise<RecommendationActionResult> {
  try { return await getDb().transaction(async (transaction) => {
    const [decision] = await transaction.select().from(tripRecommendationDecisions).where(and(eq(tripRecommendationDecisions.id, input.decisionId), eq(tripRecommendationDecisions.userId, userId))).limit(1).for("update");
    if (!decision || decision.status !== "open" || !(await currentDecision(transaction, decision))) return { success: false, reason: "refresh_required" };
    await transaction.update(tripRecommendationDecisions).set({ status: "private", consumedAt: new Date() }).where(eq(tripRecommendationDecisions.id, decision.id));
    return { success: true };
  }); } catch { return { success: false, reason: "failed" }; }
}

export async function continueInTrip(userId: string, input: ContinueInTripCommand): Promise<ContinueInTripResult> {
  try { return await getDb().transaction(async (transaction) => {
    const [decision] = await transaction.select().from(tripRecommendationDecisions).where(and(eq(tripRecommendationDecisions.id, input.decisionId), eq(tripRecommendationDecisions.userId, userId), eq(tripRecommendationDecisions.kind, "context"), eq(tripRecommendationDecisions.candidateTripProjectId, input.tripProjectId))).limit(1).for("update");
    if (!decision || decision.status !== "open" || !(await currentDecision(transaction, decision))) return { success: false, reason: "refresh_required" };
    const primary = await resolveOwnedPrimaryConversationInTransaction(transaction, userId, input.tripProjectId);
    if (!primary) return { success: false, reason: "not_found" };
    await transaction.update(tripRecommendationDecisions).set({ status: "consumed", consumedAt: new Date() }).where(eq(tripRecommendationDecisions.id, decision.id));
    return { success: true, destination: { tripProjectId: input.tripProjectId, conversationId: primary.id } };
  }); } catch { return { success: false, reason: "failed" }; }
}

export async function acceptTripCreationRecommendation(userId: string, input: AcceptTripCreationRecommendationCommand): Promise<AcceptTripCreationRecommendationResult> {
  const requestDigest = createHash("sha256").update(JSON.stringify({ version: 1, decisionId: input.decisionId })).digest("hex");
  try { return await getDb().transaction(async (transaction) => {
    // Serialize same-key accepts before reading replay state so a concurrent
    // request observes the committed winner instead of a consumed decision.
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:${input.idempotencyKey}`}))`);
    const [replay] = await transaction.select().from(tripRecommendationAcceptances).where(and(eq(tripRecommendationAcceptances.userId, userId), eq(tripRecommendationAcceptances.idempotencyKey, input.idempotencyKey))).limit(1).for("update");
    if (replay) return replay.requestDigest === requestDigest ? replay.terminalResult as AcceptTripCreationRecommendationResult : { success: false, reason: "key_reused" };
    const [decision] = await transaction.select().from(tripRecommendationDecisions).where(and(eq(tripRecommendationDecisions.id, input.decisionId), eq(tripRecommendationDecisions.userId, userId), eq(tripRecommendationDecisions.kind, "creation"))).limit(1).for("update");
    if (!decision || decision.status !== "open" || !(await currentDecision(transaction, decision))) {
      const [accepted] = await transaction.select({ terminalResult: tripRecommendationAcceptances.terminalResult }).from(tripRecommendationAcceptances).where(and(eq(tripRecommendationAcceptances.userId, userId), eq(tripRecommendationAcceptances.decisionId, input.decisionId), eq(tripRecommendationAcceptances.requestDigest, requestDigest))).limit(1);
      return accepted ? accepted.terminalResult as AcceptTripCreationRecommendationResult : { success: false, reason: "refresh_required" };
    }
    const decisionContext = await currentEligibleContext(transaction, userId, decision.conversationId);
    if (!decisionContext || decisionContext.revision !== decision.contextRevision || decisionContext.fingerprint !== decision.contextFingerprint) return { success: false, reason: "refresh_required" };
    const [actor] = await transaction.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1); if (!actor?.email) throw new Error("Audit actor unavailable");
    const [project] = await transaction.insert(tripProjects).values({ userId, title: "Chuyến đi mới" }).returning({ id: tripProjects.id });
    const primary = await resolveOwnedPrimaryConversationInTransaction(transaction, userId, project!.id);
    if (!primary) throw new Error("Primary conversation unavailable");
    const proposal = await insertPendingTripChangeProposalInTransaction(transaction, userId, { tripProjectId: project!.id, rationale: "Thông tin chuyến đi đã xác nhận", operations: decisionContext.operations });
    if (!proposal) throw new Error("Pending proposal unavailable");
    const result: AcceptTripCreationRecommendationResult = { success: true, destination: { tripProjectId: project!.id, conversationId: primary.id } };
    await transaction.update(tripRecommendationDecisions).set({ status: "consumed", consumedAt: new Date() }).where(eq(tripRecommendationDecisions.id, decision.id));
    await transaction.insert(tripRecommendationAcceptances).values({ userId, idempotencyKey: input.idempotencyKey, requestDigest, decisionId: decision.id, terminalResult: result });
    await recordAuditEvent({ actor: toUserAuditActor({ userId, email: actor.email }), operation: "create", targetType: "trip_project", targetId: project!.id, afterSummary: JSON.stringify({ recommendationDecision: true }) }, transaction);
    return result;
  }); } catch { return { success: false, reason: "failed" }; }
}

export async function discardTripRecommendationAcceptancesForDeletedResources(transaction: Transaction, userId: string, conversationIds: string[], tripProjectIds: string[]) {
  const ids = [...conversationIds, ...tripProjectIds];
  if (ids.length === 0) return;
  const result = { success: false, reason: "refresh_required" } satisfies AcceptTripCreationRecommendationResult;
  const decisionConditions = [
    conversationIds.length ? sql`${tripRecommendationDecisions.conversationId} in (${sql.join(conversationIds.map((id) => sql`${id}`), sql`, `)})` : undefined,
    tripProjectIds.length ? sql`${tripRecommendationDecisions.candidateTripProjectId} in (${sql.join(tripProjectIds.map((id) => sql`${id}`), sql`, `)})` : undefined,
  ].filter((condition): condition is ReturnType<typeof sql> => Boolean(condition));
  const invalidDecisions = await transaction.select({ id: tripRecommendationDecisions.id }).from(tripRecommendationDecisions).where(and(eq(tripRecommendationDecisions.userId, userId), sql`(${sql.join(decisionConditions, sql` or `)})`));
  const acceptanceConditions = [
    invalidDecisions.length ? sql`${tripRecommendationAcceptances.decisionId} in (${sql.join(invalidDecisions.map((decision) => sql`${decision.id}`), sql`, `)})` : undefined,
    conversationIds.length ? sql`(${tripRecommendationAcceptances.terminalResult} -> 'destination' ->> 'conversationId') in (${sql.join(conversationIds.map((id) => sql`${id}`), sql`, `)})` : undefined,
    tripProjectIds.length ? sql`(${tripRecommendationAcceptances.terminalResult} -> 'destination' ->> 'tripProjectId') in (${sql.join(tripProjectIds.map((id) => sql`${id}`), sql`, `)})` : undefined,
  ].filter((condition): condition is ReturnType<typeof sql> => Boolean(condition));
  await transaction.update(tripRecommendationAcceptances).set({ terminalResult: result }).where(and(eq(tripRecommendationAcceptances.userId, userId), sql`(${sql.join(acceptanceConditions, sql` or `)})`));
}

async function loadRecommendations(transaction: Transaction, userId: string, conversationId: string): Promise<TripRecommendationResponse> {
  const [conversation] = await transaction.select({ id: conversations.id, tripProjectId: conversations.tripProjectId }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1).for("update");
  const none: TripRecommendationResponse = { tripCreationRecommendation: { kind: "none" }, tripContextRecommendation: { kind: "none" } };
  if (!conversation || conversation.tripProjectId) return none;
  const context = await currentEligibleContext(transaction, userId, conversationId);
  if (!context) return none;
  const [declined] = await transaction.select({ userId: tripRecommendationDeclines.userId }).from(tripRecommendationDeclines).where(and(eq(tripRecommendationDeclines.userId, userId), eq(tripRecommendationDeclines.conversationId, conversationId), eq(tripRecommendationDeclines.contextRevision, context.revision))).limit(1);
  const projects = await transaction.select({ id: tripProjects.id, title: tripProjects.title }).from(tripProjects).where(eq(tripProjects.userId, userId)).orderBy(desc(tripProjects.updatedAt), desc(tripProjects.id)).limit(3);
  const creation = declined ? { kind: "none" as const } : { kind: "offer" as const, decisionId: await openDecision(transaction, userId, conversationId, "creation", context), actions: ["save_trip", "private_answer"] as ["save_trip", "private_answer"] };
  if (projects.length === 1) return { tripCreationRecommendation: creation, tripContextRecommendation: { kind: "single", decisionId: await openDecision(transaction, userId, conversationId, "context", context, projects[0]!.id), tripProjectId: projects[0]!.id, title: projects[0]!.title.slice(0, 200), actions: ["continue_in_trip", "private_answer"] } };
  if (projects.length > 1) return { tripCreationRecommendation: creation, tripContextRecommendation: { kind: "multiple", decisionId: await openDecision(transaction, userId, conversationId, "context", context), actions: ["private_answer"] } };
  return { tripCreationRecommendation: creation, tripContextRecommendation: { kind: "none" } };
}
async function currentEligibleContext(transaction: Transaction, userId: string, conversationId: string): Promise<CurrentContext | null> {
  const [session] = await transaction.select({ payload: planningContextSessions.payload }).from(planningContextSessions).where(and(eq(planningContextSessions.userId, userId), eq(planningContextSessions.conversationId, conversationId))).limit(1).for("update");
  const parsed = session ? parsePlanningContextSession(session.payload) : null;
  if (!parsed || parsed.status !== "ready") return null;
  const answer = await currentCompletedUnscopedAnswer(transaction, userId, conversationId);
  if (!answer || !parsed.sourceMessageIds.includes(answer.userMessageId)) return null;
  const conversionSlots = new Set(["origin", "destination", "adults"]);
  const normalized = normalizeTripRecommendationFacts(Object.entries(parsed.slots)
    .filter(([field]) => conversionSlots.has(field) && parsed.slotSourceMessageIds[field as keyof typeof parsed.slotSourceMessageIds] === answer.userMessageId)
    .map(([field, value]) => ({ field, value })));
  const operations = proposalOperations(normalized);
  if (!operations) return null;
  // The offer identity is its executable conversion, not unrelated ready-session
  // slots. Source and terminal-answer identities still fence the eligible turn.
  const fingerprint = createHash("sha256").update(JSON.stringify({ operations, answerId: answer.id, userMessageId: answer.userMessageId })).digest("hex");
  const [existing] = await transaction.select().from(tripRecommendationContexts).where(and(eq(tripRecommendationContexts.userId, userId), eq(tripRecommendationContexts.conversationId, conversationId))).limit(1).for("update");
  if (!existing) { await transaction.insert(tripRecommendationContexts).values({ userId, conversationId, revision: 1, fingerprint }); return { revision: 1, fingerprint, facts: normalized, operations }; }
  if (existing.fingerprint !== fingerprint) { const revision = existing.revision + 1; await transaction.update(tripRecommendationContexts).set({ revision, fingerprint, updatedAt: new Date() }).where(and(eq(tripRecommendationContexts.userId, userId), eq(tripRecommendationContexts.conversationId, conversationId))); return { revision, fingerprint, facts: normalized, operations }; }
  return { revision: existing.revision, fingerprint, facts: normalized, operations };
}
async function openDecision(transaction: Transaction, userId: string, conversationId: string, kind: "creation" | "context", context: CurrentContext, candidateTripProjectId?: string) { const [existing] = await transaction.select({ id: tripRecommendationDecisions.id }).from(tripRecommendationDecisions).where(and(eq(tripRecommendationDecisions.userId, userId), eq(tripRecommendationDecisions.conversationId, conversationId), eq(tripRecommendationDecisions.kind, kind), eq(tripRecommendationDecisions.contextRevision, context.revision), eq(tripRecommendationDecisions.status, "open"), candidateTripProjectId ? eq(tripRecommendationDecisions.candidateTripProjectId, candidateTripProjectId) : sql`${tripRecommendationDecisions.candidateTripProjectId} is null`)).limit(1); if (existing) return existing.id; const [created] = await transaction.insert(tripRecommendationDecisions).values({ userId, conversationId, kind, contextRevision: context.revision, contextFingerprint: context.fingerprint, candidateTripProjectId: candidateTripProjectId ?? null }).returning({ id: tripRecommendationDecisions.id }); return created!.id; }
async function currentDecision(transaction: Transaction, decision: { userId: string; conversationId: string; contextRevision: number; contextFingerprint: string }) {
  const [conversation] = await transaction.select({ id: conversations.id, tripProjectId: conversations.tripProjectId }).from(conversations).where(and(eq(conversations.id, decision.conversationId), eq(conversations.userId, decision.userId))).limit(1).for("update");
  if (!conversation || conversation.tripProjectId) return false;
  const context = await currentEligibleContext(transaction, decision.userId, decision.conversationId);
  return Boolean(context && context.revision === decision.contextRevision && context.fingerprint === decision.contextFingerprint);
}

async function currentCompletedUnscopedAnswer(transaction: Transaction, userId: string, conversationId: string) {
  const [latest] = await transaction.select({ id: aiAskCommands.id, status: aiAskCommands.status, scopeKind: aiAskCommands.scopeKind, scopeId: aiAskCommands.scopeId, tripProjectId: aiAskCommands.tripProjectId, terminalResult: aiAskCommands.terminalResult, userMessageId: aiAskCommands.userMessageId, assistantMessageId: aiAskCommands.assistantMessageId }).from(aiAskCommands).where(and(eq(aiAskCommands.userId, userId), eq(aiAskCommands.conversationId, conversationId), sql`${aiAskCommands.terminalAt} is not null`)).orderBy(desc(aiAskCommands.terminalAt), desc(aiAskCommands.id)).limit(1).for("update");
  if (!latest || latest.status !== "completed" || latest.scopeKind !== "conversation" || latest.scopeId !== conversationId || latest.tripProjectId !== null || latest.terminalResult?.type !== "done" || !latest.userMessageId || !latest.assistantMessageId) return null;
  const [assistant] = await transaction.select({ id: messages.id }).from(messages).where(and(eq(messages.id, latest.assistantMessageId), eq(messages.conversationId, conversationId), eq(messages.userId, userId), eq(messages.role, "assistant"))).limit(1);
  return assistant ? { id: latest.id, userMessageId: latest.userMessageId } : null;
}

function proposalOperations(facts: Array<{ field: string; value: string }>) {
  const byField = new Map(facts.map((fact) => [fact.field, fact.value]));
  const operations: unknown[] = [];
  for (const role of ["origin", "destination"] as const) {
    const label = byField.get(role);
    if (label) operations.push({ kind: "create-item", item: { kind: "anchor", anchorRole: role, type: null, state: "idea", label, notes: null, plannedAt: null, backupTargetItemId: null, transportOriginLabel: null, transportDestinationLabel: null, accommodationPlaceAreaLabel: null }, parentItemId: null, ordinal: operations.length });
  }
  const adults = byField.get("adults");
  if (adults && /^([1-9]|1\d|20)$/.test(adults)) operations.push({ kind: "upsert-constraints", constraints: { adultCount: Number(adults), childCount: 0, children: null, vehicleType: null, evChargingNeed: null, drivingToleranceHours: null, budgetCurrency: null, budgetMinVnd: null, budgetMaxVnd: null, preferenceTags: null, avoidItems: null }, expectedConstraintsVersion: null });
  return operations.length > 0 ? operations : null;
}
