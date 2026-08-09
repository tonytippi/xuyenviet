import { describe, expect, test } from "vitest";
import { normalizeIntakeUrl } from "@xuyenviet/database";

describe("admin knowledge intake URL normalization", () => {
  test("canonicalizes safe URLs and classifies capture sources", () => {
    expect(normalizeIntakeUrl("https://www.youtube.com/watch?t=8s&v=abcDEF12345&utm_source=feed")).toEqual({ url: "https://www.youtube.com/watch?v=abcDEF12345", hostname: "www.youtube.com", kind: "youtube" });
    expect(normalizeIntakeUrl("https://m.facebook.com/example/posts/123?fbclid=tracking")).toEqual({ url: "https://m.facebook.com/example/posts/123", hostname: "m.facebook.com", kind: "facebook" });
    expect(normalizeIntakeUrl("https://example.com/guide/?b=2&a=1")).toEqual({ url: "https://example.com/guide?a=1&b=2", hostname: "example.com", kind: "url" });
  });

  test("rejects non-HTTPS, credentialed, and secret-bearing URLs", () => {
    expect(normalizeIntakeUrl("http://example.com")).toBeNull();
    expect(normalizeIntakeUrl("https://user:password@example.com")).toBeNull();
    expect(normalizeIntakeUrl("https://example.com/?token=secret")).toBeNull();
    expect(normalizeIntakeUrl("https://www.youtube.com/channel/channel-id")).toBeNull();
  });
});
