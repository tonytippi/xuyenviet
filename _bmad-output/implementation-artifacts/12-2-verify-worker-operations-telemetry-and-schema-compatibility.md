# Story 12.2: Verify Worker Operations, Telemetry, and Schema Compatibility

Status: done

## Story

As a deployment operator,
I want worker cutovers to have observable and compatible operational behavior,
so that a replacement loop cannot silently lose work or run against an incompatible schema.

## Acceptance Criteria

1. **Given** a worker, API, web, or admin workload starts in staging, **when** it checks the deployed schema version, **then** it becomes ready only within its declared compatibility range, **and** a non-compatible worker claims no jobs and a non-compatible request workload receives no traffic.
2. **Given** retries, duplicate pollers, restarts, lease expiry, and graceful shutdown are exercised, **when** operational tests and dashboards run, **then** telemetry includes correlation ID, capability, principal class, safe result code, latency, job lag, retry, and lease recovery, **and** the replacement loop has a runbook and evidence for stable lag, retry, duplicate-poller, restart, and recovery behavior before its legacy loop is retired.

## Tasks / Subtasks

- [ ] Establish a shared, declared schema-compatibility admission contract (AC: 1)
  - [ ] Replace the API-only exact-version assumption with an extracted, Worker-safe compatibility declaration/evaluator that accepts a workload's declared inclusive schema range. Canonical schema versions are UTC date/revision tuples in exact `YYYYMMDD.N` form: the first component must be a real zero-padded Gregorian calendar date, `N` must be a base-10 non-negative integer without leading zeroes except `0`, and comparison is numeric by `{ year, month, day, revision }` in that order. Therefore `20260728.10` is later than `20260728.2`; lexicographic string comparison is forbidden.
  - [ ] The shared evaluator must expose a typed `SchemaCompatibilityDeclaration` of `{ workload, minimumVersion, maximumVersion }` and an `isSchemaCompatible` result. Reject an unknown workload name, malformed declaration bound, inverted inclusive bounds, malformed persisted version, zero/multiple current persisted records, or an out-of-range version. Keep `release_schema_versions` as the single migration-recorded deployed-version authority; do not let individual workloads infer schema state from migration filenames, Drizzle metadata, or process-local configuration.
  - [ ] Define declarations for the currently deployable web, API, Worker, and migration workloads, plus the future admin workload contract without creating the separate admin application owned by Story 13.1. The declarations must be importable by API, Worker, migration tooling, and later BFF runtimes without importing `src/`, Next.js, Auth.js, `server-only`, or an app runtime into another workload.
  - [ ] Preserve the migration advisory lock and forward-only recording flow. The migration job records the actual deployed schema version only after Drizzle migrations succeed; migration-gate/expand-migrate-contract policy for overlapping durable releases remains Story 12.3 scope.
  - [ ] Keep compatibility comparisons deterministic and fail closed for a missing, malformed, unknown, or out-of-range recorded version. Do not expose actual versions, migration SQL, database URLs, or configuration values in health responses.

- [ ] Gate readiness, traffic, and Worker work admission on schema compatibility (AC: 1)
  - [ ] Update API readiness to use its declared range while preserving `/health/live` as process-only and the established safe 503 error envelope for `/health/ready`. A schema-incompatible API must remain out of readiness and must not be treated as a healthy traffic target.
  - [ ] Update the dedicated Worker runtime so configuration validation, PostgreSQL reachability, schema compatibility, and all four loop states are independently required before readiness. Add only a fixed safe `schema_incompatible` readiness reason; preserve the existing safe reasons and no-secret health contract.
  - [ ] Prevent the Worker supervisor from calling `admit()` or spawning any extraction, ingestion, indexing, or AI Ask outbox adapter until schema compatibility succeeds. On a later failed compatibility probe, stop future admissions, report non-ready, and rely on the existing drain/lease-recovery path for already admitted work; do not fabricate a generic release or acknowledgement path.
  - [ ] Make the current traveler web readiness/traffic contract consume the same declaration at its deployment-health boundary. Do not claim an admin deployment exists: define and test the future admin declaration/consumer contract so Story 13.1 can wire its independent health boundary without duplicating compatibility policy.
  - [ ] Preserve Story 12.1 ownership: continuous work remains only in `pnpm worker`; legacy `knowledge:*worker` commands remain explicit local/debug `--once` adapters and are not retired by this story.

