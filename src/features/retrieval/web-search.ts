import "server-only";

import { and, eq } from "drizzle-orm";

import type { getDb } from "@/db/client";
import { messages, webSearchResults, type WebSearchResultConfidence, type WebSearchResultSourceType } from "@/db/schema";
import { getRequiredServerEnv } from "@/server/env";

import type { WebSearchTriggerReason } from "./source-bundle";

const tavilyEndpoint = "https://api.tavily.com/search";
const tavilyTimeoutMs = 3_000;
const maxQueryLength = 500;
const maxProviderQueryLength = 220;
const maxResults = 5;
const minProviderScore = 0.2;

export type WebSearchFailureCode = "missing_api_key" | "provider_request_failed" | "provider_timeout" | "invalid_provider_response" | "low_quality_results";

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
};

export type WebSearchResult =
  | { ok: true; results: NormalizedWebSearchResult[] }
  | { ok: false; code: WebSearchFailureCode };

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
}: {
  query: string;
  triggerReasons: WebSearchTriggerReason[];
  fetcher?: typeof fetch;
  now?: () => Date;
}): Promise<WebSearchResult> {
  const apiKey = getTavilyApiKey();
  const providerQuery = minimizeWebSearchQuery(query);

  if (!apiKey) {
    return { ok: false, code: "missing_api_key" };
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), tavilyTimeoutMs);

  try {
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
      return { ok: false, code: "provider_request_failed" };
    }

    const payload = await response.json().catch(() => null) as TavilyResponse | null;

    if (!payload || !Array.isArray(payload.results)) {
      return { ok: false, code: "invalid_provider_response" };
    }

    const results = normalizeTavilyResults({ payload, query: providerQuery, triggerReason: triggerReasons[0] ?? "no_approved_knowledge", checkedAt: now() });

    if (results.length === 0) {
      return { ok: false, code: "low_quality_results" };
    }

    return { ok: true, results };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, code: "provider_timeout" };
    }

    return { ok: false, code: "provider_request_failed" };
  } finally {
    clearTimeout(timeout);
  }
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
    .filter((result) => result.providerScore === undefined || result.providerScore >= minProviderScore)
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
}) {
  if (results.length === 0) {
    return;
  }

  await assertUserMessageRole({ db, userId, conversationId, userMessageId });

  await db.insert(webSearchResults).values(results.map((result) => ({
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
    confidence: result.confidence,
    triggerReason: result.triggerReason,
    rank: result.rank,
  })));
}

export function minimizeWebSearchQuery(query: string) {
  return clip(query
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(/(?:\+?84|0)(?:[\s.-]*\d){8,10}\b/g, " ")
    .replace(/\b\d{1,2}\s*(?:tuổi|tuoi|yrs?|years? old)\b/gi, " ")
    .replace(/\b(?:tên tôi là|toi ten la|my name is)\s+[^,.!?]+/gi, " ")
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
    confidence: sourceType === "official" ? "official" : sourceType === "provider" ? "provider" : "unverified",
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
  const normalizedUrl = url.toLocaleLowerCase("vi-VN");
  const normalizedTitle = normalizeForMatch(title);

  if (normalizedUrl.includes("facebook.com") || normalizedUrl.includes("tiktok.com") || normalizedUrl.includes("forum") || normalizedTitle.includes("review")) {
    return "community";
  }

  if (normalizedUrl.endsWith(".gov.vn") || normalizedUrl.includes(".gov.vn/") || normalizedTitle.includes("official") || normalizedTitle.includes("chinh thuc")) {
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
  return typeof value === "string" ? clip(value.replace(/\s+/g, " ").trim(), maxLength) : "";
}

function cleanUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  try {
    const url = new URL(value.trim());
    const href = url.toString();
    return (url.protocol === "http:" || url.protocol === "https:") && href.length <= 2_048 ? href : "";
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
