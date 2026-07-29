# Story 10.2: Fence Terminal AI Ask Persistence

Status: ready-for-dev

## Story

As a traveler,
I want an answer to be saved only while its selected planning state is still valid,
so that a deletion or changed Trip Project cannot leave a stale assistant result visible.

## Acceptance Criteria

1. **Given** AI Orchestration creates an AI Ask command, **when** it locks the owner-scoped conversation and selected Trip Project, **then** it captures the conversation `lifecycle_version` and applicable Trip Project `aggregate_version` on the command before persisting the user turn, **and** conversation deletion, project deletion, project link/primary-conversation changes, and TripAnswerContext-changing aggregate commands increment their relevant fence.
2. **Given** provider streaming completes, **when** final assistant content, retrieval decision, provenance, usage, and source-bundle snapshot are persisted, **then** one transaction verifies the captured owner fences and writes all final state only if they still match, **and** partial stream tokens remain transient client state and never imply a completed persisted message.
3. **Given** a final fence no longer matches, **when** terminalization occurs, **then** the command becomes `discarded`, emits one safe `error` terminal event with `refresh_required`, and creates no visible assistant message, provenance, successful usage event, annotation, or proposal, **and** the NDJSON sequence remains `preparing`, zero or more `delta`, then exactly one `done` or `error` with request and persisted identifiers where present.

## Tasks / Subtasks

- [ ] Define the fence and retained-command schema contract through a forward-only Drizzle migration (AC: 1-3)
  - [ ] Add non-null monotonic `conversations.lifecycle_version` (minimum `1`) and nullable captured conversation/project fence columns on `ai_ask_commands`; a command with a conversation must retain its captured conversation lifecycle version, and a project-scoped command must retain its captured Trip Project aggregate version.
  - [ ] Extend the command status/check constraints to include terminal `discarded`; require a safe terminal result and `terminal_at` for it. Do not permit a `discarded` command to reference a visible assistant message or preserve deleted conversation content in its terminal projection.
  - [ ] Add only indexes needed for owner/fence finalization and retained-command lookup. Preserve Story 10.1's unique owner/scope/key and 24-hour expiry behavior.
  - [ ] Replace the current command-reference cascade behavior with a retention-compatible relationship design. The current composite owner FKs from `ai_ask_commands` to conversation, Trip Project, and messages use `ON DELETE CASCADE`, so deleting a conversation/project erases the command before it can be terminalized as `discarded`; this is incompatible with this story and must not remain.
  - [ ] Preserve command ownership through `user_id` while allowing deleted conversation/project/message references to be cleared. If PostgreSQL composite-FK `SET NULL` semantics are needed, use a reviewed raw migration with a column list so `user_id` is never nulled; update the Drizzle declaration to match the resulting database contract. Do not replace the owner constraint with an unchecked scalar ID.
  - [ ] Confirm conversation/project/user deletion behavior: owner deletion may remove the owner's commands; conversation/project deletion must retain a safe terminal command for its 24-hour retention window, clear deleted resource references, and retain no deleted message/question/assistant content in the command projection.
- [ ] Capture owner-scoped fences during command admission (AC: 1)
  - [ ] Extend the existing `acquireAiAskCommand` transaction rather than creating a second admission path. Lock and owner-check the selected Trip Project, then the resolved conversation, capture their versions, create/update the command, and persist the user turn in that same transaction.
  - [ ] For an ordinary conversation command, capture its `lifecycle_version`; for a selected Trip Project command, capture both the primary conversation `lifecycle_version` and the project `aggregate_version`; for a new conversation, create the command-generated scope, create/lock the conversation, capture its initial lifecycle version, then create the user turn.
  - [ ] Persist/replay exactly the original captured fence. An identical pending or terminal replay must not recapture a newer version, create a turn, call a provider, or convert a stale command into a fresh request.
  - [ ] Use the canonical lock order everywhere this story touches these resources: `trip_projects` by ID, `conversations` by ID, then `ai_ask_commands` by ID. For a deletion affecting multiple conversations or commands, lock rows in ascending ID order at each level. Do not acquire a command lock before a project/conversation lock.
