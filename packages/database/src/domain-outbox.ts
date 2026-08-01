import { randomBytes } from "node:crypto";

import { and, asc, eq, gt, lte, or, sql } from "drizzle-orm";

import { getDb } from "./client";
import { domainOutbox, type AiAskDomainOutboxEventType } from "./schema";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;

const idPattern = /^[A-Za-z0-9_-]{1,160}$/;
const workerIdPattern = /^[A-Za-z0-9_.:-]{1,160}$/;
const safeCodePattern = /^[a-z0-9_:-]{1,120}$/;

export type AiAskOutboxEnvelope = {
  version: 1;
  commandId: string;
  userId: string;
  conversationId: string;
  userMessageId?: string;
  assistantMessageId?: string;
  tripProjectId?: string;
  conversationLifecycleVersion: number;
  tripProjectAggregateVersion?: number;
};

export type DomainOutboxClaim = {
  id: string;
  eventType: AiAskDomainOutboxEventType;
  eventVersion: number;
  originatingCommandId: string;
  userId: string;
  fencingToken: string;
  leaseExpiresAt: Date;
  payload: unknown;
  attemptCount: number;
  claimedAt: Date;
  availableAt: Date;
  reclaimedLease: boolean;
  aggregateType: string;
  aggregateId: string;
  conversationId: string;
  tripProjectId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  conversationLifecycleVersion: number;
  tripProjectAggregateVersion: number | null;
};

export function parseAiAskOutboxEnvelope(value: unknown, eventType: AiAskDomainOutboxEventType): AiAskOutboxEnvelope | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["version", "commandId", "userId", "conversationId", "userMessageId", "assistantMessageId", "tripProjectId", "conversationLifecycleVersion", "tripProjectAggregateVersion"])) return null;
  if (value.version !== 1 || !isId(value.commandId) || !isId(value.userId) || !isId(value.conversationId) || !isFence(value.conversationLifecycleVersion)) return null;
  if (!isOptionalId(value.userMessageId) || !isOptionalId(value.assistantMessageId) || !isOptionalId(value.tripProjectId) || !isOptionalFence(value.tripProjectAggregateVersion)) return null;
  if ((value.tripProjectId === undefined) !== (value.tripProjectAggregateVersion === undefined)) return null;
  if (eventType === "ai_ask.context_extraction.v1" && (value.userMessageId === undefined || value.assistantMessageId !== undefined)) return null;
  if (eventType === "ai_ask.answer_annotation.v1" && (value.userMessageId === undefined || value.assistantMessageId === undefined)) return null;
  if (eventType === "ai_ask.trip_proposal_draft.v1" && (value.userMessageId === undefined || value.assistantMessageId === undefined || value.tripProjectId === undefined)) return null;
  return value as AiAskOutboxEnvelope;
}

export function aiAskOutboxDedupeKey(eventType: AiAskDomainOutboxEventType, commandId: string) {
  const suffix = eventType === "ai_ask.context_extraction.v1" ? "context-extraction" : eventType === "ai_ask.answer_annotation.v1" ? "answer-annotation" : "trip-proposal-draft";
  return `ai-ask:${commandId}:${suffix}:v1`;
}

export async function enqueueAiAskFollowUpInTransaction(transaction: Transaction, input: { eventType: AiAskDomainOutboxEventType; envelope: AiAskOutboxEnvelope; maxAttempts?: number }) {
  const envelope = parseAiAskOutboxEnvelope(input.envelope, input.eventType);
  if (!envelope) throw new Error("AI Ask outbox envelope is invalid.");
  const payload = JSON.stringify(envelope);
  if (Buffer.byteLength(payload, "utf8") > 4096) throw new Error("AI Ask outbox payload is too large.");
  const maxAttempts = input.maxAttempts ?? 3;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new Error("AI Ask outbox max attempts is invalid.");
  const [created] = await transaction.insert(domainOutbox).values({
    originatingCommandId: envelope.commandId,
    eventType: input.eventType,
    eventVersion: 1,
    aggregateType: "ai_ask_command",
    aggregateId: envelope.commandId,
    userId: envelope.userId,
    conversationId: envelope.conversationId,
    tripProjectId: envelope.tripProjectId ?? null,
    userMessageId: envelope.userMessageId ?? null,
    assistantMessageId: envelope.assistantMessageId ?? null,
    conversationLifecycleVersion: envelope.conversationLifecycleVersion,
    tripProjectAggregateVersion: envelope.tripProjectAggregateVersion ?? null,
    dedupeKey: aiAskOutboxDedupeKey(input.eventType, envelope.commandId),
    payload: envelope,
    maxAttempts,
  }).onConflictDoNothing().returning();
  if (created) return created;
  const [existing] = await transaction.select().from(domainOutbox).where(eq(domainOutbox.dedupeKey, aiAskOutboxDedupeKey(input.eventType, envelope.commandId))).limit(1);
  if (!existing) throw new Error("AI Ask outbox conflict row is unavailable.");
  return existing;
}

