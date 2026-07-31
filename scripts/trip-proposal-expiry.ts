import { runTripChangeProposalExpiryWorkerLoop } from "../packages/worker-domain/src/features/chat-trips/trip-proposal-expiry-worker";

export function parseProposalExpiryArguments(argv: string[]) {
  if (argv.length !== 1 || argv[0] !== "--once") throw new Error("Usage: trip-proposal-expiry --once");
  return { once: true } as const;
}

async function main() {
  const result = await runTripChangeProposalExpiryWorkerLoop(parseProposalExpiryArguments(process.argv.slice(2)));
  if (result.status === "error") process.exit(1);
  console.log(JSON.stringify(result));
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(() => { process.exitCode = 1; });
