import {
  processAiAskDomainOutboxBatch,
  runApprovedKnowledgeIndexingWorkerLoop,
  runKnowledgeExtractionWorkerLoop,
  runKnowledgeIngestionWorkerLoop,
} from "./index";

export function parseWorkerArguments(argv: string[]) {
  if (argv.length !== 3 || !["extraction", "ingestion", "indexing", "outbox"].includes(argv[0]) || argv[1] !== "--once" || !argv[2].startsWith("--worker-id=")) {
    throw new Error("Usage: <extraction|ingestion|indexing|outbox> --once --worker-id=<safe-id>");
  }
  const workerId = argv[2].slice("--worker-id=".length);
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("Worker ID is invalid.");
  return { kind: argv[0] as "extraction" | "ingestion" | "indexing" | "outbox", workerId };
}

export async function runWorkerAdapter(argv: string[]) {
  const { kind, workerId } = parseWorkerArguments(argv);
  if (kind === "extraction") return runKnowledgeExtractionWorkerLoop({ once: true, workerId });
  if (kind === "ingestion") return runKnowledgeIngestionWorkerLoop({ once: true, workerId });
  if (kind === "indexing") return runApprovedKnowledgeIndexingWorkerLoop({ once: true, workerId });
  return processAiAskDomainOutboxBatch({ workerId });
}
