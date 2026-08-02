---
title: 'Bootstrap the Dedicated Worker and Bounded Sweep Runtime'
type: 'feature'
created: '2026-07-31'
status: 'done'
baseline_revision: '44c1e4d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/12-1-bootstrap-the-dedicated-worker-and-bounded-sweep-runtime.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-12-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Continuous durable work is split among legacy root scripts, has no Worker-owned health/lifecycle contract, and the AI outbox has no supervised polling owner. Proposal expiry is a library-only sweep rather than an operator-safe command.

**Approach:** Add an independently buildable Worker application that supervises feature-owned continuous loop adapters, publishes safe liveness/readiness, and drains safely. Add one strict finite proposal-expiry command; preserve every feature's PostgreSQL claim, lease, fence, CAS, lock, and idempotency behavior.

## Boundaries & Constraints

**Always:** Treat the supplied Story 12.1 as the authoritative contract. The Worker is an adapter-only runtime with no table mutations, authorization policy, artificial acknowledgements, or in-memory job coordination. Its import graph must not include root Next.js, Auth.js, `server-only`, `src/app`, or `"use server"` code. Continuous adapters are extraction, canonical ingestion, indexing, and AI Ask outbox only; proposal expiry is `--once` only. Liveness is process-only. Readiness fails closed until configuration, PostgreSQL reachability, and all continuous adapters are ready; it must project only safe reasons. Draining makes readiness non-ready before aborting admission and lets feature protocols finish or recover through their persisted mechanism. Keep Worker, web, API, and migration Docker targets separately selectable and non-root.

**Block If:** A required feature-owned loop cannot be invoked through an extracted Worker-safe boundary without changing its durable protocol or importing forbidden root application code; an existing concurrent user change conflicts with required files.

**Never:** Run Facebook/YouTube capture, source retention, or provenance withdrawal as Worker loops. Do not create a scheduler, new queue/event platform, generic in-memory release/claim mechanism, or a second continuous owner for a configured loop. Do not claim Story 12.2 compatibility/telemetry proof or Epic 14 deployment evidence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Worker startup | Valid config, reachable PostgreSQL, all adapters initialize | Starts HTTP health surface; live is `200 { status: "ok" }`; ready becomes `200` only after every continuous adapter is poll-eligible | Startup/readiness stays non-ready on any failed precondition |
| Worker configuration or dependency failure | Invalid assigned config, unreachable DB, failed/uninitialized/stopped/draining adapter | `/health/live` remains 200 and `/health/ready` is 503 with safe reason only | Never include URL, secret, SQL, payload, provider, or user data |
| Worker drain | SIGTERM/SIGINT or controlled shutdown during polling | Readiness changes before new batch/claim admission stops; in-flight feature call completes or its durable stale/lease recovery remains possible | Close health server and exit after work settles or graceful deadline |
| Outbox supervision | Ready Worker, non-draining adapter | Repeats bounded `processAiAskDomainOutboxBatch` calls only through its existing consumer seam | Stops starting new batch calls after drain |
| Proposal expiry CLI | `--once` and valid bounded options | Runs exactly `runTripChangeProposalExpiryWorkerLoop({ once: true })` and returns meaningful status | Reject unknown, duplicate, missing, or unsafe arguments without starting work |

</intent-contract>

## Code Map

- `apps/worker/` -- new independent Worker workspace, build, runtime bootstrap, HTTP health, configuration, adapter lifecycle, and finite expiry CLI.
- `packages/` -- extracted worker-safe feature invocation boundary, if required to keep the Worker import graph independent from root Next application code.
- `src/features/knowledge/extraction-jobs.ts` -- feature-owned extraction loop/protocol to preserve behind the Worker adapter.
- `src/features/knowledge/ingestion-worker.ts` -- feature-owned lease/fence ingestion loop to preserve behind the Worker adapter.
- `src/features/knowledge/indexing-worker.ts` -- feature-owned bounded projection/backfill loop to preserve behind the Worker adapter.
- `src/features/ai/domain-outbox-worker.ts` -- bounded outbox batch seam to supervise without changing delivery behavior.
- `src/features/chat-trips/trip-proposal-expiry-worker.ts` -- existing finite expiry seam for the explicit CLI only.
- `package.json`, `Dockerfile`, `compose.yaml`, `.env.example`, `README.md` -- commands, independently selectable image topology, Worker readiness probe, and operator documentation.
- `tests/*worker*`, `tests/domain-outbox.test.ts`, `tests/trip-proposal-expiry-worker.test.ts` -- focused runtime, CLI, health, drain, bounded-operation, and retained protocol regression coverage.

## Tasks & Acceptance

