# Story 10.3: Dispatch AI Ask Follow-Up Work Through a Transactional Outbox

Status: done

## Story

As a traveler,
I want post-answer planning work to complete reliably after my answer is saved,
so that temporary worker interruption cannot silently lose context extraction, annotations, or proposal drafting.

## Acceptance Criteria

1. **Given** an originating command commits durable follow-up work, **when** it writes `domain_outbox`, **then** the same transaction stores versioned event type, aggregate/resource ID, expected owner fence, deterministic dedupe key, safe bounded payload, status, attempts, availability time, lease/fencing state, and safe terminal failure code, **and** duplicate dispatch for the originating command is harmless by the unique dedupe key.
2. **Given** a worker claims pending outbox work, **when** it processes an event, **then** it uses `FOR UPDATE SKIP LOCKED`, lease expiry, fencing token, expected version, and compare-and-swap acknowledgement, **and** it validates the expected owner fence before every write, retries with bounded exponential backoff, and records an alertable safe terminal failure after exhaustion.
3. **Given** an AI Ask user turn, terminal answer, or terminal answer for a Trip Project persists, **when** durable work is enqueued, **then** context extraction is enqueued only after user-turn persistence, annotation enrichment only after terminal assistant/provenance persistence, and proposal drafting only after terminal assistant persistence, **and** no `after()` callback, fire-and-forget promise, or dead-letter replay bypasses the owning domain command.

## Tasks / Subtasks

- [x] Define the AI Orchestration-owned transactional outbox schema and event envelope (AC: 1-3)
  - [x] Add `domain_outbox` and its exported value/status types to `src/db/schema.ts`; generate forward-only Drizzle migration `0011_*` and journal/snapshot from the current `0010` baseline. PostgreSQL and Drizzle remain the only product/job data-plane and schema owners.
  - [x] Store `id`, `originating_command_id`, `event_type`, `event_version`, `aggregate_type`, `aggregate_id`, owner `user_id`, optional conversation/project/message resource identifiers, captured conversation lifecycle/project aggregate fences, deterministic `dedupe_key`, bounded JSON `payload`, status, `attempt_count`, `max_attempts`, `available_at`, claim worker/timestamps/lease expiry/fencing token, safe `last_error_code`, safe terminal `failure_code`, terminal/completion timestamps, and audit-safe timestamps.
  - [x] Define only these v1 events: `ai_ask.context_extraction.v1`, `ai_ask.answer_annotation.v1`, and `ai_ask.trip_proposal_draft.v1`. The aggregate is `ai_ask_command`; `aggregate_id` is the immutable command ID. Do not make Chat/Trips, Usage, Retrieval, or a generic queue package own this table.
  - [x] Enforce deterministic unique dedupe keys, a safe exact payload mirror, allowed states/claim shapes, bounded attempts, due/lease indexes, and safe terminal codes.
- [x] Add one AI-owned enqueue port and place enqueues in the existing Story 10.2 durable transactions (AC: 1, 3)
  - [x] Add transaction-aware deterministic enqueue with conflict readback; admission enqueues context after its user turn and fenced finalization enqueues annotation plus selected-project proposal atomically.
  - [x] Preserve terminal/discard/replay behavior: no follow-up is emitted from failed, aborted, stale, browser, retry, replay, or deletion paths.
- [x] Replace all current non-durable AI Ask follow-up paths with outbox consumers (AC: 2-3)
  - [x] Remove route callbacks and inline follow-up work; `done` remains the immediate stable fenced projection with no consumer result.
  - [x] Add a bounded library worker and discriminated consumers that reload owner-scoped data, call feature-owned context, annotation, and proposal APIs, revalidate before provider and result work, and use `domain_outbox_effects` for idempotent effect/usage/audit/acknowledgement.
  - [x] Claim bounded due/reclaimed batches with deterministic `FOR UPDATE SKIP LOCKED` order, leases, fresh tokens, strict configuration, current database time, event-version CAS, bounded retry/backoff, safe exhaustion logs, and safe fenced/invalid dispositions.
  - [x] Lock project, conversation, command, then outbox for durable results; cascade operational rows on deletion while trigger-scrubbing retained commands and fail closed on every owner/resource/fence mismatch without changing completed projections.
  - [x] Add migration-backed envelope/schema/dedupe/rollback/deletion/retry/exhaustion tests, independent-connection `SKIP LOCKED` contention and stale-token proof, consumer delivery/redelivery/fence/provider tests, and route/shell no-callback regressions.
  - [x] Run the serial focused suites, typecheck, lint, build, and whitespace validation; actual results are recorded below.

