import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import type { getDb } from "@/db/client";
import { messages, webSearchResults, type WebSearchResultConfidence, type WebSearchResultSourceType } from "@/db/schema";
import { getRequiredServerEnv } from "@/server/env";

import type { WebSearchTriggerReason } from "./source-bundle";

const tavilyEndpoint = "https://api.tavily.com/search";
const tavilyTimeoutMs = 3_000;
const maxQueryLength = 500;
const maxProviderQueryLength = 220;
const maxProviderResponseBytes = 512_000;
const maxResults = 5;
const minProviderScore = 0.2;

export type WebSearchFailureCode = "missing_api_key" | "empty_query" | "provider_request_failed" | "provider_timeout" | "client_aborted" | "invalid_provider_response" | "low_quality_results";

export type WebSearchAttempt = {
  provider: "tavily";
  mechanism: "search";
  latencyMs: number | null;
  status: "success" | "failure";
  errorCode: WebSearchFailureCode | null;
};

export type NormalizedWebSearchResult = {
  query: string;
  title: string;
  url: string;
  snippet: string;
  content?: string;
  provider: "tavily";
  providerScore?: number;
  checkedAt: Date;
  sourceType: WebSearchResultSourceType;
  confidence: WebSearchResultConfidence;
  triggerReason: WebSearchTriggerReason;
  rank: number;
  persistedId?: string;
};

export type WebSearchResult =
  | { ok: true; results: NormalizedWebSearchResult[]; attempt: WebSearchAttempt }
  | { ok: false; code: WebSearchFailureCode; attempt: WebSearchAttempt };

type TavilyResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  raw_content?: unknown;
  score?: unknown;
};

type TavilyResponse = {
  results?: unknown;
};

type WebSearchDatabase = ReturnType<typeof getDb>;

export async function searchWebForSourceBundle({
  query,
  triggerReasons,
  fetcher = fetch,
  now = () => new Date(),
  abortSignal,
}: {
  query: string;
  triggerReasons: WebSearchTriggerReason[];
  fetcher?: typeof fetch;
  now?: () => Date;
  abortSignal?: AbortSignal;
}): Promise<WebSearchResult> {
  const startedAt = Date.now();
  const apiKey = getTavilyApiKey();
  const providerQuery = minimizeWebSearchQuery(query);

  if (!apiKey) {
    return webSearchFailure("missing_api_key", startedAt);
  }

  if (!hasSearchableText(providerQuery)) {
    return webSearchFailure("empty_query", startedAt);
  }

  const abortController = new AbortController();
  let abortFailureCode: Extract<WebSearchFailureCode, "client_aborted" | "provider_timeout"> | null = null;
  const timeout = setTimeout(() => {
    abortFailureCode ??= "provider_timeout";
    abortController.abort();
  }, tavilyTimeoutMs);
  const abortFromCaller = () => {
    abortFailureCode ??= "client_aborted";
    abortController.abort();
  };
  abortSignal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    if (abortSignal?.aborted) {
      abortFailureCode ??= "client_aborted";
      abortController.abort();
    }

    const response = await fetcher(tavilyEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: buildTavilyQuery(providerQuery),
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      return webSearchFailure("provider_request_failed", startedAt);
    }

    const payload = await readJsonResponse(response);

    if (!payload || !Array.isArray(payload.results)) {
      return webSearchFailure("invalid_provider_response", startedAt);
    }

    const results = normalizeTavilyResults({ payload, query: providerQuery, triggerReason: triggerReasons[0] ?? "no_active_knowledge", checkedAt: now() });

    if (results.length === 0) {
      return webSearchFailure("low_quality_results", startedAt);
    }

    return { ok: true, results, attempt: webSearchSuccess(startedAt) };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return webSearchFailure(abortFailureCode ?? "provider_timeout", startedAt);
    }

    return webSearchFailure("provider_request_failed", startedAt);
  } finally {
    abortSignal?.removeEventListener("abort", abortFromCaller);
    clearTimeout(timeout);
  }
}

function webSearchSuccess(startedAt: number): WebSearchAttempt {
  return { provider: "tavily", mechanism: "search", latencyMs: Date.now() - startedAt, status: "success", errorCode: null };
}

function webSearchFailure(code: WebSearchFailureCode, startedAt: number): WebSearchResult {
  return { ok: false, code, attempt: { provider: "tavily", mechanism: "search", latencyMs: Date.now() - startedAt, status: "failure", errorCode: code } };
}

export function normalizeTavilyResults({
  payload,
  query,
  triggerReason,
  checkedAt,
}: {
  payload: TavilyResponse;
  query: string;
  triggerReason: WebSearchTriggerReason;
  checkedAt: Date;
}): NormalizedWebSearchResult[] {
  if (!Array.isArray(payload.results)) {
    return [];
  }

  return payload.results
    .map((result) => normalizeTavilyResult(result, query, triggerReason, checkedAt))
    .filter((result): result is Omit<NormalizedWebSearchResult, "rank"> => Boolean(result))
    .filter((result) => result.providerScore !== undefined && result.providerScore >= minProviderScore)
    .sort(compareWebResults)
    .slice(0, maxResults)
    .map((result, index) => ({ ...result, rank: index + 1 }));
}

