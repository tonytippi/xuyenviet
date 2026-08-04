import { describe, expect, test } from "vitest";

import { getApiReturnUrl } from "../apps/web/src/features/auth/redirects";

describe("traveler OAuth redirect", () => {
  test("sends the API an allowlist-compatible absolute traveler return URL", () => {
    expect(getApiReturnUrl("http://localhost:3000", "/ai-ask")).toBe("http://localhost:3000/ai-ask");
    expect(getApiReturnUrl("https://web.xuyenviet.vn", "/ai-ask?ref=ROAD-2026")).toBe("https://web.xuyenviet.vn/ai-ask?ref=ROAD-2026");
  });
});
