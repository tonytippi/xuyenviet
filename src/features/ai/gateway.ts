import { getRequiredServerEnv } from "@/server/env";

type GatewayMessage = {
  role: "system" | "user" | "assistant";
  content: GatewayMessageContent;
};

type GatewayMessageContent = string | Array<{
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}>;

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
const maxExtractionTokens = 1500;
const maxEvaluationTokens = 1800;

export type AiGatewaySuccess = {
  ok: true;
  content: string;
  provider: "ai_gateway";
  model: string;
  latencyMs: number;
  usage: GatewayUsage;
};

export type AiGatewayStreamFailure = {
  ok: false;
  provider: "ai_gateway";
  model: string;
  latencyMs: number;
  errorCode: "gateway_http_error" | "gateway_network_error" | "invalid_gateway_response" | "gateway_stream_failed" | "client_stream_aborted";
};

export type AiGatewayStreamResult = AiGatewaySuccess | AiGatewayStreamFailure;

export type AiGatewayExtractionFailure = {
  ok: false;
  provider: "ai_gateway";
  model: string;
  latencyMs: number;
  errorCode: "gateway_http_error" | "gateway_network_error" | "invalid_gateway_response" | "client_stream_aborted";
};

export type AiGatewayExtractionResult = AiGatewaySuccess | AiGatewayExtractionFailure;

export type AiGatewayCompletionPurpose = "ai_ask" | "extraction" | "evaluation";

export async function streamInitialAiAskAnswer({
  model,
  messages,
  onDelta,
  abortSignal,
}: {
  model: string;
  messages: GatewayMessage[];
  onDelta: (delta: string) => Promise<void> | void;
  abortSignal?: AbortSignal;
}): Promise<AiGatewayStreamResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const gatewayTimeoutMs = getGatewayTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), gatewayTimeoutMs);

  const onExternalAbort = () => controller.abort();

  if (abortSignal) {
    if (abortSignal.aborted) {
      controller.abort();
    } else {
      abortSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

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
        stream: true,
      }),
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      logGatewayFailure({ errorCode: "gateway_http_error", latencyMs, model, timeoutMs: gatewayTimeoutMs, status: response.status, statusText: response.statusText });

      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "gateway_http_error" };
    }

    if (!response.body) {
      logGatewayFailure({ errorCode: "invalid_gateway_response", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "missing_stream_body" });

      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "invalid_gateway_response" };
    }

    const streamResult = await readOpenAiCompatibleStream(response.body, onDelta);
    const finalLatencyMs = Date.now() - startedAt;
    const terminated = streamResult.done || streamResult.finishReason === "stop" || streamResult.finishReason === "length";

    if (streamResult.failed || !terminated || !streamResult.content) {
      logGatewayFailure({ errorCode: "invalid_gateway_response", latencyMs: finalLatencyMs, model, timeoutMs: gatewayTimeoutMs, reason: streamResult.failed ? "stream_parse_failed" : streamResult.done ? "empty_stream_content" : "missing_terminal_signal" });

      return { ok: false, provider: "ai_gateway", model, latencyMs: finalLatencyMs, errorCode: streamResult.failed ? "gateway_stream_failed" : "invalid_gateway_response" };
    }

    return {
      ok: true,
      content: streamResult.content,
      provider: "ai_gateway",
      model: streamResult.model ?? model,
      latencyMs: finalLatencyMs,
      usage: streamResult.usage,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    if (abortSignal?.aborted) {
      logGatewayFailure({ errorCode: "client_stream_aborted", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "client_aborted" });

      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "client_stream_aborted" };
    }

    logGatewayFailure({
      errorCode: "gateway_network_error",
      latencyMs,
      model,
      timeoutMs: gatewayTimeoutMs,
      reason: error instanceof Error ? error.name : "unknown_error",
      message: error instanceof Error ? error.message : undefined,
    });

    return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "gateway_network_error" };
  } finally {
    if (abortSignal) {
      abortSignal.removeEventListener("abort", onExternalAbort);
    }
    clearTimeout(timeout);
  }
}

