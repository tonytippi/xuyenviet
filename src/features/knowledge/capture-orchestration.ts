import type { CaptureArtifact } from "./capture-cache";

export type FlushStatus = "updated" | "not_queued" | "no_longer_queued" | "duplicate";

export class CaptureImportError extends Error {
  constructor(stage: "prepare" | "commit_check" | "flush" | "finish", reason?: string) {
    super(`capture_import_${stage}_${reason ?? "failed"}`);
  }
}

export async function flushCachedArtifact(input: {
  artifact: CaptureArtifact;
  sourceId: string;
  prepareImport: () => Promise<{ correlationToken: string; outcome: string; ownsLease: boolean; leaseOwner: string | null }>;
  importCommitted: (correlationToken: string) => Promise<boolean>;
  flush: (correlationToken: string) => Promise<FlushStatus>;
  finishImport: (correlationToken: string, leaseOwner: string, outcome: "imported" | "terminal" | "retryable") => Promise<void>;
}) {
  let attempt;
  try {
    attempt = await input.prepareImport();
  } catch {
    throw new CaptureImportError("prepare");
  }
  if (!attempt.ownsLease) {
    try {
      if (await input.importCommitted(attempt.correlationToken)) return "imported" as const;
    } catch {
      throw new CaptureImportError("commit_check");
    }
    return "in_progress" as const;
  }
  if (attempt.outcome === "awaiting_flush" || attempt.outcome === "retryable") {
    let committed: boolean;
    try {
      committed = await input.importCommitted(attempt.correlationToken);
    } catch {
      throw new CaptureImportError("commit_check");
    }
    if (committed) {
      try {
        await input.finishImport(attempt.correlationToken, attempt.leaseOwner!, "imported");
        return "imported" as const;
      } catch {
        throw new CaptureImportError("finish");
      }
    }
  }
  let status: FlushStatus;
  try {
    status = await input.flush(attempt.correlationToken);
  } catch (error) {
    try {
      await input.finishImport(attempt.correlationToken, attempt.leaseOwner!, "retryable");
    } catch {
      throw new CaptureImportError("finish");
    }
    throw new CaptureImportError("flush", safeImportFailureReason(error));
  }
  const outcome = status === "updated" ? "imported" : "terminal";
  try {
    await input.finishImport(attempt.correlationToken, attempt.leaseOwner!, outcome);
  } catch {
    throw new CaptureImportError("finish");
  }
  return status;
}

function safeImportFailureReason(error: unknown) {
  if (error instanceof Error && error.name === "SourceCaptureValidationError") return safeValidationFailureReason(error.message);
  if (error instanceof Error && error.name === "KnowledgeIngestionJobError") return "ingestion_job_failed";
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : null;
  return code && /^[0-9A-Z]{5}$/.test(code) ? `postgres_${code.toLowerCase()}` : "failed";
}

function safeValidationFailureReason(message: string) {
  if (/^Capture metadata /i.test(message)) return "metadata_failed";
  if (/^Captured readable material /i.test(message)) return "evidence_failed";
  if (/^Source (does not exist|is no longer eligible)/i.test(message)) return "source_failed";
  return "validation_failed";
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
