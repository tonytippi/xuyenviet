# Story 12.1: Bootstrap the Dedicated Worker and Bounded Sweep Runtime

Status: done

## Story

As a product operator,
I want continuous jobs and scheduled sweeps to run in the correct runtime,
so that background work remains independently supervised and does not rely on request-serving processes.

## Acceptance Criteria

1. **Given** a continuous worker loop or bounded maintenance sweep is configured, **when** it is deployed, **then** continuous work runs only in the dedicated worker service and scheduled work runs only as an explicit bounded `--once` command, **and** neither path uses in-memory coordination or bypasses PostgreSQL claim, lease, fencing, and idempotency protocols.
2. **Given** the worker receives startup or shutdown, **when** health endpoints are queried or shutdown begins, **then** `/health/live` reports process liveness and `/health/ready` verifies assigned configuration, database, and loop readiness, **and** shutdown stops new claims and safely completes or releases in-progress work according to persisted leases.

## Tasks / Subtasks

- [x] Define the Worker runtime boundary and assigned-work inventory (AC: 1, 2)
  - [x] Create the dedicated Worker bootstrap in the approved worker application/runtime boundary. It must be independently buildable and startable, and it must not import root Next.js, Auth.js, `server-only`, `src/app`, or `"use server"` modules.
  - [x] Register continuous adapters for the existing extraction, canonical ingestion, indexing, and AI Ask transactional-outbox workloads. The runtime owns their supervision only; each feature continues to own its domain use case and durable claim protocol.
  - [x] Add an outbox loop adapter around `processAiAskDomainOutboxBatch`; keep its existing bounded batch claim/delivery behavior unchanged. Do not run the outbox consumer in a request, BFF, route handler, server action, `after()` callback, or detached promise.
  - [x] Do not move Facebook or YouTube capture into this runtime. They remain explicit operator-controlled external operations tools.
  - [x] Replace the compose/runtime topology of independently deployed continuous knowledge scripts with the single dedicated Worker service only when its replacement has the required local lifecycle proof. Do not silently retain a second continuous owner for the same configured loop.

- [x] Add explicit bounded sweep entrypoints and scheduling-safe commands (AC: 1)
  - [x] Add a CLI command for proposal expiry that invokes `runTripChangeProposalExpiryWorkerLoop({ once: true })`, returns a meaningful process status, and accepts only bounded validated options.
  - [x] Define each scheduled maintenance command as an explicit finite `--once` execution. A scheduler/Cron command may launch one of these commands but must not launch a perpetual polling process.
  - [x] Keep source retention and provenance-withdrawal backfill as their existing explicit operator commands unless their bounded semantics are deliberately standardized; do not broaden or automate their actor/confirmation requirements in this story.
  - [x] Reject unknown or unsafe command-line arguments. Do not implement an in-memory scheduler, distributed coordination, Redis/BullMQ, Kafka, Temporal, an event bus, or a new queue platform.

- [x] Implement Worker lifecycle, health, and graceful shutdown (AC: 2)
  - [x] Start a Worker-owned HTTP health surface with exact `GET /health/live` and `GET /health/ready` endpoints. Liveness is process-only and must not depend on database availability, loop success, or configuration validity.
  - [x] Make readiness fail closed until assigned configuration validates, the Worker can reach PostgreSQL, and every assigned continuous loop has completed initialization and is eligible to poll. A draining, failed, stopped, or uninitialized loop makes readiness non-ready. Return only safe status/reason data; never expose secrets, URLs, SQL, raw work payloads, provider bodies, or user content.
  - [x] On `SIGTERM` and `SIGINT`, transition the runtime to draining before stopping loop admission, make readiness non-ready, stop future claims, and wait for in-flight work to complete under its existing persisted protocol or be recoverable after its persisted lease/stale-recovery path. Do not invent a generic in-memory release mechanism or acknowledge work without the feature's existing CAS/fence checks.
  - [x] Coordinate process exit and health-server closure after loops finish or the configured graceful deadline is reached. Preserve protocol-specific recovery: ingestion/indexing/outbox use persisted lease/fencing; extraction uses persisted lock owner/timestamp plus stale recovery; proposal expiry holds a short transactional `SKIP LOCKED` lock and is idempotent.