## Dev Notes

### Architecture and Ownership

- AD-34 is authoritative: the originating transaction, not a callback, writes the versioned outbox event. PostgreSQL is the queue and durable handoff; no external queue, generic job framework, or in-memory scheduler is permitted.
- AD-16 and completed Story 10.2 are non-negotiable: command admission captures conversation/project fences; final assistant/provenance/usage/source-bundle/command completion happen atomically only on matching fences; deletion retains a scrubbed `discarded` command. Outbox insertion is part of those exact transactions and must not reopen, weaken, or separately terminalize a command.
- AI Orchestration owns `domain_outbox`, enqueue/claim/retry protocol, and event dispatch. Chat/Trips owns conversation, context, Trip Project, and proposal mutations. Retrieval owns provenance/source bundle persistence. Usage owns usage-event persistence. Call their narrow transaction-aware entrypoints rather than importing another feature's tables to mutate its aggregate.
- Follow-ups are optional to the traveler-visible completed answer but mandatory durable dispatch commitments. A worker failure is operational state only and cannot retroactively modify the completed command or `done` event.

### Current Code and Required Changes

| File | Current behavior to preserve | Story 10.3 change |
| --- | --- | --- |
| `src/app/api/ai-ask/stream/route.ts` | Sole legacy writer; validates multipart input, streams ordered NDJSON, calls fenced finalization, and publishes the authoritative retained terminal result. | Remove `next/server` `after()`, inline annotation persistence, proposal drafting, and command terminal-result patching for follow-up output. Keep request validation, provider/abort handling, fenced finalization, and exactly-one terminal event. |
| `src/features/ai/ai-ask-commands.ts` | `acquireAiAskCommand` creates the fenced command/user turn; `finalizeAiAskCommand` locks Project -> conversation -> command and atomically persists final assistant state or `discarded`. | Call the transaction-aware enqueue port after the corresponding durable state exists, in the same transaction. Do not change replay, retained deletion, command identity, or fence semantics. |
| `src/features/chat-trips/context-extraction.ts` | Rechecks owner/conversation/source message before provider work, calls provider, writes usage, then inserts context/audit. | Refactor only as needed to accept an internal durable-event input and to recheck lifecycle/project fences plus the matching claim/idempotency state before every durable write. Keep existing sensitive-data filtering and feature ownership. |
| `src/features/ai/answer-annotations.ts` | Builds and validates annotation proposals against final text/provenance. | Reuse validation/sanitization from an outbox consumer; do not alter its persisted descriptor contract or let model output bypass validation. |
| `src/features/ai/trip-proposal-draft.ts` and `src/features/chat-trips/trip-change-proposals.ts` | Draft reads the current owned aggregate; Chat/Trips persists only a validated proposal against expected aggregate version. | Invoke through the proposal consumer with durable event identity/fences. Preserve aggregate-version validation and no direct AI writes to Chat/Trips tables. |
| `src/features/knowledge/ingestion-jobs.ts` | Established PostgreSQL lease/fencing/claim/CAS patterns. | Reuse its correctness pattern, not its ingestion schema or stage state machine. |
| `src/features/chat-trips/trip-proposal-expiry-worker.ts` | Library-only bounded worker, short `SKIP LOCKED` transaction, signal-aware loop. | Follow the bounded library-worker shape only; this story requires stronger lease/fencing/CAS because delivery is not inherently idempotent. |
| `src/db/schema.ts`, `drizzle/migrations/meta/_journal.json`, latest snapshot | Drizzle owns schema; `0010` is the latest migration and command rows are scrubbed before conversation/project deletion. | Add the outbox declaration and next forward-only migration/metadata; preserve all existing constraints/triggers. |

### Event Contract

| Event | Originating transaction and enqueue point | Required payload/resource fields | Consumer result boundary |
| --- | --- | --- | --- |
| `ai_ask.context_extraction.v1` | `acquireAiAskCommand`, after user message and command references persist | command/user/conversation/user-message IDs; optional project ID; captured conversation fence; optional project fence | One matching-claim transaction writes deduplicated context facts and associated usage/audit, after current owner/fence/source-message recheck. |
| `ai_ask.answer_annotation.v1` | matching-fence `finalizeAiAskCommand`, after assistant, source bundle, provenance, success usage, and completed command state persist | command/user/conversation/user-message/assistant IDs; captured fences | One matching-claim transaction updates only valid annotations for the unchanged assistant after provenance/owner/fence recheck. |
| `ai_ask.trip_proposal_draft.v1` | matching-fence `finalizeAiAskCommand`, after assistant persistence; selected Trip Project only | command/user/conversation/user-message/assistant/project IDs; both captured fences | Chat/Trips proposal persistence validates the current aggregate and a durable event dedupe guard in the same result transaction. |

