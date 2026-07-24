import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  publicMvpEvaluationPromptSets,
  publicMvpEvaluationResultScores,
  publicMvpEvaluationResults,
  publicMvpEvaluationResultPolicySnapshots,
  publicMvpEvaluationRuns,
  type PublicMvpEvaluationPromptType,
  type PublicMvpEvaluationScoreDimension,
  type PublicMvpEvaluationScenarioId,
} from "@/db/schema";
import { generateEvaluationAiAskAnswer, type EvaluationAiAskAnswer } from "@/features/ai/evaluation-answer";
import { cleanupEvaluationScenarioFixture, prepareEvaluationScenarioFixture } from "@/features/feedback/evaluation-fixtures";
import { completeEvaluation, type AiGatewayExtractionResult } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel, type SelectedAiGatewayModel } from "@/features/ai/models";
import { aiUsagePromptVersions, aiUsagePurposes, writeAiUsageEvent } from "@/features/usage/events";
import { getAuthenticatedSessionWithRoles, hasAdminAccess } from "@/server/auth";

export const publicMvpEvaluationPromptSetVersion = "public_mvp_ai_first_v2";
export const publicMvpEvaluationRubricVersion = "epic_6_quality_rubric_ai_first_v2";

export const publicMvpEvaluationScoreDimensions = [
  "user_context_use",
  "practical_specificity",
  "source_grounding",
  "uncertainty_handling",
  "family_awareness",
  "vietnamese_clarity",
] as const satisfies readonly PublicMvpEvaluationScoreDimension[];

export type PublicMvpEvaluationPromptDefinition = {
  type: PublicMvpEvaluationPromptType;
  version: string;
  title: string;
  prompt: string;
};

export type PublicMvpEvaluationScenarioDefinition = {
  id: PublicMvpEvaluationScenarioId;
  version: "v1";
  prompt: PublicMvpEvaluationPromptDefinition;
  expected: {
    targetCandidateExcluded: boolean;
    sourceOrEvidenceOutcome: "eligible" | "excluded_conflict" | "withdrawn_or_ineligible" | "no_eligible_knowledge";
    fallbackRequired: boolean;
    conditionalHighRisk?: { conditions: string[] };
  };
  fixture: {
    selectedKnowledgeStates: string[];
    excludedReasonCodes: string[];
    webFallbackWarnings: string[];
  };
};

export const publicMvpEvaluationPrompts = [
  {
    type: "magic_moment_family_trip",
    version: "magic_moment_family_trip_v1",
    title: "Magic-moment family trip",
    prompt:
      "Gia đình 2 người lớn và 2 bé 5, 8 tuổi muốn đi ô tô từ TP.HCM đến Đà Lạt 4 ngày. Hãy lập gợi ý hành trình thực tế, có nhịp lái xe phù hợp trẻ em, điểm dừng, cảnh báo cần kiểm chứng và bước tiếp theo.",
  },
  {
    type: "sparse_data",
    version: "sparse_data_v1",
    title: "Sparse-data question",
    prompt: "Mình muốn đi xuyên Việt bằng ô tô khoảng 10 ngày nhưng chưa chốt điểm đến. Nên bắt đầu lên kế hoạch thế nào?",
  },
  {
    type: "freshness_sensitive",
    version: "freshness_sensitive_v1",
    title: "Freshness-sensitive question",
    prompt: "Cuối tuần này đèo Prenn có đang mở và thời tiết Đà Lạt có phù hợp cho trẻ nhỏ không? Nếu chưa chắc nguồn, hãy nói rõ cần kiểm chứng gì.",
  },
  {
    type: "service_activity",
    version: "service_activity_v1",
    title: "Service/activity question",
    prompt: "Ở Nha Trang có hoạt động nào phù hợp gia đình có bé 6 tuổi, cần tránh nắng gắt và dễ tìm chỗ ăn gần đó?",
  },
  {
    type: "route_logistics",
    version: "route_logistics_v1",
    title: "Route logistics question",
    prompt: "Từ Hà Nội đi Huế bằng ô tô gia đình thì nên chia chặng ra sao, dừng nghỉ ở đâu và cần lưu ý gì về thời gian lái?",
  },
] as const satisfies readonly PublicMvpEvaluationPromptDefinition[];

function prompt(type: PublicMvpEvaluationPromptType) {
  const definition = publicMvpEvaluationPrompts.find((candidate) => candidate.type === type);
  if (!definition) throw new Error(`Missing canonical evaluation prompt: ${type}`);
  return definition;
}

