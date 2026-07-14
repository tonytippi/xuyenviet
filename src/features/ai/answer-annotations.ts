import "server-only";

import type { AssistantMessageProvenanceItem } from "@/features/retrieval/provenance";

export type AnswerAnnotationType = "source" | "warning" | "trip_fact" | "action";

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
  sourceCategory?: AssistantMessageProvenanceItem["sourceCategory"];
  owner?: {
    table: "assistant_response_provenance";
    id: string;
  };
  detail?: Record<string, string>;
  provenanceIds?: string[];
};

const allowedTypes = new Set<AnswerAnnotationType>(["source", "warning", "trip_fact", "action"]);
const maxAnnotationProposals = 20;

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

    const provenanceIds = [...new Set(proposal.provenanceIds ?? [])];
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
      detail: { "Nhãn": "Hành động gợi ý", "Giải thích": "Gợi ý thao tác tiếp theo từ câu trả lời, không phải nguồn đã xác minh." },
    };
  }

  const type = input.type === "warning" || primary.freshnessSensitive ? "warning" : input.type;
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

  return {
    type,
    label: primary.title || input.text,
    section: primary.sourceCategory === "general" ? "Suy luận AI" : "Nguồn và độ tin cậy",
    sourceCategory: primary.sourceCategory,
    owner: { table: "assistant_response_provenance", id: primary.id },
    detail,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
