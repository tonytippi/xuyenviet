---
title: 'Log knowledge extraction worker failures'
type: 'bugfix'
created: '2026-07-15'
status: 'done'
review_loop_iteration: 0
baseline_commit: '013ba9015397fd50cc8318d5cd03e4215545b83e'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A database job can record `Extraction failed: invalid_model_output` while the persistent `knowledge:extraction-worker` emits no failure log. Operators therefore cannot correlate a terminal extraction failure with the worker run or determine which safe validation rule rejected the model result.

**Approach:** Report each caught extraction-job failure from the worker loop with structured, safe operational metadata, and retain the existing validation safe-detail in the job's bounded error message so the database diagnosis is actionable.

## Boundaries & Constraints

**Always:** Preserve the existing durable job state, retry policy, Facebook-review transition, and successful extraction behavior. Log only safe metadata: job/source/review IDs, mode, attempt/max-attempt counts, retryability, terminal/requeued outcome, broad error code, and the typed extraction error's safe detail. Keep messages bounded and deterministic. Add focused regression coverage for malformed model output and worker-loop logging.

**Ask First:** Halt if satisfying observability requires a new centralized logger, schema migration, a changed retry policy, displaying diagnostics to non-operators, or retaining raw model/provider content.

**Never:** Log or persist raw source text, prompts, raw model output, provider payloads, stack traces, arbitrary exception messages, credentials, or private operator data. Do not treat `invalid_model_output` as a gateway transport failure and do not change it to retryable.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Malformed model result | Running job throws `KnowledgeExtractionError` with `invalid_model_output` and safe detail | Worker writes one `console.warn` with safe IDs, code, detail, attempt metadata, and `failed` outcome; job remains terminally failed | No source/model/provider body appears in log or durable job error |
| Retryable provider failure | Running job throws retryable `provider_failed` with attempts remaining | Worker writes one safe warning identifying `queued` retry outcome; existing backoff/job state is retained | Do not expose provider message or payload |
| Unexpected worker failure | Running job throws a non-domain error | Worker logs only the existing sanitized code and generic safe message/outcome | Do not emit arbitrary `Error.message` |
| Idle/one-shot worker | No job, or successful job | Existing output/control flow stays unchanged | No failure warning |

</frozen-after-approval>

## Code Map

- `src/features/knowledge/extraction-jobs.ts` -- Claims/processes extraction jobs, classifies errors, persists safe failure state, and runs the persistent worker loop.
- `src/features/knowledge/extraction.ts` -- Defines typed extraction failures and their safe validation details.
- `scripts/knowledge-extraction-worker.ts` -- Script entry point that runs the long-lived loop and reports unexpected process-level failures.
- `tests/knowledge-extraction-worker.test.ts` -- DB-backed coverage for worker claiming, failure state, retry/recovery, and script behavior.
- `docs/facebook-capture-operations.md` -- Existing operator documentation for the Facebook capture to review to extraction workflow; update only if it is the appropriate existing operational reference.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/extraction-jobs.ts` -- Have the long-running loop emit exactly one structured safe warning for each returned failed job, after failure state is handled; distinguish terminal `failed` from retry `queued` without changing existing processing semantics.
- [x] `src/features/knowledge/extraction-jobs.ts` -- Derive bounded safe diagnostics from typed extraction errors and use them both in the warning and existing `lastErrorMessage`; retain generic handling for unknown errors and never copy arbitrary error messages.
- [x] `tests/knowledge-extraction-worker.test.ts` -- Add DB-backed coverage that drives an `invalid_model_output` job through the worker loop, asserts persisted safe diagnostics and one warning, and proves source/model content is absent. Cover retry outcome or extend an existing retry test to assert its safe warning if practical.
- [x] `docs/facebook-capture-operations.md` -- Add concise worker-failure troubleshooting only if the worker’s operational behavior is not already documented in an existing extraction-worker reference; describe safe database/log correlation without implementation detail.

**Acceptance Criteria:**
- Given a running extraction job rejects malformed model output with safe detail `missing_location_or_route`, when the persistent worker processes it, then the job is terminal `failed`, `lastErrorCode` remains `invalid_model_output`, and its safe stored diagnostic identifies `missing_location_or_route` without raw model or source material.
- Given that terminal failure, when the worker loop receives its result, then it emits exactly one `console.warn` containing job identity, source identity, optional Facebook review identity, mode, attempt count, maximum attempts, `invalid_model_output`, `missing_location_or_route`, `retryable: false`, and `outcome: failed`.
- Given a retryable provider failure with remaining attempts, when processed, then the worker emits one safe warning with `retryable: true` and `outcome: queued`, while retaining current backoff and no raw provider details.
- Given no job, a completed job, or a process-level script failure, when the worker runs, then existing idle/success behavior and process-level error logging are unchanged and no duplicate per-job failure warning occurs.
- Given a failure where source raw text or model output contains a distinctive marker, when the warning and job record are inspected, then neither contains that marker.

## Design Notes

Use the job processor as the single failure-reporting boundary. It already receives the typed error and owns the durable state update, so logging there (or a result it returns) avoids parallel action/gateway logs and guarantees both `--once` and long-running modes share the same safe diagnostic contract. `safeDetail` is controlled by extraction validation code; arbitrary `Error.message` is not safe input.

## Verification

**Commands:**
- `pnpm test:run tests/knowledge-extraction-worker.test.ts` -- expected: focused worker observability and existing worker cases pass.
- `pnpm test:run tests/knowledge-draft-extraction.test.ts tests/facebook-capture-extraction-action.test.ts tests/facebook-capture-approve-all-action.test.ts` -- expected: extraction validation and Facebook failure transitions remain unchanged.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm build` -- expected: production build passes.

**Results:**
- `pnpm test:run tests/knowledge-extraction-worker.test.ts` passed: 12 tests.
- `pnpm test:run tests/knowledge-draft-extraction.test.ts` passed: 17 tests.
- `pnpm test:run tests/facebook-capture-extraction-action.test.ts tests/facebook-capture-approve-all-action.test.ts` passed: 21 tests.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Running all three regression files in one Vitest invocation caused pre-existing shared-test-database interference in `knowledge-draft-extraction`; its isolated rerun passed.

## Suggested Review Order

**Worker Failure Flow**

- Emit safe per-job diagnostics only after durable state ownership is confirmed.
  [`extraction-jobs.ts:110`](../../src/features/knowledge/extraction-jobs.ts#L110)

- Preserve typed validation detail while rejecting arbitrary exception content.
  [`extraction-jobs.ts:276`](../../src/features/knowledge/extraction-jobs.ts#L276)

- Surface terminal stale recovery through the same structured warning contract.
  [`extraction-jobs.ts:307`](../../src/features/knowledge/extraction-jobs.ts#L307)

**Regression Coverage**

- Verify malformed, retryable, unexpected, and stale failures remain safe and observable.
  [`knowledge-extraction-worker.test.ts:121`](../../tests/knowledge-extraction-worker.test.ts#L121)

**Operations Guidance**

- Explain database-to-log correlation without exposing source content in logs.
  [`facebook-capture-operations.md:124`](../../docs/facebook-capture-operations.md#L124)
