import "server-only";

import { completeInitialAiAskAnswer } from "@/features/ai/gateway";
import type { AssistantMessageProvenanceItem } from "@/features/retrieval/provenance";

export type AnswerAnnotationType = "source" | "warning" | "trip_fact" | "action" | "place" | "hotel_area" | "route_segment" | "cost";

export type AnswerAnnotationProposal = {
  id: string;
  start: number;
  end: number;
  quote?: string;
  type: AnswerAnnotationType;
  provenanceIds?: string[];
};

export type AnswerAnnotation = {
  id: string;
  start: number;
  end: number;
  text: string;
  type: AnswerAnnotationType;
  detail: AnswerAnnotationDetailDescriptor;
};

export type AnswerAnnotationDetailDescriptor = {
  type: AnswerAnnotationType;
  label: string;
  section?: string;
  summary?: string;
  sourceCategory?: AssistantMessageProvenanceItem["sourceCategory"];
  owner?: {
    table: "assistant_response_provenance";
    id: string;
  };
  detail?: Record<string, string>;
  quickFacts?: Array<{ label: string; value: string }>;
  provenanceIds?: string[];
};

const allowedTypes = new Set<AnswerAnnotationType>(["source", "warning", "trip_fact", "action", "place", "hotel_area", "route_segment", "cost"]);
const entityTypes = new Set<AnswerAnnotationType>(["place", "hotel_area", "route_segment", "cost"]);
const detailDescriptorKeys = new Set(["type", "label", "section", "summary", "sourceCategory", "owner", "detail", "quickFacts", "provenanceIds"]);
const safeDetailLabels = new Set(["Loại", "Độ tin cậy", "Trạng thái", "URL", "Ngày kiểm tra", "Độ mới", "Nhãn nguồn"]);
const safeQuickFactLabels = new Set([...safeDetailLabels, "Địa điểm", "Khu vực", "Chặng đường", "Chi phí"]);
const maxAnnotationProposals = 20;
const maxQuickFacts = 6;
const maxQuickFactLength = 160;

export function validateAnswerAnnotations(input: {
  answerText: string;
  proposals: AnswerAnnotationProposal[];
  provenance: AssistantMessageProvenanceItem[];
}): AnswerAnnotation[] {
  const provenanceById = new Map(input.provenance.map((item) => [item.id, item]));
  const seenIds = new Set<string>();
  const accepted: AnswerAnnotation[] = [];

  for (const proposal of input.proposals.slice().sort((left, right) => left.start - right.start || left.end - right.end)) {
    if (!proposal.id || seenIds.has(proposal.id) || !allowedTypes.has(proposal.type)) {
      continue;
    }

    if (!Number.isInteger(proposal.start) || !Number.isInteger(proposal.end) || proposal.start < 0 || proposal.end <= proposal.start || proposal.end > input.answerText.length) {
      continue;
    }

    const text = input.answerText.slice(proposal.start, proposal.end);

    if (!text.trim() || (proposal.quote && proposal.quote !== text)) {
      continue;
    }

    if (accepted.some((annotation) => proposal.start < annotation.end && proposal.end > annotation.start)) {
      continue;
    }

    const provenanceIds = proposal.provenanceIds ?? [];
    if (new Set(provenanceIds).size !== provenanceIds.length) {
      continue;
    }
    const matchedProvenance = provenanceIds.map((id) => provenanceById.get(id)).filter((item): item is AssistantMessageProvenanceItem => Boolean(item));

    if (provenanceIds.length !== matchedProvenance.length) {
      continue;
    }

    const detail = buildAnswerAnnotationDetail({ type: proposal.type, text, provenance: matchedProvenance });

    if (!detail) {
      continue;
    }

    seenIds.add(proposal.id);
    accepted.push({ id: proposal.id, start: proposal.start, end: proposal.end, text, type: proposal.type, detail });
  }

  return accepted;
}

