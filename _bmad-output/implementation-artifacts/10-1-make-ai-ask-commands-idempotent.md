# Story 10.1: Make AI Ask Commands Idempotent

Status: ready-for-dev

## Story

As a traveler,
I want retries of the same AI Ask request to be safe,
so that network uncertainty cannot create duplicate turns, provider calls, or assistant answers.

## Acceptance Criteria

1. Given an authenticated AI Ask request has a 16-128 character URL-safe ASCII `Idempotency-Key`, when AI Orchestration accepts a new command for a conversation or selected Trip Project scope, then it creates `ai_ask_commands` uniquely by user, scope kind, scope ID, and key. The row stores the normalized question, attachment metadata, selected-scope SHA-256 digest, command status, message references, terminal result, and a 24-hour expiry. An unscoped new conversation receives a command-generated scope ID only after command creation.
2. Given the owner retries the same scope/key with an identical normalized digest, when the original command is pending, then return its persisted conversation/message identifiers and `in_progress` without another provider call. When the command is terminal, return its persisted terminal result without another user turn, assistant message, provenance, or provider call.
3. Given the same scope/key has a different normalized digest or the key format is invalid, when the request is validated, then return safe `idempotency_key_reused` or a validation failure before persisting a turn or calling a provider. Command expiry permits a later request only through a new command/key under the retention policy.

## Tasks / Subtasks

- [ ] Define the AI Orchestration command-ledger model and migration (AC: 1-3)
  - [ ] Add `ai_ask_commands` to `src/db/schema.ts` and generate the next forward-only Drizzle migration and metadata from the current migration journal.
  - [ ] Persist only safe, bounded command input/result data: owner, scope, key, normalized request/digest, lifecycle status, message references, terminal projection, timestamps, and expiry. Never persist image bytes/data URLs, prompts, provider payloads, credentials, cookies, raw source material, or exception text.
  - [ ] Enforce the database identity `(user_id, scope_kind, scope_id, idempotency_key)` and schema constraints needed for strict key, digest, status, and expiry invariants. Add lookup/retention indexes justified by the command read paths.
  - [ ] Keep foreign keys compatible with existing owner conversation/Trip Project deletion cascades. Do not add Story 10.2 lifecycle/aggregate fence semantics early.
- [ ] Create one AI Orchestration command-acquisition service (AC: 1-3)
  - [ ] Add an AI-owned server-only module, for example `src/features/ai/ai-ask-commands.ts`, that is the sole place for key validation, canonical request normalization/digest construction, owner-scoped scope resolution, and transactionally acquiring or replaying a command.
  - [ ] Use the unique database constraint as the concurrency arbiter. A conflict loser must lock/read the durable winner and compare its digest before any turn or provider work; never use a read-then-insert existence check.
  - [ ] Canonicalize exactly the question used for persistence/prompting. Include explicit scope semantics, selected scope digest, validated attachment metadata, and attachment-content SHA-256 in the request identity so distinct images with matching filename/MIME/size cannot replay as identical.
  - [ ] Resolve conversations and Trip Projects with owner predicates inside the acquisition transaction. Reuse existing lock/primary-conversation patterns rather than accepting a browser-controlled unscoped scope ID.
  - [ ] For a genuinely new unscoped request, generate the server-side command scope first, create the command, then create/link the conversation. Replays must recover the original persisted conversation instead of creating another one.
  - [ ] Return a typed acquisition outcome: admitted command, identical pending replay, identical terminal replay, safe key-reused failure, or safe validation failure. Keep terminal replay data limited to the existing safe browser result shape.
- [ ] Integrate acquisition ahead of the current single legacy writer (AC: 1-3)
  - [ ] Update `src/app/api/ai-ask/stream/route.ts` so it obtains/adopts/replays a command before it persists a user message, performs retrieval, selects a model, or invokes the provider.
  - [ ] Preserve the current route as the only AI Ask command writer for this story. Do not add Nest `POST /v1/ai-ask/stream`, BFF forwarding, a second writer, or a legacy/API compatibility path; Story 10.5 owns that cutover.
  - [ ] Preserve the existing atomic assistant/provenance/usage transaction and current NDJSON behavior. Do not claim terminal fence verification, `discarded` results, durable follow-up dispatch, or consumer recovery: Stories 10.2-10.4 own those guarantees.
  - [ ] Terminalize the command with a bounded safe status/result for every terminal route outcome, including success, provider failure, caller abort, final assistant/provenance/usage persistence failure, and outer route failure. An identical retry must replay that exact safe terminal projection without side effects; define caller-abort behavior consistently with the existing UI/NDJSON contract. Never retain raw provider errors, exceptions, prompts, image bytes, source bundles, or internal diagnostics.
  - [ ] Ensure replay paths perform no provider call, no additional user/assistant/provenance/usage write, and no `after()`/annotation/proposal follow-up scheduling.
  - [ ] Return only safe validation/key-reuse recovery data. Do not expose provider errors, source bundles, SQL, stack traces, raw inputs, or private configuration.
