---
title: 'Keep Workspace Selection Canonical Across Devices'
type: 'feature'
created: '2026-07-16'
status: 'done'
baseline_revision: 'ede631d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The AI Ask route safely suppresses stale, unauthorized, mismatched, and incomplete workspace selection, but leaves the requested IDs in the address bar. The mobile shell also lacks the required active-workspace title and direct account access.

**Approach:** Canonicalize successfully resolved, owner-scoped conversation and trip-project selection on the authenticated server route, and make the existing responsive shell communicate the same canonical workspace model without adding loaders or persistence.

## Boundaries & Constraints

**Always:** Keep selection URL-owned and derived solely from server-resolved owned resources. Preserve `ref` and normalized `draft` when redirecting. Use the existing Chat/Trips reads and commands at every breakpoint; retain mobile sheet focus trapping/restoration, `aria-current`, visible focus, and mutually exclusive navigation/detail sheets. Terminal client actions must navigate to the canonical route so server props reconcile temporary optimistic UI.

**Block If:** Existing server reads cannot distinguish a resolved owned project/chat from an invalid selection without exposing private-resource existence.

**Never:** Do not add a breakpoint-specific data loader, client-side ownership validation, new persistence, maps, free-text entity inference, or a second dialog/sheet. Do not expose whether stale IDs were deleted, malformed, or owned by another traveler.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Direct project chat | Owned project-scoped `conversationId` without `tripProjectId` | Redirect to canonical URL containing the conversation and its owned project. | No private data is exposed. |
| Invalid selection | Stale, deleted, unauthorized, or mismatched conversation/project IDs | Redirect to the URL for the safely resolved owned fallback, or `/ai-ask` when none remains. | Treat all invalid forms identically. |
| Mobile workspace | Empty or active server-loaded shell | Top bar exposes navigation, active workspace label, and direct account access; composer is bottom-safe without covering answer content. | Existing focus-managed sheet remains the only navigation surface. |

</intent-contract>

## Code Map

- `src/app/ai-ask/page.tsx` -- Authenticated, owner-scoped AI Ask shell read and selection resolution.
- `src/features/ai/ai-ask-composer.tsx` -- Existing URL transitions, responsive navigation shell, temporary optimistic state, and composer layout.
- `src/features/chat-trips/actions.ts` -- Project-create redirect into the selection URL.
- `tests/ai-ask-shell.test.ts` -- Authenticated shell, owner-scoping, and source-level responsive contracts.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/ai-ask/page.tsx` -- Build the canonical AI Ask URL from resolved owned conversation/project state, preserve supported referral/draft state, and redirect only when the incoming supported selection representation differs -- prevents stale or incomplete IDs from remaining addressable.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Use one canonical selection URL helper for terminal client navigation, refresh server data after terminal stream/delete paths, add mobile active-workspace and account controls, and make the composer safe-area-aware without changing command ownership -- keeps all breakpoints on the server shell model.
- [x] `tests/ai-ask-shell.test.ts` -- Cover canonical redirect behavior for direct project chats, unauthorized/stale selections, and mismatched IDs; assert the mobile shell contract -- guards owner safety and responsive selection behavior.

**Acceptance Criteria:**
- Given a traveler selects, creates, switches, or deletes a workspace resource, when the terminal action completes, then `/ai-ask` represents only the active owned `conversationId` and/or `tripProjectId` in canonical order.
- Given an incoming selection is stale, unauthorized, mismatched, or missing a project scope implied by its owned conversation, when the server shell resolves it, then it redirects to the safe canonical URL without disclosing the invalid selection's status.
- Given the workspace renders at desktop, tablet, or mobile widths, when a traveler opens or selects navigation, then it uses the existing user-scoped server shell and URL selection while mobile selection closes the sheet and moves focus to the composer.
- Given a traveler uses the mobile shell, when empty or active, then its top bar offers menu, active workspace title, and account access, and its composer remains reachable above the safe-area without obscuring the latest content.
- Given navigation, detail, source, or destructive UI is active, when keyboard or screen-reader users interact, then active rows retain `aria-current` and visible focus and no more than one sheet/dialog is interactive.

## Design Notes

The canonical route allows only selection plus the existing supported `ref` and normalized `draft` parameters. A project-scoped conversation owns its project context; ordinary conversations never carry a project ID. Redirects make server-loaded props the terminal truth, while in-flight local messages and summaries remain temporary responsiveness aids.

## Review Triage Log

### 2026-07-16 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 0, low 2)
- defer: 0
- reject: 1
- addressed_findings:
  - `[low]` `[patch]` Removed unsupported query parameters during server-side URL canonicalization.
  - `[low]` `[patch]` Normalized whitespace-only referral parameters before canonical URL comparison.

## Auto Run Result

**Summary:** Canonicalized authenticated AI Ask workspace selection across devices and completed the responsive mobile workspace affordances.

**Files changed:**
- `src/app/ai-ask/page.tsx` -- Resolves owner-scoped selection into the canonical URL and strips unsupported or empty parameters safely.
- `src/features/ai/ai-ask-composer.tsx` -- Reuses canonical client selection URLs, reconciles terminal mutations with the server shell, and adds mobile title/account/safe-area behavior.
- `tests/ai-ask-shell.test.ts` -- Covers direct project-chat, invalid/mismatched selection, parameter cleanup, and mobile-shell regressions.
- `_bmad-output/implementation-artifacts/spec-7-4-keep-workspace-selection-canonical-across-devices.md` -- Records Story 7.4 planning, verification, and review results.

**Review findings:** Two localized low-severity canonicalization gaps were patched. One suggestion to retain `ref`/`draft` after terminal mutations was rejected because completed navigation intentionally consumes that transient entry state.

**Verification:** `pnpm exec vitest run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts tests/trip-projects.test.ts tests/auth-gate.test.ts` passed (113 tests). `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.

**Residual risks:** Visual behavior at real device safe-area insets, 200% zoom, and screen-reader interaction remains a manual check.

## Verification

**Commands:**
- `pnpm exec vitest run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts tests/trip-projects.test.ts tests/auth-gate.test.ts` -- expected: all selected tests pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: production build succeeds.
- `git diff --check` -- expected: no whitespace errors.