// Persisted JSON is untrusted. Callers supply only provenance already scoped to one owned assistant message.
export function sanitizeStoredAnswerAnnotations(input: {
  answerText: string;
  annotations: unknown;
  provenance: AssistantMessageProvenanceItem[];
}): AnswerAnnotation[] {
  if (!Array.isArray(input.annotations)) {
    return [];
  }

  const provenanceById = new Map(input.provenance.map((item) => [item.id, item]));
  const accepted: AnswerAnnotation[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const allIds = new Set<string>();

  for (const item of input.annotations) {
    if (!isRecord(item) || typeof item.id !== "string") {
      continue;
    }
    if (allIds.has(item.id)) {
      duplicateIds.add(item.id);
    }
    allIds.add(item.id);
  }

  for (const item of input.annotations.slice().sort(compareStoredAnnotations)) {
    if (accepted.length >= maxAnnotationProposals) {
      break;
    }
    if (!isRecord(item) || typeof item.id !== "string" || duplicateIds.has(item.id) || seenIds.has(item.id) || typeof item.start !== "number" || typeof item.end !== "number" || typeof item.text !== "string" || typeof item.type !== "string" || !allowedTypes.has(item.type as AnswerAnnotationType)) {
      continue;
    }

    if (!Number.isInteger(item.start) || !Number.isInteger(item.end) || item.start < 0 || item.end <= item.start || item.end > input.answerText.length || input.answerText.slice(item.start, item.end) !== item.text) {
      continue;
    }

    const start = item.start;
    const end = item.end;
    if (accepted.some((annotation) => start < annotation.end && end > annotation.start)) {
      continue;
    }

    const detail = sanitizeDetailDescriptor(item.detail, item.type as AnswerAnnotationType, item.text, provenanceById);
    if (!detail) {
      continue;
    }

    seenIds.add(item.id);
    accepted.push({ id: item.id, start, end, text: item.text, type: item.type as AnswerAnnotationType, detail });
  }

  return accepted;
}

export async function buildValidatedAnswerAnnotations({
  answerText,
  provenance,
  model,
  abortSignal,
}: {
  answerText: string;
  provenance: AssistantMessageProvenanceItem[];
  model: string;
  abortSignal?: AbortSignal;
}): Promise<AnswerAnnotation[]> {
  const annotationProvenance = getAnnotationProposalProvenance(provenance);

  if (abortSignal?.aborted || annotationProvenance.length === 0) {
    return [];
  }

  try {
    const result = await completeInitialAiAskAnswer({
      model,
      abortSignal,
      messages: buildAnnotationProposalMessages({ answerText, provenance: annotationProvenance }),
    });

    if (!result.ok) {
      return [];
    }

    const proposals = parseAnswerAnnotationProposals(result.content);
    return validateAnswerAnnotations({ answerText, proposals, provenance });
  } catch {
    return [];
  }
}

export function buildAnswerAnnotationDetail(input: {
  type: AnswerAnnotationType;
  text: string;
  provenance: AssistantMessageProvenanceItem[];
}): AnswerAnnotationDetailDescriptor | null {
  const primary = input.provenance[0];

  if (!primary && input.type !== "action") {
    return null;
  }

  if (!primary) {
    return {
      type: "action",
      label: input.text,
      section: "Gợi ý hành động",
      summary: "Đây là gợi ý trong câu trả lời, không phải thao tác có thể thực hiện.",
      quickFacts: [{ label: "Trạng thái", value: "Chưa có thao tác được xác minh" }],
    };
  }

  const type = input.type;
  const detail: Record<string, string> = {
    "Loại": formatAnnotationSourceType(primary),
    "Độ tin cậy": primary.confidenceLabel,
    "Trạng thái": primary.verificationStatus === "verified" ? "đã xác minh" : "chưa xác minh",
  };

  if (primary.url) {
    detail.URL = primary.url;
  }

  if (primary.checkedAt) {
    detail["Ngày kiểm tra"] = primary.checkedAt;
  }

  if (primary.freshnessSensitive) {
    detail["Độ mới"] = "Thông tin có thể thay đổi, cần kiểm tra lại trước khi đi hoặc đặt dịch vụ.";
  }

  const quickFacts = Object.entries(detail)
    .slice(0, maxQuickFacts)
    .map(([label, value]) => ({ label: clipQuickFact(label), value: clipQuickFact(value) }))
    .filter((fact): fact is { label: string; value: string } => Boolean(fact.label && fact.value));

  return {
    type,
    label: entityTypes.has(type) ? input.text : primary.title || input.text,
    section: primary.sourceCategory === "general" ? "Suy luận AI" : "Nguồn và độ tin cậy",
    summary: getDescriptorSummary(type, primary.sourceCategory),
    sourceCategory: primary.sourceCategory,
    owner: { table: "assistant_response_provenance", id: primary.id },
    detail,
    quickFacts,
    provenanceIds: input.provenance.map((item) => item.id),
  };
}

export function parseAnswerAnnotationProposals(content: string): AnswerAnnotationProposal[] {
  const payload = parseJson(content);

  if (!isRecord(payload) || !Array.isArray(payload.annotations)) {
    return [];
  }

  const proposals: AnswerAnnotationProposal[] = [];

  for (const item of payload.annotations.slice(0, maxAnnotationProposals)) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.start !== "number" || typeof item.end !== "number" || typeof item.type !== "string") {
      continue;
    }

    proposals.push({
      id: item.id,
      start: item.start,
      end: item.end,
      quote: typeof item.quote === "string" ? item.quote : undefined,
      type: item.type as AnswerAnnotationType,
      provenanceIds: Array.isArray(item.provenanceIds) ? item.provenanceIds.filter((id): id is string => typeof id === "string") : undefined,
    });
  }

  return proposals;
}

