---
title: 'Story 5.5: Persist Retrieval Decision And Answer Provenance'
type: 'feature'
created: '2026-07-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-4-web-search-adapter-and-source-capture.md'
warnings: []
baseline_revision: 'f320ab79f898ed89907a2374083e32b01a8fc9aa'
final_revision: 'f320ab79f898ed89907a2374083e32b01a8fc9aa'
---

<intent-contract>

## Intent

**Problem:** AI Ask currently assembles retrieval decisions, approved knowledge, web results, and general reasoning inputs, but only the assistant text is durable. Without persisted decision and provenance rows, later source/confidence UI, audit, and evaluation cannot know which inputs influenced an answer.

**Approach:** Add durable answer retrieval-decision and row-per-source-item provenance tables linked to the final assistant message, then persist them in the same transaction as the assistant message. Store compact safe snapshots and source references only; keep traveler-facing rendering for Story 5.6.

## Boundaries & Constraints

**Always:** Persist the assistant message, retrieval decision, and provenance rows atomically; include candidate counts, selected counts, threshold/target, freshness/conflict flags, web-search trigger flag/reasons, and general-reasoning-used flag; write one provenance row for each applicable trip/chat context, approved knowledge, web result, and general reasoning source item; distinguish `used_in_prompt` from `cited_in_answer`; keep snapshots bounded and free of raw provider payloads, operator-only raw material, and secrets.

**Block If:** The implementation requires parsing assistant answer text for citations, changing the AI Gateway response contract, exposing source UI, choosing a new search provider, or storing raw source material/provider payloads to meet the acceptance criteria.

