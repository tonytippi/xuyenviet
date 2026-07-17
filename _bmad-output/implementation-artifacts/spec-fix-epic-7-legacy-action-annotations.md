---
title: 'Fix Epic 7 Legacy Action Annotations'
type: 'bugfix'
created: '2026-07-17'
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-7-inspect-persisted-answer-details-responsively.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** After Epic 7.7, previously persisted provenance-free `action` annotations no longer render. The new persisted-JSON sanitizer rejects their historical display field labels before the shared inline renderer receives them. A message containing a valid source annotation and a rejected legacy action remains partly broken because backfill is skipped when any annotation survives.

**Approach:** Restore only the established legacy action descriptor shape at the sanitizer boundary, then rebuild its traveler-facing descriptor from current safe code. Preserve strict rejection for provenance-backed, malformed, cross-owner, oversized, and unsafe annotation payloads.

## Boundaries & Constraints

**Always:** Validate range, exact text, unique IDs, non-overlap, descriptor keys, and bounded values. Accept legacy display labels only for a provenance-free annotation whose type is exactly `action`; discard all stored display content and return the canonical safe action descriptor. Preserve current behavior for all supported current descriptors and their provenance validation.

**Ask First:** None.

**Never:** Do not restore arbitrary legacy JSON, trust stored title, summary, detail, quick-fact, owner, provenance, raw-source, provider, or operator fields, add schema/routes, alter annotation generation, or infer annotations from answer prose.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Legacy action history | Valid range/text and `action` descriptor with historical `Nhãn`/`Giải thích` detail, no provenance | Inline action annotation remains selectable after history reload with the current canonical action inspector descriptor. | Historical stored display values are omitted. |
| Mixed annotation history | One current provenance-backed annotation and one valid legacy action | Both controls render after reload. | Legacy action is not silently skipped because another item remains valid. |
| Unsafe or unrelated stored payload | Legacy-like payload with provenance, owner, unknown keys, malformed range, or unbounded values | No annotation is rendered for that payload. | Continue processing other independently valid annotations without a crash. |

</frozen-after-approval>

## Code Map

- `src/features/ai/answer-annotations.ts` -- Sanitizes untrusted persisted annotations and rebuilds safe display descriptors.
- `tests/answer-annotations.test.ts` -- Covers legacy descriptor compatibility and retained rejection boundaries.
- `tests/ai-ask-shell.test.ts` -- Covers reopened mixed annotation history through the rendered assistant shell.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/answer-annotations.ts` -- added narrow validation for the historical provenance-free `action` detail shape before rebuilding its descriptor -- restores persisted annotations without trusting legacy display data.
- [x] `tests/answer-annotations.test.ts` -- asserted legacy action acceptance returns only the canonical rebuilt descriptor and provenance-bearing variants remain rejected -- pins safety at the sanitizer boundary.
- [x] `tests/ai-ask-shell.test.ts` -- asserted a reopened message with a valid source and legacy action exposes both annotation controls -- prevents the mixed-history regression.

**Acceptance Criteria:**
- Given a valid pre-Epic-7 provenance-free action annotation, when its message is loaded after Epic 7, then its inline control renders and opens the existing shared detail presentation with canonical safe data.
- Given a persisted payload contains a valid current annotation and a valid legacy action annotation, when the history is loaded, then both annotations are available without annotation regeneration.
- Given a stored annotation is malformed, provenance-backed legacy action data, or carries unsafe/unknown fields, when it is sanitized, then it is rejected and no unsafe stored value reaches traveler UI.

## Design Notes

The compatibility exception is structural, not a trust exception. It recognizes only the former `action` payload shape so `buildAnswerAnnotationDetail` can regenerate the safe descriptor already used for newly created provenance-free actions.

## Verification

**Commands:**
- `pnpm test:run tests/answer-annotations.test.ts tests/ai-ask-shell.test.ts` -- expected: legacy and current annotation contracts pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: production build succeeds.

## Completion Notes

- Restored the exact pre-Epic-7 provenance-free action descriptor only. Its legacy display fields are recognized structurally then discarded while the current canonical safe descriptor is rebuilt.
- Focused annotation tests passed: `83 passed`.
- `pnpm typecheck` and `pnpm build` passed. `pnpm lint` completed with no errors and one unrelated warning in generated `coverage/block-navigation.js`.
- Independent code review found no findings.