- [ ] Add a safe, cross-runtime operational telemetry contract (AC: 2)
  - [ ] Introduce one narrow workspace-safe telemetry event shape and emitter boundary shared by BFF/API/Worker code. Each event must contain a validated correlation ID, capability, principal class, safe result code, latency, and only allowlisted operational identifiers. Worker poll events must additionally carry bounded job lag, retry information, and lease-recovery disposition/count where applicable.
  - [ ] Reuse the existing BFF/API request-ID validation semantics (`[A-Za-z0-9_-]{1,128}` or generated UUID) through an extracted neutral helper; do not import `src/server/correlation-id.ts` into Worker code because it is `server-only`.
  - [ ] Preserve BFF-to-API `x-request-id` forwarding and Nest request middleware behavior. The synchronous AI Ask path must carry that accepted ID through extracted execution and the provider telemetry seam instead of discarding it. Provider telemetry may include provider request ID only when it is already safe metadata and must not log prompt/response bodies, image bytes, cookies, tokens, headers, raw sources, SQL, or user answer/question content.
  - [ ] Use explicit correlation lineage by operation: BFF/API request and synchronous provider events retain the validated originating request ID; each independent Worker startup, schema-denial, poll, recovery, drain, and restart event generates a fresh validated UUID correlation ID. Worker events link to durable work only through allowlisted job/outbox/card/command IDs already present in the relevant record; do not add a correlation column, migration, or second persistence path for asynchronous work in this story. Extraction, ingestion, indexing, and outbox therefore prove per-poll traceability and durable-ID linkage, not impossible request-origin continuity.
  - [ ] Instrument Worker supervisor lifecycle and each bounded poll outcome at the adapter/domain boundary without changing claim predicates, lock identity, lease/fence/CAS protocol, retry scheduling, audit actor, or idempotent effect behavior. Use established outcome data where available; do not add an in-memory job ledger, a queue platform, or a second persistence path solely for telemetry.
  - [ ] Emit safe terminal/lifecycle outcomes for startup compatibility denial, poll success/no-work/retry/failure, duplicate/contended work, lease recovery, drain, restart recovery, and provider failures. Telemetry emission must not change domain completion, acknowledgement, retry, or terminal failure behavior when the sink fails.

- [ ] Produce repository-operable dashboard and runbook evidence (AC: 2)
  - [ ] Add a Worker operations runbook under `docs/runbooks/` covering: required health/readiness and compatibility checks; safe event fields; dashboard queries/panels for lag, retries, lease recovery, poll result, and readiness; alert symptoms and operator actions; duplicate-poller contention; controlled restart/drain; lease-expiry recovery; and explicit evidence required before retiring a legacy loop.
  - [ ] Keep the runbook implementation-specific and non-secret. It must distinguish repository/local proof from the deployed monitoring, alert-routing, on-call, and public-launch evidence owned by Epic 14; do not fabricate Railway staging evidence or mark a legacy loop retired.
  - [ ] Update `README.md` and `.env.example` only for non-secret compatibility/telemetry settings and operational invocation. Preserve the rule that migrations complete before workloads receive traffic or work, and preserve capture runtimes as external operator-controlled tools.

