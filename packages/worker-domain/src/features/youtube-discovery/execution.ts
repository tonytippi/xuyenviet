import { cancelYoutubeDiscoveryCandidateJobIfDisabled, cancelYoutubeDiscoveryRunIfDisabled, claimNextYoutubeDiscoveryCandidateJob, claimNextYoutubeDiscoveryRun, claimYoutubeDiscoveryPlanning, completeYoutubeDiscoveryTriage, finishYoutubeDiscoveryCandidateJob, finishYoutubeDiscoveryRun, getYoutubeDiscoveryRecommendationBundle, getYoutubeDiscoveryRunQuery, getYoutubeDiscoveryTriageBundle, parseYoutubeDiscoveryTriageAssessment, persistYoutubeDiscoveryCandidates, persistYoutubeDiscoveryEnrichment, persistYoutubeDiscoveryRecommendation, persistYoutubeDiscoveryTriage, refreshYoutubeDiscoverySystemProposals, retainYoutubeDiscoveryRecords, retryYoutubeDiscoveryCandidateJob, retryYoutubeDiscoveryRun, scheduleYoutubeDiscoveryDueRuns, selectYoutubeDiscoveryTriageModel, type YoutubeDiscoveryCandidateJobSafeErrorCode, type YoutubeDiscoveryRunSafeErrorCode } from "@xuyenviet/database";
import type { WorkerPollObservation } from "@xuyenviet/contracts";
import { createUnavailableAiAskDiscoveryQuerySignalPort, createUnavailableKnowledgeDiscoveryQuerySignalPort, type AiAskDiscoveryQuerySignalPort, type DiscoveryQuerySignalPortResult, type KnowledgeDiscoveryQuerySignalPort, type YoutubeCaptureEligibilityPort } from "@xuyenviet/domain";
import { searchYoutubeVideos } from "./youtube-search";
import { enrichYoutubeVideo } from "./youtube-enrichment";

type DiscoveryStageResult = "complete" | "cancelled" | "stage_transient";
type QueryDiagnosticStage = "load_query" | "search" | "persist_candidates";
type CandidateDiagnosticStage = "enrichment" | "triage" | "eligibility" | "recommendation";
const planningPortTimeoutMs = 1_000;
const executionStageTimeoutMs = 240_000;
const triageTimeoutMs = 10_000;
let executionStageTimeoutOverrideMs: number | undefined;
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
    const outcome = await refreshYoutubeDiscoverySystemProposals(planning, await Promise.all([readPlanningPort(knowledgePlanningPort), readPlanningPort(aiAskPlanningPort)]));
    return { capability: "youtube.discovery", resultCode: outcome === "contended" ? "contended" : "success", durableId: planning.id, leaseRecovery: "none", executionKind: "query_run" };
  }
  await retainYoutubeDiscoveryRecords();
  const candidate = await claimNextYoutubeDiscoveryCandidateJob({ workerId });
  if (candidate.claim) return executeCandidateJob(candidate.claim);
  const scheduled = await scheduleYoutubeDiscoveryDueRuns();
  if (scheduled === "candidate_backlog_blocked") return { capability: "youtube.discovery", executionKind: "candidate_job", resultCode: "no_work", diagnosticCode: "candidate_backlog_blocked", leaseRecovery: "none" };
  const run = await claimNextYoutubeDiscoveryRun({ workerId });
  if (!run.claim) return { capability: "youtube.discovery", executionKind: "query_run", resultCode: run.contended || candidate.contended ? "contended" : run.recoveredTerminalCount || candidate.recoveredTerminalCount ? "failure" : run.recoveredCount || candidate.recoveredCount ? "success" : "no_work", leaseRecovery: run.recoveredCount || candidate.recoveredCount ? "recovered" : run.contended || candidate.contended ? "contended" : "none", ...(run.recoveredCount || candidate.recoveredCount ? { leaseRecoveryCount: run.recoveredCount + candidate.recoveredCount } : {}) };
  return executeQueryRun(run.claim);
}