export const publicMvpEvaluationScenarios: readonly PublicMvpEvaluationScenarioDefinition[] = [
  { id: "community_observation", version: "v1", prompt: prompt("magic_moment_family_trip"), expected: { targetCandidateExcluded: false, sourceOrEvidenceOutcome: "eligible", fallbackRequired: false }, fixture: { selectedKnowledgeStates: ["community_observation"], excludedReasonCodes: [], webFallbackWarnings: [] } },
  { id: "independent_community_pattern", version: "v1", prompt: prompt("route_logistics"), expected: { targetCandidateExcluded: false, sourceOrEvidenceOutcome: "eligible", fallbackRequired: false }, fixture: { selectedKnowledgeStates: ["community_pattern"], excludedReasonCodes: [], webFallbackWarnings: [] } },
  { id: "conditional_high_risk_claim", version: "v1", prompt: prompt("freshness_sensitive"), expected: { targetCandidateExcluded: false, sourceOrEvidenceOutcome: "eligible", fallbackRequired: true, conditionalHighRisk: { conditions: ["Cần xác minh trước khi khởi hành"] } }, fixture: { selectedKnowledgeStates: ["conditional"], excludedReasonCodes: [], webFallbackWarnings: [] } },
  { id: "conflict_exclusion", version: "v1", prompt: prompt("freshness_sensitive"), expected: { targetCandidateExcluded: true, sourceOrEvidenceOutcome: "excluded_conflict", fallbackRequired: false }, fixture: { selectedKnowledgeStates: [], excludedReasonCodes: ["unsupported_knowledge_state"], webFallbackWarnings: [] } },
  { id: "source_withdrawal", version: "v1", prompt: prompt("service_activity"), expected: { targetCandidateExcluded: true, sourceOrEvidenceOutcome: "withdrawn_or_ineligible", fallbackRequired: false }, fixture: { selectedKnowledgeStates: [], excludedReasonCodes: ["missing_traveler_safe_evidence"], webFallbackWarnings: [] } },
  { id: "web_fallback_unavailable", version: "v1", prompt: prompt("sparse_data"), expected: { targetCandidateExcluded: false, sourceOrEvidenceOutcome: "no_eligible_knowledge", fallbackRequired: true }, fixture: { selectedKnowledgeStates: [], excludedReasonCodes: [], webFallbackWarnings: ["web_search_load_failed", "web_search_low_quality"] } },
];

export type EvaluationScores = Record<PublicMvpEvaluationScoreDimension, number>;

export type EvaluationScorerOutput = {
  answerText: string;
  scores: EvaluationScores;
  flags: {
    unsupportedClaim: boolean;
    missingUncertainty: boolean;
    noBetterThanGeneric: boolean;
    unsupportedCommunityWording?: boolean;
    requiredCaveatOmitted?: boolean;
  };
  usageEventId?: string | null;
};

export type PublicMvpEvaluationRunResult =
  | { success: true; run: PublicMvpEvaluationRunSummary }
  | { success: false; reason: "unauthorized" | "missing_evaluation_model" | "missing_ai_ask_model" };

export type PublicMvpEvaluationRunSummary = {
  id: string;
  promptSetVersion: string;
  modelVersion: string;
  actorUserId: string;
  status: "completed" | "partial_failed" | "failed";
  resultCount: number;
  scoredCount: number;
  failedCount: number;
  results: PublicMvpEvaluationResultSummary[];
};

export type PublicMvpEvaluationResultSummary = {
  id: string;
  promptType: PublicMvpEvaluationPromptType;
  promptVersion: string;
  scenarioId: PublicMvpEvaluationScenarioId;
  scenarioVersion: string;
  status: "scored" | "failed" | "unscored";
  safeErrorCode: "evaluator_failed" | "invalid_score_payload" | null;
  scores: Partial<EvaluationScores>;
  flags: EvaluationScorerOutput["flags"] & { conflictedKnowledgeExcluded: boolean; staleWithdrawnSourceExposure: boolean; rawEvidenceLeakage: boolean; fallbackVerificationGuidanceMet: boolean };
};

type EvaluationDependencies = {
  db?: ReturnType<typeof getDb>;
  selectModel?: typeof selectActiveAiGatewayModel;
  answerGenerator?: (input: { db: ReturnType<typeof getDb>; prompt: PublicMvpEvaluationPromptDefinition; scenario: PublicMvpEvaluationScenarioDefinition; model: SelectedAiGatewayModel; actorUserId: string; knowledgeCardIds: string[]; abortSignal?: AbortSignal }) => Promise<{ ok: true; answer: EvaluationAiAskAnswer } | { ok: false; usageEventId: string | null }>;
  scorer?: (input: { db: ReturnType<typeof getDb>; prompt: PublicMvpEvaluationPromptDefinition; scenario: PublicMvpEvaluationScenarioDefinition; model: SelectedAiGatewayModel; actorUserId: string; answer: EvaluationAiAskAnswer }) => Promise<EvaluationScorerOutput>;
};