- [ ] Prove compatibility admission and operational behavior (AC: 1, 2)
  - [ ] Add unit and PostgreSQL-backed tests for the fixed `YYYYMMDD.N` parser/comparator (`20260728.10 > 20260728.2`), inclusive boundaries, malformed dates/revisions, inverted declarations, unknown workloads, zero/multiple/malformed/current-version failures, migration recording after success only, and the same declaration evaluation in API, Worker, web, and future-admin contract seams.
  - [ ] Extend API/platform tests to prove liveness stays available while schema-incompatible readiness returns only the established safe non-ready response; prove the compatible API remains ready. Verify the current web deployment-health/traffic-admission seam does not become eligible while incompatible.
  - [ ] Extend `tests/worker-runtime.test.ts` to prove incompatible schema blocks every adapter before its first claim, reports `schema_incompatible` without version leakage, becomes ready only after a compatible probe and loop initialization, and becomes non-ready/stops future admissions if compatibility is lost.
  - [ ] Extend `tests/worker-adapter-boundary.test.ts` and retained protocol suites with real `DATABASE_URL_TEST` execution: exercise duplicate pollers, controlled restart/drain, stale/expired lease recovery, retry/terminal outcomes, and no new claim after drain. Assert durable state proves the existing feature protocol, not a mock-only supervisor assertion.
  - [ ] Add telemetry contract tests that assert exact allowlisted event objects and the declared correlation policy: BFF -> API -> synchronous AI Ask/provider preserves one validated request ID; each independent Worker event has a newly validated UUID and only its safe durable work ID linkage. Include negative assertions for database URLs, secrets, credentials, cookies, authorization headers, SQL, raw source/capture material, prompt/answer text, image data, and raw provider payloads. Prove a failing telemetry sink cannot alter a guarded job or API command result.
  - [ ] Record local/repository evidence for stable lag observation, retry, duplicate-poller contention, restart, lease recovery, and graceful shutdown in the runbook or a bounded operational evidence document. Do not retire a legacy loop without the required later deployed evidence and explicit decision.
  - [ ] Run the focused compatibility/telemetry/runtime suites serially with `DATABASE_URL_TEST`, the retained worker protocol suites, relevant BFF/API correlation suites, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `docker compose config`, the Worker image build, and `git diff --check`. Record exact commands, results, and environmental blockers in the Dev Agent Record.

## Dev Notes

### Review Findings

- [x] [Review][Patch] Package release artifacts for the production web runner [Dockerfile:53] — The Next runner copies neither `docs/release-matrices` nor sets `SCHEMA_RELEASE_MATRIX_DIRECTORY`, so web readiness fails closed after the persisted overlap version requires an approved phase policy. Ship the deployment-owned matrix directory and configure the runner, then verify web readiness from a copied bundle outside the repository.
- [x] [Review][Patch] Bound console telemetry under stdout backpressure [packages/contracts/src/index.ts:402] — `process.stdout.write()` may return `false`; unawaited writes then accumulate an unbounded buffer/callback queue under a blocked consumer. Drop/coalesce while blocked or use a bounded non-blocking queue so telemetry cannot exhaust process memory.

### Scope and Outcome

- This story completes repository-level compatibility admission and observable Worker cutover behavior. It does not implement Story 12.3's approved durable-data expand-migrate-contract matrix, migration-job release gate, or non-destructive rollback plan.
- This story must not create the separate admin application, deploy to Railway, configure external monitoring/alert routing/on-call, or assert public-launch/legacy-retirement completion. Story 13.1 owns the admin runtime; Epic 14 owns deployed launch evidence and final legacy-owner retirement disposition.
- Preserve the modular monolith: Worker/API/BFF adapters coordinate and observe; feature-owned use cases retain mutation, authorization, audit, and PostgreSQL durable-work ownership.

### Existing Implementation to Extend

