import "server-only";

import { createHash } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { aiAskCommands, conversations, messageImageAttachments, messages } from "@/db/schema";
import { resolveOwnedPrimaryConversationInTransaction } from "@/features/chat-trips/trip-projects";

const keyPattern = /^[A-Za-z0-9_-]{16,128}$/;
const commandLifetimeMs = 24 * 60 * 60 * 1000;

export type AiAskTerminalResult = {
  type: "done" | "error";
  conversationId?: string;
  userMessage?: { id: string; content: string };
  assistantMessage?: { id: string; content: string; provenance?: unknown[]; annotations?: unknown[] };
  proposal?: unknown;
  errorMessage?: string;
};

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

    const conversation = resolved.conversation ?? (await transaction.insert(conversations).values({ userId: input.userId }).returning({ id: conversations.id, tripProjectId: conversations.tripProjectId, updatedAt: conversations.updatedAt }))[0];
    await transaction.update(aiAskCommands).set({ conversationId: conversation.id, updatedAt: new Date() }).where(eq(aiAskCommands.id, inserted.id));
    const history = await transaction.select({ role: messages.role, content: messages.content }).from(messages).where(and(eq(messages.conversationId, conversation.id), eq(messages.userId, input.userId))).orderBy(asc(messages.createdAt), asc(messages.id));
    const [message] = await transaction.insert(messages).values({ conversationId: conversation.id, userId: input.userId, role: "user", content: question }).returning({ id: messages.id, content: messages.content });
    if (attachment) await transaction.insert(messageImageAttachments).values({ conversationId: conversation.id, messageId: message.id, userId: input.userId, originalFileName: attachment.fileName, mimeType: attachment.mimeType, byteSize: attachment.byteSize, storageKey: null });
    await transaction.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversation.id));
    await transaction.update(aiAskCommands).set({ userMessageId: message.id, updatedAt: new Date() }).where(eq(aiAskCommands.id, inserted.id));
    return { kind: "admitted", commandId: inserted.id, question, conversationId: conversation.id, tripProjectId: resolved.tripProjectId, userMessage: message, history };
  });
}

export async function terminalizeAiAskCommand(commandId: string, status: "completed" | "failed" | "aborted", result: AiAskTerminalResult, assistantMessageId?: string) {
  // This is deliberately separate from the assistant/provenance/usage transaction.
  // Story 10.2 owns atomic finalization fences, so for now we retry and verify the
  // persisted command projection before the route can report a terminal outcome.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const [updated] = await getDb().update(aiAskCommands)
        .set({ status, terminalResult: result, assistantMessageId: assistantMessageId ?? null, terminalAt: new Date(), updatedAt: new Date() })
        .where(and(eq(aiAskCommands.id, commandId), eq(aiAskCommands.status, "pending")))
        .returning({ id: aiAskCommands.id });
      if (updated) return;

      const [existing] = await getDb().select({ status: aiAskCommands.status, terminalResult: aiAskCommands.terminalResult }).from(aiAskCommands).where(eq(aiAskCommands.id, commandId)).limit(1);
      if (existing?.status === status && JSON.stringify(existing.terminalResult) === JSON.stringify(result)) return;
      throw new Error("AI Ask command has a conflicting terminal state.");
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}

async function resolveScope(transaction: Transaction, userId: string, conversationId: string | undefined, tripProjectId: string | undefined) {
  if (tripProjectId) {
    const conversation = await resolveOwnedPrimaryConversationInTransaction(transaction, userId, tripProjectId);
    if (!conversation || (conversationId && conversationId !== conversation.id)) return null;
    return { scopeKind: "trip_project" as const, scopeId: tripProjectId, tripProjectId, conversation };
  }
  if (conversationId) {
    const [conversation] = await transaction.select({ id: conversations.id, tripProjectId: conversations.tripProjectId, updatedAt: conversations.updatedAt }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1).for("update");
    if (!conversation || conversation.tripProjectId) return null;
    return { scopeKind: "conversation" as const, scopeId: conversation.id, tripProjectId: null, conversation };
  }
  // The scope is generated only for the new command. A separate immutable unique
  // index on owner/key arbitrates concurrent first deliveries without browser input.
  return { scopeKind: "new_conversation" as const, scopeId: crypto.randomUUID(), tripProjectId: null, conversation: null };
}

async function readMessage(transaction: Transaction, messageId: string, userId: string) {
  const [message] = await transaction.select({ id: messages.id, content: messages.content }).from(messages).where(and(eq(messages.id, messageId), eq(messages.userId, userId))).limit(1);
  return message;
}

function digest(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}