### Operational Guardrails

- Claim transactions are short. Provider calls run outside row locks and all durable writes use a fresh owner/fence/claim comparison. Never extend a lease implicitly or acknowledge after it expires.
- Logs, metrics, terminal codes, and outbox payloads are operationally safe: IDs, event type/version, counts, timestamps, attempts, and bounded codes only. Do not log questions, answer text, prompts, images, source material, provider response/error body, SQL, credentials, cookies, or terminal browser payloads.
- The worker loop may return a typed `processed | no_work | stopped | error` operational result and may be signal-aware, but Story 12 exclusively owns a deployed dedicated runtime, readiness/schema admission, graceful shutdown proof, scheduler/Cron configuration, health checks, telemetry dashboards, alert routing, and rollout operations.
- Migration rollout is forward-only. Before overlapping runtimes or production traffic are considered, stop for AD-33/Story 12.3 compatibility planning. Roll back code/traffic, not a durable outbox schema destructively; do not claim deployment readiness in this story.
- There is no MVP dead-letter replay endpoint, admin button, raw SQL runbook that bypasses the command, or automatic redrive of `failed` rows. Alertable safe terminal failure is the exhaustion boundary.

### Scope Boundaries

- **In scope:** schema/event envelope; deterministic enqueue; transactional placement after Story 10.2 fences; bounded worker library/claims/leases/fencing/CAS/retries/exhaustion; event consumers and their mandatory deletion/fence/idempotency checks; deleting `after()`/fire-and-forget follow-ups; migration-backed concurrency/rollback proof.
- **Story 10.4 only:** traveler-facing consumer pending/failed read models and their presentation; the broader completed-result preservation/read contract. This story preserves the invariant but does not add command/result status fields, browser payloads, or UI for consumer progress/failure.
- **Story 10.5 only:** Nest `POST /v1/ai-ask/stream`, BFF forwarding, credential/CSRF/API transport handling, byte-compatible API cutover, and retirement of the legacy Next route writer. This story keeps that route as sole writer and removes only its non-durable follow-up execution.
- **Epic 11 only:** `TripAnswerContext v1`, source-bundle evolution, provenance withdrawal, and annotation contract evolution. Use current contracts; do not introduce their future data models.
- **Epic 12 only:** dedicated worker process deployment, operational telemetry/readiness/health/shutdown, Cron/scheduling, schema compatibility admission, and production rollout/rollback evidence.

### Testing Plan

Use `DATABASE_URL_TEST` and existing Vitest conventions. The shared serial connection cannot establish lock contention; concurrency cases must use separate PostgreSQL connections and explicit barriers/held transactions.