export async function completeExtraction({
  model,
  messages,
  abortSignal,
}: {
  model: string;
  messages: GatewayMessage[];
  abortSignal?: AbortSignal;
}): Promise<AiGatewayExtractionResult> {
  return completeGatewayPrompt({ model, messages, abortSignal, purpose: "extraction", maxTokens: maxExtractionTokens });
}

export async function completeInitialAiAskAnswer({
  model,
  messages,
  abortSignal,
}: {
  model: string;
  messages: GatewayMessage[];
  abortSignal?: AbortSignal;
}): Promise<AiGatewayExtractionResult> {
  return completeGatewayPrompt({ model, messages, abortSignal, purpose: "ai_ask", maxTokens: maxCompletionTokens });
}

export async function completeEvaluation({
  model,
  messages,
  abortSignal,
}: {
  model: string;
  messages: GatewayMessage[];
  abortSignal?: AbortSignal;
}): Promise<AiGatewayExtractionResult> {
  return completeGatewayPrompt({ model, messages, abortSignal, purpose: "evaluation", maxTokens: maxEvaluationTokens });
}

async function completeGatewayPrompt({
  model,
  messages,
  abortSignal,
  purpose,
  maxTokens,
}: {
  model: string;
  messages: GatewayMessage[];
  abortSignal?: AbortSignal;
  purpose: AiGatewayCompletionPurpose;
  maxTokens: number;
}): Promise<AiGatewayExtractionResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const gatewayTimeoutMs = getGatewayTimeoutMs(purpose);
  const timeout = setTimeout(() => controller.abort(), gatewayTimeoutMs);

  const onExternalAbort = () => controller.abort();

  if (abortSignal) {
    if (abortSignal.aborted) {
      controller.abort();
    } else {
      abortSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

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
        max_tokens: maxTokens,
        temperature: 0,
        stream: false,
      }),
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      logGatewayFailure({ errorCode: "gateway_http_error", latencyMs, model, timeoutMs: gatewayTimeoutMs, status: response.status, statusText: response.statusText, purpose });

      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "gateway_http_error" };
    }

    const payload = await response.json().catch(() => null) as unknown;

    if (isRecord(payload) && isRecord(payload.error)) {
      const errorMessage = typeof payload.error.message === "string" ? payload.error.message : "unknown_error";
      logGatewayFailure({ errorCode: "invalid_gateway_response", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "provider_error_in_body", message: errorMessage, purpose });

      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "invalid_gateway_response" };
    }

    const content = parseCompletionContent(payload);

    if (!content) {
      logGatewayFailure({ errorCode: "invalid_gateway_response", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "missing_completion_content", purpose });

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

    if (abortSignal?.aborted) {
      logGatewayFailure({ errorCode: "client_stream_aborted", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "client_aborted", purpose });

      return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "client_stream_aborted" };
    }

    logGatewayFailure({
      errorCode: "gateway_network_error",
      latencyMs,
      model,
      timeoutMs: gatewayTimeoutMs,
      reason: error instanceof Error ? error.name : "unknown_error",
      message: error instanceof Error ? error.message : undefined,
      purpose,
    });

    return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "gateway_network_error" };
  } finally {
    if (abortSignal) {
      abortSignal.removeEventListener("abort", onExternalAbort);
    }
    clearTimeout(timeout);
  }
}

function buildGatewayUrl() {
  return `${getRequiredServerEnv("AI_GATEWAY_BASE_URL").replace(/\/+$/, "")}/chat/completions`;
}