**Execution:**
- [ ] `apps/worker/` and minimal extracted package seams -- build an independently startable Worker with a verified forbidden-import-safe dependency graph; register extraction, ingestion, indexing, and bounded outbox adapters without relocating feature state machines.
- [ ] `apps/worker/src/runtime*` -- validate bounded configuration, track adapter initialization/readiness/in-flight/drain state, probe PostgreSQL, expose exact health endpoints, and coordinate signal/deadline shutdown without releasing or acknowledging feature work.
- [ ] `apps/worker/src/proposal-expiry-cli*` and root scripts -- add strict argument parsing and an explicit finite expiry command that maps the existing loop result to a meaningful status; retain operator-only commands unchanged.
- [ ] `package.json`, `Dockerfile`, `compose.yaml`, `.env.example`, `README.md` -- provide Worker and sweep commands, one Worker service with HTTP readiness, non-root Worker image/health port, migrated lifecycle guidance, migration ordering, and intentional legacy-adapter status.
- [ ] `tests/worker-*.test.ts` -- prove config/registry and CLI validation, live-versus-ready transitions, safe probe projection, drain/no-new-admission/in-flight settlement, and bounded outbox/expiry invocation; retain the five specified feature protocol suites.
- [ ] Story record and sprint status -- update checked tasks, Dev Agent Record, review outcome, File List, and only `12-1-bootstrap-the-dedicated-worker-and-bounded-sweep-runtime` to `done` after all review/verification gates pass.

**Acceptance Criteria:**
- Given continuous work or a maintenance sweep is configured, when it runs, then extraction, ingestion, indexing, and AI Ask outbox run only under the dedicated Worker and proposal expiry runs only as an explicit bounded `--once` command, while all feature-owned PostgreSQL safety protocols remain unchanged.
- Given Worker startup, dependency failure, initialized operation, or drain, when health is queried or shutdown begins, then liveness is process-only, readiness reflects valid config/database/all-loop eligibility without sensitive output, and drain stops new claims before safe persisted-protocol completion/recovery and orderly exit.

## Spec Change Log

## Review Triage Log

### 2026-07-31 - Review passes
- intent_gap: 0
- bad_spec: 0
- patch: 7 (high 4, medium 3)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Preserved process-only liveness for invalid configuration, repaired child drain/deadline handling, strict adapter CLIs, database reprobe/readiness, and Docker workspace manifest staging.
  - `[high] [patch]` Extracted the narrow Worker-domain closure and proved its source and compiled adapters exclude root `src`, Next.js, Auth.js, `server-only`, `src/app`, and server-action code.
  - `[high] [patch]` Added compiled ingestion/outbox success, drain/no-new-claim, and persisted stale-lease recovery coverage; extraction failure transitions now fence on both lock owner and timestamp.
  - `[medium] [patch]` Repaired container health binding, repeat-signal draining, workspace-start adapter paths, Docker workspace manifest staging, strict CLI documentation, and bounded expiry CLI integration coverage.

## Auto Run Result

**Status:** done

**Summary:** Completed the dedicated Worker supervisor, Worker-safe extracted domain boundary, bounded expiry CLI, one-Worker Compose topology, Docker target, and lifecycle proof. All compiled adapters are free of forbidden root application, Next.js, Auth.js, and `server-only` dependencies.

**Verification:** Serial focused Worker and retained protocol suites passed (`8` files, `89` tests). `pnpm typecheck`, `pnpm build`, `git diff --check`, `docker compose config`, and `docker build --target worker -t xuyenviet-worker-story-12-1-review .` passed. `pnpm lint` passed with zero errors and five pre-existing unrelated warnings. Compiled adapters successfully processed persisted ingestion and outbox work; drain prevented a later claim and the interrupted ingestion lease recovered through its persisted protocol. The bounded expiry CLI processed and idempotently re-ran persisted expiry work.

## Design Notes

The current loops are rooted in `src/features/*`, with several direct `server-only` imports. The Worker must not solve that by importing those files from `apps/worker`; create the narrowest extracted invocation boundary that keeps feature logic and its durable concurrency behavior intact. The runtime supervises named adapters and only stops future adapter/batch admission on drain. It never assumes every feature has the same lease or fencing model.

## Verification

**Commands:**
- `pnpm vitest run tests/worker-*.test.ts tests/knowledge-extraction-worker.test.ts tests/knowledge-ingestion-jobs.test.ts tests/knowledge-indexing-worker.test.ts tests/domain-outbox.test.ts tests/trip-proposal-expiry-worker.test.ts` -- expected: Worker lifecycle and all retained protocol suites pass.
- `pnpm typecheck` -- expected: strict type checking passes for root, API, and Worker workspaces.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm build` -- expected: root, API, and Worker artifacts build independently.
- `git diff --check` -- expected: no whitespace errors.
