# Story 10.4: Preserve Completed AI Ask Results While Consumers Run

Status: done

## Story

As a traveler,
I want a completed answer to remain trustworthy even if its optional follow-up work is delayed or fails,
so that background processing does not rewrite the result I already received.

## Acceptance Criteria

1. **Given** a terminal AI Ask command has completed successfully, **when** context extraction, annotation enrichment, or proposal drafting is delayed, retried, fenced out, or terminally fails, **then** the command and terminal assistant/provenance/usage result remain completed and unchanged, **and** the owning read model exposes only the relevant pending or safe failed consumer status.
2. **Given** a follow-up consumer attempts a write, **when** its owner fence, dedupe key, or lease fencing token is stale, **then** it makes no mutation and records a safe operational outcome, **and** duplicate worker delivery cannot attach duplicate annotations, context updates, or proposals.
3. **Given** a browser reconnects after an ambiguous stream disconnect, **when** the BFF checks the AI Ask command using the original key, **then** it reads the persisted command/conversation state rather than creating a new command with a different key, **and** it reconciles the URL-owned server shell with the resulting terminal or in-progress state.

## Tasks / Subtasks

- [x] Define the narrow AI Orchestration consumer-status read model (AC: 1, 3)
  - [x] Add an owner-scoped server-only read function next to the existing AI Ask command/outbox ownership boundary, preferably `src/features/ai/ai-ask-commands.ts` if it projects a command result, or `src/features/ai/domain-outbox.ts` if it remains strictly operational-state projection. Do not create a generic queue read API.
  - [x] Accept only server-derived owner and command/message identity. Query `ai_ask_commands` with both `id` and `user_id`, then derive statuses solely from matching `domain_outbox.originating_command_id` and `domain_outbox.user_id`. Never trust browser-supplied event IDs, event types, worker IDs, or resource identifiers.
  - [x] Return a completed command's existing safe terminal projection unchanged plus an optional, bounded consumer-status list. Map event types to stable display categories: `context_extraction`, `answer_annotation`, and `trip_proposal_draft`.
  - [x] Project only `pending` for durable rows in `pending` or `processing`, and `failed` for durable rows in `failed`; omit `completed` rows, including successfully acknowledged `fenced_out` effects. A project-less command cannot report proposal drafting.
  - [x] The traveler projection must never include raw `failure_code`/`last_error_code`, attempt counts, timestamps, worker/claim/lease/fencing data, outbox IDs, dedupe keys, payloads, provider diagnostics, prompts, answer text beyond the already-safe terminal projection, SQL, or other operational internals.
  - [x] Keep the read model read-only: it must not claim work, start a worker, call a provider, write usage/audit, update annotations, enqueue/retry/redrive events, or mutate the command/assistant/provenance state.
- [x] Preserve the completed terminal result as the immutable primary outcome (AC: 1-2)
  - [x] Treat `ai_ask_commands.status = completed`, `terminal_result`, `terminal_at`, original assistant content, initial finalization provenance, and initial successful-answer usage as authoritative. Consumer status is secondary operational presentation and cannot reclassify, replace, or patch that terminal result.
  - [x] Preserve Story 10.2's fenced atomic finalization and Story 10.3's transactional enqueue. Do not add a post-consumer command terminalization path, update a `done` projection, or make a consumer failure emit/replay an AI Ask command error.
  - [x] Preserve Story 10.3's existing idempotent consumer transactions: `domain_outbox_effects` remains the one-event effect guard; active claim checks, owner/fence revalidation, and transactional acknowledgement remain the mutation gate. Do not weaken the `FOR UPDATE SKIP LOCKED`, lease, fencing-token, event-version CAS, bounded retry, or safe exhaustion behavior.
  - [x] Make the contract explicit for additive follow-up effects: validated annotations, extracted future context, and a separately owner-confirmed Trip Change Proposal may be written only through their existing successful, fenced, deduplicated consumer paths. They do not alter the completed command projection, assistant content, initial provenance, or initial answer usage.
  - [x] Preserve deletion/scrubbing behavior. Once conversation, project, or source message deletion has removed/cascaded the operational rows and retained command has been scrubbed to `discarded`, no read model may reveal historic consumer state, deleted resource identifiers, question/assistant content, or a stale pending/failed indicator.
