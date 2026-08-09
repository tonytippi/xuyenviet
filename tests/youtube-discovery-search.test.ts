import { describe, expect, test } from "vitest";
import { searchYoutubeVideos } from "../packages/worker-domain/src/features/youtube-discovery/youtube-search";

describe("YouTube Discovery search adapter", () => {
  test("uses fixed parameters and retains only unique valid video ids", async () => {
    let requestUrl = "";
    const result = await searchYoutubeVideos("Da Lat route", "secret", async (input) => {
      requestUrl = String(input);
      return new Response(JSON.stringify({ items: [{ id: { kind: "youtube#video", videoId: "abcDEF12345" } }, { id: { kind: "youtube#video", videoId: "abcDEF12345" } }, { id: { kind: "youtube#channel", videoId: "ignored" } }, { id: { kind: "youtube#video", videoId: "bad" } }] }));
    });
    const url = new URL(requestUrl);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ part: "snippet", type: "video", maxResults: "25", regionCode: "VN", relevanceLanguage: "vi", safeSearch: "strict", q: "Da Lat route", key: "secret" });
    expect(result).toEqual([{ videoId: "abcDEF12345", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", resultOrdinal: 0 }]);
  });

  test("classifies malformed provider responses safely", async () => {
    await expect(searchYoutubeVideos("Da Lat", "secret", async () => new Response("{}"))).rejects.toThrow("youtube_search_transient");
    await expect(searchYoutubeVideos("Da Lat", "", async () => new Response("{}"))).rejects.toThrow("youtube_search_configuration");
  });
});
