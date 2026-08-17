import { getRequiredServerEnv } from "./env";

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

type GatewayRequestMetadata = {
  providerRequestId: string | null;
};

const defaultGatewayTimeoutMs = 30_000;
const minGatewayTimeoutMs = 1_000;
const maxGatewayTimeoutMs = 180_000;
const maxCompletionTokens = 900;
const maxExtractionTokens = 1500;
const maxEvaluationTokens = 1800;
const maxTripProposalDraftTokens = 1800;

export type AiGatewaySuccess = {
  ok: true;
  content: string;
  provider: "ai_gateway";
  model: string;
  latencyMs: number;
  usage: GatewayUsage;
  requestMetadata: GatewayRequestMetadata;
  reportedSourceHandles?: string[] | null;
};

export type AiGatewayStreamFailure = {
  ok: false;
  provider: "ai_gateway";
  model: string;
  latencyMs: number;
  errorCode: "gateway_http_error" | "gateway_network_error" | "invalid_gateway_response" | "gateway_stream_failed" | "client_stream_aborted";
  requestMetadata: GatewayRequestMetadata;
};

export type AiGatewayStreamResult = AiGatewaySuccess | AiGatewayStreamFailure;

export type AiGatewayExtractionFailure = {
  ok: false;
  provider: "ai_gateway";
  model: string;
  latencyMs: number;
  errorCode: "gateway_http_error" | "gateway_network_error" | "invalid_gateway_response" | "client_stream_aborted";
  failureKind?: "rate_limited" | "other";
  requestMetadata: GatewayRequestMetadata;
};

export type AiGatewayExtractionResult = AiGatewaySuccess | AiGatewayExtractionFailure;

