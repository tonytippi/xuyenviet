import { backfillHistoricalAssistantProvenanceWithdrawal } from "../packages/database/src/assistant-provenance-withdrawal";
import { getEnvValue } from "./db-env";

type CommandOptions = {
  batchSize?: number;
  retryFailed: boolean;
};

type Backfill = typeof backfillHistoricalAssistantProvenanceWithdrawal;

export function parseAssistantProvenanceWithdrawalBackfillArgs(argv: string[]): CommandOptions {
  if (!argv.includes("--execute")) throw new Error("This maintenance command requires --execute.");
  const unknown = argv.filter((arg) => arg !== "--execute" && arg !== "--retry-failed" && !arg.startsWith("--batch-size="));
  if (unknown.length) throw new Error("Unknown maintenance command option.");
  const batchSizeArg = argv.find((arg) => arg.startsWith("--batch-size="));
  const batchSize = batchSizeArg ? Number(batchSizeArg.slice("--batch-size=".length)) : undefined;
  if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500)) throw new Error("--batch-size must be an integer from 1 through 500.");
  return { batchSize, retryFailed: argv.includes("--retry-failed") };
}

export async function runAssistantProvenanceWithdrawalBackfill(options: CommandOptions, backfill: Backfill = backfillHistoricalAssistantProvenanceWithdrawal) {
  let batchCount = 0;
  let scannedCount = 0;
  let retryFailed = options.retryFailed;
  while (true) {
    const result = await backfill({ batchSize: options.batchSize, retryFailed });
    batchCount += 1;
    retryFailed = false;
    if (result.status === "progressed") {
      scannedCount += result.scannedCount;
      continue;
    }
    if (result.status === "completed") return { status: "completed" as const, batchCount, scannedCount };
    return { status: "failed" as const, batchCount, scannedCount, failureCode: result.failureCode };
  }
}

async function main() {
  process.env.DATABASE_URL ??= getEnvValue("DATABASE_URL");
  const result = await runAssistantProvenanceWithdrawalBackfill(parseAssistantProvenanceWithdrawalBackfillArgs(process.argv.slice(2)));
  console.log("Assistant provenance withdrawal backfill finished", result);
  if (result.status === "failed") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(() => {
    console.error("Assistant provenance withdrawal backfill failed");
    process.exit(1);
  });
}