export function getDomainOutboxLeaseMs(value = process.env.AI_ASK_OUTBOX_LEASE_MS) {
  if (value === undefined) return 15 * 60_000;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 10 * 60_000 && parsed <= 60 * 60_000 ? parsed : null;
}

export function getDomainOutboxBatchSize(value = process.env.AI_ASK_OUTBOX_BATCH_SIZE) {
  if (value === undefined) return 10;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
}

export async function claimDueDomainOutboxEvents(input: { workerId: string; batchSize?: number; leaseMs?: number; now?: Date; onTerminalFailure?: (events: Array<Pick<DomainOutboxClaim, "id" | "attemptCount" | "reclaimedLease">>) => void }, db = getDb()): Promise<DomainOutboxClaim[]> {
  const workerId = input.workerId.trim();
  if (!workerIdPattern.test(workerId)) return [];
  const batchSize = input.batchSize ?? getDomainOutboxBatchSize();
  const leaseMs = input.leaseMs ?? getDomainOutboxLeaseMs();
  if (batchSize === null || leaseMs === null || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50 || !Number.isInteger(leaseMs) || leaseMs < 10 * 60_000 || leaseMs > 60 * 60_000) return [];
  const now = input.now ?? new Date();
  const claimResult = await db.transaction(async (transaction) => {
      const due = await transaction.select({ id: domainOutbox.id, eventVersion: domainOutbox.eventVersion, status: domainOutbox.status }).from(domainOutbox)
      .where(or(and(eq(domainOutbox.status, "pending"), lte(domainOutbox.availableAt, now)), and(eq(domainOutbox.status, "processing"), lte(domainOutbox.leaseExpiresAt, now))))
      .orderBy(asc(domainOutbox.availableAt), asc(domainOutbox.createdAt), asc(domainOutbox.id)).limit(batchSize).for("update", { skipLocked: true });
    const claims: DomainOutboxClaim[] = [];
    const terminalFailures: Array<Pick<DomainOutboxClaim, "id" | "attemptCount" | "reclaimedLease">> = [];
      for (const dueEvent of due) {
      const token = randomBytes(32).toString("hex");
      const leaseExpiresAt = new Date(now.getTime() + leaseMs);
      const [claimed] = await transaction.update(domainOutbox).set({ status: "processing", claimedBy: workerId, claimedAt: now, leaseExpiresAt, fencingToken: token, attemptCount: sql`${domainOutbox.attemptCount} + 1`, lastErrorCode: null, updatedAt: now })
        .where(and(eq(domainOutbox.id, dueEvent.id), eq(domainOutbox.eventVersion, dueEvent.eventVersion), or(and(eq(domainOutbox.status, "pending"), lte(domainOutbox.availableAt, now)), and(eq(domainOutbox.status, "processing"), lte(domainOutbox.leaseExpiresAt, now))), sql`${domainOutbox.attemptCount} < ${domainOutbox.maxAttempts}`)).returning();
      if (claimed) claims.push({ id: claimed.id, eventType: claimed.eventType, eventVersion: claimed.eventVersion, originatingCommandId: claimed.originatingCommandId, userId: claimed.userId, fencingToken: token, leaseExpiresAt, payload: claimed.payload, attemptCount: claimed.attemptCount, claimedAt: claimed.claimedAt!, availableAt: claimed.availableAt, reclaimedLease: dueEvent.status === "processing", aggregateType: claimed.aggregateType, aggregateId: claimed.aggregateId, conversationId: claimed.conversationId, tripProjectId: claimed.tripProjectId, userMessageId: claimed.userMessageId, assistantMessageId: claimed.assistantMessageId, conversationLifecycleVersion: claimed.conversationLifecycleVersion, tripProjectAggregateVersion: claimed.tripProjectAggregateVersion });
    }
    // Corrupt rows or a lease reclaimed after its final permitted attempt must not
    // remain claimable forever. This uses the same locked due-row transaction.
    for (const dueEvent of due) {
      const [exhausted] = await transaction.update(domainOutbox).set({ status: "failed", lastErrorCode: "retry_exhausted", failureCode: "retry_exhausted", failedAt: now, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now })
        .where(and(eq(domainOutbox.id, dueEvent.id), eq(domainOutbox.eventVersion, dueEvent.eventVersion), sql`${domainOutbox.attemptCount} >= ${domainOutbox.maxAttempts}`, or(and(eq(domainOutbox.status, "pending"), lte(domainOutbox.availableAt, now)), and(eq(domainOutbox.status, "processing"), lte(domainOutbox.leaseExpiresAt, now))))).returning();
      if (exhausted) { logTerminalFailure(exhausted, "retry_exhausted"); terminalFailures.push({ id: exhausted.id, attemptCount: exhausted.attemptCount, reclaimedLease: dueEvent.status === "processing" }); }
      }
    return { claims, terminalFailures };
    });
  if (claimResult.terminalFailures.length) { try { input.onTerminalFailure?.(claimResult.terminalFailures); } catch {} }
  return claimResult.claims;
}

