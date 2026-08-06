import { describe, expect, test } from "vitest";

import { buildKnowledgePipelineMultiFactExtractionMessages } from "@xuyenviet/database";

describe("knowledge ingestion discovery prompt", () => {
  test("uses the required evidence field in its candidate example", () => {
    const messages = buildKnowledgePipelineMultiFactExtractionMessages({ source: { kind: "facebook_capture" }, rawText: "Đèo Hải Vân có điểm dừng ngắm cảnh." });
    const payload = JSON.parse(messages[1].content) as { extraction_contract: Record<string, unknown>; expected_output: { candidates: Array<Record<string, unknown>> } };

    expect(payload.extraction_contract).not.toHaveProperty("evidence_hint_optional");
    expect(payload.expected_output.candidates[0]).toMatchObject({ evidence: { quote_text: expect.any(String) } });
    expect(payload.expected_output.candidates[0]).not.toHaveProperty("evidence_hint");
  });
});
