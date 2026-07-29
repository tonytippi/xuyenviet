# Story 10.3: Dispatch AI Ask Follow-Up Work Through a Transactional Outbox

Status: ready-for-dev

## Story

As a traveler,
I want post-answer planning work to complete reliably after my answer is saved,
so that temporary worker interruption cannot silently lose context extraction, annotations, or proposal drafting.

## Acceptance Criteria

1. **Given** an originating command commits durable follow-up work, **when** it writes `domain_outbox`, **then** the same transaction stores versioned event type, aggregate/resource ID, expected owner fence, deterministic dedupe key, safe bounded payload, status, attempts, availability time, lease/fencing state, and safe terminal failure code, **and** duplicate dispatch for the originating command is harmless by the unique dedupe key.
2. **Given** a worker claims pending outbox work, **when** it processes an event, **then** it uses `FOR UPDATE SKIP LOCKED`, lease expiry, fencing token, expected version, and compare-and-swap acknowledgement, **and** it validates the expected owner fence before every write, retries with bounded exponential backoff, and records an alertable safe terminal failure after exhaustion.
3. **Given** an AI Ask user turn, terminal answer, or terminal answer for a Trip Project persists, **when** durable work is enqueued, **then** context extraction is enqueued only after user-turn persistence, annotation enrichment only after terminal assistant/provenance persistence, and proposal drafting only after terminal assistant persistence, **and** no `after()` callback, fire-and-forget promise, or dead-letter replay bypasses the owning domain command.

## Tasks / Subtasks

- [ ] Define the AI Orchestration-owned transactional outbox schema and event envelope (AC: 1-3)
  - [ ] Add `domain_outbox` and its exported value/status types to `src/db/schema.ts`; generate forward-only Drizzle migration `0011_*` and journal/snapshot from the current `0010` baseline. PostgreSQL and Drizzle remain the only product/job data-plane and schema owners.
  - [ ] Store `id`, `originating_command_id`, `event_type`, `event_version`, `aggregate_type`, `aggregate_id`, owner `user_id`, optional conversation/project/message resource identifiers, captured conversation lifecycle/project aggregate fences, deterministic `dedupe_key`, bounded JSON `payload`, status, `attempt_count`, `max_attempts`, `available_at`, claim worker/timestamps/lease expiry/fencing token, safe `last_error_code`, safe terminal `failure_code`, terminal/completion timestamps, and audit-safe timestamps.
  - [ ] Define only these v1 events: `ai_ask.context_extraction.v1`, `ai_ask.answer_annotation.v1`, and `ai_ask.trip_proposal_draft.v1`. The aggregate is `ai_ask_command`; `aggregate_id` is the immutable command ID. Do not make Chat/Trips, Usage, Retrieval, or a generic queue package own this table.
  - [ ] Enforce a unique `dedupe_key`; use deterministic keys `ai-ask:<command-id>:context-extraction:v1`, `ai-ask:<command-id>:answer-annotation:v1`, and `ai-ask:<command-id>:trip-proposal-draft:v1`. A second enqueue returns/uses the existing row and never resets a claim, attempt counter, failure, or terminal state.
  - [ ] Make the payload an allow-listed v1 ID-and-fence envelope, not a second mutable source of truth: `{ version: 1, commandId, userId, conversationId, userMessageId?, assistantMessageId?, tripProjectId?, conversationLifecycleVersion, tripProjectAggregateVersion? }`. It must contain no question/history/assistant prose, image bytes/data URL, prompt/source bundle, provenance snapshot, annotation/proposal JSON, provider request/response, credential, cookie, raw source, exception text, or browser projection.
  - [ ] Bound payload storage to 4096 UTF-8 bytes and validate exact keys, types, UUID-like non-empty IDs, integer fences `>= 1`, and event-specific required/forbidden identifiers before insert and before dispatch. Store identifiers/fences in columns as claim/query authority; payload is a versioned consumer input mirror that must match the columns.
  - [ ] Use `pending | processing | completed | failed` status. Require `attempt_count` in `0..max_attempts`, `max_attempts` in `1..10` (default 3), a due `available_at`, and a valid claim shape only for `processing`; terminal rows clear claim fields. Add due-queue and expired-lease indexes plus a unique dedupe index. Safe codes match a bounded lowercase token grammar and never hold provider/SQL/error text.
