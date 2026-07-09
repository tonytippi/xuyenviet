import "server-only";

import type { WebSearchResultSourceType } from "@/db/schema";

import type { WebSearchFailureCode } from "./web-search";

export type WebSearchQualityCandidate = {
  query: string;
  title?: string;
  url?: string;
  snippet?: string;
  content?: string;
  provider?: string;
  providerScore?: number;
  checkedAt?: Date | string;
  sourceType: WebSearchResultSourceType;
  rank?: number;
};

export type WebSearchQualityQuery = {
  id: string;
  query: string;
  expectedLanguage?: "vi" | "en" | "mixed";
  candidates: WebSearchQualityCandidate[];
  failureCode?: WebSearchFailureCode;
};

export type WebSearchOperationalInput = {
  providerName: string;
  apiKeyConfigured: boolean;
  timeoutMs: number;
  pricingNote: string;
  rateLimitNote: string;
  failureBehavior: string;
};

export type WebSearchQualityEvaluation = {
  providerName: string;
  generatedAt: string;
  queries: WebSearchQualityQueryEvaluation[];
  operationalRisks: string[];
  score: number;
  pass: boolean;
  recommendation: string;
};

export type WebSearchQualityQueryEvaluation = {
  id: string;
  query: string;
  score: number;
  pass: boolean;
  resultCount: number;
  usableVietnameseSourceCount: number;
  officialOrProviderPreferred: boolean;
  topSourceType?: WebSearchResultSourceType;
  sourceTypeCounts: Record<WebSearchResultSourceType, number>;
  candidates: WebSearchQualityCandidateEvaluation[];
  metadata: {
    titleCount: number;
    urlCount: number;
    snippetOrContentCount: number;
    checkedAtCount: number;
    providerScoreCount: number;
    missing: string[];
  };
  sourceSafetyFlags: string[];
  notes: string[];
};

export type WebSearchQualityCandidateEvaluation = {
  rank: number;
  titleAvailable: boolean;
  urlAvailable: boolean;
  snippetOrContentAvailable: boolean;
  checkedAtAvailable: boolean;
  rankingSignalAvailable: boolean;
  usableSourceLanguage: boolean;
  sourceLanguage: "vi" | "en" | "mixed" | "unknown";
  sourceType: WebSearchResultSourceType;
};

export function evaluateWebSearchFallbackQuality({
  queries,
  operational,
  generatedAt = new Date(),
}: {
  queries: WebSearchQualityQuery[];
  operational: WebSearchOperationalInput;
  generatedAt?: Date;
}): WebSearchQualityEvaluation {
  const queryEvaluations = queries.map(evaluateQueryQuality);
  const score = average(queryEvaluations.map((query) => query.score));
  const operationalRisks = evaluateOperationalRisks(operational);
  const pass = queryEvaluations.length > 0 && queryEvaluations.every((query) => query.pass) && !operationalRisks.includes("missing_api_key_blocks_live_fallback");

  return {
    providerName: operational.providerName,
    generatedAt: generatedAt.toISOString(),
    queries: queryEvaluations,
    operationalRisks,
    score,
    pass,
    recommendation: buildRecommendation(operational.providerName, pass, operationalRisks),
  };
}

function evaluateQueryQuality(query: WebSearchQualityQuery): WebSearchQualityQueryEvaluation {
  const candidates = orderCandidates(query.candidates);
  const resultCount = candidates.length;
  const titleCount = candidates.filter((candidate) => hasText(candidate.title)).length;
  const urlCount = candidates.filter((candidate) => hasSafeUrl(candidate.url)).length;
  const snippetOrContentCount = candidates.filter((candidate) => hasText(candidate.snippet) || hasText(candidate.content)).length;
  const checkedAtCount = candidates.filter((candidate) => hasValidCheckedAt(candidate.checkedAt)).length;
  const providerScoreCount = candidates.filter(hasRankingSignal).length;
  const usableVietnameseSourceCount = candidates.filter((candidate) => isUsableLanguageCandidate(candidate, query.expectedLanguage ?? "vi")).length;
  const candidateEvaluations = candidates.map((candidate, index) => evaluateCandidateMetadata(candidate, index + 1, query.expectedLanguage ?? "vi"));
  const topSourceType = candidates[0]?.sourceType;
  const sourceTypeCounts = countSourceTypes(candidates);
  const officialOrProviderPreferred = topSourceType === "official" || topSourceType === "provider" || !candidates.some((candidate) => candidate.sourceType === "official" || candidate.sourceType === "provider");
  const sourceSafetyFlags = buildSourceSafetyFlags(candidates);
  const hasBlockingSafetyFlag = sourceSafetyFlags.some(isBlockingSafetyFlag);
  const missing = buildMissingMetadata({ resultCount, titleCount, urlCount, snippetOrContentCount, checkedAtCount, providerScoreCount });
  const metadataScore = resultCount === 0 ? 0 : average([
    titleCount / resultCount,
    urlCount / resultCount,
    snippetOrContentCount / resultCount,
    checkedAtCount / resultCount,
    providerScoreCount / resultCount,
  ]);
  const preferenceScore = officialOrProviderPreferred ? 1 : 0;
  const languageScore = resultCount === 0 ? 0 : usableVietnameseSourceCount / resultCount;
  const safetyScore = hasBlockingSafetyFlag ? 0.65 : 1;
  const score = round(100 * average([metadataScore, preferenceScore, languageScore, safetyScore]));
  const notes = buildQueryNotes({ query, officialOrProviderPreferred, missing, sourceSafetyFlags });

  return {
    id: query.id,
    query: query.query,
    score,
    pass: !query.failureCode && score >= 70 && officialOrProviderPreferred && !hasBlockingSafetyFlag,
    resultCount,
    usableVietnameseSourceCount,
    officialOrProviderPreferred,
    topSourceType,
    sourceTypeCounts,
    candidates: candidateEvaluations,
    metadata: { titleCount, urlCount, snippetOrContentCount, checkedAtCount, providerScoreCount, missing },
    sourceSafetyFlags,
    notes,
  };
}

