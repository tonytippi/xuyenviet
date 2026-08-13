import { cancelYoutubeDiscoveryRunIfDisabled, claimNextYoutubeDiscoveryRun, claimYoutubeDiscoveryPlanning, completeYoutubeDiscoveryTriage, finishYoutubeDiscoveryRun, getYoutubeDiscoveryRecommendationBundle, getYoutubeDiscoveryRunQuery, getYoutubeDiscoveryTriageBundle, parseYoutubeDiscoveryTriageAssessment, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryRecommendation, persistYoutubeDiscoveryTriage, refreshYoutubeDiscoverySystemProposals, retainYoutubeDiscoveryRecords, retryYoutubeDiscoveryRun, scheduleYoutubeDiscoveryDueRuns, selectYoutubeDiscoveryTriageModel, type YoutubeDiscoveryRunSafeErrorCode } from "@xuyenviet/database";
import type { WorkerPollObservation } from "@xuyenviet/contracts";
import { createUnavailableAiAskDiscoveryQuerySignalPort, createUnavailableKnowledgeDiscoveryQuerySignalPort, type AiAskDiscoveryQuerySignalPort, type DiscoveryQuerySignalPortResult, type KnowledgeDiscoveryQuerySignalPort, type YoutubeCaptureEligibilityPort } from "@xuyenviet/domain";
import { searchYoutubeVideos } from "./youtube-search";
import { enrichYoutubeVideo } from "./youtube-enrichment";

type DiscoveryStageResult = "complete" | "cancelled" | "stage_transient";
type DiscoveryIncidentCategory = "provider_rate_limited" | "triage_schema_invalid";
type DiscoveryDiagnosticStage = "load_query" | "search" | "persist_candidates" | "enrichment" | "persist_enrichment" | "triage" | "load_recommendation" | "eligibility" | "persist_recommendation";
const planningPortTimeoutMs = 1_000;
// Keep external work comfortably inside the active five-minute run lease.
const executionStageTimeoutMs = 240_000;
const triageTimeoutMs = 10_000;
let executionStageTimeoutOverrideMs: number | undefined;