- [ ] Add one AI-owned enqueue port and place enqueues in the existing Story 10.2 durable transactions (AC: 1, 3)
  - [ ] Create a server-only `src/features/ai/domain-outbox.ts` (or equally narrow AI-owned module) with transaction-aware `enqueueAiAskFollowUpInTransaction`. It receives the current transaction and authoritative IDs/fences; it validates the envelope, computes the key, and uses `ON CONFLICT (dedupe_key) DO NOTHING`/readback without a separate transaction.
  - [ ] In `acquireAiAskCommand`, enqueue exactly one context-extraction event only after the command's user-message insert and command reference update succeed, and before that admission transaction commits. Include the captured fence and the persisted user-message ID. A failed/rolled-back admission leaves neither user turn nor outbox row.
  - [ ] In the matching-fence success branch of `finalizeAiAskCommand`, enqueue annotation only after the assistant message and all provenance/source-bundle writes have succeeded, and enqueue proposal only after the assistant message has succeeded and only when the command has a selected Trip Project. Both events must be in the same successful finalization transaction as the completed command/assistant/provenance/usage state.
  - [ ] Do not enqueue terminal-answer events for `failed`, `aborted`, or `discarded` commands. In particular, the Story 10.2 stale/deleted fence path must create no follow-up rows. Preserve the command's terminal result and stream ordering; enqueue failure must roll back its originating durable transaction rather than publish an answer/turn with silently missing required dispatch.
  - [ ] Enqueue from no other route, browser, retry, replay, or deletion path. Same-key command replays and duplicate finalizers must not create new rows or re-open a terminal row.
- [ ] Replace all current non-durable AI Ask follow-up paths with outbox consumers (AC: 2-3)
  - [ ] Remove `after`/`after()` import and callback from `src/app/api/ai-ask/stream/route.ts`, and remove inline annotation generation/persistence and `draftAndPersistProposal` from the request/stream lifetime. The terminal `done` projection remains the fenced durable projection and must not wait for or expose optional consumer output.
  - [ ] Add a bounded library worker seam in `src/features/ai/domain-outbox-worker.ts`; it may be invoked by local tests or an existing process during this story, but add no Nest worker application, Railway Cron, scheduler, health endpoint, Docker/release configuration, or long-running deployment entrypoint.
  - [ ] Implement event-specific consumer functions behind a discriminated event parser. They must reload authoritative owner-scoped data and call existing feature-owned APIs: context extraction through `extractChatTripContext`; annotations through `buildValidatedAnswerAnnotations`/`sanitizeStoredAnswerAnnotations`; proposal drafting through `draftTripChangeProposal` and Chat/Trips proposal persistence. Do not duplicate Chat/Trips, Retrieval, Provenance, or Usage table writes directly.
  - [ ] Context extraction consumes only a persisted user turn and its expected conversation/project fence. It must confirm user ownership, conversation membership, optional project link, captured lifecycle version, source message role, and source-message existence before provider work and again in the same transaction as any `chat_context`/usage/audit write. Missing/deleted/mismatched state is a safe non-mutating fenced-out outcome.
  - [ ] Annotation consumes only the persisted final assistant message and provenance. It must verify command `completed`, owner, assistant/conversation membership, captured fences, and provenance ownership before provider work and again before updating `messages.answer_annotations`. It must validate the returned offsets/provenance with existing sanitizers and compare-and-set the expected unchanged assistant message/fence. It never alters answer content, command completion, terminal projection, or provenance.
  - [ ] Proposal drafting consumes only a persisted completed selected-Trip-Project assistant message. It must validate owner/project/conversation linkage, captured fences, command completion, assistant membership, and the current Trip Project aggregate before provider work; it must pass the current aggregate's expected version and revalidate in the owning Chat/Trips persistence transaction. A deleted/mismatched/fenced-out aggregate creates no proposal and cannot affect the completed answer.
  - [ ] Consumer side effects must be idempotent by the event dedupe key. Add the smallest owner-owned durable idempotency guard needed so a crash after an external provider call but before acknowledgement cannot create duplicate `chat_context` facts, annotations, proposal rows, or success usage/audit effects on re-delivery. Do not use in-memory maps or only the outbox `completed` flag as the guard.
- [ ] Implement safe transactional claims, leases, CAS acknowledgement, retry, and exhaustion (AC: 2)
  - [ ] Claim a bounded batch in one short PostgreSQL transaction with `FOR UPDATE SKIP LOCKED`, selecting due `pending` rows and expired `processing` leases in deterministic `available_at, created_at, id` order. Atomically set `processing`, worker ID, claimed timestamp, bounded lease expiry, fresh cryptographic fencing token, incremented attempt count, and clear only retryable last-error state. A reclaim always gets a new fencing token.
  - [ ] Validate worker IDs and batch/lease configuration defensively. Use a default 15-minute lease, clamp a configured lease to 10-60 minutes, default batch size 10 and clamp it to 1-50. The worker must never claim rows when its input/configuration is invalid.
  - [ ] Treat the claim as a capability: every acknowledgement, retry release, terminal failure, and consumer-result mutation uses `(id, status = 'processing', fencing_token, lease_expires_at > now)` and the expected event version/fences. A stale/expired/duplicate worker returns a safe no-op and may not write side effects or overwrite a newer claimant.
  - [ ] Acknowledge `completed` only in the same transaction as the consumer's idempotent durable result. Clear claim columns, set completion time, and preserve no raw result/provider payload. Do not acknowledge solely because a provider call returned.
  - [ ] On retryable failure, release only the matching active claim; retain the safe code and schedule `available_at` with bounded exponential backoff `min(60 seconds * 2^(attempt - 1), 15 minutes)` plus bounded jitter. If its incremented attempt count reaches `max_attempts`, atomically set `failed`, clear the claim, set `failure_code = retry_exhausted` (or a bounded non-retryable code), timestamp it, and emit an alertable structured log/metric containing only outbox ID, event type/version, command ID, owner ID, attempt count, and safe code.
  - [ ] A missing/deleted owner, command no longer `completed`, fence mismatch, invalid envelope, unsupported event version, or stale consumer claim is not a retry loop. Classify it as a safe terminal fenced-out/invalid outcome, make no domain mutation, and acknowledge/terminalize through the matching CAS path with no sensitive error. Unexpected transient database/provider failures use the retry path. There is no dead-letter replay UI, direct SQL replay recipe, or manual bypass of the originating command in MVP.
