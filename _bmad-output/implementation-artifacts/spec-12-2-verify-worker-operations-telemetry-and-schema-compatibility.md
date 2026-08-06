---
title: 'Verify Worker Operations, Telemetry, and Schema Compatibility'
type: 'feature'
created: '2026-07-31'
status: 'in-review'
baseline_revision: 'a66bfa4'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/12-2-verify-worker-operations-telemetry-and-schema-compatibility.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-12-context.md'
warnings: [oversized]
---

> **Superseded on 2026-08-05.** The schema compatibility admission, release ledger, and runtime policy described below were removed. See `ARCHITECTURE-SPINE.md` AD-3 for the active forward-migration and runtime-readiness contract.

<intent-contract>

## Intent

**Problem:** API schema admission uses an API-only exact-version comparison, while the Web and Worker workloads can become healthy or claim work without deployed-schema compatibility. Cross-runtime operational telemetry lacks a safe shared contract, and Worker lifecycle failures can leak raw errors.

**Approach:** Add a dependency-free compatibility, correlation, and safe telemetry contract that every deployable workload consumes; gate API/Web readiness and Worker admission on its declared inclusive range; observe existing durable-work outcomes without changing their protocols; and document repository-operable cutover proof.

## Boundaries & Constraints

**Always:** Treat the supplied Story 12.2 as authoritative. Keep `release_schema_versions` as the sole deployed-version authority and preserve the migration advisory lock and record-after-success flow. Parse only real UTC `YYYYMMDD.N` dates with numeric tuple comparison. Worker code must remain free of root `src`, Next.js, Auth.js, and `server-only` dependencies. Preserve liveness, safe health envelopes, all durable claim/lease/fence/CAS/retry/idempotency behavior, Worker ownership, BFF request-ID forwarding, and byte-compatible AI Ask output. Telemetry must validate its allowlist and never affect operation outcome when the sink fails.

**Block If:** A required shared contract cannot remain dependency-free and workspace-safe, or an existing concurrent edit conflicts with a required story file.

**Never:** Infer schema state from migrations/configuration; disclose schema versions, secrets, SQL, provider payloads, prompts, answers, raw sources, or credentials; create an admin app, migration, queue, telemetry backend, event persistence, async correlation column, release/acknowledgement path, external monitoring claim, or legacy-loop retirement assertion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Schema evaluation | Valid declared inclusive range and one canonical deployed record | Workload is compatible only when numeric date/revision tuple is in range | Unknown workload, invalid/inverted declaration, malformed/zero/multiple record, and out-of-range state fail closed |
| Request workload health | API or Web is schema-incompatible | Liveness remains process-only; readiness/traffic eligibility stays false with existing safe surface | Never reveal version or database details |
| Worker compatibility loss | Worker sees an incompatible probe before or after loop initialization | No adapter admission before compatibility; later loss stops future admissions and reports `schema_incompatible` | Existing in-flight work follows drain/lease recovery, with no fabricated acknowledgement |
| Telemetry | Request/provider or Worker lifecycle/poll emits a valid event | Validated correlation, safe fields, bounded metrics, and allowed durable linkage reach the sink | Invalid events and sink failures do not leak data or affect domain/API results |

</intent-contract>

## Code Map