**Never:** Do not fabricate citations, do not mark web search as approved knowledge, do not store provenance without a durable assistant message id, do not create user-visible source/confidence UI, and do not persist provenance for failed/malformed gateway responses that do not create an assistant message.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Successful sourced answer | AI Ask creates assistant message after context/source-bundle assembly | One retrieval-decision row and source-item provenance rows are saved for that assistant message in the same transaction | No error expected |
| Prompt-only source | A source item was included in the prompt but no citation extraction exists yet | Provenance stores `used_in_prompt=true` and `cited_in_answer=false` | No answer-text parsing |
| Gateway failure or malformed stream | No assistant message is persisted | No retrieval-decision or provenance rows are persisted | Existing safe failure behavior remains |
| Web fallback results | Source bundle includes captured web results | Web provenance rows identify source category `web`, rank/url/title/provider metadata, unverified status, and the corresponding web result when safely linkable | Do not expose raw provider payloads |
| Transaction fallback path | Initial assistant transaction fails but retry insert succeeds | Assistant message, decision, provenance, and usage are still persisted together in the retry transaction | If retry transaction fails, do not create partial provenance |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- Add answer retrieval-decision and assistant response provenance schema exports with message/conversation/user foreign keys.
- `drizzle/migrations/0027_conscious_vapor.sql` -- Create durable tables, constraints, indexes, and delete behavior.
- `src/features/retrieval/provenance.ts` -- New server-only helper to build bounded source snapshots and persist retrieval decision/provenance rows.
- `src/app/api/ai-ask/stream/route.ts` -- Call provenance persistence immediately after successful assistant message insert in both normal and retry paths.
- `tests/answer-context.test.ts` -- Cover successful source-bundle route persistence for decision and provenance categories.
- `tests/ai-ask-shell.test.ts` -- Cover no provenance on failed/malformed assistant generation.
- `tests/ai-ask-sessions.test.ts` -- Cover conversation deletion removes answer provenance.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep Story 5.5 status aligned.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/0027_conscious_vapor.sql` -- Add `assistant_retrieval_decisions` and `assistant_response_provenance` persistence with owner/message FKs, uniqueness per assistant message/row rank, enums/checks, indexes, and cascade behavior -- satisfy durable audit storage.
- [x] `src/features/retrieval/provenance.ts` -- Implement `persistAssistantAnswerProvenance` to translate `ContextPrioritySourceBundle` into a bounded retrieval-decision record and row-per-source-item provenance records -- isolate persistence rules and snapshot safety.
- [x] `src/app/api/ai-ask/stream/route.ts` -- Persist provenance in the same transaction as the assistant message and usage success record for the normal and retry assistant-save paths -- prevent partial answer/provenance states.
- [x] `tests/answer-context.test.ts` -- Add integration coverage for persisted retrieval decision fields and provenance rows for chat/trip, approved knowledge, web, and general categories -- verify Story 5.5 acceptance through AI Ask.
- [x] `tests/ai-ask-shell.test.ts` -- Add or extend failure-path tests to assert no provenance exists when no assistant message is saved -- protect gateway failure behavior.
- [x] `tests/ai-ask-sessions.test.ts` -- Assert deleting a conversation removes associated retrieval-decision and provenance rows -- preserve deletion expectations.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 5.5 in progress/review/done as implementation advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given an assistant answer is generated, when retrieval/search/context assembly completes, then a retrieval decision is persisted with candidate counts, selected counts, threshold/target, freshness flag, conflict flag, web-search trigger flag, web-search reasons, and general-reasoning-used flag.
- Given an assistant answer uses chat/trip context, approved knowledge, web results, or general reasoning, when the assistant message is saved, then row-per-source-item provenance is stored for each applicable source category.
- Given the assistant message is saved, when retrieval decision and provenance are written, then the writes happen in the same transaction as the assistant message and do not leave orphan provenance on generation failure.
- Given a source was included in the prompt but no citation extraction exists, when provenance is saved, then `used_in_prompt` is true and `cited_in_answer` is false without parsing answer text.

## Spec Change Log

## Review Triage Log

### 2026-07-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 2, medium 2, low 1)
- defer: 1: (medium 1)
- reject: 9
- addressed_findings:
  - `[high]` `[patch]` Provenance marked omitted knowledge/web/context items as `used_in_prompt=true`; now computes `usedInPrompt` from the actual rendered prompt section and records false when prompt compaction/minimal fallback omits an item.
  - `[high]` `[patch]` Trip/chat context provenance duplicated fact values into a second table; snapshots now keep only field/source metadata while preserving category, source type, and `used_in_prompt` audit flags.
  - `[medium]` `[patch]` Invalid `checkedAt` dates in web results could abort assistant persistence; web date snapshots are now guarded and store null for invalid dates.
  - `[medium]` `[patch]` Snapshot bounding had no cycle/depth guard; recursive bounding now uses a `WeakSet` and max depth to avoid stack overflow or cyclic-object failures.
  - `[low]` `[patch]` Generated migration dropped existing indexes without drift tolerance; migration now uses `DROP INDEX IF EXISTS` for regenerated indexes.

Deferred:
- `[medium]` `[defer]` Ambiguous transaction-commit failures can still make the AI Ask assistant retry duplicate an answer/usage event; recorded in `deferred-work.md` for a future idempotency hardening story.

### Review Findings

- [x] [Review][Patch] Persist the retrieval relevance threshold in assistant retrieval decisions [src/db/schema.ts:887]
- [x] [Review][Patch] Store a real approved-knowledge candidate count instead of the selected result length [src/features/retrieval/provenance.ts:31]
- [x] [Review][Patch] Compute `used_in_prompt` from the rendered prompt format, not raw source values [src/features/retrieval/provenance.ts:68]

### 2026-07-09 — Follow-up review patch

- Added retrieval relevance threshold persistence to assistant retrieval decisions, including migration coverage for databases that already applied Story 5.5's original migration.
- Added counted approved-knowledge retrieval so candidate count is distinct from selected result count.
- Aligned provenance `used_in_prompt` checks with rendered prompt clipping/JSON formatting for chat/trip facts, approved knowledge titles, and web title/url fields.
- Added regression coverage for counted knowledge candidates and clipped/normalized provenance prompt detection.

## Design Notes

Story 5.5 should prefer compact normalized columns plus a safe JSON snapshot over storing prompt text. Story 5.6 can render source/confidence from these rows without re-reading or parsing assistant answer content.

## Verification

**Commands:**
- `pnpm test:run tests/answer-context.test.ts tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- expected: provenance integration and failure/deletion tests pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Added durable retrieval-decision and assistant-response provenance tables for AI Ask answers, with owner/message foreign keys, assistant-message uniqueness, rank uniqueness, source category/status constraints, and cascade deletion.
- Added `persistAssistantAnswerProvenance` to build bounded safe provenance rows from the actual source bundle and rendered prompt, including `used_in_prompt` vs `cited_in_answer` flags without parsing answer text.
- Integrated provenance persistence into both successful assistant-save transactions in the stream route, before usage success recording, so assistant/provenance/usage commit or fail together.
- Added route, failure, and deletion tests for persisted decisions/provenance and no-provenance failure behavior.

