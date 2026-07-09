---
title: 'Story 5.4: Web Search Adapter And Source Capture'
type: 'feature'
created: '2026-07-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-3-web-search-fallback-trigger.md'
warnings: []
baseline_revision: 'a820fc1138e3d24f9dcd98e4af63b90ff214aa8a'
final_revision: 'a820fc1138e3d24f9dcd98e4af63b90ff214aa8a'
---

<intent-contract>

## Intent

**Problem:** AI Ask can now decide when web fallback is needed, but it still has no provider adapter, no captured web source records, and no safe way to pass external source details into the answer prompt. Without this, current facts may be presented without traceable external support.

**Approach:** Add a server-only web search adapter and a minimal durable `web_search_results` capture table linked to the traveler turn, then integrate triggered web results into the source bundle before general reasoning. Keep provenance rows and traveler source UI out of this story; Story 5.5/5.6 will consume the captured records later.

## Boundaries & Constraints

**Always:** Run web search only after the Story 5.3 retrieval decision triggers it; capture normalized result records with title, URL, snippet/content, provider score, checked time, source type, confidence, and trigger reason; prefer official/provider-looking results in ranking while keeping all web results externally unverified; bound provider latency and prompt size; treat provider failure/low-quality results as warnings that do not block answer generation.

**Block If:** Implementation requires deciding a paid provider beyond the existing `TAVILY_API_KEY` environment seam, changing the AI Gateway contract, parsing assistant answer text, or adding answer provenance rows before Story 5.5.

