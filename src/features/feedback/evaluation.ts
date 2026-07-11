import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  publicMvpEvaluationPromptSets,
  publicMvpEvaluationResultScores,
  publicMvpEvaluationResults,
  publicMvpEvaluationRuns,
  type PublicMvpEvaluationPromptType,
  type PublicMvpEvaluationScoreDimension,
} from "@/db/schema";
import { completeEvaluation, type AiGatewayExtractionResult } from "@/features/ai/gateway";
import { getAiGatewayPricingSnapshot, selectActiveAiGatewayModel, type SelectedAiGatewayModel } from "@/features/ai/models";
import { aiUsagePromptVersions, aiUsagePurposes, writeAiUsageEvent } from "@/features/usage/events";
import { getAuthenticatedSessionWithRoles, hasAdminAccess } from "@/server/auth";

export const publicMvpEvaluationPromptSetVersion = "public_mvp_v1";
export const publicMvpEvaluationRubricVersion = "epic_6_quality_rubric_v1";

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

export type EvaluationScores = Record<PublicMvpEvaluationScoreDimension, number>;

export type EvaluationScorerOutput = {
  answerText: string;
  scores: EvaluationScores;
  flags: {
    unsupportedClaim: boolean;
    missingUncertainty: boolean;
    noBetterThanGeneric: boolean;
  };
  usageEventId?: string | null;
};

export type PublicMvpEvaluationRunResult =
  | { success: true; run: PublicMvpEvaluationRunSummary }
  | { success: false; reason: "unauthorized" | "missing_evaluation_model" };

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
  status: "scored" | "failed" | "unscored";
  safeErrorCode: "evaluator_failed" | "invalid_score_payload" | null;
  scores: Partial<EvaluationScores>;
  flags: EvaluationScorerOutput["flags"];
};

type EvaluationDependencies = {
  db?: ReturnType<typeof getDb>;
  selectModel?: typeof selectActiveAiGatewayModel;
  scorer?: (input: { db: ReturnType<typeof getDb>; prompt: PublicMvpEvaluationPromptDefinition; model: SelectedAiGatewayModel; actorUserId: string }) => Promise<EvaluationScorerOutput>;
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
      runMetadata: { promptCount: publicMvpEvaluationPrompts.length, rubricVersion: promptSet.rubricVersion },
    })
    .returning();
  const scorer = dependencies.scorer ?? scoreWithEvaluationModel;
  const results: PublicMvpEvaluationResultSummary[] = [];

  try {
    for (const prompt of publicMvpEvaluationPrompts) {
      const result = await runSinglePrompt({ db, runId: run.id, promptSet, prompt, model, scorer, actorUserId: session.userId });
      results.push(result);
    }
  } finally {
    if (results.length < publicMvpEvaluationPrompts.length) {
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
  prompt,
  model,
  scorer,
  actorUserId,
}: {
  db: ReturnType<typeof getDb>;
  runId: string;
  promptSet: typeof publicMvpEvaluationPromptSets.$inferSelect;
  prompt: PublicMvpEvaluationPromptDefinition;
  model: SelectedAiGatewayModel;
  scorer: (input: { db: ReturnType<typeof getDb>; prompt: PublicMvpEvaluationPromptDefinition; model: SelectedAiGatewayModel; actorUserId: string }) => Promise<EvaluationScorerOutput>;
  actorUserId: string;
}): Promise<PublicMvpEvaluationResultSummary> {
  try {
    const output = await scorer({ db, prompt, model, actorUserId });
    const validation = validateScorerOutput(output);

    if (!validation.valid) {
      return insertFailedResult({ db, runId, promptSet, prompt, model, safeErrorCode: "invalid_score_payload" });
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
          modelVersion: model.gatewayModelName,
          status: "scored",
          answerText: output.answerText.trim(),
          unsupportedClaimFlag: output.flags.unsupportedClaim,
          missingUncertaintyFlag: output.flags.missingUncertainty,
          noBetterThanGenericFlag: output.flags.noBetterThanGeneric,
          usageEventId: output.usageEventId ?? null,
        })
        .returning();

      await tx.insert(publicMvpEvaluationResultScores).values(
        publicMvpEvaluationScoreDimensions.map((dimension) => ({
          resultId: createdResult.id,
          dimension,
          score: output.scores[dimension],
        })),
      );

      return createdResult;
    });

    return summarizeResult(result.id, prompt, "scored", null, output.scores, output.flags);
  } catch (error) {
    return insertFailedResult({ db, runId, promptSet, prompt, model, safeErrorCode: isInvalidScorePayloadError(error) ? "invalid_score_payload" : "evaluator_failed" });
  }
}

