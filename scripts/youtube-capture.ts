import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "../src/db/schema";
import { admitArtifact, assertCaptureCacheReady, findReusableArtifact, finishImport, prepareImport } from "../src/features/knowledge/capture-cache";
import { flushCachedArtifact } from "../src/features/knowledge/capture-orchestration";
import { YOUTUBE_CAPTURE_PAYLOAD_SCHEMA_VERSION, captureReuseKey, youtubeCaptureMethodVersion, youtubeResourceIdentity, youtubeVideoId, youtubeWindowResourceIdentity } from "../src/features/knowledge/capture-identity";
import { findYoutubeCaptureImportByCorrelationToken, listQueuedYoutubeSources, maxYoutubeEvidenceItemsPerVideo, maxYoutubeEvidenceItemsPerWindow, parseYoutubeEvidence, recordYoutubeCaptureFailure, sanitizeYoutubeMetadata, saveYoutubeEvidence, type YoutubeEvidence } from "../src/features/knowledge/youtube-capture";
import { assertDistinctCaptureDatabases, getCaptureCacheDatabaseUrl, getDatabaseUrl, getEnvValue } from "./db-env";

type Options = { sourceId?: string; limit?: number; yes: boolean };
export const youtubeEvidencePromptVersion = "youtube-evidence-v1";
export const youtubeWindowSeconds = 30 * 60;
export const retainedYoutubeEvidenceItemsPerWindow = 10;
const geminiRetryDelaysMs = [1_000, 2_000];
const prompt = `Analyze this public YouTube video window as a Vietnam road-trip research source. Return JSON only: {"evidence":[{"category":"road_condition|route|toll|fuel|charging|rest_stop|parking|accommodation|food|attraction|safety|weather|cost","claim_vi":"Vietnamese factual claim (non-empty, max 500 chars)","evidence_type":"spoken|on_screen|both","timestamp_start_seconds":0,"timestamp_end_seconds":0,"confidence":"high|medium|low","freshness_sensitive":true,"evidence_excerpt":"non-empty excerpt, max 240 chars","uncertainty_or_condition":null}]}. Every evidence item must include every key exactly as shown. Use only the listed enum values. Timestamps must be non-negative integer seconds relative to the full video and fall within the requested window. If the API constrains you to report clip-relative timestamps, use offsets relative to the requested window for every item; never mix timestamp conventions. End must not precede start. uncertainty_or_condition must be null or a non-empty string under 400 characters. Extract at most ${maxYoutubeEvidenceItemsPerWindow} items. Include only explicitly spoken or clearly shown facts. Do not infer missing facts or return a transcript. Return {"evidence":[]} if no reliable travel evidence exists.`;
type GeminiMediaResolution = "MEDIA_RESOLUTION_LOW" | "MEDIA_RESOLUTION_MEDIUM" | "MEDIA_RESOLUTION_HIGH";
const defaultMediaResolution: GeminiMediaResolution = "MEDIA_RESOLUTION_LOW";

class GeminiRequestError extends Error {
  constructor(code: string, readonly diagnostic: string | null) {
    super(code);
  }
}

class YoutubeSegmentError extends Error {
  constructor(segmentNumber: number, readonly diagnostic: string | null, cause: unknown) {
    super(`youtube_segment_${segmentNumber}_${captureFailureCode(cause)}`);
  }
}

export async function requestYoutubeEvidence(url: string, apiKey: string, model: string, window: YoutubeWindow, mediaResolution: GeminiMediaResolution = defaultMediaResolution, fetchImpl = fetch) {
  const startedAt = Date.now();
  try {
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000);
      try {
        let response: Response;
        try {
          response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
            signal: controller.signal,
            body: JSON.stringify({
              contents: [{
                parts: [
                  { file_data: { file_uri: url, mime_type: "video/mp4" }, video_metadata: { start_offset: `${window.startOffsetSeconds}s`, end_offset: `${window.endOffsetSeconds}s` } },
                  { text: prompt },
                ],
              }],
              generationConfig: { responseMimeType: "application/json", temperature: 0, mediaResolution },
            }),
          });
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") throw error;
          throw new Error("gemini_network_error");
        }
        if (!response.ok) {
          const error = new GeminiRequestError(`gemini_http_${response.status}`, await readGeminiErrorDiagnostic(response));
          if (attempt < geminiRetryDelaysMs.length && isRetryableGeminiError(error)) {
            await new Promise((resolve) => setTimeout(resolve, geminiRetryDelaysMs[attempt]));
            continue;
          }
          throw error;
        }
        const payload = await response.json().catch(() => { throw new Error("gemini_invalid_json"); }) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } };
        const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
        if (!text) throw new Error("gemini_empty_response");
        const responseValue = JSON.parse(text) as unknown;
        const evidence = normalizeYoutubeWindowTimestamps(parseYoutubeEvidence(responseValue, maxYoutubeEvidenceItemsPerWindow), window);
        return { evidence, latencyMs: Date.now() - startedAt, usage: payload.usageMetadata };
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("gemini_timeout");
    if (error instanceof SyntaxError) throw new Error("gemini_invalid_json");
    throw error;
  }
}

