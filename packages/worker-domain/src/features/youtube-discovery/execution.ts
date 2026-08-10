import { cancelYoutubeDiscoveryRunIfDisabled, claimNextYoutubeDiscoveryRun, claimYoutubeDiscoveryPlanning, finishYoutubeDiscoveryRun, getYoutubeDiscoveryRunQuery, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, refreshYoutubeDiscoverySystemProposals, retainYoutubeDiscoveryRecords, retryYoutubeDiscoveryRun, scheduleYoutubeDiscoveryDueRuns } from "@xuyenviet/database";
import type { WorkerPollObservation } from "@xuyenviet/contracts";
import { createUnavailableAiAskDiscoveryQuerySignalPort, createUnavailableKnowledgeDiscoveryQuerySignalPort, type AiAskDiscoveryQuerySignalPort, type DiscoveryQuerySignalPortResult, type KnowledgeDiscoveryQuerySignalPort, type YoutubeCaptureEligibilityPort } from "@xuyenviet/domain";
import { searchYoutubeVideos } from "./youtube-search";
import { enrichYoutubeVideo } from "./youtube-enrichment";

type DiscoveryStageResult = "complete" | "cancelled" | "stage_transient";
const planningPortTimeoutMs = 1_000;
// Keep external work comfortably inside the active five-minute run lease.
const executionStageTimeoutMs = 240_000;
let executionStageTimeoutOverrideMs: number | undefined;

// This is deliberately private and finite; Story 18.4 replaces the no-provider stage.
let executionStage: (() => Promise<DiscoveryStageResult>) | undefined;
let knowledgePlanningPort: KnowledgeDiscoveryQuerySignalPort = createUnavailableKnowledgeDiscoveryQuerySignalPort();
let aiAskPlanningPort: AiAskDiscoveryQuerySignalPort = createUnavailableAiAskDiscoveryQuerySignalPort();
let youtubeCaptureEligibilityPort: YoutubeCaptureEligibilityPort | undefined;
let youtubeSearch: typeof searchYoutubeVideos = searchYoutubeVideos;
let youtubeEnrichment: typeof enrichYoutubeVideo = enrichYoutubeVideo;
let youtubeDataApiKey: string | undefined;

