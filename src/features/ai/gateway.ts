import "server-only";

import { getRequiredServerEnv } from "@/server/env";

type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GatewayUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedPromptTokens: number | null;
  cacheWritePromptTokens: number | null;
};

const defaultGatewayTimeoutMs = 30_000;
const minGatewayTimeoutMs = 1_000;
const maxGatewayTimeoutMs = 180_000;
const maxCompletionTokens = 900;

export type AiGatewaySuccess = {
  ok: true;
  content: string;
  provider: "ai_gateway";
  model: string;
  latencyMs: number;
  usage: GatewayUsage;
};

export type AiGatewayFailure = {
  ok: false;
  provider: "ai_gateway";
  model: string;
  latencyMs: number;
  errorCode: "gateway_http_error" | "gateway_network_error" | "invalid_gateway_response";
};

export type AiGatewayResult = AiGatewaySuccess | AiGatewayFailure;

export async function generateInitialAiAskAnswer({ model, messages }: { model: string; messages: GatewayMessage[] }): Promise<AiGatewayResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const gatewayTimeoutMs = getGatewayTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), gatewayTimeoutMs);

  try {
    const response = await fetch(buildGatewayUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${getRequiredServerEnv("AI_GATEWAY_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxCompletionTokens,
        temperature: 0.3,
      }),
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      logGatewayFailure({
        errorCode: "gateway_http_error",
        latencyMs,
        model,
        timeoutMs: gatewayTimeoutMs,
        status: response.status,
        statusText: response.statusText,
      });

      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "gateway_http_error" };
    }

    const payload = await parseJson(response);

    if (!payload) {
      logGatewayFailure({ errorCode: "invalid_gateway_response", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "json_parse_failed" });

      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "invalid_gateway_response" };
    }

    const content = parseContent(payload);

    if (!content) {
      logGatewayFailure({ errorCode: "invalid_gateway_response", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "missing_choice_message_content" });

      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "invalid_gateway_response" };
    }

    return {
      ok: true,
      content,
      provider: "ai_gateway",
      model: parseModel(payload) ?? model,
      latencyMs,
      usage: parseUsage(payload),
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    logGatewayFailure({
      errorCode: "gateway_network_error",
      latencyMs,
      model,
      timeoutMs: gatewayTimeoutMs,
      reason: error instanceof Error ? error.name : "unknown_error",
      message: error instanceof Error ? error.message : undefined,
    });

    return {
      ok: false,
      provider: "ai_gateway",
      model,
      latencyMs,
      errorCode: "gateway_network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildGatewayUrl() {
  return `${getRequiredServerEnv("AI_GATEWAY_BASE_URL").replace(/\/+$/, "")}/chat/completions`;
}

function getGatewayTimeoutMs() {
  const configuredValue = process.env.AI_GATEWAY_TIMEOUT_MS;

  if (!configuredValue) {
    return defaultGatewayTimeoutMs;
  }

  const parsedValue = Number(configuredValue);

  if (!Number.isFinite(parsedValue)) {
    return defaultGatewayTimeoutMs;
  }

  return Math.min(Math.max(Math.trunc(parsedValue), minGatewayTimeoutMs), maxGatewayTimeoutMs);
}

function logGatewayFailure(details: {
  errorCode: AiGatewayFailure["errorCode"];
  latencyMs: number;
  model: string;
  timeoutMs: number;
  status?: number;
  statusText?: string;
  reason?: string;
  message?: string;
}) {
  console.warn("AI Gateway answer generation failed", {
    errorCode: details.errorCode,
    latencyMs: details.latencyMs,
    model: details.model,
    timeoutMs: details.timeoutMs,
    status: details.status,
    statusText: details.statusText,
    reason: details.reason,
    message: details.message,
  });
}

function parseContent(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const [choice] = payload.choices;

  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") {
    return null;
  }

  const content = choice.message.content.trim();

  return content || null;
}

async function parseJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function parseModel(payload: unknown) {
  if (!isRecord(payload) || typeof payload.model !== "string") {
    return null;
  }

  return payload.model.trim() || null;
}

function parseUsage(payload: unknown): GatewayUsage {
  if (!isRecord(payload) || !isRecord(payload.usage)) {
    return { promptTokens: null, completionTokens: null, totalTokens: null, cachedPromptTokens: null, cacheWritePromptTokens: null };
  }

  return {
    promptTokens: parseTokenCount(payload.usage.prompt_tokens),
    completionTokens: parseTokenCount(payload.usage.completion_tokens),
    totalTokens: parseTokenCount(payload.usage.total_tokens),
    cachedPromptTokens: parseCachedPromptTokens(payload.usage),
    cacheWritePromptTokens: parseCacheWritePromptTokens(payload.usage),
  };
}

function parseCachedPromptTokens(usage: Record<string, unknown>) {
  if (!isRecord(usage.prompt_tokens_details)) {
    return null;
  }

  return parseTokenCount(usage.prompt_tokens_details.cached_tokens);
}

function parseCacheWritePromptTokens(usage: Record<string, unknown>) {
  if (!isRecord(usage.prompt_tokens_details)) {
    return null;
  }

  return parseTokenCount(usage.prompt_tokens_details.cache_creation_tokens ?? usage.prompt_tokens_details.cache_write_tokens);
}

function parseTokenCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