export type AiGatewayCompletionPurpose = "ai_ask" | "extraction" | "evaluation" | "trip_proposal_draft" | "youtube_discovery_triage" | "youtube_discovery_province_suggestion";

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
        tools: [reportedSourcesTool],
        tool_choice: "auto",
      }),
    });

    const latencyMs = Date.now() - startedAt;

    if (!response.ok) {
      logGatewayFailure({ errorCode: "gateway_http_error", latencyMs, model, timeoutMs: gatewayTimeoutMs, status: response.status, statusText: response.statusText });

        return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "gateway_http_error", requestMetadata: getGatewayRequestMetadata(response) };
    }

    if (!response.body) {
      logGatewayFailure({ errorCode: "invalid_gateway_response", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "missing_stream_body" });

        return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "invalid_gateway_response", requestMetadata: getGatewayRequestMetadata(response) };
    }

    const streamResult = await readOpenAiCompatibleStream(response.body, onDelta);
    const finalLatencyMs = Date.now() - startedAt;
    // Some OpenAI-compatible providers close an otherwise clean SSE response after
    // its final content delta without emitting `[DONE]` or `finish_reason`.
    // A clean EOF with content is sufficient for an answer; malformed frames and
    // provider-declared errors remain failures below.
    const terminated = streamResult.done || streamResult.finishReason === "stop" || streamResult.finishReason === "length" || streamResult.finishReason === "tool_calls" || streamResult.cleanEofWithContent;

    if (streamResult.failed || !terminated || !streamResult.content) {
      logGatewayFailure({ errorCode: "invalid_gateway_response", latencyMs: finalLatencyMs, model, timeoutMs: gatewayTimeoutMs, reason: streamResult.failed ? "stream_parse_failed" : streamResult.done ? "empty_stream_content" : "missing_terminal_signal" });

       return { ok: false, provider: "ai_gateway", model, latencyMs: finalLatencyMs, errorCode: streamResult.failed ? "gateway_stream_failed" : "invalid_gateway_response", requestMetadata: getGatewayRequestMetadata(response) };
    }

      return {
      ok: true,
      content: streamResult.content,
      provider: "ai_gateway",
      model: streamResult.model ?? model,
      latencyMs: finalLatencyMs,
       usage: streamResult.usage,
        requestMetadata: getGatewayRequestMetadata(response),
        reportedSourceHandles: streamResult.reportedSourceHandles,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    if (abortSignal?.aborted) {
      logGatewayFailure({ errorCode: "client_stream_aborted", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "client_aborted" });

     return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "client_stream_aborted", requestMetadata: { providerRequestId: null } };
    }

    logGatewayFailure({
      errorCode: "gateway_network_error",
      latencyMs,
      model,
      timeoutMs: gatewayTimeoutMs,
      reason: gatewayFailureReason(error),
    });

        return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "gateway_network_error", requestMetadata: { providerRequestId: null } };
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
  omitOutputTokenLimit = false,
}: {
  model: string;
  messages: GatewayMessage[];
  abortSignal?: AbortSignal;
  omitOutputTokenLimit?: boolean;
}): Promise<AiGatewayExtractionResult> {
  return completeGatewayPrompt({ model, messages, abortSignal, purpose: "extraction", maxTokens: omitOutputTokenLimit ? null : maxExtractionTokens });
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

export async function completeTripChangeProposalDraft({
  model,
  messages,
  abortSignal,
}: {
  model: string;
  messages: GatewayMessage[];
  abortSignal?: AbortSignal;
}): Promise<AiGatewayExtractionResult> {
  return completeGatewayPrompt({ model, messages, abortSignal, purpose: "trip_proposal_draft", maxTokens: maxTripProposalDraftTokens });
}

export async function completeYoutubeDiscoveryTriage({ model, messages, abortSignal }: { model: string; messages: GatewayMessage[]; abortSignal?: AbortSignal }): Promise<AiGatewayExtractionResult> {
  return completeGatewayPrompt({ model, messages, abortSignal, purpose: "youtube_discovery_triage", maxTokens: 300 });
}
export async function completeYoutubeDiscoveryProvinceSuggestion({ model, messages, abortSignal }: { model: string; messages: GatewayMessage[]; abortSignal?: AbortSignal }): Promise<AiGatewayExtractionResult> {
  return completeGatewayPrompt({ model, messages, abortSignal, purpose: "youtube_discovery_province_suggestion", maxTokens: 300 });
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
  maxTokens: number | null;
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

        return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "gateway_http_error", failureKind: response.status === 429 ? "rate_limited" : "other", requestMetadata: getGatewayRequestMetadata(response) };
    }

    const payload = await response.json().catch(() => null) as unknown;

    if (isRecord(payload) && isRecord(payload.error)) {
      logGatewayFailure({ errorCode: "invalid_gateway_response", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "provider_error_in_body", purpose });

        return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "invalid_gateway_response", failureKind: "other", requestMetadata: getGatewayRequestMetadata(response) };
    }

    const content = parseCompletionContent(payload);

    if (!content) {
      logGatewayFailure({ errorCode: "invalid_gateway_response", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "missing_completion_content", purpose });

        return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "invalid_gateway_response", failureKind: "other", requestMetadata: getGatewayRequestMetadata(response) };
    }

    return {
      ok: true,
      content,
      provider: "ai_gateway",
      model: parseModel(payload) ?? model,
      latencyMs,
       usage: parseUsage(payload),
      requestMetadata: getGatewayRequestMetadata(response, payload),
      reportedSourceHandles: null,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;

    if (abortSignal?.aborted) {
      logGatewayFailure({ errorCode: "client_stream_aborted", latencyMs, model, timeoutMs: gatewayTimeoutMs, reason: "client_aborted", purpose });

        return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "client_stream_aborted", failureKind: "other", requestMetadata: { providerRequestId: null } };
    }

    logGatewayFailure({
      errorCode: "gateway_network_error",
      latencyMs,
      model,
      timeoutMs: gatewayTimeoutMs,
      reason: gatewayFailureReason(error),
      purpose,
    });

     return { ok: false, provider: "ai_gateway", model, latencyMs, errorCode: "gateway_network_error", failureKind: "other", requestMetadata: { providerRequestId: null } };
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
  const configuredValue = purpose === "extraction" || purpose === "evaluation" || purpose === "trip_proposal_draft" || purpose === "youtube_discovery_triage" || purpose === "youtube_discovery_province_suggestion" ? process.env.AI_GATEWAY_EXTRACTION_TIMEOUT_MS ?? process.env.AI_GATEWAY_TIMEOUT_MS : process.env.AI_GATEWAY_TIMEOUT_MS;

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
  purpose?: "answer" | AiGatewayCompletionPurpose;
}) {
  console.warn(details.purpose === "extraction" || details.purpose === "evaluation" || details.purpose === "trip_proposal_draft" || details.purpose === "youtube_discovery_triage" || details.purpose === "youtube_discovery_province_suggestion" ? `AI Gateway ${details.purpose} failed` : "AI Gateway answer generation failed", {
    errorCode: details.errorCode,
    latencyMs: details.latencyMs,
    model: details.model,
    timeoutMs: details.timeoutMs,
    status: details.status,
    statusText: details.statusText,
    reason: details.reason,
  });
}

