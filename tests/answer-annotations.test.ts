import { describe, expect, test } from "vitest";

import { buildAnswerAnnotationDetail, validateAnswerAnnotations, type AnswerAnnotationProposal } from "@/features/ai/answer-annotations";
import type { AssistantMessageProvenanceItem } from "@/features/retrieval/provenance";

const provenance: AssistantMessageProvenanceItem[] = [
  {
    id: "prov-knowledge",
    rank: 1,
    sourceCategory: "knowledge",
    title: "Bãi đỗ chính thức Huế",
    sourceType: "parking",
    url: "https://xuyenviet.example/hue-parking",
    checkedAt: "2026-07-08T00:00:00.000Z",
    confidenceLabel: "official",
    verificationStatus: "verified",
    usedInPrompt: true,
    citedInAnswer: false,
    retrievalScore: 0.9,
    freshnessSensitive: false,
  },
  {
    id: "prov-web",
    rank: 2,
    sourceCategory: "web",
    title: "Nguồn web cập nhật",
    sourceType: "official",
    url: "https://hue.gov.vn/ticket",
    checkedAt: "2026-07-09T10:00:00.000Z",
    confidenceLabel: "chưa xác minh",
    verificationStatus: "unverified",
    usedInPrompt: true,
    citedInAnswer: false,
    retrievalScore: 0.7,
    freshnessSensitive: true,
  },
  {
    id: "prov-context",
    rank: 3,
    sourceCategory: "trip_context",
    title: "Ngữ cảnh dự án: children",
    sourceType: "children",
    url: null,
    checkedAt: null,
    confidenceLabel: "đã xác minh",
    verificationStatus: "verified",
    usedInPrompt: true,
    citedInAnswer: false,
    retrievalScore: null,
    freshnessSensitive: false,
  },
  {
    id: "prov-general",
    rank: 4,
    sourceCategory: "general",
    title: "Suy luận tổng quát của AI",
    sourceType: "general_reasoning",
    url: null,
    checkedAt: null,
    confidenceLabel: "suy luận chưa xác minh",
    verificationStatus: "unverified",
    usedInPrompt: true,
    citedInAnswer: false,
    retrievalScore: null,
    freshnessSensitive: false,
  },
];

describe("answer annotation validation", () => {
  test("accepts valid knowledge, web, context, and general reasoning annotations", () => {
    const answerText = "Nên dùng Bãi đỗ chính thức Huế. Giá xem Nguồn web cập nhật. Đi cùng trẻ nhỏ nên nghỉ nhiều hơn. Đây là suy luận tổng quát.";
    const proposals: AnswerAnnotationProposal[] = [
      makeProposal("a1", answerText, "Bãi đỗ chính thức Huế", "source", ["prov-knowledge"]),
      makeProposal("a2", answerText, "Nguồn web cập nhật", "warning", ["prov-web"]),
      makeProposal("a3", answerText, "trẻ nhỏ", "trip_fact", ["prov-context"]),
      makeProposal("a4", answerText, "suy luận tổng quát", "source", ["prov-general"]),
    ];

    const annotations = validateAnswerAnnotations({ answerText, proposals, provenance });

    expect(annotations.map((annotation) => annotation.text)).toEqual(["Bãi đỗ chính thức Huế", "Nguồn web cập nhật", "trẻ nhỏ", "suy luận tổng quát"]);
    expect(annotations[0].detail).toMatchObject({ label: "Bãi đỗ chính thức Huế", sourceCategory: "knowledge", provenanceIds: ["prov-knowledge"] });
    expect(annotations[1].detail).toMatchObject({ type: "warning", label: "Nguồn web cập nhật", sourceCategory: "web" });
    expect(annotations[2].detail).toMatchObject({ type: "trip_fact", sourceCategory: "trip_context" });
    expect(annotations[3].detail).toMatchObject({ sourceCategory: "general" });
  });

  test("drops invalid offsets, mismatched quotes, duplicates, overlaps, malformed type, and unknown provenance", () => {
    const answerText = "Bãi đỗ chính thức Huế cần kiểm tra lại.";
    const valid = makeProposal("valid", answerText, "Bãi đỗ chính thức Huế", "source", ["prov-knowledge"]);
    const annotations = validateAnswerAnnotations({
      answerText,
      provenance,
      proposals: [
        valid,
        { ...valid, id: "bad-offset", start: -1 },
        { ...valid, id: "bad-quote", quote: "Bãi đỗ giả" },
        { ...valid, id: "valid", start: answerText.indexOf("kiểm tra"), end: answerText.indexOf("kiểm tra") + "kiểm tra".length },
        { ...valid, id: "overlap", start: 3, end: 12 },
        { ...valid, id: "bad-type", type: "unsafe" as never },
        { ...valid, id: "unknown-provenance", provenanceIds: ["prov-other"] },
      ],
    });

    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({ id: "valid", text: "Bãi đỗ chính thức Huế" });
  });

  test("builds detail from safe provenance fields only", () => {
    const detail = buildAnswerAnnotationDetail({ type: "source", text: "Huế", provenance: [provenance[1]] });

    expect(detail).toMatchObject({
      type: "warning",
      label: "Nguồn web cập nhật",
      owner: { table: "assistant_response_provenance", id: "prov-web" },
      detail: expect.objectContaining({ URL: "https://hue.gov.vn/ticket", "Độ tin cậy": "chưa xác minh" }),
    });
    expect(JSON.stringify(detail)).not.toMatch(/sourceSnapshot|providerScore|raw_source_material|operatorOnly|snippet/);
  });
});

function makeProposal(id: string, answerText: string, quote: string, type: AnswerAnnotationProposal["type"], provenanceIds: string[]): AnswerAnnotationProposal {
  const start = answerText.indexOf(quote);

  return { id, start, end: start + quote.length, quote, type, provenanceIds };
}
