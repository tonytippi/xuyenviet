import "server-only";

import { claimNextKnowledgeIngestionJob, recoverKnowledgeIngestionJobs } from "@/features/knowledge/ingestion-jobs";
import { runKnowledgeIngestionPipeline } from "@/features/knowledge/ingestion-pipeline";

export async function processNextKnowledgeIngestionJob(workerId: string) {
  await recoverKnowledgeIngestionJobs();
  const claim = await claimNextKnowledgeIngestionJob({ workerId });
  return claim ? runKnowledgeIngestionPipeline(claim) : null;
}
