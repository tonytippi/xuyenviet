import { retainExpiredFacebookCaptureVersions } from "../src/features/knowledge/source-captures";
import { getEnvValue } from "./db-env";

function option(name: string) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

async function main() {
  process.env.DATABASE_URL ??= getEnvValue("DATABASE_URL");
  const dryRun = process.argv.includes("--dry-run");
  const execute = process.argv.includes("--execute");
  if (dryRun === execute) throw new Error("Use exactly one of --dry-run or --execute.");
  const actorUserId = option("--actor-user-id");
  const actorEmail = option("--actor-email");
  if (!actorUserId || !actorEmail) throw new Error("--actor-user-id and --actor-email are required.");
  const result = await retainExpiredFacebookCaptureVersions({ actorUserId, actorEmail, dryRun });
  console.log("Knowledge source retention completed", result);
}

main().catch((error) => {
  console.error("Knowledge source retention failed", error instanceof Error ? error.message : "unknown");
  process.exit(1);
});
