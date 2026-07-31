import { claimNextKnowledgeIngestionCandidate, claimNextKnowledgeIngestionJob, recoverKnowledgeIngestionJobs } from "./ingestion-jobs";
import { runKnowledgeIngestionCandidatePipeline, runKnowledgeIngestionPipeline } from "./ingestion-pipeline";

const defaultPollIntervalMs = 5_000;

export async function processNextKnowledgeIngestionJob(workerId: string) {
  await recoverKnowledgeIngestionJobs();
  const candidate = await claimNextKnowledgeIngestionCandidate({ workerId });
  if (candidate) return runKnowledgeIngestionCandidatePipeline(candidate);
  const claim = await claimNextKnowledgeIngestionJob({ workerId });
  return claim ? runKnowledgeIngestionPipeline(claim) : null;
}

export async function runKnowledgeIngestionWorkerLoop(options: { once?: boolean; workerId?: string; pollIntervalMs?: number; signal?: AbortSignal; onPollComplete?: () => void | Promise<void> } = {}) {
  const workerId = options.workerId ?? `knowledge-ingestion-worker-${process.pid}`;
  const pollIntervalMs = options.pollIntervalMs ?? getWorkerPollIntervalMs();

  while (!options.signal?.aborted) {
    if (options.signal?.aborted) break;
    const result = await processNextKnowledgeIngestionJob(workerId);
    await options.onPollComplete?.();

    if (options.once) return result;
    if (!result) await sleep(pollIntervalMs, options.signal);
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