function evaluateCandidateMetadata(candidate: WebSearchQualityCandidate, rank: number, expectedLanguage: "vi" | "en" | "mixed"): WebSearchQualityCandidateEvaluation {
  return {
    rank,
    titleAvailable: hasText(candidate.title),
    urlAvailable: hasSafeUrl(candidate.url),
    snippetOrContentAvailable: hasText(candidate.snippet) || hasText(candidate.content),
    checkedAtAvailable: hasValidCheckedAt(candidate.checkedAt),
    rankingSignalAvailable: hasRankingSignal(candidate),
    usableSourceLanguage: isUsableLanguageCandidate(candidate, expectedLanguage),
    sourceLanguage: detectSourceLanguage(candidate),
    sourceType: candidate.sourceType,
  };
}

function isBlockingSafetyFlag(flag: string) {
  return flag.includes("community_promoted") || flag.includes("spoofed_official_claim");
}

function orderCandidates(candidates: WebSearchQualityCandidate[]) {
  if (!candidates.some((candidate) => candidate.rank !== undefined)) {
    return [...candidates];
  }

  return candidates.map((candidate, index) => ({ candidate, index })).sort((left, right) => compareRankedCandidates(left, right)).map((entry) => entry.candidate);
}

function compareRankedCandidates(left: { candidate: WebSearchQualityCandidate; index: number }, right: { candidate: WebSearchQualityCandidate; index: number }) {
  if (left.candidate.rank !== undefined || right.candidate.rank !== undefined) {
    const rankDelta = normalizeRank(left.candidate.rank) - normalizeRank(right.candidate.rank);
    if (rankDelta !== 0) return rankDelta;
  }

  return left.index - right.index;
}

function buildMissingMetadata({
  resultCount,
  titleCount,
  urlCount,
  snippetOrContentCount,
  checkedAtCount,
  providerScoreCount,
}: {
  resultCount: number;
  titleCount: number;
  urlCount: number;
  snippetOrContentCount: number;
  checkedAtCount: number;
  providerScoreCount: number;
}) {
  if (resultCount === 0) return ["results"];

  const missing: string[] = [];
  if (titleCount < resultCount) missing.push("title");
  if (urlCount < resultCount) missing.push("url");
  if (snippetOrContentCount < resultCount) missing.push("snippet_or_content");
  if (checkedAtCount < resultCount) missing.push("checked_at");
  if (providerScoreCount < resultCount) missing.push("provider_score_or_ranking_signal");
  return missing;
}

function buildSourceSafetyFlags(candidates: WebSearchQualityCandidate[]) {
  const flags: string[] = [];

  candidates.forEach((candidate, index) => {
    const position = index + 1;
    const normalizedText = normalizeForMatch(`${candidate.title ?? ""} ${candidate.url ?? ""} ${candidate.snippet ?? ""} ${candidate.content ?? ""}`);

    if (candidate.sourceType === "community" && position === 1) {
      flags.push(`community_promoted_to_top:${position}`);
    }

    if ((normalizedText.includes("official") || normalizedText.includes("chinh thuc") || normalizedText.includes("gov.vn")) && candidate.sourceType !== "official") {
      flags.push(`spoofed_official_claim:${position}`);
    }

    if (candidate.sourceType === "community") {
      flags.push(`community_or_repost:${position}`);
    }
  });

  return flags;
}

