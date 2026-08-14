import { createHash } from "node:crypto";

export const safeDiscoveryQueryReasons = ["coverage_gap", "freshness_risk", "unresolved_conflict", "anonymized_demand"] as const;
export type SafeDiscoveryQueryReason = (typeof safeDiscoveryQueryReasons)[number];
export type SafeDiscoveryQuerySignal = Readonly<{ reason: SafeDiscoveryQueryReason; geography: string; taxonomy: string; priority: number; missionActionId?: string }>;
export type DiscoveryQuerySignalPortResult = Readonly<{ status: "available"; signals: readonly SafeDiscoveryQuerySignal[] }> | Readonly<{ status: "unavailable"; code: "source_unavailable" | "source_timeout" | "source_invalid" }>;
export type KnowledgeDiscoveryQuerySignalPort = Readonly<{ readSignals(signal?: AbortSignal): Promise<DiscoveryQuerySignalPortResult> }>;
export type AiAskDiscoveryQuerySignalPort = Readonly<{ readSignals(signal?: AbortSignal): Promise<DiscoveryQuerySignalPortResult> }>;
export type DerivedDiscoveryQuery = SafeDiscoveryQuerySignal & Readonly<{ targetDigest: string; queryText: string; queryBuilderVersion: number }>;

const safeGeography = /^[\p{L}\p{N} -]{1,80}$/u;
const safeTaxonomy = /^[\p{L}\p{N}_ -]{1,80}$/u;

export function parseDiscoveryQuerySignalPortResult(value: unknown): DiscoveryQuerySignalPortResult | null {
  if (!record(value)) return null;
  const keys = Object.keys(value);
  if (value.status === "unavailable") return keys.length === 2 && keys.includes("status") && keys.includes("code") && ["source_unavailable", "source_timeout", "source_invalid"].includes(value.code as string) ? value as DiscoveryQuerySignalPortResult : null;
  if (value.status !== "available" || keys.length !== 2 || !keys.includes("status") || !keys.includes("signals") || !Array.isArray(value.signals) || value.signals.length > 100) return null;
  // A source is atomic: accepting its valid subset would make a malformed
  // source silently affect Discovery planning.
  const signals = value.signals.map((signal) => isSignal(signal) ? normalize(signal) : null);
  return signals.every((signal): signal is SafeDiscoveryQuerySignal => signal !== null) ? { status: "available", signals } : null;
}

export function deriveDiscoveryQueries(results: readonly unknown[], queryBuilderVersion = 1): { queries: DerivedDiscoveryQuery[]; unavailableCodes: Array<"source_unavailable" | "source_timeout" | "source_invalid"> } {
  if (queryBuilderVersion !== 1 && queryBuilderVersion !== 2) throw new Error("Unsupported YouTube Discovery query builder version.");
  const merged = new Map<string, SafeDiscoveryQuerySignal>();
  const unavailableCodes: Array<"source_unavailable" | "source_timeout" | "source_invalid"> = [];
  for (const result of results) {
    const parsed = parseDiscoveryQuerySignalPortResult(result);
    if (!parsed) { unavailableCodes.push("source_invalid"); continue; }
    if (parsed.status === "unavailable") { unavailableCodes.push(parsed.code); continue; }
    for (const normalized of parsed.signals) {
      const key = `${normalized.reason}\u0000${normalized.geography}\u0000${normalized.taxonomy}\u0000${normalized.missionActionId ?? ""}`;
      const existing = merged.get(key);
      if (!existing || normalized.priority > existing.priority) merged.set(key, normalized);
    }
  }
  return {
    queries: [...merged.values()].sort(compareSignal).map((signal) => ({ ...signal, targetDigest: createHash("sha256").update(`${signal.reason}\u0000${signal.geography}\u0000${signal.taxonomy}\u0000${signal.missionActionId ?? ""}`, "utf8").digest("hex"), queryText: buildVietnameseDiscoveryQuery(signal, queryBuilderVersion), queryBuilderVersion })),
    unavailableCodes: [...new Set(unavailableCodes)].sort(),
  };
}