- [x] Remove the legacy read-time annotation bypass for outbox-governed AI Ask answers (AC: 1-2)
  - [x] Audit `getOwnedConversation` in `src/features/chat-trips/conversations.ts`: its current read-time annotation backfill may call a model and update `messages.answerAnnotations` during a shell read, bypassing the Story 10.3 outbox claim/fence/idempotency path.
  - [x] Retire that read-time provider/persistence behavior for AI Ask assistant messages governed by a matching command/outbox event. The normal shell read must not create annotations, usage, or provider calls for those messages.
  - [x] If historical pre-outbox answer support is retained, constrain it to records that cannot have a matching AI Ask command/outbox event, document the precise predicate, and retain read-only behavior for outbox-governed records. Prefer the smallest change that makes post-Story-10.3 AI Ask enrichment exclusively worker-owned.
  - [x] Do not change the validated persisted annotation contract, annotation sanitizer, provenance ownership rules, descriptor rendering, or future Epic 11 annotation/provenance contracts.
- [x] Present safe, non-blocking consumer state in the existing URL-owned AI Ask shell (AC: 1, 3)
  - [x] Extend `src/app/ai-ask/page.tsx` through an owner-scoped server read to associate a consumer-status summary only with its displayed completed assistant message/command. Do not query all historical conversation outbox rows into one ambiguous banner, and do not introduce a command ID as an unvalidated URL authority.
  - [x] Thread a display-only status summary into `src/features/ai/ai-ask-composer.tsx`. Render the persisted answer, stored provenance, feedback, and existing workspace immediately; status must be supplemental and must not replace `assistantMessage.content`, provenance, annotations, or the stable `done` outcome.
  - [x] Pending copy must clearly state that optional planning details are still being prepared. Safe-failed copy must clearly state that optional planning details could not be prepared while the completed answer remains available. Use Vietnamese-first accessible copy, visible non-color-only state, and a polite live region only when the state changes.
  - [x] Do not call the worker, poll an operational endpoint, block submit/navigation, disable existing answer interactions, or represent a post-`done` answer as "still processing". CSS/layout changes must preserve the same server-loaded shell and client workspace model on desktop, tablet, and mobile.
  - [x] Retain Story 10.1's original-key replay and Story 10.2's discarded/`refresh_required` handling. Reconnect/retry continues to reuse the original key and restore persisted command/conversation state; do not auto-submit a new command/key or add transport behavior owned by Story 10.5.