export async function runYoutubeDiscoveryPoll(workerId: string): Promise<WorkerPollObservation> {
  const planning = await claimYoutubeDiscoveryPlanning(workerId);
  if (planning) {
    const results = await Promise.all([readPlanningPort(knowledgePlanningPort), readPlanningPort(aiAskPlanningPort)]);
    const outcome = await refreshYoutubeDiscoverySystemProposals(planning, results);
    return { capability: "youtube.discovery", resultCode: outcome === "contended" ? "contended" : "success", durableId: planning.id, leaseRecovery: "none" };
  }
  await retainYoutubeDiscoveryRecords();
  await scheduleYoutubeDiscoveryDueRuns();
  const claim = await claimNextYoutubeDiscoveryRun({ workerId });
  if (!claim.claim) return { capability: "youtube.discovery", resultCode: claim.contended ? "contended" : claim.recoveredTerminalCount ? "failure" : claim.recoveredCount ? "success" : "no_work", leaseRecovery: claim.recoveredCount ? "recovered" : claim.contended ? "contended" : "none", ...(claim.recoveredCount ? { leaseRecoveryCount: claim.recoveredCount } : {}) };
  const active = await cancelYoutubeDiscoveryRunIfDisabled(claim.claim);
  if (active !== "active") return observationFor(claim.claim, active === "cancelled" ? "success" : "contended");
  let stageResult: DiscoveryStageResult;
  try {
    // The test seam exercises generic lease mechanics only; real provider work
    // must first read an enabled proposal through the fenced query accessor.
    if (executionStage) stageResult = await executionStage();
    else {
      const run = await getYoutubeDiscoveryRunQuery(claim.claim);
      if (run === "cancelled") return observationFor(claim.claim, (await cancelYoutubeDiscoveryRunIfDisabled(claim.claim, undefined, true)) === "cancelled" ? "success" : "contended");
      if (run === "contended") return observationFor(claim.claim, "contended");
      else if (!youtubeCaptureEligibilityPort) stageResult = "stage_transient";
      else {
        const activeClaim = claim.claim!;
        const apiKey = youtubeDataApiKey!;
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const timedOut = Symbol("youtube_discovery_execution_timeout");
        try {
          const result = await Promise.race([
            runYoutubeDiscoveryExecutionStage(claim.claim, run.queryText, controller.signal),
            new Promise<typeof timedOut>((resolve) => { timeout = setTimeout(() => { controller.abort(); resolve(timedOut); }, executionStageTimeoutOverrideMs ?? executionStageTimeoutMs); }),
          ]);
          if (result === timedOut) stageResult = "stage_transient";
          else {
            const persisted = await persistYoutubeDiscoveryCandidates(activeClaim, result);
            if (persisted === "cancelled") return observationFor(activeClaim, "success");
            if (persisted !== "completed") stageResult = "stage_transient";
            else {
              for (const candidate of result) {
                if ((await cancelYoutubeDiscoveryRunIfDisabled(activeClaim, undefined, true)) !== "active") throw new Error("youtube_enrichment_cancelled");
                const enrichment = await youtubeEnrichment(candidate.videoId, apiKey, undefined, controller.signal, async () => {
                  if ((await cancelYoutubeDiscoveryRunIfDisabled(activeClaim, undefined, true)) !== "active") throw new Error("youtube_enrichment_cancelled");
                });
                const stored = await persistYoutubeDiscoveryEnrichment(activeClaim, enrichment);
                if (stored === "cancelled") return observationFor(activeClaim, "success");
                if (stored !== "completed") throw new Error("youtube_enrichment_contended");
              }
              stageResult = "complete";
            }
          }
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      }
    }
  } catch (error) {
    stageResult = error instanceof Error && error.message === "youtube_enrichment_cancelled" ? "cancelled" : "stage_transient";
  }
  if (stageResult === "cancelled") return observationFor(claim.claim, "success");
  const disposition = stageResult === "complete" ? await finishYoutubeDiscoveryRun(claim.claim) : await retryYoutubeDiscoveryRun(claim.claim);
  return observationFor(claim.claim, disposition === "completed" ? "success" : disposition === "retrying" ? "retry" : disposition === "failed" ? "failure" : disposition === "cancelled" ? "success" : "contended");
}

async function runYoutubeDiscoveryExecutionStage(claim: NonNullable<Awaited<ReturnType<typeof claimNextYoutubeDiscoveryRun>>["claim"]>, queryText: string, signal: AbortSignal) {
  if (!youtubeDataApiKey) throw new Error("youtube_search_configuration");
  const requireActive = async () => {
    if ((await cancelYoutubeDiscoveryRunIfDisabled(claim, undefined, true)) !== "active") {
      throw new Error("youtube_enrichment_cancelled");
    }
  };
  await requireActive();
  const results = await youtubeSearch(queryText, youtubeDataApiKey, undefined, signal);
  const eligible = [];
  for (const result of results) {
    await requireActive();
    const status = await youtubeCaptureEligibilityPort!.check(result.videoId, signal);
    if (status === "unavailable" || signal.aborted) throw new Error("youtube_capture_eligibility_unavailable");
    if (status === "eligible") eligible.push(result);
  }
  return eligible;
}

function observationFor(claim: NonNullable<Awaited<ReturnType<typeof claimNextYoutubeDiscoveryRun>>["claim"]>, resultCode: WorkerPollObservation["resultCode"]): WorkerPollObservation {
  return {
    capability: "youtube.discovery",
    resultCode,
    durableId: claim.id,
    retryCount: claim.attemptCount,
    jobLagMs: Math.max(0, claim.claimedAt.getTime() - claim.nextRunAt.getTime()),
    leaseRecovery: claim.recoveredCount ? "recovered" : "none",
    ...(claim.recoveredCount ? { leaseRecoveryCount: claim.recoveredCount } : {}),
  };
}

/** @internal Test-only stage seam. It is intentionally not exported from the package barrel. */
export function setYoutubeDiscoveryExecutionStageForTest(stage: (() => Promise<DiscoveryStageResult>) | undefined) {
  executionStage = stage;
}

/** @internal Test-only enrichment seam. */
export function setYoutubeDiscoveryEnrichmentForTest(enrichment: typeof enrichYoutubeVideo | undefined) {
  youtubeEnrichment = enrichment ?? enrichYoutubeVideo;
}

async function readPlanningPort(port: KnowledgeDiscoveryQuerySignalPort | AiAskDiscoveryQuerySignalPort): Promise<DiscoveryQuerySignalPortResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    // A finite poll must not be held by an owner port that never settles.
    return await Promise.race([
      Promise.resolve().then(() => port.readSignals(controller.signal)).catch(() => ({ status: "unavailable", code: "source_unavailable" } as const)),
      new Promise<DiscoveryQuerySignalPortResult>((resolve) => { timeout = setTimeout(() => { controller.abort(); resolve({ status: "unavailable", code: "source_timeout" }); }, planningPortTimeoutMs); }),
    ]);
  } finally { if (timeout) clearTimeout(timeout); }
}

/** Public composition seam. Owners bind their explicit aggregate-only ports here. */
export function bindYoutubeDiscoveryPlanningPorts(knowledge: KnowledgeDiscoveryQuerySignalPort, aiAsk: AiAskDiscoveryQuerySignalPort) { knowledgePlanningPort = knowledge; aiAskPlanningPort = aiAsk; }
export function bindYoutubeDiscoveryExecutionPorts(eligibility: YoutubeCaptureEligibilityPort, search: typeof searchYoutubeVideos = searchYoutubeVideos, apiKey?: string) {
  youtubeCaptureEligibilityPort = eligibility;
  youtubeSearch = search;
  youtubeDataApiKey = apiKey?.trim() || undefined;
}

/** @internal Test-only deadline seam; production execution uses the lease-safe value. */
export function setYoutubeDiscoveryExecutionTimeoutForTest(timeoutMs: number | undefined) { executionStageTimeoutOverrideMs = timeoutMs; }

/** @internal Test-only safe-port seam. */
export function setYoutubeDiscoveryPlanningPortsForTest(knowledge: ((signal?: AbortSignal) => Promise<DiscoveryQuerySignalPortResult>) | undefined, aiAsk: ((signal?: AbortSignal) => Promise<DiscoveryQuerySignalPortResult>) | undefined) {
  bindYoutubeDiscoveryPlanningPorts(knowledge ? { readSignals: knowledge } : createUnavailableKnowledgeDiscoveryQuerySignalPort(), aiAsk ? { readSignals: aiAsk } : createUnavailableAiAskDiscoveryQuerySignalPort());
}
