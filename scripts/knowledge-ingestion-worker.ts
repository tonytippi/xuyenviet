import { runKnowledgeIngestionWorkerLoop } from "../src/features/knowledge/ingestion-worker";
import { getEnvValue } from "./db-env";
import { writeFile } from "node:fs/promises";

const heartbeatPath = process.env.KNOWLEDGE_INGESTION_HEARTBEAT_PATH ?? "/tmp/knowledge-ingestion-worker.heartbeat";

async function main() {
  for (const name of ["DATABASE_URL", "AI_GATEWAY_BASE_URL", "AI_GATEWAY_API_KEY", "AI_GATEWAY_TIMEOUT_MS", "AI_GATEWAY_EXTRACTION_TIMEOUT_MS", "KNOWLEDGE_INGESTION_CLAIM_LEASE_MS", "KNOWLEDGE_INGESTION_WORKER_POLL_MS"]) process.env[name] ??= getEnvValue(name);
  const once = process.argv.includes("--once");
  const workerId = process.argv.find((arg) => arg.startsWith("--worker-id="))?.slice(12) || `knowledge-ingestion-worker-${process.pid}`;
  const controller = new AbortController();
  const stop = () => controller.abort();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log("Knowledge ingestion worker started", { workerId, once });
  const result = await runKnowledgeIngestionWorkerLoop({
    once,
    workerId,
    signal: controller.signal,
    onPollComplete: () => writeFile(heartbeatPath, String(Date.now())),
    onWorkClaimed: (work) => console.log("Knowledge ingestion worker processing", work),
    onWorkComplete: (work) => {
      if (work && "jobId" in work) console.log("Knowledge ingestion worker completed", { jobId: work.jobId, sourceId: work.sourceId, outcome: work.outcome, cardId: work.cardId });
      else if (work) console.log("Knowledge ingestion worker candidate stage committed", { jobId: work.ingestionJobId });
      else if (once) console.log("Knowledge ingestion worker found no work");
    },
  });
  console.log("Knowledge ingestion worker stopped", result ? { jobId: "jobId" in result ? result.jobId : undefined, sourceId: "sourceId" in result ? result.sourceId : undefined, outcome: "outcome" in result ? result.outcome : undefined, status: "status" in result ? result.status : undefined } : { status: "no_job" });

  // The database client intentionally stays open for the supervised worker; one-shot runs must exit.
  if (once) process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(() => { console.error("Knowledge ingestion worker failed"); process.exit(1); });