export type YoutubeWindow = { startOffsetSeconds: number; endOffsetSeconds: number };
type YoutubeSegment = { evidence: YoutubeEvidence[]; window: YoutubeWindow; latencyMs: number };

export function normalizeYoutubeWindowTimestamps(evidence: YoutubeEvidence[], window: YoutubeWindow) {
  if (evidence.every((item) => item.timestamp_start_seconds >= window.startOffsetSeconds && item.timestamp_end_seconds <= window.endOffsetSeconds)) {
    return evidence.map((item) => ({ ...item, timestamp_start_seconds: item.timestamp_start_seconds - window.startOffsetSeconds, timestamp_end_seconds: item.timestamp_end_seconds - window.startOffsetSeconds }));
  }
  const windowDurationSeconds = window.endOffsetSeconds - window.startOffsetSeconds;
  if (evidence.every((item) => item.timestamp_end_seconds <= windowDurationSeconds)) return evidence;
  throw new Error("gemini_window_timestamp_out_of_range");
}

export function parseYoutubeDuration(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match || !match.slice(1).some(Boolean)) return null;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

export function youtubeWindows(durationSeconds: number): YoutubeWindow[] {
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds <= 0) throw new Error("youtube_duration_invalid");
  const windows: YoutubeWindow[] = [];
  for (let startOffsetSeconds = 0; startOffsetSeconds < durationSeconds; startOffsetSeconds += youtubeWindowSeconds) windows.push({ startOffsetSeconds, endOffsetSeconds: Math.min(startOffsetSeconds + youtubeWindowSeconds, durationSeconds) });
  return windows;
}

