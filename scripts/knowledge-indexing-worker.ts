import { runApprovedKnowledgeIndexingWorkerLoop } from "../src/features/knowledge/indexing-worker";
import { getEnvValue } from "./db-env";

type WorkerOptions = {
  once: boolean;
  batchSize?: number;
};

function parseOptions(argv: string[]): WorkerOptions {
  const once = argv.includes("--once");
  const batchSizeArg = argv.find((arg) => arg.startsWith("--batch-size="));
  const batchSize = batchSizeArg ? Number(batchSizeArg.slice("--batch-size=".length)) : undefined;

  return {
    once,
    batchSize: Number.isFinite(batchSize) ? batchSize : undefined,
  };
}

async function main() {
  loadWorkerEnv();
  const options = parseOptions(process.argv.slice(2));
  const controller = new AbortController();
  const stop = () => controller.abort();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const result = await runApprovedKnowledgeIndexingWorkerLoop({ once: options.once, batchSize: options.batchSize, signal: controller.signal });
  console.log("Knowledge indexing worker stopped", result);
}

function loadWorkerEnv() {
  for (const name of ["DATABASE_URL", "KNOWLEDGE_INDEXING_WORKER_POLL_MS", "KNOWLEDGE_INDEXING_WORKER_BATCH_SIZE"]) {
    process.env[name] ??= getEnvValue(name);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Knowledge indexing worker failed", error);
    process.exit(1);
  });
}
