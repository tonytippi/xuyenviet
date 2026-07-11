import "server-only";

import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { getDb } from "@/db/client";
import {
  answerUsefulnessFeedback,
  assistantResponseProvenance,
  assistantRetrievalDecisions,
  publicMvpEvaluationResultScores,
  publicMvpEvaluationResults,
  publicMvpEvaluationRuns,
  publicMvpEvaluationPromptTypeValues,
  type AssistantProvenanceSourceCategory,
  type PublicMvpEvaluationPromptType,
  type PublicMvpEvaluationScoreDimension,
} from "@/db/schema";
import { getAuthenticatedSessionWithRoles, hasAdminAccess } from "@/server/auth";

export const qualityDashboardRangeValues = ["7d", "30d", "90d", "all"] as const;
export type QualityDashboardRange = (typeof qualityDashboardRangeValues)[number];

export type PublicMvpQualityDashboardInput = {
  promptType?: string | null;
  range?: string | null;
  db?: ReturnType<typeof getDb>;
};

export type PublicMvpQualityDashboard = {
  success: true;
  filters: {
    promptType: PublicMvpEvaluationPromptType | "all";
    range: QualityDashboardRange;
    since: Date | null;
  };
  feedback: {
    total: number;
    useful: number;
    notUseful: number;
    usefulRate: number | null;
    recentComments: string[];
  };
  evaluation: {
    totalResults: number;
    scoredResults: number;
    failedResults: number;
    averageScore: number | null;
    averageByDimension: Record<PublicMvpEvaluationScoreDimension, number | null>;
    counterMetrics: {
      unsupportedClaims: number;
      missingUncertainty: number;
      noBetterThanGeneric: number;
    };
  };
  readiness: {
    status: "ready" | "not_ready";
    checks: Array<{ key: string; label: string; passed: boolean; current: number; target: number; missing: number; message: string }>;
    missingSignals: string[];
  };
  recentResults: QualityDashboardRecentResult[];
};

export type PublicMvpQualityDashboardResult = PublicMvpQualityDashboard | { success: false; reason: "unauthorized" };

export type QualityDashboardRecentResult = {
  id: string;
  runId: string;
  promptType: PublicMvpEvaluationPromptType;
  status: string;
  createdAt: Date;
  averageScore: number | null;
  flags: {
    unsupportedClaim: boolean;
    missingUncertainty: boolean;
    noBetterThanGeneric: boolean;
  };
  safeLinks: {
    assistantMessageId: string | null;
    retrievalDecisionId: string | null;
    provenanceId: string | null;
  };
  retrieval: {
    available: boolean;
    approvedKnowledgeSelectedCount: number | null;
    webSearchTriggered: boolean | null;
    generalReasoningUsed: boolean | null;
    freshnessRequired: boolean | null;
    conflictDetected: boolean | null;
    triggerReasons: string[];
    warnings: string[];
  };
  provenance: Record<AssistantProvenanceSourceCategory, boolean>;
  likelyIssues: string[];
};

const scoreDimensions = ["user_context_use", "practical_specificity", "source_grounding", "uncertainty_handling", "family_awareness", "vietnamese_clarity"] as const satisfies readonly PublicMvpEvaluationScoreDimension[];
const provenanceCategories = ["trip_context", "chat_context", "knowledge", "web", "general"] as const satisfies readonly AssistantProvenanceSourceCategory[];

