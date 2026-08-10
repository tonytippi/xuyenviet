import { canonicalizeYoutubeVideoUrl } from "@xuyenviet/domain";

export const youtubeCommentSignalValues = ["recent_discussion", "stale_or_changed_warning", "practical_question_demand", "creator_responsiveness", "commercial_risk", "contradictory_discussion"] as const;
export type YoutubeCommentSignal = (typeof youtubeCommentSignalValues)[number];
export type YoutubeEnrichment = Readonly<{ videoId: string; title?: string; description?: string; channelId?: string; channelName?: string; publishedAt?: Date; durationSeconds?: number; categoryId?: string; tags?: string[]; viewCount?: number; likeCount?: number; commentCount?: number; channelSubscriberCount?: number; thumbnailUrl?: string; signals: ReadonlyArray<{ signal: YoutubeCommentSignal; count: number; score: number }> }>;

const apiRoot = "https://www.googleapis.com/youtube/v3";
const commentPageSize = 20;
const maxResponseBytes = 64 * 1024;

export async function enrichYoutubeVideo(videoId: string, apiKey: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal, beforeRequest?: () => Promise<void>): Promise<YoutubeEnrichment> {
  if (!apiKey.trim() || !canonicalizeYoutubeVideoUrl(`https://www.youtube.com/watch?v=${videoId}`)) throw new Error("youtube_enrichment_configuration");
  const videoPayload = await request("videos", { part: "snippet,contentDetails,statistics", id: videoId, key: apiKey }, fetchImpl, signal, beforeRequest);
  const video = firstItem(videoPayload);
  const id = string(video.id);
  if (id !== videoId) throw new Error("youtube_enrichment_transient");
  const snippet = object(video.snippet);
  const channelId = optionalId(snippet?.channelId);
  if (!snippet || !channelId) throw new Error("youtube_enrichment_transient");
  const channelPayload = await request("channels", { part: "snippet,statistics", id: channelId, key: apiKey }, fetchImpl, signal, beforeRequest);
  const channel = firstItem(channelPayload);
  if (string(channel.id) !== channelId) throw new Error("youtube_enrichment_transient");
  const commentPayload = await requestComments(videoId, apiKey, fetchImpl, signal, beforeRequest);
  return {
    videoId,
    title: safeText(snippet.title, 200), description: safeText(snippet.description, 1000), channelId,
    channelName: safeText(snippet.channelTitle, 160), publishedAt: date(snippet.publishedAt),
    durationSeconds: duration(object(video.contentDetails)?.duration), categoryId: optionalCategory(snippet.categoryId),
    tags: safeTags(snippet.tags), ...statistics(object(video.statistics)), channelSubscriberCount: nonNegativeInteger(object(channel.statistics)?.subscriberCount),
    thumbnailUrl: thumbnail(object(snippet.thumbnails)), signals: deriveYoutubeCommentSignals(commentPayload),
  };
}

async function request(endpoint: string, params: Record<string, string>, fetchImpl: typeof fetch, signal?: AbortSignal, beforeRequest?: () => Promise<void>): Promise<Record<string, unknown>> {
  await beforeRequest?.();
  const url = new URL(`${apiRoot}/${endpoint}`); url.search = new URLSearchParams(params).toString();
  let response: Response;
  try { response = await fetchImpl(url, { signal }); } catch { throw new Error("youtube_enrichment_transient"); }
  if (!response.ok) throw new Error("youtube_enrichment_transient");
  const payload = await readBoundedJson(response);
  const result = object(payload); if (!result) throw new Error("youtube_enrichment_transient"); return result;
}

async function requestComments(videoId: string, apiKey: string, fetchImpl: typeof fetch, signal?: AbortSignal, beforeRequest?: () => Promise<void>): Promise<Record<string, unknown>> {
  await beforeRequest?.();
  const url = new URL(`${apiRoot}/commentThreads`); url.search = new URLSearchParams({ part: "snippet", videoId, textFormat: "plainText", maxResults: String(commentPageSize), key: apiKey }).toString();
  let response: Response;
  try { response = await fetchImpl(url, { signal }); } catch { throw new Error("youtube_enrichment_transient"); }
  if (!response.ok) {
    const payload = await readBoundedJson(response).catch(() => null);
    const errorsValue = object(object(payload)?.error)?.errors;
    const errors: unknown[] = Array.isArray(errorsValue) ? errorsValue : [];
    if (errors.some((entry) => object(entry)?.reason === "commentsDisabled")) return { items: [] };
    throw new Error("youtube_enrichment_transient");
  }
  const payload = await readBoundedJson(response);
  const result = object(payload); if (!result || !Array.isArray(result.items)) throw new Error("youtube_enrichment_transient"); return result;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxResponseBytes)) throw new Error("youtube_enrichment_transient");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("youtube_enrichment_transient");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxResponseBytes) throw new Error("youtube_enrichment_transient");
      chunks.push(value);
    }
  } catch { throw new Error("youtube_enrichment_transient"); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new Error("youtube_enrichment_transient"); }
}

