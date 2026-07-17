import { describe, expect, test } from "vitest";

import { chooseFacebookCaptureText, detectFacebookCaptureStopReason, getFacebookCaptureDelayMs } from "../scripts/facebook-capture";

describe("Facebook visible-DOM capture", () => {
  test("selects bounded visible DOM text without a network candidate path", () => {
    expect(chooseFacebookCaptureText({
      innerText: "Hôm nay mình  ẽ chia  ẻ tiếp về phố cổ Hội An.",
      textContent: "Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An.",
    })).toMatchObject({ source: "textContent", text: "Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An." });
  });

  test("does not select a much larger hidden text value", () => {
    const visible = "Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An.";
    expect(chooseFacebookCaptureText({ innerText: visible, textContent: `${visible} ${"Hidden menu. ".repeat(20)}` })).toMatchObject({ source: "innerText", text: visible });
  });

  test("keeps pacing and safety stops", () => {
    expect(getFacebookCaptureDelayMs({ delayMinMs: 12_000, delayMaxMs: 25_000 }, () => 0.999999)).toBe(25_000);
    expect(detectFacebookCaptureStopReason({ url: "https://www.facebook.com/login", bodyText: "" })).toBe("facebook_login_or_checkpoint");
    expect(detectFacebookCaptureStopReason({ url: "https://www.facebook.com/groups/example", bodyText: "A normal post." })).toBeNull();
  });
});
