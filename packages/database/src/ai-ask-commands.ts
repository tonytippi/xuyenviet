import { createHash } from "node:crypto";

import { and, asc, eq, inArray } from "drizzle-orm";
import { parsePlanningContextSession, type PlanningExecutionRef } from "@xuyenviet/contracts";

import { getDb } from "./client";
import { aiAskCommands, conversations, domainOutbox, messageImageAttachments, messages, planningContextSessions, tripChangeProposals, tripProjects } from "./schema";
import { enqueueAiAskFollowUpInTransaction } from "./domain-outbox";
import { resolveOwnedPrimaryConversationInTransaction } from "./primary-conversation";
import { isPlanningClarificationBlocked } from "./planning-context";

const keyPattern = /^[A-Za-z0-9_-]{16,128}$/;
const commandLifetimeMs = 24 * 60 * 60 * 1000;
export const maxAiAskConsumerStatusMessageIds = 100;
const aiAskConsumerStatusCategories = ["context_extraction", "answer_annotation", "trip_proposal_draft"] as const;

export type AiAskTerminalResult = {
  type: "done" | "error";
  code?: "refresh_required";
  conversationId?: string;
  userMessage?: { id: string; content: string };
  assistantMessage?: { id: string; content: string; provenance?: unknown[]; annotations?: unknown[] };
  errorMessage?: string;
};

export type AiAskConsumerStatus = {
  assistantMessageId: string;
  category: "context_extraction" | "answer_annotation" | "trip_proposal_draft";
  state: "pending" | "failed";
};

export const aiAskRefreshRequiredMessage = "Nội dung lập kế hoạch đã thay đổi. Vui lòng làm mới và gửi lại câu hỏi để nhận câu trả lời phù hợp.";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;

export type AcquireAiAskCommandInput = {
  userId: string;
  idempotencyKey: string | null;
  question: string;
  conversationId?: string;
  tripProjectId?: string;
  image?: { fileName: string | null; mimeType: string; byteSize: number; bytes: Uint8Array } | null;
};

export type AiAskCommandAcquisition =
  | { kind: "admitted"; commandId: string; question: string; conversationId: string; tripProjectId: string | null; userMessage: { id: string; content: string }; history: Array<{ role: "user" | "assistant"; content: string }> }
  | { kind: "pending_replay"; conversationId?: string; userMessage?: { id: string; content: string } }
  | { kind: "terminal_replay"; result: AiAskTerminalResult }
  | { kind: "key_reused" }
  | { kind: "validation_failure"; message: string };

export function normalizeAiAskQuestion(question: string) {
  return question.trim().replace(/\s+/g, " ");
}

export function validateAiAskIdempotencyKey(key: string | null) {
  return Boolean(key && keyPattern.test(key));
}

