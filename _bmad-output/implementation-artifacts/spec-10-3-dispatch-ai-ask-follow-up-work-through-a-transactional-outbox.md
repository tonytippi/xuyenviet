---
title: 'Story 10.3: Dispatch AI Ask Follow-Up Work Through a Transactional Outbox'
type: 'feature'
created: '2026-07-29'
status: 'done'
baseline_revision: '15d91b0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/10-3-dispatch-ai-ask-follow-up-work-through-a-transactional-outbox.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** AI Ask currently runs context extraction, annotation enrichment, and proposal drafting from the request lifetime. A worker interruption can silently lose those required follow-up commitments or let them alter an already completed terminal projection.

**Approach:** Persist AI-owned, versioned follow-up events in the command admission/finalization transactions, then deliver them through a bounded PostgreSQL lease/fencing worker. Consumers reload and fence authoritative feature state and record their effect, durable idempotency guard, and acknowledgement atomically.

## Boundaries & Constraints

**Always:** PostgreSQL/Drizzle own the queue. `domain_outbox` is AI Orchestration-owned and supports only the three v1 events and allow-listed 4096-byte ID/fence payload. Deterministic dedupe never resets existing state. Claims use short `FOR UPDATE SKIP LOCKED` transactions, new fencing tokens, active-lease CAS, bounded retries, safe codes, and no locks around provider calls. Every domain write is revalidated for owner, command, membership, captured lifecycle/aggregate fences, and matching active claim. Enqueue is in the originating transaction after its required durable state. Preserve Story 10.2 lock order: project, conversation, command, then outbox. Terminal AI Ask answer/provenance/usage/projection never changes because of consumer delivery.

**Block If:** Existing owner feature APIs cannot be given a narrow transaction-aware internal seam that preserves their aggregate ownership and permits guarded idempotent delivery.

**Never:** Do not use `after`, fire-and-forget work, an external queue, in-memory idempotency, a generic job package, browser enqueue/replay, a deployment worker/Cron/health endpoint, direct cross-feature table mutations, raw provider/error data in rows/logs, or a dead-letter replay bypass. Do not add Story 10.4 read models or Story 10.5 transport changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admission | New durable user turn | One context event committed with command transaction | Enqueue error rolls back user turn and command update |
| Finalization | Matching fence, assistant/provenance, optional project | One annotation event and one project proposal event when selected | Enqueue error rolls back final completion; stale discard queues none |
| Competing workers | Same due event / expired lease | Disjoint claim or fresh reclaim token; only current active token can mutate/acknowledge | Old claimant is a no-op |
| Consumer re-delivery | Effect transaction committed before acknowledgement observed | Durable effect guard suppresses duplicate context/annotations/proposal/usage/audit | Current claim may safely acknowledge only |
| Deleted or fenced state | Command/resource missing, scrubbed, relinked, or stale | No domain effect; event is safely terminalized/acknowledged | No retry loop or sensitive diagnostics |
| Transient failure | Provider/database transient failure | Matching claim is released with capped exponential backoff | Exhaustion records safe `retry_exhausted` failure and alertable safe log |

</intent-contract>

## Code Map

