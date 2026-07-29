import { describe, expect, test } from "vitest";

import { parseAiAskStreamInput } from "@xuyenviet/contracts";

describe("AI Ask stream contract", () => {
  test("rejects a declared image type whose bytes do not carry its required signature", () => {
    expect(parseAiAskStreamInput({
      question: "Đi đâu?",
      idempotencyKey: "valid_idempotency_key",
      image: { fileName: "photo.png", mimeType: "image/png", byteSize: 8, bytes: new Uint8Array(8) },
    })).toBeNull();
  });

  test("normalizes a valid PNG attachment without placing its bytes in the event contract", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(parseAiAskStreamInput({
      question: "  Đi đâu?  ",
      idempotencyKey: "valid_idempotency_key",
      image: { fileName: " photo.png ", mimeType: "image/png", byteSize: bytes.byteLength, bytes },
    })).toMatchObject({ question: "Đi đâu?", image: { fileName: "photo.png", mimeType: "image/png", byteSize: 8 } });
  });
});