type InvalidScorePayloadError = Error & { code: "invalid_score_payload" };

export async function runPublicMvpAnswerEvaluationPromptSet(dependencies: EvaluationDependencies = {}): Promise<PublicMvpEvaluationRunResult> {
  const session = await getAuthenticatedSessionWithRoles();

  if (!session || !hasAdminAccess(session.roles)) {
    return { success: false, reason: "unauthorized" };
  }

  const db = dependencies.db ?? getDb();
  const selectModel = dependencies.selectModel ?? selectActiveAiGatewayModel;
  const model = await selectModel({ purpose: "evaluation", requiredCapabilities: { textInput: true, evaluation: true }, db });

  if (!model) {
    return { success: false, reason: "missing_evaluation_model" };
  }

  const aiAskModel = await selectModel({ purpose: "ai_ask_initial_answer", requiredCapabilities: { textInput: true }, db });

  if (!aiAskModel) {
    return { success: false, reason: "missing_ai_ask_model" };
  }

  const promptSet = await ensurePromptSet(db);
  const [run] = await db
    .insert(publicMvpEvaluationRuns)
    .values({
      promptSetId: promptSet.id,
      promptSetVersion: promptSet.version,
      actorUserId: session.userId,
      aiGatewayModelId: model.id,
      modelVersion: model.gatewayModelName,
      status: "running",
      runMetadata: { promptCount: publicMvpEvaluationPrompts.length, scenarioCount: publicMvpEvaluationScenarios.length, rubricVersion: promptSet.rubricVersion },
    })
    .returning();
  const scorer = dependencies.scorer ?? scoreWithEvaluationModel;
  const answerGenerator = dependencies.answerGenerator ?? ((input) => generateEvaluationAiAskAnswer({ db: input.db, userId: input.actorUserId, question: input.prompt.prompt, model: input.model, knowledgeCardIds: input.knowledgeCardIds, abortSignal: input.abortSignal }));
  const results: PublicMvpEvaluationResultSummary[] = [];

  try {
    for (const scenario of publicMvpEvaluationScenarios) {
      const result = await runSinglePrompt({ db, runId: run.id, promptSet, scenario, model, aiAskModel, scorer, answerGenerator, actorUserId: session.userId });
      results.push(result);
    }
  } finally {
    if (results.length < publicMvpEvaluationScenarios.length) {
      await db.update(publicMvpEvaluationRuns).set({ status: results.length === 0 ? "failed" : "partial_failed", completedAt: new Date() }).where(eq(publicMvpEvaluationRuns.id, run.id));
    }
  }

  const failedCount = results.filter((result) => result.status !== "scored").length;
  const status = failedCount === 0 ? "completed" : failedCount === results.length ? "failed" : "partial_failed";

  await db.update(publicMvpEvaluationRuns).set({ status, completedAt: new Date() }).where(eq(publicMvpEvaluationRuns.id, run.id));

  return {
    success: true,
    run: {
      id: run.id,
      promptSetVersion: promptSet.version,
      modelVersion: model.gatewayModelName,
      actorUserId: session.userId,
      status,
      resultCount: results.length,
      scoredCount: results.length - failedCount,
      failedCount,
      results,
    },
  };
}

async function ensurePromptSet(db: ReturnType<typeof getDb>) {
  const [existing] = await db.select().from(publicMvpEvaluationPromptSets).where(eq(publicMvpEvaluationPromptSets.version, publicMvpEvaluationPromptSetVersion)).limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(publicMvpEvaluationPromptSets)
    .values({ version: publicMvpEvaluationPromptSetVersion, rubricVersion: publicMvpEvaluationRubricVersion })
    .onConflictDoUpdate({ target: publicMvpEvaluationPromptSets.version, set: { rubricVersion: publicMvpEvaluationRubricVersion } })
    .returning();

  return created;
}