async function executeQueryRun(claim: NonNullable<Awaited<ReturnType<typeof claimNextYoutubeDiscoveryRun>>["claim"]>): Promise<WorkerPollObservation> {
  const active = await cancelYoutubeDiscoveryRunIfDisabled(claim);
  if (active !== "active") return observationFor("query_run", claim, active === "cancelled" ? "success" : "contended");
  let code: Exclude<YoutubeDiscoveryRunSafeErrorCode, "retry_exhausted" | "lease_retry_exhausted" | "policy_revoked"> = "stage_transient"; let stage: QueryDiagnosticStage = "load_query";
  try {
    if (executionStage) {
      const result = await executionStage();
      const disposition = result === "complete" ? await finishYoutubeDiscoveryRun(claim) : result === "cancelled" ? "cancelled" : await retryYoutubeDiscoveryRun(claim, null, undefined, code);
      return observationFor("query_run", claim, disposition === "completed" || disposition === "cancelled" ? "success" : disposition === "retrying" ? "retry" : disposition === "failed" ? "failure" : "contended", disposition === "retrying" || disposition === "failed" ? code : undefined, stage);
    }
    const run = await getYoutubeDiscoveryRunQuery(claim);
    if (run === "cancelled") return observationFor("query_run", claim, (await cancelYoutubeDiscoveryRunIfDisabled(claim, undefined, true)) === "cancelled" ? "success" : "contended");
    if (run === "contended") return observationFor("query_run", claim, "contended");
    if (!youtubeDataApiKey) throw new Error("search_transient");
    stage = "search";
    const controller = new AbortController(); let timeout: ReturnType<typeof setTimeout> | undefined;
    let result: Awaited<ReturnType<typeof youtubeSearch>>;
    try {
      result = await Promise.race([youtubeSearch(run.queryText, youtubeDataApiKey, undefined, controller.signal), new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error("search_timeout")); }, executionStageTimeoutOverrideMs ?? executionStageTimeoutMs); })]);
    } finally { if (timeout) clearTimeout(timeout); }
    stage = "persist_candidates";
    const persisted = await persistYoutubeDiscoveryCandidates(claim, result);
    if (persisted === "cancelled") return observationFor("query_run", claim, "success");
    if (persisted !== "completed") throw new Error("stage_transient");
    const disposition = await finishYoutubeDiscoveryRun(claim);
    return observationFor("query_run", claim, disposition === "completed" ? "success" : disposition === "cancelled" ? "success" : "contended");
  } catch (error) {
    code = error instanceof Error && error.message === "search_timeout" ? "search_timeout" : error instanceof Error && error.message === "search_transient" ? "search_transient" : "stage_transient";
    const disposition = await retryYoutubeDiscoveryRun(claim, null, undefined, code);
    return observationFor("query_run", claim, disposition === "retrying" ? "retry" : disposition === "failed" ? "failure" : disposition === "cancelled" ? "success" : "contended", code, stage);
  }
}

