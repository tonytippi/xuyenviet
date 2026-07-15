import { describe, expect, test } from "vitest";

import { chooseBestFacebookCaptureText, chooseFacebookCaptureText, detectFacebookCaptureStopReason, extractFacebookGraphqlText, getFacebookCaptureDelayMs } from "../scripts/facebook-capture";

describe("Facebook capture script text selection", () => {
  test("prefers textContent when innerText drops bounded visible characters", () => {
    const selected = chooseFacebookCaptureText({
      innerText: "Hôm nay mình  ẽ chia  ẻ tiếp về phố cổ Hội An và  ông Hoài.",
      textContent: "Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An và sông Hoài.",
    });

    expect(selected).toMatchObject({
      source: "textContent",
      text: "Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An và sông Hoài.",
    });
  });

  test("keeps innerText when textContent is much larger hidden payload", () => {
    const visible = "Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An.";
    const selected = chooseFacebookCaptureText({
      innerText: visible,
      textContent: `${visible} ${"Hidden Facebook menu text. ".repeat(20)}`,
    });

    expect(selected).toMatchObject({ source: "innerText", text: visible });
  });

  test("prefers rendered text when CSS generated content repairs visible text", () => {
    const selected = chooseFacebookCaptureText({
      innerText: "Hôm nay mình  ẽ chia  ẻ tiếp về phố cổ Hội An và  ông Hoài.",
      textContent: "Hôm nay mình  ẽ chia  ẻ tiếp về phố cổ Hội An và  ông Hoài.",
      renderedText: "Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An và sông Hoài.",
    });

    expect(selected).toMatchObject({
      source: "renderedText",
      text: "Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An và sông Hoài.",
    });
  });

  test("prefers serialized HTML text when DOM rendered text is corrupted", () => {
    const selected = chooseFacebookCaptureText({
      innerText: "Hôm nay mình  ẽ chia  ẻ tiếp về phố cổ Hội An và  ông Hoài.",
      textContent: "Hôm nay mình  ẽ chia  ẻ tiếp về phố cổ Hội An và  ông Hoài.",
      renderedText: "Hôm nay mình  ẽ chia  ẻ tiếp về phố cổ Hội An và  ông Hoài.",
      htmlText: "Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An và sông Hoài.",
    });

    expect(selected).toMatchObject({
      source: "htmlText",
      text: "Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An và sông Hoài.",
    });
  });

  test("extracts post message text from Facebook GraphQL payloads", () => {
    const candidate = extractFacebookGraphqlText([
      JSON.stringify({
        data: {
          node: {
            post_id: "1923116328493210",
            comet_sections: {
              content: {
                story: {
                  message: {
                    text: "HELLO!\nHôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An.",
                  },
                  actors: [{ name: "Cộng đồng Xuyên Việt" }],
                },
              },
              context_layout: {
                story: {
                  creation_time: 1_720_000_000,
                },
              },
            },
          },
        },
      }),
    ], { finalUrl: "https://www.facebook.com/groups/1689835535154625/permalink/1923116328493210/" });

    expect(candidate).toMatchObject({
      postId: "1923116328493210",
      text: "HELLO! Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An.",
      authorText: "Cộng đồng Xuyên Việt",
      postCreatedAt: "2024-07-03T09:46:40.000Z",
    });
  });

  test("does not use GraphQL provenance from a different post", () => {
    const candidate = extractFacebookGraphqlText([
      JSON.stringify({
        data: {
          node: {
            post_id: "1931367831001394",
            message: { text: "Long unrelated post." },
            actors: [{ name: "Unrelated author" }],
            creation_time: 1_720_000_000,
          },
        },
      }),
    ], { finalUrl: "https://www.facebook.com/groups/1689835535154625/permalink/1915940462544130/" });

    expect(candidate).toMatchObject({
      postId: "1931367831001394",
      authorText: null,
      postCreatedAt: null,
    });
  });

  test("retains exact metadata when Facebook sends it separately from message text", () => {
    const candidate = extractFacebookGraphqlText([
      "for (;;);" + JSON.stringify({
        data: {
          node: {
            post_id: "1915940462544130",
            actors: [{ name: "Tác giả bài viết" }],
            comet_sections: { context_layout: { story: { creation_time: 1_720_000_000 } } },
          },
        },
      }),
    ], { finalUrl: "https://www.facebook.com/groups/1689835535154625/permalink/1915940462544130/?rdid=tracking" });

    expect(candidate).toMatchObject({
      postId: "1915940462544130",
      text: "",
      authorText: "Tác giả bài viết",
      postCreatedAt: "2024-07-03T09:46:40.000Z",
    });
  });

  test("matches modern Comet story and legacy post identifiers", () => {
    const targetPostId = "1931367831001393";
    const candidate = extractFacebookGraphqlText([
      JSON.stringify({
        data: {
          node: {
            id: Buffer.from(`Story:${targetPostId}:1689835535154625`).toString("base64"),
            actors: [{ name: "Tác giả Comet" }],
            creation_time: 1_720_000_000,
          },
        },
      }),
    ], { finalUrl: `https://www.facebook.com/groups/1689835535154625/permalink/${targetPostId}/` });

    expect(candidate).toMatchObject({
      postId: targetPostId,
      authorText: "Tác giả Comet",
      postCreatedAt: "2024-07-03T09:46:40.000Z",
    });
  });

  test("matches a Comet record through its explicit permalink when its ID is not a post ID", () => {
    const targetPostId = "1931367831001393";
    const candidate = extractFacebookGraphqlText([
      JSON.stringify({
        data: {
          node: {
            id: "61592037051438",
            permalink_url: `https://www.facebook.com/groups/1689835535154625/permalink/${targetPostId}/`,
            actors: [{ name: "Tác giả từ permalink" }],
            comet_sections: { timestamp: { story: { creation_time: 1_720_000_000 } } },
          },
        },
      }),
    ], { finalUrl: `https://www.facebook.com/groups/1689835535154625/permalink/${targetPostId}/` });

    expect(candidate).toMatchObject({
      postId: targetPostId,
      authorText: "Tác giả từ permalink",
      postCreatedAt: "2024-07-03T09:46:40.000Z",
    });
  });

  test("prefers plausible GraphQL text over corrupted DOM text", () => {
    const selected = chooseBestFacebookCaptureText({
      domText: "HELLO! Hôm nay mình  ẽ chia  ẻ tiếp về phố cổ Hội An.",
      graphqlText: "HELLO! Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An.",
    });

    expect(selected).toMatchObject({
      source: "graphql",
      text: "HELLO! Hôm nay mình sẽ chia sẻ tiếp về phố cổ Hội An.",
    });
  });

});

