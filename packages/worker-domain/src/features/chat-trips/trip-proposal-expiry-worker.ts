import { sql } from "drizzle-orm";

import { getDb } from "@xuyenviet/database";
import { expireTripChangeProposalInTransaction } from "./trip-change-proposals";

const defaultBatchSize = 50;

export async function runTripChangeProposalExpiryWorkerLoop(input: { once?: boolean } = {}) {
  // The CLI requires an explicit once mode; this bounded implementation never polls.
  if (!input.once) return { status: "error" as const };
  try {
    const processed = await getDb().transaction(async (transaction) => {
      const rows = await transaction.execute(sql`
        select id, trip_project_id
        from trip_change_proposals
        where status = 'pending' and expires_at is not null and expires_at <= now()
        order by expires_at asc
        for update skip locked
        limit ${defaultBatchSize}
      `) as Array<{ id: string; trip_project_id: string }>;
      let count = 0;
      for (const row of rows) {
        if ((await expireTripChangeProposalInTransaction(transaction, { tripProjectId: row.trip_project_id, proposalId: row.id })).success) count += 1;
      }
      return count;
    });
    return processed > 0 ? { status: "processed" as const, processed } : { status: "no_work" as const };
  } catch {
    return { status: "error" as const };
  }
}
