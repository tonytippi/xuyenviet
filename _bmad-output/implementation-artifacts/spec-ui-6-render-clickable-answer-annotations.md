---
title: 'UI 6: Render Clickable Answer Annotations'
type: 'feature'
created: '2026-07-14'
status: 'review'
baseline_commit: 6eb591600b1bb5df8d2bf8cea8344284f9a77038
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-6-render-source-and-confidence-section.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The active AI Ask chat already has a right detail panel and clickable provenance/source rows, but the answer text itself cannot expose which specific place, warning, trip fact, route segment, or source-backed claim can be inspected. Travelers must look below the answer in `Nguồn và độ tin cậy`, which weakens the direct connection between a claim and its supporting context.

**Approach:** Add a frontend rendering contract for structured assistant-answer annotations. When an assistant message includes validated annotation descriptors, render the annotated text spans as accessible inline buttons that open the existing `AnswerDetailPanel`. Keep the existing source/provenance block as a compact fallback and do not parse Vietnamese free text to invent highlights.

## Boundaries & Constraints

**Always:**
- Render inline highlights only from structured annotation descriptors already present on the assistant message read model.
- Reuse the existing transient `selectedAnswerEntity` state, `AnswerEntityDescriptor`, `AnswerDetailPanel`, desktop right panel, and mobile detail drawer behavior.
- Preserve the visible assistant answer text exactly; annotations change interactivity and styling, not answer content.
- Use buttons, not links, for inline highlights because the action opens local UI state.
- Keep annotation controls keyboard reachable, visibly focused, label-based, and connected to the detail panel through ARIA where practical.
- Keep the source/provenance block available as fallback for broad sources, unannotated answers, and source-list review.
- Drop or ignore invalid annotations safely: out-of-range offsets, empty ranges, text mismatch when a quote is supplied, duplicate ids, missing detail descriptors, or unauthorized/unsafe detail data.
- Resolve overlapping annotations deterministically by rendering the earliest valid non-overlapping range and ignoring later overlapping ranges.
- Ensure mobile annotation selection opens the selected-detail drawer and does not conflict with the session/sidebar drawer.

**Block If:**
- Implementing this requires asking the model to produce annotations, changing prompt schemas, adding a database table, or persisting annotations. That belongs to the backend annotation story.
- The only available implementation path is frontend string matching against arbitrary Vietnamese answer text. This story must not ship broad frontend guessing.

**Never:**
- Do not expose `sourceSnapshot`, raw source material, copied post bodies, image/OCR notes, provider scores, provider metadata, internal ids, operator-only fields, or admin controls in the traveler detail panel.
- Do not create fake citations or infer source links from free-text answer paragraphs.
- Do not remove provenance/source fallback UI until backend-generated annotations cover all required source-review cases.
- Do not introduce map-first UI or Google Maps dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Annotated assistant answer | Assistant message content plus valid annotations for `Vinh`, a freshness warning, and a trip fact | The answer renders normal text with clickable inline highlights; selecting each highlight opens the existing detail panel with the descriptor for that annotation | No error expected |
| Unannotated assistant answer | Assistant message has content and provenance but no annotations | The answer renders as normal text; source/provenance block remains inspectable | No error expected |
| Invalid annotation range | Annotation start/end are out of bounds, reversed, or empty | Invalid annotation is ignored; the rest of the answer renders normally | No client crash |
| Overlapping annotations | Two annotations overlap in the same answer text | The earliest valid non-overlapping annotation renders; the later overlapping annotation is ignored | Deterministic rendering, no nested buttons |
| Mobile selection | Traveler taps an inline highlight on mobile | Detail drawer opens for that annotation; session/sidebar drawer stays closed or is not shown simultaneously | Focus returns to trigger on close when possible |
| Unsafe detail payload | Annotation descriptor tries to include raw snapshot/internal/provider fields | Unsafe fields are not rendered and tests pin they are absent | Drop unsafe display data or render only safe detail labels |

</intent-contract>

## Code Map

