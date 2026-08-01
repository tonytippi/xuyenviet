# Story 12.3: Gate Schema Changes for Overlapping Runtimes

Status: done

## Story

As a release operator,
I want schema changes to be compatible with deployed workload versions,
so that rollout or rollback never destroys durable product data.

## Acceptance Criteria

1. **Given** data is disposable and no runtime overlap exists, **when** a clean-break migration is proposed, **then** its disposable-target precondition is verified before execution, **and** a durable or protected target fails closed.
2. **Given** staging/public data is durable or runtimes overlap, **when** a schema change is released, **then** an approved expand-migrate-contract compatibility matrix and migration-job gate exist before dependent workloads receive traffic, **and** rollback changes traffic or compatible code without destructive schema rollback.

## Tasks / Subtasks

- [ ] Establish an explicit schema-change disposition before any destructive action (AC: 1, 2)
  - [ ] Add one release-planning/preflight boundary that classifies every proposed schema change as either `clean_break_disposable` or `expand_migrate_contract`. It must fail closed if target durability, protection, runtime overlap, target identity, or approval evidence is missing or ambiguous.
  - [ ] For the clean-break path, reuse and strengthen the existing local-target guards in `scripts/db-env.ts`; require `APP_ENV=local`, a local PostgreSQL host, a non-protected database name, credential-free resolved target identity, and an explicit affirmative disposable/reset-only confirmation before `db:reset`, migration replacement, schema deletion, truncation, or seed action.
  - [ ] Do not treat `DATABASE_URL_TEST`, a local hostname, a prior Story 8 authorization, or an environment variable alone as evidence that the actual release target is disposable. A durable, customer-facing, operational, non-local, protected, unconfirmed, or overlapping target must reject the clean-break path before any mutation.
  - [ ] Keep Drizzle migrations forward-only and `release_schema_versions` as the sole deployed-schema authority. Do not add a second schema registry, infer release state from filenames/journal metadata, or silently rewrite already-applied migration history for a durable target.

- [ ] Define an approved expand-migrate-contract release matrix for durable or overlapping runtimes (AC: 2)
  - [ ] Add a versioned, reviewable release-matrix artifact format and validation seam owned by the repository. Each matrix must identify the release/change ID, target environment/identity class, approval, affected persistent objects and data interpretation, expand/migrate/contract phases, exact current/target recorded schema versions, and the compatible schema range for `web`, `api`, `worker`, `admin`, and `migration` workloads.
  - [ ] Require each matrix to identify old/new workload versions that may overlap, compatible rollout order, migration job version/lock, workload admission expectations, traffic owner/routing switch where relevant, verification evidence, rollback route, and the explicit contract-removal precondition that every old reader/writer is retired. Do not permit removal, rename, narrowing constraint, destructive reinterpretation, or destructive cleanup while any declared compatible runtime can still require the old representation.
  - [ ] Preserve the existing neutral `SchemaCompatibilityDeclaration`, numeric `YYYYMMDD.N` parser/comparator, inclusive range evaluator, and `release_schema_versions` cardinality rule from Story 12.2. Extend declarations/ranges for a release only through the shared `@xuyenviet/contracts` boundary; do not duplicate version comparison in API, web, Worker, migration, or future admin code.
  - [ ] Require explicit approval and an operator-run plan/runbook for any durable-data reinterpretation or backfill. The matrix must state idempotency, batching/resumption, validation, failure handling, and non-destructive recovery; this story must not perform an unapproved data rewrite merely to prove the gate.

- [ ] Gate migration execution and workload admission in release order (AC: 2)
  - [ ] Extend the existing `runApiSchemaMigration` / `scripts/migrate-api-schema.ts` release-lock flow or replace it with a workload-neutral equivalent that validates the selected disposition and required matrix before Drizzle runs. Preserve advisory lock `918_040_004`, run Drizzle before recording the deployed version, and leave the prior release record intact if preflight or Drizzle fails.
  - [ ] For an expand/migrate release, allow the one-shot migration workload only after its own declaration and approved matrix admit the pre-migration schema. Record the target version only after every forward migration succeeds under the release lock; do not make a dependent workload ready or eligible for traffic/work before its declared range admits the persisted target version.
  - [ ] Preserve Story 12.2 admission behavior: incompatible API/web/admin request boundaries remain out of traffic, and an incompatible Worker remains non-ready and never starts an adapter or claims a job. A failed later probe triggers existing drain/no-new-admission behavior, not an in-memory acknowledgement or generic lease release.
  - [ ] Make the migration command fail with a safe actionable operator result and nonzero status without leaking URLs, credentials, SQL, raw migration content, or protected target details. Keep public health responses limited to their established safe shapes; they must not disclose matrix contents, version values, approval data, or target identity.

