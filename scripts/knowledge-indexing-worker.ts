import { runApprovedKnowledgeIndexingWorkerLoop } from "../src/features/knowledge/indexing-worker";
import { getEnvValue } from "./db-env";

type WorkerOptions = {
  once: boolean;
  batchSize?: number;
};

export function parseKnowledgeIndexingWorkerArguments(argv: string[]): WorkerOptions {
  if (argv.length !== 1 || argv[0] !== "--once") throw new Error("Usage: knowledge:indexing-worker --once");

  return {
    once: true,
  };
}

async function main() {
  loadWorkerEnv();
  const options = parseKnowledgeIndexingWorkerArguments(process.argv.slice(2));
  const controller = new AbortController();
  const stop = () => controller.abort();

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const result = await runApprovedKnowledgeIndexingWorkerLoop({
    once: options.once,
    batchSize: options.batchSize,
    signal: controller.signal,
    onObservation: (observation) => {
      if (observation.resultCode === "no_work" && options.once) console.log("Knowledge indexing worker found no work");
      else console.log("Knowledge indexing worker observation", observation);
    },
  });
  console.log("Knowledge indexing worker stopped", result);
  process.exitCode = 0;
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