function buildVietnameseDiscoveryQuery(signal: SafeDiscoveryQuerySignal, version: number): string {
  const topic = vietnameseRoadUserTopic(signal.taxonomy);
  if (version === 2) return `${signal.geography} ${versionTwoIntent(signal.reason)} ${topic}`;
  if (signal.reason === "anonymized_demand") return `${signal.geography} ${topic}`;
  const intent = signal.reason === "freshness_risk" ? "thông tin mới" : signal.reason === "unresolved_conflict" ? "lưu ý thực tế" : "kinh nghiệm";
  return `${signal.geography} ${intent} ${topic}`;
}

function versionTwoIntent(reason: SafeDiscoveryQueryReason): string {
  if (reason === "freshness_risk") return "thông tin hành trình mới";
  if (reason === "unresolved_conflict") return "lưu ý hành trình thực tế";
  if (reason === "anonymized_demand") return "kinh nghiệm chuyến đi tự lái";
  return "kinh nghiệm hành trình";
}

function vietnameseRoadUserTopic(taxonomy: string): string {
  const normalized = taxonomy.toLocaleLowerCase("en-US").replaceAll("_", " ").trim();
  if (normalized === "route" || normalized === "route note") return "cung đường đi ô tô";
  if (normalized === "cost" || normalized === "cost note") return "chi phí hành trình";
  if (normalized === "parking") return "điểm đỗ xe trên đường";
  if (normalized === "ev charging") return "trạm sạc xe điện";
  if (normalized === "warning") return "lưu ý an toàn trên đường";
  if (normalized === "place") return "điểm dừng chân";
  if (normalized === "food") return "điểm ăn uống trên hành trình";
  if (normalized === "hotel area") return "khu vực lưu trú";
  if (normalized === "activity") return "điểm trải nghiệm trên hành trình";
  if (normalized === "service") return "dịch vụ cho chuyến đi";
  if (normalized === "kid friendly tip") return "kinh nghiệm đi đường cùng trẻ";
  if (normalized === "discount promotion") return "ưu đãi cho chuyến đi";
  if (normalized === "general travel tip") return "kinh nghiệm chuyến đi tự lái";
  return "kinh nghiệm du lịch tự lái";
}

export function createUnavailableKnowledgeDiscoveryQuerySignalPort(): KnowledgeDiscoveryQuerySignalPort {
  return { async readSignals() { return { status: "unavailable", code: "source_unavailable" }; } };
}

export function createUnavailableAiAskDiscoveryQuerySignalPort(): AiAskDiscoveryQuerySignalPort {
  return { async readSignals() { return { status: "unavailable", code: "source_unavailable" }; } };
}

function normalize(value: SafeDiscoveryQuerySignal): SafeDiscoveryQuerySignal | null {
  const geography = value.geography.normalize("NFC").trim();
  const taxonomy = value.taxonomy.normalize("NFC").trim();
  return isReason(value.reason) && safeGeography.test(geography) && safeTaxonomy.test(taxonomy) && Number.isSafeInteger(value.priority) && value.priority >= 1 && value.priority <= 100 && (value.missionActionId === undefined || /^mission-[a-f0-9]{32}$/.test(value.missionActionId)) ? { reason: value.reason, geography, taxonomy, priority: value.priority, ...(value.missionActionId ? { missionActionId: value.missionActionId } : {}) } : null;
}
function isSignal(value: unknown): value is SafeDiscoveryQuerySignal { return record(value) && (exactKeys(value, ["reason", "geography", "taxonomy", "priority"]) || exactKeys(value, ["reason", "geography", "taxonomy", "priority", "missionActionId"])) && isReason(value.reason) && typeof value.geography === "string" && typeof value.taxonomy === "string" && Number.isSafeInteger(value.priority) && (value.missionActionId === undefined || typeof value.missionActionId === "string"); }
function isReason(value: unknown): value is SafeDiscoveryQueryReason { return safeDiscoveryQueryReasons.includes(value as SafeDiscoveryQueryReason); }
function compareSignal(a: SafeDiscoveryQuerySignal, b: SafeDiscoveryQuerySignal) { return a.reason.localeCompare(b.reason) || a.geography.localeCompare(b.geography) || a.taxonomy.localeCompare(b.taxonomy); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every((key) => key in value); }