### Verification Results

- `pnpm test:run tests/answer-context.test.ts tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- passed, 93 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.
- `pnpm test:run tests/answer-context.test.ts tests/knowledge-search.test.ts tests/ai-ask-sessions.test.ts` -- passed, 50 tests after follow-up review patches.
- `pnpm lint` -- passed after follow-up review patches.
- `pnpm typecheck` -- passed after follow-up review patches.
- `pnpm build` -- passed after follow-up review patches.

### File List

- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/spec-5-5-persist-retrieval-decision-and-answer-provenance.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0027_conscious_vapor.sql`
- `drizzle/migrations/0028_story_5_5_review_patch.sql`
- `drizzle/migrations/meta/0027_snapshot.json`
- `drizzle/migrations/meta/0028_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/app/api/ai-ask/stream/route.ts`
- `src/db/schema.ts`
- `src/features/knowledge/search.ts`
- `src/features/retrieval/approved-knowledge.ts`
- `src/features/retrieval/provenance.ts`
- `src/features/retrieval/source-bundle.ts`
- `tests/ai-ask-sessions.test.ts`
- `tests/ai-ask-shell.test.ts`
- `tests/answer-context.test.ts`
- `tests/knowledge-search.test.ts`

## Auto Run Result

Status: done

Summary: Implemented Story 5.5. AI Ask now persists a retrieval decision and row-per-source-item assistant provenance for successful answers, atomically with the final assistant message and usage success event.

Files changed:
- `_bmad-output/implementation-artifacts/deferred-work.md` -- recorded follow-up idempotency hardening for ambiguous assistant retry commits.
- `_bmad-output/implementation-artifacts/spec-5-5-persist-retrieval-decision-and-answer-provenance.md` -- recorded story spec, review triage, completion notes, verification, and result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 5.5 done.
- `drizzle/migrations/0027_conscious_vapor.sql` -- created assistant retrieval decision and response provenance tables, constraints, FKs, and indexes.
- `drizzle/migrations/meta/0027_snapshot.json` -- added Drizzle snapshot metadata for the new tables.
- `drizzle/migrations/meta/_journal.json` -- registered the Story 5.5 migration.
- `src/app/api/ai-ask/stream/route.ts` -- persists provenance in the same transaction as successful assistant message and usage records.
- `src/db/schema.ts` -- added provenance/decision table definitions and source category/status types.
- `src/features/retrieval/provenance.ts` -- added server-only provenance builder/persistence helper with bounded safe snapshots.
- `tests/ai-ask-sessions.test.ts` -- added deletion cascade coverage for provenance tables.
- `tests/ai-ask-shell.test.ts` -- added no-provenance failure coverage and isolated route tests from real web-search fetches.
- `tests/answer-context.test.ts` -- added route-level decision/provenance persistence coverage.

Review findings breakdown: 5 patch findings fixed (2 high, 2 medium, 1 low), 1 medium item deferred, 9 findings rejected.

Follow-up review recommendation: true.

Verification performed:
- `pnpm test:run tests/answer-context.test.ts tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- passed, 93 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Residual risks:
- Web provenance currently references captured web rows by stable user-message/rank identity rather than a direct foreign key to `web_search_results.id`; Story 5.6 can consume stored provenance without parsing answer text, but future audit tooling may want a direct FK-grade join.
- AI Ask assistant retry still lacks an idempotency key for ambiguous transaction-commit failures; this is recorded in deferred work.
- No commit was created because repository instructions require explicit approval before committing.
