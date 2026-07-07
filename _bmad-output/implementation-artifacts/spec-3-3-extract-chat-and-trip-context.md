---
title: 'Extract Chat And Trip Context'
type: 'feature'
created: '2026-07-07'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
baseline_revision: '039e2a000ace86760d04a651c6066a3557417ef5'
final_revision: 'UNCOMMITTED'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-2-create-trip-projects.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Travelers can chat inside ordinary sessions or selected trip projects, but the app does not yet extract structured travel-planning context from those turns for later reuse, correction, deletion, or retrieval.

**Approach:** Add Chat/Trips-owned context persistence and an extraction path that runs after a valid user message is saved. The extractor stores only allowlisted travel fields, keeps chat-scoped and project-scoped facts distinct, rejects clearly disallowed sensitive data, and does not use extracted context in answers yet.

## Boundaries & Constraints

**Always:**
- Context rows must be owned by the authenticated user and source-linked to the saved user message that produced them.
- With no selected trip project, extracted facts are conversation-scoped only.
- With a selected owned trip project, durable trip-planning facts may be project-scoped; temporary turn-specific facts stay conversation-scoped.
- Allowed context fields are fixed: `origin`, `destination`, `start_date`, `end_date`, `duration`, `adults`, `children`, `children_ages`, `budget`, `hotel_style`, `driving_tolerance`, `vehicle_needs`, `food_preferences`, `activity_preferences`, `itinerary_constraints`, `avoid_places`, `prior_trips`, `notes`.
- Reject disallowed sensitive data before persistence, including child full names, phone/email/address/government IDs, medical details, payment data, credentials, and unrelated personal facts.
- Extraction model selection must use purpose `extraction` and require text input plus extraction capability.
- Extraction failure, missing extraction model, malformed model JSON, or no allowed facts must not block the normal AI Ask answer stream.

**Block If:**
- Implementing this story requires showing or using extracted context in answer prompts; that belongs to Story 3.4.
- The schema cannot enforce owner/scope/source-message integrity for context rows.