- `src/db/schema.ts` and `drizzle/migrations/0011_*` -- AI-owned outbox/effect tables, constraints, indexes, and cascade deletion contract.
- `src/features/ai/domain-outbox.ts` -- event envelope validation, deterministic enqueue, and SQL claim/CAS primitives.
- `src/features/ai/domain-outbox-worker.ts` -- bounded library worker and discriminated consumers.
- `src/features/ai/ai-ask-commands.ts` -- transaction-local enqueue after admitted user turn and successful fenced finalization.
- `src/app/api/ai-ask/stream/route.ts` -- retain ordered terminal stream while removing request-lifetime follow-up execution and projection patches.
- `src/features/chat-trips/context-extraction.ts` -- internal event-driven, fence-checked context result boundary.
- `src/features/chat-trips/trip-change-proposals.ts` and `src/features/ai/trip-proposal-draft.ts` -- internal durable event proposal persistence seam with aggregate and event-idempotency protection.
- `tests/domain-outbox.test.ts`, `tests/ai-ask-commands.test.ts`, `tests/ai-ask-shell.test.ts` -- protocol, atomicity, concurrency, and route regressions.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/0011_*` -- add constrained AI outbox/effect persistence, deterministic dedupe, queue indexes, and cascading operational deletion -- make durable dispatch safe and migration-backed.
- [x] `src/features/ai/domain-outbox.ts` -- parse exact v1 envelopes and enqueue within a supplied transaction using conflict readback -- prevent unsafe/duplicate event publication.
- [x] `src/features/ai/ai-ask-commands.ts` -- enqueue context after user-turn state and annotation/proposal after matching fenced persistence -- make source transactions all-or-nothing.
- [x] `src/features/ai/domain-outbox-worker.ts` and owner feature seams -- claim with lease/fence CAS, invoke event consumers outside locks, revalidate before guarded writes, retry safely -- deliver exactly-once durable effects under re-delivery.
- [x] `src/app/api/ai-ask/stream/route.ts` -- remove `after`, inline enrichment/proposal, and terminal-result mutation -- preserve immediate stable fenced `done` behavior.
- [x] `tests/domain-outbox.test.ts`, targeted existing suites -- prove schema, rollback, event validation, real multi-connection locking, stale-worker rejection, consumers, route, and deletion behavior -- protect every acceptance path.
- [x] Story and sprint artifacts -- mark task/AC/review evidence and only target 10.3 done after approved review and verification -- keep BMAD state authoritative.

**Acceptance Criteria:**
- Given an originating command commits follow-up work, when it enqueues an allowed v1 event, then the same transaction persists the safe constrained outbox row and duplicate deterministic dispatch is harmless.
- Given workers compete, retry, expire, or redeliver work, when they claim and process events, then active lease/fence CAS and durable effects permit only one safe domain result and bounded failures are operationally safe.
- Given AI Ask admission or matching-fence finalization completes, when follow-up work is committed, then it is enqueued at the specified durable boundary and the route neither runs nor exposes follow-up work.

## Spec Change Log

## Review Triage Log

### 2026-07-29 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7 (high 4, medium 3)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Terminalized invalid/unsupported/mismatched envelope claims through matching CAS and added payload-column mirror validation, preventing stranded processing rows.
  - `[high]` `[patch]` Reordered consumer locks and revalidated project/provenance fences before guarded domain writes.
  - `[high]` `[patch]` Moved proposal usage into guarded effect/acknowledgement transactions so retries cannot duplicate usage and success is attributed.
  - `[medium]` `[patch]` Added the required `0011` Drizzle snapshot and extended focused protocol regressions.

### 2026-07-29 — Final review passes
- intent_gap: 0
- bad_spec: 0
- patch: 18 (high 11, medium 7)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Hardened claim freshness, lock ordering, payload mirrors, exhaustion, and active-claim capability before provider work.
  - `[high]` `[patch]` Made context, annotation, and proposal effects/usage/audit idempotent and transaction-coupled, including transient and nonretryable provider outcomes.
  - `[medium]` `[patch]` Completed deletion FK/scrub contracts, current migration metadata, consumer redelivery coverage, and serial test-matrix evidence.

## Auto Run Result

- Status: done
- Summary: Implemented the AI Ask PostgreSQL transactional outbox, its transaction-local enqueue boundaries, bounded fencing worker, feature-owned consumers, deletion contract, and route callback removal.
- Review: Final synchronous adversarial, edge-case, and acceptance layers reported no actionable findings after bounded repairs.
- Verification: Serial focused suites passed 54 + 196 + 171 tests; typecheck, build, and diff check passed. Lint had 0 errors and 5 pre-existing warnings.
- Residual risk: Story 12 still owns deployed worker scheduling, readiness, telemetry routing, and rollout compatibility.

## Design Notes

Use `domain_outbox_effects` as the smallest AI-owned result guard instead of coupling three feature aggregates to an outbox column. The result transaction inserts that guard only with the owner effect and conditional outbox acknowledgement; a duplicate guard means the durable effect already exists. Operational rows cascade on direct conversation/project/user deletion, while Story 10.2 retains its independently scrubbed command. A worker that loses its row through cascade cannot pass its active-claim predicate.

## Verification

**Commands:**
- `pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-sessions.test.ts` -- expected: migration-backed outbox and command atomicity pass.
- `pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts tests/trip-change-proposals.test.ts tests/trip-proposal-expiry-worker.test.ts` -- expected: owner-feature regressions pass.
- `pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/ai-ask-shell.test.ts tests/bff-transport.test.ts tests/api-platform-contract.test.ts tests/api-request-principal.integration.test.ts` -- expected: route and transport regression suite passes.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm lint` -- expected: no new errors.
- `pnpm build` -- expected: production build passes.
