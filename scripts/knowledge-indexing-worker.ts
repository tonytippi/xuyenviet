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

  const result = await runApprovedKnowledgeIndexingWorkerLoop({
    once: options.once,
    batchSize: options.batchSize,
    signal: controller.signal,
    onWorkClaimed: (claims) => console.log("Knowledge indexing worker processing", claims.map((claim) => ({ markerId: claim.markerId, cardId: claim.cardId, contentVersion: claim.contentVersion }))),
    onWorkComplete: (work) => {
      if (work.status === "indexed") console.log("Knowledge indexing worker completed batch", { indexedCount: work.indexedCount, skippedCount: work.skippedCount, cardIds: work.cardIds });
      else if (options.once) console.log("Knowledge indexing worker found no work");
    },
  });
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
