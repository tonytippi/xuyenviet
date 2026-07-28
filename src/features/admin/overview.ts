import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { knowledgeCards, knowledgeIngestionJobs, knowledgeRecommendations, sources } from "@/db/schema";
import { getActiveEvidenceGroundedSeedCoverage } from "@/features/knowledge/batch-intake";
import { requireAdminSession } from "@/server/auth";

export type AdminOverview = {
  sourcesReadyForProcessing: number;
  processingJobs: number;
  failedProcessingJobs: number;
  draftsAwaitingReview: number;
  openRecommendations: number;
  activeKnowledgeCards: number;
  coverage: Awaited<ReturnType<typeof getActiveEvidenceGroundedSeedCoverage>>;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  await requireAdminSession();
  const db = getDb();

  const [
    [sourcesReadyForProcessing],
    [processingJobs],
    [failedProcessingJobs],
    [draftsAwaitingReview],
    [openRecommendations],
    [activeKnowledgeCards],
    coverage,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(sources).where(eq(sources.eligibility, "eligible")),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeIngestionJobs).where(inArray(knowledgeIngestionJobs.stage, ["queued", "triaging", "extracting", "judging", "relating"])),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeIngestionJobs).where(eq(knowledgeIngestionJobs.stage, "failed")),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeCards).where(and(eq(knowledgeCards.status, "draft"), eq(knowledgeCards.needsReview, true))),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeRecommendations).where(inArray(knowledgeRecommendations.status, ["open", "in_review"])),
    db.select({ count: sql<number>`count(*)::int` }).from(knowledgeCards).where(eq(knowledgeCards.publicationState, "active")),
    getActiveEvidenceGroundedSeedCoverage(),
  ]);

  return {
    sourcesReadyForProcessing: sourcesReadyForProcessing?.count ?? 0,
    processingJobs: processingJobs?.count ?? 0,
    failedProcessingJobs: failedProcessingJobs?.count ?? 0,
    draftsAwaitingReview: draftsAwaitingReview?.count ?? 0,
    openRecommendations: openRecommendations?.count ?? 0,
    activeKnowledgeCards: activeKnowledgeCards?.count ?? 0,
    coverage,
  };
}
