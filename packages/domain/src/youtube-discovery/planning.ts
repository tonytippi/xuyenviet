import { createHash } from "node:crypto";

export const safeDiscoveryQueryReasons = ["coverage_gap", "freshness_risk", "unresolved_conflict", "anonymized_demand"] as const;
export type SafeDiscoveryQueryReason = (typeof safeDiscoveryQueryReasons)[number];
export type SafeDiscoveryQuerySignal = Readonly<{ reason: SafeDiscoveryQueryReason; geography: string; taxonomy: string; priority: number }>;
export type DiscoveryQuerySignalPortResult = Readonly<{ status: "available"; signals: readonly SafeDiscoveryQuerySignal[] }> | Readonly<{ status: "unavailable"; code: "source_unavailable" | "source_timeout" | "source_invalid" }>;
export type KnowledgeDiscoveryQuerySignalPort = Readonly<{ readSignals(): Promise<DiscoveryQuerySignalPortResult> }>;
export type AiAskDiscoveryQuerySignalPort = Readonly<{ readSignals(): Promise<DiscoveryQuerySignalPortResult> }>;
export type DerivedDiscoveryQuery = SafeDiscoveryQuerySignal & Readonly<{ targetDigest: string; queryText: string }>;

const safeText = /^[\p{L}\p{N} -]{1,80}$/u;

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

export function deriveDiscoveryQueries(results: readonly unknown[]): { queries: DerivedDiscoveryQuery[]; unavailableCodes: Array<"source_unavailable" | "source_timeout" | "source_invalid"> } {
  const merged = new Map<string, SafeDiscoveryQuerySignal>();
  const unavailableCodes: Array<"source_unavailable" | "source_timeout" | "source_invalid"> = [];
  for (const result of results) {
    const parsed = parseDiscoveryQuerySignalPortResult(result);
    if (!parsed) { unavailableCodes.push("source_invalid"); continue; }
    if (parsed.status === "unavailable") { unavailableCodes.push(parsed.code); continue; }
    for (const normalized of parsed.signals) {
      const key = `${normalized.reason}\u0000${normalized.geography}\u0000${normalized.taxonomy}`;
      const existing = merged.get(key);
      if (!existing || normalized.priority > existing.priority) merged.set(key, normalized);
    }
  }
  return {
    queries: [...merged.values()].sort(compareSignal).map((signal) => ({ ...signal, targetDigest: createHash("sha256").update(`${signal.reason}\u0000${signal.geography}\u0000${signal.taxonomy}`, "utf8").digest("hex"), queryText: `${signal.geography} ${signal.taxonomy}` })),
    unavailableCodes: [...new Set(unavailableCodes)].sort(),
  };
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
  return isReason(value.reason) && safeText.test(geography) && safeText.test(taxonomy) && Number.isSafeInteger(value.priority) && value.priority >= 1 && value.priority <= 100 ? { reason: value.reason, geography, taxonomy, priority: value.priority } : null;
}
function isSignal(value: unknown): value is SafeDiscoveryQuerySignal { return record(value) && exactKeys(value, ["reason", "geography", "taxonomy", "priority"]) && isReason(value.reason) && typeof value.geography === "string" && typeof value.taxonomy === "string" && Number.isSafeInteger(value.priority); }
function isReason(value: unknown): value is SafeDiscoveryQueryReason { return safeDiscoveryQueryReasons.includes(value as SafeDiscoveryQueryReason); }
function compareSignal(a: SafeDiscoveryQuerySignal, b: SafeDiscoveryQuerySignal) { return a.reason.localeCompare(b.reason) || a.geography.localeCompare(b.geography) || a.taxonomy.localeCompare(b.taxonomy); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every((key) => key in value); }
