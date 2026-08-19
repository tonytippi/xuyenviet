---
title: 'Add Minimal Planning Session Storage'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_revision: '96bf4402dd04b4cef9fafdb1594e1a0beeb6f3d7'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-epic-21/SPEC.md'
  - '_bmad-output/specs/spec-epic-21/story-contracts.md'
  - '_bmad-output/project-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 21 needs one bounded planning-session document per active owned conversation without adding generic planning infrastructure. The clean-break migration is permitted on the configured test target under the approved `DATABASE_URL_TEST` safety policy.

**Approach:** Add only `planning_context_sessions`, its bounded contract, owner-scoped compare-and-set persistence, and focused tests using the existing `DATABASE_URL_TEST` safety validation.

## Boundaries & Constraints

**Always:** Treat Story 21.1 in `story-contracts.md` as exact. Keep the payload to bounded intent, flat scoped slots, missing-slot names, status, source message IDs, and revision. Reuse existing conversation, message, retrieval-decision, Trip, Usage, provenance, feedback, and audit storage. Finalize exactly `drizzle/migrations/0077_clean_break_trip_aware_planning.sql` with only `planning_context_sessions` and preserve serial integration testing.

**Block If:** `DATABASE_URL_TEST` fails the existing safety validation: it must differ from application `DATABASE_URL` and have a test-safe host and database name. Do not reset, migrate, truncate, seed, or implement against an unsafe target; require an expand-migrate-contract design.

**Never:** Add graphs, generic workflow state, model reasoning, provider payloads, a second table, backfill, dual write, runtime fallback, feature flag, new service, queue, cache, Worker kind, migration edits after Story 21.1, or unrelated schema cleanup.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Approved test target | `DATABASE_URL_TEST` differs from application `DATABASE_URL` and passes test-safe host/name validation | Migration, `resetTestDatabase()` truncation, and focused integration tests may proceed | Fail closed if the existing validation fails |
| Unsafe target | `DATABASE_URL_TEST` does not pass the existing URL/name/host safety checks | Stop before migration, reset, truncate, seed, or implementation | Record a blocked result requiring expand-migrate-contract design |
| Stale save | Owned session revision differs from expected revision | CAS rejects the write without overwriting newer state | Return a distinguishable stale outcome |

</intent-contract>

## Code Map

- `tests/helpers/env-file.ts:27-75` -- validates that `DATABASE_URL_TEST` differs from the app URL and has a test-safe host/name; this is the approved test-target gate for this Epic.
- `tests/helpers/db.ts:16-32` -- `resetTestDatabase()` truncates all tables with `RESTART IDENTITY CASCADE` after the approved test-target gate passes.
- `tests/integration-global-setup.ts:5-17` -- migrates `DATABASE_URL_TEST` before integration tests under the approved test-target policy.
- `scripts/db-env.ts:67-77` -- defines additional identity-bound reset evidence for reset workflows; it does not replace or weaken the approved `DATABASE_URL_TEST` gate.
- `scripts/db-reset.ts:73-95` -- existing reset flow fails closed on URL, actual identity, protected database, and runtime-overlap checks; inspect only unless tests prove a guard defect.
- `.env:1-3` and `apps/api/.env.local:24-26` -- application database configuration remains distinct from the configured test database `xuyenviet_test`.
- `packages/contracts/src/index.ts` -- existing fail-closed parser helpers and public contract exports to reuse for the bounded session validator.
- `packages/database/src/schema.ts:1128-1191` -- conversation/message owner and cascade patterns to reuse for a single owner-linked session row once unblocked.
- `packages/database/src/ai-ask-commands.ts:233-273` -- transaction and version-fencing pattern for owned compare-and-set persistence.
- `packages/database/src/index.ts:18-65` -- database module export surface.
- `drizzle/migrations/0076_add_youtube_discovery_immediate_confirmations.sql` -- current final migration before the required `0077` clean-break migration.
- `vitest.config.ts:6-49,89-99` -- unit allowlist and serial integration configuration; new focused unit tests must be listed and integration remains one worker.
- `tests/youtube-discovery-eligibility-migration.test.ts` -- static migration-plan test pattern. `tests/drizzle-migration-plan.test.ts` does not currently exist despite the story task saying UPDATE.

## Tasks & Acceptance

**Execution:**
- `database target guard evidence` -- verify `DATABASE_URL_TEST` remains distinct from application `DATABASE_URL` and passes the existing test-safe host/name validation before destructive test commands -- Story 21.1 blocks if this prerequisite fails.
- `packages/contracts/src/planning-context.ts` and `packages/contracts/src/index.ts` -- define and export only bounded, exact-key planning-session validation -- reject nested graph/workflow/reasoning/provider data.
- `packages/database/src/schema.ts` and `drizzle/migrations/0077_clean_break_trip_aware_planning.sql` -- add only the owner-linked `planning_context_sessions` table with needed cascade, index, and constraints -- finalize Epic 21 schema without unrelated cleanup.
- `packages/database/src/planning-context.ts` and `packages/database/src/index.ts` -- add owner-scoped load and transactional revision-fenced CAS save -- prevent foreign access and stale overwrite.
- `scripts/db-reset.ts` and `scripts/db-seed.ts` -- inspect only; modify solely if focused tests prove the existing disposable guard or seed path fails -- avoid speculative reset changes.
- `tests/planning-context.test.ts`, `tests/planning-context.integration.test.ts`, `tests/drizzle-migration-plan.test.ts`, and `vitest.config.ts` -- cover validation bounds, CAS, owner isolation, cascade, migration 0073, and one-table limit -- maintain the configured unit/integration partition.