export async function getPublicMvpQualityDashboard(input: PublicMvpQualityDashboardInput = {}): Promise<PublicMvpQualityDashboardResult> {
  const session = await getAuthenticatedSessionWithRoles();

  if (!session || !hasAdminAccess(session.roles)) {
    return { success: false, reason: "unauthorized" };
  }

  const db = input.db ?? getDb();
  const filters = normalizeFilters(input);
  const evaluationConditions = filters.since ? [gte(publicMvpEvaluationResults.createdAt, filters.since)] : [];
  const feedbackConditions = filters.since ? [gte(answerUsefulnessFeedback.createdAt, filters.since)] : [];

  if (filters.promptType !== "all") {
    evaluationConditions.push(eq(publicMvpEvaluationResults.promptType, filters.promptType));
  }

  const [allFeedbackRows, resultRows] = await Promise.all([
    db
      .select({ assistantMessageId: answerUsefulnessFeedback.assistantMessageId, rating: answerUsefulnessFeedback.rating, comment: answerUsefulnessFeedback.comment, createdAt: answerUsefulnessFeedback.createdAt })
      .from(answerUsefulnessFeedback)
      .where(feedbackConditions.length > 0 ? and(...feedbackConditions) : undefined)
      .orderBy(desc(answerUsefulnessFeedback.createdAt)),
    db
      .select({
        id: publicMvpEvaluationResults.id,
        runId: publicMvpEvaluationResults.runId,
        promptType: publicMvpEvaluationResults.promptType,
        status: publicMvpEvaluationResults.status,
        unsupportedClaimFlag: publicMvpEvaluationResults.unsupportedClaimFlag,
        missingUncertaintyFlag: publicMvpEvaluationResults.missingUncertaintyFlag,
        noBetterThanGenericFlag: publicMvpEvaluationResults.noBetterThanGenericFlag,
        assistantMessageId: publicMvpEvaluationResults.assistantMessageId,
        retrievalDecisionId: publicMvpEvaluationResults.retrievalDecisionId,
        provenanceId: publicMvpEvaluationResults.provenanceId,
        createdAt: publicMvpEvaluationResults.createdAt,
      })
      .from(publicMvpEvaluationResults)
      .innerJoin(publicMvpEvaluationRuns, eq(publicMvpEvaluationRuns.id, publicMvpEvaluationResults.runId))
      .where(evaluationConditions.length > 0 ? and(...evaluationConditions) : undefined)
      .orderBy(desc(publicMvpEvaluationResults.createdAt)),
  ]);

  const filteredResultIds = resultRows.filter((row) => row.status === "scored").map((row) => row.id);
  const scoreRows =
    filteredResultIds.length > 0
      ? await db
          .select({ resultId: publicMvpEvaluationResultScores.resultId, dimension: publicMvpEvaluationResultScores.dimension, score: publicMvpEvaluationResultScores.score })
          .from(publicMvpEvaluationResultScores)
          .where(inArray(publicMvpEvaluationResultScores.resultId, filteredResultIds))
      : [];
  const feedbackRows = filterFeedbackRowsForPrompt({ feedbackRows: allFeedbackRows, resultRows, promptType: filters.promptType });
  const feedback = summarizeFeedback(feedbackRows);
  const evaluation = summarizeEvaluation(resultRows, scoreRows);
  const recentResults = await buildRecentResults({ db, resultRows: resultRows.slice(0, 10), scoreRows });
  const readiness = buildReadiness({ magicMomentFeedback: summarizeFeedback(filterFeedbackRowsForMagicMoment(feedbackRows, resultRows)), resultRows, scoreRows });

  return { success: true, filters, feedback, evaluation, readiness, recentResults };
}

function filterFeedbackRowsForPrompt({
  feedbackRows,
  resultRows,
  promptType,
}: {
  feedbackRows: Array<{ assistantMessageId: string; rating: string; comment: string | null }>;
  resultRows: Array<{ assistantMessageId: string | null }>;
  promptType: PublicMvpEvaluationPromptType | "all";
}) {
  if (promptType === "all") {
    return feedbackRows;
  }

  const evaluatedAssistantMessageIds = new Set(resultRows.map((row) => row.assistantMessageId).filter((id): id is string => Boolean(id)));

  return feedbackRows.filter((row) => evaluatedAssistantMessageIds.has(row.assistantMessageId));
}

