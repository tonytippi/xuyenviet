---
title: 'Separate unit and integration test execution'
type: 'refactor'
created: '2026-07-29'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'b3f50b5a180b909caafd88456d3a643cfa355ba8'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every Vitest invocation migrates a PostgreSQL database and truncates it before every test, including pure unit tests. The full suite runs serially and cannot complete within 20 minutes in the measured environment.

**Approach:** Separate the existing suite into parallel-safe unit tests and serial integration tests. Database setup, migration, and reset behavior will apply only to integration tests; existing database test isolation must be preserved.

## Boundaries & Constraints

**Always:** Preserve the test database safety checks, migration before integration tests, fail-closed network mocking, and serial integration execution. Keep existing test semantics and make fast unit-test execution available through explicit pnpm scripts.

**Ask First:** Enabling parallel execution for database integration tests, changing the test database topology, or weakening database isolation.

**Never:** Run migrations, connect to PostgreSQL, or require `DATABASE_URL_TEST` for unit tests. Do not remove integration-test resets without replacing their isolation guarantee.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unit run | `pnpm test:unit` with no database environment | Only the known pure tests run without migration or database connection | Unit failures retain normal Vitest reporting |
| Integration run | `pnpm test:integration` with valid separate test DB | Migrations run once; tests run serially against the test DB | Existing URL validation and migration failures stop the run |
| DB isolation | Integration test seeds fixed data | Database is reset before that test | Existing test behavior remains deterministic |

</frozen-after-approval>

## Code Map

- `vitest.config.ts` -- current global test configuration serializes every test and attaches database setup globally.
- `tests/setup.ts` -- shared environment/mocking setup currently imports the database helper and resets before every test.
- `tests/global-setup.ts` -- runs Drizzle migration for every Vitest invocation.
- `tests/helpers/db.ts` -- owns test database client, truncation reset, and shutdown.
- `tests/*.test.ts` -- 14 pure unit files and 43 live-Postgres integration files require distinct setup behavior.
- `package.json` -- quality command entrypoints.
- `tsconfig.json` -- incremental typecheck configuration.

## Tasks & Acceptance

**Execution:**
- [x] `vitest.config.ts` -- define separate unit and integration projects, with database hooks only on the serial integration project.
- [x] `tests/unit-setup.ts` -- provide environment and fail-closed shared mocks without reading database configuration or creating a database client.
- [x] `tests/integration-setup.ts` and `tests/integration-global-setup.ts` -- retain validated test-DB routing, shared mocks, migration, and database client shutdown, excluding unconditional global resets.
- [x] `tests/*.test.ts` -- add explicit reset hooks only to integration files that previously depended on the global reset; preserve existing direct reset behavior and special concurrency handling.
- [x] `package.json` -- add targeted unit and integration scripts while retaining the complete-suite command.
- [x] `tsconfig.json` -- persist the incremental build-info file under a stable ignored cache path for predictable local reuse.

## Spec Change Log

- Review finding: the new targeted scripts started Vitest in watch mode. Updated both scripts to use `vitest run --project ...`, preventing CI from waiting indefinitely while preserving project selection.

**Acceptance Criteria:**
- Given no `DATABASE_URL` or `DATABASE_URL_TEST`, when `pnpm test:unit` runs, then all unit tests execute without invoking Drizzle or PostgreSQL.
- Given valid test database configuration, when `pnpm test:integration` runs, then it migrates once and executes with one worker.
- Given an integration test that relies on clean tables, when it runs, then its database state is reset before test setup as it was under the former global hook.
- Given a repeated `pnpm typecheck`, when the source configuration has not changed, then TypeScript reuses its persistent incremental build information.

## Design Notes

The first optimization deliberately does not parallelize database tests. They share one physical database and currently use global-table `TRUNCATE`; parallel workers would erase each other's state. Isolation by worker-specific schemas or databases is a later, independently testable change.

The unit/integration classification uses explicit existing filenames rather than a broad naming convention, avoiding a disruptive rename of 57 test files.

## Verification

**Commands:**
- `pnpm test:unit --run` -- expected: all 14 pure unit test files pass without database configuration.
- `pnpm test:integration --run tests/web-search-adapter.test.ts` -- expected: migration runs and representative database test passes with reset isolation.
- `pnpm typecheck` -- expected: no TypeScript errors.
- `pnpm lint` -- expected: no lint errors in changed TypeScript configuration/setup files.

## Suggested Review Order

**Project Routing**

- Separate infrastructure-free tests from serial shared-database tests.
  [`vitest.config.ts:7`](../../../vitest.config.ts#L7)

- Expose terminating CI-friendly commands for each feedback loop.
  [`package.json:9`](../../../package.json#L9)

**Shared Setup**

- Keep unit environment mocks independent of database URL configuration.
  [`unit-setup.ts:1`](../../../tests/unit-setup.ts#L1)

- Restrict test-DB routing and client shutdown to integration execution.
  [`integration-setup.ts:1`](../../../tests/integration-setup.ts#L1)

- Retain migrations once per integration invocation only.
  [`integration-global-setup.ts:1`](../../../tests/integration-global-setup.ts#L1)

**Isolation Preservation**

- Make reset dependency explicit for a representative database test file.
  [`web-search-adapter.test.ts:6`](../../../tests/web-search-adapter.test.ts#L6)

- Preserve special concurrent database test isolation before opening lock activity.
  [`trip-planning-safety.test.ts:19`](../../../tests/trip-planning-safety.test.ts#L19)

**Typecheck Reuse**

- Store incremental build data in a stable ignored cache directory.
  [`tsconfig.json:15`](../../../tsconfig.json#L15)