export async function acquireAiAskCommand(input: AcquireAiAskCommandInput): Promise<AiAskCommandAcquisition> {
  if (!validateAiAskIdempotencyKey(input.idempotencyKey)) {
    return { kind: "validation_failure", message: "Idempotency-Key must be 16-128 URL-safe ASCII characters." };
  }

  const question = normalizeAiAskQuestion(input.question);
  if (!question || question.length > 2_000) {
    return { kind: "validation_failure", message: "AI Ask question must be between 1 and 2000 characters." };
  }

  const attachment = input.image ? {
    fileName: input.image.fileName,
    mimeType: input.image.mimeType,
    byteSize: input.image.byteSize,
    contentSha256: digest(input.image.bytes),
  } : null;

  return getDb().transaction(async (transaction) => {
    const requestedScope = input.tripProjectId
      ? { kind: "trip_project" as const, id: input.tripProjectId }
      : input.conversationId
        ? { kind: "conversation" as const, id: input.conversationId }
        : { kind: "new_conversation" as const };
    const retainedPredicate = requestedScope.kind === "new_conversation"
      ? and(eq(aiAskCommands.userId, input.userId), eq(aiAskCommands.scopeKind, requestedScope.kind), eq(aiAskCommands.idempotencyKey, input.idempotencyKey!))
      : and(eq(aiAskCommands.userId, input.userId), eq(aiAskCommands.scopeKind, requestedScope.kind), eq(aiAskCommands.scopeId, requestedScope.id), eq(aiAskCommands.idempotencyKey, input.idempotencyKey!));
    // A discarded projection is immutable; inspect it before live scope validation
    // without taking the command lock ahead of the project/conversation locks.
    const [retained] = await transaction.select().from(aiAskCommands).where(retainedPredicate).limit(1);
    if (retained?.status === "discarded") {
      const identityScope = requestedScope.kind === "new_conversation" ? { kind: requestedScope.kind } : requestedScope;
      const requestDigest = digest(JSON.stringify({ version: 1, question, scope: identityScope, attachment }));
      return retained.requestDigest === requestDigest && retained.expiresAt > new Date()
        ? { kind: "terminal_replay", result: retained.terminalResult as AiAskTerminalResult }
        : { kind: "key_reused" };
    }

    const resolved = await resolveScope(transaction, input.userId, input.conversationId, input.tripProjectId);
    if (!resolved) return { kind: "validation_failure", message: "Không tìm thấy phạm vi hội thoại hoặc dự án của bạn." };

    const identityScope = resolved.scopeKind === "new_conversation"
      ? { kind: resolved.scopeKind }
      : { kind: resolved.scopeKind, id: resolved.scopeId };
    const selectedScopeDigest = digest(JSON.stringify(identityScope));
    const requestDigest = digest(JSON.stringify({ version: 1, question, scope: identityScope, attachment }));
    const expiresAt = new Date(Date.now() + commandLifetimeMs);
    const [inserted] = await transaction.insert(aiAskCommands).values({
      userId: input.userId,
      scopeKind: resolved.scopeKind,
      scopeId: resolved.scopeId,
      idempotencyKey: input.idempotencyKey!,
      requestDigest,
      normalizedQuestion: question,
      attachmentMetadata: attachment,
      selectedScopeDigest,
      tripProjectId: resolved.tripProjectId,
      conversationId: resolved.conversation?.id,
      conversationLifecycleVersion: resolved.conversation?.lifecycleVersion,
      tripProjectAggregateVersion: resolved.tripProjectAggregateVersion,
      expiresAt,
    }).onConflictDoNothing().returning({ id: aiAskCommands.id });

    if (!inserted) {
      const winnerPredicate = resolved.scopeKind === "new_conversation"
        ? and(eq(aiAskCommands.userId, input.userId), eq(aiAskCommands.scopeKind, "new_conversation"), eq(aiAskCommands.idempotencyKey, input.idempotencyKey!))
        : and(eq(aiAskCommands.userId, input.userId), eq(aiAskCommands.scopeKind, resolved.scopeKind), eq(aiAskCommands.scopeId, resolved.scopeId), eq(aiAskCommands.idempotencyKey, input.idempotencyKey!));
      const [winner] = await transaction.select().from(aiAskCommands).where(winnerPredicate).limit(1).for("update");
      if (!winner || winner.requestDigest !== requestDigest || winner.expiresAt <= new Date()) return { kind: "key_reused" };
      if (winner.status !== "pending") return { kind: "terminal_replay", result: winner.terminalResult as AiAskTerminalResult };
      return { kind: "pending_replay", conversationId: winner.conversationId ?? undefined, userMessage: winner.userMessageId ? await readMessage(transaction, winner.userMessageId, input.userId) : undefined };
    }

    const conversation = resolved.conversation ?? (await transaction.insert(conversations).values({ userId: input.userId }).returning({ id: conversations.id, tripProjectId: conversations.tripProjectId, lifecycleVersion: conversations.lifecycleVersion, updatedAt: conversations.updatedAt }))[0];
    await transaction.update(aiAskCommands).set({ conversationId: conversation.id, conversationLifecycleVersion: conversation.lifecycleVersion, updatedAt: new Date() }).where(eq(aiAskCommands.id, inserted.id));
    const history = await transaction.select({ role: messages.role, content: messages.content }).from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, input.userId))).orderBy(asc(messages.createdAt), asc(messages.id));
    const [message] = await transaction.insert(messages).values({ conversationId: conversation.id, userId: input.userId, role: "user", content: question }).returning({ id: messages.id, content: messages.content });
    if (attachment) await transaction.insert(messageImageAttachments).values({ conversationId: conversation.id, messageId: message.id, userId: input.userId, originalFileName: attachment.fileName, mimeType: attachment.mimeType, byteSize: attachment.byteSize, storageKey: null });
    await transaction.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
    await transaction.update(aiAskCommands).set({ userMessageId: message.id, updatedAt: new Date() }).where(eq(aiAskCommands.id, inserted.id));
    const [planningSession] = await transaction.select({ payload: planningContextSessions.payload }).from(planningContextSessions).where(and(eq(planningContextSessions.userId, input.userId), eq(planningContextSessions.conversationId, conversation.id))).limit(1);
    const clarificationBlocked = isPlanningClarificationBlocked(planningSession ? parsePlanningContextSession(planningSession.payload) : null, question);
    if (!clarificationBlocked) await enqueueAiAskFollowUpInTransaction(transaction, {
      eventType: "ai_ask.context_extraction.v1",
      envelope: {
        version: 1,
        commandId: inserted.id,
        userId: input.userId,
        conversationId: conversation.id,
        userMessageId: message.id,
        ...(resolved.tripProjectId ? { tripProjectId: resolved.tripProjectId, tripProjectAggregateVersion: resolved.tripProjectAggregateVersion! } : {}),
        conversationLifecycleVersion: conversation.lifecycleVersion,
      },
    });
    return { kind: "admitted", commandId: inserted.id, question, conversationId: conversation.id, tripProjectId: resolved.tripProjectId, userMessage: message, history };
  });
}

