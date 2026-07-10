---
title: 'Story UI.4: Selectable Answer Entities And Detail Panel'
type: 'feature'
created: '2026-07-10'
status: 'done'
baseline_revision: 'c6ef64187c0f9229e71f37a026e39042955e3886'
followup_review_recommended: true
final_revision: 'c6ef64187c0f9229e71f37a026e39042955e3886'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/three-panel-chat-map.html'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-6-render-source-and-confidence-section.md'
warnings: []
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
- [x] `src/features/ai/ai-ask-composer.tsx` -- Add a minimal `AnswerEntityDescriptor` type aligned to the architecture note -- keep selection transient client state.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Make source/provenance rows or chips selectable and keyboard-focusable -- allow opening the right detail panel from safe provenance data.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Render the right detail panel with selected entity header, summary, quick facts, related details, and provenance chips where data exists -- avoid duplicating whole answers.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Add close/Esc behavior and focus restoration for selected detail -- meet accessibility floor.
- [x] Tests -- Cover selected source detail rendering from stored provenance, general reasoning unverified labeling, no detail fabrication from answer text, and keyboard-accessible controls where current test stack allows -- prevent trust regressions.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move UI.4 through `in-progress`, `review`, and `done` as work advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given an assistant answer has source provenance rows, when the traveler selects a source row/chip, then the right detail panel opens with source title/label, type/category, URL when available, collected/checked date when available, confidence label, and freshness warning when applicable.
- Given a selected provenance item is web or general reasoning, when detail is displayed, then it remains labeled external/unverified or general AI reasoning and is not upgraded to approved knowledge.
- Given an answer contains source-looking text without provenance, when the UI renders, then no selectable source detail is created from that text.
- Given the traveler uses keyboard navigation, when they open and close the detail panel, then focus is visible, selected state is exposed, and focus returns to the triggering control.
- Given no answer entity is selected, when the active shell renders, then the right panel does not fabricate place, hotel, route, cost, warning, or source details.

### Review Findings

- [x] [Review][Patch] Announce and connect opened detail panel for keyboard/screen-reader users [`src/features/ai/ai-ask-composer.tsx:186`, `src/features/ai/ai-ask-composer.tsx:724`, `src/features/ai/ai-ask-composer.tsx:968`, `src/features/ai/ai-ask-composer.tsx:1122`]
- [x] [Review][Patch] Do not show the empty mobile detail inspector before a source is selected [`src/features/ai/ai-ask-composer.tsx:968`]
- [x] [Review][Patch] Guard close focus restoration when the original provenance trigger is detached [`src/features/ai/ai-ask-composer.tsx:729`]
- [x] [Review][Patch] Use non-source accessible labels for general-reasoning provenance rows [`src/features/ai/ai-ask-composer.tsx:187`]
- [x] [Review][Defer] Add DOM interaction coverage for click selection, Escape close, selected-state updates, and focus restoration [`tests/ai-ask-shell.test.ts:346`] -- deferred, pre-existing test harness gap

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

- Implemented transient `AnswerEntityDescriptor` client state in `src/features/ai/ai-ask-composer.tsx` with provenance-only descriptor creation.
- Made stored provenance rows selectable with keyboard-focusable buttons, visible focus styles, and `aria-pressed` selected state.
- Added right detail panel rendering for selected source/general/warning descriptors with title, type/category, URL, checked date, confidence, freshness, and unverified labeling.
- Added close button, scoped Escape close behavior, and focus restoration to the triggering provenance control.
- Added a mobile-visible selected detail surface so selected provenance details are not desktop-only.
- Preserved the empty/no-selection panel as non-fabricating copy and did not parse assistant text into source details.
- Addressed review findings by removing invalid `role=option`/`aria-selected` markup, avoiding raw provenance IDs in the traveler panel, tightening general-reasoning descriptor typing, and removing stale story warnings.

## Review Triage Log