async function insertFailedResult({
  db,
  runId,
  promptSet,
  prompt,
  model,
  safeErrorCode,
}: {
  db: ReturnType<typeof getDb>;
  runId: string;
  promptSet: typeof publicMvpEvaluationPromptSets.$inferSelect;
  prompt: PublicMvpEvaluationPromptDefinition;
  model: SelectedAiGatewayModel;
  safeErrorCode: "evaluator_failed" | "invalid_score_payload";
}) {
  const [result] = await db
    .insert(publicMvpEvaluationResults)
    .values({
      runId,
      promptSetId: promptSet.id,
      promptSetVersion: promptSet.version,
      promptType: prompt.type,
      promptVersion: prompt.version,
      modelVersion: model.gatewayModelName,
      status: "failed",
      safeErrorCode,
    })
    .returning();

  return summarizeResult(result.id, prompt, "failed", safeErrorCode, {}, { unsupportedClaim: false, missingUncertainty: false, noBetterThanGeneric: false });
}

function validateScorerOutput(output: EvaluationScorerOutput) {
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

  if (typeof output.flags.unsupportedClaim !== "boolean" || typeof output.flags.missingUncertainty !== "boolean" || typeof output.flags.noBetterThanGeneric !== "boolean") {
    return { valid: false };
  }

  return { valid: true };
}

async function scoreWithEvaluationModel({ db, prompt, model, actorUserId }: { db: ReturnType<typeof getDb>; prompt: PublicMvpEvaluationPromptDefinition; model: SelectedAiGatewayModel; actorUserId: string }): Promise<EvaluationScorerOutput> {
  const gatewayResult = await completeEvaluation({
    model: model.gatewayModelName,
    messages: [
      {
        role: "system",
        content:
          "You evaluate XuyenViet public MVP assistant quality. Return only JSON with answerText, scores, and flags. Scores are integers 1-10 for user_context_use, practical_specificity, source_grounding, uncertainty_handling, family_awareness, vietnamese_clarity. Flags are booleans unsupportedClaim, missingUncertainty, noBetterThanGeneric. Do not include raw source material or provider payloads.",
      },
      { role: "user", content: prompt.prompt },
    ],
  });

  const usageEventId = await recordEvaluationUsage(db, model, gatewayResult, actorUserId);

  if (!gatewayResult.ok) {
    throw new Error("Evaluation gateway failed.");
  }

  return { ...parseScorerJson(gatewayResult.content), usageEventId };
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

function parseScorerJson(content: string): EvaluationScorerOutput {
  const parsed = JSON.parse(content) as unknown;

  if (!isRecord(parsed) || !isRecord(parsed.scores) || !isRecord(parsed.flags) || typeof parsed.answerText !== "string") {
    throwInvalidScorePayload();
  }

  const scorePayload = parsed.scores;
  const flagPayload = parsed.flags;

  return {
    answerText: parsed.answerText,
    scores: Object.fromEntries(publicMvpEvaluationScoreDimensions.map((dimension) => [dimension, scorePayload[dimension]])) as EvaluationScores,
    flags: {
      unsupportedClaim: requireBooleanFlag(flagPayload.unsupportedClaim),
      missingUncertainty: requireBooleanFlag(flagPayload.missingUncertainty),
      noBetterThanGeneric: requireBooleanFlag(flagPayload.noBetterThanGeneric),
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

function summarizeResult(
  id: string,
  prompt: PublicMvpEvaluationPromptDefinition,
  status: PublicMvpEvaluationResultSummary["status"],
  safeErrorCode: PublicMvpEvaluationResultSummary["safeErrorCode"],
  scores: Partial<EvaluationScores>,
  flags: EvaluationScorerOutput["flags"],
): PublicMvpEvaluationResultSummary {
  return { id, promptType: prompt.type, promptVersion: prompt.version, status, safeErrorCode, scores, flags };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
