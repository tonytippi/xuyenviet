---
title: 'Clean Up Worker Poll Abort Listeners'
type: 'bugfix'
created: '2026-07-27'
status: 'in-progress'
review_loop_iteration: 0
baseline_commit: '5c9e3a447a5a11d629c4b7a3d6214ab78e661724'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Long-running idle Knowledge workers add an `abort` listener for each poll sleep but do not remove it when the timer completes. The same process consequently emits `MaxListenersExceededWarning` after eleven idle polls and retains listeners for its lifetime.

**Approach:** Make every affected Knowledge polling sleep settle with listener cleanup on either timer completion or cancellation, and protect the behavior with focused worker-loop regressions.

## Boundaries & Constraints

**Always:** Preserve current polling intervals, cancellation behavior, worker commands, job-claiming/fencing semantics, and safe operational logs. Use the established cleanup pattern from the trip-proposal expiry worker.

**Ask First:** Ask before changing Docker/Compose supervision, introducing a shared sleep utility, changing worker retry behavior, or altering job/database schemas.

**Never:** Do not suppress the warning by raising Node's listener limit. Do not replace `AbortSignal` cancellation, weaken graceful shutdown, alter durable job state, or expose worker payloads/secrets in logs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Idle poll | A long-running worker finds no work and its poll timer expires | The sleep resolves and removes its one `abort` listener before the next poll | No warning or retained listener across repeated idle polls |
| Shutdown during poll | The process receives SIGTERM/SIGINT while a worker is sleeping | The sleep cancels its timer, removes its listener, and loop returns its existing stopped result | No duplicate completion or stranded timer |

</frozen-after-approval>

## Code Map

- `src/features/knowledge/ingestion-worker.ts` -- canonical source-version ingestion poll loop with an affected private `sleep` helper.
- `src/features/knowledge/indexing-worker.ts` -- Knowledge projection poll loop with the compact affected private `sleep` helper.
- `src/features/knowledge/extraction-jobs.ts` -- legacy extraction poll loop with the same affected listener lifecycle.
- `src/features/chat-trips/trip-proposal-expiry-worker.ts` -- existing local reference implementation that removes listeners on both settlement paths.
- `tests/knowledge-ingestion-jobs.test.ts` -- canonical ingestion worker regression coverage.
- `tests/knowledge-indexing-worker.test.ts` -- indexing worker regression coverage.
- `tests/knowledge-extraction-worker.test.ts` -- legacy extraction worker regression coverage.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/ingestion-worker.ts`, `src/features/knowledge/indexing-worker.ts`, `src/features/knowledge/extraction-jobs.ts` -- replace anonymous abort callbacks with cleanup-aware handlers that remove themselves after either timeout or abort -- prevents listener retention for all continuously supervised Knowledge workers.
- [x] `tests/knowledge-ingestion-jobs.test.ts`, `tests/knowledge-indexing-worker.test.ts`, `tests/knowledge-extraction-worker.test.ts` -- add focused idle-poll cancellation tests which verify listeners are removed after a normal poll timeout -- guards the settlement path that caused the warning.

**Acceptance Criteria:**
- Given each Knowledge worker repeatedly finds no due work, when at least one normal poll timeout completes before shutdown, then its `AbortSignal` has no listener retained from that completed sleep.
- Given an affected worker is sleeping, when its abort signal fires, then the timer is cleared, its listener is removed, and the worker preserves its existing graceful-stop behavior.
- Given existing worker execution, retry, and one-shot tests run, when the cleanup patch is applied, then job processing and cancellation behavior remain unchanged.

## Spec Change Log

## Design Notes

The trip-proposal expiry worker already contains the desired two-path settlement pattern: define `onAbort`, clear the timer and remove its listener when aborted, and remove the same listener in the timeout callback. Apply that minimal local pattern independently to the three existing private helpers rather than adding a cross-feature abstraction.

## Verification

**Commands:**
- `pnpm test:run tests/knowledge-ingestion-jobs.test.ts tests/knowledge-extraction-worker.test.ts tests/knowledge-indexing-worker.test.ts` -- expected: all focused worker regressions pass sequentially against `DATABASE_URL_TEST`.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no TypeScript errors.

**Results:**
- `pnpm lint` -- passed with four pre-existing warnings outside this change (`coverage/block-navigation.js` and `tests/knowledge-search.test.ts`).
- `pnpm typecheck` -- passed.
- `pnpm test:run -- tests/knowledge-ingestion-jobs.test.ts tests/knowledge-extraction-worker.test.ts tests/knowledge-indexing-worker.test.ts` -- blocked before test discovery because Vitest global setup's `pnpm exec drizzle-kit migrate` exited with code 1.
- `ENV_FILE=.env.docker docker compose up -d --build knowledge-ingestion`, followed by 65 seconds of idle polling -- passed: container remained running and produced no `MaxListenersExceededWarning` after more than eleven poll intervals.
- Docker Compose operational validation -- passed: `app` is healthy and `/api/health` returns `{"status":"ok"}`; all three workers are running with `restart: unless-stopped` and no recent error logs. Killing the ingestion Node process inside its container caused Compose to restart the container (`restart_count` changed from 0 to 1), after which the worker remained running for another 65 seconds without a listener warning.
- Canonical ingestion health validation -- passed locally: the worker writes `/tmp/knowledge-ingestion-worker.heartbeat` only after a database poll completes. The Compose healthcheck reported `healthy`; manually staling the heartbeat made the probe exit 1; a subsequent poll restored health. A controlled Node-process crash restarted the current image and returned the worker to `healthy`.