**Never:**
- No embeddings, retrieval, provenance/source UI, project edit UI, correction UI, deletion UI, or context-aware answer generation.
- Do not store raw provider payloads, raw sensitive facts, image-derived facts, or unbounded free-form memory.
- Do not write context for unauthenticated, invalid, cross-user, or conversation/project-mismatch requests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ordinary chat extraction | Authenticated user asks in a conversation with no project; extraction returns allowed trip facts | Allowed facts are stored as conversation-scoped context linked to that user's message | No user-visible extraction event |
| Project-scoped extraction | Authenticated user asks inside an owned selected project; extraction returns durable and temporary facts | Durable facts are stored as project-scoped context; temporary facts are stored as conversation-scoped context | No user-visible extraction event |
| Invalid scope | Cross-user project/conversation or project mismatch | No extraction model call and no context rows | Existing AI Ask stream error path handles the request |
| Unsafe or malformed extraction | Provider returns invalid JSON, unknown fields, sensitive data, blank values, or unsupported scope | Invalid facts are ignored; allowed safe facts may still persist | Log server-side warning only; answer stream continues |
| No extraction model | No active default extraction-capable model exists | No provider call and no context rows | Answer stream continues normally |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- add context field/scope/status values and `chatContext` table with owner, conversation, optional trip project, source message, field, value, confidence, timestamps, and integrity checks.
- `drizzle/migrations/*` -- generated migration and metadata for the context table.
- `src/features/ai/gateway.ts` -- add non-streaming OpenAI-compatible extraction completion helper with safe failure result and usage parsing.
- `src/features/ai/prompts.ts` -- add extraction purpose/version and build a compact JSON-only extraction prompt from the latest user message and recent history.
- `src/features/chat-trips/context-extraction.ts` -- new server-only module to select the extraction model, call the gateway, validate/sanitize allowlisted facts, persist scoped context, and record non-sensitive audit summaries.
- `src/app/api/ai-ask/stream/route.ts` -- invoke context extraction only after the user message and scope have been validated/persisted; keep failures non-blocking.
- `tests/chat-trip-context-extraction.test.ts` -- cover ordinary/project scope, unsafe/malformed output, missing model, ownership/scope denial, and database constraints.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` -- add context field/scope/status constants and the `chatContext` table with owner-scoped FKs and checks -- gives extracted context a first-class, deletable data model.
- [x] `drizzle/migrations/*` -- generate migration artifacts for the context table -- keeps schema reproducible for test and deploy.
- [x] `src/features/ai/gateway.ts` -- add a non-streaming extraction completion helper using the existing gateway URL/env/timeout behavior -- enables JSON extraction without changing answer streaming.
- [x] `src/features/ai/prompts.ts` -- add extraction prompt constants and builder -- keeps prompt versioning explicit for usage records.
- [x] `src/features/chat-trips/context-extraction.ts` -- implement extraction orchestration, allowlist validation, sensitive-data rejection, scoped persistence, audit recording, and AI usage recording -- owns context writes inside Chat/Trips.
- [x] `src/app/api/ai-ask/stream/route.ts` -- trigger non-blocking extraction after user-message persistence and before/alongside answer generation without adding user-visible stream events -- integrates extraction with AI Ask safely.
- [x] `tests/chat-trip-context-extraction.test.ts` -- add integration tests for the I/O matrix and direct DB constraint failures -- verifies scope, safety, and no-side-effect boundaries.

**Acceptance Criteria:**
- Given an authenticated user asks in ordinary chat, when extraction returns allowed travel details, then the app stores only conversation-scoped context linked to the saved user message.
- Given an authenticated user asks inside an owned trip project, when extraction returns durable project facts and temporary chat facts, then durable facts are project-scoped and temporary facts remain conversation-scoped.
- Given a cross-user project/conversation, mismatched project, invalid question, or unauthenticated request, when the request is handled, then no extraction provider call occurs and no context rows are written.
- Given the extraction provider returns sensitive, unknown, blank, or malformed content, when validation runs, then unsafe content is not persisted and the answer stream still completes or fails according to the answer provider only.

## Spec Change Log

Empty — no bad_spec loopback occurred.

## Review Triage Log

### 2026-07-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 2, medium 4, low 0)
- defer: 0
- reject: 7
- addressed_findings:
  - `[high]` `[patch]` Strengthened sensitive-data filtering so common child-name forms like `bé An 8 tuổi` and unrelated personal facts are rejected before context persistence.
  - `[high]` `[patch]` Added same-user project-scope DB integrity by introducing `conversations_id_trip_project_user_id_idx`, `chat_context_conversation_trip_project_owner_fk`, and a regression test preventing context from linking a project A conversation/message to project B.
  - `[medium]` `[patch]` Made extraction fire-and-forget from the AI Ask stream so slow extraction cannot delay final answer stream events, with route regression coverage.
  - `[medium]` `[patch]` Stopped coercing unsupported provider scopes to `conversation`; unsupported scopes are now ignored.
  - `[medium]` `[patch]` Classified extraction request aborts as `client_stream_aborted` instead of generic gateway network failures.
  - `[medium]` `[patch]` Made context insertion, audit recording, and successful extraction usage recording atomic in one transaction.

### 2026-07-07 — Follow-up review (pass 2, code review workflow)
- Layers run: Blind Hunter, Edge Case Hunter, Acceptance Auditor (all completed).
- Acceptance Auditor: all 4 acceptance criteria satisfied; all Always/Block If/Never constraints respected; 1 low observability finding.
- Triage: 2 decision-needed, 12 patch (high 1, medium 4, low 7), 1 defer, 1 dismissed.

### Review Findings (2026-07-07 — pass 2, follow-up)

- [x] [Review][Patch] Best-effort extraction is coupled to the request lifecycle — restructure with `after()` from `next/server` so extraction runs after the response is sent, decoupled from `request.signal` and serverless freezing [src/app/api/ai-ask/stream/route.ts:189-202] [high] (resolved from decision-needed: user chose `after()`)
- [x] [Review][Patch] `unrelatedPersonalPatterns` requires an explicit name marker — relax to match relationship word + capitalized proper noun so 'vợ Lan' is caught while 'vợ tôi thích đi biển' still passes [src/features/chat-trips/context-extraction.ts:38] [medium] (resolved from decision-needed: user chose relax to catch proper nouns)
- [x] [Review][Patch] Child-name safety net requires an age suffix — `src/features/chat-trips/context-extraction.ts:36` [high]
- [x] [Review][Patch] Vietnamese three-word full names escape the child-name pattern (regex matches at most two capitalized words before the age) — `src/features/chat-trips/context-extraction.ts:36` [medium]
- [x] [Review][Patch] Successful extraction usage event is lost when the persistence transaction rolls back (usage event is inside `db.transaction` while failure/no-facts paths write directly to `db`) — `src/features/chat-trips/context-extraction.ts:125-171` [medium]
- [x] [Review][Patch] `max_tokens: 700` can truncate valid JSON and silently drop all facts with no distinction between model garbage and gateway cutoff — `src/features/ai/gateway.ts:195` [medium]
- [x] [Review][Patch] Non-string fact values (numbers, arrays) are silently dropped; allowlisted numeric/array fields like `adults`, `children`, `children_ages`, `budget`, `duration` can never persist when the model uses native JSON types — `src/features/chat-trips/context-extraction.ts:196` [medium]
- [x] [Review][Patch] Markdown-wrapped JSON (``` ```json ... ``` ```) from the model is not stripped before `JSON.parse`, causing silent total loss of facts — `src/features/chat-trips/context-extraction.ts:228-236` [medium]
- [x] [Review][Patch] Phone regex misses common formatted numbers (parentheses, no leading 0/84) — `src/features/chat-trips/context-extraction.ts:30` [low]
- [x] [Review][Patch] Sensitive-data check runs after `sanitizeContextValue` truncation; a pattern straddling the 500-char boundary can survive — `src/features/chat-trips/context-extraction.ts:204-206` [low]
- [x] [Review][Patch] Failure/no-facts `writeAiUsageEvent` writes are unguarded; a throw masks the original extraction error and loses the usage audit row — `src/features/chat-trips/context-extraction.ts:82,103` [low]
- [x] [Review][Patch] Duplicate facts (same `field` + `scope`) within one extraction are both persisted; no in-memory dedup and no DB unique constraint — `src/features/chat-trips/context-extraction.ts:195-223` [low]
- [x] [Review][Patch] Unicode invisible characters (`\u200B`, `\u202E`, `\uFEFF`) are not stripped by `sanitizeContextValue`, enabling display-spoofing in `notes`-style fields — `src/features/chat-trips/context-extraction.ts:238-242` [low]
- [x] [Review][Patch] Provider error in a 200 response body (`{"error": {...}}` with no `choices`) is not surfaced; `parseCompletionContent` logs only `missing_completion_content` and discards the provider message — `src/features/ai/gateway.ts:412-424` [low]
- [x] [Review][Patch] Individual rejected facts (unknown field, sensitive data, blank value, unsupported scope) are silently skipped without a server-side warning, contrary to the I/O matrix's "Log server-side warning only" — `src/features/chat-trips/context-extraction.ts:200-212` [low]
- [x] [Review][Defer] `.slice(0, 500)` can split grapheme clusters / decomposed Vietnamese diacritics (NFD) — `src/features/chat-trips/context-extraction.ts:241` — deferred, Vietnamese text is almost always NFC and grapheme-aware slicing adds complexity for a rare case

## Design Notes

Use one `chat_context` table for both conversation-scoped and project-scoped context. A row always has `conversation_id` and `source_message_id`; `trip_project_id` is nullable. `scope='conversation'` requires null `trip_project_id`; `scope='trip_project'` requires non-null `trip_project_id`. This keeps deletion behavior tied to the source conversation while allowing project facts to be filtered by project later.

Extraction should be best-effort for Story 3.3: if it fails, log and write a failure usage event when a model call was attempted, but do not change the answer stream contract. Story 3.4 will decide when extracted context becomes answer input.

## Verification

**Commands:**
- `pnpm db:generate` -- expected: migration generated for `chat_context`.
- `pnpm test:run tests/chat-trip-context-extraction.test.ts` -- expected: all Story 3.3 integration tests pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no type errors.
- `pnpm test:run` -- expected: all tests pass.
- `pnpm build` -- expected: production build succeeds.

## Auto Run Result

**Summary:** Implemented Story 3.3 -- Extract Chat And Trip Context. Added owner-scoped `chat_context` persistence, generated migration artifacts, non-streaming extraction gateway support, prompt versioning/builder, Chat/Trips extraction orchestration with allowlist and sensitive-data rejection, non-blocking AI Ask stream integration, usage/audit recording, and focused integration tests.

**Files changed:**
- `src/db/schema.ts` -- added context field/scope/status constants and `chatContext` with owner/source/scope constraints.
- `drizzle/migrations/0012_smart_bastion.sql` -- generated `chat_context` table migration.
- `drizzle/migrations/0013_quick_random.sql` -- review-driven migration adding same-user conversation/project/context integrity.
- `drizzle/migrations/meta/_journal.json`, `drizzle/migrations/meta/0012_snapshot.json`, and `drizzle/migrations/meta/0013_snapshot.json` -- migration metadata.
- `src/features/ai/gateway.ts` -- added non-streaming extraction completion helper and JSON response parsing.
- `src/features/ai/prompts.ts` -- added extraction purpose/version constants and JSON-only prompt builder.
- `src/features/chat-trips/context-extraction.ts` -- added extraction model selection, gateway call, validation/sanitization, transactional persistence/audit/usage, and stricter unsafe-content handling.
- `src/app/api/ai-ask/stream/route.ts` -- triggers best-effort non-blocking extraction after validated user-message persistence without user-visible stream events.
- `tests/chat-trip-context-extraction.test.ts` -- added focused extraction, route integration, no-provider-call, safety, and DB constraint coverage.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 3.3 done.

**Review findings breakdown:**
- Patches applied: 6 (2 high, 4 medium).
- Items deferred: 0.
- Items rejected: 7.

**Follow-up review recommendation:** true -- review patches touched data privacy, DB integrity, async route behavior, and transactional consistency.

**Verification performed:**
- `pnpm db:generate` -- passed; generated `0013_quick_random.sql` for review-driven schema integrity changes after initial `0012_smart_bastion.sql`.
- `pnpm test:run tests/chat-trip-context-extraction.test.ts` -- passed; 9 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm test:run` -- passed; 9 files, 125 tests.
- `pnpm build` -- passed.

**Residual risks:** A real deployment still needs an active default extraction-capable model configured for purpose `extraction`; Story 3.4 owns using extracted context in answers.

**Blockers:** None.