- `packages/contracts/src/index.ts` -- dependency-free schema compatibility, correlation, and telemetry contracts shared by all runtimes.
- `packages/database/src/index.ts` -- authoritative release-version read/record repository and compatibility evaluation seam.
- `apps/api/src/release-schema.ts`, `apps/api/src/health/`, `apps/api/src/auth/` -- API declared-range readiness and traffic admission.
- `scripts/migrate-api-schema.ts` -- migration workload declaration while retaining advisory-lock and success-only recording flow.
- `apps/worker/src/runtime.ts`, `apps/worker/src/adapters.ts` -- compatibility-gated Worker lifecycle/admission and safe operational events.
- `packages/worker-domain/src/` -- additive poll outcome observation across the four existing feature-owned protocols.
- `src/app/api/health/route.ts`, `src/server/correlation-id.ts` -- Web compatibility health boundary and thin server-safe correlation adapter.
- `packages/database/src/ai-ask-stream-execution.ts` -- synchronous correlation-preserving provider telemetry seam.
- `tests/*` -- contract, API/Web/Worker, telemetry, correlation, and retained PostgreSQL protocol evidence.
- `docs/runbooks/worker-operations.md`, `README.md`, `.env.example` -- safe operational invocation, dashboard definitions, evidence and ownership limits.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/contracts/src/index.ts` and workspace consumers -- add canonical parsed version/range declarations for web, API, Worker, migration, and future admin; strict evaluator, neutral correlation helper, validated failure-isolated telemetry event/emitter contract.
- [ ] `packages/database/src/index.ts`, `apps/api/src/release-schema.ts`, and `scripts/migrate-api-schema.ts` -- replace exact API match with the shared range decision; detect zero/multiple/malformed release records; retain migration lock and record only after Drizzle success.
- [ ] `apps/api/src/*` and `src/app/api/health/route.ts` -- use the matching declaration at API and Web health/traffic gates while preserving each established safe response contract.
- [ ] `apps/worker/src/runtime.ts`, `apps/worker/src/adapters.ts`, and Worker-safe domain seams -- require compatible schema before every future admission; stop later admissions on loss; emit only safe lifecycle and bounded poll observations without changing feature protocols.
- [ ] `src/server/correlation-id.ts`, API request middleware, and `packages/database/src/ai-ask-stream-execution.ts` -- reuse neutral request-ID semantics and preserve synchronous BFF/API/provider lineage with safe provider telemetry.
- [ ] `tests/schema-compatibility.test.ts`, `tests/operational-telemetry.test.ts`, API/Web/Worker/correlation and retained protocol suites -- prove tuple edge cases, safe admission, compiled Worker behavior, real database protocol evidence, safe exact event objects, lineage, and sink-failure isolation.
- [ ] `docs/runbooks/worker-operations.md`, `README.md`, `.env.example` -- document health, telemetry, dashboard/query definitions, local evidence, operational actions, and the later deployed-evidence/retirement boundary.
- [ ] Story record and sprint status -- update task/record evidence and only the `12-2-verify-worker-operations-telemetry-and-schema-compatibility` entry after implementation, review, and verification pass.

**Acceptance Criteria:**
- Given any Web, API, Worker, admin-contract, or migration workload, when it reads the single recorded deployed version, then it is ready or admitted only inside its strict declared inclusive range; incompatible Workers claim no jobs and incompatible request workloads receive no traffic.
- Given retries, duplicate pollers, restart/drain, and lease recovery, when operations are observed, then valid safe telemetry includes the required correlation, capability, principal class, result, latency, lag/retry/recovery facts and durable linkage, while the runbook records repository proof and does not claim deployed retirement evidence.

## Spec Change Log

## Review Triage Log

## Design Notes

`@xuyenviet/contracts` is the only shared location because it has no root-app or runtime dependency. It owns pure parsing/validation and event contracts; database owns authoritative release-row retrieval; each runtime owns its own safe readiness projection and observation wiring.

## Verification

**Commands:**
- `DATABASE_URL_TEST=... pnpm test:run -- tests/schema-compatibility.test.ts tests/api-platform-contract.test.ts tests/web-health-schema-compatibility.test.ts tests/worker-runtime.test.ts tests/worker-adapter-boundary.test.ts tests/operational-telemetry.test.ts tests/ai-ask-stream-execution.test.ts tests/ai-ask-bff-api.integration.test.ts tests/bff-transport.test.ts tests/api-request-principal.integration.test.ts` -- expected: serial compatibility, telemetry, correlation, health, and real Worker boundary proof pass.
- `DATABASE_URL_TEST=... pnpm test:run -- tests/knowledge-extraction-worker.test.ts tests/knowledge-ingestion-jobs.test.ts tests/knowledge-indexing-worker.test.ts tests/domain-outbox.test.ts tests/trip-proposal-expiry-worker.test.ts` -- expected: retained durable protocols pass unchanged.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `docker compose config`, `docker build --target worker -t xuyenviet-worker .`, `git diff --check` -- expected: repository and Worker delivery checks pass.
