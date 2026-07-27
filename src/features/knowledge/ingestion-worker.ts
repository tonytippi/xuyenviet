import "server-only";

import { claimNextKnowledgeIngestionCandidate, claimNextKnowledgeIngestionJob, recoverKnowledgeIngestionJobs } from "@/features/knowledge/ingestion-jobs";
import { runKnowledgeIngestionCandidatePipeline, runKnowledgeIngestionPipeline } from "@/features/knowledge/ingestion-pipeline";

const defaultPollIntervalMs = 5_000;

export type KnowledgeIngestionWorkerWork =
  | { kind: "candidate"; candidateId: string; jobId: string; sourceId: string; captureVersionId: string; stage: string }
  | { kind: "job"; jobId: string; sourceId: string; captureVersionId: string; stage: string };

export async function processNextKnowledgeIngestionJob(workerId: string, onWorkClaimed?: (work: KnowledgeIngestionWorkerWork) => void | Promise<void>) {
  await recoverKnowledgeIngestionJobs();
  const candidate = await claimNextKnowledgeIngestionCandidate({ workerId });
  if (candidate) {
    await onWorkClaimed?.({ kind: "candidate", candidateId: candidate.candidateId, jobId: candidate.jobId, sourceId: candidate.sourceId, captureVersionId: candidate.captureVersionId, stage: candidate.stage });
    return runKnowledgeIngestionCandidatePipeline(candidate);
  }
  const claim = await claimNextKnowledgeIngestionJob({ workerId });
  if (!claim) return null;
  await onWorkClaimed?.({ kind: "job", jobId: claim.jobId, sourceId: claim.sourceId, captureVersionId: claim.captureVersionId, stage: claim.stage });
  return runKnowledgeIngestionPipeline(claim);
}

export async function runKnowledgeIngestionWorkerLoop(options: { once?: boolean; workerId?: string; pollIntervalMs?: number; signal?: AbortSignal; onPollComplete?: () => void | Promise<void>; onWorkClaimed?: (work: KnowledgeIngestionWorkerWork) => void | Promise<void>; onWorkComplete?: (result: Awaited<ReturnType<typeof processNextKnowledgeIngestionJob>>) => void | Promise<void>; onIdle?: (pollIntervalMs: number) => void | Promise<void> } = {}) {
  const workerId = options.workerId ?? `knowledge-ingestion-worker-${process.pid}`;
  const pollIntervalMs = options.pollIntervalMs ?? getWorkerPollIntervalMs();

  while (!options.signal?.aborted) {
    const result = await processNextKnowledgeIngestionJob(workerId, options.onWorkClaimed);
    await options.onPollComplete?.();
    await options.onWorkComplete?.(result);

    if (options.once) return result;
    if (!result) {
      await options.onIdle?.(pollIntervalMs);
      await sleep(pollIntervalMs, options.signal);
    }
  }

  return { status: "stopped" as const };
}

function getWorkerPollIntervalMs() {
  const value = Number(process.env.KNOWLEDGE_INGESTION_WORKER_POLL_MS);
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 1_000), 60_000) : defaultPollIntervalMs;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