- [x] Prove read-model safety, consumer isolation, and UI non-regression (AC: 1-3)
  - [x] Extend `tests/domain-outbox.test.ts` and/or `tests/ai-ask-commands.test.ts` with PostgreSQL-backed tests that prove owner isolation; exact event-to-category mapping; pending/processing normalization; safe failed normalization; omission of completed/fenced-out rows; project-only proposal relevance; and no raw operational code/claim/payload disclosure.
  - [x] Snapshot a completed command status, terminal result, terminal timestamp, assistant content, initial provenance, and initial-answer usage. Exercise consumer retry, terminal failure/exhaustion, invalid envelope, fenced-out delivery, stale token/event-version, and duplicate delivery; prove the snapshot remains unchanged while the safe consumer read status is the only permitted presentation difference.
  - [x] Retain and extend existing separate-connection tests for claim/lease/fencing races. Prove stale owner fences, stale dedupe/effect delivery, and stale lease/event-version claimants produce no duplicate context rows, annotations, proposals, usage, or command-projection mutation.
  - [x] Prove deletion/source-message/project deletion scrubbing removes operational rows and causes the owner read model to expose no historic consumer status or deleted-content reference.
  - [x] Extend `tests/chat-trip-context-extraction.test.ts` for completed-command preservation through delayed/retried/fenced-out/failed delivery and for immediate route `done` behavior. Retain its no-route-callback/no-inline-follow-up coverage.
  - [x] Extend `tests/ai-ask-shell.test.ts` to prove a completed answer/provenance renders immediately with a relevant optional-pending indicator; safe failed state does not expose an internal code or say the answer failed; other-owner/unrelated-history state is absent; completed/fenced-out consumers display no indicator; and shell rendering invokes no provider, worker, usage writer, or persistence backfill.
  - [x] Run focused serial PostgreSQL suites, then protected transport/API regressions, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`. Record actual commands and blockers only during implementation.

## Dev Notes

### Architecture and Ownership

- AD-34 is authoritative: follow-up delay/failure cannot change a terminal AI Ask command from `completed` to `failed`, and each consumer exposes only its pending/failed state through an owning read model. The outbox is operational state, not a second answer result.
- AI Orchestration owns commands, `domain_outbox`, consumer-status projection, and worker protocol. Chat/Trips owns conversations, extracted context, Trip Projects, and proposals. Retrieval owns stored provenance; Usage owns usage events. Preserve narrow feature-owned calls rather than directly mutating another aggregate.
- Story 10.3 is complete. Its `domain_outbox` rows already have safe v1 event envelopes, deterministic dedupe, leases/fencing, retries, exhaustion, and `domain_outbox_effects` idempotency guards. Story 10.4 consumes these durable facts; it does not redesign them.
- The `done` terminal projection is emitted immediately after fenced finalization and enqueue. Its terminal assistant/provenance/usage result is valid even while optional consumers remain pending or fail. A consumer status must never invalidate, overwrite, delay, or restate this answer as failed.
- `assistant_response_provenance.usedInPrompt` and `citedInAnswer` are part of the completed answer/provenance result. They are available before optional workers finish. `messages.answerAnnotations` is separate worker-owned enrichment and may remain empty while `ai_ask.answer_annotation.v1` is pending.
- The initial answer-generation request may set `citedInAnswer` through a validated internal source-reporting tool. This does not replace the answer-annotation worker, which owns persisted text ranges, entity annotations, and proposal action annotations.
- A completed `fenced_out` outbox row is an expected safe operational disposition, not a traveler-facing failure. It is omitted from the read model. Terminal `failed` outbox rows are projected only as a generic safe failure category, never by their raw failure code.

### Current Code To Read And Update

| File | Current behavior to preserve | Story 10.4 change |
| --- | --- | --- |
| `src/features/ai/ai-ask-commands.ts` | Owner-scoped command acquisition, retained terminal replay, fenced finalization, and transactional annotation/proposal enqueue. | Add or host the narrow owner-scoped completed-command consumer-status projection without changing terminal-result shape or replay behavior. |
| `src/features/ai/domain-outbox.ts` | Owns exact event envelopes, enqueue, claims, leases, fencing, CAS acknowledgement, retry, and safe terminal failure. | Reuse status/event facts for a read-only safe projection only; do not change event schema, claim semantics, or expose operational fields. |
| `src/features/ai/domain-outbox-worker.ts` | Each consumer validates fences/claim state and records effect plus result transaction without patching command terminal state. | Preserve this boundary. Add regression coverage only if necessary to make terminal-result immutability explicit. |
| `src/features/chat-trips/conversations.ts` | Loads owned messages, stored provenance, feedback, and currently performs read-time annotation backfill. | Remove/constrain the post-outbox read-time provider/write bypass so enrichment stays on the durable worker path. |
| `src/app/ai-ask/page.tsx` | Authenticated URL-owned shell loads one owner-scoped conversation/project and passes persisted state to the composer. | Load and pass only safely associated display-only consumer statuses; retain canonical URL selection and no alternate loader. |
| `src/features/ai/ai-ask-composer.tsx` | Shows `done` answer immediately, retains original idempotency-key retry scope, and renders persisted annotations/provenance. | Render a supplementary safe pending/failed state without changing stream parsing, terminal content, or submission availability. |
| `tests/domain-outbox.test.ts`, `tests/ai-ask-commands.test.ts`, `tests/chat-trip-context-extraction.test.ts`, `tests/ai-ask-shell.test.ts` | Existing migration-backed claims, consumer, stream, shell, ownership, and deletion coverage. | Add projection, immutability, legacy-backfill removal, and non-blocking presentation regressions using those harnesses. |

### Safe Consumer Projection Contract

| Durable event state | Traveler consumer state | Traveler-visible behavior |
| --- | --- | --- |
| Matching event is `pending` or `processing` | `pending` | Optional work is being prepared; completed answer remains immediately usable. |
| Matching event is `failed` | `failed` | Optional work could not be prepared; completed answer remains available. |
| Matching event is `completed`, including effect type `fenced_out` | Omitted | No consumer banner/status. |
| No matching event, a foreign-owner event, or a scrubbed/deleted command/resource | Omitted | No status and no data disclosure. |

### Non-Negotiable Guardrails

- The safe projection identifies categories only. Never send provider error content, failure codes, event IDs, dedupe keys, attempts, timestamps, claim/worker IDs, lease/fencing values, payloads, prompt/source material, SQL, or debug data to the traveler shell.
- Do not infer status from a client event or from `domain_outbox_effects`. The server owns event-to-consumer mapping and owner/resource predicate enforcement.
- Do not make user-visible answer completion depend on context extraction, annotation enrichment, or proposal drafting. Do not add an external queue, generic job API, browser redrive, polling loop, dead-letter UI, or worker deployment setting.
- `messages.answerAnnotations` are additive validated enrichment, not permission to mutate the immutable command terminal projection. Do not re-run annotations from normal reads for outbox-governed messages.
- Reconnection continues to be persisted-command replay with the original `Idempotency-Key`; the Nest/BFF endpoint, BFF credential forwarding, and byte-compatible NDJSON cutover remain Story 10.5 work.
- Preserve owner deletion and retained-command scrubbing. No error/status path may resurrect deleted question/assistant content or relationship IDs through command/outbox data.

### Testing Plan

Use `DATABASE_URL_TEST`; retain the serial Vitest integration setup. Lock/lease races require independent PostgreSQL connections, not mocks.

```bash
pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts
pnpm vitest run tests/chat-trip-context-extraction.test.ts tests/ai-ask-sessions.test.ts tests/answer-context.test.ts
pnpm vitest run tests/ai-ask-shell.test.ts tests/bff-transport.test.ts tests/api-platform-contract.test.ts tests/api-request-principal.integration.test.ts
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