| Surface | Current behavior to preserve | Story 12.2 change |
| --- | --- | --- |
| `apps/worker/src/runtime.ts` | Process-only liveness; readiness requires config, DB `select 1`, four adapter states; drain aborts admission and awaits child work. | Add declared schema compatibility to the readiness/admission state machine and safe lifecycle telemetry. Never spawn adapters while incompatible. |
| `apps/worker/src/adapters.ts` | Compiled child adapter delegates to `@xuyenviet/worker-domain`; failure currently logs the raw error. | Replace raw error logging with safe result telemetry/projection while preserving nonzero failure behavior. |
| `packages/worker-domain/src/adapters.ts` | Runs exactly one `--once` extraction, ingestion, indexing, or outbox poll using a validated worker ID. | Add additive bounded outcome observation only; do not alter adapter CLI, claim protocols, or use root web modules. |
| `packages/worker-domain/src/features/knowledge/*worker*.ts` and `features/ai/domain-outbox-worker.ts` | Feature-owned recovery, `SKIP LOCKED` claims, lease/fence/CAS or lock-owner protection, retry, and idempotency. | Surface safe poll/recovery facts through a narrow callback/result boundary; retain each feature's distinct protocol. |
| `apps/api/src/release-schema.ts` and `packages/database/src/index.ts` | API declares exact `20260728.1`; repository reads latest recorded version with equality. | Extract/replace with workload-neutral inclusive declared-range evaluation; keep `release_schema_versions` authoritative and fail closed. |
| `scripts/migrate-api-schema.ts` | Holds advisory lock `918_040_004`, runs Drizzle, then records an API-owned version. | Consume the neutral declaration/current release record; record only after migration success and preserve locking. |
| `src/server/correlation-id.ts` and BFF transport | BFF validates/generates IDs and forwards `x-request-id`; it is `server-only`. | Reuse its validation rule from a neutral extracted utility; do not make Worker import this file. |
| `packages/database/src/ai-ask-stream-execution.ts` | The execution port receives `_correlationId` but discards it while calling the Gateway path. | Preserve/make available the correlation ID for safe execution/provider telemetry; do not persist raw prompt/response data. |
| `README.md`, `.env.example`, `docs/runbooks/` | Worker ownership and local lifecycle are documented; only Facebook/YouTube capture runbooks exist. | Add non-secret compatibility/telemetry operation instructions and a dedicated Worker cutover runbook. |

### Durable Work Inventory and Telemetry Rules

| Workload | Principal class / capability | Preserve exactly | Telemetry facts allowed |
| --- | --- | --- | --- |
| Knowledge extraction | `system` / `knowledge.extraction` | Lock owner/timestamp, stale recovery, guarded completion. | Poll result, bounded lag, retry/recovery disposition, safe job ID. |
| Knowledge ingestion | `system` / `knowledge.ingestion` | `SKIP LOCKED`, persisted lease/fence, stage/version CAS. | Poll result, bounded lag, attempt/retry, lease recovery, safe job ID. |
| Knowledge indexing | `system` / `knowledge.indexing` | Claimed projection batches, lease/token protection, idempotent card-version projection. | Batch result/count, lag, retry/recovery, safe card/job ID. |
| AI Ask domain outbox | `system` / `ai_ask.outbox` | Lease/fence/CAS acknowledgement, bounded retry, idempotent effects, safe terminal failure. | Batch result/count, lag, retry/lease recovery, safe outbox ID. |
| AI Ask request/provider | `user` / `ai_ask.stream` | Existing BFF/API ownership, fence, atomic terminal persistence, and safe usage behavior. | Correlation, principal class, safe result, latency, safe command/message ID, provider request ID when available. |
| Proposal expiry sweep | `system` / `trip_proposal.expiry` | Explicit bounded `--once`, transactional `SKIP LOCKED`, idempotent expiry. | Bounded command result and latency only when invoked; it is not a continuous Worker loop. |

- `principalClass` is an allowlisted class such as `user`, `system`, or `anonymous`; never emit email, role list, session ID, JWT, cookie, or user content.
- Correlation is intentionally split at the durable asynchronous boundary: BFF/API/provider events keep the originating validated request ID, while Worker startup/poll/recovery/lifecycle events generate a new validated UUID and use safe durable IDs for linkage. Do not imply that an outbox, extraction, ingestion, or indexing poll can recover a request ID the persisted record never stored.
- Safe aggregate identifiers are stable domain IDs already safe for operational correlation. Never emit source raw text, quote/evidence text, prompt, answer, attachment, URL containing credentials, payload JSON, SQL, database hostname, or fencing token.
- Latency and lag are numeric bounded operational values. A no-work/duplicate/fenced outcome is a safe result disposition, not permission to mutate or suppress a feature-owned terminal state.

### Architecture Compliance and Boundaries