async function runSinglePrompt({
  db,
  runId,
  promptSet,
  scenario,
  model,
  aiAskModel,
  scorer,
  answerGenerator,
  actorUserId,
}: {
  db: ReturnType<typeof getDb>;
  runId: string;
  promptSet: typeof publicMvpEvaluationPromptSets.$inferSelect;
  scenario: PublicMvpEvaluationScenarioDefinition;
  model: SelectedAiGatewayModel;
  aiAskModel: SelectedAiGatewayModel;
  scorer: (input: { db: ReturnType<typeof getDb>; prompt: PublicMvpEvaluationPromptDefinition; scenario: PublicMvpEvaluationScenarioDefinition; model: SelectedAiGatewayModel; actorUserId: string; answer: EvaluationAiAskAnswer }) => Promise<EvaluationScorerOutput>;
  answerGenerator: NonNullable<EvaluationDependencies["answerGenerator"]>;
  actorUserId: string;
}): Promise<PublicMvpEvaluationResultSummary> {
  const prompt = scenario.prompt;
  let fixture: { cardIds: string[] } | null = null;
  try {
    fixture = await prepareEvaluationScenarioFixture(db, actorUserId, scenario);
    const webFallbackAbort = scenario.id === "web_fallback_unavailable" ? new AbortController() : null;
    webFallbackAbort?.abort();
    const generatedAnswer = await answerGenerator({ db, prompt, scenario, model: aiAskModel, actorUserId, knowledgeCardIds: fixture.cardIds, abortSignal: webFallbackAbort?.signal });

    if (!generatedAnswer.ok) {
      return insertFailedResult({ db, runId, promptSet, scenario, model, safeErrorCode: "evaluator_failed", usageEventId: generatedAnswer.usageEventId });
    }

    const decision = decisionSnapshot(generatedAnswer.answer);
    const policySnapshot = buildPolicySnapshot("evaluation", generatedAnswer.answer, scenario);
    if (!matchesScenarioFixture(generatedAnswer.answer, decision, scenario.fixture) || !matchesScenarioContract(policySnapshot, generatedAnswer.answer.answerText, scenario.expected)) {
      return insertFailedResult({ db, runId, promptSet, scenario, model, safeErrorCode: "evaluator_failed", usageEventId: generatedAnswer.answer.usageEventId, policySnapshot });
    }

    const output = await scorer({ db, prompt, scenario, model, actorUserId, answer: generatedAnswer.answer });
    const validation = validateScorerOutput(output);

    if (!validation.valid) {
      return insertFailedResult({ db, runId, promptSet, scenario, model, safeErrorCode: "invalid_score_payload", usageEventId: output.usageEventId ?? generatedAnswer.answer.usageEventId });
    }

    const result = await db.transaction(async (tx) => {
      const [createdResult] = await tx
        .insert(publicMvpEvaluationResults)
        .values({
          runId,
          promptSetId: promptSet.id,
          promptSetVersion: promptSet.version,
          promptType: prompt.type,
          promptVersion: prompt.version,
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          modelVersion: generatedAnswer.answer.modelVersion,
          status: "scored",
          answerText: generatedAnswer.answer.answerText.trim(),
          unsupportedClaimFlag: output.flags.unsupportedClaim,
          missingUncertaintyFlag: output.flags.missingUncertainty,
          noBetterThanGenericFlag: output.flags.noBetterThanGeneric,
          unsupportedCommunityWordingFlag: output.flags.unsupportedCommunityWording ?? false,
          requiredCaveatOmittedFlag: output.flags.requiredCaveatOmitted ?? false,
          conflictedKnowledgeExcludedFlag: deterministicPolicyFlags(generatedAnswer.answer).conflictedKnowledgeExcluded,
          staleWithdrawnSourceExposureFlag: deterministicPolicyFlags(generatedAnswer.answer).staleWithdrawnSourceExposure,
          rawEvidenceLeakageFlag: deterministicPolicyFlags(generatedAnswer.answer).rawEvidenceLeakage,
          fallbackVerificationGuidanceMetFlag: deterministicPolicyFlags(generatedAnswer.answer).fallbackVerificationGuidanceMet,
          assistantMessageId: generatedAnswer.answer.assistantMessageId,
          retrievalDecisionId: generatedAnswer.answer.retrievalDecisionId,
          provenanceId: generatedAnswer.answer.provenanceId,
          usageEventId: output.usageEventId ?? generatedAnswer.answer.usageEventId,
        })
        .returning();

      await tx.insert(publicMvpEvaluationResultScores).values(
        publicMvpEvaluationScoreDimensions.map((dimension) => ({
          resultId: createdResult.id,
          dimension,
          score: output.scores[dimension],
        })),
      );
      await tx.insert(publicMvpEvaluationResultPolicySnapshots).values(buildPolicySnapshot(createdResult.id, generatedAnswer.answer, scenario));

      return createdResult;
    });

    return summarizeResult(result.id, scenario, "scored", null, output.scores, { ...output.flags, ...deterministicPolicyFlags(generatedAnswer.answer) });
  } catch (error) {
    return insertFailedResult({ db, runId, promptSet, scenario, model, safeErrorCode: isInvalidScorePayloadError(error) ? "invalid_score_payload" : "evaluator_failed", usageEventId: getUsageEventId(error) });
  } finally {
    if (fixture) await cleanupEvaluationScenarioFixture(db, fixture.cardIds);
  }
}

