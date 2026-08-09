import { describe, expect, test } from "vitest";
import { canonicalizeYoutubeVideoUrl } from "@xuyenviet/domain";
import { normalizeIntakeUrl } from "@xuyenviet/database";

describe("canonical YouTube video URLs", () => {
  test("normalizes only documented video forms across the Knowledge intake boundary", () => {
    const expected = { videoId: "abcDEF12345", canonicalUrl: "https://www.youtube.com/watch?v=abcDEF12345" };
    expect(canonicalizeYoutubeVideoUrl("https://youtu.be/abcDEF12345?utm_source=x")).toEqual(expected);
    expect(canonicalizeYoutubeVideoUrl("https://WWW.YouTube.com/watch?v=abcDEF12345&t=8")).toEqual(expected);
    expect(normalizeIntakeUrl("https://youtu.be/abcDEF12345?utm_source=x")).toEqual({ url: expected.canonicalUrl, hostname: "www.youtube.com", kind: "youtube" });
  });

  test.each(["http://youtu.be/abcDEF12345", "https://user:pass@youtu.be/abcDEF12345", "https://youtu.be:443/abcDEF12345", "https://youtu.be/abcDEF12345#x", "https://youtube.com/watch?v=abcDEF12345&v=other123", "https://youtube.com/shorts/abcDEF12345", "https://youtu.be/abcDEF12345/extra", "https://example.com/watch?v=abcDEF12345", "https://youtu.be/abcDEF12345%", "https://youtu.be/abcDEF12345?x=%", "https://youtu.be/abc%2DEF12345"]) ("rejects unsafe or unsupported form %s", (url) => {
    expect(canonicalizeYoutubeVideoUrl(url)).toBeNull();
  });
});
