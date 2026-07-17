import type { CaptureArtifact } from "./capture-cache";

export type FlushStatus = "updated" | "not_queued" | "no_longer_queued" | "duplicate";

export async function flushCachedArtifact(input: {
  artifact: CaptureArtifact;
  sourceId: string;
  prepareImport: () => Promise<{ correlationToken: string; outcome: string; ownsLease: boolean; leaseOwner: string | null }>;
  importCommitted: (correlationToken: string) => Promise<boolean>;
  flush: (correlationToken: string) => Promise<FlushStatus>;
  finishImport: (correlationToken: string, leaseOwner: string, outcome: "imported" | "terminal" | "retryable") => Promise<void>;
}) {
  const attempt = await input.prepareImport();
  if (!attempt.ownsLease) {
    if (await input.importCommitted(attempt.correlationToken)) return "imported" as const;
    return "in_progress" as const;
  }
  if (attempt.outcome === "awaiting_flush" || attempt.outcome === "retryable") {
    if (await input.importCommitted(attempt.correlationToken)) {
      await input.finishImport(attempt.correlationToken, attempt.leaseOwner!, "imported");
      return "imported" as const;
    }
  }
  try {
    const status = await input.flush(attempt.correlationToken);
    const outcome = status === "updated" ? "imported" : "terminal";
    await input.finishImport(attempt.correlationToken, attempt.leaseOwner!, outcome);
    return status;
  } catch {
    await input.finishImport(attempt.correlationToken, attempt.leaseOwner!, "retryable");
    throw new Error("production_flush_ambiguous");
  }
}

export async function captureCacheFirst<TArtifact>(input: {
  forceLive: boolean;
  cached: TArtifact | null;
  captureLive: () => Promise<TArtifact>;
  admit: (artifact: TArtifact) => Promise<TArtifact>;
  flush: (artifact: TArtifact) => Promise<FlushStatus | "imported">;
  supersedePrevious?: (artifact: TArtifact) => Promise<void>;
}) {
  if (!input.forceLive && input.cached) return { origin: "cache" as const, result: await input.flush(input.cached) };
  const captured = await input.captureLive();
  const admitted = await input.admit(captured);
  const result = await input.flush(admitted);
  if (input.forceLive && input.supersedePrevious && (result === "updated" || result === "imported")) await input.supersedePrevious(admitted);
  return { origin: "live" as const, result };
}