- [ ] Carry the key through the browser submission boundary (AC: 1-3)
  - [ ] Update `src/features/ai/ai-ask-composer.tsx` to generate a key for one logical submit, send it in `Idempotency-Key`, and retain it for ambiguous transport retry/reconnect of that exact payload.
  - [ ] Generate a new key only for a deliberate new request/payload. Preserve existing in-component duplicate-submit protection, abort behavior, Vietnamese UI, and NDJSON rendering.
  - [ ] Do not expose a BFF/API credential or make a direct browser call to the private API.
- [ ] Prove idempotency, ownership, and non-regression behavior (AC: 1-3)
  - [ ] Add focused PostgreSQL-backed command tests, for example `tests/ai-ask-commands.test.ts`, covering accepted 16/128-character keys, invalid boundaries/characters, same-key pending and terminal replay, provider failure/caller abort/final-persistence failure replay, changed question, changed image content with identical metadata, owner/scope isolation, unscoped command-first creation, expiry/new-key behavior, safe replay serialization, and concurrent first delivery.
  - [ ] Prove concurrent acquisition creates exactly one command, one user turn, and one provider invocation using independent database connections/transactions, not concurrent calls through the single shared test connection.
  - [ ] Extend existing route coverage only where required to prove acquisition occurs before provider work and preserves image, source-bundle, provenance, usage, extraction, annotation, and proposal behavior.
  - [ ] Run focused suites, migration-backed tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Record exact results and blockers in the Dev Agent Record.

## Dev Notes

### Implementation Guardrails

- AI Orchestration owns the command ledger and assistant-response provenance; Chat/Trips owns conversations, messages, and Trip Projects; Usage owns append-only usage events. Call feature-owned APIs rather than direct cross-domain aggregate mutation.
- The browser remains behind the Next BFF. It must never receive an internal credential or call the private Nest API directly. Reuse Epic 9 safe-error, correlation, CSRF, BFF credential, and abort/timeout primitives where the transport requires them; do not recreate them.
- `Idempotency-Key` is a strict 16-128 URL-safe ASCII value. JWT `jti` is not a replay ledger. The unique scope is owner plus scope kind/ID plus key, not a global key; the same key may be used by another owner or another scope.
- The request identity must be deterministic and versioned. It covers the normalized question actually persisted/prompted, selected scope, validated attachment metadata, and an attachment content digest. Metadata alone is insufficient for image identity.
- Admission must precede all side effects. Invalid keys and key/digest conflicts cannot create a user turn, select a model, query retrieval/search, call a provider, or enqueue/schedule follow-up work.
- Do not use a `WHERE expires_at > now()` partial unique index: PostgreSQL requires partial-index predicates to be immutable. Keep the durable unique identity and enforce 24-hour retention/expiry through transactional logic and a compatible cleanup approach.
- A pending identical replay must return `in_progress`; it must not silently take over provider execution. Any lease/recovery policy beyond this contract requires explicit Story 10.2-10.4 design.
- Store/replay only the safe existing terminal projection. A terminal command must not expose raw prompts, image bytes, provider responses/errors, retrieval/source bundle contents, tokens, cookies, SQL, or stack traces.
- Every terminal route outcome must write a safe terminal command state/result, including provider failure, caller abort, final persistence failure, and outer route failure. A same-key retry must replay that result without creating work or remaining `in_progress`; caller-abort status/result must match the established UI and NDJSON behavior.
- Preserve the current atomic assistant/provenance/usage persistence boundary until Story 10.2 changes it to include command terminalization and owner-fence verification. Do not split final state to implement idempotency.
- Existing `after()` extraction, annotation persistence, and proposal drafting are not durable command consumers today. Do not add retry/fire-and-forget behavior around them; Story 10.3 replaces those paths with the transactional outbox.
- Schema work is forward-only Drizzle migration work. Migration runs before dependent traffic; later durable/overlapping runtime rollout must use expand-migrate-contract and traffic/code rollback, never destructive schema rollback.

### Existing Code to Read and Preserve

- `src/app/api/ai-ask/stream/route.ts` is the current and only legacy AI Ask writer. It authenticates, validates multipart input, persists the user turn before retrieval/provider work, streams NDJSON, atomically persists assistant/provenance/usage, then schedules follow-up behavior. It currently has no request ledger or replay behavior. Refactor its entry sequence, but preserve its established source-bundle, image, error/abort, terminal persistence, annotation, and proposal behavior unless a task explicitly requires a change.
- `src/features/ai/ai-ask-composer.tsx` currently avoids duplicate submits only in one mounted component and posts to `/api/ai-ask/stream` without an idempotency header. Preserve its stream parsing and UI behavior while retaining the key across retry/reconnect for the same logical request.
- `src/features/chat-trips/conversations.ts` and `src/features/chat-trips/trip-projects.ts` contain owner-scoped `FOR UPDATE` and primary-conversation resolution patterns. Reuse these patterns; do not separately check ownership outside the command-acquisition transaction.
- `src/features/ai/gateway.ts` and `src/server/bff-api-client.ts` distinguish caller abort from local timeout. Preserve that distinction: a retry after either must acquire/replay the existing command, never create duplicate work.
- `src/db/schema.ts` owns the existing persistence declarations. `drizzle/migrations/meta/_journal.json` identifies the next migration number; do not assume it.
- `src/server/protected-bff-adapter.ts`, `src/server/bff-api-client.ts`, `packages/contracts/src/index.ts`, and Epic 9 tests establish narrow key forwarding and safe envelope patterns. Do not enlarge shared public contracts or create the Nest AI Ask controller before Story 10.5.

