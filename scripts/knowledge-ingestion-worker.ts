import { runKnowledgeIngestionWorkerLoop } from "../src/features/knowledge/ingestion-worker";
import { getEnvValue } from "./db-env";
export function parseKnowledgeIngestionWorkerArguments(argv: string[]) {
  if (argv.length !== 2 || argv[0] !== "--once" || !argv[1].startsWith("--worker-id=")) throw new Error("Usage: knowledge:ingestion-worker --once --worker-id=<safe-id>");
  const workerId = argv[1].slice("--worker-id=".length);
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("Worker ID is invalid.");
  return { once: true as const, workerId };
}

async function main() {
  for (const name of ["DATABASE_URL", "AI_GATEWAY_BASE_URL", "AI_GATEWAY_API_KEY", "AI_GATEWAY_TIMEOUT_MS", "AI_GATEWAY_EXTRACTION_TIMEOUT_MS", "KNOWLEDGE_INGESTION_CLAIM_LEASE_MS", "KNOWLEDGE_INGESTION_WORKER_POLL_MS"]) process.env[name] ??= getEnvValue(name);
  const { once, workerId } = parseKnowledgeIngestionWorkerArguments(process.argv.slice(2));
  const controller = new AbortController();
  const stop = () => controller.abort();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log("Knowledge ingestion worker started", { workerId, once });
  const result = await runKnowledgeIngestionWorkerLoop({ once, workerId, signal: controller.signal });
  console.log("Knowledge ingestion worker stopped", result ? { jobId: "jobId" in result ? result.jobId : undefined, sourceId: "sourceId" in result ? result.sourceId : undefined, outcome: "outcome" in result ? result.outcome : undefined, status: "status" in result ? result.status : undefined } : { status: "no_job" });

  process.exitCode = 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(() => { console.error("Knowledge ingestion worker failed"); process.exit(1); });
