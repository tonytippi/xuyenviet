import { describe, expect, test } from "vitest";

import { buildAnswerAnnotationDetail, parseAnswerAnnotationProposals, sanitizeStoredAnswerAnnotations, validateAnswerAnnotations, type AnswerAnnotationProposal } from "@/features/ai/answer-annotations";
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
      type: "source",
      label: "Nguồn web cập nhật",
      owner: { table: "assistant_response_provenance", id: "prov-web" },
      detail: expect.objectContaining({ URL: "https://hue.gov.vn/ticket", "Độ tin cậy": "chưa xác minh" }),
    });
    expect(JSON.stringify(detail)).not.toMatch(/sourceSnapshot|providerScore|raw_source_material|operatorOnly|snippet/);
  });

  test("parses only bounded structured annotation proposal JSON", () => {
    const proposals = parseAnswerAnnotationProposals(JSON.stringify({
      annotations: [
        { id: "valid", start: 0, end: 3, quote: "Huế", type: "source", provenanceIds: ["prov-knowledge", 123] },
        { id: "missing-range", type: "source", provenanceIds: ["prov-knowledge"] },
        "bad",
      ],
    }));

    expect(proposals).toEqual([{ id: "valid", start: 0, end: 3, quote: "Huế", type: "source", provenanceIds: ["prov-knowledge"] }]);
    expect(parseAnswerAnnotationProposals("not json")).toEqual([]);
  });

  test("uses UTF-16 ranges and supports every persisted descriptor type", () => {
    const answerText = "🚗 Huế | khu ven sông | chặng Đà Nẵng - Huế | 500.000đ | nguồn | cảnh báo | gia đình | bước tiếp";
    const proposals: AnswerAnnotationProposal[] = [
      makeProposal("place", answerText, "Huế", "place", ["prov-knowledge"]),
      makeProposal("hotel", answerText, "khu ven sông", "hotel_area", ["prov-knowledge"]),
      makeProposal("route", answerText, "chặng Đà Nẵng - Huế", "route_segment", ["prov-knowledge"]),
      makeProposal("cost", answerText, "500.000đ", "cost", ["prov-knowledge"]),
      makeProposal("source", answerText, "nguồn", "source", ["prov-knowledge"]),
      makeProposal("warning", answerText, "cảnh báo", "warning", ["prov-web"]),
      makeProposal("fact", answerText, "gia đình", "trip_fact", ["prov-context"]),
      makeProposal("action", answerText, "bước tiếp", "action", []),
    ];

    const annotations = validateAnswerAnnotations({ answerText, proposals, provenance });

    expect(annotations.map((annotation) => annotation.type)).toEqual(["place", "hotel_area", "route_segment", "cost", "source", "warning", "trip_fact", "action"]);
    expect(annotations[0]).toMatchObject({ start: answerText.indexOf("Huế"), text: "Huế" });
    expect(annotations.filter((annotation) => annotation.type === "place" || annotation.type === "hotel_area" || annotation.type === "route_segment" || annotation.type === "cost").every((annotation) => annotation.detail.owner?.id === "prov-knowledge")).toBe(true);
  });

  test("rejects persisted descriptors with cross-message provenance, unsafe fields, duplicate provenance, or unbounded quick facts", () => {
    const answerText = "Huế phù hợp.";
    const trusted = buildAnswerAnnotationDetail({ type: "place", text: "Huế", provenance: [provenance[0]] })!;
    const valid = {
      id: "valid",
      start: 0,
      end: 3,
      text: "Huế",
      type: "place",
      detail: trusted,
    };

    const sanitize = (annotation: unknown) => sanitizeStoredAnswerAnnotations({
      answerText,
      provenance: [provenance[0]],
      annotations: [annotation],
    });

    expect(sanitize(valid)).toEqual([expect.objectContaining({ id: "valid", type: "place" })]);
    expect(sanitize({ ...valid, id: "unknown", detail: { ...valid.detail, owner: { table: "assistant_response_provenance", id: "other-message" }, provenanceIds: ["other-message"] } })).toEqual([]);
    expect(sanitize({ ...valid, id: "duplicate", detail: { ...valid.detail, provenanceIds: ["prov-knowledge", "prov-knowledge"] } })).toEqual([]);
    expect(sanitize({ ...valid, id: "unsafe", detail: { ...valid.detail, detail: { providerScore: "1" } } })).toEqual([]);
    expect(sanitize({ ...valid, id: "unbounded", detail: { ...valid.detail, quickFacts: Array.from({ length: 7 }, () => ({ label: "Loại", value: "Điểm dừng" })) } })).toEqual([]);
    expect(sanitizeStoredAnswerAnnotations({ answerText, provenance: [provenance[0]], annotations: [{ ...valid, start: -1 }, valid] })).toEqual([]);
  });

  test("preserves compatible legacy source warnings and bounds provenance-derived quick facts", () => {
    const answerText = "Nguồn web cập nhật";
    const legacy = {
      id: "legacy-warning",
      start: 0,
      end: answerText.length,
      text: answerText,
      type: "source",
      detail: {
        type: "warning",
        label: answerText,
        owner: { table: "assistant_response_provenance", id: "prov-web" },
        provenanceIds: ["prov-web"],
      },
    };
    const longProvenance = { ...provenance[0], confidenceLabel: "x".repeat(200) };

    expect(sanitizeStoredAnswerAnnotations({ answerText, annotations: [legacy], provenance: [provenance[1]] })).toEqual([expect.objectContaining({ id: "legacy-warning" })]);
    expect(buildAnswerAnnotationDetail({ type: "source", text: "Huế", provenance: [longProvenance] })?.quickFacts?.every((fact) => fact.label.length <= 160 && fact.value.length <= 160)).toBe(true);
  });

  test("rebuilds the established provenance-free legacy action descriptor without trusting its display data", () => {
    const answerText = "Kiểm tra chỗ đỗ trước khi đi.";
    const actionText = "Kiểm tra chỗ đỗ";
    const legacy = {
      id: "legacy-action",
      start: 0,
      end: actionText.length,
      text: actionText,
      type: "action",
      detail: {
        type: "action",
        label: actionText,
        section: "Gợi ý hành động",
        detail: {
          "Nhãn": "Hành động gợi ý",
          "Giải thích": "Gợi ý thao tác tiếp theo từ câu trả lời, không phải nguồn đã xác minh.",
        },
      },
    };

    const annotations = sanitizeStoredAnswerAnnotations({ answerText, annotations: [legacy], provenance: [] });

    expect(annotations).toEqual([expect.objectContaining({ id: "legacy-action", detail: expect.objectContaining({ summary: "Đây là gợi ý trong câu trả lời, không phải thao tác có thể thực hiện.", quickFacts: [{ label: "Trạng thái", value: "Chưa có thao tác được xác minh" }] }) })]);
    expect(JSON.stringify(annotations)).not.toContain("Giải thích");
    expect(sanitizeStoredAnswerAnnotations({ answerText, annotations: [{ ...legacy, detail: { ...legacy.detail, provenanceIds: ["prov-knowledge"] } }], provenance })).toEqual([]);
  });
});

function makeProposal(id: string, answerText: string, quote: string, type: AnswerAnnotationProposal["type"], provenanceIds: string[]): AnswerAnnotationProposal {
  const start = answerText.indexOf(quote);

  return { id, start, end: start + quote.length, quote, type, provenanceIds };
}