- AD-1 and the Story 12.1 extraction boundary are mandatory: `apps/worker` and `packages/worker-domain` may import only Worker-safe extracted packages. They must not import root `src`, `next/*`, `next-auth`, `server-only`, `src/app`, or a module marked `"use server"`.
- AD-3: Drizzle and reviewed migrations remain schema authority. No parallel migration registry, environment-only claimed version, or direct manual schema flag.
- AD-6 and AD-31: adapters never directly write feature tables or impersonate users. Automation continues to use cataloged system execution actors while preserving submitter/requester provenance.
- AD-15 and AD-33: liveness is process-only; readiness gates config, database, schema compatibility, and assigned dependencies. Incompatible request workloads must not be traffic-ready and incompatible Workers must not claim work.
- AD-34: observe the PostgreSQL outbox; do not replace its `FOR UPDATE SKIP LOCKED`, lease/fence, retry, idempotency, or safe terminal failure protocol.
- Preserve API bearer-only/no-CORS and BFF browser-credential boundaries. Telemetry is operational output, not a new public API or browser diagnostic surface.

### Testing Requirements

- Use Vitest. PostgreSQL cases require `DATABASE_URL_TEST`, isolated serial execution, and the existing test reset/global migration conventions. Never use `pnpm db:reset` as test verification.
- Retain and rerun `tests/knowledge-extraction-worker.test.ts`, `tests/knowledge-ingestion-jobs.test.ts`, `tests/knowledge-indexing-worker.test.ts`, `tests/domain-outbox.test.ts`, and `tests/trip-proposal-expiry-worker.test.ts`; Story 12.2 must not weaken their existing protocol assertions.
- Reuse the real compiled-adapter seam in `tests/worker-adapter-boundary.test.ts`; tests that only mock `WorkerRuntime` are insufficient for duplicate-poller, restart, claim-blocking, and persisted lease-recovery evidence.
- Retain Worker-boundary tests proving source and compiled adapters do not pull in forbidden root/Next/Auth.js/server-only dependencies.
- No web research is required: the story depends on the project-approved Node, Nest, PostgreSQL, Drizzle, pnpm, and Vitest stack already pinned in the project context. Do not add an observability SDK, queue, event bus, or metrics platform dependency without an approved architecture change.

### Previous Story Intelligence: 12.1

- Story 12.1 is complete and proved a dedicated Worker with four compiled continuous adapters, lifecycle health/drain behavior, bounded proposal-expiry CLI, Compose readiness, and Worker Docker packaging. Its focused serial suite passed 89 tests; `pnpm typecheck`, build, diff check, Compose rendering, and Worker image build passed; lint had zero errors and five pre-existing warnings.
- 12.1 initially failed because compiled ingestion/outbox adapters pulled forbidden `server-only`/Next/Auth.js dependencies. The resolved `@xuyenviet/worker-domain` extraction is non-negotiable: shared compatibility/telemetry code must be neutral and preserve the existing compiled-boundary regression.
- 12.1 deliberately deferred all compatibility admission, cross-runtime telemetry/correlation, dashboards, alerts, runbooks, duplicate-poller/restart/lease evidence, and legacy-loop retirement proof. Do not declare any of those complete from the 12.1 health/drain tests alone.

### Project Structure Notes

- Prefer a minimal extracted workspace utility/package only if API, Worker, migration, and BFF runtime consumers genuinely require it. Keep Worker orchestration in `apps/worker`, feature protocol logic in `packages/worker-domain`, persistence in `packages/database`, API wiring in `apps/api`, and root BFF adaptation under `src/server`.
- Do not introduce an admin application, UI, database schema migration, new job table, external telemetry backend, or new operational dependency merely to satisfy this story. Add a migration only if the released-version compatibility contract cannot safely reuse the existing `release_schema_versions` record.
- Existing unrelated worktree changes, if present, are not Story 12.2 scope and must not be reverted or included in its file list.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 12: Operable Worker and Migration Runtime`]
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 12.2: Verify Worker Operations, Telemetry, and Schema Compatibility`]
- [Source: `_bmad-output/implementation-artifacts/epic-12-context.md#Requirements & Constraints`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.8 API, Runtime, And Deployment Boundary`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#9. Non-Functional Requirements`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-1: API-First Modular Monolith Runtime`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-15: Railway Deploys Independently Gated Workloads`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-33: Releases Declare Schema Compatibility And Workload Admission`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Operational Envelope`]
- [Source: `_bmad-output/implementation-artifacts/12-1-bootstrap-the-dedicated-worker-and-bounded-sweep-runtime.md#Completion Notes List`]
- [Source: `apps/worker/src/runtime.ts`]
- [Source: `apps/worker/src/adapters.ts`]
- [Source: `packages/worker-domain/src/adapters.ts`]
- [Source: `packages/worker-domain/src/features/knowledge/ingestion-worker.ts`]
- [Source: `packages/worker-domain/src/features/ai/domain-outbox-worker.ts`]
- [Source: `apps/api/src/release-schema.ts`]
- [Source: `apps/api/src/health/health.controller.ts`]
- [Source: `packages/database/src/index.ts`]
- [Source: `scripts/migrate-api-schema.ts`]
- [Source: `src/server/correlation-id.ts`]
- [Source: `packages/database/src/ai-ask-stream-execution.ts`]
- [Source: `tests/worker-runtime.test.ts`]
- [Source: `tests/worker-adapter-boundary.test.ts`]
- [Source: `tests/api-platform-contract.test.ts`]

