import "server-only";

import { aiUsageEvents, type AiUsageStatus } from "@/db/schema";

type UsageEventDb = {
  insert: (table: typeof aiUsageEvents) => {
    values: (value: typeof aiUsageEvents.$inferInsert) => Promise<unknown>;
  };
};

export type WriteAiUsageEventInput = {
  userId: string;
  conversationId: string;
  userMessageId: string;
  assistantMessageId?: string | null;
  purpose: string;
  provider: string;
  model: string;
  promptVersion: string;
  status: AiUsageStatus;
  latencyMs: number | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  errorCode?: string | null;
};

export async function writeAiUsageEvent(db: UsageEventDb, input: WriteAiUsageEventInput) {
  await db.insert(aiUsageEvents).values({
    userId: input.userId,
    conversationId: input.conversationId,
    userMessageId: input.userMessageId,
    assistantMessageId: input.assistantMessageId ?? null,
    purpose: input.purpose,
    provider: input.provider,
    model: input.model,
    promptVersion: input.promptVersion,
    status: input.status,
    latencyMs: input.latencyMs,
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    totalTokens: input.totalTokens ?? null,
    errorCode: input.errorCode ?? null,
  });
}
