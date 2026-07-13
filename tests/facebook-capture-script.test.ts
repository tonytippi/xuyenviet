import { describe, expect, test } from "vitest";

import { chooseBestFacebookCaptureText, chooseFacebookCaptureText, extractFacebookGraphqlText } from "../scripts/facebook-capture";

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
