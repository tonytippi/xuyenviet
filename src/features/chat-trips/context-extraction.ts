import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { chatContext, chatContextFieldValues, conversations, messages, type ChatContextField, type ChatContextScope } from "@/db/schema";
import { completeExtraction } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot } from "@/features/ai/models";
import { selectActiveAiGatewayModel } from "@/features/ai/models";
import { buildChatContextExtractionMessages, chatContextExtractionPromptVersion, chatContextExtractionPurpose } from "@/features/ai/prompts";
import { recordAuditEvent } from "@/features/audit/events";
import { writeAiUsageEvent } from "@/features/usage/events";
import type { AuthenticatedSession } from "@/server/auth";

type PromptHistoryMessage = { role: "user" | "assistant"; content: string };

type ExtractChatTripContextInput = {
  session: AuthenticatedSession;
  conversationId: string;
  tripProjectId?: string;
  userMessage: { id: string; content: string };
  history: PromptHistoryMessage[];
  abortSignal?: AbortSignal;
};

const allowedContextFields = new Set<string>(chatContextFieldValues);
const maxContextValueLength = 500;
const sensitivePatterns = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /(?:\+?84|0)(?:[\s.-]*\d){8,10}\b/,
  /\b(?:cccd|cmnd|passport|hộ chiếu|can cuoc|căn cước|id card|visa)\b/i,
  /\b(?:credit card|thẻ tín dụng|số thẻ|cvv|otp|password|mật khẩu|token|api key)\b/i,
  /\b(?:dị ứng|tiểu đường|huyết áp|bệnh|medical|medicine|thuốc)\b/i,
  /\b(?:địa chỉ nhà|home address|street address)\b/i,
];
const childNamePattern = /\b(?:con|bé|trẻ|child|kid)\s+(?:(?:tên|named|name is)\s+)?[A-ZÀ-Ỹ][\p{L}]{1,30}(?:\s+[A-ZÀ-Ỹ][\p{L}]{1,30})?\s+(?:\d{1,2}\s*tuổi|years? old|yo)\b/iu;
const unrelatedPersonalPatterns = [
  /\b(?:vợ|chồng|bạn gái|bạn trai|wife|husband|girlfriend|boyfriend)\s+(?:tên|named|name is)\s+[^,.\n]{2,80}/i,
  /\b(?:làm ở|works at|company|công ty)\s+[^,.\n]{2,80}/i,
];