- [ ] Make all relevant Chat/Trips lifecycle mutations advance the captured fence (AC: 1)
  - [ ] Update owner-scoped conversation deletion to lock the conversation before destructive work, invalidate/terminalize its pending commands while the owner/fence rows still exist, advance the lifecycle fence where the row survives long enough to observe it, then delete through the approved retained-command deletion contract.
  - [ ] Update Trip Project deletion to lock the project first, then linked conversations in ascending ID order, invalidate/terminalize pending project/conversation commands, and only then remove the project/conversation graph. It must not leave a retained command with deleted message text or a live reference to deleted resources.
  - [ ] Increment the Trip Project aggregate version for primary-conversation replacement/link changes and every existing aggregate mutation that changes `TripAnswerContext`. Ensure the project-primary resolver cannot silently change a primary pointer without advancing the aggregate fence.
  - [ ] Increment the relevant conversation lifecycle version for conversation deletion and project-link/primary-conversation changes. Do not increment lifecycle merely for ordinary user/assistant message insertion unless the architecture is explicitly amended.
  - [ ] Keep Chat/Trips as the owner of its rows. AI Orchestration may request a narrow exported invalidation/fence helper; it must not directly implement Chat/Trips deletion or mutate its aggregates from the route.
- [ ] Replace split terminal persistence with one fenced finalization use case (AC: 2-3)
  - [ ] Replace `prepareAiAskCommandTerminalResult`, `terminalizeAiAskCommand`, and `recoverCompletedAiAskCommand` success-path composition with one AI-owned transaction that locks in the canonical order, reloads owner-scoped rows, verifies exact captured versions and `pending` command status, and either commits success or commits `discarded`.
  - [ ] On a matching fence, atomically insert the assistant message, persist retrieval decision/source-bundle snapshot and row-per-source provenance, append the successful usage event through the typed Usage boundary, update conversation display timestamp as appropriate, and set the command to terminal `completed` with the complete safe browser projection and assistant reference. Emit `done` only after this transaction commits.
  - [ ] On a missing/deleted/mismatched owner row or captured version, atomically set the still-retained pending command to `discarded` with a bounded safe error projection/code `refresh_required`; clear assistant/message/content-bearing terminal fields as required by the deletion contract. Do not insert an assistant message, provenance, successful usage event, annotation, proposal, source-bundle snapshot, or any replacement turn.
  - [ ] Treat an already-terminal command as replay-only. A conflict must read and return the durable terminal projection; it must never retry the provider, duplicate final writes, or overwrite an existing `completed`, `failed`, `aborted`, or `discarded` result.
  - [ ] Retain existing safe failure/abort terminalization, but make its command update compatible with the new state machine and retained/deleted references. Do not turn a committed completed result into failed/aborted after client abort.
- [ ] Preserve exact stream and composer recovery behavior (AC: 2-3)
  - [ ] Keep legacy `src/app/api/ai-ask/stream/route.ts` as the sole writer in this story. Do not add the Nest endpoint, BFF forwarding, a second writer, or a cutover flag.
  - [ ] For each admitted stream, emit exactly `preparing`, zero or more `delta`, then one terminal `done` or `error`, all as newline-delimited JSON. Terminal events include the request/correlation identifier where the protocol already provides it and include only persisted conversation/message identifiers that still exist.
  - [ ] A fence discard must emit exactly one `error` event with the existing Vietnamese-safe recovery copy for `refresh_required`; it must not emit `done`, an assistant payload, internal fence/version details, provider details, SQL, tokens, or a partial-save implication. Once a terminal event is sent, close the stream and suppress any later delta/terminal emission.
  - [ ] Partial tokens already rendered from `delta` are transient only. On `refresh_required`, the composer must remove/reconcile any optimistic assistant state, preserve the user turn only if it remains owned and persisted, refresh/navigate to the URL-owned server shell, and present retry/refresh recovery without inventing an assistant answer.
  - [ ] Same-key reconnect/retry must read the retained command and replay its safe `discarded` error; it must retain the original idempotency key and original unscoped scope behavior from Story 10.1. It must not generate a new key or submit a new request automatically.
- [ ] Keep follow-up work explicitly out of this story (AC: 2-3)
  - [ ] Do not introduce `domain_outbox`, worker claims, leases, fencing tokens, retries, consumer state, or a worker runtime. Story 10.3 owns durable dispatch; Story 10.4 owns consumer completion/read models.
  - [ ] Do not make annotation enrichment, context extraction, or proposal drafting part of the atomic finalization transaction. Preserve existing behavior only as required for the legacy baseline, but do not claim it is durable, fenced, or non-retroactive; Story 10.3 replaces `after()`/fire-and-forget follow-up paths.
  - [ ] In the stale-fence path specifically, no annotation/proposal/extraction follow-up may be started from a nonexistent final assistant result.