- `src/features/ai/ai-ask-composer.tsx` -- add `AnswerAnnotation` display type, annotation validation/splitting helper, and `AnnotatedAssistantMessage` renderer; wire assistant message body to inline annotation selection while preserving existing provenance block.
- `src/features/ai/ai-ask-composer.tsx` -- preserve the current `AssistantMessageContent` behavior: `splitAssistantContent` recognizes Vietnamese answer section headings and renders section cards. Inline annotation rendering must compose with or extend this path, not replace sectioned answer formatting with a flat paragraph renderer.
- `tests/ai-ask-shell.test.ts` -- add render and static contract tests for inline annotations, invalid ranges, overlap behavior, ARIA/focus contract, mobile drawer separation, and unsafe field exclusions.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- track `ui-6-render-clickable-answer-annotations` from ready-for-dev through done.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/ai-ask-composer.tsx` -- extend the assistant display message shape with optional structured annotations and add an annotation renderer -- makes answer text capable of safe inline selection without backend persistence changes.
- [x] `src/features/ai/ai-ask-composer.tsx` -- keep `AssistantMessageContent` section splitting and render annotations inside section bodies where possible -- prevents regression of structured Vietnamese answer cards.
- [x] `src/features/ai/ai-ask-composer.tsx` -- route annotation clicks through the existing `handleSelectAnswerEntity` flow -- reuses the right panel/mobile drawer instead of adding parallel selection state.
- [x] `src/features/ai/ai-ask-composer.tsx` -- validate/sort/drop invalid or overlapping annotations before rendering -- prevents broken text splitting, nested controls, and crashes.
- [x] `src/features/ai/ai-ask-composer.tsx` -- keep `AssistantProvenanceBlock` available as compact fallback/source review -- preserves trust transparency while inline coverage is incomplete.
- [x] `tests/ai-ask-shell.test.ts` -- cover annotated rendering, selected state, invalid/overlap handling, unannotated fallback, mobile drawer contract, and unsafe-field absence -- pins the UX and safety contract.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update story state during implementation and completion -- keep BMad status aligned.

**Acceptance Criteria:**
- Given an assistant message includes valid structured annotations, when the answer renders, then the annotated ranges are interactive inline highlights and the surrounding answer text remains unchanged.
- Given an assistant message contains recognized Vietnamese section headings, when inline annotations are present, then section card rendering remains intact and annotations appear inside the appropriate section body.
- Given a traveler clicks or keyboard-activates an inline highlight, when detail data is available, then the existing contextual detail panel opens with that annotation's safe descriptor.
- Given an assistant message has no annotations, when the answer renders, then it remains readable as before and source/provenance inspection remains available through the fallback block.
- Given an annotation has invalid offsets, missing detail, unsafe fields, or overlaps an earlier valid annotation, when the renderer processes annotations, then that annotation is ignored without breaking the answer.
- Given the traveler uses mobile, when they select an inline highlight, then the selected detail opens in the mobile drawer and does not render simultaneously with the session/sidebar drawer.
- Given annotation detail renders for a traveler, when the DOM is inspected, then raw source material, provider metadata, internal ids, operator-only fields, and admin controls are absent.

## Design Notes

- This story is intentionally UI-contract first. It enables backend-generated annotations later but does not require model or persistence changes.
- Existing implementation details to preserve: `DisplayMessage` currently has `content`, optional `provenance`, and optional `feedback`; `AssistantMessageContent` renders sectioned assistant answers; `AssistantProvenanceBlock` already opens `AnswerDetailPanel` through `handleSelectAnswerEntity`; tests assert transient selection, no `localStorage`, no `sourceSnapshot`, no `raw_source_material`, and mobile detail/session drawer separation.
- Inline highlight styling should be subtle and label-based: for example green for curated/knowledge, amber for unverified/freshness-sensitive, teal for user/trip context, and gray dotted treatment for general reasoning. Color must not be the only status indicator.
- Prefer fewer trustworthy highlights over many guessed highlights. If the annotation descriptor is missing or questionable, render plain answer text.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-shell.test.ts` -- expected: annotation UI contract tests pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no type errors.
- `pnpm test:run` -- expected: full suite passes.
- `pnpm build` -- expected: production build succeeds.

## Dev Agent Record

### Implementation Notes

- Extended `DisplayMessage` with optional `annotations` and passed them from stream and loaded conversation data.
- `AssistantMessageContent` still uses recognized Vietnamese heading section cards and now renders validated annotation spans inside each section body.
- Inline annotations are buttons that call the existing `handleSelectAnswerEntity` path, so desktop right panel and mobile detail drawer behavior remain shared with provenance rows.
- Client renderer revalidates display ranges, detail presence, duplicate ids, and overlap before rendering to avoid nested controls or crashes.
- `AssistantProvenanceBlock` remains unchanged as the fallback source-review UI for broad provenance and unannotated answers.

### Debug Log

- `pnpm test:run tests/answer-annotations.test.ts tests/ai-ask-shell.test.ts` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test:run` exceeded 360s and isolated failure reproduced in `pnpm test:run tests/facebook-capture-review.test.ts`: `reopen only accepts rejected captures and safe short reasons` violates `facebook_capture_reviews_updated_after_created_check`. This is outside annotation changes.

### Completion Notes

- Implemented clickable inline answer annotations, section-preserving rendering, selected-state ARIA, invalid annotation dropping, fallback provenance behavior, and unsafe-field tests.
- Full regression is blocked by the existing Facebook capture review timestamp constraint failure noted above; annotation-focused coverage passes.

### File List

- `_bmad-output/implementation-artifacts/spec-ui-6-render-clickable-answer-annotations.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/ai-ask/page.tsx`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/ai-ask-shell.test.ts`

### Change Log

- 2026-07-14: Added inline clickable annotation rendering and moved story to review.
