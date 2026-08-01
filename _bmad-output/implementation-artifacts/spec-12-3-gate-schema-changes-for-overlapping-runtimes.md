---
title: 'Gate schema changes for overlapping runtimes'
type: 'feature'
created: '2026-07-31'
status: 'done'
baseline_revision: 'e4015c0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Schema release execution currently runs Drizzle and records a version without proving the target is disposable or that an approved overlap-safe release plan admits the migration workload. This permits unsafe clean breaks and leaves durable/overlapping deployments without a repository-enforced compatibility gate.

**Approach:** Add a neutral, validated release disposition and matrix contract, require it before the existing migration lock can run Drizzle, and strengthen destructive local reset preflight. Retain `release_schema_versions` as the only persisted schema authority and every runtime's existing shared range admission.

## Boundaries & Constraints

**Always:** Fail closed before a destructive action or version-record mutation; accept a clean break only for explicitly confirmed, local, resolved disposable targets with no runtime overlap; validate durable/overlap releases through an approved expand-migrate-contract matrix; run forward Drizzle under lock before recording one target version; keep rollback traffic/code-only and keep runtime readiness on the shared contracts evaluator. `db:reset` is disposable local/test maintenance and is not an overlapping-runtime release path.

**Block If:** A required release decision cannot be represented safely by the repository contract or requires a durable target mutation, external deployment evidence, a schema down migration, or an unapproved data rewrite.

**Never:** Add a second schema ledger or version comparator, infer approval from environment/URLs/migration filenames, expose targets/credentials/SQL/matrix content in safe CLI or health output, add a continuous worker/dual writer, reset a non-test target during verification, or modify another story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Disposable clean break | Explicit local confirmation, resolved local target, no overlap | Reset/migration preflight may proceed | Never infer confirmation from environment or hostname |
| Durable overlap release | Approved complete matrix and migration range admits current row | Forward migration runs under lock, then records target | Reject before Drizzle/record if validation or pre-admission fails |
| Unsafe request | Missing approval/confirmation, protected/non-local target, overlap, invalid range | No destructive action, Drizzle, or release-record change | Safe actionable error with no sensitive target data |
| Rollback/contract | Persisted expanded schema and old runtime remains declared | Compatible traffic/code can be selected; cleanup remains blocked | No down migration, schema deletion, or dual writer |

</intent-contract>

## Code Map

- `packages/contracts/src/index.ts` -- shared strict schema version grammar and neutral release-matrix validation boundary.
- `scripts/db-env.ts` and `scripts/db-reset.ts` -- local destructive-action target resolution and reset sequencing.
- `scripts/migrate-api-schema-runner.ts` and `scripts/migrate-api-schema.ts` -- migration lock, preflight, forward Drizzle, and sole release-record write.
- `tests/schema-compatibility.test.ts` and release-gate tests -- contract, preflight, ordering, and no-mutation regressions.
- `docs/runbooks/` -- reviewable operator matrix format and non-destructive release procedure.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/index.ts` -- add disposition/matrix types, strict parser and admission helpers using the existing tuple parser/comparator -- makes a validated shared policy seam available to all workloads.
- [x] `scripts/db-env.ts`, `scripts/db-reset.ts` -- require explicit local disposable/no-overlap confirmation and resolved identity before destructive reset/seed sequencing -- blocks unsafe clean breaks before mutation.
- [x] `scripts/migrate-api-schema-runner.ts`, `scripts/migrate-api-schema.ts` -- validate selected disposition/matrix and migration pre-admission under advisory lock before forward Drizzle; record only after success and emit safe failures -- enforces durable/overlap release order.
- [x] `docs/runbooks/schema-release-matrix.md` and `docs/release-matrices/` -- document the versioned, reviewable machine-validatable matrix/runbook format -- provides explicit operator evidence without a second persisted ledger.
- [x] `tests/schema-compatibility.test.ts` and focused release-gate tests -- cover rejected preflight/matrix paths, migration ordering, phase/rollback/contract constraints, and no mutation -- proves fail-closed behavior while retaining existing workload admission coverage.

**Acceptance Criteria:**
- Given data is disposable and no runtime overlap exists, when a clean-break migration is proposed, then its explicit disposable-target precondition is verified before execution and durable/protected/unconfirmed targets fail closed.
- Given durable data or overlapping runtimes, when a schema release is selected, then an approved complete expand-migrate-contract matrix and migration-job gate admit only compatible workloads in order, and rollback routes traffic or compatible code without destructive schema rollback.

## Spec Change Log

## Review Triage Log

### 2026-07-31 - Review passes
- intent_gap: 0
- bad_spec: 0
- patch: multiple high safety repairs applied across synchronous Blind Hunter and Edge Case Hunter passes
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Enforced exact target identity, release lock sequencing, approved matrix artifacts, runtime phase admission, migration-plan validation, direct seed gating, owner inventory, and AD-32 single-writer constraints.
   - `[high] [patch]` Left the successful `DATABASE_URL_TEST` migration CLI proof blocked because it needs an explicitly approved checked-in test-target matrix; no dynamic approval artifact was created.

### 2026-07-31 - Final blocking review
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none; high safety repairs require coordinated changes to reset locking and every runtime admission boundary.

## Design Notes

The matrix is repository release input, not deployed state. It must contain all five workload declarations and phase-specific declarations, so migration pre-admission and later workload admission share the existing strict numeric evaluator. The persisted `release_schema_versions` row remains the only deployed-schema authority.

## Verification

**Commands:**
- `DATABASE_URL_TEST=... pnpm vitest run tests/schema-compatibility.test.ts tests/schema-release-gate.test.ts tests/web-schema-compatibility.test.ts tests/worker-runtime.test.ts tests/worker-adapter-boundary.test.ts tests/api-platform-contract.test.ts --maxWorkers=1 --no-file-parallelism` -- expected: serial suites pass with only the isolated test target.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm build` -- expected: production build passes.
- `docker compose config` -- expected: compose configuration validates.
- `git diff --check` -- expected: no whitespace errors.

## Auto Run Result

Status: done

The approved isolated matrix binds the dedicated `DATABASE_URL_TEST` target and the 22 reviewed pending migration digests. A fresh isolated database successfully completed serial `pnpm db:migrate` and recorded exactly one `20260729.1` version. Final recovery restored target-scoped migration-lock interoperability, made API/web/Worker schema and identity admission atomic, and retained deterministic compiled Worker drain coverage. The product owner confirmed that `db:reset` remains disposable local/test maintenance, outside the overlapping-runtime release protocol; no cross-recreation runtime-admission fence is required by this story. Synchronous review repairs are complete; no non-test reset, migration, seed, or deployment was performed.