async function executeCandidateJob(claim: NonNullable<Awaited<ReturnType<typeof claimNextYoutubeDiscoveryCandidateJob>>["claim"]>): Promise<WorkerPollObservation> {
  const active = await cancelYoutubeDiscoveryCandidateJobIfDisabled(claim);
  if (active !== "active") return observationFor("candidate_job", claim, active === "cancelled" ? "success" : "contended");
  const deadlineAt = Date.now() + (executionStageTimeoutOverrideMs ?? executionStageTimeoutMs);
  const controller = new AbortController();
  let stage: CandidateDiagnosticStage = "enrichment";
  let code: Exclude<YoutubeDiscoveryCandidateJobSafeErrorCode, "retry_exhausted" | "lease_retry_exhausted" | "policy_revoked"> = "stage_transient";
  try {
    if (!youtubeDataApiKey) throw new Error("enrichment_transient");
    await requireCandidateActive(claim);
    const enrichment = await raceWithDeadline(youtubeEnrichment(claim.videoId, youtubeDataApiKey, undefined, controller.signal, () => requireCandidateActive(claim)), controller, deadlineAt, "enrichment_transient");
    await requireCandidateActive(claim);
    if (await persistYoutubeDiscoveryEnrichment(claim, enrichment) !== "completed") throw new Error("persistence_contended");
    stage = "triage";
    const triage = await runCandidateTriage(claim, controller, deadlineAt);
    if (triage === "cancelled") return finishCandidateObservation(claim, await finishYoutubeDiscoveryCandidateJob(claim));
    if (triage !== "completed") throw new Error(triage);
    stage = "eligibility";
    const bundle = await getYoutubeDiscoveryRecommendationBundle(claim, claim.videoId);
    if (bundle === "completed") return finishCandidateObservation(claim, await finishYoutubeDiscoveryCandidateJob(claim));
    if (bundle === "cancelled") return finishCandidateObservation(claim, await finishYoutubeDiscoveryCandidateJob(claim));
    if (bundle === "contended") throw new Error("persistence_contended");
    if (!youtubeCaptureEligibilityPort) throw new Error("eligibility_unavailable");
    await requireCandidateActive(claim);
    const eligibility = await raceWithDeadline(youtubeCaptureEligibilityPort.check(claim.videoId, controller.signal), controller, deadlineAt, "eligibility_unavailable");
    if (eligibility !== "eligible" && eligibility !== "already_compatible") throw new Error("eligibility_unavailable");
    stage = "recommendation";
    await requireCandidateActive(claim);
    const persisted = await persistYoutubeDiscoveryRecommendation(claim, bundle, eligibility, deadlineAt);
    if (persisted === "cancelled") return observationFor("candidate_job", claim, "success");
    if (persisted !== "completed") throw new Error(persisted === "deadline_exhausted" ? "recommendation_transient" : "persistence_contended");
    return finishCandidateObservation(claim, await finishYoutubeDiscoveryCandidateJob(claim));
  } catch (error) {
    const message = error instanceof Error ? error.message : "stage_transient";
    // requireCandidateActive performs the fenced cancellation and terminal audit
    // before raising this sentinel; do not attempt a second terminal transition.
    if (message === "candidate_cancelled") return observationFor("candidate_job", claim, "success");
    code = candidateRetryCode(message);
    const disposition = await retryYoutubeDiscoveryCandidateJob(claim, code, stage, undefined, message === "rate_limited" ? "provider_rate_limited" : message === "schema_invalid" ? "triage_schema_invalid" : null);
    return finishCandidateObservation(claim, disposition, code, stage);
  }
}

async function requireCandidateActive(claim: NonNullable<Awaited<ReturnType<typeof claimNextYoutubeDiscoveryCandidateJob>>["claim"]>) { const active = await cancelYoutubeDiscoveryCandidateJobIfDisabled(claim); if (active === "cancelled") throw new Error("candidate_cancelled"); if (active !== "active") throw new Error("persistence_contended"); }
function candidateRetryCode(error: string): Exclude<YoutubeDiscoveryCandidateJobSafeErrorCode, "retry_exhausted" | "lease_retry_exhausted" | "policy_revoked"> { if (error === "enrichment_transient") return "enrichment_transient"; if (error === "triage_timeout") return "triage_timeout"; if (error === "triage_transient" || error === "schema_invalid" || error === "rate_limited") return "triage_transient"; if (error === "eligibility_unavailable") return "eligibility_unavailable"; if (error === "recommendation_transient") return "recommendation_transient"; if (error === "persistence_contended") return "persistence_contended"; return "stage_transient"; }
function finishCandidateObservation(claim: NonNullable<Awaited<ReturnType<typeof claimNextYoutubeDiscoveryCandidateJob>>["claim"]>, disposition: Awaited<ReturnType<typeof finishYoutubeDiscoveryCandidateJob>> | Awaited<ReturnType<typeof retryYoutubeDiscoveryCandidateJob>>, code?: YoutubeDiscoveryCandidateJobSafeErrorCode, stage?: CandidateDiagnosticStage) { return observationFor("candidate_job", claim, disposition === "completed" || disposition === "cancelled" ? "success" : disposition === "retrying" ? "retry" : disposition === "failed" ? "failure" : "contended", disposition === "retrying" || disposition === "failed" ? code : undefined, stage); }

