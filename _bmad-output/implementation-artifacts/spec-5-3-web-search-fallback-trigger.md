---
title: 'Story 5.3: Web Search Fallback Trigger'
type: 'feature'
created: '2026-07-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-2-assemble-context-priority-source-bundle.md'
warnings: []
baseline_revision: 'a820fc1138e3d24f9dcd98e4af63b90ff214aa8a'
final_revision: 'a820fc1138e3d24f9dcd98e4af63b90ff214aa8a'
---

<intent-contract>

## Intent

**Problem:** AI Ask now assembles a prioritized source bundle, but it cannot yet decide when curated knowledge is insufficient and web fallback should be requested. Epic 5 requires a deterministic fallback trigger before Story 5.4 adds the actual web search adapter and source capture.

**Approach:** Add an in-memory retrieval decision to the source-bundle seam that evaluates approved knowledge count, broad planning questions, freshness-sensitive questions, stale/freshness-sensitive approved cards, and source conflicts. Render the decision into the prompt so the assistant either expects later web fallback or clearly says current details cannot be verified, without making a web provider call.

## Boundaries & Constraints

**Always:** Keep the fixed source priority order from Story 5.2; make the trigger reason explicit in typed data; treat freshness-sensitive requests as requiring web verification unless no provider exists, in which case the prompt must instruct the assistant to say it cannot verify current details; keep decision logic server-only and deterministic; preserve retrieval/context failure as warning-only.

**Block If:** Implementation requires choosing or calling a web search provider, persisting retrieval decisions/provenance, adding new database tables, changing traveler-facing source UI, using raw source material, or relying on model/tool-calling to decide whether fallback is needed.

**Never:** Do not call web search, fabricate web results, present web fallback as performed, persist provenance, expose provider payloads/secrets/operator notes, or parse assistant answer text to derive the fallback trigger.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No approved knowledge | Approved knowledge returns zero results for a planning question | Bundle decision sets `webSearchTriggered=true` with reason `no_approved_knowledge` and prompt says web search is needed but not yet performed | No error expected |
| Broad planning under-covered | Question asks for itinerary/route planning and fewer than three approved cards are selected | Decision triggers with reason `insufficient_approved_knowledge` | No error expected |
| Freshness-sensitive request | Question asks for price, schedule, opening hours, road condition, weather, availability, service status, or promotions | Decision triggers with reason `freshness_sensitive_request`; prompt requires current-detail verification warning if no web data exists | No error expected |
| Stale or freshness-sensitive card | Retrieved approved card is marked freshness-sensitive | Decision triggers with reason `approved_knowledge_may_be_stale` | No error expected |
| Source conflicts | Chat/trip context has conflicts or approved cards for the same title disagree on freshness/confidence | Decision triggers with reason `source_conflict` | No error expected |
| Retrieval failure | Approved knowledge loading fails or times out | Existing warning remains; decision triggers with reason `approved_knowledge_unavailable` | Do not block streaming or expose internals |

</intent-contract>

## Code Map

