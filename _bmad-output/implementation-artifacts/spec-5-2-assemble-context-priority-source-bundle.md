---
title: 'Story 5.2: Assemble Context Priority Source Bundle'
type: 'feature'
created: '2026-07-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-retrieve-approved-knowledge-for-ai-ask.md'
warnings: []
baseline_revision: '86aca20d2f25ce60d68206f2c1b3a4a6b9fba667'
final_revision: '86aca20d2f25ce60d68206f2c1b3a4a6b9fba667'
---

<intent-contract>

## Intent

**Problem:** AI Ask currently builds grounding context by concatenating prompt strings, so the priority order and source categories are implicit instead of preserved as source-bundle data for web fallback and provenance stories. Epic 5 requires a normalized source bundle with selected trip project context first, current chat context second, approved XuyenViet knowledge third, later web fallback fourth, and general reasoning last.

**Approach:** Introduce a server-only source-bundle assembly seam that loads existing chat/trip context and approved knowledge, separates source categories in priority order, and renders the bundle into the same safe Vietnamese prompt section used by AI Ask. Keep persistence, web search, and traveler-facing source UI deferred.

## Boundaries & Constraints

**Always:** Preserve selected trip project context before current chat context before approved knowledge; include explicit source category labels for trip/chat, knowledge, reserved web, and general reasoning; keep all source values framed as data, not instructions; keep retrieval failures warning-only and non-blocking; reuse Story 5.1 approved-knowledge retrieval and safety limits.

**Block If:** The implementation requires new provenance tables, web search provider choice, pgvector/embedding changes, raw source material access, billing/credit behavior, or changing the user-visible chat UI.

**Never:** Do not call web search, fabricate sources, persist provenance, expose raw source material/operator notes/provider payloads/storage keys, or parse assistant answer text to derive source/confidence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Project, chat, and knowledge all present | Authenticated AI Ask has selected trip project context, current chat context, and matching approved knowledge | Gateway prompt renders a source bundle in fixed order: trip project context, chat context, approved knowledge, then reserved general-reasoning label | No error expected |
| Chat-only context | No selected trip project, active conversation context exists | Bundle omits empty trip project section and labels current chat context before knowledge/general reasoning | No error expected |
| No approved knowledge match | Retrieval returns no rows | Bundle omits approved knowledge item data but still preserves the source-bundle structure for available context/general reasoning | No error expected |
| Context load failure | Chat/trip context loader throws | AI Ask logs a warning, assembles remaining knowledge/general bundle, and still streams normally | Do not expose internals to traveler |
| Knowledge retrieval failure or timeout | Approved knowledge search throws or times out | AI Ask logs a warning, assembles remaining chat/trip/general bundle, and still streams normally | Do not block answer streaming |

</intent-contract>

## Code Map

