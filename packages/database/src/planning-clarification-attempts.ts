import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { getDb } from "./client";
import { aiAskCommands, conversations, messages, planningClarificationAttempts, planningClarificationSessions } from "./schema";

export type ClarificationAttemptInput = { commandId: string; sourceMessageId: string; userId: string; expectedSessionRevision: number; promptVersion: string; kind: "plan" | "extraction"; payload: Record<string, unknown> };

export async function createOrReadClarificationAttempt(input: ClarificationAttemptInput) {
  if (!Number.isInteger(input.expectedSessionRevision) || input.expectedSessionRevision < 0 || !input.promptVersion) return null;
  return getDb().transaction(async (transaction) => {
    const [command] = await transaction.select({ id: aiAskCommands.id, conversationId: aiAskCommands.conversationId, userMessageId: aiAskCommands.userMessageId, status: aiAskCommands.status }).from(aiAskCommands).where(and(eq(aiAskCommands.id, input.commandId), eq(aiAskCommands.userId, input.userId))).limit(1).for("update");
    const [message] = await transaction.select({ id: messages.id, conversationId: messages.conversationId, ordinal: messages.ordinal, role: messages.role }).from(messages).where(and(eq(messages.id, input.sourceMessageId), eq(messages.userId, input.userId))).limit(1);
    const [conversation] = message ? await transaction.select({ contentRevision: conversations.contentRevision }).from(conversations).where(and(eq(conversations.id, message.conversationId), eq(conversations.userId, input.userId))).limit(1).for("update") : [];
    const [active] = message ? await transaction.select({ revision: planningClarificationSessions.revision }).from(planningClarificationSessions).where(and(eq(planningClarificationSessions.conversationId, message.conversationId), eq(planningClarificationSessions.userId, input.userId), eq(planningClarificationSessions.state, "active"))).limit(1).for("update") : [];
    if (!command || !message || !conversation || command.status !== "pending" || command.userMessageId !== message.id || command.conversationId !== message.conversationId || message.role !== "user" || message.ordinal !== conversation.contentRevision || input.expectedSessionRevision !== (active?.revision ?? 0)) return null;
    const identity = and(eq(planningClarificationAttempts.commandId, input.commandId), eq(planningClarificationAttempts.sourceMessageId, input.sourceMessageId), eq(planningClarificationAttempts.expectedSessionRevision, input.expectedSessionRevision), eq(planningClarificationAttempts.promptVersion, input.promptVersion));
    const [existing] = await transaction.select().from(planningClarificationAttempts).where(identity).limit(1);
    const digest = createHash("sha256").update(canonicalJson(input.payload)).digest("hex");
    if (existing) return existing.kind === input.kind && existing.digest === digest && canonicalJson(existing.payload) === canonicalJson(input.payload) ? existing : null;
    const [created] = await transaction.insert(planningClarificationAttempts).values({ ...input, digest }).onConflictDoNothing().returning();
    if (created) return created;
    const [winner] = await transaction.select().from(planningClarificationAttempts).where(identity).limit(1);
    return winner && winner.kind === input.kind && winner.digest === digest && canonicalJson(winner.payload) === canonicalJson(input.payload) ? winner : null;
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