- [ ] Preserve non-destructive rollback and single-writer cutover behavior (AC: 2)
  - [ ] Define and validate rollback per matrix: route traffic to a previously compatible workload version or compatible code only after confirming its declared range admits the still-persisted schema. Never run a destructive down migration, drop an expanded field/table, erase durable data, or reintroduce an obsolete writer as rollback.
  - [ ] Require rollback to preserve AD-32 single-writer routing: select the legacy or replacement transport before request admission, never dual-write messages, assistant answers, provenance, usage, trip state, knowledge state, or another aggregate, and keep any shadow comparison read-only.
  - [ ] Contract cleanup must be a separate approved release after evidence proves no active/deployable old runtime, migration, worker, or capability owner needs the old representation. A failed contract precondition leaves the expanded schema intact and blocks cleanup.
  - [ ] Do not claim Railway deployment, public launch, backup/restore, deployed private routing/probes, monitoring/on-call, or final legacy-owner retirement. Epic 14 owns deployed/public-launch evidence; Story 13.1 wires the separate admin runtime.

- [ ] Prove fail-closed release gating and rollback behavior (AC: 1, 2)
  - [ ] Add unit coverage for classification/preflight failures: missing confirmation, `APP_ENV` other than local, non-local host, protected database, unconfirmed/durable/operational target, detected overlap, missing/invalid approval, and attempts to choose clean break for an overlap. Assert no reset, migration, deletion, or release-version mutation occurs on every rejected path.
  - [ ] Add matrix validation coverage for malformed versions/ranges, inverted ranges, unknown workloads, missing workload entries, incompatible old/new overlap, missing expand/migrate/contract phases, unsafe contract cleanup, missing rollback route, and durable reinterpretation without approved resumable plan. Reuse the Story 12.2 tuple grammar tests rather than duplicating a comparator.
  - [ ] Add PostgreSQL-backed serial tests using `DATABASE_URL_TEST` only for release-lock sequencing: failed preflight/Drizzle preserves the prior `release_schema_versions` record; a successful forward migration records exactly one target version after completion; compatible workloads admit only in their declared phase; incompatible web/API/admin remain unavailable and Worker begins no claim; and a later incompatibility uses existing Worker draining behavior.
  - [ ] Add rollback and cutover regressions proving traffic/code rollback can select a compatible prior workload while the expanded schema remains intact, destructive down/schema-cleanup paths are unavailable, and no dual writer is admitted. Include a contract-phase test proving removal stays blocked until every declared old workload is retired.
  - [ ] Keep database-reset tests isolated and serial. Resolve the dedicated test URL through the established helper and pass it explicitly to child processes; never run `pnpm db:reset` against an authoritative development/staging/production target as test verification.
  - [ ] Run the focused release-gate/matrix/migration tests serially with `DATABASE_URL_TEST`, retained `tests/schema-compatibility.test.ts`, `tests/web-schema-compatibility.test.ts`, Worker runtime/adapter tests, relevant API readiness tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `docker compose config`, and `git diff --check`. Record exact commands, results, and environmental blockers in the Dev Agent Record.

## Dev Notes

### Review Findings

- [x] [Review][Patch] Prove bundled runtimes validate an approved release artifact [tests/bundled-runtime-startup.test.ts:28] — The detached deployment regression materializes an approved digest-bound fixture, proves API/web/Worker readiness at the overlap version, and proves missing or valid-but-digest-tampered artifacts remain non-ready.

### Scope and Outcome