- `src/features/retrieval/source-bundle.ts` -- new server-only source-bundle types, assembly, and prompt rendering for AI Ask.
- `src/features/chat-trips/answer-context.ts` -- existing context loader and prompt safety helpers; adapt or reuse for separated trip/chat sections.
- `src/features/retrieval/approved-knowledge.ts` -- existing approved-knowledge retrieval and safe formatting from Story 5.1.
- `src/app/api/ai-ask/stream/route.ts` -- replace ad hoc context/knowledge string concatenation with source-bundle assembly and rendering.
- `tests/answer-context.test.ts` -- extend route and bundle tests for priority order, labels, omission behavior, and failure isolation.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- keep Story 5.2 status aligned.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/retrieval/source-bundle.ts` -- add normalized bundle types plus `assembleContextPrioritySourceBundle` and `buildSourceBundlePromptSection` -- make source order and categories explicit for later web/provenance stories.
- [x] `src/features/chat-trips/answer-context.ts` -- expose a safe separated context-section renderer or facts utility if needed -- preserve existing prompt-injection protections while splitting trip and chat labels.
- [x] `src/features/retrieval/approved-knowledge.ts` -- reuse or lightly adapt the knowledge prompt formatter for source-bundle rendering -- avoid duplicate unsafe formatting logic.
- [x] `src/app/api/ai-ask/stream/route.ts` -- call the source-bundle assembler after user message persistence and pass the rendered section to `buildAiAskMessages` -- replace ad hoc concatenation without changing streaming behavior.
- [x] `tests/answer-context.test.ts` -- add/update tests covering the I/O matrix and fixed priority labels -- verify source-bundle behavior at the orchestration seam.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 5.2 in progress/review/done as implementation advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given trip project context, chat context, and approved knowledge are available, when AI Ask assembles the Gateway request, then the system prompt preserves the priority order: selected trip project context, current chat session context, approved XuyenViet knowledge, general reasoning.
- Given a source category has no items, when the source-bundle prompt is rendered, then it does not invent placeholder facts or citations for that category.
- Given context or approved-knowledge loading fails, when AI Ask streams a response, then remaining source categories are still rendered if available and the traveler receives the normal streamed answer.
- Given source data contains instruction-like text, when the source bundle is rendered, then values remain serialized/delimited as data and cannot override system instructions.

## Spec Change Log

- 2026-07-09: Implemented normalized source-bundle assembly seam for AI Ask and moved story to review.

## Review Triage Log

### 2026-07-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 3, low 0)
- defer: 0
- reject: 7
- addressed_findings:
  - `[medium]` `[patch]` Source-bundle priority was only implied by section order; added an explicit conflict-resolution priority instruction to normal and compact prompt rendering.
  - `[medium]` `[patch]` Compacted source-bundle rendering dropped chat/project conflict guidance; included bounded conflict lines in the compact path.
  - `[medium]` `[patch]` Answer context loading could stall before the gateway call; added a timeout matching the approved-knowledge timeout and surfaced a source-loading warning in the prompt.

## Design Notes

The bundle is an in-memory contract for this story. It should be shaped for later provenance, but Story 5.5 owns persistence. Web search should be represented only by reserved category naming or empty data, not by provider integration.

## Verification

**Commands:**
- `pnpm test:run tests/answer-context.test.ts` -- expected: source-bundle and AI Ask context tests pass.
- `pnpm test:run tests/knowledge-search.test.ts` -- expected: approved-knowledge eligibility tests still pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Added a server-only `source-bundle` seam that assembles selected trip project facts, current chat facts, approved XuyenViet knowledge, reserved empty web, and general reasoning in the required priority order.
- Replaced AI Ask route ad hoc context/knowledge concatenation with `assembleContextPrioritySourceBundle` and `buildSourceBundlePromptSection` after user message persistence.
- Preserved warning-only, non-blocking behavior for chat/trip context and approved-knowledge failures, including the existing approved-knowledge timeout.
- Rendered source values as JSON-serialized data with explicit delimiters and no raw/operator/provider/storage data exposure.
- Kept web search reserved and empty; no web provider call was added.

### Verification Results

- `pnpm test:run tests/answer-context.test.ts` -- passed, 20 tests.
- `pnpm test:run tests/knowledge-search.test.ts` -- passed, 7 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.
- `pnpm test:run tests/answer-context.test.ts` and `pnpm test:run tests/knowledge-search.test.ts` in parallel -- failed due shared DB test interference; reran sequentially and both passed.

### File List

- `_bmad-output/implementation-artifacts/spec-5-2-assemble-context-priority-source-bundle.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/api/ai-ask/stream/route.ts`
- `src/features/retrieval/source-bundle.ts`
- `tests/answer-context.test.ts`

## Auto Run Result

Status: done

Summary: Implemented Story 5.2. AI Ask now assembles a normalized in-memory source bundle in the required priority order, renders it with explicit source category labels and data delimiters, and preserves warning-only fallback behavior when chat/trip context or approved-knowledge loading fails.

Files changed:
- `_bmad-output/implementation-artifacts/spec-5-2-assemble-context-priority-source-bundle.md` -- recorded story spec, implementation notes, review triage, verification, and result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 5.2 done.
- `src/app/api/ai-ask/stream/route.ts` -- replaced ad hoc context/knowledge string concatenation with source-bundle assembly and rendering.
- `src/features/retrieval/source-bundle.ts` -- added server-only source-bundle assembly, prompt rendering, bounded sections, source-loading warnings, and timeouts.
- `tests/answer-context.test.ts` -- updated AI Ask context tests for source-bundle order, labels, failure behavior, and prompt-injection data delimiting.

Review findings breakdown: 3 patch findings fixed (3 medium), 0 deferred, 7 rejected.

Follow-up review recommendation: false.

Verification performed:
- `pnpm test:run tests/answer-context.test.ts` -- passed, 20 tests.
- `pnpm test:run tests/knowledge-search.test.ts` -- passed, 7 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Residual risks:
- The source bundle is intentionally in-memory only; provenance persistence remains Story 5.5.
- Approved knowledge retrieval remains global and based on the existing approved XuyenViet knowledge search path from Story 5.1; trip-specific retrieval ranking and web fallback are later Epic 5 work.
- DB-backed Vitest files share the test database and should be run sequentially unless the test harness is changed to isolate schemas/databases per worker.
- This workflow did not create a commit because repository instructions require explicit user approval before committing.