// This is deliberately private and finite; Story 18.4 replaces the no-provider stage.
let executionStage: (() => Promise<DiscoveryStageResult>) | undefined;
let knowledgePlanningPort: KnowledgeDiscoveryQuerySignalPort = createUnavailableKnowledgeDiscoveryQuerySignalPort();
let aiAskPlanningPort: AiAskDiscoveryQuerySignalPort = createUnavailableAiAskDiscoveryQuerySignalPort();
let youtubeCaptureEligibilityPort: YoutubeCaptureEligibilityPort | undefined;
let youtubeSearch: typeof searchYoutubeVideos = searchYoutubeVideos;
let youtubeEnrichment: typeof enrichYoutubeVideo = enrichYoutubeVideo;
let youtubeTriageCompletion: typeof completeYoutubeDiscoveryTriage = completeYoutubeDiscoveryTriage;
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
  let incidentCategory: DiscoveryIncidentCategory | null = null;
  let retryErrorCode: Exclude<YoutubeDiscoveryRunSafeErrorCode, "retry_exhausted" | "lease_retry_exhausted" | "policy_revoked"> = "stage_transient";
  let lastStage: DiscoveryDiagnosticStage = "load_query";
  try {
    // The test seam exercises generic lease mechanics only; real provider work
    // must first read an enabled proposal through the fenced query accessor.
    if (executionStage) stageResult = await executionStage();
    else {
      const run = await getYoutubeDiscoveryRunQuery(claim.claim);
      if (run === "cancelled") return observationFor(claim.claim, (await cancelYoutubeDiscoveryRunIfDisabled(claim.claim, undefined, true)) === "cancelled" ? "success" : "contended");
      if (run === "contended") return observationFor(claim.claim, "contended");
      else if (!youtubeCaptureEligibilityPort) { stageResult = "stage_transient"; retryErrorCode = "eligibility_unavailable"; }
      else {
        const activeClaim = claim.claim!;
        const apiKey = youtubeDataApiKey!;
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const timedOut = Symbol("youtube_discovery_execution_timeout");
        try {
          const executionDeadlineAt = Date.now() + (executionStageTimeoutOverrideMs ?? executionStageTimeoutMs);
          lastStage = "search";
          const result = await Promise.race([
            runYoutubeDiscoveryExecutionStage(claim.claim, run.queryText, controller.signal),
            new Promise<typeof timedOut>((resolve) => { timeout = setTimeout(() => { controller.abort(); resolve(timedOut); }, executionStageTimeoutOverrideMs ?? executionStageTimeoutMs); }),
          ]);
          if (result === timedOut) { stageResult = "stage_transient"; retryErrorCode = "execution_timeout"; }
          else {
            lastStage = "persist_candidates";
            const persisted = await persistYoutubeDiscoveryCandidates(activeClaim, result);
            if (persisted === "cancelled") return observationFor(activeClaim, "success");
            if (persisted !== "completed") { stageResult = "stage_transient"; retryErrorCode = "stage_transient"; }
            else {
              for (const candidate of result) {
                if ((await cancelYoutubeDiscoveryRunIfDisabled(activeClaim, undefined, true)) !== "active") throw new Error("youtube_enrichment_cancelled");
                lastStage = "enrichment";
                const enrichment = await youtubeEnrichment(candidate.videoId, apiKey, undefined, controller.signal, async () => {
                  if ((await cancelYoutubeDiscoveryRunIfDisabled(activeClaim, undefined, true)) !== "active") throw new Error("youtube_enrichment_cancelled");
                });
                lastStage = "persist_enrichment";
                const stored = await persistYoutubeDiscoveryEnrichment(activeClaim, enrichment);
                if (stored === "cancelled") return observationFor(activeClaim, "success");
                if (stored !== "completed") throw new Error("youtube_enrichment_contended");
                lastStage = "triage";
                const triage = await runYoutubeDiscoveryTriage(activeClaim, candidate.videoId, controller.signal, executionDeadlineAt);
                if (triage === "cancelled") return observationFor(activeClaim, "success");
                if (triage !== "completed") {
                  if (triage === "schema_invalid") incidentCategory = "triage_schema_invalid";
                  else if (triage === "rate_limited") incidentCategory = "provider_rate_limited";
                  throw new Error(triage === "deadline_exhausted" ? "youtube_triage_timeout" : triage === "retry" ? "youtube_triage_transient" : "youtube_triage_contended");
                }
                // Check durable idempotency before crossing the opaque owner-port boundary.
                lastStage = "load_recommendation";
                const bundle = await getYoutubeDiscoveryRecommendationBundle(activeClaim, candidate.videoId);
                if (bundle === "completed") continue;
                if (bundle === "cancelled") return observationFor(activeClaim, "success");
                if (bundle === "contended") throw new Error("youtube_recommendation_contended");
                if (executionDeadlineAt <= Date.now() || controller.signal.aborted) throw new Error("youtube_recommendation_deadline_exhausted");
                lastStage = "eligibility";
                const eligibility = await raceWithDeadline(youtubeCaptureEligibilityPort!.check(candidate.videoId, controller.signal), controller.signal, executionDeadlineAt);
                if ((eligibility !== "eligible" && eligibility !== "already_compatible") || controller.signal.aborted) throw new Error("youtube_eligibility_unavailable");
                const active = await cancelYoutubeDiscoveryRunIfDisabled(activeClaim, undefined, true);
                if (active === "cancelled") return observationFor(activeClaim, "success");
                if (active === "contended") throw new Error("youtube_eligibility_contended");
                lastStage = "persist_recommendation";
                const recommendation = await runYoutubeDiscoveryRecommendation(activeClaim, bundle, eligibility, controller.signal, executionDeadlineAt);
                if (recommendation === "cancelled") return observationFor(activeClaim, "success");
                if (recommendation !== "completed") throw new Error(recommendation === "deadline_exhausted" ? "youtube_recommendation_transient" : recommendation === "retry" ? "youtube_recommendation_transient" : "youtube_recommendation_contended");
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
    const code = error instanceof Error ? error.message : "stage_transient";
    stageResult = code === "youtube_enrichment_cancelled" ? "cancelled" : "stage_transient";
    retryErrorCode = retryCodeFor(code);
  }
  if (stageResult === "cancelled") return observationFor(claim.claim, "success");
  const disposition = stageResult === "complete" ? await finishYoutubeDiscoveryRun(claim.claim) : await retryYoutubeDiscoveryRun(claim.claim, incidentCategory, undefined, retryErrorCode);
  return observationFor(claim.claim, disposition === "completed" ? "success" : disposition === "retrying" ? "retry" : disposition === "failed" ? "failure" : disposition === "cancelled" ? "success" : "contended", disposition === "retrying" || disposition === "failed" ? retryErrorCode : undefined, disposition === "retrying" || disposition === "failed" ? lastStage : undefined);
}

function retryCodeFor(error: string): Exclude<YoutubeDiscoveryRunSafeErrorCode, "retry_exhausted" | "lease_retry_exhausted" | "policy_revoked"> {
  if (error === "youtube_search_transient" || error === "youtube_search_configuration") return "search_transient";
  if (error === "youtube_search_timeout") return "search_timeout";
  if (error === "youtube_enrichment_transient" || error === "youtube_enrichment_configuration") return "enrichment_transient";
  if (error === "youtube_triage_timeout") return "triage_timeout";
  if (error === "youtube_triage_transient") return "triage_transient";
  if (error === "youtube_eligibility_unavailable" || error === "youtube_capture_eligibility_unavailable") return "eligibility_unavailable";
  if (error === "youtube_recommendation_transient") return "recommendation_transient";
  if (error.endsWith("_contended")) return "persistence_contended";
  return "stage_transient";
}

async function runYoutubeDiscoveryRecommendation(claim: NonNullable<Awaited<ReturnType<typeof claimNextYoutubeDiscoveryRun>>["claim"]>, bundle: Exclude<Awaited<ReturnType<typeof getYoutubeDiscoveryRecommendationBundle>>, "completed" | "cancelled" | "contended">, eligibility: "eligible" | "already_compatible", signal: AbortSignal, executionDeadlineAt: number): Promise<"completed" | "cancelled" | "contended" | "deadline_exhausted" | "retry"> {
  if (executionDeadlineAt <= Date.now() || signal.aborted) return "deadline_exhausted";
  const persisted = await persistYoutubeDiscoveryRecommendation(claim, bundle, eligibility, executionDeadlineAt);
  return persisted;
}

async function runYoutubeDiscoveryTriage(claim: NonNullable<Awaited<ReturnType<typeof claimNextYoutubeDiscoveryRun>>["claim"]>, videoId: string, signal: AbortSignal, executionDeadlineAt: number): Promise<"completed" | "cancelled" | "contended" | "deadline_exhausted" | "retry" | "rate_limited" | "schema_invalid"> {
  if ((await cancelYoutubeDiscoveryRunIfDisabled(claim, undefined, true)) !== "active") return "cancelled";
  const bundle = await getYoutubeDiscoveryTriageBundle(claim, videoId);
  if (bundle === "succeeded") return "completed";
  if (bundle === "cancelled" || bundle === "contended") return bundle;
  const model = await selectYoutubeDiscoveryTriageModel();
  if (!model) return persistYoutubeDiscoveryTriage(claim, { candidateId: bundle.candidateId, status: "no_eligible_model", model: null, provider: "unavailable", modelName: "unavailable", latencyMs: null, errorCode: "no_eligible_model" });
  if ((await cancelYoutubeDiscoveryRunIfDisabled(claim, undefined, true)) !== "active") return "cancelled";
  if (executionDeadlineAt - Date.now() < triageTimeoutMs) return "deadline_exhausted";
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timedOut = Symbol("youtube_discovery_triage_timeout");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let response: Awaited<ReturnType<typeof completeYoutubeDiscoveryTriage>>;
  try {
    const completion = youtubeTriageCompletion({ model: model.gatewayModelName, abortSignal: controller.signal, messages: [{ role: "system", content: "Return strict JSON only with exactly relevanceScore, expectedValueScore, freshnessFitScore, commercialRiskScore, duplicateRiskScore, signals. Scores are finite 0..1. signals may contain only supplied signal codes, without duplicates. Do not include explanation, recommendation, or any other key." }, { role: "user", content: JSON.stringify({ query: bundle.queryText, candidate: bundle.candidate, signals: bundle.signals }) }] });
    const result = await Promise.race([completion, new Promise<typeof timedOut>((resolve) => { timeout = setTimeout(() => { controller.abort(); resolve(timedOut); }, triageTimeoutMs); })]);
    if (result === timedOut) {
      const persisted = await persistYoutubeDiscoveryTriage(claim, { candidateId: bundle.candidateId, status: "gateway_failed", model, provider: "ai_gateway", modelName: model.gatewayModelName, latencyMs: triageTimeoutMs, errorCode: "client_stream_aborted" });
      return persisted === "completed" ? "retry" : persisted;
    }
    response = result;
  } finally {
    if (timeout) clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
  if (!response.ok) {
    const persisted = await persistYoutubeDiscoveryTriage(claim, { candidateId: bundle.candidateId, status: "gateway_failed", model, provider: response.provider, modelName: response.model, latencyMs: response.latencyMs, errorCode: response.errorCode, providerRequestId: response.requestMetadata.providerRequestId });
    return persisted === "completed" ? response.failureKind === "rate_limited" ? "rate_limited" : "retry" : persisted;
  }
  let parsed: unknown = null; try { parsed = JSON.parse(response.content); } catch { /* invalid output is deliberately not retained */ }
  const assessment = parseYoutubeDiscoveryTriageAssessment(parsed, bundle.signals.map((signal) => signal.signal));
  const persisted = await persistYoutubeDiscoveryTriage(claim, assessment ? { candidateId: bundle.candidateId, status: "succeeded", assessment, model, provider: response.provider, modelName: response.model, latencyMs: response.latencyMs, ...response.usage, providerRequestId: response.requestMetadata.providerRequestId } : { candidateId: bundle.candidateId, status: "invalid_output", model, provider: response.provider, modelName: response.model, latencyMs: response.latencyMs, errorCode: "invalid_output", ...response.usage, providerRequestId: response.requestMetadata.providerRequestId });
  return !assessment && persisted === "completed" ? "schema_invalid" : persisted;
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
  return results;
}

function observationFor(claim: NonNullable<Awaited<ReturnType<typeof claimNextYoutubeDiscoveryRun>>["claim"]>, resultCode: WorkerPollObservation["resultCode"], diagnosticCode?: string, diagnosticStage?: DiscoveryDiagnosticStage): WorkerPollObservation {
  return {
    capability: "youtube.discovery",
    resultCode,
    durableId: claim.id,
    retryCount: claim.attemptCount,
    ...(diagnosticCode ? { diagnosticCode } : {}),
    ...(diagnosticStage ? { diagnosticStage } : {}),
    jobLagMs: Math.max(0, claim.claimedAt.getTime() - claim.nextRunAt.getTime()),
    leaseRecovery: claim.recoveredCount ? "recovered" : "none",
    ...(claim.recoveredCount ? { leaseRecoveryCount: claim.recoveredCount } : {}),
  };
}

async function raceWithDeadline<T>(operation: Promise<T>, signal: AbortSignal, deadlineAt: number): Promise<T> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new Error("youtube_capture_eligibility_unavailable");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("youtube_capture_eligibility_unavailable")), remainingMs); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    if (signal.aborted) throw new Error("youtube_capture_eligibility_unavailable");
  }
}

/** @internal Test-only stage seam. It is intentionally not exported from the package barrel. */
export function setYoutubeDiscoveryExecutionStageForTest(stage: (() => Promise<DiscoveryStageResult>) | undefined) {
  executionStage = stage;
}

/** @internal Test-only enrichment seam. */
export function setYoutubeDiscoveryEnrichmentForTest(enrichment: typeof enrichYoutubeVideo | undefined) {
  youtubeEnrichment = enrichment ?? enrichYoutubeVideo;
}

/** @internal Test-only Gateway completion seam. */
export function setYoutubeDiscoveryTriageCompletionForTest(completion: typeof completeYoutubeDiscoveryTriage | undefined) { youtubeTriageCompletion = completion ?? completeYoutubeDiscoveryTriage; }

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