## Story Validation

### BMad Create-Story Validation

- [x] Both authoritative Story 12.2 acceptance criteria are reproduced and mapped to executable tasks.
- [x] Schema compatibility has a typed workload-neutral range declaration plus unambiguous `YYYYMMDD.N` numeric tuple parsing, ordering, inclusive bounds, and fail-closed malformed/inverted/unknown/zero-or-multiple-record behavior.
- [x] Worker admission is explicitly blocked before adapter spawning/claims on incompatible schema, while existing drain, lease, fencing, CAS, lock-owner, retry, and idempotency protocols remain feature-owned.
- [x] API/web/current-admin-boundary handling is concrete without falsely creating an admin deployment or claiming staging/public-launch evidence.
- [x] Telemetry names all required dimensions: correlation ID, capability, principal class, safe result code, latency, job lag, retry, and lease recovery; safe allowlists and prohibited data are explicit.
- [x] Correlation lineage is unambiguous: synchronous BFF/API/provider events preserve the request ID; independent Worker events create a fresh validated UUID and link only through existing safe durable IDs, so no unsupported async correlation persistence is implied.
- [x] Dashboard/runbook/evidence requirements are actionable and distinguish repository proof from Epic 14 deployed monitoring, alerting, on-call, and launch evidence.
- [x] Scope boundaries prevent a new queue/metrics platform, direct feature-table writes, fake actors, schema-overlap policy work, admin-app implementation, fabricated Railway proof, and premature legacy-loop retirement.
- [x] Testing requires real serial PostgreSQL/compiled-adapter evidence plus retained protocol, BFF/API, build, Compose, Docker, and safe-telemetry regressions.

### Validation Outcome

**PASS - ready for development.** The story is implementable with the completed Story 12.1 Worker baseline. Schema admission now has a deterministic version grammar/comparator, and correlation policy distinguishes synchronous continuity from independent asynchronous Worker polls without adding unsupported durable state. The only sequencing constraints are intentionally explicit: Story 12.2 provides local/repository schema admission, telemetry, runbook, and operational proof; Story 12.3 owns durable overlapping-runtime release policy; Story 13.1 wires the future admin runtime; Epic 14 records deployed monitoring, alerting, on-call, and final retirement/public-launch evidence.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story preparation and validation only. No application code, migrations, tests, deployment configuration, spec artifact, or implementation command was executed.

### Completion Notes List