export async function terminalizeAiAskCommand(commandId: string, status: "completed" | "failed" | "aborted", result: AiAskTerminalResult, assistantMessageId?: string): Promise<AiAskTerminalResult> {
  // This is deliberately separate from the assistant/provenance/usage transaction.
  // Story 10.2 owns atomic finalization fences, so for now we retry and verify the
  // persisted command projection before the route can report a terminal outcome.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [updated] = await getDb().update(aiAskCommands)
        .set({ status, terminalResult: result, assistantMessageId: assistantMessageId ?? null, terminalAt: new Date(), updatedAt: new Date() })
        .where(and(eq(aiAskCommands.id, commandId), eq(aiAskCommands.status, "pending")))
        .returning({ id: aiAskCommands.id });
      if (updated) return result;

      const [existing] = await getDb().select({ status: aiAskCommands.status, terminalResult: aiAskCommands.terminalResult }).from(aiAskCommands).where(eq(aiAskCommands.id, commandId)).limit(1);
      if (existing?.terminalResult) return existing.terminalResult as AiAskTerminalResult;
      throw new Error("AI Ask command was not found.");
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error("AI Ask command terminalization failed.");
}

// The stream publishes this immutable retained projection after fenced completion.
export async function readAiAskCommandTerminalResult(commandId: string): Promise<AiAskTerminalResult> {
  const [command] = await getDb().select({ terminalResult: aiAskCommands.terminalResult }).from(aiAskCommands).where(eq(aiAskCommands.id, commandId)).limit(1);
  if (command?.terminalResult) return command.terminalResult as AiAskTerminalResult;
  throw new Error("AI Ask command terminal result was not found.");
}