describe("Facebook capture pacing and safety stops", () => {
  test("chooses an inclusive randomized delay within the configured bounds", () => {
    expect(getFacebookCaptureDelayMs({ delayMinMs: 12_000, delayMaxMs: 25_000 }, () => 0)).toBe(12_000);
    expect(getFacebookCaptureDelayMs({ delayMinMs: 12_000, delayMaxMs: 25_000 }, () => 0.999999)).toBe(25_000);
  });

  test.each([
    ["https://www.facebook.com/login/?next=/groups/example", "", "facebook_login_or_checkpoint"],
    ["https://www.facebook.com/checkpoint/", "", "facebook_login_or_checkpoint"],
    ["https://www.facebook.com/groups/example", "We limit how often you can post, comment or do other things in a given amount of time.", "facebook_rate_limited_or_blocked"],
    ["https://www.facebook.com/groups/example", "You are temporarily blocked from using this feature.", "facebook_rate_limited_or_blocked"],
    ["https://www.facebook.com/groups/example", "Bạn hiện không thể sử dụng tính năng này vì bị tạm thời chặn.", "facebook_rate_limited_or_blocked"],
    ["https://www.facebook.com/groups/example", "Confirm your identity to continue.", "facebook_security_check"],
    ["https://www.facebook.com/groups/example", "Xác nhận danh tính vì chúng tôi phát hiện hoạt động bất thường.", "facebook_security_check"],
  ])("stops capture for %s", (url, bodyText, expected) => {
    expect(detectFacebookCaptureStopReason({ url, bodyText })).toBe(expected);
  });

  test("continues when the page has no known interruption signal", () => {
    expect(detectFacebookCaptureStopReason({
      url: "https://www.facebook.com/groups/example/permalink/123",
      bodyText: "A normal Facebook post about a road trip.",
    })).toBeNull();
  });
});
