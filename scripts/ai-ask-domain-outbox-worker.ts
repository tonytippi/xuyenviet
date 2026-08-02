import { processAiAskDomainOutboxBatch } from "../src/features/ai/domain-outbox-worker";

export function parseAiAskDomainOutboxWorkerArguments(argv: string[]) {
  if (argv.length !== 2 || argv[0] !== "--once" || !argv[1]?.startsWith("--worker-id=")) throw new Error("Usage: --once --worker-id=<safe-id>");
  const workerId = argv[1].slice("--worker-id=".length);
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("Worker ID is invalid.");
  return workerId;
}

async function main() {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const workerId = parseAiAskDomainOutboxWorkerArguments(process.argv.slice(2));
  // Shutdown can arrive between process startup and bounded batch admission.
  if (!controller.signal.aborted) await processAiAskDomainOutboxBatch({ workerId });
  process.exitCode = 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(() => process.exit(1));