- This story supplies the release-policy and repository-level enforcement missing after Stories 12.1 and 12.2: clean-break admission only for confirmed disposable, non-overlapping targets; otherwise an approved expand-migrate-contract compatibility matrix and migration-job gate.
- It is not permission to reset a database, mutate a durable target, run a staging/production deployment, execute a destructive schema rollback, or claim external release evidence. If implementation cannot prove the target disposition or matrix approval from the selected release inputs, it must stop before mutation.
- The implementation must preserve the already completed local/repository schema admission contract. Story 12.3 governs release sequencing around it; it must not weaken API/web/Worker fail-closed readiness, Worker no-claim admission, telemetry, health safety, or durable feature protocols.

### Existing Implementation to Extend

| Surface | Current behavior to preserve | Story 12.3 direction |
| --- | --- | --- |
| `packages/contracts/src/index.ts` | Defines shared workload declarations, strict numeric `YYYYMMDD.N` parsing/comparison, and one-row fail-closed admission. | Add only neutral release-matrix/disposition contracts and validation required by all runtimes; keep this package free of Next/Auth.js/Worker application imports. |
| `packages/database/src/index.ts` | Reads the sole `release_schema_versions` authority and records one version under the migration advisory lock. | Preserve single-authority/cardinality semantics; add no parallel registry or inferred migration state. |
| `scripts/migrate-api-schema-runner.ts` | Acquires/releases lock, runs Drizzle, then records version. | Gate execution before Drizzle; preserve forward-only success ordering and prior record on failure. |
| `scripts/migrate-api-schema.ts` | Invokes Drizzle under lock and exits nonzero on failure. | Consume the approved release disposition/matrix safely and surface safe operator failures only. |
| `scripts/db-env.ts` / `scripts/db-reset.ts` | Restrict reset to local hosts and non-protected database names. | Make affirmative disposable-target preflight explicit before destructive clean-break actions; never broaden reset eligibility. |
| `apps/api/src/release-schema.ts` / `src/server/web-schema-admission.ts` | API and web readiness use shared declarations and fail closed. | Continue to consume the shared range contract; do not introduce per-runtime release policy copies. |
| `apps/worker/src/runtime.ts` | Requires schema compatibility before readiness/adapters and drains on later incompatibility. | Preserve no-adapter/no-claim behavior; release gating must feed the same admission result rather than bypass it. |
| `tests/schema-compatibility.test.ts` / `tests/web-schema-compatibility.test.ts` | Cover strict version grammar, one-row cardinality, migration recording order, and web admission. | Extend with matrix, migration gate, and rollback sequencing regressions while retaining current assertions. |

### Required Release Semantics

1. **Classify first.** A release is clean-break only if its exact target is affirmatively disposable and no old/new runtime can overlap. Any uncertainty selects neither path and blocks execution.
2. **Expand before migrate.** For durable/overlap releases, first deploy code whose declared range understands both old and expanded schema representations. Preserve old readers/writers until the matrix says the contract preconditions are met.
3. **Migrate once under lock.** The one-shot migration workload validates its pre-migration declaration/matrix, holds the established advisory lock, runs forward Drizzle migrations, then records the one authoritative target release version.
4. **Admit only compatible workloads.** API/web/admin receive traffic and Worker claims work only after their declared range admits the recorded version. An incompatibility is non-ready/no-claim, never a permissive fallback.
5. **Contract later.** Remove old schema/data interpretation only in a later approved release after all old runtime/capability owners are retired. A rollback changes routing or selects compatible code; persisted schema remains forward.

### Architecture Compliance and Guardrails

- Follow AD-3: PostgreSQL is the product/job data plane and Drizzle owns reviewed schema/migrations. Do not introduce a migration framework, second release-state table, manual schema flag, or environment-only source of truth.
- Follow AD-15, AD-33, NFR-12, NFR-13, and NFR-16: independently deployed workloads have distinct health/admission boundaries, migration succeeds before dependent traffic/work, schema overlap is matrix-governed, and rollback is traffic/code only.
- Follow AD-32 and FR-58: a capability has exactly one request/command writer. Release gates must not create legacy/API fallback after admission, dual writes, or a second Worker owner.
- Follow AD-1 and the Story 12.1 extraction boundary: Worker/API shared release code may depend only on extracted workspace packages. It must not import root `src`, `next/*`, `next-auth`, `server-only`, `src/app`, or a module marked `"use server"`.
- Preserve feature-owned PostgreSQL concurrency: extraction uses lock owner/timestamp and stale recovery; ingestion/indexing/outbox use `FOR UPDATE SKIP LOCKED`, leases/fencing/CAS; proposal expiry uses transactional locking/idempotency. A release gate does not alter claims, retry scheduling, audit actors, or domain state machines.
- Do not add Redis, BullMQ, Kafka, Temporal, a queue, an event bus, a deployment SDK, a dashboard/monitoring SDK, a public API, or a UI. Use the pinned TypeScript, Node, PostgreSQL, Drizzle, pnpm, and Vitest stack.

