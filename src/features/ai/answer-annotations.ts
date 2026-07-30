import "server-only";

import { completeInitialAiAskAnswer } from "@/features/ai/gateway";
import type { AssistantMessageProvenanceItem, AvailableAssistantMessageProvenanceItem } from "@/features/retrieval/provenance";

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
  sourceCategory?: AvailableAssistantMessageProvenanceItem["sourceCategory"];
  owner?: {
    table: "assistant_response_provenance";
    id: string;
  };
  detail?: Record<string, string>;
  quickFacts?: Array<{ label: string; value: string }>;
  provenanceIds?: string[];
  action?: AnswerAnnotationAction;
  capability?: AnswerAnnotationActionCapability;
};

export type AnswerAnnotationActionCommand = "trip_change_proposal.apply" | "trip_change_proposal.dismiss";
export type AnswerAnnotationAction = { command: AnswerAnnotationActionCommand; label: string; arguments: Record<string, never>; anchor?: "trip-change-proposal-action.v1" };
export type AnswerAnnotationActionCapability = { command: AnswerAnnotationActionCommand; label: string; available: true };

// These fixed markers identify feature-owned actions within one assistant
// message. Proposal identity is deliberately resolved server-side from scope.
export const tripChangeProposalApplyAnnotationId = "trip-change-proposal-apply";
export const tripChangeProposalDismissAnnotationId = "trip-change-proposal-dismiss";
export const tripChangeProposalActionAnnotationIds = [
  tripChangeProposalApplyAnnotationId,
  tripChangeProposalDismissAnnotationId,
] as const;
export const tripChangeProposalActionAnnotationIdSet = new Set<string>(tripChangeProposalActionAnnotationIds);

export function isTripChangeProposalActionAnnotation(id: string, command: AnswerAnnotationActionCommand) {
  return (id === tripChangeProposalApplyAnnotationId && command === "trip_change_proposal.apply")
    || (id === tripChangeProposalDismissAnnotationId && command === "trip_change_proposal.dismiss");
}


