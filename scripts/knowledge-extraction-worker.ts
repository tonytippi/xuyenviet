import { runKnowledgeExtractionWorkerLoop } from "../src/features/knowledge/extraction-jobs";
import { getEnvValue } from "./db-env";

type WorkerOptions = {
  once: boolean;
  workerId: string;
};

function parseOptions(argv: string[]): WorkerOptions {
  const once = argv.includes("--once");
  const workerIdArg = argv.find((arg) => arg.startsWith("--worker-id="));

  return {
    once,
    workerId: workerIdArg?.slice("--worker-id=".length) || `knowledge-extraction-worker-${process.pid}`,
  };
}

async function main() {
  loadWorkerEnv();
  const options = parseOptions(process.argv.slice(2));
  const controller = new AbortController();
  const stop = () => controller.abort();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const result = await runKnowledgeExtractionWorkerLoop({ once: options.once, workerId: options.workerId, signal: controller.signal });
  console.log("Knowledge extraction worker stopped", result);
}

function loadWorkerEnv() {
  for (const name of ["APP_ENV", "AI_DEBUG_RAW_EXTRACTION_OUTPUT", "DATABASE_URL", "AI_GATEWAY_BASE_URL", "AI_GATEWAY_API_KEY", "AI_GATEWAY_TIMEOUT_MS", "AI_GATEWAY_EXTRACTION_TIMEOUT_MS", "KNOWLEDGE_EXTRACTION_WORKER_POLL_MS", "KNOWLEDGE_EXTRACTION_WORKER_STALE_MS"]) {
    process.env[name] ??= getEnvValue(name);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Knowledge extraction worker failed", error);
    process.exit(1);
  });
}