### Scope Boundaries

- Story 10.3 owns the outbox event schema, deterministic enqueue, claims/leases/fencing/CAS, retry/exhaustion, consumer delivery, and `after()` removal. Do not reopen those mechanisms except for narrowly required regression proof.
- Story 10.5 owns Nest `POST /v1/ai-ask/stream`, BFF forwarding, protected API credentials/CSRF, byte-compatible NDJSON transport cutover, selected transport owner, and legacy Next writer retirement. No API/BFF controller, stream-payload expansion, or legacy writer change belongs here.
- Epic 11 owns `TripAnswerContext v1`, source-bundle/provenance withdrawal, and annotation detail-contract evolution. Do not create new source-bundle fields, withdrawal behavior, descriptor types, or action semantics.
- Epic 12 owns deployed worker runtime, schedule/Cron, health/readiness, operational telemetry/dashboard/alerts, shutdown, schema compatibility, and rollout evidence. This story must not claim deployment readiness.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 10: Reliable AI Ask API Cutover`]
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 10.4: Preserve Completed AI Ask Results While Consumers Run`]
- [Source: `_bmad-output/implementation-artifacts/epic-10-context.md#Requirements & Constraints`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-16: Nest Owns Source-Bundled NDJSON AI Ask Streaming`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-34: Durable Work Uses A PostgreSQL Transactional Outbox`]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-28.md#4.3 Update UX for API-Cutover Recovery`]
- [Source: `_bmad-output/project-context.md#Critical Implementation Rules`]
- [Source: `_bmad-output/implementation-artifacts/10-1-make-ai-ask-commands-idempotent.md`]
- [Source: `_bmad-output/implementation-artifacts/10-2-fence-terminal-ai-ask-persistence.md`]
- [Source: `_bmad-output/implementation-artifacts/10-3-dispatch-ai-ask-follow-up-work-through-a-transactional-outbox.md`]
- [Source: `src/features/ai/ai-ask-commands.ts`]
- [Source: `src/features/ai/domain-outbox.ts`]
- [Source: `src/features/ai/domain-outbox-worker.ts`]
- [Source: `src/features/chat-trips/conversations.ts`]
- [Source: `src/app/ai-ask/page.tsx`]
- [Source: `src/features/ai/ai-ask-composer.tsx`]