export function retryDelayMs(attempt: number, random = Math.random) {
  const base = Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
  return base + Math.floor(Math.max(0, Math.min(1, random())) * Math.min(30_000, Math.floor(base / 4)));
}

export async function acknowledgeDomainOutboxEvent(input: { id: string; fencingToken: string; eventVersion: number; now?: Date }, db = getDb()) {
  const now = input.now ?? new Date();
  const [row] = await db.update(domainOutbox).set({ status: "completed", completedAt: now, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now })
    .where(activeClaimPredicate(input.id, input.fencingToken, input.eventVersion)).returning({ id: domainOutbox.id });
  return row ?? null;
}

// Check immediately before an external effect. The predicate uses the database
// clock, rather than a timestamp captured when the worker claimed the row.
export async function hasActiveDomainOutboxClaim(claim: Pick<DomainOutboxClaim, "id" | "fencingToken" | "eventVersion">, db = getDb()) {
  const [active] = await db.select({ id: domainOutbox.id }).from(domainOutbox)
    .where(activeClaimPredicate(claim.id, claim.fencingToken, claim.eventVersion)).limit(1);
  return Boolean(active);
}

// Consumer-owned result transactions use this rather than acknowledging after
// committing their effect. The active lease predicate makes the claim a write
// capability, including when a lease has been reclaimed by another worker.
export async function acknowledgeDomainOutboxEventInTransaction(transaction: Transaction, input: { id: string; fencingToken: string; eventVersion: number; now?: Date }) {
  const now = input.now ?? new Date();
  const [row] = await transaction.update(domainOutbox).set({ status: "completed", completedAt: now, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now })
    .where(activeClaimPredicate(input.id, input.fencingToken, input.eventVersion)).returning({ id: domainOutbox.id });
  return row ?? null;
}

// An active claim is a transaction-scoped write capability. Locking the outbox
// row before invoking `write` prevents a reclaimed claimant from committing an
// effect guard or domain mutation after its lease/token has been superseded.
export async function completeDomainOutboxClaimInTransaction<T>(transaction: Transaction, claim: Pick<DomainOutboxClaim, "id" | "fencingToken" | "eventVersion">, write: () => Promise<T>, now = new Date()): Promise<{ completed: true; value: T } | { completed: false }> {
  const [active] = await transaction.select({ id: domainOutbox.id }).from(domainOutbox)
    .where(activeClaimPredicate(claim.id, claim.fencingToken, claim.eventVersion)).limit(1).for("update");
  if (!active) return { completed: false };

  const value = await write();
  const acknowledged = await acknowledgeDomainOutboxEventInTransaction(transaction, { ...claim, now });
  if (!acknowledged) throw new Error("Active domain outbox claim was lost during completion.");
  return { completed: true, value };
}