- [ ] Prove fencing, retention, atomicity, and recovery with PostgreSQL-backed tests (AC: 1-3)
  - [ ] Add migration/schema tests for lifecycle and aggregate fence constraints, `discarded`, valid/invalid terminal shapes, retained command cleanup, and the repaired deletion-reference behavior.
  - [ ] Use separate PostgreSQL connections/transactions to deterministically interleave command admission/finalization with ordinary conversation deletion, Trip Project deletion, primary-conversation replacement, project link changes, and a TripAnswerContext-changing aggregate mutation. Prove lock ordering completes without deadlock and exactly one terminal outcome wins.
  - [ ] Prove matching-fence success persists command completion, assistant, provenance, source-bundle snapshot/retrieval decision, and successful usage atomically; inject failures at each write boundary and prove rollback leaves no partial assistant/provenance/success usage/terminal projection.
  - [ ] Prove every stale/missing fence outcome is one durable `discarded` command plus safe `refresh_required`, with no assistant, provenance, successful usage, annotations, proposal, or duplicate provider/finalization work. Include deletion of the original conversation and Trip Project, and assert retained commands contain no deleted message/question/assistant content.
  - [ ] Extend route/composer tests for strict NDJSON ordering, exactly-one terminal event, post-discard UI reconciliation, same-key discarded replay, retained original unscoped retry scope, abort versus completed-finalization behavior, and no protocol/internal-data regression.
  - [ ] Run focused migration-backed integration suites before broader checks, then run the existing protected transport/API regressions plus `pnpm typecheck`, `pnpm lint`, and `pnpm build`. Record exact command output/blockers only during implementation; this story artifact does not claim those checks have run.

## Dev Notes

### Implementation Guardrails

- AD-16 is authoritative: capture the exact conversation lifecycle and selected Trip Project aggregate fence after owner locks; final assistant/provenance/usage persistence verifies it in the same transaction. A stale fence is `discarded` plus safe `refresh_required`, never a visible partial result.
- Story 10.1 is complete. Reuse its strict key validation, normalized identity digest, command-first unscoped scope, owner-scoped message references, safe terminal projection, replay behavior, composer key retention, and PostgreSQL concurrency setup. Do not reimplement or weaken any of them.
- The current Story 10.1 implementation intentionally has no fence columns, `discarded` state, or atomic command-finalization boundary. Its success path first writes assistant/provenance/usage, then prepares/terminalizes the command separately. That split is the precise behavior this story replaces; do not retain a recovery path that can promote a partially committed success after a fence failure.
- The known cascade incompatibility is mandatory scope. Current command composite FKs cascade on conversation and Trip Project deletion, while the architecture requires a retained terminal `discarded` command for safe same-key recovery. Resolve this at the schema/deletion-contract level with a forward-only migration. Do not evade it by deleting the command, retaining deleted content in JSON, suppressing deletion, disabling owner FKs, or treating a missing command as a new request.
- Retention/deletion approach: retain only owner-scoped, safe command metadata for 24 hours. On conversation/project deletion, clear resource/message references and replace content-bearing terminal projections with the bounded `refresh_required` discard projection before/with destructive work; user deletion may cascade command records. Expiry cleanup must remove retained command metadata after 24 hours and must not revive a key or retain deleted chat/project content.
- Lock order is non-negotiable: Trip Project, conversation, command. Lock multi-row sets by ascending ID. All relevant Chat/Trips mutation/deletion and AI finalization paths must obey it; otherwise project deletion/finalization and primary-conversation changes can deadlock or produce a stale answer.
- The finalization transaction must use ownership predicates and expected captured versions, not merely a read-before-write comparison. It must check command status is still `pending` and use a compare-and-set terminal update so a duplicate finalizer cannot overwrite a winner.
- The user turn may remain after a provider failure/abort according to the established baseline. A fence-discarded command must not create or retain an assistant result. Do not conflate provider failure, caller abort, final-write failure, and stale-fence discard; each has its own safe terminal projection.
- Usage writes go through `writeAiUsageEvent`; AI Orchestration does not directly insert `ai_usage_events`. Chat/Trips owns conversations, projects, lifecycle/aggregate changes, and deletion. AI Orchestration owns command terminalization and assistant provenance.
- No browser receives an API credential. Preserve the private Next route boundary, authenticated ownership checks, image validation, correlation handling, safe error projection, Vietnamese-first recovery copy, and no raw prompt/provider/source material in persisted command projections or events.
- Schema work is forward-only Drizzle work. Do not destructively roll back schema. If durable data or overlapping runtime deployment becomes relevant, stop for the approved expand-migrate-contract/compatibility decision rather than assuming the disposable-development clean-break policy applies.