export async function extractChatTripContext(input: ExtractChatTripContextInput) {
  const db = getDb();
  const [conversation] = await db
    .select({ id: conversations.id, tripProjectId: conversations.tripProjectId })
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, input.session.userId)))
    .limit(1);

  if (!conversation || conversation.tripProjectId !== (input.tripProjectId ?? null)) {
    return { attemptedProviderCall: false, persistedFacts: 0 };
  }

  const [sourceMessage] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.id, input.userMessage.id), eq(messages.conversationId, input.conversationId), eq(messages.userId, input.session.userId), eq(messages.role, "user")))
    .limit(1);

  if (!sourceMessage) {
    return { attemptedProviderCall: false, persistedFacts: 0 };
  }

  const selectedModel = await selectActiveAiGatewayModel({
    purpose: chatContextExtractionPurpose,
    requiredCapabilities: { textInput: true, extraction: true },
  });

  if (!selectedModel) {
    return { attemptedProviderCall: false, persistedFacts: 0 };
  }

  const extractionMessages = buildChatContextExtractionMessages({
    question: input.userMessage.content,
    history: input.history,
    projectScopeAvailable: Boolean(input.tripProjectId),
  });
  const pricingSnapshot = getAiGatewayPricingSnapshot(selectedModel);
  const extractionResult = await completeExtraction({ model: selectedModel.gatewayModelName, messages: extractionMessages, abortSignal: input.abortSignal });

  if (!extractionResult.ok) {
    await writeAiUsageEvent(db, {
      userId: input.session.userId,
      conversationId: input.conversationId,
      userMessageId: input.userMessage.id,
      purpose: chatContextExtractionPurpose,
      provider: extractionResult.provider,
      model: extractionResult.model,
      aiGatewayModelId: selectedModel.id,
      promptVersion: chatContextExtractionPromptVersion,
      status: "failure",
      latencyMs: extractionResult.latencyMs,
      pricingSnapshot,
      errorCode: extractionResult.errorCode,
    });

    return { attemptedProviderCall: true, persistedFacts: 0 };
  }

  const facts = parseAllowedFacts(extractionResult.content, Boolean(input.tripProjectId));

  if (facts.length === 0) {
    await writeAiUsageEvent(db, {
      userId: input.session.userId,
      conversationId: input.conversationId,
      userMessageId: input.userMessage.id,
      purpose: chatContextExtractionPurpose,
      provider: extractionResult.provider,
      model: extractionResult.model,
      aiGatewayModelId: selectedModel.id,
      promptVersion: chatContextExtractionPromptVersion,
      status: "success",
      latencyMs: extractionResult.latencyMs,
      promptTokens: extractionResult.usage.promptTokens,
      completionTokens: extractionResult.usage.completionTokens,
      totalTokens: extractionResult.usage.totalTokens,
      cachedPromptTokens: extractionResult.usage.cachedPromptTokens,
      cacheWritePromptTokens: extractionResult.usage.cacheWritePromptTokens,
      pricingSnapshot,
    });

    return { attemptedProviderCall: true, persistedFacts: 0 };
  }

  await db.transaction(async (transaction) => {
    await transaction.insert(chatContext).values(facts.map((fact) => ({
      userId: input.session.userId,
      conversationId: input.conversationId,
      tripProjectId: fact.scope === "trip_project" ? input.tripProjectId ?? null : null,
      sourceMessageId: input.userMessage.id,
      field: fact.field,
      value: fact.value,
      scope: fact.scope,
      confidence: fact.confidence,
    })));

    await recordAuditEvent({
      actor: input.session,
      operation: "create",
      targetType: "chat_context",
      targetId: input.userMessage.id,
      afterSummary: JSON.stringify({
        conversationId: input.conversationId,
        tripProjectId: input.tripProjectId ?? null,
        sourceMessageId: input.userMessage.id,
        persistedFacts: facts.length,
        conversationScopedFacts: facts.filter((fact) => fact.scope === "conversation").length,
        tripProjectScopedFacts: facts.filter((fact) => fact.scope === "trip_project").length,
        fields: facts.map((fact) => fact.field),
      }),
    }, transaction);

    await writeAiUsageEvent(transaction, {
      userId: input.session.userId,
      conversationId: input.conversationId,
      userMessageId: input.userMessage.id,
      purpose: chatContextExtractionPurpose,
      provider: extractionResult.provider,
      model: extractionResult.model,
      aiGatewayModelId: selectedModel.id,
      promptVersion: chatContextExtractionPromptVersion,
      status: "success",
      latencyMs: extractionResult.latencyMs,
      promptTokens: extractionResult.usage.promptTokens,
      completionTokens: extractionResult.usage.completionTokens,
      totalTokens: extractionResult.usage.totalTokens,
      cachedPromptTokens: extractionResult.usage.cachedPromptTokens,
      cacheWritePromptTokens: extractionResult.usage.cacheWritePromptTokens,
      pricingSnapshot,
    });
  });

  console.info("Chat context extraction persisted", {
    userId: input.session.userId,
    conversationId: input.conversationId,
    sourceMessageId: input.userMessage.id,
    projectScoped: Boolean(input.tripProjectId),
    persistedFacts: facts.length,
    fields: facts.map((fact) => fact.field),
  });

  return { attemptedProviderCall: true, persistedFacts: facts.length };
}

function parseAllowedFacts(content: string, projectScopeAvailable: boolean) {
  const payload = parseJsonObject(content);

  if (!payload || !Array.isArray(payload.facts)) {
    console.warn("Chat context extraction returned malformed JSON");
    return [];
  }

  const facts: Array<{ field: ChatContextField; value: string; scope: ChatContextScope; confidence: number | null }> = [];

  for (const fact of payload.facts) {
    if (!isRecord(fact) || typeof fact.field !== "string" || typeof fact.value !== "string") {
      continue;
    }

    if (!allowedContextFields.has(fact.field)) {
      continue;
    }

    const value = sanitizeContextValue(fact.value);

    if (!value || containsSensitiveData(value)) {
      continue;
    }

    if (fact.scope !== "trip_project" && fact.scope !== "conversation") {
      continue;
    }

    const requestedScope = fact.scope;
    const scope = requestedScope === "trip_project" && projectScopeAvailable ? "trip_project" : "conversation";

    facts.push({
      field: fact.field as ChatContextField,
      value,
      scope,
      confidence: normalizeConfidence(fact.confidence),
    });
  }

  return facts;
}

function parseJsonObject(content: string) {
  try {
    const parsed = JSON.parse(content) as unknown;

    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeContextValue(value: string) {
  const trimmed = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();

  return trimmed.slice(0, maxContextValueLength);
}

function containsSensitiveData(value: string) {
  return childNamePattern.test(value) || sensitivePatterns.some((pattern) => pattern.test(value)) || unrelatedPersonalPatterns.some((pattern) => pattern.test(value));
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