// This intentionally projects only display categories from completed commands.
// The owning shell already reads the persisted answer and must not receive queue data.
export async function readOwnedCompletedAiAskConsumerStatuses(userId: string, assistantMessageIds: string[]): Promise<AiAskConsumerStatus[]> {
  const acceptedAssistantMessageIds: string[] = [];
  const seenAssistantMessageIds = new Set<string>();
  for (const assistantMessageId of assistantMessageIds) {
    if (!assistantMessageId || seenAssistantMessageIds.has(assistantMessageId)) continue;
    seenAssistantMessageIds.add(assistantMessageId);
    acceptedAssistantMessageIds.push(assistantMessageId);
    if (acceptedAssistantMessageIds.length === maxAiAskConsumerStatusMessageIds) break;
  }
  if (acceptedAssistantMessageIds.length === 0) return [];

  const rows = await getDb().select({
    assistantMessageId: aiAskCommands.assistantMessageId,
    tripProjectId: aiAskCommands.tripProjectId,
    eventType: domainOutbox.eventType,
    status: domainOutbox.status,
  }).from(aiAskCommands)
    .innerJoin(domainOutbox, and(
      eq(domainOutbox.originatingCommandId, aiAskCommands.id),
      eq(domainOutbox.userId, aiAskCommands.userId),
    ))
    .where(and(
      eq(aiAskCommands.userId, userId),
      eq(aiAskCommands.status, "completed"),
      inArray(aiAskCommands.assistantMessageId, acceptedAssistantMessageIds),
    ));

  const statuses = new Map<string, AiAskConsumerStatus>();
  for (const row of rows) {
    if (!row.assistantMessageId || (row.status !== "pending" && row.status !== "processing" && row.status !== "failed")) continue;
    const category = row.eventType === "ai_ask.context_extraction.v1"
      ? "context_extraction"
      : row.eventType === "ai_ask.answer_annotation.v1"
        ? "answer_annotation"
        : row.eventType === "ai_ask.trip_proposal_draft.v1"
          ? "trip_proposal_draft"
          : null;
    if (!category) continue;
    if (category === "trip_proposal_draft" && !row.tripProjectId) continue;
    const state = row.status === "failed" ? "failed" : "pending";
    const key = `${row.assistantMessageId}:${category}`;
    const existing = statuses.get(key);
    // Multiple durable events can reference one retained answer. A terminal
    // failure is the only safe display state when their projections disagree.
    if (!existing || state === "failed") statuses.set(key, { assistantMessageId: row.assistantMessageId, category, state });
  }
  return [...statuses.values()].slice(0, acceptedAssistantMessageIds.length * aiAskConsumerStatusCategories.length);
}

