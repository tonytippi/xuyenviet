export type PlanningProvenance = {
  id: string;
  rank: number;
  availability?: "available";
  sourceCategory: "knowledge" | "web" | "trip_context" | "chat_context" | "general";
  title: string;
  sourceType: string | null;
  url: string | null;
  checkedAt: string | null;
  confidenceLabel: string;
  verificationStatus: "verified" | "unverified";
  usedInPrompt: boolean;
  citedInAnswer: boolean;
  retrievalScore: number | null;
  freshnessSensitive: boolean;
} | { id: string; rank: number; availability: "withdrawn"; unavailableLabel: "Nguồn này không còn khả dụng."; usedInPrompt: boolean; citedInAnswer: boolean };

export type PlanningAnnotation = {
  id: string;
  start: number;
  end: number;
  text: string;
  type: "source" | "warning" | "trip_fact" | "action" | "place" | "hotel_area" | "route_segment" | "cost";
  detail: {
    type: "source" | "warning" | "trip_fact" | "action" | "place" | "hotel_area" | "route_segment" | "cost";
    label: string;
    section?: string;
    summary?: string;
    sourceCategory?: "knowledge" | "web" | "trip_context" | "chat_context" | "general";
    owner?: { table: "assistant_response_provenance"; id: string };
    detail?: Record<string, string>;
    quickFacts?: Array<{ label: string; value: string }>;
    provenanceIds?: string[];
    action?: { command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss"; label: string; arguments: Record<string, never>; anchor: "trip-change-proposal-action.v1" };
    capability?: { command: "trip_change_proposal.apply" | "trip_change_proposal.dismiss"; label: string; available: true };
  };
};

const types = new Set<PlanningAnnotation["type"]>(["source", "warning", "trip_fact", "action", "place", "hotel_area", "route_segment", "cost"]);
const sourceTypes = new Set<PlanningAnnotation["type"]>(["source", "place", "hotel_area", "route_segment", "cost"]);
const actionIds = new Map([["trip-change-proposal-apply", "trip_change_proposal.apply"], ["trip-change-proposal-dismiss", "trip_change_proposal.dismiss"]]);
const descriptorKeys = new Set(["type", "label", "section", "summary", "sourceCategory", "owner", "detail", "quickFacts", "provenanceIds", "action"]);
const maxQuickFactLength = 160;
const safeDetailLabels = new Set(["Loại", "Độ tin cậy", "Trạng thái", "URL", "Ngày kiểm tra", "Độ mới", "Nhãn nguồn"]);
const safeQuickFactLabels = new Set([...safeDetailLabels, "Địa điểm", "Khu vực", "Chặng đường", "Chi phí"]);

// This is the hostile persisted-JSON boundary shared by Next and the private API.
// It derives every visible source field from request-time formatter output.
export function sanitizeStoredPlanningAnnotations(input: { answerText: string; annotations: unknown; provenance: PlanningProvenance[] }): PlanningAnnotation[] {
  if (!Array.isArray(input.annotations) || input.annotations.length > 20) return [];
  const provenance = new Map(input.provenance.map((item) => [item.id, item]));
  const ids = input.annotations.map((item) => record(item) ? item.id : undefined);
  const duplicates = new Set(ids.filter((id, index) => typeof id === "string" && ids.indexOf(id) !== index));
  const ranges = input.annotations
    .filter((item): item is Record<string, unknown> & { start: number; end: number } => isValidRange(item, input.answerText, duplicates, provenance))
    .sort(order);
  if (ranges.some((item, index) => index > 0 && item.start < ranges[index - 1].end)) return [];
  const accepted: PlanningAnnotation[] = [];
  for (const item of input.annotations.slice().sort(order)) {
    if (!record(item) || typeof item.id !== "string" || duplicates.has(item.id) || typeof item.start !== "number" || typeof item.end !== "number" || typeof item.text !== "string" || !types.has(item.type as PlanningAnnotation["type"])) continue;
    const { id, start, end, text, type } = item;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > input.answerText.length || input.answerText.slice(start, end) !== text || accepted.some((annotation) => start < annotation.end && end > annotation.start)) continue;
    const detail = detailFor(item, type as PlanningAnnotation["type"], text, provenance);
    if (detail) accepted.push({ id, start, end, text, type: type as PlanningAnnotation["type"], detail });
  }
  return accepted;
}

export async function resolvePlanningAnnotationCapabilities(input: { annotations: PlanningAnnotation[]; hasCurrentPendingProposal: () => Promise<boolean> }): Promise<PlanningAnnotation[]> {
  const actions = input.annotations.filter((annotation) => annotation.detail.action);
  if (actions.length === 0 || !await input.hasCurrentPendingProposal()) return input.annotations;
  return input.annotations.map((annotation) => {
    const action = annotation.detail.action;
    return action && actionIds.get(annotation.id) === action.command
      ? { ...annotation, detail: { ...annotation.detail, capability: { command: action.command, label: action.label, available: true as const } } }
      : annotation;
  });
}

