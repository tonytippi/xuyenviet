import "server-only";

import { eq } from "drizzle-orm";

import { knowledgeCardEvidence, knowledgeCardSources, knowledgeCards, sourceCaptureVersions, sources } from "@/db/schema";
import type { PublicMvpEvaluationScenarioDefinition } from "@/features/feedback/evaluation";
import { enqueueKnowledgeIndexWork } from "@/features/knowledge/indexing-queue";
import { processNextApprovedKnowledgeIndexingBatch } from "@/features/knowledge/indexing-worker";
import { hashCaptureText, normalizeCaptureText } from "@/features/knowledge/source-captures";

type FixtureDb = NonNullable<Parameters<typeof processNextApprovedKnowledgeIndexingBatch>[1]>;

export async function prepareEvaluationScenarioFixture(db: FixtureDb, actorUserId: string, scenario: PublicMvpEvaluationScenarioDefinition) {
  if (scenario.id === "web_fallback_unavailable") return { cardIds: [] };

  const cardId = `evaluation-${scenario.id}-${crypto.randomUUID()}`;
  const sourceId = `${cardId}-source`;
  const rawText = normalizeCaptureText(`${scenario.prompt.prompt} Nguồn thử nghiệm an toàn.`);
  const selected = scenario.fixture.selectedKnowledgeStates[0];
  const excluded = scenario.fixture.excludedReasonCodes.length > 0;

  await db.insert(sources).values({
    id: sourceId,
    kind: "url",
    url: `https://evaluation.example/${scenario.id}`,
    canonicalUrl: `https://evaluation.example/${scenario.id}`,
    label: `Evaluation ${scenario.id}`,
    sourceType: "curated",
    verificationStatus: "verified",
    official: true,
    submittedByUserId: actorUserId,
  });
  const [capture] = await db.insert(sourceCaptureVersions).values({
    sourceId,
    versionSequence: 1,
    captureKind: "url",
    rawText,
    contentHash: hashCaptureText(rawText),
    capturedAt: new Date(),
  }).returning({ id: sourceCaptureVersions.id });
  await db.update(sources).set({ currentCaptureVersionId: capture.id }).where(eq(sources.id, sourceId));
  await db.insert(knowledgeCards).values({
    id: cardId,
    status: "approved",
    publicationState: "active",
    knowledgeState: excluded ? "community_observation" : (selected ?? "community_observation") as "community_observation" | "community_pattern" | "conditional",
    reviewState: "reviewed",
    verificationState: selected === "conditional" ? "required" : "not_required",
    conditions: selected === "conditional" ? ["Cần xác minh trước khi khởi hành"] : [],
    type: "route_note",
    title: scenario.prompt.prompt.slice(0, 150),
    routeSegment: "Đường thử nghiệm",
    summary: "Dữ liệu đánh giá chỉ dùng để kiểm tra chính sách truy xuất.",
    confidence: "curated",
    needsReview: false,
    aiPromptVersion: "public_mvp_evaluation_fixture_v1",
    createdByUserId: actorUserId,
  });
  await db.insert(knowledgeCardSources).values({ knowledgeCardId: cardId, sourceId, supportLevel: "primary" });
  await db.insert(knowledgeCardEvidence).values({
    knowledgeCardId: cardId,
    sourceId,
    captureVersionId: capture.id,
    quoteText: rawText,
    spanStart: 0,
    spanEnd: Array.from(rawText).length,
    observedAt: new Date(),
    capturedAt: new Date(),
    supportLevel: "primary",
    displayPolicy: "fact_only",
    independenceKey: `${sourceId}:primary`,
  });

  if (selected === "community_pattern") {
    const supportingSourceId = `${cardId}-supporting`;
    await db.insert(sources).values({ id: supportingSourceId, kind: "url", url: `https://evaluation.example/${scenario.id}/supporting`, canonicalUrl: `https://evaluation.example/${scenario.id}/supporting`, label: `Evaluation ${scenario.id} supporting`, sourceType: "curated", verificationStatus: "verified", official: true, submittedByUserId: actorUserId });
    const [supportingCapture] = await db.insert(sourceCaptureVersions).values({ sourceId: supportingSourceId, versionSequence: 1, captureKind: "url", rawText, contentHash: hashCaptureText(rawText), capturedAt: new Date() }).returning({ id: sourceCaptureVersions.id });
    await db.update(sources).set({ currentCaptureVersionId: supportingCapture.id }).where(eq(sources.id, supportingSourceId));
    await db.insert(knowledgeCardSources).values({ knowledgeCardId: cardId, sourceId: supportingSourceId, supportLevel: "supporting" });
    await db.insert(knowledgeCardEvidence).values({ knowledgeCardId: cardId, sourceId: supportingSourceId, captureVersionId: supportingCapture.id, quoteText: rawText, spanStart: 0, spanEnd: Array.from(rawText).length, observedAt: new Date(), capturedAt: new Date(), supportLevel: "supporting", displayPolicy: "fact_only", independenceKey: `${supportingSourceId}:supporting` });
  }

  await db.transaction((tx) => enqueueKnowledgeIndexWork(tx, { cardId, contentVersion: 1, evidenceSetRevision: 1, reason: "evaluation_fixture" }));
  await processNextApprovedKnowledgeIndexingBatch({ workerId: `evaluation-${scenario.id}` }, db);

  if (scenario.id === "conflict_exclusion") await db.update(knowledgeCards).set({ knowledgeState: "conflicted" }).where(eq(knowledgeCards.id, cardId));
  if (scenario.id === "source_withdrawal") await db.update(sources).set({ eligibility: "withdrawn", removalReason: "withdrawn", removedByUserId: actorUserId, removalCompletedAt: new Date() }).where(eq(sources.id, sourceId));

  return { cardIds: [cardId] };
}

export async function cleanupEvaluationScenarioFixture(db: FixtureDb, cardIds: string[]) {
  if (cardIds.length === 0) return;

  // Evaluation fixtures must never remain eligible for traveler retrieval after a run.
  await db.update(knowledgeCards).set({ publicationState: "suppressed", updatedAt: new Date() }).where(eq(knowledgeCards.id, cardIds[0]!));
}
