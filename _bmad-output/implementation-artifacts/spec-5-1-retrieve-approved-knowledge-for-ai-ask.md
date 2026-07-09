---
title: 'Story 5.1: Retrieve Approved Knowledge For AI Ask'
type: 'feature'
created: '2026-07-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '96cdea85687f8dc902e7556aee706ddb75f331ab'
final_revision: '96cdea85687f8dc902e7556aee706ddb75f331ab'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** AI Ask currently answers from chat/trip context and general model reasoning, even when approved XuyenViet knowledge cards already contain relevant route, place, warning, or service facts. This prevents Epic 5 from grounding traveler answers in curated knowledge before web search and provenance work.

**Approach:** Add a retrieval seam that searches active approved knowledge-card search documents for each AI Ask question, formats a bounded safe prompt section, and appends it after trip/chat context before the Gateway call. Reuse the existing PostgreSQL keyword search path for this story; vector embeddings and persisted provenance are later Epic 5 stories unless already present.

## Boundaries & Constraints

**Always:** Retrieve only approved, non-review, active indexed knowledge using `searchApprovedKnowledge`; include safe card/source metadata only; keep trip-project context before chat context before knowledge in the prompt order; bound the knowledge prompt section; treat retrieved knowledge as data, not instructions; log and skip retrieval failures without blocking answer streaming; keep Vietnamese-first prompt labels.

**Block If:** Implementing this requires adding pgvector/embedding storage, external vector stores, web search, source/provenance persistence, traveler-facing source UI, billing/credits, or broad schema changes outside the current safe search-document path.

**Never:** Do not load `raw_source_material`, operator-only notes, provider payloads, storage keys, or unapproved/draft/rejected/archived cards into AI Ask prompts. Do not fabricate citations or render source/confidence UI from answer text.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Relevant approved knowledge | Authenticated AI Ask question matches active approved indexed cards | Gateway system prompt includes a `Kiến thức Xuyên Việt đã duyệt` section with card title, type, location/route, summary, confidence, freshness flag, score, and safe source labels | No error expected |
| No approved match | Search returns no rows | Gateway prompt omits the knowledge section while preserving normal answer flow | No error expected |
| Ineligible cards exist | Draft/rejected/archived/needs-review cards or disabled/stale documents match text | They are excluded by the existing search API and never appear in the prompt | Ineligible stale active docs may be disabled by the search API |
| Retrieval failure | Knowledge search throws after user message persistence | AI Ask logs a warning, omits the knowledge section, still calls Gateway, streams/persists answer, and records normal usage | Failure must not expose DB details to the traveler |
| Prompt safety | Card/source data contains long or instruction-like text | Prompt section is length-bounded and frames knowledge as reference data, not instructions | Excess entries/text are truncated by omission rather than expanding the prompt |

</intent-contract>

## Code Map