async function runCandidateTriage(claim: NonNullable<Awaited<ReturnType<typeof claimNextYoutubeDiscoveryCandidateJob>>["claim"]>, controller: AbortController, deadlineAt: number): Promise<"completed" | "cancelled" | "contended" | "triage_timeout" | "triage_transient" | "schema_invalid" | "rate_limited"> {
  await requireCandidateActive(claim);
  const bundle = await getYoutubeDiscoveryTriageBundle(claim, claim.videoId);
  if (bundle === "succeeded") return "completed";
  if (bundle === "cancelled" || bundle === "contended") return bundle;
  const model = await selectYoutubeDiscoveryTriageModel();
  if (!model) return (await persistYoutubeDiscoveryTriage(claim, { candidateId: bundle.candidateId, status: "no_eligible_model", model: null, provider: "unavailable", modelName: "unavailable", latencyMs: null, errorCode: "no_eligible_model" })) === "completed" ? "triage_transient" : "contended";
  await requireCandidateActive(claim);
  if (deadlineAt - Date.now() < triageTimeoutMs) return "triage_timeout";
  const startedAt = Date.now();
  const response = await raceWithDeadline(youtubeTriageCompletion({ model: model.gatewayModelName, abortSignal: controller.signal, messages: [{ role: "system", content: "Return strict JSON only with exactly relevanceScore, expectedValueScore, freshnessFitScore, commercialRiskScore, duplicateRiskScore, signals. Scores are finite 0..1. signals may contain only supplied signal codes, without duplicates. Do not include explanation, recommendation, or any other key." }, { role: "user", content: JSON.stringify({ query: bundle.queryText, candidate: bundle.candidate, signals: bundle.signals }) }] }), controller, Math.min(deadlineAt, startedAt + triageTimeoutMs), "triage_timeout");
  await requireCandidateActive(claim);
  if (!response.ok) {
    const persisted = await persistYoutubeDiscoveryTriage(claim, { candidateId: bundle.candidateId, status: "gateway_failed", model, provider: response.provider, modelName: response.model, latencyMs: response.latencyMs, errorCode: response.errorCode, providerRequestId: response.requestMetadata.providerRequestId });
    return persisted === "completed" ? response.failureKind === "rate_limited" ? "rate_limited" : "triage_transient" : persisted;
  }
  let parsed: unknown = null; try { parsed = JSON.parse(response.content); } catch { /* Invalid provider output is retained as a safe failure. */ }
  const assessment = parseYoutubeDiscoveryTriageAssessment(parsed, bundle.signals.map((signal) => signal.signal));
  const persisted = await persistYoutubeDiscoveryTriage(claim, assessment ? { candidateId: bundle.candidateId, status: "succeeded", assessment, model, provider: response.provider, modelName: response.model, latencyMs: response.latencyMs, ...response.usage, providerRequestId: response.requestMetadata.providerRequestId } : { candidateId: bundle.candidateId, status: "invalid_output", model, provider: response.provider, modelName: response.model, latencyMs: response.latencyMs, errorCode: "invalid_output", ...response.usage, providerRequestId: response.requestMetadata.providerRequestId });
  return persisted !== "completed" ? persisted : assessment ? "completed" : "schema_invalid";
}