function buildQueryNotes({
  query,
  officialOrProviderPreferred,
  missing,
  sourceSafetyFlags,
}: {
  query: WebSearchQualityQuery;
  officialOrProviderPreferred: boolean;
  missing: string[];
  sourceSafetyFlags: string[];
}) {
  const notes: string[] = [];

  if (query.failureCode) {
    notes.push(`safe_failure:${query.failureCode}`);
  }

  if (!officialOrProviderPreferred) {
    notes.push("official_or_provider_available_but_not_preferred");
  }

  if (missing.length > 0) {
    notes.push(`metadata_gaps:${missing.join(",")}`);
  }

  if (sourceSafetyFlags.length > 0) {
    notes.push("source_safety_review_required");
  }

  return notes;
}

function evaluateOperationalRisks(operational: WebSearchOperationalInput) {
  const risks: string[] = [];

  if (!operational.apiKeyConfigured) {
    risks.push("missing_api_key_blocks_live_fallback");
  }

  if (operational.timeoutMs > 5_000) {
    risks.push("timeout_may_delay_ai_answer");
  }

  if (hasText(operational.pricingNote)) {
    risks.push(`pricing:${operational.pricingNote}`);
  }

  if (hasText(operational.rateLimitNote)) {
    risks.push(`rate_limit:${operational.rateLimitNote}`);
  }

  if (hasText(operational.failureBehavior)) {
    risks.push(`failure_behavior:${operational.failureBehavior}`);
  }

  return risks;
}

function buildRecommendation(providerName: string, pass: boolean, risks: string[]) {
  if (!pass) {
    return `${providerName} remains acceptable only as a warning-only fallback until metadata and operational gaps are resolved.`;
  }

  if (risks.length > 0) {
    return `${providerName} is acceptable for MVP web fallback with unverified labels, deterministic failure handling, monitored cost/rate limits, and provider-independent source contracts.`;
  }

  return `${providerName} is acceptable for MVP web fallback with existing provider-independent source contracts.`;
}

function normalizeRank(rank: number | undefined) {
  return typeof rank === "number" && Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER;
}

function isUsableLanguageCandidate(candidate: WebSearchQualityCandidate, expectedLanguage: "vi" | "en" | "mixed") {
  if (!hasText(candidate.title) || !hasSafeUrl(candidate.url) || (!hasText(candidate.snippet) && !hasText(candidate.content))) {
    return false;
  }

  if (expectedLanguage === "en") {
    return true;
  }

  if (expectedLanguage === "mixed") {
    return containsVietnameseSignal(candidate) || containsAsciiTravelSignal(candidate);
  }

  return containsVietnameseSignal(candidate);
}

function containsVietnameseSignal(candidate: WebSearchQualityCandidate) {
  const raw = `${candidate.title ?? ""} ${candidate.snippet ?? ""} ${candidate.content ?? ""} ${candidate.url ?? ""}`.normalize("NFC");
  const normalized = normalizeForMatch(raw);
  return /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(raw)
    || /\b(ha noi|ho chi minh|tp hcm|da nang|nha trang|quy nhon|hue|can gio|vung tau|hai van|viet nam|vietnam)\b/.test(normalized);
}

function containsAsciiTravelSignal(candidate: WebSearchQualityCandidate) {
  return /\b(vietnam|route|ticket|hotel|ferry|schedule|weather|road|condition|availability)\b/.test(normalizeForMatch(`${candidate.title ?? ""} ${candidate.snippet ?? ""} ${candidate.content ?? ""} ${candidate.url ?? ""}`));
}

function detectSourceLanguage(candidate: WebSearchQualityCandidate): "vi" | "en" | "mixed" | "unknown" {
  const hasVietnamese = containsVietnameseSignal(candidate);
  const hasEnglish = containsAsciiTravelSignal(candidate);

  if (hasVietnamese && hasEnglish) return "mixed";
  if (hasVietnamese) return "vi";
  if (hasEnglish) return "en";
  return "unknown";
}

function hasText(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasSafeUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function hasValidCheckedAt(value: Date | string | undefined) {
  if (!value) return false;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime());
}

function hasRankingSignal(candidate: WebSearchQualityCandidate) {
  return (typeof candidate.providerScore === "number" && Number.isFinite(candidate.providerScore)) || (typeof candidate.rank === "number" && Number.isFinite(candidate.rank));
}

function countSourceTypes(candidates: WebSearchQualityCandidate[]) {
  const counts: Record<WebSearchResultSourceType, number> = { official: 0, provider: 0, general: 0, community: 0 };

  for (const candidate of candidates) {
    counts[candidate.sourceType] += 1;
  }

  return counts;
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeForMatch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi-VN");
}