- `src/features/knowledge/search.ts` -- existing safe approved-card indexing and keyword retrieval API; source of retrieved cards.
- `src/features/retrieval/approved-knowledge.ts` -- new AI Ask retrieval/formatting seam for bounded safe prompt sections.
- `src/app/api/ai-ask/stream/route.ts` -- call approved-knowledge retrieval after chat/trip context load and before `buildAiAskMessages`.
- `tests/answer-context.test.ts` -- stream-route integration tests for context prompt assembly and failure isolation.
- `tests/knowledge-search.test.ts` -- existing search tests; add or rely on coverage for ineligible/raw data exclusion if no new search behavior is needed.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- keep Story 5.1 status aligned.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/retrieval/approved-knowledge.ts` -- add `loadApprovedKnowledgeForAiAsk` and `buildApprovedKnowledgePromptSection` around `searchApprovedKnowledge` with a small result limit and bounded Vietnamese prompt output -- make approved knowledge reusable by AI Ask without exposing raw material.
- [x] `src/app/api/ai-ask/stream/route.ts` -- retrieve and append approved knowledge after trip/chat context and before `buildAiAskMessages`, with warning-only failure handling -- ground answers while preserving streaming reliability.
- [x] `tests/answer-context.test.ts` -- add stream-route tests for included approved knowledge, no-match omission, and retrieval failure isolation -- verify the matrix behaviors at the orchestration seam.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 5.1 in progress/done as implementation advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given an authenticated AI Ask question with relevant approved indexed knowledge, when the Gateway request is assembled, then the prompt includes approved XuyenViet knowledge after chat/trip context and before general model reasoning.
- Given matching cards are draft, rejected, archived, marked `needsReview`, or have inactive search documents, when AI Ask retrieves knowledge, then those cards are excluded from the prompt.
- Given approved knowledge is included, when the prompt section is built, then it contains only safe card/source metadata and no raw source material, operator notes, storage keys, or provider payloads.
- Given approved knowledge retrieval fails or returns no matches, when AI Ask streams a response, then the traveler still receives the normal streamed answer and no retrieval internals are exposed.

### Review Findings
- [x] [Review][Patch] Compact first-result fallback can exceed the approved-knowledge prompt budget [src/features/retrieval/approved-knowledge.ts:29]

## Spec Change Log

- 2026-07-09: Implemented approved-knowledge retrieval seam for AI Ask and moved story to review.

## Review Triage Log

### 2026-07-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 2, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Approved knowledge fields were directly injected into the system prompt; added explicit begin/end delimiters, JSON-style value encoding, and instruction text that treats card/source fields as data rather than commands.
  - `[medium]` `[patch]` Retrieval could hang the response stream if search stalled; added a 1.5s timeout around approved-knowledge retrieval so AI Ask continues without blocking.
  - `[low]` `[patch]` A single oversized first result could omit all approved knowledge; added compact first-result fallback before dropping the section.

## Design Notes

Story 5.1 intentionally uses the existing PostgreSQL search-document path. Epic 5 still allows pgvector later, but this story can satisfy the retrieval seam now because Story 4.8 already created active approved search documents and safe DTOs. Keep the new module under `retrieval` because later stories will assemble source bundles, web fallback triggers, and provenance around this seam.

## Verification

**Commands:**
- `pnpm test:run tests/answer-context.test.ts tests/knowledge-search.test.ts` -- expected: targeted retrieval/context tests pass.
- `pnpm test:run` -- expected: full test suite passes.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Added `loadApprovedKnowledgeForAiAsk` and `buildApprovedKnowledgePromptSection` using the existing `searchApprovedKnowledge` path with a small limit and bounded Vietnamese prompt output.
- Wired AI Ask stream assembly to append approved knowledge after trip/chat context and before `buildAiAskMessages`.
- Retrieval failures are warning-only and do not block streaming or expose internals to travelers.
- Prompt output includes safe card/source metadata only and omits raw source material, operator-only notes, storage keys, provider payloads, and provenance UI.
- Review fixes added prompt data delimiters, instruction-like text handling, compact first-result fallback, and a retrieval timeout.

### Verification Results

- `pnpm test:run tests/answer-context.test.ts tests/knowledge-search.test.ts` -- passed, 24 tests.
- `pnpm test:run tests/answer-context.test.ts tests/knowledge-search.test.ts` -- passed after review fixes, 25 tests.
- `pnpm test:run` -- passed, 231 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.
- `pnpm test:run tests/answer-context.test.ts` -- passed after review patch, 19 tests.

### File List

- `_bmad-output/implementation-artifacts/spec-5-1-retrieve-approved-knowledge-for-ai-ask.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/api/ai-ask/stream/route.ts`
- `src/features/retrieval/approved-knowledge.ts`
- `tests/answer-context.test.ts`

## Auto Run Result

Status: done

Summary: Implemented Story 5.1. AI Ask now retrieves active approved XuyenViet knowledge for each question through the existing safe knowledge search path, appends a bounded Vietnamese approved-knowledge data section after trip/chat context, and skips retrieval on failure or timeout without blocking streamed answers.

Files changed:
- `_bmad-output/implementation-artifacts/spec-5-1-retrieve-approved-knowledge-for-ai-ask.md` -- recorded story spec, review triage, verification, and result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 5.1 done.
- `src/app/api/ai-ask/stream/route.ts` -- added approved-knowledge retrieval, prompt-section combination, warning-only failure handling, and retrieval timeout.
- `src/features/retrieval/approved-knowledge.ts` -- added approved-knowledge loading and safe bounded prompt formatting.
- `tests/answer-context.test.ts` -- added orchestration tests for included knowledge, no-match omission, retrieval failure, and instruction-like data delimiting.

Review findings breakdown: 3 patch findings fixed (2 medium, 1 low), 0 deferred, 0 rejected.

Follow-up review recommendation: false.

Verification performed:
- `pnpm test:run tests/answer-context.test.ts tests/knowledge-search.test.ts` -- passed, 25 tests.
- `pnpm test:run` -- passed, 17 files, 231 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Residual risks:
- Retrieval quality remains limited to the existing PostgreSQL keyword search-document path; pgvector embeddings, source-bundle persistence, web fallback, and provenance are intentionally deferred to later Epic 5 stories.
- This workflow did not create a commit because repository instructions require explicit user approval before committing.
