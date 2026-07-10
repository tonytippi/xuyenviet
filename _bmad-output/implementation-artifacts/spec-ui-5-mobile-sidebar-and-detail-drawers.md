---
title: 'Story UI.5: Mobile Sidebar And Detail Drawers'
type: 'feature'
created: '2026-07-10'
status: 'ready-for-dev'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/home-logged-in-empty.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/three-panel-chat-map.html'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md'
warnings:
  - 'Artifact-only retrofit story. No application code has been changed yet.'
---

<intent-contract>

## Intent

**Problem:** The accepted shell direction relies on desktop left sidebar and right detail panel, but mobile must keep chat as the primary column with sidebar and selected detail available through sheets/drawers. Existing mobile behavior has a conversation sheet, but it needs to cover the redesigned sidebar/project shell and selected detail panel without trapping users or hiding the composer.

**Approach:** Harden mobile/tablet responsive behavior for the redesigned AI Ask shell: sidebar opens as a navigation sheet/drawer, selected detail opens as a detail sheet/drawer, chat remains single-column, composer remains reachable, and focus management follows the UX accessibility floor. This story completes the responsive behavior for UI.2-UI.4.

## Boundaries & Constraints

**Always:** Mobile chat remains primary. Sidebar and selected detail are sheets/drawers, not persistent side columns. `Esc`/close controls dismiss the topmost sheet and restore focus. Conversation/project row actions are not hover-only. Source/detail drawers never expose raw source material or admin controls. Preserve existing auth, ownership, submit, streaming, image validation, and delete behavior.

**Block If:** The implementation requires adding a new heavy UI framework, replacing the test stack, changing protected data loading, or weakening existing deletion confirmations.

**Never:** Do not create swipe-to-delete, hidden hover-only actions, nested modal stacks, map-first mobile UI, or client-only authorization shortcuts.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Mobile opens sidebar | Traveler taps navigation trigger | Sidebar sheet shows new chat, conversations, trip projects, account/privacy/admin if authorized | Closing returns focus to trigger |
| Mobile selects conversation/project | Traveler selects row in sheet | Sheet closes and focus moves to main chat heading or composer | Unauthorized/inaccessible resource remains denied server-side |
| Mobile opens selected detail | Traveler selects source/entity | Detail sheet opens with safe detail content and close control | Missing detail data shows safe unavailable state |
| Active composer | Mobile user types/submits | Composer remains reachable and not obscured by persistent sidebars | Existing validation/failure behavior preserved |

</intent-contract>

## Code Map

- `src/features/ai/ai-ask-composer.tsx` -- Current mobile session sheet, composer, and likely detail drawer owner.
- `src/features/chat-trips/conversation-list.tsx` -- Sidebar row behavior reused in sheet/drawer.
- `src/app/ai-ask/page.tsx` -- Shell-level responsive layout and mobile header affordance if needed.
- `tests/ai-ask-shell.test.ts` -- Add static assertions for mobile triggers, accessible labels, and detail/sidebar separation where current test utilities allow.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep UI.5 status aligned.

## Tasks & Acceptance

**Execution:**
- [ ] `src/features/ai/ai-ask-composer.tsx` -- Align mobile sidebar sheet with redesigned left sidebar content: new chat, conversations, trip projects, account/privacy affordance, authorized admin entry if present -- preserve ownership and auth rules.
- [ ] `src/features/ai/ai-ask-composer.tsx` -- Add or refine selected detail drawer/sheet for mobile detail entities from UI.4 -- keep chat single-column and composer reachable.
- [ ] `src/features/ai/ai-ask-composer.tsx` -- Ensure close/Esc/focus-restore behavior for sidebar and detail sheets, with no nested modal stacks -- meet UX accessibility floor.
- [ ] `src/features/chat-trips/conversation-list.tsx` -- Ensure row actions remain visible/reachable on touch and keyboard; no hover-only delete or project controls -- preserve destructive confirmations.
- [ ] Tests -- Add focused assertions for mobile navigation/detail triggers and accessible names where feasible without adding a new browser stack -- protect responsive contract.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move UI.5 through `in-progress`, `review`, and `done` as work advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given the authenticated AI Ask shell renders on mobile, when the traveler opens navigation, then conversations, trip projects, new-chat action, account/privacy, and authorized admin entry are reachable through a sheet/drawer.
- Given the traveler closes the mobile navigation sheet, when focus returns, then it lands on the trigger or another logical main-chat target.
- Given a selected answer entity exists on mobile, when the traveler opens detail, then the detail appears as a sheet/drawer with safe title, summary, quick facts/source details, close control, and no raw/operator-only material.
- Given the mobile detail or sidebar is open, when the traveler uses `Esc` or the close control, then only the topmost sheet closes and the composer/chat state is preserved.
- Given conversation/project row actions are needed on mobile, when the user uses touch or keyboard, then actions are visible/reachable and destructive actions require explicit confirmation.

## Design Notes

This story is the responsive completion pass for the accepted shell. Avoid adding a new component system. If reusable sheet helpers emerge naturally, keep them local unless they are truly cross-cutting.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- expected: focused shell/session coverage passes.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Pending implementation.

### Verification Results

- Pending implementation.

### File List

- `_bmad-output/implementation-artifacts/spec-ui-5-mobile-sidebar-and-detail-drawers.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
