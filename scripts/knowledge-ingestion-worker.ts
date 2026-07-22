import { processNextKnowledgeIngestionJob } from "../src/features/knowledge/ingestion-worker";
import { getEnvValue } from "./db-env";

async function main() {
  for (const name of ["DATABASE_URL", "AI_GATEWAY_BASE_URL", "AI_GATEWAY_API_KEY", "AI_GATEWAY_TIMEOUT_MS", "AI_GATEWAY_EXTRACTION_TIMEOUT_MS", "KNOWLEDGE_INGESTION_CLAIM_LEASE_MS"]) process.env[name] ??= getEnvValue(name);
  const workerId = process.argv.find((arg) => arg.startsWith("--worker-id="))?.slice(12) || `knowledge-ingestion-worker-${process.pid}`;
  const result = await processNextKnowledgeIngestionJob(workerId);
  console.log("Knowledge ingestion worker stopped", result ? { jobId: result.jobId, sourceId: result.sourceId, outcome: result.outcome } : { status: "no_job" });
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(() => { console.error("Knowledge ingestion worker failed"); process.exit(1); });