### Current Code To Read And Update

- `src/app/api/ai-ask/stream/route.ts`: current sole legacy writer. It emits NDJSON, writes the user turn through command acquisition, persists assistant/provenance/usage in a transaction, then separately prepares/terminalizes the command and performs non-durable follow-up work. Replace only the terminal persistence boundary required here; preserve request validation, model selection, source bundle, provider abort distinction, safe errors, and legacy ownership.
- `src/features/ai/ai-ask-commands.ts`: Story 10.1's sole command acquisition/replay module. Extend it for capture and fenced terminalization; remove/retire the split success helpers only when their replacement is atomic and covers safe replay.
- `src/db/schema.ts`: current `aiAskCommands` status excludes `discarded`, lacks captured fence fields, and has composite cascading FKs. `conversations` currently lacks `lifecycle_version`; `tripProjects.aggregateVersion` already exists. Align schema declarations, constraints, indexes, and deletion semantics with the migration.
- `drizzle/migrations/meta/_journal.json` and the latest migration snapshots: establish the next forward-only migration number and generated metadata. Read the Story 10.1 migrations `0006`-`0008` because they introduced the owner/message reference and terminal-shape contracts that this story supersedes compatibly.
- `src/features/chat-trips/conversations.ts`: owner-scoped conversation deletion and primary replacement behavior. It currently locks/replaces/deletes without lifecycle fencing and relies on cascades; update via Chat/Trips-owned helpers without breaking audit/deletion counts.
- `src/features/chat-trips/trip-projects.ts`: primary-conversation resolution, project deletion, and aggregate mutation primitives. It currently increments aggregate version for plan/constraint changes but does not increment it for primary pointer changes; align lifecycle/aggregate invalidation and lock order.
- `src/features/chat-trips/trip-change-proposals.ts` and `src/features/chat-trips/actions.ts`: existing owner-scoped Trip Project aggregate mutation/action patterns. Audit every mutation that changes the future `TripAnswerContext` fence; do not broadly version unrelated reads.
- `src/features/retrieval/source-bundle.ts`, `src/features/retrieval/provenance.ts`, `src/features/audit/usage.ts`, and `src/features/ai/answer-freshness.ts`: use existing transaction-aware persistence helpers for the atomic success boundary. Do not duplicate their tables or write around their ownership API.
- `src/features/ai/ai-ask-composer.tsx`: retain one logical request key and reconcile terminal state with URL-owned server state. Update only the `refresh_required`/discard presentation and optimistic-state cleanup needed by this story.
- `tests/ai-ask-commands.test.ts`, `tests/ai-ask-sessions.test.ts`, `tests/trip-projects.test.ts`, `tests/trip-change-proposals.test.ts`, `tests/ai-ask-shell.test.ts`, and the focused route/transport tests: extend established PostgreSQL, concurrent-connection, deletion, stream, and browser recovery patterns rather than creating a parallel harness.

### Exact Terminal And Recovery Contract

| Situation | Durable command state | Persisted assistant-side state | Stream/composer result |
| --- | --- | --- | --- |
| Matching captured fences and final transaction commits | `completed` | Assistant, source-bundle/retrieval decision, provenance, successful usage, and complete safe terminal projection commit together | One `done` after commit; reconcile with persisted shell |
| Fence missing, deleted, or version-mismatched before final commit | `discarded` | None of assistant/provenance/success usage/source-bundle/annotation/proposal is created; deleted references/content are cleared | One `error` with safe Vietnamese `refresh_required`; remove transient assistant text and refresh shell |
| Provider failure | `failed` | No assistant success state; existing safe failure usage behavior remains subject to the current baseline | One safe `error`; same-key replay returns it |
| Caller abort before success commit | `aborted` | No assistant success state; retained user turn behavior remains as established | One safe `error`; same-key replay returns it |
| Same-key retry/reconnect after `discarded` | `discarded` unchanged | No new work | Replay the exact safe error; keep original key and scope; never auto-resubmit |