export async function finalizeAiAskCommand<T extends { result: AiAskTerminalResult; assistantMessageId: string; tripAnswerContextSnapshotId?: string | null }>(commandId: string, persist: (transaction: Transaction, command: { userId: string; conversationId: string; tripProjectId: string | null; userMessageId: string }) => Promise<T>, options?: { suppressFollowUps?: boolean; revokeContextExtraction?: boolean; planningExecutionRef?: PlanningExecutionRef | null }): Promise<T | { result: AiAskTerminalResult; discarded: true }> {
  return getDb().transaction(async (transaction) => {
    const [unlocked] = await transaction.select().from(aiAskCommands).where(eq(aiAskCommands.id, commandId)).limit(1);
    if (!unlocked) throw new Error("AI Ask command was not found.");
    if (unlocked.tripProjectId) await transaction.select({ id: tripProjects.id }).from(tripProjects).where(and(eq(tripProjects.id, unlocked.tripProjectId), eq(tripProjects.userId, unlocked.userId))).limit(1).for("update");
    if (unlocked.conversationId) await transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, unlocked.conversationId), eq(conversations.userId, unlocked.userId))).limit(1).for("update");
    const [command] = await transaction.select().from(aiAskCommands).where(eq(aiAskCommands.id, commandId)).limit(1).for("update");
    if (!command) throw new Error("AI Ask command was not found.");
    if (command.status !== "pending") {
      if (command.status === "discarded") return { result: command.terminalResult as AiAskTerminalResult, discarded: true };
      throw new Error("AI Ask command has a conflicting terminal state.");
    }

    const [conversation] = command.conversationId
      ? await transaction.select({ id: conversations.id, lifecycleVersion: conversations.lifecycleVersion }).from(conversations).where(and(eq(conversations.id, command.conversationId), eq(conversations.userId, command.userId))).limit(1)
      : [];
    const [project] = command.tripProjectId
      ? await transaction.select({ id: tripProjects.id, aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, command.tripProjectId), eq(tripProjects.userId, command.userId))).limit(1)
      : [];
    const planningFenceValid = await hasCurrentPlanningExecutionRef(transaction, command, options?.planningExecutionRef);
    if (!conversation || !command.userMessageId || conversation.lifecycleVersion !== command.conversationLifecycleVersion || (command.tripProjectId !== null && (!project || project.aggregateVersion !== command.tripProjectAggregateVersion)) || !planningFenceValid) {
      const result = refreshRequiredResult(conversation?.id);
      await transaction.update(aiAskCommands).set({ status: "discarded", terminalResult: result, terminalAt: new Date(), assistantMessageId: null, userMessageId: null, conversationId: null, tripProjectId: null, conversationLifecycleVersion: null, tripProjectAggregateVersion: null, tripAnswerContextSnapshotId: null, normalizedQuestion: "[discarded]", attachmentMetadata: null, updatedAt: new Date() }).where(and(eq(aiAskCommands.id, command.id), eq(aiAskCommands.status, "pending")));
      return { result, discarded: true };
    }

    // Admission may have observed an older ready session. Remove its owned
    // extraction work in the same terminal transaction before a blocked turn
    // can become visible to workers.
    if (options?.revokeContextExtraction) await transaction.delete(domainOutbox).where(and(
      eq(domainOutbox.originatingCommandId, command.id),
      eq(domainOutbox.userId, command.userId),
      eq(domainOutbox.eventType, "ai_ask.context_extraction.v1"),
    ));
    const completed = await persist(transaction, { userId: command.userId, conversationId: conversation.id, tripProjectId: command.tripProjectId, userMessageId: command.userMessageId });
    await transaction.update(aiAskCommands).set({ status: "completed", terminalResult: completed.result, assistantMessageId: completed.assistantMessageId, tripAnswerContextSnapshotId: completed.tripAnswerContextSnapshotId ?? null, terminalAt: new Date(), updatedAt: new Date() }).where(and(eq(aiAskCommands.id, command.id), eq(aiAskCommands.status, "pending")));
    const envelope = {
      version: 1 as const,
      commandId: command.id,
      userId: command.userId,
      conversationId: conversation.id,
      userMessageId: command.userMessageId,
      assistantMessageId: completed.assistantMessageId,
      ...(command.tripProjectId ? { tripProjectId: command.tripProjectId, tripProjectAggregateVersion: command.tripProjectAggregateVersion! } : {}),
      conversationLifecycleVersion: command.conversationLifecycleVersion!,
    };
    if (!options?.suppressFollowUps) {
      await enqueueAiAskFollowUpInTransaction(transaction, { eventType: "ai_ask.answer_annotation.v1", envelope });
      if (command.tripProjectId) await enqueueAiAskFollowUpInTransaction(transaction, { eventType: "ai_ask.trip_proposal_draft.v1", envelope });
    }
    return completed;
  });
}

