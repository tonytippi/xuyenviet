---
title: 'Preserve Ordered Route Stops During Knowledge Extraction'
type: 'bugfix'
created: '2026-07-20'
status: 'done'
route: 'plan-code-review'
review_loop_iteration: 0
baseline_commit: 'f0ac276'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-ai-extracts-knowledge-drafts-from-source.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-8-make-approved-knowledge-searchable-by-ai.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ordered route-list posts can contain dozens of useful stops, but the current source extraction prompt permits the model to compress them into a broad route summary. In the coastal Da Nang-to-Phu Yen example, 32 ordered stops became one generic tip, making later review and retrieval unable to use the full route sequence.

**Approach:** Make route-list extraction preserve one bounded, ordered list of short normalized stop labels on a single `route_note` card. Keep the route as a reviewable, community-confidence card, preserve raw-source privacy, and make every stored stop searchable after approval.

## Boundaries & Constraints

**Always:** For a source principally describing an ordered itinerary, route, or stop list, request one `route_note` with `practical_details.ordered_stops`. Preserve the source order, including intentional repeated labels; use only short normalized place/stop labels without numbers, sentences, contacts, raw prose, citations, provider metadata, or source identifiers. Limit the list to 40 values and retain existing per-value bounds, raw-overlap checks, sensitive-value rejection, community confidence clamping, source linkage, review, and approval rules. Make the same 40-item bound valid in extraction, review, and safe search-document construction so a persisted stop is searchable.

**Ask First:** A typed route-stop table, individual cards for every stop, graph/KAG modeling, or a stop-list bound above 40 requires a separate product and architecture decision.

**Never:** Do not create a migration, read or index raw source material, relax safe-field validation, silently mutate existing approved cards, force re-extraction, claim that an incomplete list is complete, or expose the raw post to travelers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Coastal route list | Community post lists 32 ordered coastal stops | One draft `route_note` persists all 32 normalized labels under `ordered_stops` in exact order, with community confidence and primary source linkage | No error expected |
| Review and indexing | Approved route note has 32 stored stops | Review retains ordering; safe search text includes a stop beyond position 10 and retrieval can match it | No raw fields selected or exposed |
| Excessive list | Model returns 41 labels | Model output is rejected rather than silently truncating or reordering the route | Safe invalid-model-output error; no card persists |
| Unsafe stop value | Ordered-stop item contains a long copied source sentence or phone number | The whole extraction is rejected | Existing safe-field validation prevents raw/sensitive persistence |

</frozen-after-approval>

## Code Map

- `src/features/ai/prompts.ts` -- extraction prompt and expected JSON contract for route-list source material.
- `src/features/knowledge/extraction.ts` -- validates and bounds model-returned practical-detail arrays before draft persistence.
- `src/features/knowledge/review.ts` -- enforces the matching detail-array bound for operator edits and approval.
- `src/features/knowledge/search.ts` -- includes the complete safe ordered-stop array in approved-card search text.
- `tests/knowledge-draft-extraction.test.ts` -- regression coverage for a 32-stop community route, prompt contract, and unsafe/excessive lists.
- `tests/knowledge-draft-review.test.ts` -- preserves ordered stops through review and rejects 41-item edits.
- `tests/knowledge-search.test.ts` -- verifies an approved stop after position 10 is indexed and retrievable without raw leakage.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/prompts.ts` -- require a single route card with bounded `ordered_stops` for ordered route-list sources -- preserve itinerary detail without card explosion.
- [x] `src/features/knowledge/extraction.ts`, `src/features/knowledge/review.ts`, and `src/features/knowledge/search.ts` -- align bounded array handling at 40 values -- preserve and index the same safe reviewed data end-to-end.
- [x] `tests/knowledge-draft-extraction.test.ts`, `tests/knowledge-draft-review.test.ts`, and `tests/knowledge-search.test.ts` -- add the route-list regression and safety cases -- prevent future stop loss or raw-data leakage.

**Acceptance Criteria:**
- Given a community source containing a 32-stop ordered route, when extraction returns one valid route note, then all 32 normalized stop labels persist in the supplied order with normal draft, provenance, and confidence safeguards.
- Given an approved reviewed route note contains an ordered stop after index 10, when indexing and searching run, then that stop is included in safe searchable text and can match the route card.
- Given an ordered-stop list is over 40 values or any item violates raw-overlap/sensitive-value validation, when extraction or review processes it, then no invalid persistent state is created.

## Design Notes

`ordered_stops` remains a bounded convention inside the existing reviewed JSON details object, rather than a premature route graph. It preserves the source evidence needed today while leaving a future typed route/graph model free to consume approved, reviewed stops later.

## Verification

**Commands:**
- `pnpm test:run tests/knowledge-draft-extraction.test.ts` -- expected: ordered route, prompt, bound, and safe-field coverage passes.
- `pnpm test:run tests/knowledge-draft-review.test.ts` -- expected: 32-item review/approval preservation and 41-item rejection pass.
- `pnpm test:run tests/knowledge-search.test.ts` -- expected: approved stop beyond index 10 indexes and retrieves safely.
- `pnpm typecheck` -- expected: TypeScript strict checks pass.
- `pnpm lint` -- expected: no ESLint errors.

**Results:**
- `pnpm test:run tests/knowledge-draft-extraction.test.ts` -- passed, 20 tests.
- `pnpm test:run tests/knowledge-draft-review.test.ts` -- passed, 21 tests.
- `pnpm test:run tests/knowledge-search.test.ts` -- passed, 16 tests.
- `pnpm test:run tests/answer-context.test.ts` -- passed, 54 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `git diff --check` -- passed.

## Suggested Review Order

**Extraction Contract**

- Require one bounded route card only for sources that are ordered itineraries.
  [`prompts.ts:60`](../../src/features/ai/prompts.ts#L60)

- Fail closed on malformed details and validate labels before any draft persists.
  [`extraction.ts:420`](../../src/features/knowledge/extraction.ts#L420)

**Review And Retrieval**

- Preserve the same bounded label contract during operator review and approval.
  [`review.ts:983`](../../src/features/knowledge/review.ts#L983)

- Keep late-position stops searchable even in legacy detail key ordering.
  [`search.ts:312`](../../src/features/knowledge/search.ts#L312)

- Carry the complete bounded stop list into the AI answer context.
  [`approved-knowledge.ts:90`](../../src/features/retrieval/approved-knowledge.ts#L90)

**Regression Coverage**

- Cover extraction completeness, bounds, and label safety for route lists.
  [`knowledge-draft-extraction.test.ts:193`](../../tests/knowledge-draft-extraction.test.ts#L193)

- Cover approval preservation and invalid route-stop edits.
  [`knowledge-draft-review.test.ts:207`](../../tests/knowledge-draft-review.test.ts#L207)

- Cover indexed retrieval for a stop beyond the legacy ten-item limit.
  [`knowledge-search.test.ts:239`](../../tests/knowledge-search.test.ts#L239)

- Cover full ordered-stop presence in the answer-time prompt context.
  [`answer-context.test.ts:1212`](../../tests/answer-context.test.ts#L1212)
