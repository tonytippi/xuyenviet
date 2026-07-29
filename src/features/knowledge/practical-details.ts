import "server-only";

const maxDetailStringLength = 500;
const maxDetailArrayItems = 10;
const maxOrderedStops = 40;
const maxTags = 12;
const maxTagLength = 40;
const substantialRawOverlapLength = 160;

export type PracticalDetails = Record<string, string | string[]>;

export function normalizePracticalDetails(value: unknown): PracticalDetails | null {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value);
  if (entries.length > 20) return null;
  const details: PracticalDetails = {};
  for (const [key, detailValue] of entries) {
    const safeKey = bounded(key, 60);
    const safeValue = normalizeDetailValue(safeKey, detailValue);
    if (!safeKey || safeValue === null) return null;
    details[safeKey] = safeValue;
  }
  return details;
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((tag) => bounded(tag, maxTagLength)).filter((tag): tag is string => tag !== null))).slice(0, maxTags);
}

export function containsUnsafePracticalFields(input: { title: string; locationName: string | null; routeSegment: string | null; summary: string; practicalDetails: PracticalDetails; tags: string[] }, rawText: string) {
  const strictValues = [input.title, input.locationName, input.routeSegment, input.summary, ...input.tags, ...Object.keys(input.practicalDetails)].filter((value): value is string => value !== null);
  return containsUnsafeRawOverlap(strictValues, rawText, false) || Object.entries(input.practicalDetails).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((item) => ({ key, value: item }))).some((detail) => containsUnsafeRawOverlap([detail.value], rawText, isPublicContactDetailKey(detail.key)));
}

export function containsUnsafePracticalPayload(practicalDetails: PracticalDetails, tags: string[], rawText: string) {
  return containsUnsafeRawOverlap([...tags, ...Object.keys(practicalDetails)], rawText, false) || Object.entries(practicalDetails).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((item) => ({ key, value: item }))).some((detail) => containsUnsafeRawOverlap([detail.value], rawText, isPublicContactDetailKey(detail.key)));
}

export function getUnsafeIngestionPracticalFieldReason(input: { title: string; locationName: string | null; routeSegment: string | null; summary: string; practicalDetails: PracticalDetails; tags: string[] }, rawText: string) {
  const strictValues = [input.title, input.locationName, input.routeSegment, input.summary, ...input.tags, ...Object.keys(input.practicalDetails)].filter((value): value is string => value !== null);
  const detailValues = Object.entries(input.practicalDetails).flatMap(([key, value]) => (Array.isArray(value) ? value : [value]).map((value) => ({ key, value })));
  const values = [...strictValues, ...detailValues.map((detail) => detail.value)];
  if (values.some((value) => containsSensitivePattern(normalizeForOverlap(value)))) return "candidate_sensitive_content" as const;
  if (strictValues.some((value) => hasSubstantialRawOverlap(value, rawText)) || detailValues.some((detail) => detail.key !== "ordered_stops" && hasSubstantialRawOverlap(detail.value, rawText))) return "candidate_unsafe_raw_overlap" as const;
  return null;
}

export function mergePracticalDetails(target: unknown, incoming: PracticalDetails): PracticalDetails {
  const existing = normalizePracticalDetails(target) ?? {};
  const merged: PracticalDetails = { ...existing };
  for (const [key, incomingValue] of Object.entries(incoming)) {
    if (!(key in merged)) {
      if (Object.keys(merged).length >= 20) continue;
      merged[key] = incomingValue;
      continue;
    }
    const targetValues = asArray(merged[key]);
    const limit = key === "ordered_stops" ? maxOrderedStops : maxDetailArrayItems;
    const values = key === "ordered_stops"
      ? [...targetValues, ...asArray(incomingValue).filter((value) => !targetValues.includes(value))].slice(0, limit)
      : Array.from(new Set([...targetValues, ...asArray(incomingValue)])).slice(0, limit);
    merged[key] = values.length === 1 && !Array.isArray(merged[key]) && !Array.isArray(incomingValue) ? values[0]! : values;
  }
  return merged;
}

export function mergeTags(target: unknown, incoming: string[]) {
  return Array.from(new Set([...normalizeTags(target), ...incoming])).slice(0, maxTags);
}

function normalizeDetailValue(key: string | null, value: unknown): string | string[] | null {
  if (typeof value === "string") return bounded(value, maxDetailStringLength);
  if (!Array.isArray(value) || value.length > (key === "ordered_stops" ? maxOrderedStops : maxDetailArrayItems)) return null;
  const values = value.map((item) => key === "ordered_stops" ? normalizeOrderedStop(item) : bounded(item, maxDetailStringLength));
  return values.length > 0 && values.every((item): item is string => item !== null) ? values : null;
}

function normalizeOrderedStop(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = bounded(stripOrderedStopFormatting(value), 160);
  const withoutDecimalNotation = normalized?.replace(/\d+\.\d+/g, "") ?? "";
  if (!normalized || normalized.split(/\s+/).length > 12 || /[\r\n\[\]{}.,;:!?]/.test(withoutDecimalNotation) || /^\d{1,3}\s*[.)]\s+/.test(normalized) || /(rẽ|đi tiếp|chạy tiếp|băng qua|vượt|lướt qua|theo đường)/i.test(normalized)) return null;
  return normalized;
}

function stripOrderedStopFormatting(value: string) {
  const withoutListNumber = value.replace(/^\s*\d{1,3}\s*[.)]\s+/, "").trim();
  const trailingAnnotation = withoutListNumber.match(/\s*\(([^()]*)\)\s*$/);
  return trailingAnnotation && (/^\s*\d{1,3}\s*$/.test(trailingAnnotation[1]) || /(rẽ|đường|lối|tránh|đoạn)/i.test(trailingAnnotation[1])) ? withoutListNumber.slice(0, trailingAnnotation.index).trim() : withoutListNumber;
}

function containsUnsafeRawOverlap(values: Array<string | null>, rawText: string, allowContactValues: boolean) {
  const normalizedRaw = normalizeForOverlap(rawText);
  return values.some((value) => {
    if (!value) return false;
    const normalizedValue = normalizeForOverlap(value);
    return (!allowContactValues && containsSensitivePattern(normalizedValue)) || (normalizedValue.length >= 24 && normalizedRaw.includes(normalizedValue));
  });
}

function hasSubstantialRawOverlap(value: string, rawText: string) {
  const normalizedValue = normalizeForOverlap(value);
  return normalizedValue.length >= substantialRawOverlapLength && normalizeForOverlap(rawText).includes(normalizedValue);
}

function isPublicContactDetailKey(key: string) { return /contact|phone|tel|hotline|email|booking|reservation|zalo/i.test(key); }
function containsSensitivePattern(value: string) { return /(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/.test(value) || /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/.test(value); }
function normalizeForOverlap(value: string) { return value.toLowerCase().replace(/\s+/g, " ").trim(); }
function bounded(value: unknown, max: number) { return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function asArray(value: string | string[]) { return Array.isArray(value) ? value : [value]; }