function filterFeedbackRowsForMagicMoment(
  feedbackRows: Array<{ assistantMessageId: string; rating: string; comment: string | null }>,
  resultRows: Array<{ assistantMessageId: string | null; promptType: PublicMvpEvaluationPromptType }>,
) {
  const magicMomentAssistantMessageIds = new Set(
    resultRows
      .filter((row) => row.promptType === "magic_moment_family_trip")
      .map((row) => row.assistantMessageId)
      .filter((id): id is string => Boolean(id)),
  );

  return feedbackRows.filter((row) => magicMomentAssistantMessageIds.has(row.assistantMessageId));
}

function normalizeFilters(input: PublicMvpQualityDashboardInput): PublicMvpQualityDashboard["filters"] {
  const range = qualityDashboardRangeValues.includes(input.range as QualityDashboardRange) ? (input.range as QualityDashboardRange) : "30d";
  const promptType = publicMvpEvaluationPromptTypeValues.includes(input.promptType as PublicMvpEvaluationPromptType) ? (input.promptType as PublicMvpEvaluationPromptType) : "all";
  const now = new Date();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
  const since = days ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : null;

  return { promptType, range, since };
}

function summarizeFeedback(rows: Array<{ rating: string; comment: string | null }>): PublicMvpQualityDashboard["feedback"] {
  const useful = rows.filter((row) => row.rating === "useful").length;
  const notUseful = rows.filter((row) => row.rating === "not_useful").length;
  const total = useful + notUseful;

  return {
    total,
    useful,
    notUseful,
    usefulRate: total > 0 ? useful / total : null,
    recentComments: rows
      .map((row) => row.comment?.trim())
      .filter((comment): comment is string => Boolean(comment))
      .slice(0, 5)
      .map((comment) => truncate(comment, 160)),
  };
}

function summarizeEvaluation(
  rows: Array<{ status: string; unsupportedClaimFlag: boolean; missingUncertaintyFlag: boolean; noBetterThanGenericFlag: boolean }>,
  scores: Array<{ dimension: PublicMvpEvaluationScoreDimension; score: number }>,
): PublicMvpQualityDashboard["evaluation"] {
  const scoredResults = rows.filter((row) => row.status === "scored").length;
  const averageByDimension = Object.fromEntries(
    scoreDimensions.map((dimension) => {
      const dimensionScores = scores.filter((score) => score.dimension === dimension).map((score) => score.score);
      return [dimension, average(dimensionScores)];
    }),
  ) as Record<PublicMvpEvaluationScoreDimension, number | null>;

  return {
    totalResults: rows.length,
    scoredResults,
    failedResults: rows.filter((row) => row.status === "failed").length,
    averageScore: average(scores.map((score) => score.score)),
    averageByDimension,
    counterMetrics: {
      unsupportedClaims: rows.filter((row) => row.unsupportedClaimFlag).length,
      missingUncertainty: rows.filter((row) => row.missingUncertaintyFlag).length,
      noBetterThanGeneric: rows.filter((row) => row.noBetterThanGenericFlag).length,
    },
  };
}

