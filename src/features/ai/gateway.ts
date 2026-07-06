import "server-only";

import { getRequiredServerEnv } from "@/server/env";

import { aiAskInitialAnswerModel } from "./prompts";

type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GatewayUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
};

const gatewayTimeoutMs = 30_000;
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

export async function generateInitialAiAskAnswer(messages: GatewayMessage[]): Promise<AiGatewayResult> {
  const startedAt = Date.now();
  const model = aiAskInitialAnswerModel;
  const controller = new AbortController();
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
      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "gateway_http_error" };
    }

    const payload = await parseJson(response);

    if (!payload) {
      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "invalid_gateway_response" };
    }

    const content = parseContent(payload);

    if (!content) {
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
  } catch {
    return {
      ok: false,
      provider: "ai_gateway",
      model,
      latencyMs: Date.now() - startedAt,
      errorCode: "gateway_network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildGatewayUrl() {
  return `${getRequiredServerEnv("AI_GATEWAY_BASE_URL").replace(/\/+$/, "")}/chat/completions`;
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
    return { promptTokens: null, completionTokens: null, totalTokens: null };
  }

  return {
    promptTokens: parseTokenCount(payload.usage.prompt_tokens),
    completionTokens: parseTokenCount(payload.usage.completion_tokens),
    totalTokens: parseTokenCount(payload.usage.total_tokens),
  };
}

function parseTokenCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