### Testing Plan

Use `DATABASE_URL_TEST` and the existing serial Vitest setup. Concurrency/deadlock cases must create independent PostgreSQL connections; mocks cannot prove lock/cascade/transaction behavior.

```bash
pnpm vitest run tests/ai-ask-commands.test.ts tests/ai-ask-sessions.test.ts tests/trip-projects.test.ts tests/trip-change-proposals.test.ts
pnpm vitest run tests/answer-context.test.ts tests/chat-trip-context-extraction.test.ts tests/ai-ask-shell.test.ts
pnpm vitest run tests/bff-transport.test.ts tests/api-platform-contract.test.ts tests/api-request-principal.integration.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

Required assertions:

- No provider call, final side effect, or second user turn occurs on replay, stale fence, invalid ownership, or post-terminal duplicate finalization.
- A matching finalization is all-or-nothing across command terminal state, assistant, provenance, retrieval/source-bundle state, and successful usage.
- A stale/deleted fence is all-or-nothing in the opposite direction: one retained `discarded` command and no visible final state.
- Conversation/project deletion, primary replacement, project link change, and all TripAnswerContext-changing aggregate commands invalidate previously captured fences.
- Retained post-deletion commands preserve ownership and safe recovery only, not deleted question/assistant/message content or live FK references.
- NDJSON is ordered and has exactly one terminal event; `discarded` is `error`/`refresh_required`, not `done` or `in_progress`.

### Scope Boundaries

- Story 10.3 exclusively owns `domain_outbox`, deterministic dedupe dispatch, worker `FOR UPDATE SKIP LOCKED` claims, leases/fencing, retry/backoff, terminal consumer failure, and removal of `after()`/fire-and-forget follow-up behavior.
- Story 10.4 exclusively owns consumer pending/failed read models and the guarantee that delayed, retried, fenced-out, or failed extraction/annotation/proposal consumers cannot alter a completed AI Ask command/result.
- Story 10.5 exclusively owns Nest `POST /v1/ai-ask/stream`, BFF forwarding, request-principal/transport cutover, byte-compatible API NDJSON forwarding, selected-owner routing, and retirement of the legacy Next writer.
- Epic 11 owns canonical `TripAnswerContext v1`, source-bundle evolution, historical provenance withdrawal, and annotation contract evolution. This story only fences the current selected aggregate/state; it must not introduce the Epic 11 data model.
- Epic 12 owns dedicated worker deployment/health/shutdown/operations; Epic 14 owns deployed cutover, migration ordering, rollback, legacy retirement, and public-launch evidence.
- Do not add a new API package/controller, public endpoint, generic SDK, queue product, runtime, worker, compatibility layer, production deployment setting, or unrelated UX redesign.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 10: Reliable AI Ask API Cutover]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 10.2: Fence Terminal AI Ask Persistence]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-16: Nest Owns Source-Bundled NDJSON AI Ask Streaming]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13: Users Delete Their Own Chats And Trip Projects]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-32: Capability Cutovers Have One Writer And Compatible Rollback]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-34: Durable Work Uses A PostgreSQL Transactional Outbox]
- [Source: _bmad-output/project-context.md#Critical Implementation Rules]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-28.md#4.2 Replace Technical Migration Framing With Capability Cutovers]
- [Source: _bmad-output/implementation-artifacts/10-1-make-ai-ask-commands-idempotent.md]
- [Source: src/app/api/ai-ask/stream/route.ts]
- [Source: src/features/ai/ai-ask-commands.ts]
- [Source: src/features/chat-trips/conversations.ts]
- [Source: src/features/chat-trips/trip-projects.ts]
- [Source: src/db/schema.ts]

## Story Validation

- BMad story checklist validation completed: acceptance criteria are complete and traceable; tasks cover schema, fencing, atomic terminalization, retention/deletion, lock ordering, NDJSON/composer recovery, regression tests, and scope boundaries.
- Critical implementation hazard captured: current command deletion cascades conflict with the required retained `discarded` terminal result. The implementation must resolve this through the documented forward-only schema/deletion contract before claiming AC 3.
- No implementation, migration, test execution, or production-code verification has been performed by this story-creation artifact.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story planning only. No implementation logs.

### Completion Notes List

- Story artifact created and validated for development readiness. Implementation has not started.

### File List

- _bmad-output/implementation-artifacts/10-2-fence-terminal-ai-ask-persistence.md