### Previous Story Intelligence: 12.1 and 12.2

- Story 12.1 established a Worker-safe extracted domain boundary after compiled adapters initially pulled forbidden `server-only`/Next/Auth.js dependencies. Any shared release policy must remain import-safe for `apps/worker` and retain the compiled-adapter boundary regression.
- Story 12.1 completed the dedicated Worker, health/drain lifecycle, four continuous adapters, and bounded expiry CLI. Do not create another continuous owner or reinterpret a readiness probe as release approval.
- Story 12.2 made `release_schema_versions` the one persisted release authority and added strict tuple compatibility declarations for web, API, Worker, migration, and future admin. It proved incompatible Workers do not start adapters/claims and request workloads remain out of readiness. Reuse these seams; do not replace exact current tests with a second evaluator.
- Story 12.2 database suites share a reset database and passed only as one serial `--maxWorkers=1 --no-file-parallelism` command. Do not run independent reset-backed suites concurrently.
- Story 12.2 intentionally deferred durable overlap policy, migration-job release gating, and non-destructive rollback. Completing a local matrix/gate does not claim Railway deployment, monitoring/on-call, legacy-loop retirement, or public-launch proof.

### Testing Requirements

- Use Vitest and strict TypeScript. PostgreSQL verification must use `DATABASE_URL_TEST`, independent serial execution, explicit test-target binding for spawned commands, and existing reset/migration helpers.
- Retain `tests/schema-compatibility.test.ts`, `tests/web-schema-compatibility.test.ts`, `tests/worker-runtime.test.ts`, `tests/worker-adapter-boundary.test.ts`, and API health/platform tests. Add release-gate coverage at the real migration runner and workload admission seams; unit-only manifest mocks are insufficient.
- Assert negative safety properties: rejected clean-break preflight has no database reset/deletion/migration execution; rejected matrix has no recorded version or workload admission; incompatible Worker has no adapter spawn or claim; rollback never invokes a destructive down migration.
- Health, CLI results, and telemetry must remain safe. Do not log database URLs, credentials, SQL, raw matrix/approval content, migration SQL, user content, provider data, cookies, tokens, or protected target identity.
- No web research is required. The approved versions and architecture are pinned in project context and current planning artifacts; do not update dependencies as part of this story.

### Project Structure Notes

- Keep release-neutral types/validation in the smallest justified extracted workspace boundary, likely `@xuyenviet/contracts`; persistence access remains in `@xuyenviet/database`; migration command coordination remains under `scripts/`; runtime consumers stay in `apps/api`, `apps/worker`, and root web server boundaries.
- Store a release matrix/runbook artifact under a repository documentation location appropriate for operations, with a machine-validatable form only if every runtime needs it. Do not create a BMad spec artifact, an application database table, or a second persistent release ledger for this story.
- Keep BMad planning/implementation records in `_bmad-output/`; do not modify completed Story 12.1/12.2 artifacts or statuses while implementing this story.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 12.3: Gate Schema Changes for Overlapping Runtimes`]
- [Source: `_bmad-output/implementation-artifacts/epic-12-context.md#Requirements & Constraints`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#NFR-12`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#NFR-16`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#AC-33`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-15: Railway Deploys Independently Gated Workloads`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-32: Capability Cutovers Have One Writer And Compatible Rollback`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-33: Releases Declare Schema Compatibility And Workload Admission`]
- [Source: `_bmad-output/implementation-artifacts/12-1-bootstrap-the-dedicated-worker-and-bounded-sweep-runtime.md#Completion Notes List`]
- [Source: `_bmad-output/implementation-artifacts/12-2-verify-worker-operations-telemetry-and-schema-compatibility.md#Previous Story Intelligence: 12.1`]
- [Source: `packages/contracts/src/index.ts`]
- [Source: `packages/database/src/index.ts`]
- [Source: `scripts/migrate-api-schema.ts`]
- [Source: `scripts/migrate-api-schema-runner.ts`]
- [Source: `scripts/db-env.ts`]
- [Source: `scripts/db-reset.ts`]
- [Source: `apps/api/src/release-schema.ts`]
- [Source: `apps/worker/src/runtime.ts`]
- [Source: `src/server/web-schema-admission.ts`]
- [Source: `tests/schema-compatibility.test.ts`]
- [Source: `tests/web-schema-compatibility.test.ts`]

