import { describe, expect, test } from "vitest";

import { getYoutubeDiscoveryRetryDelayMinutes, isYoutubeDiscoveryRetryExhausted } from "../packages/database/src/youtube-discovery/retry-policy";

describe("YouTube Discovery retry policy", () => {
  test("uses bounded exponential retry delays", () => {
    expect(getYoutubeDiscoveryRetryDelayMinutes(15, 1)).toBe(15);
    expect(getYoutubeDiscoveryRetryDelayMinutes(15, 2)).toBe(30);
    expect(getYoutubeDiscoveryRetryDelayMinutes(15, 3)).toBe(60);
    expect(getYoutubeDiscoveryRetryDelayMinutes(1_000, 2)).toBe(1_440);
    expect(getYoutubeDiscoveryRetryDelayMinutes(1_440, 11)).toBe(1_440);
  });

  test("exhausts only after the permitted retry attempts", () => {
    expect(isYoutubeDiscoveryRetryExhausted(1, 0)).toBe(true);
    expect(isYoutubeDiscoveryRetryExhausted(1, 1)).toBe(false);
    expect(isYoutubeDiscoveryRetryExhausted(2, 1)).toBe(true);
    expect(isYoutubeDiscoveryRetryExhausted(4, 3)).toBe(true);
  });
});