function getGatewayTimeoutMs(purpose?: AiGatewayCompletionPurpose) {
  const configuredValue = purpose === "extraction" ? process.env.AI_GATEWAY_EXTRACTION_TIMEOUT_MS ?? process.env.AI_GATEWAY_TIMEOUT_MS : process.env.AI_GATEWAY_TIMEOUT_MS;

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
  errorCode: AiGatewayStreamFailure["errorCode"] | AiGatewayExtractionFailure["errorCode"];
  latencyMs: number;
  model: string;
  timeoutMs: number;
  status?: number;
  statusText?: string;
  reason?: string;
  message?: string;
  purpose?: "answer" | AiGatewayCompletionPurpose;
}) {
  console.warn(details.purpose === "extraction" || details.purpose === "evaluation" ? `AI Gateway ${details.purpose} failed` : "AI Gateway answer generation failed", {
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

async function readOpenAiCompatibleStream(body: ReadableStream<Uint8Array>, onDelta: (delta: string) => Promise<void> | void) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let content = "";
  let model: string | null = null;
  let usage: GatewayUsage = { promptTokens: null, completionTokens: null, totalTokens: null, cachedPromptTokens: null, cacheWritePromptTokens: null };
  let failed = false;
  let doneReceived = false;
  let finishReason: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      const result = await processStreamLine(line, onDelta);
      content += result.content;
      model = result.model ?? model;
      usage = mergeUsage(usage, result.usage);
      failed = failed || result.failed;
      doneReceived = doneReceived || result.done;
      finishReason = result.finishReason ?? finishReason;
    }

    if (done) {
      break;
    }
  }

  if (buffered.trim()) {
    const result = await processStreamLine(buffered, onDelta);
    content += result.content;
    model = result.model ?? model;
    usage = mergeUsage(usage, result.usage);
    failed = failed || result.failed;
    doneReceived = doneReceived || result.done;
    finishReason = result.finishReason ?? finishReason;
  }

  return { content: content.trim(), model, usage, failed, done: doneReceived, finishReason };
}

async function processStreamLine(line: string, onDelta: (delta: string) => Promise<void> | void) {
  const emptyUsage: GatewayUsage = { promptTokens: null, completionTokens: null, totalTokens: null, cachedPromptTokens: null, cacheWritePromptTokens: null };
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith(":")) {
    return { content: "", model: null, usage: emptyUsage, failed: false, done: false, finishReason: null };
  }

  if (!trimmed.startsWith("data:")) {
    return { content: "", model: null, usage: emptyUsage, failed: false, done: false, finishReason: null };
  }

  const data = trimmed.slice(5).trim();

  if (data === "[DONE]") {
    return { content: "", model: null, usage: emptyUsage, failed: false, done: true, finishReason: null };
  }

  if (!data) {
    return { content: "", model: null, usage: emptyUsage, failed: false, done: false, finishReason: null };
  }

  try {
    const payload = JSON.parse(data) as unknown;

    if (isRecord(payload) && isRecord(payload.error)) {
      return { content: "", model: parseModel(payload), usage: parseUsage(payload), failed: true, done: false, finishReason: null };
    }

    const delta = parseStreamDelta(payload);

    if (delta) {
      await onDelta(delta);
    }

    return {
      content: delta ?? "",
      model: parseModel(payload),
      usage: parseUsage(payload),
      failed: false,
      done: false,
      finishReason: parseFinishReason(payload),
    };
  } catch {
    return { content: "", model: null, usage: emptyUsage, failed: true, done: false, finishReason: null };
  }
}

function parseCompletionContent(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const [choice] = payload.choices;

  if (!isRecord(choice) || !isRecord(choice.message) || typeof choice.message.content !== "string") {
    return null;
  }

  return choice.message.content.trim() || null;
}

function parseStreamDelta(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const [choice] = payload.choices;

  if (!isRecord(choice) || !isRecord(choice.delta) || typeof choice.delta.content !== "string") {
    return null;
  }

  return choice.delta.content;
}

function parseFinishReason(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return null;
  }

  const [choice] = payload.choices;

  if (!isRecord(choice) || typeof choice.finish_reason !== "string") {
    return null;
  }

  return choice.finish_reason;
}

function mergeUsage(current: GatewayUsage, next: GatewayUsage): GatewayUsage {
  return {
    promptTokens: next.promptTokens ?? current.promptTokens,
    completionTokens: next.completionTokens ?? current.completionTokens,
    totalTokens: next.totalTokens ?? current.totalTokens,
    cachedPromptTokens: next.cachedPromptTokens ?? current.cachedPromptTokens,
    cacheWritePromptTokens: next.cacheWritePromptTokens ?? current.cacheWritePromptTokens,
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