export function deriveYoutubeCommentSignals(payload: Record<string, unknown>): YoutubeEnrichment["signals"] {
  const counts = new Map<YoutubeCommentSignal, number>();
  const items = Array.isArray(payload.items) ? payload.items.slice(0, commentPageSize) : [];
  for (const item of items) {
    const thread = object(item);
    const topLevelComment = object(object(thread?.snippet)?.topLevelComment);
    const text = sanitizeComment(string(object(topLevelComment?.snippet)?.textDisplay));
    if (!text) continue;
    const lower = text.toLocaleLowerCase("en-US");
    const add = (value: YoutubeCommentSignal, condition: boolean) => { if (condition) counts.set(value, (counts.get(value) ?? 0) + 1); };
    add("recent_discussion", /mới|recent|today|hôm nay/.test(lower)); add("stale_or_changed_warning", /cũ|đổi|changed|closed|outdated/.test(lower));
    add("practical_question_demand", /\?|how|where|giá|price|đường|route/.test(lower)); add("creator_responsiveness", /cảm ơn|thanks|trả lời|reply/.test(lower));
    add("commercial_risk", /quảng cáo|sponsor|affiliate|mua ngay|discount/.test(lower)); add("contradictory_discussion", /không đúng|sai|not true|different/.test(lower));
  }
  return youtubeCommentSignalValues.flatMap((signal) => { const count = counts.get(signal) ?? 0; return count ? [{ signal, count, score: Math.min(100, count * 10) }] : []; });
}

function sanitizeComment(value: string | undefined) { if (!value) return null; const text = value.slice(0, 1024).normalize("NFKC").replace(/[\x00-\x1F\x7F]/g, " ").replace(/https?:\/\/\S+|www\.\S+/gi, " ").replace(/<[^>]*>|```[\s\S]*?```/g, " ").replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\+?\d[\d .()-]{7,}\d/g, " ").replace(/ignore (previous|all)|system prompt|instruction:/gi, " ").replace(/\s+/g, " ").trim().slice(0, 280); return text || null; }
function object(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function string(value: unknown) { return typeof value === "string" ? value : undefined; }
function firstItem(payload: Record<string, unknown>) { const item = Array.isArray(payload.items) ? object(payload.items[0]) : null; if (!item) throw new Error("youtube_enrichment_transient"); return item; }
function safeText(value: unknown, maximum: number) { const text = string(value)?.trim(); return text && text.length <= maximum && !/[\x00-\x1F\x7F]/.test(text) ? text : undefined; }
function optionalId(value: unknown) { const id = string(value); return id && /^[A-Za-z0-9_-]{6,64}$/.test(id) ? id : undefined; }
function optionalCategory(value: unknown) { const id = string(value); return id && /^\d{1,8}$/.test(id) ? id : undefined; }
function nonNegativeInteger(value: unknown) { const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : typeof value === "number" ? value : NaN; return Number.isSafeInteger(number) && number >= 0 && number <= 2147483647 ? number : undefined; }
function statistics(value: Record<string, unknown> | null) { return { viewCount: nonNegativeInteger(value?.viewCount), likeCount: nonNegativeInteger(value?.likeCount), commentCount: nonNegativeInteger(value?.commentCount) }; }
function date(value: unknown) { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return undefined; const parsed = new Date(value); const expected = value.includes(".") ? value : `${value.slice(0, -1)}.000Z`; return parsed.toISOString() === expected ? parsed : undefined; }
function duration(value: unknown) { const match = typeof value === "string" ? /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value) : null; if (!match) return undefined; const seconds = (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0); return Number.isSafeInteger(seconds) && seconds <= 86400 ? seconds : undefined; }
function safeTags(value: unknown) { return Array.isArray(value) ? value.slice(0, 20).flatMap((tag) => { const text = safeText(tag, 80); return text ? [text] : []; }) : undefined; }
function thumbnail(value: Record<string, unknown> | null) { const url = string(object(value?.medium)?.url) ?? string(object(value?.default)?.url); return url && !/[\x00-\x1F\x7F]/.test(url) && /^https:\/\/(i\.ytimg\.com|img\.youtube\.com)\/[^\s]{1,500}$/.test(url) ? url : undefined; }