## Story Validation

### BMad Create-Story Validation

- [x] Both authoritative Story 12.3 acceptance criteria are reproduced and mapped to executable tasks.
- [x] The clean-break path requires an affirmative disposable-target/no-overlap preflight and fails closed for protected, durable, operational, non-local, ambiguous, or overlapping targets before mutation.
- [x] The durable/overlap path requires an approved expand-migrate-contract matrix with workload ranges, release ordering, migration lock/gate, approvals, backfill/reinterpretation safety, contract preconditions, verification, and rollback route.
- [x] The existing single `release_schema_versions` authority, numeric tuple compatibility evaluator, shared declarations, post-Drizzle recording order, API/web/Worker admission, and Worker drain/no-claim behavior are explicitly preserved.
- [x] Non-destructive rollback and AD-32 single-writer routing are explicit; destructive down migrations, schema deletion during rollback, and dual writes are prohibited.
- [x] Story 12.1/12.2 implementation findings are carried forward: Worker-safe imports, compiled boundary coverage, retained feature protocols, and serial database-reset test execution.
- [x] Scope boundaries exclude code implementation, schema mutation, reset execution, staging/Railway/public-launch claims, separate admin deployment, monitoring/on-call, a new queue/SDK, and an unrequested spec artifact.
- [x] Test requirements include real serial PostgreSQL/migration-runner/workload-admission regressions and safe-output negative assertions.

### Validation Outcome

**PASS - ready for development.** The story provides an unambiguous gate before a destructive clean break and a concrete approved expand-migrate-contract/migration-job/rollback contract for durable or overlapping runtime releases. It reuses the completed Story 12.2 schema-admission implementation without weakening its fail-closed behavior, and it reserves deployed/public-launch evidence for Epic 14.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story preparation and validation only. No application code, migrations, tests, reset, seed, deployment configuration, spec artifact, implementation command, or commit was performed.
- 2026-07-31: bmad-dev-auto implemented and repeatedly repaired repository-level clean-break, approved matrix, migration lock, phase admission, rollback, contract, identity, and single-writer gates. The final required real successful `DATABASE_URL_TEST` `pnpm db:migrate` proof is blocked: the only checked-in approved matrix intentionally has the non-routable exact identity `database=operator_supplied_release_target;host=release-target.invalid;port=5432` and an empty pending plan. A test-target matrix cannot be generated dynamically without violating the checked-in approved-artifact gate, and committing the real test target identity/pending plan needs explicit release-operator approval.
- 2026-07-31: User approved the isolated `DATABASE_URL_TEST` matrix. Read-only preflight resolved `database=xuyenviet_test;host=127.0.0.1;port=5432`; the approved matrix recorded the 22 pending Drizzle IDs and SHA-256 digests. The serial `DATABASE_URL_TEST` `pnpm db:migrate` command succeeded and recorded exactly one `20260729.1` release version. Follow-up synchronous reviews found unresolved high safety gaps, so this evidence does not complete the story.

### Completion Notes List

