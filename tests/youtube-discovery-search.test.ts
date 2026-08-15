import { describe, expect, test } from "vitest";
import { searchYoutubeVideos } from "../packages/worker-domain/src/features/youtube-discovery/youtube-search";

describe("YouTube Discovery search adapter", () => {
  test("uses fixed parameters for medium then long and retains only unique valid video ids", async () => {
    const requestUrls: string[] = [];
    const result = await searchYoutubeVideos("Da Lat route", "secret", async (input) => {
      requestUrls.push(String(input));
      return new Response(JSON.stringify({ items: [{ id: { kind: "youtube#video", videoId: "abcDEF12345" } }, { id: { kind: "youtube#video", videoId: "abcDEF12345" } }, { id: { kind: "youtube#channel", videoId: "ignored" } }, { id: { kind: "youtube#video", videoId: "bad" } }] }));
    });
    expect(requestUrls.map((requestUrl) => new URL(requestUrl).searchParams.get("videoDuration"))).toEqual(["medium", "long"]);
    for (const requestUrl of requestUrls) expect(Object.fromEntries(new URL(requestUrl).searchParams)).toMatchObject({ part: "snippet", type: "video", maxResults: "25", regionCode: "VN", relevanceLanguage: "vi", safeSearch: "strict", q: "Da Lat route", key: "secret" });
    expect(result).toEqual([{ videoId: "abcDEF12345", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", resultOrdinal: 0, searchTranche: "medium" }]);
  });

  test("classifies malformed provider responses safely", async () => {
    await expect(searchYoutubeVideos("Da Lat", "secret", async () => new Response("{}"))).rejects.toThrow("youtube_search_transient");
    await expect(searchYoutubeVideos("Da Lat", "secret", async () => new Response("{", { headers: { "content-length": "65537" } }))).rejects.toThrow("youtube_search_transient");
    await expect(searchYoutubeVideos("Da Lat", "", async () => new Response("{}"))).rejects.toThrow("youtube_search_configuration");
  });

  test("bounds valid results to the fixed request limit", async () => {
    let calls = 0;
    const result = await searchYoutubeVideos("Da Lat", "secret", async () => {
      const items = Array.from({ length: 26 }, (_, index) => ({ id: { kind: "youtube#video", videoId: `${calls === 0 ? "medium" : "longxx"}${String(index).padStart(6, "0")}` } }));
      calls += 1;
      return new Response(JSON.stringify({ items }));
    });

    expect(result).toHaveLength(50);
    expect(result.at(-1)).toMatchObject({ resultOrdinal: 49, searchTranche: "long" });
  });

  test("keeps medium for a cross-tranche duplicate and retains the independent long result", async () => {
    let calls = 0;
    const result = await searchYoutubeVideos("Da Lat", "secret", async () => new Response(JSON.stringify({ items: calls++ === 0 ? [{ id: { kind: "youtube#video", videoId: "abcDEF12345" } }] : [{ id: { kind: "youtube#video", videoId: "abcDEF12345" } }, { id: { kind: "youtube#video", videoId: "defGHI67890" } }] })));
    expect(result).toEqual([
      { videoId: "abcDEF12345", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345", resultOrdinal: 0, searchTranche: "medium" },
      { videoId: "defGHI67890", canonicalUrl: "https://www.youtube.com/watch?v=defGHI67890", resultOrdinal: 1, searchTranche: "long" },
    ]);
  });

  test("rejects the whole search when long fails after medium succeeds", async () => {
    let calls = 0;
    await expect(searchYoutubeVideos("Da Lat", "secret", async () => calls++ === 0 ? new Response(JSON.stringify({ items: [{ id: { kind: "youtube#video", videoId: "abcDEF12345" } }] })) : new Response("{}", { status: 500 }))).rejects.toThrow("youtube_search_transient");
  });

  test("rechecks the active execution before each provider tranche", async () => {
    const calls: string[] = [];
    let guards = 0;
    await expect(searchYoutubeVideos("Da Lat", "secret", async (input) => { calls.push(new URL(String(input)).searchParams.get("videoDuration")!); return new Response(JSON.stringify({ items: [] })); }, undefined, async () => { guards += 1; if (guards === 2) throw new Error("policy_revoked"); })).rejects.toThrow("policy_revoked");
    expect(calls).toEqual(["medium"]);
    expect(guards).toBe(2);
  });
});