async function buildRecentResults({
  db,
  resultRows,
  scoreRows,
}: {
  db: ReturnType<typeof getDb>;
  resultRows: Array<{
    id: string;
    runId: string;
    promptType: PublicMvpEvaluationPromptType;
    status: string;
    unsupportedClaimFlag: boolean;
    missingUncertaintyFlag: boolean;
    noBetterThanGenericFlag: boolean;
    assistantMessageId: string | null;
    retrievalDecisionId: string | null;
    provenanceId: string | null;
    createdAt: Date;
  }>;
  scoreRows: Array<{ resultId: string; dimension: PublicMvpEvaluationScoreDimension; score: number }>;
}): Promise<QualityDashboardRecentResult[]> {
  const decisionIds = resultRows.map((row) => row.retrievalDecisionId).filter((id): id is string => Boolean(id));
  const assistantMessageIds = resultRows.map((row) => row.assistantMessageId).filter((id): id is string => Boolean(id));
  const [decisions, provenanceRows] = await Promise.all([
    decisionIds.length > 0
      ? db.select().from(assistantRetrievalDecisions).where(inArray(assistantRetrievalDecisions.id, decisionIds))
      : Promise.resolve([]),
    assistantMessageIds.length > 0
      ? db
          .select({ assistantMessageId: assistantResponseProvenance.assistantMessageId, sourceCategory: assistantResponseProvenance.sourceCategory, usedInPrompt: assistantResponseProvenance.usedInPrompt, citedInAnswer: assistantResponseProvenance.citedInAnswer })
          .from(assistantResponseProvenance)
          .where(inArray(assistantResponseProvenance.assistantMessageId, assistantMessageIds))
      : Promise.resolve([]),
  ]);
  const decisionsById = new Map(decisions.map((decision) => [decision.id, decision]));
  const provenanceByAssistantMessageId = new Map<string, Set<AssistantProvenanceSourceCategory>>();

  for (const row of provenanceRows) {
    if (!row.usedInPrompt && !row.citedInAnswer) {
      continue;
    }

    const categories = provenanceByAssistantMessageId.get(row.assistantMessageId) ?? new Set<AssistantProvenanceSourceCategory>();
    categories.add(row.sourceCategory);
    provenanceByAssistantMessageId.set(row.assistantMessageId, categories);
  }

  return resultRows.map((row) => {
    const decision = row.retrievalDecisionId ? decisionsById.get(row.retrievalDecisionId) : undefined;
    const provenanceCategoriesForResult = row.assistantMessageId ? provenanceByAssistantMessageId.get(row.assistantMessageId) : undefined;
    const provenance = Object.fromEntries(provenanceCategories.map((category) => [category, provenanceCategoriesForResult?.has(category) ?? false])) as Record<AssistantProvenanceSourceCategory, boolean>;
    const likelyIssues = buildLikelyIssues({ row, decision, provenance });

    return {
      id: row.id,
      runId: row.runId,
      promptType: row.promptType,
      status: row.status,
      createdAt: row.createdAt,
      averageScore: average(scoreRows.filter((score) => score.resultId === row.id).map((score) => score.score)),
      flags: {
        unsupportedClaim: row.unsupportedClaimFlag,
        missingUncertainty: row.missingUncertaintyFlag,
        noBetterThanGeneric: row.noBetterThanGenericFlag,
      },
      safeLinks: {
        assistantMessageId: row.assistantMessageId,
        retrievalDecisionId: row.retrievalDecisionId,
        provenanceId: row.provenanceId,
      },
      retrieval: {
        available: Boolean(decision),
        approvedKnowledgeSelectedCount: decision?.approvedKnowledgeSelectedCount ?? null,
        webSearchTriggered: decision?.webSearchTriggered ?? null,
        generalReasoningUsed: decision?.generalReasoningUsed ?? null,
        freshnessRequired: decision?.freshnessRequired ?? null,
        conflictDetected: decision?.conflictDetected ?? null,
        triggerReasons: decision?.webSearchTriggerReasons ?? [],
        warnings: decision?.warnings ?? [],
      },
      provenance,
      likelyIssues,
    };
  });
}

function buildLikelyIssues({
  row,
  decision,
  provenance,
}: {
  row: { unsupportedClaimFlag: boolean; missingUncertaintyFlag: boolean; noBetterThanGenericFlag: boolean };
  decision: typeof assistantRetrievalDecisions.$inferSelect | undefined;
  provenance: Record<AssistantProvenanceSourceCategory, boolean>;
}) {
  const issues: string[] = [];

  if (row.unsupportedClaimFlag && !provenance.knowledge && !provenance.web) {
    issues.push("unsupported_without_source_signal");
  }
  if (row.missingUncertaintyFlag && decision?.freshnessRequired) {
    issues.push("freshness_uncertainty_gap");
  }
  if (row.noBetterThanGenericFlag && !provenance.trip_context && !provenance.chat_context) {
    issues.push("weak_user_context_signal");
  }
  if (!decision) {
    issues.push("retrieval_decision_unavailable");
  }
  if (!Object.values(provenance).some(Boolean)) {
    issues.push("provenance_unavailable");
  }

  return issues;
}