function detailFor(value: Record<string, unknown>, type: PlanningAnnotation["type"], text: string, provenance: Map<string, PlanningProvenance>): PlanningAnnotation["detail"] | null {
  if (!record(value.detail) || Object.keys(value.detail).some((key) => !descriptorKeys.has(key)) || (value.detail.type !== type && !(type === "source" && value.detail.type === "warning")) || typeof value.detail.label !== "string" || ((type !== "warning" && type !== "trip_fact") && value.detail.label !== text)) return null;
  if (type === "action") {
    const action = value.detail.action;
    if (!record(action)) {
      return isLegacyActionDescriptor(value.detail)
        ? { type, label: text, section: "Gợi ý hành động", summary: "Đây là gợi ý trong câu trả lời, không phải thao tác có thể thực hiện.", quickFacts: [{ label: "Trạng thái", value: "Chưa có thao tác được xác minh" }] }
        : null;
    }
    if (typeof value.id !== "string" || actionIds.get(value.id) !== action.command || action.label !== text || !record(action.arguments) || Object.keys(action.arguments).length !== 0 || action.anchor !== "trip-change-proposal-action.v1") return null;
    return { type, label: text, section: "Gợi ý hành động", summary: "Thao tác này chỉ khả dụng khi đề xuất hiện tại vẫn thuộc kế hoạch của bạn.", action: { command: action.command as "trip_change_proposal.apply" | "trip_change_proposal.dismiss", label: text, arguments: {}, anchor: "trip-change-proposal-action.v1" } };
  }
  if (!safeStoredDisplayFields(value.detail)) return null;
  const ids = value.detail.provenanceIds;
  if (!Array.isArray(ids) || ids.length > 6 || ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length || (sourceTypes.has(type) && ids.length === 0)) {
    return localGuidance(value.detail, type, text);
  }
  const sources = ids.map((id) => provenance.get(id));
  if (sources.some((item) => !item || item.availability === "withdrawn")) return null;
  const primary = sources[0];
  if (!primary || primary.availability === "withdrawn") return null;
  const facts = Object.entries({ "Loại": primary.sourceType ?? "Nguồn tham khảo", "Độ tin cậy": primary.confidenceLabel, "Trạng thái": primary.verificationStatus === "verified" ? "đã xác minh" : "chưa xác minh", ...(primary.url ? { URL: primary.url } : {}), ...(primary.checkedAt ? { "Ngày kiểm tra": primary.checkedAt } : {}) })
    .filter(([, value]) => value.length <= maxQuickFactLength)
    .slice(0, 6);
  // The range text, not a historic source title, is the annotation's label.
  // This preserves the selected answer text while provenance supplies details.
  return { type, label: text, section: primary.sourceCategory === "general" ? "Suy luận AI" : "Nguồn và độ tin cậy", summary: "Chi tiết này dựa trên provenance đã lưu của câu trả lời.", sourceCategory: primary.sourceCategory, owner: { table: "assistant_response_provenance", id: primary.id }, detail: Object.fromEntries(facts), quickFacts: facts.map(([label, value]) => ({ label, value })), provenanceIds: ids };
}

function localGuidance(detail: Record<string, unknown>, type: PlanningAnnotation["type"], text: string): PlanningAnnotation["detail"] | null {
  return (type === "warning" || type === "trip_fact") && Object.keys(detail).every((key) => key === "type" || key === "label")
    ? { type, label: text, section: "Lưu ý trong câu trả lời", summary: "Đây là lưu ý cục bộ trong câu trả lời, không phải chi tiết từ nguồn." }
    : null;
}
function safeStoredDisplayFields(detail: Record<string, unknown>) {
  if (detail.section !== undefined && !boundedText(detail.section, 160)) return false;
  if (detail.summary !== undefined && !boundedText(detail.summary, 500)) return false;
  if (detail.detail !== undefined && (!record(detail.detail) || Object.keys(detail.detail).length > 6 || Object.entries(detail.detail).some(([key, value]) => !safeDetailLabels.has(key) || !boundedText(value, maxQuickFactLength)))) return false;
  return detail.quickFacts === undefined || Array.isArray(detail.quickFacts) && detail.quickFacts.length <= 6 && detail.quickFacts.every((fact) => record(fact) && Object.keys(fact).length === 2 && safeQuickFactLabels.has(fact.label as string) && boundedText(fact.label, maxQuickFactLength) && boundedText(fact.value, maxQuickFactLength));
}
function boundedText(value: unknown, maximum: number): value is string { return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum; }
function isLegacyActionDescriptor(detail: Record<string, unknown>) {
  return Object.keys(detail).every((key) => key === "type" || key === "label" || key === "section" || key === "detail")
    && detail.section === "Gợi ý hành động"
    && record(detail.detail)
    && Object.keys(detail.detail).length === 2
    && detail.detail["Nhãn"] === "Hành động gợi ý"
    && detail.detail["Giải thích"] === "Gợi ý thao tác tiếp theo từ câu trả lời, không phải nguồn đã xác minh.";
}
function isValidRange(value: unknown, answerText: string, duplicates: Set<unknown>, provenance: Map<string, PlanningProvenance>) {
  if (!record(value) || typeof value.id !== "string" || duplicates.has(value.id) || typeof value.start !== "number" || typeof value.end !== "number" || typeof value.text !== "string" || !types.has(value.type as PlanningAnnotation["type"])) return false;
  return Number.isInteger(value.start) && Number.isInteger(value.end) && value.start >= 0 && value.end > value.start && value.end <= answerText.length && answerText.slice(value.start, value.end) === value.text && Boolean(detailFor(value, value.type as PlanningAnnotation["type"], value.text, provenance));
}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function order(left: unknown, right: unknown) { return (record(left) && typeof left.start === "number" ? left.start : Number.MAX_SAFE_INTEGER) - (record(right) && typeof right.start === "number" ? right.start : Number.MAX_SAFE_INTEGER); }