- Ultimate context-engine analysis completed - comprehensive developer guide created.
- Created from the authoritative Epic 12.3 acceptance criteria, full Epic 12 context, PRD NFR-12/NFR-16 and AC-33, architecture AD-15/AD-32/AD-33, completed Stories 12.1/12.2, current shared compatibility and migration-runner code, clean-break safeguards, sprint status, and recent Git history.
- Validation passed after an independent checklist re-check of target preflight, matrix completeness, migration sequencing, runtime admission, rollback safety, Worker boundaries, prior-story learnings, scope boundaries, and serial PostgreSQL test requirements.
- Initial verification was blocked pending the approved, checked-in `DATABASE_URL_TEST` migration matrix. That approval and the required successful isolated CLI migration proof are now complete; no development/staging/production reset, migration, seed, deployment, or destructive rollback was executed.
- 2026-07-31: User-approved bounded recovery completed. Fresh test bootstrap now reaches Drizzle before the release ledger exists and records only after success; reset and migration share an identity-verified maintenance-database advisory lock; API, web, and Worker phase admission binds a single live schema/identity observation to the approved matrix; and forced Worker drain waits for child exit deterministically. The approved `DATABASE_URL_TEST` matrix was recreated from scratch, migrated successfully, and verified to contain exactly one `20260729.1` release record. Final Blind Hunter, Edge Case Hunter, and Acceptance reviews were repaired to clean.
- 2026-08-01: Targeted Epic 12 repair canonicalized phase-policy declaration comparison by workload and fields, independent of JSON key order. The checked-in matrix is now an unattested, explicitly unapproved template with no owner, deployment, or verification assertions and is rejected by parsing, migration admission, and runtime policy loading until an operator supplies actual approved evidence. Regressions cover reordered equivalent declarations and a changed declaration rejection. Final synchronous blocking review is clean.
- 2026-08-01: Final Story 12.3 repair materialized an approved, SHA-256-bound overlap matrix in a detached deployment directory against the isolated `DATABASE_URL_TEST` ledger. Built API, web, and Worker boundaries admit the persisted overlap version only with that artifact; missing and structurally valid but digest-tampered artifacts stay non-ready. The test restores the original release ledger and awaits all spawned runtimes before cleanup. Final synchronous Blind Hunter, Edge Case Hunter, and Acceptance Auditor review is clean.

### Auto Run Result

Status: done

- Implemented the fail-closed release policy, clean-break destructive-action gates, matrix artifact validation, forward migration sequencing, shared runtime phase admission, non-destructive rollback/contract rules, and focused regressions.
- The approved fresh `DATABASE_URL_TEST` migration proof passed and recorded exactly one `20260729.1` release version.
- Final bounded recovery repaired fresh-ledger bootstrap, common verified maintenance-database locking, atomic API/web/Worker live schema-and-identity admission, compiled Worker drain, runtime matrix artifact resolution, and policy-free API overlap admission.
- Final serial verification passed 70 focused tests. Lint has zero errors and five existing unrelated warnings; build, typecheck, Compose rendering, and diff whitespace checks passed. Final synchronous review repairs are clean.
- Targeted repair verification: serial focused suite (10 files, 71 tests), `pnpm lint` (0 errors, 5 existing warnings), `pnpm typecheck`, `pnpm build`, `docker compose config`, and `git diff --check` passed. An initial concurrent test/build execution raced over the shared `DATABASE_URL_TEST` reset target; the required serial rerun passed.

### File List

- `_bmad-output/implementation-artifacts/12-3-gate-schema-changes-for-overlapping-runtimes.md`
- `_bmad-output/implementation-artifacts/spec-12-3-gate-schema-changes-for-overlapping-runtimes.md`
- `packages/contracts/src/index.ts`
- `scripts/db-env.ts`
- `scripts/db-reset.ts`
- `scripts/db-seed.ts`
- `scripts/db-seed-data.ts`
- `scripts/migrate-api-schema.ts`
- `scripts/migrate-api-schema-runner.ts`
- `scripts/schema-release-matrix.ts`
- `scripts/drizzle-migration-plan.ts`
- `apps/api/src/release-schema.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/auth/resource-server.guard.ts`
- `apps/api/src/health/health.controller.ts`
- `apps/api/src/main.ts`
- `apps/worker/src/runtime.ts`
- `src/server/web-schema-admission.ts`
- `docs/release-matrices/README.md`
- `docs/release-matrices/20260728.1-to-20260729.1.json`
- `docs/runbooks/schema-release-matrix.md`
- `tests/schema-compatibility.test.ts`
- `tests/schema-release-gate.test.ts`
- `tests/schema-release-matrix-artifact.test.ts`
- `tests/drizzle-migration-plan.test.ts`
- `tests/web-schema-compatibility.test.ts`
- `tests/worker-runtime.test.ts`
- `tests/worker-adapter-boundary.test.ts`
- `tests/api-platform-contract.test.ts`
- `tests/story-8-5-clean-break.test.ts`
- `tests/story-8-6-actor-isolation.test.ts`
- `tests/bundled-runtime-startup.test.ts`