export async function captureWebSearchResults({
  db,
  userId,
  conversationId,
  userMessageId,
  results,
}: {
  db: WebSearchDatabase;
  userId: string;
  conversationId: string;
  userMessageId: string;
  results: NormalizedWebSearchResult[];
}): Promise<Array<{ id: string; rank: number }>> {
  if (results.length === 0) {
    return [];
  }

  await assertUserMessageRole({ db, userId, conversationId, userMessageId });
  await db.delete(webSearchResults).where(and(
    eq(webSearchResults.userId, userId),
    eq(webSearchResults.conversationId, conversationId),
    eq(webSearchResults.userMessageId, userMessageId),
    inArray(webSearchResults.provider, [...new Set(results.map((result) => result.provider))]),
  ));

  return db.insert(webSearchResults).values(results.map((result) => ({
    userId,
    conversationId,
    userMessageId,
    query: result.query,
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    content: result.content,
    provider: result.provider,
    providerScore: result.providerScore,
    checkedAt: result.checkedAt,
    sourceType: result.sourceType,
    confidence: "unverified" as const,
    triggerReason: result.triggerReason,
    rank: result.rank,
  }))).returning({ id: webSearchResults.id, rank: webSearchResults.rank });
}

export function minimizeWebSearchQuery(query: string) {
  return clip(query
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(/(?:\+?84|0)(?:[\s.-]*\d){8,10}/g, " ")
    .replace(/\d{1,2}\s*(?:tuổi|tuoi|yrs?|years? old)/gi, " ")
    .replace(/(?:tên tôi là|toi ten la|my name is)\s+[^,.!?]+/gi, " ")
    .replace(/(?:email|số điện thoại|so dien thoai|số|so|con)/gi, " ")
    .replace(/\s+/g, " ")
    .trim(), maxProviderQueryLength);
}

async function assertUserMessageRole({
  db,
  userId,
  conversationId,
  userMessageId,
}: {
  db: WebSearchDatabase;
  userId: string;
  conversationId: string;
  userMessageId: string;
}) {
  const [message] = await db
    .select({ role: messages.role })
    .from(messages)
    .where(and(eq(messages.id, userMessageId), eq(messages.conversationId, conversationId), eq(messages.userId, userId)))
    .limit(1);

  if (message?.role !== "user") {
    throw new Error("Web search results must be linked to a user message.");
  }
}

function normalizeTavilyResult(result: unknown, query: string, triggerReason: WebSearchTriggerReason, checkedAt: Date): Omit<NormalizedWebSearchResult, "rank"> | null {
  if (!isRecord(result)) {
    return null;
  }

  const tavilyResult = result as TavilyResult;
  const title = cleanText(tavilyResult.title, 300);
  const url = cleanUrl(tavilyResult.url);
  const snippet = cleanText(tavilyResult.content, 1_200) || cleanText(tavilyResult.raw_content, 1_200);
  const content = cleanText(tavilyResult.raw_content, 2_000) || undefined;
  const providerScore = normalizeScore(tavilyResult.score);

  if (!title || !url || !snippet) {
    return null;
  }

  const sourceType = classifySourceType(url, title);

  return {
    query: clip(query.trim(), maxQueryLength),
    title,
    url,
    snippet,
    content,
    provider: "tavily",
    providerScore,
    checkedAt,
    sourceType,
    confidence: "unverified",
    triggerReason,
  };
}

function compareWebResults(left: Omit<NormalizedWebSearchResult, "rank">, right: Omit<NormalizedWebSearchResult, "rank">) {
  const leftPriority = sourceTypePriority(left.sourceType);
  const rightPriority = sourceTypePriority(right.sourceType);

  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }

  return (right.providerScore ?? 0) - (left.providerScore ?? 0);
}

function sourceTypePriority(sourceType: WebSearchResultSourceType) {
  if (sourceType === "official") return 4;
  if (sourceType === "provider") return 3;
  if (sourceType === "general") return 2;
  return 1;
}

function classifySourceType(url: string, title: string): WebSearchResultSourceType {
  const hostname = new URL(url).hostname.toLocaleLowerCase("en-US");
  const normalizedTitle = normalizeForMatch(title);

  if (isHostOrSubdomain(hostname, "facebook.com") || isHostOrSubdomain(hostname, "tiktok.com") || hostname.includes("forum") || normalizedTitle.includes("review")) {
    return "community";
  }

  if (hostname === "gov.vn" || hostname.endsWith(".gov.vn")) {
    return "official";
  }

  if (normalizedTitle.includes("khach san") || normalizedTitle.includes("resort") || normalizedTitle.includes("tour") || normalizedTitle.includes("booking") || normalizedTitle.includes("provider")) {
    return "provider";
  }

  return "general";
}

function buildTavilyQuery(query: string) {
  const normalized = clip(query.replace(/\s+/g, " ").trim(), maxProviderQueryLength);
  return `${normalized} Vietnam official provider`;
}

function getTavilyApiKey() {
  try {
    return getRequiredServerEnv("TAVILY_API_KEY");
  } catch {
    return null;
  }
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? clip(value.slice(0, maxLength * 4).replace(/\s+/g, " ").trim(), maxLength) : "";
}

async function readJsonResponse(response: Response): Promise<TavilyResponse | null> {
  const reader = response.body?.getReader();

  if (!reader) {
    return response.json().catch(() => null) as Promise<TavilyResponse | null>;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maxProviderResponseBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }

    chunks.push(value);
  }

  try {
    return JSON.parse(new TextDecoder().decode(concatUint8Arrays(chunks, totalBytes))) as TavilyResponse;
  } catch {
    return null;
  }
}

function concatUint8Arrays(chunks: Uint8Array[], totalBytes: number) {
  const result = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

function isHostOrSubdomain(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function hasSearchableText(value: string) {
  return /[\p{L}\p{N}]/u.test(value);
}

function cleanUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  try {
    const url = new URL(value.trim());
    const href = url.toString();
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password && href.length <= 2_048 ? href : "";
  } catch {
    return "";
  }
}

function normalizeScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, value));
}

function clip(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(0, maxLength).trim();
}

function normalizeForMatch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi-VN");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