async function insertFailedResult({
  db,
  runId,
  promptSet,
  scenario,
  model,
  safeErrorCode,
  usageEventId,
  policySnapshot,
}: {
  db: ReturnType<typeof getDb>;
  runId: string;
  promptSet: typeof publicMvpEvaluationPromptSets.$inferSelect;
  scenario: PublicMvpEvaluationScenarioDefinition;
  model: SelectedAiGatewayModel;
  safeErrorCode: "evaluator_failed" | "invalid_score_payload";
  usageEventId?: string | null;
  policySnapshot?: ReturnType<typeof buildPolicySnapshot>;
}) {
  const prompt = scenario.prompt;
  const result = await db.transaction(async (tx) => {
    const [createdResult] = await tx
      .insert(publicMvpEvaluationResults)
      .values({
        runId,
        promptSetId: promptSet.id,
        promptSetVersion: promptSet.version,
        promptType: prompt.type,
        promptVersion: prompt.version,
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        modelVersion: model.gatewayModelName,
        status: "failed",
        safeErrorCode,
        usageEventId: usageEventId ?? null,
      })
      .returning();

    if (policySnapshot) {
      await tx.insert(publicMvpEvaluationResultPolicySnapshots).values({ ...policySnapshot, resultId: createdResult.id });
    }

    return createdResult;
  });

  return summarizeResult(result.id, scenario, "failed", safeErrorCode, {}, { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false, unsupportedCommunityWording: false, requiredCaveatOmitted: false, conflictedKnowledgeExcluded: false, staleWithdrawnSourceExposure: false, rawEvidenceLeakage: false, fallbackVerificationGuidanceMet: false });
}

function validateScorerOutput(output: EvaluationScorerOutput) {
  if (!isRecord(output) || !isRecord(output.scores) || !isRecord(output.flags)) {
    return { valid: false };
  }

  const answerText = typeof output.answerText === "string" ? output.answerText.trim() : "";

  if (!answerText || answerText.length > 12_000) {
    return { valid: false };
  }

  for (const dimension of publicMvpEvaluationScoreDimensions) {
    const score = output.scores[dimension];

    if (!Number.isInteger(score) || score < 1 || score > 10) {
      return { valid: false };
    }
  }

  if (typeof output.flags.unsupportedClaim !== "boolean" || typeof output.flags.missingUncertainty !== "boolean" || typeof output.flags.noBetterThanGeneric !== "boolean" || typeof output.flags.unsupportedCommunityWording !== "boolean" || typeof output.flags.requiredCaveatOmitted !== "boolean") {
    return { valid: false };
  }

  return { valid: true };
}

async function scoreWithEvaluationModel({ db, prompt, scenario, model, actorUserId, answer }: { db: ReturnType<typeof getDb>; prompt: PublicMvpEvaluationPromptDefinition; scenario: PublicMvpEvaluationScenarioDefinition; model: SelectedAiGatewayModel; actorUserId: string; answer: EvaluationAiAskAnswer }): Promise<EvaluationScorerOutput> {
  const gatewayResult = await completeEvaluation({
    model: model.gatewayModelName,
    messages: [
      {
        role: "system",
        content:
          "You evaluate XuyenViet public MVP assistant quality. Return only JSON with six 1-10 scores and boolean flags unsupportedClaim, missingUncertainty, noBetterThanGeneric, unsupportedCommunityWording, requiredCaveatOmitted. Do not include raw source material or provider payloads.",
      },
      { role: "user", content: JSON.stringify({ traveler_prompt: prompt.prompt, assistant_answer: answer.answerText, policy_contract: safeEvaluatorPolicyContract(answer, scenario) }) },
    ],
  });

  const usageEventId = await recordEvaluationUsage(db, model, gatewayResult, actorUserId);

  if (!gatewayResult.ok) {
    throwWithUsageEventId(new Error("Evaluation gateway failed."), usageEventId);
  }

  try {
    return { ...parseScorerJson(gatewayResult.content, answer.answerText), usageEventId };
  } catch (error) {
    throwWithUsageEventId(error, usageEventId);
  }
}

