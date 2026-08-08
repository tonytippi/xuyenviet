import { cancelYoutubeDiscoveryRunIfDisabled, claimNextYoutubeDiscoveryRun, claimYoutubeDiscoveryPlanning, finishYoutubeDiscoveryRun, refreshYoutubeDiscoverySystemProposals, retryYoutubeDiscoveryRun, scheduleYoutubeDiscoveryDueRuns } from "@xuyenviet/database";
import type { WorkerPollObservation } from "@xuyenviet/contracts";
import { createUnavailableAiAskDiscoveryQuerySignalPort, createUnavailableKnowledgeDiscoveryQuerySignalPort, type AiAskDiscoveryQuerySignalPort, type DiscoveryQuerySignalPortResult, type KnowledgeDiscoveryQuerySignalPort } from "@xuyenviet/domain";

type DiscoveryStageResult = "complete" | "stage_transient";
const planningPortTimeoutMs = 1_000;

// This is deliberately private and finite; Story 18.4 replaces the no-provider stage.
let executionStage: (() => Promise<DiscoveryStageResult>) | undefined;
let knowledgePlanningPort: KnowledgeDiscoveryQuerySignalPort = createUnavailableKnowledgeDiscoveryQuerySignalPort();
let aiAskPlanningPort: AiAskDiscoveryQuerySignalPort = createUnavailableAiAskDiscoveryQuerySignalPort();

export async function runYoutubeDiscoveryPoll(workerId: string): Promise<WorkerPollObservation> {
  const planning = await claimYoutubeDiscoveryPlanning(workerId);
  if (planning) {
    const results = await Promise.all([readPlanningPort(knowledgePlanningPort), readPlanningPort(aiAskPlanningPort)]);
    const outcome = await refreshYoutubeDiscoverySystemProposals(planning, results);
    return { capability: "youtube.discovery", resultCode: outcome === "contended" ? "contended" : "success", durableId: planning.id, leaseRecovery: "none" };
  }
  await scheduleYoutubeDiscoveryDueRuns();
  const claim = await claimNextYoutubeDiscoveryRun({ workerId });
  if (!claim.claim) return { capability: "youtube.discovery", resultCode: claim.contended ? "contended" : claim.recoveredTerminalCount ? "failure" : claim.recoveredCount ? "success" : "no_work", leaseRecovery: claim.recoveredCount ? "recovered" : claim.contended ? "contended" : "none", ...(claim.recoveredCount ? { leaseRecoveryCount: claim.recoveredCount } : {}) };
  const active = await cancelYoutubeDiscoveryRunIfDisabled(claim.claim);
  if (active !== "active") return observationFor(claim.claim, active === "cancelled" ? "success" : "contended");
  let stageResult: DiscoveryStageResult;
  try {
    stageResult = executionStage ? await executionStage() : "complete";
  } catch {
    stageResult = "stage_transient";
  }
  const disposition = stageResult === "complete" ? await finishYoutubeDiscoveryRun(claim.claim) : await retryYoutubeDiscoveryRun(claim.claim);
  return observationFor(claim.claim, disposition === "completed" ? "success" : disposition === "retrying" ? "retry" : disposition === "failed" ? "failure" : disposition === "cancelled" ? "success" : "contended");
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

async function readPlanningPort(port: KnowledgeDiscoveryQuerySignalPort | AiAskDiscoveryQuerySignalPort): Promise<DiscoveryQuerySignalPortResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // A finite poll must not be held by an owner port that never settles.
    return await Promise.race([
      Promise.resolve().then(() => port.readSignals()).catch(() => ({ status: "unavailable", code: "source_unavailable" } as const)),
      new Promise<DiscoveryQuerySignalPortResult>((resolve) => { timeout = setTimeout(() => resolve({ status: "unavailable", code: "source_timeout" }), planningPortTimeoutMs); }),
    ]);
  } finally { if (timeout) clearTimeout(timeout); }
}

/** Public composition seam. Owners bind their explicit aggregate-only ports here. */
export function bindYoutubeDiscoveryPlanningPorts(knowledge: KnowledgeDiscoveryQuerySignalPort, aiAsk: AiAskDiscoveryQuerySignalPort) { knowledgePlanningPort = knowledge; aiAskPlanningPort = aiAsk; }

/** @internal Test-only safe-port seam. */
export function setYoutubeDiscoveryPlanningPortsForTest(knowledge: (() => Promise<DiscoveryQuerySignalPortResult>) | undefined, aiAsk: (() => Promise<DiscoveryQuerySignalPortResult>) | undefined) {
  bindYoutubeDiscoveryPlanningPorts(knowledge ? { readSignals: knowledge } : createUnavailableKnowledgeDiscoveryQuerySignalPort(), aiAsk ? { readSignals: aiAsk } : createUnavailableAiAskDiscoveryQuerySignalPort());
}
