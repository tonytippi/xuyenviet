import "server-only";

import { claimNextKnowledgeIngestionJob } from "@/features/knowledge/ingestion-jobs";
import { runKnowledgeIngestionPipeline } from "@/features/knowledge/ingestion-pipeline";

export async function processNextKnowledgeIngestionJob(workerId: string) {
  const claim = await claimNextKnowledgeIngestionJob({ workerId, expectedStageVersion: 1 });
  return claim ? runKnowledgeIngestionPipeline(claim) : null;
}
