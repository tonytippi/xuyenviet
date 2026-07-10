---
title: 'Story UI.3: Active Three-Panel AI Ask Shell'
type: 'feature'
created: '2026-07-10'
status: 'done'
baseline_revision: 'afd49574d54c097b459ee32afaa516ad3fc14d67'
final_revision: '3597a5cab99ea29964f24f41cf62c0cc858ec8b6'
followup_review_recommended: false
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
- [x] `src/app/ai-ask/page.tsx` -- Establish active-state desktop layout with left sidebar, middle answer column, and right contextual panel region -- align to `three-panel-chat-map.html` without changing empty state.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Adapt active message list, section blocks, streaming state, failed-turn notice, image attachment rows, and composer to the middle column -- preserve existing behavior.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Add a safe right-panel placeholder/selection prompt for active conversations if no real selected entity exists yet -- prepare UI.4 without inventing data.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Ensure source/confidence block stays provenance-backed and readable inside the new layout -- do not parse answer prose.
- [x] Tests -- Update focused AI Ask shell tests for active three-panel rendering and regression coverage for no right panel in empty state -- prevent layout state bleed.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move UI.3 through `in-progress`, `review`, and `done` as work advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given an owned conversation has messages, when the authenticated traveler opens it on desktop, then the page renders left history/projects, a middle conversation/answer column, and a right contextual panel region.
- Given no answer entity has been selected yet, when the active shell renders, then the right panel shows only a safe selection prompt or remains collapsed; it does not fabricate place/source/detail facts.
- Given an assistant answer includes stored provenance, when the answer renders in the middle column, then source/confidence UI still comes from stored provenance and not parsed answer text.
- Given the user submits a new message, when streaming/pending/failure states occur, then the active shell layout remains stable and existing retry/no-misleading-message behavior is preserved.
- Given no messages exist, when `/ai-ask` renders, then the UI.2 centered empty state remains and no blank right detail panel appears.

## Design Notes

Use the accepted `three-panel-chat-map.html` mockup, but respect the final architecture note that the right surface is contextual detail, not a map-first integration. This story may create the layout foundation before selectable entity data is available.

## Review Triage Log

### Review Findings

- [x] [Review][Patch] Empty persisted conversations can render the right context panel [src/features/ai/ai-ask-composer.tsx:253]
- [x] [Review][Patch] Desktop three-panel layout can overflow or clip at `lg` widths [src/app/ai-ask/page.tsx:83]
- [x] [Review][Patch] Story revision metadata records the baseline as the final revision [_bmad-output/implementation-artifacts/spec-ui-3-active-three-panel-ai-ask-shell.md:6]

### 2026-07-10 — Follow-up review patch

- Guarded the right context placeholder with actual messages only, so an existing empty conversation remains in the UI.2 empty state without a right panel.
- Relaxed the active desktop grid to shrink the center and right columns inside the shell at `lg` widths while retaining the 760px answer cap and wider detail panel at `xl`.
- Corrected `final_revision` to the implementation commit under review.
- Added regression coverage for an empty existing conversation.

### 2026-07-10 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 3, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Removed the unconditional explicit third desktop grid track so the empty state no longer reserves a blank right column.
  - `[medium]` `[patch]` Restored empty-state-safe shell sizing while allowing the active panel to use an implicit third column only when rendered.
  - `[medium]` `[patch]` Guarded the context panel against first-question pending state before a conversation exists, avoiding detail-selection guidance before any answer/content exists.
  - `[medium]` `[patch]` Finalized sprint status to `done` only during workflow finalization so BMad tracking no longer contradicts the completed task checklist.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts tests/answer-context.test.ts` -- expected: active shell and stream/session regressions pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Implemented the active AI Ask desktop shell with persistent left history/projects, a constrained center conversation/composer column, and a safe right contextual placeholder for active conversations.
- Preserved the UI.2 empty state by keeping the right contextual panel absent and avoiding a reserved third desktop grid track when no conversation content exists.
- Kept source/confidence rendering provenance-backed in the center answer column and avoided parsing assistant prose or fabricating detail facts.
- Applied review fixes for empty-state layout bleed, active-shell sizing, first-question pending behavior, and final BMad status alignment.

### Verification Results

- `pnpm test:run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts tests/answer-context.test.ts` -- passed, 104 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.
- `pnpm test:run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts tests/answer-context.test.ts` -- passed after follow-up review patches, 105 tests.
- `pnpm lint` -- passed after follow-up review patches.
- `pnpm typecheck` -- initially failed when run concurrently with `pnpm build` because `.next/types` files were regenerated during TypeScript program loading; rerun standalone passed after follow-up review patches.
- `pnpm build` -- passed after follow-up review patches.

### File List

- `_bmad-output/implementation-artifacts/spec-ui-3-active-three-panel-ai-ask-shell.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/ai-ask/page.tsx`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/ai-ask-shell.test.ts`

## Auto Run Result

Status: done

Summary: Implemented Story UI.3. Active AI Ask conversations now render a desktop three-panel shell with left history/projects, a middle conversation/composer column, and a safe right contextual placeholder. Empty AI Ask state remains a two-column shell with no right detail/context panel or reserved blank panel space.

Files changed:
- `src/app/ai-ask/page.tsx` -- updated shell sizing and grid behavior so active conversations can host a third panel without changing empty-state layout.
- `src/features/ai/ai-ask-composer.tsx` -- added active-shell grid placement and safe right contextual placeholder while preserving composer, streaming, failed-turn, image, and provenance behavior.
- `tests/ai-ask-shell.test.ts` -- added active three-panel and empty-state regression coverage.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked UI.3 done after implementation, verification, and review.
- `_bmad-output/implementation-artifacts/spec-ui-3-active-three-panel-ai-ask-shell.md` -- recorded task completion, review triage, verification, and auto-run result.

Review findings breakdown: 4 patch findings fixed (1 high, 3 medium), 0 deferred, 0 rejected.

Follow-up review recommendation: false.

Verification performed:
- `pnpm test:run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts tests/answer-context.test.ts` -- passed, 104 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Residual risks:
- The right contextual surface is intentionally a placeholder until UI.4 introduces selectable answer entity descriptors and real detail data.
- No browser visual regression suite exists; layout coverage is static/server-rendered plus build verification.
- No commit was created because explicit commit permission was not provided.