function buildReadiness({
  magicMomentFeedback,
  resultRows,
  scoreRows,
}: {
  magicMomentFeedback: PublicMvpQualityDashboard["feedback"];
  resultRows: Array<{ id: string; promptType: PublicMvpEvaluationPromptType; status: string; noBetterThanGenericFlag: boolean }>;
  scoreRows: Array<{ resultId: string; dimension: PublicMvpEvaluationScoreDimension; score: number }>;
}): PublicMvpQualityDashboard["readiness"] {
  const scoresByResultId = new Map<string, Set<PublicMvpEvaluationScoreDimension>>();

  for (const score of scoreRows) {
    const dimensions = scoresByResultId.get(score.resultId) ?? new Set<PublicMvpEvaluationScoreDimension>();
    dimensions.add(score.dimension);
    scoresByResultId.set(score.resultId, dimensions);
  }

  const completeScoredRows = resultRows.filter((row) => row.status === "scored" && scoreDimensions.every((dimension) => scoresByResultId.get(row.id)?.has(dimension)));
  const magicMomentIds = new Set(completeScoredRows.filter((row) => row.promptType === "magic_moment_family_trip").map((row) => row.id));
  const magicMomentAverage = average(scoreRows.filter((score) => magicMomentIds.has(score.resultId)).map((score) => score.score));
  const checks = [
    {
      key: "usefulness_feedback_sample",
      label: "Tối thiểu 10 phản hồi usefulness cho magic-moment, ít nhất 7 useful",
      passed: magicMomentFeedback.total >= 10 && magicMomentFeedback.useful >= 7,
      current: magicMomentFeedback.useful,
      target: 7,
      missing: Math.max(0, 10 - magicMomentFeedback.total, 7 - magicMomentFeedback.useful),
      message:
        magicMomentFeedback.total >= 10
          ? `${magicMomentFeedback.useful}/${magicMomentFeedback.total} phản hồi magic-moment useful.`
          : `Cần thêm ${Math.max(0, 10 - magicMomentFeedback.total)} phản hồi usefulness cho magic-moment.`,
    },
    {
      key: "magic_moment_scored",
      label: "Magic-moment có kết quả chấm điểm đạt trung bình 7/10",
      passed: magicMomentAverage !== null && magicMomentAverage >= 7,
      current: magicMomentAverage ?? 0,
      target: 7,
      missing: magicMomentAverage === null ? 1 : 0,
      message: magicMomentAverage === null ? "Chưa có kết quả magic-moment được chấm điểm." : `Điểm trung bình magic-moment ${formatNumber(magicMomentAverage)}/10.`,
    },
    {
      key: "generic_comparison_sample",
      label: "Tối thiểu 10 kết quả eval, không quá 2 bị đánh dấu ngang ChatGPT chung",
      passed: completeScoredRows.length >= 10 && completeScoredRows.filter((row) => row.noBetterThanGenericFlag).length <= 2,
      current: completeScoredRows.filter((row) => row.noBetterThanGenericFlag).length,
      target: 2,
      missing: Math.max(0, 10 - completeScoredRows.length),
      message:
        completeScoredRows.length >= 10
          ? `${completeScoredRows.filter((row) => row.noBetterThanGenericFlag).length}/${completeScoredRows.length} kết quả bị gắn cờ generic.`
          : `Cần thêm ${Math.max(0, 10 - completeScoredRows.length)} kết quả eval được chấm điểm đầy đủ.`,
    },
  ];
  const missingSignals = checks.filter((check) => !check.passed).map((check) => check.message);

  return { status: checks.every((check) => check.passed) ? "ready" : "not_ready", checks, missingSignals };
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value);
}
