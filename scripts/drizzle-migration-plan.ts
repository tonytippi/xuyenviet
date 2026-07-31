import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { SchemaReleaseMatrix } from "@xuyenviet/contracts";

type Journal = { entries: Array<{ tag: string }> };
type SqlConnection = { unsafe(query: string): Promise<Array<{ hash: string }>> };

// Drizzle itself hashes the complete migration file with SHA-256. We compare
// those hashes and journal identifiers only; migration SQL is never parsed.
export async function assertApprovedDrizzlePendingPlan(sql: SqlConnection, migrationPlan: SchemaReleaseMatrix["migrationPlan"]) {
  const pending = await readDrizzlePendingPlan(sql);
  if (migrationPlan.disposition !== "forward_only" || pending.length !== migrationPlan.pending.length
    || pending.some((entry, index) => entry.id !== migrationPlan.pending[index]?.id || entry.digest !== migrationPlan.pending[index]?.digest)) {
    throw new Error("Approved migration plan does not match Drizzle pending migrations.");
  }
}

export async function readDrizzlePendingPlan(sql: SqlConnection): Promise<Array<{ id: string; digest: string }>> {
  const journal = JSON.parse(readFileSync(resolve(process.cwd(), "drizzle/migrations/meta/_journal.json"), "utf8")) as Journal;
  if (!Array.isArray(journal.entries) || !journal.entries.every((entry) => /^[0-9]{4}_[A-Za-z0-9_]+$/.test(entry.tag))) throw new Error("Drizzle migration journal is invalid.");
  let applied = new Set<string>();
  try {
    applied = new Set((await sql.unsafe('select hash from drizzle."__drizzle_migrations"')).map((row) => row.hash));
  } catch {
    // A fresh target has no Drizzle ledger, so all checked-in journal entries
    // are pending and must be explicitly approved by the matrix.
  }
  return journal.entries.map(({ tag }) => {
    const source = readFileSync(resolve(process.cwd(), `drizzle/migrations/${tag}.sql`));
    return { id: tag, digest: createHash("sha256").update(source).digest("hex") };
  }).filter((entry) => !applied.has(entry.digest));
}
