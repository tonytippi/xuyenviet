import { cancelYoutubeDiscoveryRunIfDisabled, claimNextYoutubeDiscoveryRun, finishYoutubeDiscoveryRun, retryYoutubeDiscoveryRun } from "@xuyenviet/database";
import type { WorkerPollObservation } from "@xuyenviet/contracts";

type DiscoveryStageResult = "complete" | "stage_transient";

// This is deliberately private and finite; Story 18.4 replaces the no-provider stage.
let executionStage: (() => Promise<DiscoveryStageResult>) | undefined;

export async function runYoutubeDiscoveryPoll(workerId: string): Promise<WorkerPollObservation> {
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
