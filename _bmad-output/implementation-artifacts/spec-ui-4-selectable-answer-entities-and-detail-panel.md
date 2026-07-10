---
title: 'Story UI.4: Selectable Answer Entities And Detail Panel'
type: 'feature'
created: '2026-07-10'
status: 'ready-for-dev'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/three-panel-chat-map.html'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-6-render-source-and-confidence-section.md'
warnings:
  - 'Artifact-only retrofit story. No application code has been changed yet.'
---

<intent-contract>

## Intent

**Problem:** The active shell needs a right contextual panel that responds to selected answer entities, but current assistant messages are plain structured content plus provenance rows. The UI needs a safe, minimal selected-entity descriptor contract that can power details for sources, warnings, route/cost/trip facts, and later place/hotel entities without fabricating trusted data.

**Approach:** Add transient client-side selected answer entity descriptors for the data the app already owns safely: source/provenance rows, freshness warnings/general reasoning rows, section-level answer anchors, and selected trip context where available. Render a right detail panel from those descriptors using safe snapshots only. Keep selection transient client state unless a later story explicitly requires URL/share/back-button behavior.

## Boundaries & Constraints

**Always:** Use the `AnswerEntityDescriptor` contract from `frontend-shell-implementation-notes.md` as the implementation guide. Detail content must come from stored provenance, safe source snapshots, selected trip/project context, or explicit UI metadata. Source/confidence details must not come from parsed answer prose. Selected entities must be keyboard-focusable, visibly selected, and closeable with focus restoration. The right panel must not expose raw source material, operator notes, provider payloads, admin controls, or hidden page data.

**Block If:** A desired detail requires extracting untrusted facts from free-form answer text and presenting them as source-backed truth, adding a new persisted selection table, or changing retrieval/provenance schemas.

**Never:** Do not parse assistant text into trusted place/hotel/route facts, do not invent citations, do not mark web/general content as approved, do not expose raw/operator-only source material, and do not add Google Maps.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Source chip selected | Provenance row is selected | Right panel shows source title/type/url/date/confidence/freshness from safe DTO | Missing optional fields are labeled or omitted without hiding trust category |
| General reasoning selected | General provenance row selected | Right panel labels it as general AI reasoning and unverified | No fake source URL or confidence upgrade |
| Warning/freshness selected | Freshness warning entity selected | Right panel explains what should be verified before acting | No booking/action guarantee language |
| No selection | Active chat loaded without selected entity | Right panel shows safe prompt or remains collapsed | No fabricated details |

</intent-contract>

## Code Map

- `src/features/ai/ai-ask-composer.tsx` -- Likely owner for client selection state, selectable source/warning/section controls, and right detail panel rendering.
- `src/features/retrieval/provenance.ts` -- Provides UI-safe provenance DTOs used by source detail entities.
- `src/app/ai-ask/page.tsx` -- Shell region for right detail panel if the layout is split at page level.
- `src/features/chat-trips/labels.ts` -- Existing trip/project labels for context descriptors.
- `tests/ai-ask-shell.test.ts` -- Add assertions for selectable provenance/detail panel rendering, non-parsing behavior, and accessibility labels.
- `tests/answer-context.test.ts` -- Preserve stream payload/provenance behavior if detail panel uses streamed DTOs.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep UI.4 status aligned.

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/ai/ai-ask-composer.tsx` -- Add a minimal `AnswerEntityDescriptor` type aligned to the architecture note -- keep selection transient client state.
- [ ] `src/features/ai/ai-ask-composer.tsx` -- Make source/provenance rows or chips selectable and keyboard-focusable -- allow opening the right detail panel from safe provenance data.
- [ ] `src/features/ai/ai-ask-composer.tsx` -- Render the right detail panel with selected entity header, summary, quick facts, related details, and provenance chips where data exists -- avoid duplicating whole answers.
- [ ] `src/features/ai/ai-ask-composer.tsx` -- Add close/Esc behavior and focus restoration for selected detail -- meet accessibility floor.
- [ ] Tests -- Cover selected source detail rendering from stored provenance, general reasoning unverified labeling, no detail fabrication from answer text, and keyboard-accessible controls where current test stack allows -- prevent trust regressions.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move UI.4 through `in-progress`, `review`, and `done` as work advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given an assistant answer has source provenance rows, when the traveler selects a source row/chip, then the right detail panel opens with source title/label, type/category, URL when available, collected/checked date when available, confidence label, and freshness warning when applicable.
- Given a selected provenance item is web or general reasoning, when detail is displayed, then it remains labeled external/unverified or general AI reasoning and is not upgraded to approved knowledge.
- Given an answer contains source-looking text without provenance, when the UI renders, then no selectable source detail is created from that text.
- Given the traveler uses keyboard navigation, when they open and close the detail panel, then focus is visible, selected state is exposed, and focus returns to the triggering control.
- Given no answer entity is selected, when the active shell renders, then the right panel does not fabricate place, hotel, route, cost, warning, or source details.

## Design Notes

The right detail panel is an inspector for selected answer entities, not a second chat and not a Google Maps panel. It should use compact facts and provenance chips. Prefer safe source/provenance entities first; richer place/hotel extraction can be a later story if it has trusted structured data.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-shell.test.ts tests/answer-context.test.ts` -- expected: focused detail/provenance coverage passes.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Pending implementation.

### Verification Results

- Pending implementation.

### File List

- `_bmad-output/implementation-artifacts/spec-ui-4-selectable-answer-entities-and-detail-panel.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