async function raceWithDeadline<T>(operation: Promise<T>, controller: AbortController, deadlineAt: number, errorCode: string): Promise<T> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) throw new Error(errorCode);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error(errorCode)); }, remainingMs); })]); }
  finally { if (timeout) clearTimeout(timeout); }
}

function observationFor(kind: "query_run" | "candidate_job", claim: { id: string; attemptCount: number; claimedAt: Date; nextRunAt: Date; recoveredCount: number }, resultCode: WorkerPollObservation["resultCode"], diagnosticCode?: YoutubeDiscoveryRunSafeErrorCode | YoutubeDiscoveryCandidateJobSafeErrorCode, diagnosticStage?: QueryDiagnosticStage | CandidateDiagnosticStage): WorkerPollObservation {
  return { capability: "youtube.discovery", resultCode, durableId: claim.id, executionKind: kind, retryCount: claim.attemptCount, ...(diagnosticCode ? { diagnosticCode } : {}), ...(diagnosticStage ? { diagnosticStage } : {}), jobLagMs: Math.max(0, claim.claimedAt.getTime() - claim.nextRunAt.getTime()), leaseRecovery: claim.recoveredCount ? "recovered" : "none", ...(claim.recoveredCount ? { leaseRecoveryCount: claim.recoveredCount } : {}) };
}

async function readPlanningPort(port: KnowledgeDiscoveryQuerySignalPort | AiAskDiscoveryQuerySignalPort): Promise<DiscoveryQuerySignalPortResult> { let timeout: ReturnType<typeof setTimeout> | undefined; const controller = new AbortController(); try { return await Promise.race([Promise.resolve().then(() => port.readSignals(controller.signal)).catch(() => ({ status: "unavailable", code: "source_unavailable" } as const)), new Promise<DiscoveryQuerySignalPortResult>((resolve) => { timeout = setTimeout(() => { controller.abort(); resolve({ status: "unavailable", code: "source_timeout" }); }, planningPortTimeoutMs); })]); } finally { if (timeout) clearTimeout(timeout); } }
export function setYoutubeDiscoveryExecutionStageForTest(stage: (() => Promise<DiscoveryStageResult>) | undefined) { executionStage = stage; }
export function setYoutubeDiscoveryExecutionTimeoutForTest(timeoutMs: number | undefined) { executionStageTimeoutOverrideMs = timeoutMs; }
export function bindYoutubeDiscoveryPlanningPorts(knowledge: KnowledgeDiscoveryQuerySignalPort, aiAsk: AiAskDiscoveryQuerySignalPort) { knowledgePlanningPort = knowledge; aiAskPlanningPort = aiAsk; }
export function bindYoutubeDiscoveryExecutionPorts(eligibility: YoutubeCaptureEligibilityPort, search: typeof searchYoutubeVideos = searchYoutubeVideos, apiKey?: string) { youtubeCaptureEligibilityPort = eligibility; youtubeSearch = search; youtubeDataApiKey = apiKey?.trim() || undefined; }
export function setYoutubeDiscoveryPlanningPortsForTest(knowledge: ((signal?: AbortSignal) => Promise<DiscoveryQuerySignalPortResult>) | undefined, aiAsk: ((signal?: AbortSignal) => Promise<DiscoveryQuerySignalPortResult>) | undefined) { bindYoutubeDiscoveryPlanningPorts(knowledge ? { readSignals: knowledge } : createUnavailableKnowledgeDiscoveryQuerySignalPort(), aiAsk ? { readSignals: aiAsk } : createUnavailableAiAskDiscoveryQuerySignalPort()); }
export function setYoutubeDiscoveryEnrichmentForTest(enrichment: typeof enrichYoutubeVideo | undefined) { youtubeEnrichment = enrichment ?? enrichYoutubeVideo; }
export function setYoutubeDiscoveryTriageCompletionForTest(completion: typeof completeYoutubeDiscoveryTriage | undefined) { youtubeTriageCompletion = completion ?? completeYoutubeDiscoveryTriage; }