async function recordEvaluationUsage(db: ReturnType<typeof getDb>, model: SelectedAiGatewayModel, gatewayResult: AiGatewayExtractionResult, actorUserId: string) {
  return writeAiUsageEvent(db, {
    userId: actorUserId,
    purpose: aiUsagePurposes.evaluation,
    provider: gatewayResult.provider,
    model: gatewayResult.model,
    aiGatewayModelId: model.id,
    promptVersion: aiUsagePromptVersions.publicMvpAnswerEvaluation,
    status: gatewayResult.ok ? "success" : "failure",
    latencyMs: gatewayResult.latencyMs,
    promptTokens: gatewayResult.ok ? gatewayResult.usage.promptTokens : null,
    completionTokens: gatewayResult.ok ? gatewayResult.usage.completionTokens : null,
    totalTokens: gatewayResult.ok ? gatewayResult.usage.totalTokens : null,
    cachedPromptTokens: gatewayResult.ok ? gatewayResult.usage.cachedPromptTokens : null,
    cacheWritePromptTokens: gatewayResult.ok ? gatewayResult.usage.cacheWritePromptTokens : null,
    pricingSnapshot: getAiGatewayPricingSnapshot(model),
    errorCode: gatewayResult.ok ? null : gatewayResult.errorCode,
  });
}

function parseScorerJson(content: string, answerText: string): EvaluationScorerOutput {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throwInvalidScorePayload();
  }

  if (!isRecord(parsed) || !isRecord(parsed.scores) || !isRecord(parsed.flags)) {
    throwInvalidScorePayload();
  }

  const scorePayload = parsed.scores;
  const flagPayload = parsed.flags;

  return {
    answerText,
    scores: Object.fromEntries(publicMvpEvaluationScoreDimensions.map((dimension) => [dimension, scorePayload[dimension]])) as EvaluationScores,
    flags: {
      unsupportedClaim: requireBooleanFlag(flagPayload.unsupportedClaim),
      missingUncertainty: requireBooleanFlag(flagPayload.missingUncertainty),
      noBetterThanGeneric: requireBooleanFlag(flagPayload.noBetterThanGeneric),
      unsupportedCommunityWording: requireBooleanFlag(flagPayload.unsupportedCommunityWording),
      requiredCaveatOmitted: requireBooleanFlag(flagPayload.requiredCaveatOmitted),
    },
  };
}

function requireBooleanFlag(value: unknown) {
  if (typeof value !== "boolean") {
    throwInvalidScorePayload();
  }

  return value;
}

function throwInvalidScorePayload(): never {
  const error = new Error("Invalid evaluation score payload.") as InvalidScorePayloadError;
  error.code = "invalid_score_payload";
  throw error;
}

function isInvalidScorePayloadError(error: unknown): error is InvalidScorePayloadError {
  return isRecord(error) && error.code === "invalid_score_payload";
}

function throwWithUsageEventId(error: unknown, usageEventId: string): never {
  if (isRecord(error)) {
    error.usageEventId = usageEventId;
    throw error;
  }

  const wrapped = new Error("Evaluation scorer failed.");
  (wrapped as Error & { usageEventId?: string }).usageEventId = usageEventId;
  throw wrapped;
}

function getUsageEventId(error: unknown) {
  return isRecord(error) && typeof error.usageEventId === "string" ? error.usageEventId : null;
}

function summarizeResult(
  id: string,
  scenario: PublicMvpEvaluationScenarioDefinition,
  status: PublicMvpEvaluationResultSummary["status"],
  safeErrorCode: PublicMvpEvaluationResultSummary["safeErrorCode"],
  scores: Partial<EvaluationScores>,
  flags: PublicMvpEvaluationResultSummary["flags"],
): PublicMvpEvaluationResultSummary {
  return { id, promptType: scenario.prompt.type, promptVersion: scenario.prompt.version, scenarioId: scenario.id, scenarioVersion: scenario.version, status, safeErrorCode, scores, flags };
}

