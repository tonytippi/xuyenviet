import { stat } from "node:fs/promises";

const heartbeatPath = process.env.KNOWLEDGE_INGESTION_HEARTBEAT_PATH ?? "/tmp/knowledge-ingestion-worker.heartbeat";
// A single ingestion job can make multiple AI calls, each using the configured extraction timeout.
const maxAgeMs = Number(process.env.KNOWLEDGE_INGESTION_HEARTBEAT_MAX_AGE_MS ?? 15 * 60_000);

async function main() {
  const heartbeat = await stat(heartbeatPath);
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 1 || Date.now() - heartbeat.mtimeMs > maxAgeMs) process.exit(1);
}

main().catch(() => process.exit(1));
