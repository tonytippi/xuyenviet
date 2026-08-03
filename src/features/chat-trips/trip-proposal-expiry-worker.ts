import "server-only";

import { sql } from "drizzle-orm";

import { getDb } from "@/db/client";
import { expireTripChangeProposalInTransaction } from "@xuyenviet/database";

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
//
// P5: the SELECT ... FOR UPDATE SKIP LOCKED and the expire calls run inside
// ONE db.transaction so the row lock is held while expire executes, preventing
// concurrent workers from claiming the same rows. expireTripChangeProposalInTransaction
// shares the worker's transaction (no nested transaction).

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

  // P5: claim and expire in one transaction so the FOR UPDATE SKIP LOCKED lock
  // is held while expireTripChangeProposalInTransaction runs. Concurrent workers
  // skip the locked rows and claim different ones. The expire command's
  // idempotency makes a missed row safe on the next poll.
  return await db.transaction(async (transaction) => {
    const rows = await transaction.execute(sql`
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
      const result = await expireTripChangeProposalInTransaction(transaction, {
        tripProjectId: row.trip_project_id,
        proposalId: row.id,
        now,
      });
      if (result.success) {
        processed += 1;
      }
    }

    return { processed };
  });
}

export type RunTripChangeProposalExpiryWorkerLoopInput = {
  once?: boolean;
  workerId?: string;
  pollIntervalMs?: number;
  signal?: AbortSignal;
};

export type RunTripChangeProposalExpiryWorkerLoopResult = {
  // E7R2-F5: distinguish a transient/persistent DB error from a genuine
  // no-work poll. The prior type conflated both into `no_work`, so a caller
  // could not decide whether to retry, alert, or treat the batch as clean.
  // `error` is returned only when a batch transaction threw; `no_work` is
  // returned only when a batch completed with zero rows processed.
  status: "processed" | "stopped" | "no_work" | "error";
  processed?: number;
};

export async function runTripChangeProposalExpiryWorkerLoop(
  input: RunTripChangeProposalExpiryWorkerLoopInput = {},
): Promise<RunTripChangeProposalExpiryWorkerLoopResult> {
  const pollIntervalMs = input.pollIntervalMs ?? defaultPollIntervalMs;

  while (!input.signal?.aborted) {
    // Q2: a transient DB error (connection blip, deadlock, serialization
    // failure) inside the batch transaction rolls back the whole batch
    // atomically (no partial writes — consistent with expire idempotency) and
    // re-throws out of processNextExpiredTripChangeProposal. Without this
    // catch the loop would die and stay down until externally restarted. Log
    // and keep polling so the next iteration re-claims and retries the same
    // rows. (Per-row catch inside the single P5 transaction is ineffective —
    // once Postgres aborts the transaction every subsequent statement fails
    // until ROLLBACK — so the batch-level catch is the correct seam.)
    let result: ProcessNextExpiredTripChangeProposalResult;
    try {
      result = await processNextExpiredTripChangeProposal({ workerId: input.workerId });
    } catch (error) {
      console.error("Transient error in trip proposal expiry worker batch; will retry on next poll.", {
        workerId: input.workerId,
        error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
      });
      // E7R2-F5: with once: true, surface the error to the caller instead of
      // masquerading as no_work. A caller can now distinguish "nothing to do"
      // (no_work) from "the batch failed and should be retried/alerted" (error).
      if (input.once) {
        return { status: "error" };
      }
      await sleep(pollIntervalMs, input.signal);
      continue;
    }

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

// P14: clear the abort listener when the timeout fires so it does not stay
// on the signal until abort/GC (listener leak).
function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