**Acceptance Criteria:**
- Given the approved `DATABASE_URL_TEST` target passes its existing safety validation, when migration `0077_clean_break_trip_aware_planning.sql` runs, then only `planning_context_sessions` is added and existing conversation, message, retrieval-decision, Trip, Usage, provenance, feedback, and audit tables are reused without unrelated cleanup.
- Given a planning session is read or written, when its JSON payload is validated, then it contains only bounded intent, flat scoped slots, missing-slot names, status, source message IDs, and revision, and rejects arbitrary graphs, generic workflow state, model reasoning, and provider payloads.
- Given an owned session is saved with an outdated expected revision, when CAS executes, then the write is rejected and the newer persisted session remains unchanged.
- Given `DATABASE_URL_TEST` fails its existing distinct-URL or test-safe host/name validation, when this story is dispatched, then no migration, reset, truncate, seed, integration test, or implementation is run.

## Spec Change Log

## Review Triage Log

## Design Notes

The product owner has approved the existing `DATABASE_URL_TEST` validation as sufficient for this Epic: it must remain distinct from application `DATABASE_URL` and use a test-safe host and database name. That policy authorizes test migrations, `resetTestDatabase()` truncation, and integration tests only; it does not change application or production-target guards.

## Verification

**Commands:**
- `pnpm test:unit -- tests/planning-context.test.ts tests/drizzle-migration-plan.test.ts` -- focused unit tests pass without database access.
- `pnpm test:integration -- tests/planning-context.integration.test.ts` -- after `DATABASE_URL_TEST` passes its existing safety validation, serial integration tests pass against the approved test target.
- `pnpm typecheck` -- expected after implementation: TypeScript passes.

## Auto Run Result

Status: ready-for-dev

### 2026-08-16: Recovery review and verification

Status: done

The permitted recovery reviewed the immediately preceding Story 21.1 work against this contract and repaired three verified validation/storage mismatches: non-plain `slots` values, payloads exceeding the database `8192`-byte limit, and revisions exceeding PostgreSQL `integer` range.

Exact accepted verification command and outcome:

```sh
pnpm test:unit -- tests/planning-context.test.ts tests/drizzle-migration-plan.test.ts
```

Passed: 43 test files, 362 tests. Vitest completed in 3.21 seconds. Existing `operational_telemetry` failure log lines were emitted during test setup, but the command exited successfully.

Accepted Story 21.1 integration evidence: `pnpm vitest run --project integration tests/planning-context.integration.test.ts` passed its two focused tests. This direct Vitest command is accepted evidence for this Story until `test:integration` forwards focused file filters correctly.

Approved test-target policy: The product owner has explicitly approved the existing `DATABASE_URL_TEST` safety validation as sufficient for Epic 21 test migrations, `resetTestDatabase()` truncation, and serial integration tests. The target must remain distinct from application `DATABASE_URL` and pass the existing test-safe host/name checks. This approval does not weaken or change guards for application `DATABASE_URL` or production targets.

## Reconciliation Notes

### 2026-08-16: Product-owner decision reconciled prior block

The previous terminal block is superseded by the explicit product-owner decision above. It is retained here for historical traceability:

> Blocking condition: configured `DATABASE_URL_TEST` target is not explicitly disposable. `tests/helpers/env-file.ts` proves only URL/name/host safety, while `tests/integration-global-setup.ts` migrates the target and `tests/helpers/db.ts` truncates it. Existing identity-bound reset confirmation in `scripts/db-env.ts` and `scripts/db-reset.ts` identifies the application database `xuyenviet`, not `xuyenviet_test`. Stop for an expand-migrate-contract design; do not reset, migrate, truncate, seed, or implement.

### 2026-08-16: Test-script argument-forwarding reconciliation

The following package-script command remains recorded as reconciliation evidence. Its `--` separator prevents the focused file filter from reaching Vitest, so it runs the full serial integration suite instead of only the Story 21.1 test. That suite exceeded the 120-second limit with unrelated existing failures.

```sh
pnpm test:integration -- tests/planning-context.integration.test.ts
```

Under explicit product-owner authorization, the direct focused command below, which passed two tests, is the accepted integration evidence for Story 21.1 until the package script's filter forwarding is repaired. This is a test-script defect only and does not block Story 21.1.

```sh
pnpm vitest run --project integration tests/planning-context.integration.test.ts
```
