---
title: 'Story UI.5: Mobile Sidebar And Detail Drawers'
type: 'feature'
created: '2026-07-10'
status: 'done'
baseline_revision: 'a1d5e1ea32e2d7e1f8a00dd0040dfc10f65e3a20'
final_revision: 'NO_COMMIT_BY_USER_REQUEST'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/home-logged-in-empty.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/three-panel-chat-map.html'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md'
warnings:
  - 'Implemented without committing because the user explicitly requested no commit.'
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
- [x] `src/features/ai/ai-ask-composer.tsx` -- Align mobile sidebar sheet with redesigned left sidebar content: new chat, conversations, trip projects, account/privacy affordance, authorized admin entry if present -- preserve ownership and auth rules.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Add or refine selected detail drawer/sheet for mobile detail entities from UI.4 -- keep chat single-column and composer reachable.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Ensure close/Esc/focus-restore behavior for sidebar and detail sheets, with no nested modal stacks -- meet UX accessibility floor.
- [x] `src/features/chat-trips/conversation-list.tsx` -- Ensure row actions remain visible/reachable on touch and keyboard; no hover-only delete or project controls -- preserve destructive confirmations.
- [x] Tests -- Add focused assertions for mobile navigation/detail triggers and accessible names where feasible without adding a new browser stack -- protect responsive contract.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move UI.5 through `in-progress`, `review`, and `done` as work advances -- keep BMad tracking aligned.

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

- Mobile navigation now opens as a sheet containing the redesigned sidebar content: new chat, conversations, project planning controls, account/privacy copy, and an admin entry gated by server-derived roles.
- Mobile selected answer details now render as a separate bottom drawer, with close overlay/control, `Esc` handling, scroll lock, focus containment, and trigger/composer focus restoration.
- Conversation/project row destructive actions remain visible buttons with confirmation copy; existing auth, ownership, deletion, submit, streaming, image validation, and provenance safety behavior was preserved.
- The dev-auto review pass found one focus-restore gap after sheet-driven conversation/project selection; it was patched so those selections restore to the composer instead of the menu trigger.

### Verification Results

- `pnpm test:run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- passed, 70 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

## Review Triage Log

### 2026-07-10 -- Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 1, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Mobile sheet-driven conversation/project selection closed the sheet but would restore focus to the menu trigger; patched selection handlers to restore focus to the composer while preserving trigger restore for ordinary close/Esc.

### 2026-07-10 -- Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 2, low 1)
- defer: 1: (high 0, medium 0, low 1)
- reject: 2
- addressed_findings:
  - `[medium]` `[patch]` Mobile detail focus trap scoped only to the inner panel while the backdrop close button lived in the dialog; patched the trap to scope to the full dialog.
  - `[medium]` `[patch]` Mobile detail focus restoration only ran through the explicit close handler; patched drawer cleanup to restore focus when detail state is cleared while focus is inside the dialog.
  - `[low]` `[patch]` Focusable-element collection could include hidden elements; patched the selector result to exclude hidden/inert/aria-hidden descendants.

Deferred work added: browser E2E coverage for mobile drawer focus, `Esc`, scroll-lock cleanup, and admin/non-admin visibility remains useful when a browser E2E stack exists.

## Auto Run Result

Status: done

Summary: Implemented UI.5 mobile sidebar and selected-detail drawers with account/privacy/admin sidebar content, separate mobile detail drawer, focus/escape handling, review-hardened mobile focus trapping/restoration, and focused accessibility assertions.

Files changed:
- `../../src/app/ai-ask/page.tsx` -- Loads roles server-side and passes safe account/admin affordance inputs to the composer.
- `../../src/features/ai/ai-ask-composer.tsx` -- Adds mobile sidebar account/privacy/admin content, separate mobile detail drawer, focus trapping/restoration, and no nested drawer rendering.
- `../../tests/ai-ask-shell.test.ts` -- Adds focused assertions for mobile navigation/detail drawer contracts and accessible labels.
- `deferred-work.md` -- Tracks future browser interaction coverage for mobile drawer accessibility behavior.
- `sprint-status.yaml` -- Marks UI.5 done.
- `spec-ui-5-mobile-sidebar-and-detail-drawers.md` -- Records task completion, review, and verification results.

Review findings breakdown: 4 patches applied, 1 item deferred, 2 items rejected.

Follow-up review recommended: false.

Verification performed: focused shell/session tests, lint, typecheck, and production build all passed. One parallel `pnpm typecheck` attempt failed while `pnpm build` was regenerating `.next/types`; rerunning after build passed.

Residual risks: Static/source assertions cover the responsive contract without a browser E2E stack; manual mobile screen-reader/browser validation remains useful before release and is tracked in deferred work.

### File List

- `_bmad-output/implementation-artifacts/spec-ui-5-mobile-sidebar-and-detail-drawers.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/ai-ask/page.tsx`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/ai-ask-shell.test.ts`