### Project Structure Notes

- Keep command orchestration under `src/features/ai/`; keep database schema/migrations in their existing Drizzle locations; keep integration tests under `tests/`.
- Use strict TypeScript, `@/*` imports for app code, `server-only` for server-only command/persistence code, and existing Vitest/PostgreSQL integration conventions.
- No new `apps/web`, generic API SDK, worker runtime, public API origin, broad shared stream DTO, or compatibility layer is needed for this story.
- User-facing recovery copy remains Vietnamese-first and must not expose internal details. Existing UI/recovery behavior is presentation only; authorization and ownership remain server-side.

### Testing Requirements

- Use `DATABASE_URL_TEST` PostgreSQL integration coverage. `vitest.config.ts` uses a serial shared test connection; concurrency tests require separate connections/transactions to represent a real unique-index race.
- Test no-provider/no-turn side effects for invalid key and changed-digest paths. Spy or assert at the route/gateway boundary rather than inferring from a response alone.
- Test same-key behavior across existing conversation, selected Trip Project, and unscoped new-conversation paths. Test identical replays both before terminalization and after a persisted terminal result.
- Test same-key replay after provider failure, caller abort, and final persistence failure. Each must produce a safe terminal projection and must neither remain `in_progress` nor invoke the provider again.
- Regression-test that replay does not duplicate assistant messages, provenance, usage, image attachment records, extraction, annotation, or proposal work.
- Verify owner isolation and deletion-compatible foreign-key behavior. Do not write or assert Story 10.2 fence/discard behavior as if it exists.
- Expected verification commands after implementation:

```bash
pnpm vitest run tests/ai-ask-commands.test.ts
pnpm vitest run tests/answer-context.test.ts tests/chat-trip-context-extraction.test.ts tests/ai-ask-sessions.test.ts
pnpm vitest run tests/bff-transport.test.ts tests/api-platform-contract.test.ts tests/api-request-principal.integration.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

### Scope Boundaries

- Story 10.2 owns captured conversation/project fences, conditional finalization, `discarded`, and `refresh_required` terminal behavior.
- Story 10.3 owns `domain_outbox`, worker claims/leases/fencing, dedupe, retries, and eliminating `after()`/fire-and-forget follow-up work.
- Story 10.4 owns consumer-state read models and the guarantee that delayed/failed consumers cannot mutate a completed answer.
- Story 10.5 owns the Nest `POST /v1/ai-ask/stream` endpoint, BFF forwarding, byte-compatible NDJSON cutover, and retirement of the matching legacy writer.
- Epic 11 owns canonical TripAnswerContext, source-bundle evolution, provenance withdrawal, and annotations; Epic 12 owns worker runtime operations; Epic 14 owns public-launch/deployed cutover evidence.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 10: Reliable AI Ask API Cutover]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-16: Nest Owns Source-Bundled NDJSON AI Ask Streaming]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.8 API, Runtime, And Deployment Boundary]
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-28.md#4.2 Replace Technical Migration Framing With Capability Cutovers]
- [Source: _bmad-output/project-context.md#Critical Implementation Rules]
- [Source: _bmad-output/implementation-artifacts/epic-9-context.md#Technical Decisions]
- [Source: _bmad-output/implementation-artifacts/9-3-enforce-the-private-bff-transport-boundary.md#Implementation Guardrails]
- [Source: src/app/api/ai-ask/stream/route.ts]
- [Source: src/features/ai/ai-ask-composer.tsx]
- [Source: src/features/chat-trips/conversations.ts]
- [Source: src/features/chat-trips/trip-projects.ts]
- [Source: src/db/schema.ts]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story creation only. No production code, schema, migration, test, database, or runtime command was executed.

### Completion Notes List

- Comprehensive Story 10.1 implementation guide created from the current PRD, architecture spine, active Epic 10 plan, approved sprint change proposal, Epic 9 foundation context, and current AI Ask implementation patterns.
- Validation passed on 2026-07-28: acceptance criteria are complete and traceable; task coverage maps to all criteria; schema/concurrency, all terminal replay outcomes, safe-error, ownership, attachment-identity, migration, testing, and scope-boundary guardrails are explicit; no Story 10.2-10.5 work is pulled forward.
- Status is `ready-for-dev`. This artifact does not claim implementation or test completion.

### File List

- _bmad-output/implementation-artifacts/10-1-make-ai-ask-commands-idempotent.md
