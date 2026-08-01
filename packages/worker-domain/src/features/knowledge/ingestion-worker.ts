import { claimNextKnowledgeIngestionCandidate, claimNextKnowledgeIngestionJob, recoverKnowledgeIngestionJobs } from "./ingestion-jobs";
import { runKnowledgeIngestionCandidatePipeline, runKnowledgeIngestionPipeline } from "./ingestion-pipeline";
import type { WorkerPollObservation } from "@xuyenviet/contracts";

const defaultPollIntervalMs = 5_000;

export async function processNextKnowledgeIngestionJob(workerId: string) {
  const recovery = await recoverKnowledgeIngestionJobs();
  const candidate = await claimNextKnowledgeIngestionCandidate({ workerId });
  if (candidate) {
    const result = await runKnowledgeIngestionCandidatePipeline(candidate);
    return { result, observation: ingestionObservation(recovery.exhausted ? "failure" : candidateDisposition(result), candidate, recovery) };
  }
  const claim = await claimNextKnowledgeIngestionJob({ workerId });
  if (!claim) return { result: null, observation: ingestionObservation(recovery.exhausted ? "failure" : "no_work", undefined, recovery) };
  const result = await runKnowledgeIngestionPipeline(claim);
  return { result, observation: ingestionObservation(recovery.exhausted ? "failure" : result?.outcome === "failed" ? "failure" : result?.outcome === "retry" ? "retry" : result ? "success" : "contended", claim, recovery) };
}

function candidateDisposition(result: Awaited<ReturnType<typeof runKnowledgeIngestionCandidatePipeline>>): WorkerPollObservation["resultCode"] {
  if (!result) return "contended";
  if ("stage" in result) {
    if (result.stage === "failed") return "failure";
    return ["queued", "judging", "relating"].includes(result.stage) ? "retry" : "success";
  }
  return "success";
}

export async function runKnowledgeIngestionWorkerLoop(options: { once?: boolean; workerId?: string; pollIntervalMs?: number; signal?: AbortSignal; onPollComplete?: () => void | Promise<void>; onObservation?: (observation: WorkerPollObservation) => void | Promise<void> } = {}) {
  const workerId = options.workerId ?? `knowledge-ingestion-worker-${process.pid}`;
  const pollIntervalMs = options.pollIntervalMs ?? getWorkerPollIntervalMs();

  while (!options.signal?.aborted) {
    if (options.signal?.aborted) break;
    const result = await processNextKnowledgeIngestionJob(workerId);
    try { await options.onObservation?.(result.observation); } catch {}
    await options.onPollComplete?.();

    if (options.once) return result.result;
    if (!result.result) await sleep(pollIntervalMs, options.signal);
  }

  return { status: "stopped" as const };
}

function ingestionObservation(resultCode: WorkerPollObservation["resultCode"], claim: { jobId: string; candidateId?: string; attemptCount: number; claimedAt: Date; nextRunAt: Date } | undefined, recovery?: { recovered: number; exhausted: number }): WorkerPollObservation {
  const recoveryCount = (recovery?.recovered ?? 0) + (recovery?.exhausted ?? 0);
  return {
    capability: "knowledge.ingestion", resultCode,
    ...(claim ? { durableId: claim.candidateId ?? claim.jobId, retryCount: claim.attemptCount, jobLagMs: Math.max(0, claim.claimedAt.getTime() - claim.nextRunAt.getTime()) } : {}),
    leaseRecovery: recoveryCount ? "recovered" : "none",
    ...(recoveryCount ? { leaseRecoveryCount: recoveryCount } : {}),
  };
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