- [ ] Preserve deletion, fence, and completed-result invariants (AC: 1-3)
  - [ ] Keep Story 10.2's lock order whenever owner resources are locked: Trip Project, conversation, command, then outbox row. Do not hold a row lock during provider work; claim/release use short transactions and consumers revalidate authoritative state before their write transaction.
  - [ ] Update the retained-command deletion scrub contract/migration only as necessary for outbox foreign keys: deleting a conversation/project must leave no payload/content-bearing retained row that can revive work. Either retain an event only with scrubbed identifiers and terminal safe fenced-out state, or delete the operational outbox row through a reviewed FK/trigger contract; select one documented behavior and prove direct FK deletion as well as feature deletion. User deletion may cascade owner operational rows. Never retain question/answer/source/provider data in an event.
  - [ ] Outbox consumers must fail closed if a command is `discarded`, its resource IDs were scrubbed, its owner is absent, the source message/assistant/provenance/project is missing, the conversation's lifecycle differs, the project aggregate differs, or conversation/project linkage changed. They must recheck after provider work, because deletion or a fence change can occur while work is in flight.
  - [ ] A delayed, retried, fenced-out, or exhausted consumer must never change a completed command to failed, overwrite its assistant/provenance/usage/source-bundle state, append a new assistant answer, or alter its safe terminal projection. Story 10.4 owns traveler read-model exposure of pending/failed consumer state; do not surface it in the command/browser payload here.
- [ ] Prove the protocol with migration-backed PostgreSQL and focused regression tests (AC: 1-3)
  - [ ] Add `tests/domain-outbox.test.ts` (or a focused equivalent) for schema constraints, exact bounded envelope parsing, dedupe uniqueness, conflict readback without state reset, event-specific required IDs, safe payload rejection, due indexes/claim eligibility, lease-expiry reclaim with a new token, retry/backoff cap, exhaustion, invalid/non-retryable terminal failure, and no sensitive failure persistence/log projection.
  - [ ] Use independent PostgreSQL connections to prove two workers contend on the same due rows: `SKIP LOCKED` yields disjoint claims; an old lease holder cannot acknowledge/retry/write after a new claimant receives a fresh token; exactly one CAS acknowledgement wins. Do not use the serial shared Vitest connection as proof of real lock contention.
  - [ ] Inject failures between originating state writes and enqueue, and prove full rollback: no user message without extraction event; no completed assistant/provenance/usage/command without required annotation/proposal events; no stale-fence discard with any follow-up event. Also prove duplicate admission/finalization produces one event per deterministic key.
  - [ ] Exercise each consumer through realistic mocked provider boundaries plus PostgreSQL writes: one successful delivery; crash/re-delivery/idempotent replay; provider/database transient retry; invalid payload; unsupported version; no model; deleted command/conversation/project/message/provenance; lifecycle mismatch; aggregate mismatch; relink/primary change; and stale fencing token. Assert no duplicate context facts, annotations, proposals, success usage, or audits.
  - [ ] Add route/shell regressions proving `route.ts` has no `after()`/fire-and-forget/inlined follow-up call, emits `done` immediately after fenced completion without waiting for consumers, replays the unchanged safe completed projection, and does not include annotation/proposal work results in this story. Preserve Story 10.2 strict NDJSON ordering and exactly one terminal event.
  - [ ] Run the focused migration-backed suites, then existing AI Ask/context/proposal/worker regressions and baseline checks. Record actual commands/results only during implementation; this planning artifact does not claim any migration, implementation, or test was run.

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
- BMad checklist validation completed. No production code, migration, test, or runtime implementation has been performed or claimed.

### File List

- `_bmad-output/implementation-artifacts/10-3-dispatch-ai-ask-follow-up-work-through-a-transactional-outbox.md`