## Story Validation

### BMad Checklist Validation

- [x] All three authoritative acceptance criteria are reproduced and mapped to concrete read-model, immutability, consumer, reconnect, UI, and test tasks.
- [x] Story 10.1 idempotent replay, Story 10.2 fence/terminal/deletion guarantees, and Story 10.3 outbox/consumer guarantees are explicitly preserved rather than reimplemented.
- [x] The owner-scoped safe projection defines exact durable status mapping and prohibits operational, provider, payload, and ownership-data disclosure.
- [x] The read-time annotation backfill bypass is identified and constrained so outbox-governed post-answer enrichment cannot mutate an answer during a normal read.
- [x] Non-blocking Vietnamese-first shell behavior is explicit: the completed answer remains usable, consumer state is supplemental, and no worker/provider/polling/stream-contract work is introduced.
- [x] PostgreSQL owner isolation, deletion, retry, terminal-failure, fence, lease, duplicate-delivery, terminal-result immutability, and UI regressions are specified.
- [x] Scope excludes Story 10.5 transport cutover, Epic 11 context/provenance evolution, and Epic 12 worker deployment/operations.
- [x] Implementation and review evidence are recorded below; no migration, deployment, or Story 10.5 transport change was made.

### Validation Outcome

Passed. The artifact is implementation-ready: it defines the only permitted secondary consumer projection, preserves immutable completed command/result semantics, prevents the legacy read-time enrichment bypass, and has concrete owner/fence/deletion/UI verification coverage without pulling Story 10.5 or later-epic work forward.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story context created and validated on 2026-07-29 from the full Epic 10 plan/context, architecture spine, project context, completed Stories 10.1-10.3, active source/test seams, and recent Story 10.3 commits.

### Completion Notes List

- Added a bounded owner-scoped completed-command consumer-status projection with exact event-category mapping, pending/failed normalization, failure precedence, and operational-data exclusion.
- Removed normal shell-read annotation model/provider/persistence backfill; stored annotations remain sanitized and worker-owned enrichment is exclusive.
- Rendered supplemental Vietnamese optional-work notices without changing answer/provenance/feedback/done behavior, submission availability, original-key replay, or transport ownership.
- Completed synchronous Blind Hunter, Edge Case Hunter, and acceptance review/repair loops. Final read-only Blind/Edge reviews reported no findings; final acceptance audit was clean after bounded input repair.
- Serial PostgreSQL verification passed: command/outbox 49 tests, context/session 130 tests, shell/transport/API 176 tests. `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm lint` had zero errors and five pre-existing warnings.

### File List

- `_bmad-output/implementation-artifacts/10-4-preserve-completed-ai-ask-results-while-consumers-run.md`
- `_bmad-output/implementation-artifacts/spec-10-4-preserve-completed-ai-ask-results-while-consumers-run.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/features/ai/ai-ask-commands.ts`
- `src/features/chat-trips/conversations.ts`
- `src/app/ai-ask/page.tsx`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/ai-ask-commands.test.ts`
- `tests/domain-outbox.test.ts`
- `tests/chat-trip-context-extraction.test.ts`
- `tests/ai-ask-shell.test.ts`

## Code Review Record

- Outcome: approved after synchronous adversarial, edge-case, and acceptance review passes plus bounded repairs.
- Repairs: bounded/deduplicated consumer projection; real worker-path immutable-result regressions; omitted-status shell coverage; status-change-only live announcement; project mapping and deletion/scrubbing projections; bounded server input collection.
- Residual risk: Story 12 still owns deployed worker scheduling, readiness, telemetry, and rollout operations.