export function mergeYoutubeWindowEvidence(windows: Array<{ window: YoutubeWindow; evidence: YoutubeEvidence[] }>) {
  const seen = new Set<string>();
  const windowEvidence = [...windows]
    .sort((left, right) => left.window.startOffsetSeconds - right.window.startOffsetSeconds)
    .map(({ window, evidence }) => evidence
      .map((item) => ({ ...item, timestamp_start_seconds: item.timestamp_start_seconds + window.startOffsetSeconds, timestamp_end_seconds: item.timestamp_end_seconds + window.startOffsetSeconds }))
      .sort((left, right) => evidenceSortKey(left).localeCompare(evidenceSortKey(right)))
      .filter((item) => {
        const key = JSON.stringify([item.category, item.claim_vi, item.evidence_type, item.timestamp_start_seconds, item.timestamp_end_seconds, item.confidence, item.freshness_sensitive, item.evidence_excerpt, item.uncertainty_or_condition]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, retainedYoutubeEvidenceItemsPerWindow),
    )
    .filter((evidence) => evidence.length > 0);
  if (!windowEvidence.length) return [];
  if (windowEvidence.length > maxYoutubeEvidenceItemsPerVideo) {
    return Array.from({ length: maxYoutubeEvidenceItemsPerVideo }, (_, index) => windowEvidence[Math.round(index * (windowEvidence.length - 1) / (maxYoutubeEvidenceItemsPerVideo - 1))][0])
      .sort((left, right) => evidenceSortKey(left).localeCompare(evidenceSortKey(right)));
  }
  const baseQuota = Math.floor(maxYoutubeEvidenceItemsPerVideo / windowEvidence.length);
  const remainder = maxYoutubeEvidenceItemsPerVideo % windowEvidence.length;
  return windowEvidence
    .flatMap((evidence, index) => evidence.slice(0, Math.min(retainedYoutubeEvidenceItemsPerWindow, baseQuota + (index < remainder ? 1 : 0))))
    .sort((left, right) => evidenceSortKey(left).localeCompare(evidenceSortKey(right)));
}

async function requestYoutubeDuration(videoId: string, apiKey: string, fetchImpl = fetch) {
  let response: Response;
  try {
    response = await fetchImpl(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`);
  } catch {
    throw new Error("youtube_data_network_error");
  }
  if (!response.ok) throw new Error(response.status === 403 ? "youtube_data_api_access_required" : `youtube_data_http_${response.status}`);
  const payload = await response.json().catch(() => { throw new Error("youtube_data_invalid_response"); }) as { items?: Array<{ contentDetails?: { duration?: unknown } }> };
  const duration = parseYoutubeDuration(payload.items?.[0]?.contentDetails?.duration);
  if (!duration) throw new Error("youtube_duration_unavailable");
  return duration;
}

export async function requestYoutubeTitle(url: string, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!response.ok) return null;
    const payload = await response.json() as { title?: unknown };
    if (typeof payload.title !== "string") return null;
    const title = payload.title.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
    return title && title.length <= 200 ? title : null;
  } catch {
    return null;
  }
}

export function parseCachedYoutubePayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("cache_invalid_youtube_payload");
  const value = payload as Record<string, unknown>;
  const evidence = parseYoutubeEvidence({ evidence: value.evidence });
  if (!evidence.length) throw new Error("cache_invalid_youtube_payload");
  const metadata = sanitizeYoutubeMetadata((value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata) ? value.metadata : {}) as Record<string, unknown>);
  const durationSeconds = metadata.videoDurationSeconds;
  if (typeof durationSeconds !== "number" || !Number.isSafeInteger(durationSeconds) || durationSeconds <= 0 || evidence.some((item) => item.timestamp_end_seconds > durationSeconds)) throw new Error("cache_invalid_youtube_payload");
  return { evidence, metadata };
}

export function parseCachedYoutubeSegmentPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("cache_invalid_youtube_segment_payload");
  const value = payload as Record<string, unknown>;
  const window = value.window;
  if (!window || typeof window !== "object" || Array.isArray(window)) throw new Error("cache_invalid_youtube_segment_payload");
  const startOffsetSeconds = (window as Record<string, unknown>).startOffsetSeconds;
  const endOffsetSeconds = (window as Record<string, unknown>).endOffsetSeconds;
  if (typeof startOffsetSeconds !== "number" || typeof endOffsetSeconds !== "number" || !Number.isSafeInteger(startOffsetSeconds) || !Number.isSafeInteger(endOffsetSeconds) || startOffsetSeconds < 0 || endOffsetSeconds <= startOffsetSeconds) throw new Error("cache_invalid_youtube_segment_payload");
  const metadata = sanitizeYoutubeMetadata((value.metadata && typeof value.metadata === "object" && !Array.isArray(value.metadata) ? value.metadata : {}) as Record<string, unknown>);
  const evidence = parseYoutubeEvidence({ evidence: value.evidence }, maxYoutubeEvidenceItemsPerWindow);
  if (evidence.some((item) => item.timestamp_end_seconds > endOffsetSeconds - startOffsetSeconds)) throw new Error("cache_invalid_youtube_segment_payload");
  return { evidence, window: { startOffsetSeconds, endOffsetSeconds }, latencyMs: typeof metadata.latencyMs === "number" ? metadata.latencyMs : 0 };
}

function parseArgs(argv: string[]): Options {
  const options: Options = { yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg === "--source-id" || arg === "--limit") {
      const value = argv[++index];
      if (!value || value.startsWith("-")) throw new Error(`${arg} requires a value.`);
      if (arg === "--source-id") options.sourceId = value;
      if (arg === "--limit") { const limit = Number(value); if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error("--limit must be an integer between 1 and 25."); options.limit = limit; }
    } else if (arg === "--help" || arg === "-h") { console.log("Usage: pnpm youtube:capture [--source-id <id> | --limit <1-25>] [--yes]"); process.exit(0); }
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function confirm(sourceId: string, count: number) {
  const rl = createInterface({ input, output });
  try { return (await rl.question(`Save ${count} bounded evidence item(s) for ${sourceId}? [y/N] `)).trim().toLowerCase() === "y"; } finally { rl.close(); }
}

function formatDuration(startedAt: number) {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

export function getYoutubeMediaResolution(value = getEnvValue("GEMINI_YOUTUBE_MEDIA_RESOLUTION")): GeminiMediaResolution {
  if (!value) return defaultMediaResolution;
  if (value === "MEDIA_RESOLUTION_LOW" || value === "MEDIA_RESOLUTION_MEDIUM" || value === "MEDIA_RESOLUTION_HIGH") return value;
  throw new Error("GEMINI_YOUTUBE_MEDIA_RESOLUTION must be MEDIA_RESOLUTION_LOW, MEDIA_RESOLUTION_MEDIUM, or MEDIA_RESOLUTION_HIGH.");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const client = postgres(getDatabaseUrl(), { max: 1 });
  const cacheClient = postgres(getCaptureCacheDatabaseUrl(), { max: 1 });
  const db = drizzle(client, { schema });
  try {
    await assertDistinctCaptureDatabases(client, cacheClient);
    await assertCaptureCacheReady(cacheClient);
    const queued = await listQueuedYoutubeSources(db, options);
    if (!queued.length) { console.log("No queued YouTube sources need evidence."); return; }
    for (const source of queued) {
      const startedAt = Date.now();
      const url = source.canonicalUrl ?? source.url;
      let stage = "setup";
      console.log(`${source.sourceId}: capture started ${url ?? "youtube_url_unavailable"}`);
      if (!url || !/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{6,20}$/.test(url)) { await recordYoutubeCaptureFailure(db, { sourceId: source.sourceId, reason: "youtube_video_url_required" }); console.log(`${source.sourceId}: finished youtube_video_url_required (${formatDuration(startedAt)})`); continue; }
      try {
        stage = "resource_identity";
        const resourceIdentity = youtubeResourceIdentity(url);
        if (!resourceIdentity) throw new Error("youtube_video_url_required");
        stage = "configuration";
        const model = getEnvValue("GEMINI_YOUTUBE_MODEL") ?? "gemini-3.6-flash";
        const mediaResolution = getYoutubeMediaResolution();
        const captureMethodVersion = youtubeCaptureMethodVersion(mediaResolution);
        const reuseKey = captureReuseKey({ provider: "youtube", resourceIdentity, captureMethodVersion, payloadSchemaVersion: YOUTUBE_CAPTURE_PAYLOAD_SCHEMA_VERSION, promptVersion: youtubeEvidencePromptVersion, model, mediaResolution });
        stage = "aggregate_cache_lookup";
        const cached = await findReusableArtifact(cacheClient, reuseKey);
        if (cached) {
          stage = "aggregate_cache_parse";
          const payload = parseCachedYoutubePayload(cached.payload);
          stage = "title_lookup";
          const title = await requestYoutubeTitle(url);
          stage = "cached_import";
          const result = await flushCachedArtifact({ artifact: cached, sourceId: source.sourceId, prepareImport: () => prepareImport(cacheClient, cached.id, source.sourceId), importCommitted: (correlationToken) => findYoutubeCaptureImportByCorrelationToken(db, { sourceId: source.sourceId, correlationToken }), flush: (correlationToken) => saveYoutubeEvidence(db, { sourceId: source.sourceId, evidence: payload.evidence, metadata: { ...payload.metadata, captureMethod: "gemini_youtube_url", capturedAt: cached.capturedAt, sourceUrl: url, model, mediaResolution, promptVersion: youtubeEvidencePromptVersion, evidenceCount: payload.evidence.length, captureOrigin: "cache", captureArtifactId: cached.id, importedAt: new Date().toISOString(), importCorrelationToken: correlationToken, payloadSchemaVersion: YOUTUBE_CAPTURE_PAYLOAD_SCHEMA_VERSION }, title }).then((value) => value.status), finishImport: (correlationToken, leaseOwner, outcome) => finishImport(cacheClient, cached.id, source.sourceId, correlationToken, leaseOwner, outcome) });
          console.log(`${source.sourceId}: finished ${result} (${formatDuration(startedAt)})`);
          continue;
        }
        const videoId = youtubeVideoId(url);
        if (!videoId) throw new Error("youtube_video_url_required");
        stage = "duration_lookup";
        const durationApiKey = getEnvValue("YOUTUBE_DATA_API_KEY") ?? getEnvValue("GEMINI_API_KEY");
        if (!durationApiKey) throw new Error("YOUTUBE_DATA_API_KEY is required to determine YouTube video duration.");
        const durationSeconds = await requestYoutubeDuration(videoId, durationApiKey);
        const segmentCaptureMethodVersion = youtubeCaptureMethodVersion(mediaResolution, "segment");
        const segments: YoutubeSegment[] = [];
        const apiKey = getEnvValue("GEMINI_API_KEY");
        for (const [index, window] of youtubeWindows(durationSeconds).entries()) {
          const segmentResourceIdentity = youtubeWindowResourceIdentity(resourceIdentity, window.startOffsetSeconds, window.endOffsetSeconds);
          const segmentReuseKey = captureReuseKey({ provider: "youtube", resourceIdentity: segmentResourceIdentity, captureMethodVersion: segmentCaptureMethodVersion, payloadSchemaVersion: YOUTUBE_CAPTURE_PAYLOAD_SCHEMA_VERSION, promptVersion: youtubeEvidencePromptVersion, model, mediaResolution });
          stage = `segment_${index + 1}_cache_lookup`;
          const cachedSegment = await findReusableArtifact(cacheClient, segmentReuseKey);
          if (cachedSegment) {
            stage = `segment_${index + 1}_cache_parse`;
            const segment = parseCachedYoutubeSegmentPayload(cachedSegment.payload);
            if (segment.window.startOffsetSeconds === window.startOffsetSeconds && segment.window.endOffsetSeconds === window.endOffsetSeconds) { segments.push(segment); continue; }
          }
          if (!apiKey) throw new Error("GEMINI_API_KEY is required for youtube:capture cache misses.");
          let result;
          stage = `segment_${index + 1}_capture`;
          try { result = await requestYoutubeEvidence(url, apiKey, model, window, mediaResolution); } catch (error) { throw new YoutubeSegmentError(index + 1, error instanceof GeminiRequestError ? error.diagnostic : null, error); }
          const capturedAt = new Date().toISOString();
          await admitArtifact(cacheClient, { provider: "youtube", reuseKey: segmentReuseKey, resourceIdentity: segmentResourceIdentity, captureMethodVersion: segmentCaptureMethodVersion, payloadSchemaVersion: YOUTUBE_CAPTURE_PAYLOAD_SCHEMA_VERSION, promptVersion: youtubeEvidencePromptVersion, model, payload: { evidence: result.evidence, window, metadata: sanitizeYoutubeMetadata({ captureMethod: "gemini_youtube_url", capturedAt, sourceUrl: url, model, mediaResolution, promptVersion: youtubeEvidencePromptVersion, evidenceCount: result.evidence.length, latencyMs: result.latencyMs, promptTokens: result.usage?.promptTokenCount, outputTokens: result.usage?.candidatesTokenCount, totalTokens: result.usage?.totalTokenCount, videoDurationSeconds: durationSeconds, windowStartSeconds: window.startOffsetSeconds, windowEndSeconds: window.endOffsetSeconds }) }, metadata: { captureOrigin: "live" }, capturedAt });
          segments.push({ evidence: result.evidence, window, latencyMs: result.latencyMs });
        }
        const evidence = mergeYoutubeWindowEvidence(segments);
        if (!evidence.length) { await recordYoutubeCaptureFailure(db, { sourceId: source.sourceId, reason: "no_travel_evidence" }); console.log(`${source.sourceId}: finished no_travel_evidence (${formatDuration(startedAt)})`); continue; }
        if (!options.yes && !(await confirm(source.sourceId, evidence.length))) { console.log(`${source.sourceId}: finished skipped (${formatDuration(startedAt)})`); continue; }
        stage = "title_lookup";
        const title = await requestYoutubeTitle(url);
        const capturedAt = new Date().toISOString();
        const latencyMs = segments.reduce((total, segment) => total + segment.latencyMs, 0);
        stage = "aggregate_cache_write";
        const artifact = await admitArtifact(cacheClient, { provider: "youtube", reuseKey, resourceIdentity, captureMethodVersion, payloadSchemaVersion: YOUTUBE_CAPTURE_PAYLOAD_SCHEMA_VERSION, promptVersion: youtubeEvidencePromptVersion, model, payload: { evidence, metadata: sanitizeYoutubeMetadata({ captureMethod: "gemini_youtube_url", capturedAt, sourceUrl: url, model, mediaResolution, promptVersion: youtubeEvidencePromptVersion, evidenceCount: evidence.length, latencyMs, videoDurationSeconds: durationSeconds, windowCount: segments.length }) }, metadata: { captureOrigin: "live" }, capturedAt });
        stage = "production_import";
        const saved = await flushCachedArtifact({ artifact, sourceId: source.sourceId, prepareImport: () => prepareImport(cacheClient, artifact.id, source.sourceId), importCommitted: (correlationToken) => findYoutubeCaptureImportByCorrelationToken(db, { sourceId: source.sourceId, correlationToken }), flush: (correlationToken) => saveYoutubeEvidence(db, { sourceId: source.sourceId, evidence, metadata: { captureMethod: "gemini_youtube_url", capturedAt, sourceUrl: url, model, mediaResolution, promptVersion: youtubeEvidencePromptVersion, evidenceCount: evidence.length, latencyMs, videoDurationSeconds: durationSeconds, windowCount: segments.length, captureOrigin: "live", captureArtifactId: artifact.id, importedAt: new Date().toISOString(), importCorrelationToken: correlationToken, payloadSchemaVersion: YOUTUBE_CAPTURE_PAYLOAD_SCHEMA_VERSION }, title }).then((value) => value.status), finishImport: (correlationToken, leaseOwner, outcome) => finishImport(cacheClient, artifact.id, source.sourceId, correlationToken, leaseOwner, outcome) });
        console.log(`${source.sourceId}: finished ${saved} (${formatDuration(startedAt)})`);
      } catch (error) {
        const reason = error instanceof YoutubeSegmentError ? error.message : captureFailureReason(error, stage);
        await recordYoutubeCaptureFailure(db, { sourceId: source.sourceId, reason });
        console.log(`${source.sourceId}: finished ${reason.replace(/[^a-z0-9_.:-]+/gi, "_").slice(0, 120)} (${formatDuration(startedAt)})`);
        if (error instanceof GeminiRequestError && error.diagnostic) console.error(`${source.sourceId}: Gemini diagnostic status: ${error.diagnostic}`);
        if (error instanceof YoutubeSegmentError && error.diagnostic) console.error(`${source.sourceId}: Gemini diagnostic status: ${error.diagnostic}`);
      }
    }
  } finally { await client.end(); await cacheClient.end(); }
}

function evidenceSortKey(item: YoutubeEvidence) {
  return [item.timestamp_start_seconds.toString().padStart(10, "0"), item.timestamp_end_seconds.toString().padStart(10, "0"), item.category, item.claim_vi, item.evidence_type, item.evidence_excerpt].join("|");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exit(1); });

async function readGeminiErrorDiagnostic(response: Response) {
  const payload = await response.json().catch(() => null) as { error?: { status?: unknown; message?: unknown } } | null;
  const status = typeof payload?.error?.status === "string" ? payload.error.status : null;
  return status && new Set(["INVALID_ARGUMENT", "FAILED_PRECONDITION", "OUT_OF_RANGE", "RESOURCE_EXHAUSTED", "UNAUTHENTICATED", "PERMISSION_DENIED", "NOT_FOUND", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED"]).has(status) ? status : null;
}

function isRetryableGeminiError(error: GeminiRequestError) {
  return /^(?:gemini_http_(?:429|500|502|503|504))$/.test(error.message) || error.diagnostic === "UNAVAILABLE" || error.diagnostic === "INTERNAL" || error.diagnostic === "DEADLINE_EXCEEDED";
}

export function captureFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const safeCodes = [
    /^gemini_http_\d+$/,
    /^gemini_(?:timeout|network_error|empty_response|invalid_json|evidence_limit_exceeded|invalid_evidence_item_\d+_[a-z_]+|window_timestamp_out_of_range)$/,
    /^youtube_(?:video_url_required|duration_invalid|duration_unavailable|data_http_\d+|data_api_access_required|data_network_error|data_invalid_response)$/,
    /^(?:GEMINI_API_KEY|YOUTUBE_DATA_API_KEY|GEMINI_YOUTUBE_MEDIA_RESOLUTION) is required/,
    /^(?:capture_(?:artifact_payload_too_large|failed|import_(?:prepare|commit_check|finish)_failed|import_flush_(?:validation_failed|metadata_failed|evidence_failed|source_failed|ingestion_job_failed|timeout|postgres_[0-9a-z]{5}|failed))|production_flush_ambiguous)$/,
  ];
  if (safeCodes.some((pattern) => pattern.test(message))) return message.startsWith("GEMINI_") || message.startsWith("YOUTUBE_") ? "capture_configuration_error" : message;
  return "capture_failed";
}

export function captureFailureReason(error: unknown, stage: string) {
  const code = captureFailureCode(error);
  return code === "capture_failed" ? `youtube_${stage}_failed` : code;
}
