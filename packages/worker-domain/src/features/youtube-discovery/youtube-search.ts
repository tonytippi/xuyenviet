import { canonicalizeYoutubeVideoUrl } from "@xuyenviet/domain";

export type YoutubeSearchResult = Readonly<{ videoId: string; canonicalUrl: string; resultOrdinal: number; searchTranche: "medium" | "long" }>;
const endpoint = "https://www.googleapis.com/youtube/v3/search";
const maxResults = 25;
const maxResponseBytes = 64 * 1024;

export async function searchYoutubeVideos(queryText: string, apiKey: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<YoutubeSearchResult[]> {
  if (!apiKey.trim()) throw new Error("youtube_search_configuration");
  const medium = await searchTranche(queryText, apiKey, "medium", fetchImpl, signal);
  const long = await searchTranche(queryText, apiKey, "long", fetchImpl, signal);
  const seen = new Set<string>();
  const results: Array<YoutubeSearchResult & { searchTranche: "medium" | "long" }> = [];
  for (const result of [...medium, ...long]) {
    if (seen.has(result.videoId)) continue;
    seen.add(result.videoId);
    results.push({ ...result, resultOrdinal: results.length });
  }
  return results;
}

async function searchTranche(queryText: string, apiKey: string, searchTranche: "medium" | "long", fetchImpl: typeof fetch, signal?: AbortSignal): Promise<Array<YoutubeSearchResult & { searchTranche: "medium" | "long" }>> {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ part: "snippet", type: "video", maxResults: String(maxResults), regionCode: "VN", relevanceLanguage: "vi", safeSearch: "strict", videoDuration: searchTranche, q: queryText, key: apiKey }).toString();
  let response: Response;
  try { response = await fetchImpl(url, { signal }); } catch { throw new Error("youtube_search_transient"); }
  if (!response.ok) throw new Error("youtube_search_transient");
  const payload = await readBoundedJson(response);
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { items?: unknown }).items)) throw new Error("youtube_search_transient");
  const seen = new Set<string>();
  const results: Array<YoutubeSearchResult & { searchTranche: "medium" | "long" }> = [];
  for (const item of (payload as { items: unknown[] }).items) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (!id || typeof id !== "object" || (id as { kind?: unknown }).kind !== "youtube#video" || typeof (id as { videoId?: unknown }).videoId !== "string") continue;
    const video = canonicalizeYoutubeVideoUrl(`https://www.youtube.com/watch?v=${(id as { videoId: string }).videoId}`);
    if (!video || seen.has(video.videoId)) continue;
    seen.add(video.videoId);
    results.push({ ...video, resultOrdinal: results.length, searchTranche });
    if (results.length === maxResults) break;
  }
  return results;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxResponseBytes)) throw new Error("youtube_search_transient");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("youtube_search_transient");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxResponseBytes) throw new Error("youtube_search_transient");
      chunks.push(value);
    }
  } catch { throw new Error("youtube_search_transient"); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new Error("youtube_search_transient"); }
}
