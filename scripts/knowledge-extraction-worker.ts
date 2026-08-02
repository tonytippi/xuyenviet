import { runKnowledgeExtractionWorkerLoop } from "../src/features/knowledge/extraction-jobs";
import { getEnvValue } from "./db-env";

type WorkerOptions = {
  once: boolean;
  workerId: string;
};

export function parseKnowledgeExtractionWorkerArguments(argv: string[]): WorkerOptions {
  if (argv.length !== 2 || argv[0] !== "--once" || !argv[1].startsWith("--worker-id=")) throw new Error("Usage: knowledge:extraction-worker --once --worker-id=<safe-id>");
  const workerIdArg = argv[1];
  const workerId = workerIdArg.slice("--worker-id=".length);
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("Worker ID is invalid.");

  return {
    once: true,
    workerId,
  };
}

async function main() {
  loadWorkerEnv();
  const options = parseKnowledgeExtractionWorkerArguments(process.argv.slice(2));
  const controller = new AbortController();
  const stop = () => controller.abort();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const result = await runKnowledgeExtractionWorkerLoop({ once: options.once, workerId: options.workerId, signal: controller.signal });
  console.log("Knowledge extraction worker stopped", result);
  process.exitCode = 0;
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