### 2026-07-10 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 1, medium 5, low 2)
- defer: 1: (low 1)
- reject: 2: (medium 2, low 0)
- addressed_findings:
  - `[medium]` `[patch]` Removed invalid `role="option"` / `aria-selected` usage without a listbox parent and kept the valid button `aria-pressed` selected state.
  - `[high]` `[patch]` Added a mobile-visible selected detail surface so provenance selection is not invisible below desktop breakpoints.
  - `[medium]` `[patch]` Scoped Escape close behavior away from typing targets and the session sheet to avoid competing overlay/textarea handling.
  - `[medium]` `[patch]` Changed general-reasoning descriptors from `source` to non-source `action` type while preserving unverified copy.
  - `[medium]` `[patch]` Removed stale story warning that claimed no application code had changed.
  - `[low]` `[patch]` Replaced raw provenance ID chips with human-readable `Nguồn 1` labels.
  - `[low]` `[patch]` Made detail entry React keys robust against duplicate labels.
  - `[low]` `[defer]` Behavioral client interaction tests for click/Escape/focus would be stronger than current server-render/string coverage, but the current test stack does not include a DOM interaction harness.

## Auto Run Result

Status: done

Summary: Implemented Story UI.4. AI Ask provenance rows are now selectable answer entities backed by safe stored provenance DTOs, opening a contextual detail panel with source/category, URL, checked date, confidence, freshness, and unverified reasoning labels without parsing assistant prose.

Files changed:
- `src/features/ai/ai-ask-composer.tsx` -- added transient answer entity selection, selectable provenance controls, desktop/mobile detail panels, safe descriptor creation, scoped Escape close, and focus restoration.
- `tests/ai-ask-shell.test.ts` -- added regression coverage for selectable provenance markup, selected web/general detail rendering, mobile detail surface, and provenance-only/transient selection contracts.
- `_bmad-output/implementation-artifacts/spec-ui-4-selectable-answer-entities-and-detail-panel.md` -- recorded implementation, review triage, verification, and final result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked UI.4 done.

Review findings breakdown: 8 patch findings fixed, 1 low-severity test-depth item deferred, 2 findings rejected as outside this story's effective scope or already mitigated by the implementation.

Follow-up review recommendation: true, because review-driven changes touched accessibility, responsive behavior, and trust labeling.

Verification performed:
- `pnpm test:run tests/ai-ask-shell.test.ts tests/answer-context.test.ts` -- passed, 99 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed standalone after an earlier concurrent run raced with `pnpm build` regenerating `.next/types`.
- `pnpm build` -- passed.

Residual risks:
- Current tests verify several interaction contracts through server-rendered markup and source assertions rather than a browser DOM interaction test harness.
- No commit was created because repository instructions require explicit approval before committing, even though the BMad auto-dev review step normally asks to commit.

### Follow-up Review Patch Result

- Addressed 4 patch findings from follow-up code review: connected provenance triggers to detail panel IDs, exposed expanded state, moved focus to the visible detail panel on selection, guarded close focus restoration for detached triggers, hid the mobile detail inspector until an entity is selected, and used non-source accessible labels for general reasoning and warning rows.
- Deferred DOM interaction coverage remains tracked in `_bmad-output/implementation-artifacts/deferred-work.md` until the project adopts a browser interaction test harness.

### Follow-up Verification Results

- `pnpm test:run tests/ai-ask-shell.test.ts tests/answer-context.test.ts` -- passed, 99 tests.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.
- `pnpm typecheck` -- passed after rerun. The first parallel run failed because `pnpm build` regenerated `.next/types` while `tsc --noEmit` was reading them.

### Verification Results

- `pnpm test:run tests/ai-ask-shell.test.ts tests/answer-context.test.ts` -- passed, 99 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.

### File List

- `_bmad-output/implementation-artifacts/spec-ui-4-selectable-answer-entities-and-detail-panel.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/ai-ask-shell.test.ts`