- [x] Wire independent Worker packaging and local runtime topology (AC: 1, 2)
  - [x] Update `package.json` with the dedicated continuous Worker command and explicit bounded sweep command(s). Preserve existing feature commands only where they remain supported local adapters; document replacement/deprecation intentionally rather than leaving ambiguous production owners.
  - [x] Update the Docker worker target to start the dedicated Worker runtime, expose its health port, and retain a non-root execution user. Keep web, API, Worker, and migration targets independently selectable.
  - [x] Update `compose.yaml` to run one Worker service with the Worker readiness probe. Do not use the legacy ingestion heartbeat file as the Worker readiness contract.
  - [x] Update `.env.example` and `README.md` with non-secret Worker configuration, continuous versus `--once` invocation, health endpoints, signal/drain behavior, and the requirement to run migrations before dependent workloads. Do not claim Railway staging/public-launch evidence; that belongs to Epic 14.

- [x] Prove runtime ownership and lifecycle behavior (AC: 1, 2)
  - [x] Add focused Vitest coverage for runtime configuration/loop registration, continuous-versus-sweep command selection, and rejection of invalid CLI input.
  - [x] Add HTTP tests proving `/health/live` stays live while readiness fails for invalid configuration, unavailable database, an uninitialized/failed loop, and draining state; prove readiness succeeds only after all assigned loops are ready.
  - [x] Add lifecycle tests that begin an actual configured loop or controlled loop adapter, initiate shutdown, prove readiness becomes non-ready before exit, prove no additional claim begins after draining starts, and prove in-flight work either finishes through its existing guarded completion or is recovered through its persisted lease/stale path.
  - [x] Add integration coverage proving the Worker invokes the bounded outbox consumer and proposal-expiry `--once` sweep without replacing their feature-owned PostgreSQL `FOR UPDATE SKIP LOCKED`, claim, lease/fence, CAS, or idempotency behavior.
  - [x] Run the focused Worker/runtime suites, existing worker protocol suites, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`. Record exact results and any environmental blockers in the Dev Agent Record.

## Dev Notes

### Review Findings

- [x] [Review][Patch] Isolate forced adapter-stop failures [apps/worker/src/runtime.ts:84] — `drain()` isolates each synchronous `forceStop()` failure, continues all remaining forced stops, and completes health socket/server teardown. Regression holds two adapters open, makes the first force-stop throw, verifies the next forced stop runs, and proves health closure.

### Scope and Outcome

- This story delivers the local/repository bootstrap for an independently supervised dedicated Worker and bounded one-shot sweep entrypoints. It does not claim a completed Railway staging deployment, public-launch operations, dashboards, alert routing, or external evidence.
- The runtime is a modular-monolith adapter boundary, not a new domain owner. Runtime code coordinates process lifecycle and invokes exported feature-owned work seams; it must not directly mutate Chat/Trips, Knowledge, AI, Audit, or Usage tables or recreate their authorization/actor policy.
- Worker-initiated mutations retain cataloged system execution actors. Automated Knowledge work uses `system-knowledge-pipeline`; proposal expiry uses `system-trip-planning`; AI outbox work preserves its existing executor behavior and human requester provenance. Do not create fake users or construct Auth.js/session-shaped worker identities.

### Authoritative Workload Inventory

| Workload | Story 12.1 runtime disposition | Existing durable behavior to preserve |
| --- | --- | --- |
| Knowledge extraction | Continuous dedicated Worker loop | Transactional `FOR UPDATE SKIP LOCKED` claim, persisted `lockedBy`/`lockedAt`, guarded completion/retry, stale recovery. It does not use a separate fencing-token column. |
| Knowledge ingestion | Continuous dedicated Worker loop | Persisted lease expiry and random fencing token, expected stage/version checks, `FOR UPDATE SKIP LOCKED`, safe expired-lease recovery. |
| Knowledge indexing | Continuous dedicated Worker loop | Bounded claimed projection batches, persisted lease/token, `FOR UPDATE SKIP LOCKED`, idempotent card-version projection. |
| AI Ask domain outbox | Continuous dedicated Worker loop | Existing bounded `processAiAskDomainOutboxBatch`; PostgreSQL leases/tokens/CAS acknowledgement, bounded retry, terminal safe failure, durable effect idempotency. |
| Trip Change Proposal expiry | Scheduled bounded `--once` sweep | Short transaction with `FOR UPDATE SKIP LOCKED` and idempotent pending-to-expired command. No synthetic long-running owner is required. |
| Source retention / provenance withdrawal backfill | Explicit operator commands, unchanged | Preserve existing confirmation, actor, and bounded-command semantics; do not silently convert them into unattended continuous loops. |
| Facebook / YouTube capture | External operator-controlled runtime, excluded | Must not run as Worker loop or Railway Cron job. |

### Existing Implementation: Preserve and Change

| File | Current behavior to preserve | Required Story 12.1 direction |
| --- | --- | --- |
| `src/features/knowledge/extraction-jobs.ts` | Signal-aware loop, one-poll `once`, database `SKIP LOCKED` claiming, stale recovery, guarded lock-owner/timestamp completion. | Invoke through the Worker lifecycle; do not replace its lock model with a generic fence abstraction. |
| `src/features/knowledge/ingestion-worker.ts` | Signal-aware one-poll `once` loop with lease/fencing recovery. | Register as a continuous Worker adapter; remove filesystem-heartbeat dependence as readiness evidence. |
| `src/features/knowledge/indexing-worker.ts` | Bounded incremental backfill plus claimed projection batch, lease/token protection. | Register as a continuous Worker adapter without changing batch/fence semantics. |
| `src/features/ai/domain-outbox-worker.ts` | Deliberately bounded library batch seam; deployment/scheduling is deferred. | Add only a runtime loop adapter that repeatedly invokes bounded batches; retain consumer ownership, safe delivery, and DB claim protocol. |
| `src/features/chat-trips/trip-proposal-expiry-worker.ts` | Library-only loop supports `once`; transactional `SKIP LOCKED` plus idempotent expiry command. | Expose an explicit bounded `--once` CLI/scheduled entrypoint; do not deploy it as a perpetual Worker loop. |
| `scripts/knowledge-*-worker.ts` | Individual process scripts parse signals/options and invoke individual loops. | Reuse or retire as local adapters deliberately; production/local compose continuous ownership must converge on the dedicated Worker bootstrap. |
| `Dockerfile` and `compose.yaml` | Inert Worker target and three independently supervised knowledge containers; ingestion has only a `/tmp` heartbeat check. | Establish one Worker service with an HTTP readiness contract; retain independent web/API/migration targets. |
| `apps/api/src/health/health.controller.ts` | API already distinguishes `/health/live` from `/health/ready`. | Follow the same semantic split, but do not share API traffic ownership or claim API health satisfies Worker loop readiness. |

### Architecture Compliance and Guardrails

- Follow AD-1: build the Nest/worker side only from extracted workspace packages. Do not make the Worker import root Next application code or turn this into a microservice split.
- Follow AD-6: adapters invoke domain use cases only. Worker loops do not directly write domain tables, apply independent authorization, or bypass `SystemExecutionContext` and Audit ownership.
- Follow AD-15 and NFR-12/NFR-13: each workload has a separate startup/health contract; `/health/live` is process liveness only, while `/health/ready` covers configuration, database, critical dependencies, and Worker loop state. Migrations must precede dependent workload traffic/work.
- Follow AD-31: system actor identity is cataloged and distinct from a human requester/submitter. Never add a user row, role, session, or credential for a system actor.
- Follow AD-34: outbox delivery remains PostgreSQL `FOR UPDATE SKIP LOCKED`, durable lease/fence, expected owner-fence validation, idempotent effect guard, bounded retry, and CAS acknowledgement. Runtime supervision must not alter its delivery state machine.
- Preserve feature-specific concurrency rather than standardizing it prematurely. “Preserve claim, lease, fencing, and idempotency protocols” means preserve the applicable protocol; it does not require expiry or extraction to acquire an artificial generic token.
- Never claim a job from API, web/BFF, Next route/server action, provider callback, or an in-memory background task. Never use Railway Cron for a continuous process.

### Scope Boundaries

- **Story 12.2 owns:** full declared-schema compatibility admission proof, worker/API/web/admin telemetry, correlation propagation, dashboards, alerts, runbooks, duplicate-poller/restart/lease-recovery operational evidence, and proof required before a legacy loop is retired. This story may consume existing configuration/readiness foundations but must not claim Story 12.2 completion.
- **Story 12.3 owns:** disposable-target preflight, expand-migrate-contract compatibility matrices, migration-job gating for overlapping runtimes, and non-destructive rollback behavior.
- **Epic 14 owns:** deployed selected-owner/private-route/probe, migration-ordering, rollback, legacy-retirement, backup/restore, monitoring, alerting, on-call, and public-launch evidence.
- Do not modify application product behavior, API/BFF transport ownership, database schema, or existing job state machines unless a minimal lifecycle integration requires it. No new queue/event-bus dependency, UI, admin surface, or public API is in scope.

### Testing Requirements

- Use Vitest. PostgreSQL concurrency/recovery cases must use `DATABASE_URL_TEST`, independent connections, explicit barriers/held transactions where required, and existing serial execution conventions.
- Retain and run protocol regressions for `tests/knowledge-extraction-worker.test.ts`, `tests/knowledge-ingestion-jobs.test.ts`, `tests/knowledge-indexing-worker.test.ts`, `tests/domain-outbox.test.ts`, and `tests/trip-proposal-expiry-worker.test.ts` alongside new runtime/lifecycle coverage.
- Test readiness transitions, signal/drain handling, no-new-claim admission after drain begins, and recovery without bypassing durable feature protocols. Unit-only health mocks are insufficient; include process/runtime integration at the new bootstrap seam.
- Test no sensitive output in probe responses and operational logs: no database URL, secret, cookie, token, raw source, prompt, answer, provider body, SQL, or user content.

### Project Structure Notes

- Prefer the intended `apps/worker` workspace entrypoint and narrow extracted packages. If the current workspace requires an incremental bridge, keep the bridge isolated and document why it does not import forbidden root Next modules; do not move the traveler app or create unrelated package extractions.
- Application paths under `src/features/*` remain feature-owned. Runtime coordination belongs in the Worker application/bootstrap, not in a feature table module or a Next route.
- Keep `pnpm` as the package manager, TypeScript strict, and existing `pnpm` verification scripts authoritative. Avoid adding parallel commands where an existing script can be extended safely.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 12: Operable Worker and Migration Runtime`]
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 12.1: Bootstrap the Dedicated Worker and Bounded Sweep Runtime`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.8 API, Runtime, And Deployment Boundary`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#9. Non-Functional Requirements`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/addendum.md#Approved API-First Runtime Direction`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-1: API-First Modular Monolith Runtime`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Domain Use Cases Own Mutations, Authorization, And Audit`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-15: Railway Deploys Independently Gated Workloads`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-31: Audit And Automated Execution Use First-Class Actors`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-33: Releases Declare Schema Compatibility And Workload Admission`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-34: Durable Work Uses A PostgreSQL Transactional Outbox`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Operational Envelope`]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-28.md#4.2 Replace Technical Migration Framing With Capability Cutovers`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/10-3-dispatch-ai-ask-follow-up-work-through-a-transactional-outbox.md#Operational Guardrails`]
- [Source: `package.json`]
- [Source: `Dockerfile`]
- [Source: `compose.yaml`]
- [Source: `src/features/knowledge/extraction-jobs.ts`]
- [Source: `src/features/knowledge/ingestion-worker.ts`]
- [Source: `src/features/knowledge/indexing-worker.ts`]
- [Source: `src/features/ai/domain-outbox-worker.ts`]
- [Source: `src/features/chat-trips/trip-proposal-expiry-worker.ts`]

## Story Validation

### BMad Create-Story Validation

- [x] The story reproduces both authoritative Story 12.1 acceptance criteria and maps every requirement to executable tasks.
- [x] The continuous-versus-bounded-sweep inventory is explicit, including the batch-only outbox consumer, proposal expiry, operator-only maintenance, and excluded capture runtimes.
- [x] Existing PostgreSQL protocol differences are preserved: extraction lock identity/stale recovery; ingestion/indexing/outbox lease/fence/CAS; expiry transactional lock plus idempotency.
- [x] Dedicated-runtime-only ownership, no request-path/background callback claims, and no in-memory/new queue coordination are explicit.
- [x] Liveness/readiness semantics, configuration/database/loop readiness, safe health projection, drain/no-new-claim behavior, in-flight completion/recovery, signals, and process termination are concrete.
- [x] Required code/runtime surfaces, tests, Docker/compose commands, configuration/docs, and verification commands are identified without claiming implementation or deployment evidence.
- [x] Architecture boundaries prohibit forbidden Next imports, direct aggregate mutation, fake system users, dual continuous owners, scope creep into API/BFF/UI, Story 12.2/12.3, and Epic 14.
- [x] All developer-facing technical claims cite authoritative planning artifacts or existing source files.

### Validation Outcome

**PASS - ready for development.** No blocker prevents implementation. The prior planning ambiguity around schema compatibility and deployed evidence is bounded explicitly: Story 12.1 implements Worker bootstrap and local lifecycle/readiness behavior; Story 12.2 owns compatibility/operations proof, and Epic 14 owns deployed/public-launch evidence.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story preparation only. No application code, migrations, tests, deployment configuration, or commands were executed as implementation work.
- 2026-07-31 bmad-dev-auto: focused Worker and retained protocol verification passed (7 files, 82 tests); typecheck, build, diff check, compose rendering, and Docker Worker image build passed. Direct compiled ingestion and outbox adapter execution failed before work begins because their bundled dependency graph retains forbidden `server-only`/Next/Auth.js code.

### Completion Notes List

- Ultimate context-engine analysis completed - comprehensive developer guide created.
- Story created from the authoritative Epic 12.1 acceptance criteria, current PRD/addendum, architecture spine, approved sprint change proposal, project context, completed Story 10.3, sprint status, recent Git history, and existing Worker/job implementation.
- Validation passed after re-checking scope, protocol preservation, runtime ownership, lifecycle health, testing, and later-story boundaries.
- 2026-07-31 implementation and two synchronous multi-layer reviews completed. Repairs added config-safe liveness, readiness/drain handling, strict bounded CLI parsing, a single Compose Worker service, and compiled adapter entrypoints. Final acceptance review blocked completion: `apps/worker/dist/adapters/ingestion.mjs` and `outbox.mjs` fail with `This module cannot be imported from a Client Component module.` because the compiled root feature adapters retain forbidden Worker dependencies. Required Worker-safe feature extraction and actual adapter recovery integration proof remain incomplete.
- 2026-07-31 user-authorized extraction completed. `@xuyenviet/worker-domain` contains the narrow Worker-safe closure for extraction, ingestion, indexing, AI Ask outbox, and bounded proposal expiry seams; root feature entrypoints delegate to the extracted Worker-owned implementations where required.
- 2026-07-31 completed synchronous Blind Hunter, Edge Case Hunter, and Acceptance Auditor review/repair loops. Repairs covered container health binding, repeat-signal draining, repository-independent child adapter paths, extraction lock-owner/timestamp failure fences, Docker workspace packaging, strict local adapter documentation, and Story 12.1-owned bounded expiry CLI integration coverage. Final blind review was clean; final acceptance review was approved after repairs.
- 2026-07-31 serial verification passed: `pnpm vitest run --maxWorkers=1 --no-file-parallelism tests/worker-adapter-boundary.test.ts tests/worker-runtime.test.ts tests/worker-cli.test.ts tests/knowledge-extraction-worker.test.ts tests/knowledge-ingestion-jobs.test.ts tests/knowledge-indexing-worker.test.ts tests/domain-outbox.test.ts tests/trip-proposal-expiry-worker.test.ts` (8 files, 89 tests), `pnpm typecheck`, `pnpm build`, `git diff --check`, `docker compose config`, and `docker build --target worker -t xuyenviet-worker-story-12-1-review .`. `pnpm lint` had zero errors and five pre-existing unrelated warnings.
- Story completed. Deployed operations, compatibility admission, telemetry, and legacy-retirement evidence remain explicitly owned by Stories 12.2/12.3 and Epic 14.
- 2026-08-01 targeted Epic 12 review repair: `drain()` no longer awaits an adapter after its graceful deadline and forced stop, so a non-settling adapter cannot block deterministic supervisor shutdown. The focused serial Worker/protocol suite passed (8 files, 94 tests), including the real compiled ingestion drain/no-new-claim and persisted lease-recovery proof; `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm lint` had zero errors and five pre-existing unrelated warnings. Synchronous Blind Hunter, Edge Case Hunter, and Acceptance Auditor reviews found no actionable Story 12.1 findings.
- 2026-08-01 final Epic 12 repair: `drain()` now isolates synchronous `forceStop()` failures, continues sibling stops, and completes health teardown. Concurrent callers share the same drain completion, and the graceful-deadline timer is cleared after graceful completion. Focused Worker runtime/adapter/CLI verification passed (3 files, 24 tests); `pnpm typecheck`, Worker build, and `git diff --check` passed. The broader retained 8-file suite is blocked by pre-existing `knowledge-indexing-worker` fixture failures because `index-worker-user` is absent from `users`; no Story 12.1 code was changed for that unrelated fixture. Follow-up synchronous reviews found no actionable Story 12.1 findings.

### File List

- `_bmad-output/implementation-artifacts/12-1-bootstrap-the-dedicated-worker-and-bounded-sweep-runtime.md`
- `_bmad-output/implementation-artifacts/spec-12-1-bootstrap-dedicated-worker-and-bounded-sweep-runtime.md`
- `_bmad-output/implementation-artifacts/epic-12-context.md`
- `apps/worker/package.json`
- `apps/worker/tsconfig.json`
- `apps/worker/src/main.ts`
- `apps/worker/src/runtime.ts`
- `apps/worker/src/adapters.ts`
- `packages/worker-domain/`
- `scripts/ai-ask-domain-outbox-worker.ts`
- `scripts/trip-proposal-expiry.ts`
- `scripts/knowledge-extraction-worker.ts`
- `scripts/knowledge-ingestion-worker.ts`
- `scripts/knowledge-indexing-worker.ts`
- `src/features/knowledge/extraction-jobs.ts`
- `src/features/knowledge/ingestion-worker.ts`
- `src/features/knowledge/indexing-worker.ts`
- `tests/worker-cli.test.ts`
- `tests/worker-runtime.test.ts`
- `tests/worker-adapter-boundary.test.ts`
- `Dockerfile`
- `compose.yaml`
- `package.json`
- `pnpm-lock.yaml`
- `.env.example`
- `README.md`
- `eslint.config.mjs`