const allowedTypes = new Set<AnswerAnnotationType>(["source", "warning", "trip_fact", "action", "place", "hotel_area", "route_segment", "cost"]);
const entityTypes = new Set<AnswerAnnotationType>(["place", "hotel_area", "route_segment", "cost"]);
const detailDescriptorKeys = new Set(["type", "label", "section", "summary", "sourceCategory", "owner", "detail", "quickFacts", "provenanceIds", "action"]);
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
  if (!Array.isArray(input.proposals) || input.proposals.length > maxAnnotationProposals) {
    return [];
  }

  const provenanceById = new Map(input.provenance.map((item) => [item.id, item]));
  const proposals = input.proposals.filter(isAnswerAnnotationProposal);
  const duplicateIds = findDuplicateIds(input.proposals.map(getProposalId));
  const seenIds = new Set<string>();
  const accepted: AnswerAnnotation[] = [];

  for (const proposal of proposals.slice().sort((left, right) => left.start - right.start || left.end - right.end)) {
    if (!proposal.id || duplicateIds.has(proposal.id) || seenIds.has(proposal.id) || proposal.type === "action" || !allowedTypes.has(proposal.type)) {
      continue;
    }

    if (!Number.isInteger(proposal.start) || !Number.isInteger(proposal.end) || proposal.start < 0 || proposal.end <= proposal.start || proposal.end > input.answerText.length) {
      continue;
    }

    const text = input.answerText.slice(proposal.start, proposal.end);

    if (!text.trim() || (proposal.quote !== undefined && proposal.quote !== text)) {
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
    if (matchedProvenance.some((item) => item.availability === "withdrawn")) {
      continue;
    }

    if (provenanceIds.length === 0 && !isLocalGuidanceType(proposal.type)) {
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
  if (input.annotations.length > maxAnnotationProposals) {
    return [];
  }

  const provenanceById = new Map(input.provenance.map((item) => [item.id, item]));
  const accepted: AnswerAnnotation[] = [];
  const seenIds = new Set<string>();
  const duplicateIds = findDuplicateIds(input.annotations.map((item) => isRecord(item) ? item.id : undefined));
  const ranges = input.annotations
    .filter((item): item is StoredAnnotationRange => isValidStoredAnnotationRange(item, input.answerText, duplicateIds, provenanceById))
    .sort(compareStoredAnnotations);

  if (ranges.some((item, index) => index > 0 && (item.start as number) < (ranges[index - 1].end as number))) {
    return [];
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
    if (detail.action && !isTripChangeProposalActionAnnotation(item.id, detail.action.command)) {
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
  const result = await buildValidatedAnswerAnnotationsResult({ answerText, provenance, model, abortSignal });
  return result.kind === "annotations" ? result.annotations : [];
}

// Callers which own retry policy need to distinguish a safe empty annotation
// result from an unavailable provider. The public compatibility wrapper above
// intentionally preserves the existing empty-array contract.
export async function buildValidatedAnswerAnnotationsResult({
  answerText,
  provenance,
  model,
  abortSignal,
}: {
  answerText: string;
  provenance: AssistantMessageProvenanceItem[];
  model: string;
  abortSignal?: AbortSignal;
}): Promise<{ kind: "annotations"; annotations: AnswerAnnotation[]; usage?: AnnotationProviderUsage } | { kind: "provider_failed" }> {
  const annotationProvenance = getAnnotationProposalProvenance(provenance);

  if (abortSignal?.aborted || annotationProvenance.length === 0) {
    return { kind: "annotations", annotations: [] };
  }

  try {
    const result = await completeInitialAiAskAnswer({
      model,
      abortSignal,
      messages: buildAnnotationProposalMessages({ answerText, provenance: annotationProvenance }),
    });

    if (!result.ok) {
      return { kind: "provider_failed" };
    }

    const proposals = parseAnswerAnnotationProposals(result.content);
    return {
      kind: "annotations",
      annotations: validateAnswerAnnotations({ answerText, proposals, provenance }),
      usage: {
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        cachedPromptTokens: result.usage.cachedPromptTokens,
        cacheWritePromptTokens: result.usage.cacheWritePromptTokens,
        providerRequestId: result.requestMetadata.providerRequestId,
      },
    };
  } catch {
    return { kind: "provider_failed" };
  }
}

export type AnnotationProviderUsage = {
  provider: string;
  model: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedPromptTokens: number | null;
  cacheWritePromptTokens: number | null;
  providerRequestId: string | null;
};

export function buildAnswerAnnotationDetail(input: {
  type: AnswerAnnotationType;
  text: string;
  provenance: AssistantMessageProvenanceItem[];
}): AnswerAnnotationDetailDescriptor | null {
  const primary = input.provenance[0];

  if (!primary && !isLocalGuidanceType(input.type)) {
    return null;
  }

  if (!primary) {
    return {
      type: input.type,
      label: input.text,
      section: "Lưu ý trong câu trả lời",
      summary: "Đây là lưu ý cục bộ trong câu trả lời, không phải chi tiết từ nguồn.",
    };
  }

  if (primary.availability === "withdrawn" || input.provenance.some((item) => item.availability === "withdrawn")) {
    return null;
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

  if (payload.annotations.length > maxAnnotationProposals) {
    return [];
  }

  const duplicateIds = findDuplicateIds(payload.annotations.map(getProposalId));
  for (const item of payload.annotations) {
    if (!isRecord(item) || typeof item.id !== "string" || duplicateIds.has(item.id) || typeof item.start !== "number" || typeof item.end !== "number" || typeof item.type !== "string" || (item.quote !== undefined && typeof item.quote !== "string") || (item.provenanceIds !== undefined && (!Array.isArray(item.provenanceIds) || item.provenanceIds.some((id) => typeof id !== "string")))) {
      continue;
    }

    proposals.push({
      id: item.id,
      start: item.start,
      end: item.end,
      quote: typeof item.quote === "string" ? item.quote : undefined,
      type: item.type as AnswerAnnotationType,
      provenanceIds: item.provenanceIds as string[] | undefined,
    });
  }

  return proposals;
}

function getAnnotationProposalProvenance(provenance: AssistantMessageProvenanceItem[]) {
  return provenance.filter((item): item is Extract<AssistantMessageProvenanceItem, { availability: "available" }> => item.availability === "available" && item.usedInPrompt && item.sourceCategory !== "general");
}

function buildAnnotationProposalMessages({ answerText, provenance }: { answerText: string; provenance: AvailableAssistantMessageProvenanceItem[] }) {
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
        "type chỉ là source, warning, trip_fact, place, hotel_area, route_segment, hoặc cost.",
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

function formatAnnotationSourceType(item: AvailableAssistantMessageProvenanceItem) {
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
  if (!isRecord(value) || !isCompatibleStoredDetailType(value.type, annotationType) || typeof value.label !== "string" || Object.keys(value).some((key) => !detailDescriptorKeys.has(key))) {
    return null;
  }

  if (annotationType === "action") {
    const action = sanitizeForwardActionDescriptor(value, text);
    if (action) {
      return { type: "action", label: text, section: "Gợi ý hành động", summary: "Thao tác này chỉ khả dụng khi đề xuất hiện tại vẫn thuộc kế hoạch của bạn.", action };
    }
    return isLegacyActionDescriptor(value, annotationType) ? buildLegacyActionDetail(text) : null;
  }

  if (!hasSafeStoredDisplayFields(value)) {
    return null;
  }

  const provenanceIds = sanitizeProvenanceIds(value.provenanceIds, provenanceById);
  if (!provenanceIds || (provenanceIds.length === 0 && !isLocalGuidanceType(annotationType))) {
    return null;
  }

  if (provenanceIds.length === 0 && !isCanonicalLocalGuidanceDescriptor(value, annotationType)) {
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

function sanitizeForwardActionDescriptor(value: Record<string, unknown>, text: string): AnswerAnnotationAction | null {
  if (value.type !== "action" || value.label !== text || Object.keys(value).some((key) => key !== "type" && key !== "label" && key !== "action")) {
    return null;
  }
  const action = value.action;
  if (!isRecord(action) || Object.keys(action).some((key) => key !== "command" && key !== "label" && key !== "arguments" && key !== "anchor") || (action.command !== "trip_change_proposal.apply" && action.command !== "trip_change_proposal.dismiss") || action.label !== text || !isRecord(action.arguments) || Object.keys(action.arguments).length !== 0 || action.anchor !== "trip-change-proposal-action.v1") {
    return null;
  }
  return { command: action.command, label: action.label, arguments: {}, anchor: "trip-change-proposal-action.v1" };
}

function isLocalGuidanceType(type: AnswerAnnotationType) {
  return type === "warning" || type === "trip_fact";
}

function isCanonicalLocalGuidanceDescriptor(value: Record<string, unknown>, annotationType: AnswerAnnotationType) {
  return isLocalGuidanceType(annotationType)
    && value.type === annotationType
    && typeof value.label === "string"
    && Object.keys(value).every((key) => key === "type" || key === "label");
}

function buildLegacyActionDetail(text: string): AnswerAnnotationDetailDescriptor {
  return {
    type: "action",
    label: text,
    section: "Gợi ý hành động",
    summary: "Đây là gợi ý trong câu trả lời, không phải thao tác có thể thực hiện.",
    quickFacts: [{ label: "Trạng thái", value: "Chưa có thao tác được xác minh" }],
  };
}

function sanitizeProvenanceIds(value: unknown, provenanceById: Map<string, AssistantMessageProvenanceItem>) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || value.some((id) => typeof id !== "string") || new Set(value).size !== value.length || value.some((id) => !provenanceById.has(id))) {
    return null;
  }

  if (value.some((id) => provenanceById.get(id)?.availability === "withdrawn")) {
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

type StoredAnnotationRange = Record<string, unknown> & { start: number; end: number };

function isValidStoredAnnotationRange(item: unknown, answerText: string, duplicateIds: Set<string>, provenanceById: Map<string, AssistantMessageProvenanceItem>): item is StoredAnnotationRange {
  return isRecord(item)
    && typeof item.id === "string"
    && !duplicateIds.has(item.id)
    && typeof item.start === "number"
    && typeof item.end === "number"
    && Number.isInteger(item.start)
    && Number.isInteger(item.end)
    && item.start >= 0
    && item.end > item.start
    && item.end <= answerText.length
    && typeof item.text === "string"
    && answerText.slice(item.start, item.end) === item.text
    && typeof item.type === "string"
    && allowedTypes.has(item.type as AnswerAnnotationType)
    && (() => {
      const detail = sanitizeDetailDescriptor(item.detail, item.type as AnswerAnnotationType, item.text, provenanceById);
      return Boolean(detail && (!detail.action || isTripChangeProposalActionAnnotation(item.id, detail.action.command)));
    })();
}

function getDescriptorSummary(type: AnswerAnnotationType, sourceCategory: AvailableAssistantMessageProvenanceItem["sourceCategory"]) {
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

function isAnswerAnnotationProposal(value: unknown): value is AnswerAnnotationProposal {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.start === "number"
    && typeof value.end === "number"
    && typeof value.type === "string"
    && (value.quote === undefined || typeof value.quote === "string")
    && (value.provenanceIds === undefined || (Array.isArray(value.provenanceIds) && value.provenanceIds.every((id) => typeof id === "string")));
}

function getProposalId(value: unknown) {
  return isRecord(value) ? value.id : undefined;
}

function findDuplicateIds(values: unknown[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  return duplicates;
}