async function hasCurrentPlanningExecutionRef(transaction: Transaction, command: { userId: string; conversationId: string | null; tripProjectId: string | null; tripProjectAggregateVersion: number | null }, reference: PlanningExecutionRef | null | undefined) {
  if (!reference || !command.conversationId) return true;
  if (reference.tripProjectId !== command.tripProjectId || reference.tripAggregateVersion !== command.tripProjectAggregateVersion) return false;
  const [session] = await transaction.select({ revision: planningContextSessions.revision }).from(planningContextSessions).where(and(eq(planningContextSessions.userId, command.userId), eq(planningContextSessions.conversationId, command.conversationId))).limit(1).for("update");
  if ((session?.revision ?? null) !== reference.sessionRevision) return false;
  if (reference.proposalId === null) return true;
  const [proposal] = await transaction.select({ id: tripChangeProposals.id, status: tripChangeProposals.status, updatedAt: tripChangeProposals.updatedAt }).from(tripChangeProposals).where(and(eq(tripChangeProposals.id, reference.proposalId), eq(tripChangeProposals.userId, command.userId), eq(tripChangeProposals.tripProjectId, reference.tripProjectId ?? ""))).limit(1).for("update");
  return proposal?.status === "pending" && proposal.updatedAt.toISOString() === reference.proposalUpdatedAt;
}

export async function discardAiAskCommandsForDeletedConversations(transaction: Transaction, userId: string, conversationIds: string[]) {
  if (conversationIds.length === 0) return;
  const commands = await transaction.select({ id: aiAskCommands.id }).from(aiAskCommands).where(and(eq(aiAskCommands.userId, userId), inArray(aiAskCommands.conversationId, conversationIds))).orderBy(asc(aiAskCommands.id)).for("update");
  if (commands.length === 0) return;
  await transaction.update(aiAskCommands).set({ status: "discarded", terminalResult: refreshRequiredResult(), terminalAt: new Date(), assistantMessageId: null, userMessageId: null, conversationId: null, tripProjectId: null, conversationLifecycleVersion: null, tripProjectAggregateVersion: null, tripAnswerContextSnapshotId: null, normalizedQuestion: "[discarded]", attachmentMetadata: null, updatedAt: new Date() }).where(inArray(aiAskCommands.id, commands.map((command) => command.id)));
}

function refreshRequiredResult(conversationId?: string): AiAskTerminalResult {
  return { type: "error", code: "refresh_required", ...(conversationId ? { conversationId } : {}), errorMessage: aiAskRefreshRequiredMessage };
}

// jsonb object key order is not part of the terminal-result contract. Arrays remain
// ordered because their order is meaningful to the browser projection.
export function terminalResultsEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => terminalResultsEqual(value, right[index]));
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && terminalResultsEqual(leftRecord[key], rightRecord[key]));
}

async function resolveScope(transaction: Transaction, userId: string, conversationId: string | undefined, tripProjectId: string | undefined) {
  if (tripProjectId) {
    const conversation = await resolveOwnedPrimaryConversationInTransaction(transaction, userId, tripProjectId);
    if (!conversation || (conversationId && conversationId !== conversation.id)) return null;
    const [project] = await transaction.select({ aggregateVersion: tripProjects.aggregateVersion }).from(tripProjects).where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, userId))).limit(1);
    if (!project) return null;
    return { scopeKind: "trip_project" as const, scopeId: tripProjectId, tripProjectId, tripProjectAggregateVersion: project.aggregateVersion, conversation };
  }
  if (conversationId) {
    const [conversation] = await transaction.select({ id: conversations.id, tripProjectId: conversations.tripProjectId, lifecycleVersion: conversations.lifecycleVersion, updatedAt: conversations.updatedAt }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1).for("update");
    if (!conversation || conversation.tripProjectId) return null;
    return { scopeKind: "conversation" as const, scopeId: conversation.id, tripProjectId: null, tripProjectAggregateVersion: null, conversation };
  }
  // The scope is generated only for the new command. A separate immutable unique
  // index on owner/key arbitrates concurrent first deliveries without browser input.
  return { scopeKind: "new_conversation" as const, scopeId: crypto.randomUUID(), tripProjectId: null, tripProjectAggregateVersion: null, conversation: null };
}

async function readMessage(transaction: Transaction, messageId: string, userId: string) {
  const [message] = await transaction.select({ id: messages.id, content: messages.content }).from(messages).where(and(eq(messages.id, messageId), eq(messages.userId, userId))).limit(1);
  return message;
}

function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