function gatewayFailureReason(error: unknown) {
  if (!(error instanceof Error)) return "unknown_error";
  if (error.name === "AbortError") return "timeout";
  const cause = error.cause;
  if (cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" && /^[A-Z0-9_]{1,64}$/.test(cause.code)) return cause.code;
  return error.name;
}

function parseModel(payload: unknown) {
  if (!isRecord(payload) || typeof payload.model !== "string") {
    return null;
  }

  return payload.model.trim() || null;
}

function getGatewayRequestMetadata(response: Response, payload?: unknown): GatewayRequestMetadata {
  const headerId = response.headers.get("x-request-id") ?? response.headers.get("request-id");
  const payloadId = isRecord(payload) && typeof payload.id === "string" ? payload.id : null;
  const providerRequestId = (headerId ?? payloadId)?.trim() ?? "";

  return { providerRequestId: providerRequestId.length > 0 && providerRequestId.length <= 200 ? providerRequestId : null };
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

const reportedSourcesTool = {
  type: "function",
  function: {
    name: "report_used_sources",
    description: "Report the provided internal source handles that materially informed the completed answer.",
    parameters: {
      type: "object",
      properties: { provenance_handles: { type: "array", items: { type: "string", minLength: 1, maxLength: 32 }, maxItems: 8 } },
      required: ["provenance_handles"],
      additionalProperties: false,
    },
  },
} as const;
const maxToolCallFragmentLength = 4_096;

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
  const toolCalls = new Map<number, { name: string; arguments: string }>();

  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";

    for (const line of lines) {
      const result = await processStreamLine(line, onDelta, toolCalls);
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
    const result = await processStreamLine(buffered, onDelta, toolCalls);
    content += result.content;
    model = result.model ?? model;
    usage = mergeUsage(usage, result.usage);
    failed = failed || result.failed;
    doneReceived = doneReceived || result.done;
    finishReason = result.finishReason ?? finishReason;
  }

  const trimmedContent = content.trim();
  return { content: trimmedContent, model, usage, failed, done: doneReceived, finishReason, cleanEofWithContent: !failed && !doneReceived && finishReason === null && trimmedContent.length > 0, reportedSourceHandles: parseReportedSourceHandles(toolCalls) };
}

async function processStreamLine(line: string, onDelta: (delta: string) => Promise<void> | void, toolCalls: Map<number, { name: string; arguments: string }>) {
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

    collectStreamToolCalls(payload, toolCalls);

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

function collectStreamToolCalls(payload: unknown, toolCalls: Map<number, { name: string; arguments: string }>) {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) return;
  const [choice] = payload.choices;
  if (!isRecord(choice) || !isRecord(choice.delta) || !Array.isArray(choice.delta.tool_calls)) return;
  for (const item of choice.delta.tool_calls) {
    if (!isRecord(item) || !isRecord(item.function)) continue;
    const index = item.index;
    if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0) continue;
    const current = toolCalls.get(index) ?? { name: "", arguments: "" };
    if (typeof item.function.name === "string" && current.name.length + item.function.name.length <= maxToolCallFragmentLength) current.name += item.function.name;
    else if (typeof item.function.name === "string") current.name = "[invalid]";
    if (typeof item.function.arguments === "string" && current.arguments.length + item.function.arguments.length <= maxToolCallFragmentLength) current.arguments += item.function.arguments;
    else if (typeof item.function.arguments === "string") current.arguments = "[invalid]";
    toolCalls.set(index, current);
  }
}

function parseReportedSourceHandles(toolCalls: Map<number, { name: string; arguments: string }>) {
  if (toolCalls.size !== 1) return null;
  const [toolCall] = toolCalls.values();
  if (toolCall.name !== "report_used_sources") return null;
  try {
    const parsed = JSON.parse(toolCall.arguments) as unknown;
    if (!isRecord(parsed) || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.provenance_handles) || parsed.provenance_handles.length > 8 || !parsed.provenance_handles.every((handle) => typeof handle === "string" && handle.length > 0 && handle.length <= 32)) return null;
    return parsed.provenance_handles;
  } catch {
    return null;
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