function deterministicPolicyFlags(answer: EvaluationAiAskAnswer) {
  const selectedKnowledge = (answer.provenance ?? []).filter((row) => row.sourceCategory === "knowledge" && row.usedInPrompt);
  const retrievalSnapshot = selectedKnowledge.map((row) => row.sourceSnapshot);
  const hasConflict = retrievalSnapshot.some((snapshot) => snapshot.knowledgeState === "conflicted");
  const decision = decisionSnapshot(answer);
  const fallbackRequired = decision.webSearchTriggered && (
    decision.warnings.includes("web_search_load_failed")
    || decision.warnings.includes("web_search_low_quality")
    || selectedKnowledge.some((row) => row.sourceSnapshot.usePolicy === "caveat_only")
  );
  const guidance = hasVerificationGuidance(answer.answerText);
  return {
    conflictedKnowledgeExcluded: !hasConflict && (decision.excludedPolicyCounts.conflict === 0 || decision.excludedReasonCodes.length > 0),
    // Only a persisted source that was actually used can establish unsafe exposure.
    staleWithdrawnSourceExposure: selectedKnowledge.some((row) => hasIneligibleEvidenceState(row.sourceSnapshot)),
    rawEvidenceLeakage: hasSensitiveOrWithheldEvidenceDisclosure(answer.answerText, selectedKnowledge),
    fallbackVerificationGuidanceMet: !fallbackRequired || guidance,
  };
}

function hasIneligibleEvidenceState(snapshot: Record<string, unknown>) {
  return snapshot.knowledgeState === "superseded"
    || snapshot.knowledgeState === "conflicted"
    || hasStateValue(snapshot.sourceEligibility)
    || hasStateValue(snapshot.evidenceState)
    || hasStateValue(snapshot.indexState)
    || (Array.isArray(snapshot.evidence) && snapshot.evidence.some((evidence) => isRecord(evidence) && (hasStateValue(evidence.state) || hasStateValue(evidence.eligibility))));
}

function hasStateValue(value: unknown) {
  return value === "withdrawn" || value === "removed" || value === "stale" || value === "ineligible" || value === "missing";
}

function hasSensitiveOrWithheldEvidenceDisclosure(answerText: string, selectedKnowledge: Array<{ sourceSnapshot: Record<string, unknown> }>) {
  if (/(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?84|0)(?:[\s.-]?\d){8,10}|https?:\/\/[^\s/:]+:[^\s@]+@)/i.test(answerText)) {
    return true;
  }

  const withheldIdentifiers = selectedKnowledge.flatMap(({ sourceSnapshot }) => {
    if (!Array.isArray(sourceSnapshot.evidence)) return [];
    return sourceSnapshot.evidence.flatMap((evidence) => {
      if (!isRecord(evidence) || evidence.displayPolicy === "traveler_visible") return [];
      return [safeString(evidence.sourceLabel), safeString(evidence.evidenceId)].filter((value): value is string => value !== null && value.length >= 4);
    });
  });

  return withheldIdentifiers.some((identifier) => answerIncludes(answerText, identifier));
}

function buildPolicySnapshot(resultId: string, answer: EvaluationAiAskAnswer, scenario: PublicMvpEvaluationScenarioDefinition) {
  const selectedKnowledge = (answer.provenance ?? [])
    .filter((row) => row.sourceCategory === "knowledge" && row.usedInPrompt)
    .slice(0, 5)
    .map((row) => ({ cardId: safeString(row.sourceSnapshot.knowledgeCardId), contentVersion: safeNumber(row.sourceSnapshot.contentVersion), knowledgeState: safeString(row.sourceSnapshot.knowledgeState), verificationState: safeString(row.sourceSnapshot.verificationState), usePolicy: safeString(row.sourceSnapshot.usePolicy), conditions: boundedStrings(row.sourceSnapshot.conditions) }));
  const decision = decisionSnapshot(answer);
  const flags = deterministicPolicyFlags(answer);
  return {
    resultId,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    selectedKnowledge,
    excludedCandidateCounts: decision.excludedPolicyCounts,
    excludedReasonCodes: decision.excludedReasonCodes,
    targetCandidateExcluded: decision.excludedPolicyCounts.conflict + decision.excludedPolicyCounts.verificationRequired + decision.excludedPolicyCounts.other > 0,
    sourceOrEvidenceOutcome: sourceOrEvidenceOutcome(decision, selectedKnowledge),
    webFallback: { triggered: decision.webSearchTriggered, triggerReasons: decision.webSearchTriggerReasons, warnings: decision.warnings, guidanceMet: flags.fallbackVerificationGuidanceMet },
    finalizationOutcome: flags.fallbackVerificationGuidanceMet ? "verification_guidance_present" : "verification_guidance_missing",
  };
}

type AnswerDecisionSnapshot = {
  excludedPolicyCounts: { conflict: number; verificationRequired: number; other: number };
  excludedReasonCodes: string[];
  webSearchTriggered: boolean;
  webSearchTriggerReasons: string[];
  warnings: string[];
};

