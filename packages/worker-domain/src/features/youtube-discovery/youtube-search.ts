import { canonicalizeYoutubeVideoUrl } from "@xuyenviet/domain";

export type YoutubeSearchResult = Readonly<{ videoId: string; canonicalUrl: string; resultOrdinal: number }>;
const endpoint = "https://www.googleapis.com/youtube/v3/search";

export async function searchYoutubeVideos(queryText: string, apiKey: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<YoutubeSearchResult[]> {
  if (!apiKey.trim()) throw new Error("youtube_search_configuration");
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ part: "snippet", type: "video", maxResults: "25", regionCode: "VN", relevanceLanguage: "vi", safeSearch: "strict", q: queryText, key: apiKey }).toString();
  let response: Response;
  try { response = await fetchImpl(url, { signal }); } catch { throw new Error("youtube_search_transient"); }
  if (!response.ok) throw new Error("youtube_search_transient");
  const payload: unknown = await response.json().catch(() => { throw new Error("youtube_search_transient"); });
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { items?: unknown }).items)) throw new Error("youtube_search_transient");
  const seen = new Set<string>();
  const results: YoutubeSearchResult[] = [];
  for (const item of (payload as { items: unknown[] }).items) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (!id || typeof id !== "object" || (id as { kind?: unknown }).kind !== "youtube#video" || typeof (id as { videoId?: unknown }).videoId !== "string") continue;
    const video = canonicalizeYoutubeVideoUrl(`https://www.youtube.com/watch?v=${(id as { videoId: string }).videoId}`);
    if (!video || seen.has(video.videoId)) continue;
    seen.add(video.videoId);
    results.push({ ...video, resultOrdinal: results.length });
  }
  return results;
}