- `src/features/retrieval/source-bundle.ts` -- Owns source-bundle assembly and prompt rendering; add retrieval decision types, trigger logic, and prompt text.
- `src/features/retrieval/approved-knowledge.ts` -- Provides up to three approved knowledge cards and their freshness/confidence metadata for decision inputs.
- `src/app/api/ai-ask/stream/route.ts` -- Uses the source-bundle prompt section; should not need provider/search changes.
- `tests/answer-context.test.ts` -- Extend source-bundle and AI Ask route tests for trigger reasons and prompt behavior.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep Story 5.3 status aligned.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/retrieval/source-bundle.ts` -- Add `RetrievalDecision` and `WebSearchTriggerReason` types to the source bundle -- make fallback intent machine-readable for Story 5.5.
- [x] `src/features/retrieval/source-bundle.ts` -- Implement deterministic trigger logic for no knowledge, broad planning under-coverage, freshness-sensitive requests, stale/freshness-sensitive cards, source conflicts, and knowledge unavailability -- satisfy Story 5.3 ACs without provider integration.
- [x] `src/features/retrieval/source-bundle.ts` -- Render the retrieval decision in `buildSourceBundlePromptSection`, compact, and minimal fallback paths -- ensure the assistant does not claim web search happened and warns when current details cannot be verified.
- [x] `tests/answer-context.test.ts` -- Add unit/route coverage for the I/O matrix and non-regression of source priority rendering -- verify trigger reasons appear in the gateway prompt and streaming still completes on retrieval failure.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 5.3 in progress/review/done as implementation advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given no relevant approved cards are retrieved, when AI Ask assembles the source bundle, then web search fallback is triggered with an explicit reason before answer generation.
- Given fewer than three approved cards are retrieved for a broad planning question, when the answer needs coverage, then web search fallback is triggered without inventing web results.
- Given the user asks about freshness-sensitive facts, when the prompt is prepared, then fallback is triggered or the prompt instructs the assistant to clearly say current details cannot be verified.
- Given approved cards conflict with each other or look stale, when the source bundle is rendered, then fallback is triggered to verify or contextualize the risk.

## Spec Change Log

- 2026-07-09: Implemented in-memory web search fallback trigger and moved story to review.

## Review Triage Log

### 2026-07-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 3, low 2)
- defer: 0
- reject: 1
- addressed_findings:
  - `[medium]` `[patch]` Freshness matching missed unaccented Vietnamese user input; normalized matching now strips Vietnamese diacritics before keyword checks.
  - `[low]` `[patch]` Bare `lịch` over-triggered freshness fallback for ordinary `du lịch` questions; replaced it with phrase-level schedule terms while leaving `lịch trình` as broad planning.
  - `[medium]` `[patch]` Approved-card conflict detection only compared normalized title; it now compares same type/location/route entities before falling back to title.
  - `[low]` `[patch]` Prompt rendering could show `có ()` when a malformed triggered decision had no reasons; it now renders `unknown`.
  - `[medium]` `[patch]` Prompt rendering could suppress fallback when reasons existed but `webSearchTriggered` was false; reasons now imply a triggered prompt state.

## Design Notes

Story 5.3 intentionally stops at a trigger/decision contract. Story 5.4 owns the adapter and captured web source records; Story 5.5 owns persisted retrieval decisions and provenance rows. The Story 5.3 decision should be easy to persist later, but must remain in-memory for this story.

## Verification

**Commands:**
- `pnpm test:run tests/answer-context.test.ts` -- expected: source-bundle and route tests pass.
- `pnpm test:run tests/knowledge-search.test.ts` -- expected: approved-knowledge retrieval tests still pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Added `RetrievalDecision` and `WebSearchTriggerReason` to the source-bundle contract for Story 5.5 persistence readiness.
- Added deterministic server-only fallback decisions for no approved knowledge, broad planning under-coverage, freshness-sensitive requests, freshness-sensitive approved cards, chat/project or approved-card source conflicts, and approved-knowledge retrieval failure.
- Rendered the decision into normal, compact, and minimal source-bundle prompt paths without claiming web search ran or fabricating web results.
- Kept web fallback in-memory only; no web provider, DB table, provenance persistence, or traveler-facing source UI was added.

### Verification Results

- `pnpm test:run tests/answer-context.test.ts` -- passed, 25 tests before review patches.
- `pnpm test:run tests/answer-context.test.ts` -- passed, 28 tests after review patches.
- `pnpm test:run tests/knowledge-search.test.ts` -- passed, 7 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

### File List

- `_bmad-output/implementation-artifacts/spec-5-3-web-search-fallback-trigger.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/features/retrieval/source-bundle.ts`
- `tests/answer-context.test.ts`

## Auto Run Result

Status: done

Summary: Implemented Story 5.3. AI Ask now records an in-memory retrieval decision in the source bundle, deterministically flags when web fallback is needed, and instructs the assistant not to claim web search was performed when no web data exists.

Files changed:
- `_bmad-output/implementation-artifacts/spec-5-3-web-search-fallback-trigger.md` -- recorded story spec, implementation notes, review triage, verification, and result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 5.3 done.
- `src/features/retrieval/source-bundle.ts` -- added fallback decision types, trigger logic, prompt rendering, accent-insensitive matching, and conflict safeguards.
- `tests/answer-context.test.ts` -- added source-bundle decision and route coverage for trigger reasons, freshness matching, source conflicts, and malformed decision rendering.

Review findings breakdown: 5 patch findings fixed (3 medium, 2 low), 0 deferred, 1 rejected.

Follow-up review recommendation: false.

Verification performed:
- `pnpm test:run tests/answer-context.test.ts` -- passed, 28 tests.
- `pnpm test:run tests/knowledge-search.test.ts` -- passed, 7 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Residual risks:
- Web search adapter and captured web records remain deferred to Story 5.4.
- Retrieval decision/provenance persistence remains deferred to Story 5.5.
- This workflow did not create a commit because repository instructions require explicit user approval before committing.