function decisionSnapshot(answer: EvaluationAiAskAnswer): AnswerDecisionSnapshot {
  const snapshot = answer.retrievalDecision?.knowledgePolicySnapshot;
  const policy = isRecord(snapshot) ? snapshot : {};
  const counts = isRecord(policy.excludedPolicyCounts) ? policy.excludedPolicyCounts : {};
  return {
    excludedPolicyCounts: {
      conflict: safeNumber(counts.conflict) ?? 0,
      verificationRequired: safeNumber(counts.verificationRequired) ?? 0,
      other: safeNumber(counts.other) ?? 0,
    },
    excludedReasonCodes: boundedStrings(policy.excludedReasonCodes),
    webSearchTriggered: answer.retrievalDecision?.webSearchTriggered ?? false,
    webSearchTriggerReasons: boundedStrings(answer.retrievalDecision?.webSearchTriggerReasons),
    warnings: boundedStrings(answer.retrievalDecision?.warnings),
  };
}

function matchesScenarioFixture(answer: EvaluationAiAskAnswer, decision: AnswerDecisionSnapshot, fixture: PublicMvpEvaluationScenarioDefinition["fixture"]) {
  const selectedStates = (answer.provenance ?? [])
    .filter((row) => row.sourceCategory === "knowledge" && row.usedInPrompt)
    .map((row) => safeString(row.sourceSnapshot.knowledgeState))
    .filter((state): state is string => state !== null);
  return fixture.selectedKnowledgeStates.every((state) => selectedStates.includes(state))
    && fixture.excludedReasonCodes.every((reason) => decision.excludedReasonCodes.includes(reason))
    && (fixture.webFallbackWarnings.length === 0 || fixture.webFallbackWarnings.some((warning) => decision.warnings.includes(warning)));
}

function matchesScenarioContract(
  snapshot: ReturnType<typeof buildPolicySnapshot>,
  finalAnswer: string,
  expected: PublicMvpEvaluationScenarioDefinition["expected"],
) {
  return snapshot.targetCandidateExcluded === expected.targetCandidateExcluded
    && snapshot.sourceOrEvidenceOutcome === expected.sourceOrEvidenceOutcome
    && (!expected.fallbackRequired || (snapshot.webFallback.triggered && snapshot.finalizationOutcome === "verification_guidance_present"))
    && (!expected.conditionalHighRisk || matchesConditionalHighRiskContract(snapshot, finalAnswer, expected.conditionalHighRisk));
}

function matchesConditionalHighRiskContract(snapshot: ReturnType<typeof buildPolicySnapshot>, finalAnswer: string, expected: { conditions: string[] }) {
  const selected = snapshot.selectedKnowledge.find((item) => item.knowledgeState === "conditional");
  return selected?.verificationState === "required"
    && selected.usePolicy === "caveat_only"
    && expected.conditions.length > 0
    && expected.conditions.every((condition) => selected.conditions.includes(condition))
    && expected.conditions.every((condition) => answerIncludes(finalAnswer, condition))
    && hasVerificationGuidance(finalAnswer);
}

function answerIncludes(answer: string, expected: string) {
  return answer.toLocaleLowerCase("vi-VN").includes(expected.toLocaleLowerCase("vi-VN"));
}

function hasVerificationGuidance(answer: string) {
  return /không thể xác minh|cần kiểm tra|hãy kiểm tra|xác nhận/i.test(answer);
}

function sourceOrEvidenceOutcome(decision: AnswerDecisionSnapshot, selectedKnowledge: Array<Record<string, unknown>>) {
  if (selectedKnowledge.length > 0) return "eligible";
  if (decision.excludedPolicyCounts.conflict > 0) return "excluded_conflict";
  if (decision.excludedPolicyCounts.verificationRequired > 0 || decision.excludedPolicyCounts.other > 0) return "withdrawn_or_ineligible";
  return "no_eligible_knowledge";
}

function safeEvaluatorPolicyContract(answer: EvaluationAiAskAnswer, scenario: PublicMvpEvaluationScenarioDefinition) {
  const snapshot = buildPolicySnapshot("evaluation", answer, scenario);
  return { scenarioId: snapshot.scenarioId, selectedKnowledge: snapshot.selectedKnowledge, sourceOrEvidenceOutcome: snapshot.sourceOrEvidenceOutcome, webFallback: snapshot.webFallback };
}

function safeString(value: unknown) { return typeof value === "string" ? value.slice(0, 120) : null; }
function safeNumber(value: unknown) { return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null; }
function boundedStrings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 10) : []; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
