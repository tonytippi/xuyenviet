import { runKnowledgeIngestionWorkerLoop } from "../src/features/knowledge/ingestion-worker";
import { getEnvValue } from "./db-env";

async function main() {
  for (const name of ["DATABASE_URL", "AI_GATEWAY_BASE_URL", "AI_GATEWAY_API_KEY", "AI_GATEWAY_TIMEOUT_MS", "AI_GATEWAY_EXTRACTION_TIMEOUT_MS", "KNOWLEDGE_INGESTION_CLAIM_LEASE_MS", "KNOWLEDGE_INGESTION_WORKER_POLL_MS"]) process.env[name] ??= getEnvValue(name);
  const once = process.argv.includes("--once");
  const workerId = process.argv.find((arg) => arg.startsWith("--worker-id="))?.slice(12) || `knowledge-ingestion-worker-${process.pid}`;
  const controller = new AbortController();
  const stop = () => controller.abort();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log("Knowledge ingestion worker started", { workerId, once });
  const result = await runKnowledgeIngestionWorkerLoop({ once, workerId, signal: controller.signal });
  console.log("Knowledge ingestion worker stopped", result ? { jobId: "jobId" in result ? result.jobId : undefined, sourceId: "sourceId" in result ? result.sourceId : undefined, outcome: "outcome" in result ? result.outcome : undefined, status: "status" in result ? result.status : undefined } : { status: "no_job" });

  // The database client intentionally stays open for the supervised worker; one-shot runs must exit.
  if (once) process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(() => { console.error("Knowledge ingestion worker failed"); process.exit(1); });