function getAnnotationProposalProvenance(provenance: AssistantMessageProvenanceItem[]) {
  return provenance.filter((item) => item.usedInPrompt && item.sourceCategory !== "general");
}

function buildAnnotationProposalMessages({ answerText, provenance }: { answerText: string; provenance: AssistantMessageProvenanceItem[] }) {
  const handles = provenance
    .map((item) => ({
      id: item.id,
      title: item.title,
      sourceCategory: item.sourceCategory,
      confidenceLabel: item.confidenceLabel,
      verificationStatus: item.verificationStatus,
      freshnessSensitive: item.freshnessSensitive,
    }));

  return [
    {
      role: "system" as const,
      content: [
        "Bạn tạo annotation nội bộ cho câu trả lời AI Ask.",
        "Chỉ trả về JSON hợp lệ dạng {\"annotations\":[...]}. Không markdown, không giải thích.",
        "Mỗi annotation gồm id, start, end, quote, type, provenanceIds.",
        "start/end là offset UTF-16 trong answerText cuối cùng. quote phải khớp chính xác đoạn chữ đó.",
        "type chỉ là source, warning, trip_fact, action, place, hotel_area, route_segment, hoặc cost.",
        "Chỉ dùng provenanceIds có trong danh sách handles. Không tự tạo URL, nhãn nguồn, metadata, hoặc chi tiết hiển thị.",
        "Nếu không có cụm đáng mở chi tiết hoặc không chắc offset, trả {\"annotations\":[]}.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: JSON.stringify({ answerText, handles }),
    },
  ];
}

function parseJson(content: string) {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

function formatAnnotationSourceType(item: AssistantMessageProvenanceItem) {
  if (item.sourceCategory === "web") {
    return "Web chưa xác minh";
  }

  if (item.sourceCategory === "general") {
    return "Suy luận AI";
  }

  if (item.sourceCategory === "trip_context") {
    return "Ngữ cảnh dự án";
  }

  if (item.sourceCategory === "chat_context") {
    return "Ngữ cảnh hội thoại";
  }

  return "Kiến thức XuyenViet đã duyệt";
}

function sanitizeDetailDescriptor(value: unknown, annotationType: AnswerAnnotationType, text: string, provenanceById: Map<string, AssistantMessageProvenanceItem>): AnswerAnnotationDetailDescriptor | null {
  if (!isRecord(value) || !isCompatibleStoredDetailType(value.type, annotationType) || typeof value.label !== "string" || Object.keys(value).some((key) => !detailDescriptorKeys.has(key)) || (!hasSafeStoredDisplayFields(value) && !isLegacyActionDescriptor(value, annotationType))) {
    return null;
  }

  const provenanceIds = sanitizeProvenanceIds(value.provenanceIds, provenanceById);
  if (!provenanceIds || (annotationType !== "action" && provenanceIds.length === 0)) {
    return null;
  }

  const owner = sanitizeOwner(value.owner, provenanceIds);
  if (value.owner !== undefined && !owner) {
    return null;
  }

  if (entityTypes.has(annotationType) && (!owner || provenanceIds.length === 0)) {
    return null;
  }

  // Stored JSON may be stale or tampered with. Its display values never become traveler UI.
  const trusted = buildAnswerAnnotationDetail({
    type: annotationType,
    text,
    provenance: provenanceIds.map((id) => provenanceById.get(id)!),
  });
  if (!trusted) {
    return null;
  }

  return trusted;
}

function sanitizeProvenanceIds(value: unknown, provenanceById: Map<string, AssistantMessageProvenanceItem>) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((id) => typeof id !== "string") || new Set(value).size !== value.length || value.some((id) => !provenanceById.has(id))) {
    return null;
  }

  return value;
}

