---
title: 'Story UI.3: Active Three-Panel AI Ask Shell'
type: 'feature'
created: '2026-07-10'
status: 'ready-for-dev'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/three-panel-chat-map.html'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-structured-road-trip-answer-format.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-6-render-source-and-confidence-section.md'
warnings:
  - 'Artifact-only retrofit story. No application code has been changed yet.'
---

<intent-contract>

## Intent

**Problem:** Active AI Ask conversations render functional persisted messages, streaming states, and source/confidence sections, but the layout does not yet match the accepted active three-panel workspace: left history/projects, middle answer/conversation, and right contextual detail surface. Without this shell, later selectable detail work has no stable layout target.

**Approach:** Retrofit the active conversation state to match `three-panel-chat-map.html` using existing persisted messages, source/confidence DTOs, section rendering, sidebar data, and composer behavior. This story establishes the active desktop three-column shell and responsive collapse behavior, but it may keep the right panel as a safe placeholder/empty selected-state contract until UI.4 implements real selected entity descriptors.

## Boundaries & Constraints

**Always:** Preserve AI Ask server-side auth and user-owned conversation/project scoping. Preserve existing streaming behavior, failed-turn recovery, image validation, source/confidence rendering from stored provenance, and no answer-text parsing. Desktop active chat uses left sidebar, middle conversation, and right contextual panel area. Empty state behavior from UI.2 must remain unchanged. Mobile behavior may keep detail/sidebar as sheets if UI.5 is not complete yet.

**Block If:** A real detail panel requires parsing assistant prose for trusted facts, adding maps/Google Maps, changing provenance schema, exposing raw source material, or adding persisted selected-detail objects.

**Never:** Do not build map integration, booking/payment/reward UI, fake source chips, fake citations, provider-specific source UI, or traveler exposure of raw/operator-only source material.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Existing conversation | Owned conversation with messages | Active desktop shell shows left sidebar, middle conversation, and right contextual panel area | Missing optional panel data shows safe empty/selection prompt |
| New streamed answer | User submits message and assistant streams response | Middle conversation preserves pending/streaming/final states; shell layout remains stable | Failed stream keeps recovery behavior and no misleading assistant final |
| Answer with provenance | Assistant message has stored provenance | Source/confidence remains rendered from provenance rows and may be visually compatible with future detail panel | Missing rows do not fabricate sources |
| Empty state | No messages | UI.2 empty centered layout remains; no forced right panel | No blank desktop inspector before content exists |

</intent-contract>

## Code Map

- `src/app/ai-ask/page.tsx` -- Shell-level grid/layout and authenticated data wiring.
- `src/features/ai/ai-ask-composer.tsx` -- Active conversation message rendering, streaming state, composer, and source/confidence block.
- `src/features/chat-trips/conversation-list.tsx` -- Left sidebar history/project affordances used by active shell.
- `src/features/retrieval/provenance.ts` -- Existing UI-safe source/confidence DTOs; use as source data, do not parse assistant text.
- `tests/ai-ask-shell.test.ts` -- Active layout/source rendering assertions.
- `tests/ai-ask-sessions.test.ts` and `tests/answer-context.test.ts` -- Preserve conversation loading and stream payload behavior.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep UI.3 status aligned.

## Tasks & Acceptance

**Execution:**
- [ ] `src/app/ai-ask/page.tsx` -- Establish active-state desktop layout with left sidebar, middle answer column, and right contextual panel region -- align to `three-panel-chat-map.html` without changing empty state.
- [ ] `src/features/ai/ai-ask-composer.tsx` -- Adapt active message list, section blocks, streaming state, failed-turn notice, image attachment rows, and composer to the middle column -- preserve existing behavior.
- [ ] `src/features/ai/ai-ask-composer.tsx` -- Add a safe right-panel placeholder/selection prompt for active conversations if no real selected entity exists yet -- prepare UI.4 without inventing data.
- [ ] `src/features/ai/ai-ask-composer.tsx` -- Ensure source/confidence block stays provenance-backed and readable inside the new layout -- do not parse answer prose.
- [ ] Tests -- Update focused AI Ask shell tests for active three-panel rendering and regression coverage for no right panel in empty state -- prevent layout state bleed.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move UI.3 through `in-progress`, `review`, and `done` as work advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given an owned conversation has messages, when the authenticated traveler opens it on desktop, then the page renders left history/projects, a middle conversation/answer column, and a right contextual panel region.
- Given no answer entity has been selected yet, when the active shell renders, then the right panel shows only a safe selection prompt or remains collapsed; it does not fabricate place/source/detail facts.
- Given an assistant answer includes stored provenance, when the answer renders in the middle column, then source/confidence UI still comes from stored provenance and not parsed answer text.
- Given the user submits a new message, when streaming/pending/failure states occur, then the active shell layout remains stable and existing retry/no-misleading-message behavior is preserved.
- Given no messages exist, when `/ai-ask` renders, then the UI.2 centered empty state remains and no blank right detail panel appears.

## Design Notes

Use the accepted `three-panel-chat-map.html` mockup, but respect the final architecture note that the right surface is contextual detail, not a map-first integration. This story may create the layout foundation before selectable entity data is available.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts tests/answer-context.test.ts` -- expected: active shell and stream/session regressions pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Pending implementation.

### Verification Results

- Pending implementation.

### File List

- `_bmad-output/implementation-artifacts/spec-ui-3-active-three-panel-ai-ask-shell.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