**Never:** Do not present web results as approved XuyenViet knowledge, do not treat reposted/community/Facebook-like results as official without metadata, do not expose raw provider payloads or secrets, do not make web calls when fallback is false, and do not add traveler-facing source UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Triggered fallback with useful results | Retrieval decision has `webSearchTriggered=true`; adapter returns official/provider and general results | Official/provider-looking results rank first, normalized records are inserted, `bundle.web` contains captured safe DTOs, and prompt shows web data after approved knowledge and before general reasoning | No error expected |
| Fallback false | Retrieval decision has no trigger reasons | Adapter is not called, no web records are created, prompt does not claim web search ran | No error expected |
| Provider failure | Adapter throws, times out, or returns invalid provider response | Source bundle includes `web_search_load_failed`; prompt says web search was needed but unavailable and assistant must not invent current facts | Log sanitized warning only |
| Low-quality results | Adapter returns no URL/title/snippet usable records or all scores are below the local threshold | Capture no usable web rows, include `web_search_low_quality`, and prompt warns that current facts could not be verified | Do not block answer generation |
| Prompt-injection result text | Result title/snippet contains instruction-like text | Prompt delimits and JSON-quotes web data as untrusted data, not instructions | No error expected |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- Add `webSearchResults` table, result status/source type/confidence types, owner-linked conversation/user-message foreign keys, checks, and schema export.
- `drizzle/migrations/0025_add_web_search_results.sql` -- Create the durable capture table and indexes.
- `src/features/retrieval/web-search.ts` -- New server-only adapter boundary for Tavily-style search, normalization, ranking, quality filtering, and durable capture.
- `src/features/retrieval/source-bundle.ts` -- Call web search after retrieval decision triggers, add web warnings/result DTOs, and render web results safely in all prompt size paths.
- `tests/answer-context.test.ts` -- Cover source-bundle/route integration, prompt ordering, failure and low-quality warning behavior, and no-call behavior when fallback is false.
- `tests/web-search-adapter.test.ts` -- Cover adapter normalization/ranking/persistence behavior and sanitized failure results without real provider calls.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep Story 5.4 status aligned.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/0025_add_web_search_results.sql` -- Add durable web search result capture records linked to user/conversation/user message -- satisfy the explicit storage acceptance criterion while preserving later provenance ownership.
- [x] `src/features/retrieval/web-search.ts` -- Implement provider-neutral search result types, Tavily-backed adapter, official/provider preference, quality filtering, safe error codes, and `captureWebSearchResults` -- isolate external search details and prevent raw payload leakage.
- [x] `src/features/retrieval/source-bundle.ts` -- Invoke web search only for triggered fallback, persist normalized results, add web warnings, and render delimited web data in normal/compact/minimal prompts -- enforce source priority and safe answer behavior.
- [x] `tests/web-search-adapter.test.ts` -- Add adapter and persistence tests for the I/O matrix edge cases that do not require the route -- verify ranking, capture, quality filtering, and failure sanitation.
- [x] `tests/answer-context.test.ts` -- Add route/source-bundle tests for triggered search, no-call when not triggered, web prompt ordering, and provider failure degradation -- protect the AI Ask integration path.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 5.4 in progress/review/done as implementation advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given web search fallback is triggered, when the adapter runs, then it returns normalized title, URL, snippet/content, provider score, checked date/time, and source type/confidence when available.
- Given web search fallback is triggered, when usable results are returned, then web search result records are stored and linked to the traveler turn without storing raw provider payloads.
- Given official/provider and reposted/community-looking results are returned, when results are ranked for the source bundle, then official/provider pages are preferred and reposted/community results remain external/unverified.
- Given the provider fails or returns low-quality results, when the assistant prompt is prepared, then the failure/low-confidence state is recorded in the bundle and the assistant is instructed not to invent current facts.
- Given no fallback is triggered, when AI Ask prepares the source bundle, then no web provider call or web result record is created.

## Spec Change Log

- 2026-07-09: Implemented Tavily-backed web search adapter, durable normalized capture table, source-bundle integration, and tests; moved story to review.

## Review Triage Log

### 2026-07-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 1, medium 3, low 4)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Added missing Drizzle migration snapshot metadata and removed duplicate generated migration output so future schema generation starts from the correct `0025` state.
  - `[high]` `[patch]` Minimized/redacted traveler free-text before sending web-search queries to Tavily and added privacy coverage for email, phone, name, and child-age details.
  - `[medium]` `[patch]` Added a database check constraint for `web_search_results.trigger_reason` to preserve provenance integrity outside TypeScript callers.
  - `[low]` `[patch]` Added timeout coverage for the implemented `provider_timeout` branch.
  - `[low]` `[patch]` Marked triggered web fallback without a user message id as an explicit warning instead of silently skipping search.
  - `[low]` `[patch]` Classified malformed JSON provider responses as `invalid_provider_response` instead of request failure.
  - `[low]` `[patch]` Rejected overlong provider URLs instead of truncating them into invalid persisted/prompted URLs.
  - `[medium]` `[patch]` Asserted captured web results link to a user message, preventing accidental attachment to assistant turns.

### 2026-07-09 — Follow-up review findings
- [x] [Review][Patch] Keep web-search confidence externally unverified until operator approval [src/features/retrieval/web-search.ts:241] -- Fixed by narrowing web-search result confidence to `unverified` in schema, migration metadata, normalized DTOs, capture rows, prompt tests, and persistence tests.
- [x] [Review][Patch] Classify official web sources from parsed hostnames, not URL substrings or title text [src/features/retrieval/web-search.ts:264] -- Fixed by classifying official sources from parsed `.gov.vn` hostnames only and adding spoofed URL/title regression coverage.
- [x] [Review][Patch] Skip provider calls when privacy minimization leaves an empty query [src/features/retrieval/web-search.ts:64] -- Fixed by returning `empty_query` before provider calls when minimization leaves no searchable text, with privacy-label stripping for orphaned personal-detail labels.
- [x] [Review][Patch] Make web result capture idempotent for the same traveler turn [src/features/retrieval/web-search.ts:143] -- Fixed by replacing existing provider rows for the same user/conversation/user message before insert and making the `(user_message_id, rank)` index unique.
- [x] [Review][Patch] Propagate request cancellation into web search before external call and capture [src/features/retrieval/source-bundle.ts:138] -- Fixed by threading `AbortSignal` from the stream route into source-bundle assembly, provider fetch, and pre-capture checks.
- [x] [Review][Patch] Bound provider response/body size before JSON parsing and text normalization [src/features/retrieval/web-search.ts:95] -- Fixed by limiting provider response reads before JSON parse and slicing raw text before whitespace normalization/clipping.

## Design Notes

Web result records are linked to the user message, not the assistant message, because this story captures search results before answer generation. Story 5.5 can later attach assistant-message provenance to these records transactionally with the final assistant message.

## Verification

**Commands:**
- `pnpm test:run tests/web-search-adapter.test.ts` -- expected: adapter, ranking, quality, and capture tests pass without real web calls.
- `pnpm test:run tests/answer-context.test.ts` -- expected: source-bundle and AI Ask route integration tests pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Added durable `web_search_results` schema/migration with owner-linked user, conversation, and user-message foreign keys; stored only normalized result fields, not raw provider payloads.
- Added server-only Tavily adapter behind `TAVILY_API_KEY` with normalized DTOs, official/provider/community/general classification, score filtering, safe failure codes, timeout handling, and capture helper.
- Integrated web search into source-bundle after the Story 5.3 retrieval decision only; failure and low-quality states become non-blocking warnings.
- Rendered web results as delimited untrusted data after approved knowledge and before general reasoning in normal, compact, and minimal prompt paths.

### Verification Results

- `pnpm test:run tests/web-search-adapter.test.ts tests/answer-context.test.ts` -- passed, 35 tests.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.
- `pnpm typecheck` -- initial parallel run with `pnpm build` failed because `.next/types` files were being regenerated concurrently; rerun serially passed.
- `pnpm test:run tests/web-search-adapter.test.ts tests/answer-context.test.ts` -- passed, 38 tests after review patches.
- `pnpm lint` -- passed after review patches.
- `pnpm typecheck` -- passed after review patches when rerun serially after `pnpm build` regenerated `.next/types`.
- `pnpm build` -- passed after review patches.
- `pnpm test:run tests/web-search-adapter.test.ts tests/answer-context.test.ts` -- passed, 41 tests after follow-up review patches.
- `pnpm lint && pnpm typecheck && pnpm build` -- passed after follow-up review patches.

### File List

- `_bmad-output/implementation-artifacts/spec-5-4-web-search-adapter-and-source-capture.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0025_add_web_search_results.sql`
- `drizzle/migrations/meta/0025_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/db/schema.ts`
- `src/features/retrieval/source-bundle.ts`
- `src/features/retrieval/web-search.ts`
- `tests/answer-context.test.ts`
- `tests/web-search-adapter.test.ts`

## Auto Run Result

Status: done

Summary: Implemented Story 5.4. AI Ask now runs web search only after the deterministic fallback decision, captures normalized Tavily results in durable `web_search_results` rows linked to the traveler turn, and renders external web data as untrusted source-bundle data before general reasoning.

Files changed:
- `_bmad-output/implementation-artifacts/spec-5-4-web-search-adapter-and-source-capture.md` -- recorded story spec, implementation notes, review triage, verification, and result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 5.4 done.
- `drizzle/migrations/0025_add_web_search_results.sql` -- added the web search result table, constraints, indexes, and owner/message foreign keys.
- `drizzle/migrations/meta/0025_snapshot.json` -- added Drizzle snapshot metadata for the new table.
- `drizzle/migrations/meta/_journal.json` -- registered the Story 5.4 migration.
- `src/db/schema.ts` -- added web search result types/table and schema export.
- `src/features/retrieval/source-bundle.ts` -- integrated triggered web search, capture, warnings, and untrusted web prompt rendering.
- `src/features/retrieval/web-search.ts` -- added Tavily adapter, query minimization, normalization/ranking/filtering, capture helper, and safe failure handling.
- `tests/answer-context.test.ts` -- added source-bundle and AI Ask route coverage for web fallback integration, abort handling, and failure paths.
- `tests/web-search-adapter.test.ts` -- added adapter, privacy, quality, timeout, URL spoofing, bounded response, idempotent persistence, and user-message role tests.

Review findings breakdown: 8 patch findings fixed (1 high, 3 medium, 4 low), 0 deferred, 0 rejected.

Follow-up review recommendation: true.

Verification performed:
- `pnpm test:run tests/web-search-adapter.test.ts tests/answer-context.test.ts` -- passed, 38 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Residual risks:
- Tavily remains a provisional provider until Story 5.8 validates Vietnamese corridor result quality.
- Story 5.5 still needs to persist retrieval decisions and assistant-answer provenance rows using the captured web result records.
- No commit was created because repository instructions require explicit approval before committing.