function sanitizeOwner(value: unknown, provenanceIds: string[]) {
  if (!isRecord(value) || value.table !== "assistant_response_provenance" || typeof value.id !== "string" || !provenanceIds.includes(value.id)) {
    return null;
  }

  return { table: "assistant_response_provenance" as const, id: value.id };
}

function isCompatibleStoredDetailType(value: unknown, annotationType: AnswerAnnotationType) {
  return value === annotationType || (annotationType === "source" && value === "warning");
}

function hasSafeStoredDisplayFields(value: Record<string, unknown>) {
  return (value.detail === undefined || hasSafeLegacyDetail(value.detail))
    && (value.quickFacts === undefined || hasSafeQuickFacts(value.quickFacts));
}

function isLegacyActionDescriptor(value: Record<string, unknown>, annotationType: AnswerAnnotationType) {
  if (annotationType !== "action" || value.owner !== undefined || value.provenanceIds !== undefined || value.quickFacts !== undefined || value.summary !== undefined || value.section !== "Gợi ý hành động") {
    return false;
  }

  if (Object.keys(value).some((key) => key !== "type" && key !== "label" && key !== "section" && key !== "detail")) {
    return false;
  }

  return isRecord(value.detail)
    && Object.keys(value.detail).length === 2
    && value.detail["Nhãn"] === "Hành động gợi ý"
    && value.detail["Giải thích"] === "Gợi ý thao tác tiếp theo từ câu trả lời, không phải nguồn đã xác minh.";
}

function hasSafeLegacyDetail(value: unknown) {
  return isRecord(value)
    && Object.keys(value).length <= maxQuickFacts
    && Object.entries(value).every(([label, text]) => safeDetailLabels.has(label) && isBoundedString(text));
}

function hasSafeQuickFacts(value: unknown) {
  return Array.isArray(value)
    && value.length <= maxQuickFacts
    && value.every((fact) => isRecord(fact) && safeQuickFactLabels.has(fact.label as string) && isBoundedString(fact.label) && isBoundedString(fact.value));
}

function isBoundedString(value: unknown) {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maxQuickFactLength;
}

function clipQuickFact(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxQuickFactLength) : null;
}

function compareStoredAnnotations(left: unknown, right: unknown) {
  const leftStart = isRecord(left) && typeof left.start === "number" ? left.start : Number.MAX_SAFE_INTEGER;
  const rightStart = isRecord(right) && typeof right.start === "number" ? right.start : Number.MAX_SAFE_INTEGER;
  const leftEnd = isRecord(left) && typeof left.end === "number" ? left.end : Number.MAX_SAFE_INTEGER;
  const rightEnd = isRecord(right) && typeof right.end === "number" ? right.end : Number.MAX_SAFE_INTEGER;
  return leftStart - rightStart || leftEnd - rightEnd;
}

function getDescriptorSummary(type: AnswerAnnotationType, sourceCategory: AssistantMessageProvenanceItem["sourceCategory"]) {
  if (type === "place") return "Địa điểm này được liên kết với cơ sở đã lưu của câu trả lời.";
  if (type === "hotel_area") return "Khu lưu trú này cần được kiểm tra lại theo nhu cầu và thời điểm đi.";
  if (type === "route_segment") return "Chặng đường này được mô tả từ cơ sở đã lưu, không phải chỉ đường trực tiếp.";
  if (type === "cost") return "Thông tin chi phí có thể thay đổi; hãy kiểm tra lại trước khi quyết định.";
  if (sourceCategory === "web") return "Nguồn web bên ngoài này chưa được XuyenViet xác minh.";
  return "Chi tiết này dựa trên provenance đã lưu của câu trả lời.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