```bash
pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-sessions.test.ts
pnpm vitest run tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts tests/trip-change-proposals.test.ts tests/trip-proposal-expiry-worker.test.ts
pnpm vitest run tests/ai-ask-shell.test.ts tests/bff-transport.test.ts tests/api-platform-contract.test.ts tests/api-request-principal.integration.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

Required proof includes:

- schema check/foreign-key/deletion behavior, migration generation/application, safe payload bounds, all event variants, and deterministic dedupe;
- admission/finalization rollback with enqueue failure; stale fence/discard creates no event; same-key replay and duplicate finalization create no duplicate event;
- real `SKIP LOCKED` contention, lease expiry/new token, stale worker CAS rejection, retry schedule cap/jitter bounds, and terminal exhaustion alert-safe outcome;
- every consumer's before-provider and before-write owner/deletion/fence checks; duplicate delivery/crash recovery produces no duplicate durable effect; completed AI Ask state remains byte-for-byte/safely unchanged;
- route source/behavior regression proving `after()` and fire-and-forget follow-up work are gone while NDJSON ordering and terminal projection remain intact.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 10.3: Dispatch AI Ask Follow-Up Work Through a Transactional Outbox`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-16: Nest Owns Source-Bundled NDJSON AI Ask Streaming`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-34: Durable Work Uses A PostgreSQL Transactional Outbox`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/10-1-make-ai-ask-commands-idempotent.md`]
- [Source: `_bmad-output/implementation-artifacts/10-2-fence-terminal-ai-ask-persistence.md`]
- [Source: `src/app/api/ai-ask/stream/route.ts`]
- [Source: `src/features/ai/ai-ask-commands.ts`]
- [Source: `src/features/chat-trips/context-extraction.ts`]
- [Source: `src/features/ai/answer-annotations.ts`]
- [Source: `src/features/ai/trip-proposal-draft.ts`]
- [Source: `src/features/chat-trips/trip-change-proposals.ts`]
- [Source: `src/features/knowledge/ingestion-jobs.ts`]
- [Source: `src/features/chat-trips/trip-proposal-expiry-worker.ts`]

## Story Validation

### BMad Checklist Validation

- [x] Story/user value and all three authoritative acceptance criteria are reproduced and traceable to implementation tasks.
- [x] AD-16/Story 10.2 fence, lock-order, retained-command deletion, atomic-finalization, safe terminal projection, and NDJSON constraints are explicit.
- [x] AD-34 outbox requirements are concrete: schema, v1 event envelope, deterministic dedupe, payload limits, claim SQL semantics, leases, fencing tokens, CAS acknowledgement, bounded backoff, exhaustion, and safe alerts.
- [x] Existing implementation files and established knowledge/Trip Proposal worker patterns are identified with what to preserve and change.
- [x] Extraction, annotation, and proposal consumers each have source ownership, event timing, idempotency, deletion/fence checks before provider work and before durable writes, and result transaction requirements.
- [x] Explicit no-`after()`/no-fire-and-forget removal and regression proof are included.
- [x] Real multi-connection concurrency, rollback/atomicity, duplicate delivery, lease recovery, deletion, stale fence, migration, and operational safety tests are specified.
- [x] Scope is fenced against Story 10.4 read models, Story 10.5 transport cutover, Epic 11 contracts, and Epic 12 runtime operations.
- [x] No production code, migration, test execution, implementation, or deployment is claimed by this story-creation artifact.

### Unresolved Decisions / Blockers

1. **Consumer idempotency storage location:** the completed schema has no consumer-result/dedupe column or table. During implementation, choose the smallest owner-owned durable guard (for example an outbox-event reference/unique constraint on each resulting owner write) before migration generation. It must prove crash-after-write-before-ack delivery safety without prematurely creating Story 10.4 traveler read models.
2. **Deletion disposition for operational rows:** decide and document whether direct conversation/project deletion terminalizes/scrubs retained outbox rows or cascades them. Either choice must preserve the existing `0010` command scrub guarantee, retain no content-bearing payload, make an in-flight consumer harmless through fence/CAS checks, and receive direct-FK regression coverage.
3. **Worker invocation seam:** this story may expose a bounded library loop for test/local invocation but cannot declare production scheduling or deployment. The actual dedicated runtime, readiness admission, supervision, and alert delivery remain Epic 12 work.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Completion Notes List

- Comprehensive implementation-ready Story 10.3 artifact created from the authoritative Epic 10 acceptance criteria, AD-16, AD-34, project context, completed Stories 10.1/10.2, and current AI Ask/worker code.
- Implemented AI Orchestration-owned `domain_outbox` and `domain_outbox_effects`, deterministic safe envelopes, transactional enqueue, bounded PostgreSQL claim/lease/fencing/CAS/retry protocol, and forward-only migrations `0011` through `0014` with current Drizzle metadata.
- Removed route-lifetime extraction, annotation, proposal drafting, terminal-result patching, and detached follow-up execution. The route now emits only the fenced durable terminal projection.
- Added owner-feature outbox consumers with pre-provider and result-time fence validation, atomic durable effect/usage/audit/acknowledgement, safe fenced-out behavior, deletion cascades, and retained-command scrub repairs for direct message/project deletion.
- Final synchronous Blind Hunter, Edge Case Hunter, and Acceptance Auditor review layers reported no actionable implementation findings.
- Verification passed serially: command/outbox/session suite (54 tests), context/proposal/worker suite (196 tests), route/transport suite (171 tests), `pnpm typecheck`, `pnpm build`, and `git diff --check`. `pnpm lint` had 0 errors and 5 pre-existing warnings.

### File List

- `_bmad-output/implementation-artifacts/10-3-dispatch-ai-ask-follow-up-work-through-a-transactional-outbox.md`
- `_bmad-output/implementation-artifacts/spec-10-3-dispatch-ai-ask-follow-up-work-through-a-transactional-outbox.md`
- `drizzle/migrations/0011_ai_ask_domain_outbox.sql`
- `drizzle/migrations/0012_require_domain_outbox_failure_code.sql`
- `drizzle/migrations/0013_scrub_retained_ai_ask_commands_on_message_delete.sql`
- `drizzle/migrations/0014_preserve_conversation_owner_on_project_delete.sql`
- `src/features/ai/domain-outbox.ts`
- `src/features/ai/domain-outbox-worker.ts`
- `tests/domain-outbox.test.ts`