// Some provider results become terminal only after a local persistence attempt.
// Keep that attempt, its durable effect, and the terminal claim disposition in
// the one transaction that owns the active claim.
export async function finalizeDomainOutboxClaimInTransaction<T>(transaction: Transaction, claim: Pick<DomainOutboxClaim, "id" | "fencingToken" | "eventVersion">, write: () => Promise<{ value: T; terminalCode?: string }>, now = new Date()): Promise<{ completed: true; value: T; terminal: boolean } | { completed: false }> {
  const [active] = await transaction.select({ id: domainOutbox.id }).from(domainOutbox)
    .where(activeClaimPredicate(claim.id, claim.fencingToken, claim.eventVersion)).limit(1).for("update");
  if (!active) return { completed: false };
  const result = await write();
  if (!result.terminalCode) {
    const completion = await completeDomainOutboxClaimInTransaction(transaction, claim, async () => result.value, now);
    return completion.completed ? { ...completion, terminal: false } : completion;
  }
  if (!safeCodePattern.test(result.terminalCode)) throw new Error("Invalid terminal domain outbox code.");
  const [failed] = await transaction.update(domainOutbox).set({ status: "failed", lastErrorCode: result.terminalCode, failureCode: result.terminalCode, failedAt: now, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now })
    .where(activeClaimPredicate(claim.id, claim.fencingToken, claim.eventVersion)).returning();
  if (!failed) throw new Error("Active domain outbox claim was lost during terminalization.");
  logTerminalFailure(failed, result.terminalCode);
  return { completed: true, value: result.value, terminal: true };
}

export async function failDomainOutboxEvent(input: { id: string; fencingToken: string; eventVersion: number; code: string; retryable: boolean; now?: Date; random?: () => number }, db = getDb()) {
  if (!safeCodePattern.test(input.code)) return null;
  return db.transaction(async (transaction) => {
    return failDomainOutboxClaimInTransaction(transaction, input);
  });
}

// A provider attempt can produce billable failure usage. Keep that write and
// release of the active claim together so redelivery never duplicates it.
export async function failDomainOutboxClaimInTransaction<T>(transaction: Transaction, input: { id: string; fencingToken: string; eventVersion: number; code: string; retryable: boolean; now?: Date; random?: () => number }, write?: () => Promise<T>) {
  const now = input.now ?? new Date();
  if (!safeCodePattern.test(input.code)) return null;
  const [event] = await transaction.select().from(domainOutbox).where(activeClaimPredicate(input.id, input.fencingToken, input.eventVersion)).limit(1).for("update");
  if (!event) return null;
  if (write) await write();
  const exhausted = !input.retryable || event.attemptCount >= event.maxAttempts;
  const safeCode = exhausted ? (input.retryable ? "retry_exhausted" : input.code) : input.code;
  const [updated] = await transaction.update(domainOutbox).set(exhausted
    ? { status: "failed", lastErrorCode: safeCode, failureCode: safeCode, failedAt: now, claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now }
    : { status: "pending", lastErrorCode: safeCode, availableAt: new Date(now.getTime() + retryDelayMs(event.attemptCount, input.random)), claimedBy: null, claimedAt: null, leaseExpiresAt: null, fencingToken: null, updatedAt: now },
  ).where(activeClaimPredicate(input.id, input.fencingToken, input.eventVersion)).returning();
  if (updated?.status === "failed") logTerminalFailure(updated, safeCode);
  return updated ?? null;
}

function activeClaimPredicate(id: string, fencingToken: string, eventVersion: number) {
  return and(eq(domainOutbox.id, id), eq(domainOutbox.eventVersion, eventVersion), eq(domainOutbox.status, "processing"), eq(domainOutbox.fencingToken, fencingToken), gt(domainOutbox.leaseExpiresAt, sql`clock_timestamp() at time zone 'UTC'`));
}
function logTerminalFailure(event: Pick<DomainOutboxClaim, "id" | "eventType" | "eventVersion" | "originatingCommandId" | "userId" | "attemptCount">, code: string) {
  console.error("AI Ask outbox terminal failure", { outboxId: event.id, eventType: event.eventType, eventVersion: event.eventVersion, commandId: event.originatingCommandId, userId: event.userId, attemptCount: event.attemptCount, code });
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).every((key) => keys.includes(key)); }
function isId(value: unknown): value is string { return typeof value === "string" && idPattern.test(value); }
function isOptionalId(value: unknown): boolean { return value === undefined || isId(value); }
function isFence(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 1; }
function isOptionalFence(value: unknown): boolean { return value === undefined || isFence(value); }
