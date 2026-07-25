import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { expireTripChangeProposal } from "@/features/chat-trips/trip-change-proposals";

// Story 7.5: the scheduled expiry worker for elapsed pending Trip Change
// Proposals. Library code only — no long-running process entrypoint,
// supervisor, or cron registration is added in this story. A future operations
// story may invoke these seams.
//
// The worker mirrors src/features/knowledge/extraction-jobs.ts. No
// lease/fencing token is needed because expireTripChangeProposal is idempotent
// and the `status = 'pending'` predicate + `FOR UPDATE SKIP LOCKED` make
// duplicate workers safe: a row expired by one worker is absent from the
// next poll and re-expiring an already-terminal row is a no-op.

const defaultBatchSize = 50;
const defaultPollIntervalMs = 60_000;

type TripProposalExpiryDb = ReturnType<typeof getDb>;

export type ProcessNextExpiredTripChangeProposalInput = {
  workerId?: string;
  now?: Date;
  db?: TripProposalExpiryDb;
  batchSize?: number;
};

export type ProcessNextExpiredTripChangeProposalResult = {
  processed: number;
};

export async function processNextExpiredTripChangeProposal(
  input: ProcessNextExpiredTripChangeProposalInput = {},
): Promise<ProcessNextExpiredTripChangeProposalResult> {
  const db = input.db ?? getDb();
  const now = input.now ?? new Date();
  const batchSize = input.batchSize ?? defaultBatchSize;

  // Claim a bounded batch of elapsed pending proposals FOR UPDATE SKIP LOCKED
  // so concurrent workers do not collide. The expire command's idempotency
  // makes a missed row safe on the next poll.
  const rows = await db.execute(sql`
    select id, trip_project_id
    from trip_change_proposals
    where status = 'pending'
      and expires_at is not null
      and expires_at <= ${now.toISOString()}::timestamptz
    order by expires_at asc
    for update skip locked
    limit ${batchSize}
  `) as Array<{ id: string; trip_project_id: string }>;

  let processed = 0;
  for (const row of rows) {
    const result = await expireTripChangeProposal({
      tripProjectId: row.trip_project_id,
      proposalId: row.id,
      now,
    });
    if (result.success) {
      processed += 1;
    }
  }

  return { processed };
}

export type RunTripChangeProposalExpiryWorkerLoopInput = {
  once?: boolean;
  workerId?: string;
  pollIntervalMs?: number;
  signal?: AbortSignal;
};

export type RunTripChangeProposalExpiryWorkerLoopResult = {
  status: "processed" | "stopped" | "no_work";
  processed?: number;
};

export async function runTripChangeProposalExpiryWorkerLoop(
  input: RunTripChangeProposalExpiryWorkerLoopInput = {},
): Promise<RunTripChangeProposalExpiryWorkerLoopResult> {
  const pollIntervalMs = input.pollIntervalMs ?? defaultPollIntervalMs;

  while (!input.signal?.aborted) {
    const result = await processNextExpiredTripChangeProposal({ workerId: input.workerId });

    if (input.once) {
      return result.processed > 0
        ? { status: "processed", processed: result.processed }
        : { status: "no_work" };
    }

    if (result.processed === 0) {
      await sleep(pollIntervalMs, input.signal);
    }
  }

  return { status: "stopped" };
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