- Ultimate context-engine analysis completed - comprehensive developer guide created.
- Created from the authoritative Epic 12.2 acceptance criteria, full current Epic 12 context, PRD/addendum, architecture spine, approved sprint change proposal, project context, completed Story 12.1 artifact, current Worker/API/BFF/schema implementation, relevant tests, and recent Git history.
- Validation passed after an independent re-check of scope, deterministic workload compatibility admission, synchronous versus asynchronous correlation policy, telemetry safety, durable protocol preservation, Worker import boundaries, operational evidence, and later-story ownership.
- 2026-07-31 bounded recovery: shared row-cardinality admission, web readiness consumer, future-admin consumer contract, release-repository disposal, and Worker schema re-admission epoch handling were repaired. `pnpm typecheck` passed. Focused serial compatibility/runtime/telemetry suite passed: 4 files, 20 tests. A single serial PostgreSQL suite passed: 8 files, 86 tests, including compiled Worker adapters, retained feature protocols, drain/no-new-claim, lease recovery, API health, and BFF/API correlation. `pnpm lint` had 0 errors and 5 existing warnings; `git diff --check` passed.
- 2026-07-31 completion: Worker feature loops now surface bounded durable lag, retry, and lease-recovery observations; compiled-adapter boundary tests capture sanitized JSONL telemetry through the approved `NODE_ENV=test` workspace-local `XV_WORKER_TELEMETRY_FILE` transport. The transport rejects non-normalized, non-workspace, non-JSONL paths and uses no-follow file creation; its failure remains non-disruptive. Real PostgreSQL evidence includes duplicate-poller `SKIP LOCKED` no-work behavior with a held durable lease, drain/no-new-claim, recovered lease, retry/terminal failure, and safe durable IDs with fresh Worker UUIDs. The migration runner proves release-version recording only follows successful migrations.
- 2026-08-01 targeted Epic 12 review repair: release-phase policy resolution no longer imports a source-tree `scripts/` module from bundled API, Worker, or web code. The neutral runtime reader uses only the explicit deployment-owned `SCHEMA_RELEASE_MATRIX_DIRECTORY`, validates the approved artifact digest, and fails closed for missing, invalid, or escaping paths. The API Docker target now ships release matrices; both API and Worker declare the runtime directory. Explicit `@Inject(Reflector)` repairs esbuild's bundled Nest metadata loss. Direct regression builds and launches copied API and Worker bundles from an unrelated cwd with copied approved artifacts and dereferenced dependencies, proving process liveness independent of repository cwd/source paths. Serial focused verification passed: 6 files, 36 tests including compiled Worker adapter boundaries; lint had 0 errors and 5 pre-existing warnings; typecheck, diff check, API image, and Worker image builds passed. Final synchronous blocking review found no actionable findings.
- Test isolation note: two independent PostgreSQL Vitest commands run concurrently interfered through the shared reset database, causing fixture deletion and a Worker schema-gate timeout. The same suites pass when run as one `--maxWorkers=1 --no-file-parallelism` command. Do not split database-reset verification commands concurrently.
- Verification 2026-07-31: serial `DATABASE_URL_TEST` matrix passed: 12 files, 108 tests. Focused repaired telemetry/protocol serial matrix passed: 5 files, 60 tests. `pnpm lint` completed with 0 errors and 5 pre-existing warnings; post-build `pnpm typecheck`, `pnpm build`, `docker compose config`, Worker Docker target build, and `git diff --check` passed.
- BMad code review 2026-07-31: initial Blind Hunter, Edge Case Hunter, and Acceptance Auditor findings covering production transport exposure, sink blocking, result classification, public indexing result shape, and evidence recording were repaired. Final follow-up review found no unresolved code findings; the exact 12-file evidence command was reconciled in the Worker operations runbook. Story is approved complete; no deployed monitoring, on-call, Railway, public-launch, or legacy-loop-retirement evidence is claimed.
- 2026-08-01 final Epic 12 review repair: the production web runner now packages `docs/release-matrices` and declares `/app/docs/release-matrices`; direct copied-bundle verification starts Next from an unrelated cwd and reaches the schema-gated web health boundary. Console telemetry drops events while stdout is backpressured, consumes asynchronous stdout failures without affecting domain outcomes, and emits a process warning for that operational condition. Final serial verification passed: `pnpm vitest run tests/operational-telemetry.test.ts tests/bundled-runtime-startup.test.ts --maxWorkers=1 --no-file-parallelism` (2 files, 8 tests), `pnpm lint` (0 errors, 5 pre-existing warnings), `pnpm typecheck`, and `git diff --check`; `docker build --target runner -t xuyenviet-web-12-2-review .` passed. Final synchronous review found no actionable findings.

### File List

- `Dockerfile`
- `packages/contracts/src/index.ts`
- `tests/bundled-runtime-startup.test.ts`
- `tests/operational-telemetry.test.ts`
- `_bmad-output/implementation-artifacts/12-2-verify-worker-operations-telemetry-and-schema-compatibility.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
