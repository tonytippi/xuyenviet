---
title: 'Story UI.2: Authenticated Empty AI Ask Shell Redesign'
type: 'feature'
created: '2026-07-10'
status: 'done'
baseline_revision: '29b66aecd727af77cebcdbb2dc21090521d30e06'
final_revision: '25c69b030beeb9c6f0d46ffe43bb723ddd2a135c'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/home-logged-in-empty.html'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-authenticated-ai-ask-chat-shell.md'
warnings:
  - 'Implemented as a focused UI retrofit without changing persistence schemas or server auth boundaries.'
---

<intent-contract>

## Intent

**Problem:** The authenticated AI Ask route works, but the empty state still mixes the current conversation shell with an auxiliary right-side suggestion panel. The accepted UX requires a logged-in empty state with a left sidebar, centered Vietnamese greeting, centered composer, starter cards, and no right detail panel before an answer or selected entity exists.

**Approach:** Retrofit `/ai-ask` empty state around the accepted `home-logged-in-empty.html` mockup while preserving server-side auth, conversation/trip project ownership, composer validation, image-input validation, storage notice, and existing mutation behavior. Split the shell so empty state is visually calm and active chat can later expand to the three-panel layout.

## Boundaries & Constraints

**Always:** Keep `getAuthenticatedSession()` gating before protected data loads. Preserve owned conversation/trip project reads and server-owned mutations. Keep left sidebar available on desktop and as a sheet/drawer on mobile. The logged-in empty state must not render a blank right detail panel. Preserve Vietnamese-first copy, current auth redirect/referral behavior, composer validation, image size/type validation, no-provider-call invalid paths, and storage notice semantics.

**Block If:** The redesign requires changing persistence schemas, weakening server-side auth, removing deletion protections, or implementing the active right detail panel before UI.3/UI.4.

**Never:** Do not expose admin navigation to normal travelers, load another user's conversations/projects, create fake assistant messages, parse answer text for source UI, or add booking/payment/reward/credit behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Authenticated no conversation | `/ai-ask`, no selected conversation and no messages | Left sidebar plus centered greeting/composer/starter cards; no right detail panel | Normal empty state status copy |
| Authenticated with trip project selected but no conversation | `/ai-ask?tripProjectId=...` | Empty composer remains centered and clearly shows selected trip project context | Invalid/inaccessible project falls back safely per existing server behavior |
| Mobile empty state | Narrow viewport | Sidebar is reachable through sheet/drawer; composer remains primary | Focus returns to trigger after closing sheet |
| Unauthenticated access | `/ai-ask` without session | Redirects to sign-in before protected data loads | No conversation/trip/admin payload loaded |

</intent-contract>

## Code Map

- `src/app/ai-ask/page.tsx` -- Owns authenticated route, server auth, initial data loading, and shell-level layout decisions.
- `src/features/ai/ai-ask-composer.tsx` -- Current client shell/composer/sidebar implementation; likely split or refactor empty-state layout without changing business side effects.
- `src/features/chat-trips/conversation-list.tsx` -- Existing sidebar history list; keep keyboard/touch/delete behavior and active state.
- `src/features/chat-trips/conversations.ts` and `src/features/chat-trips/trip-projects.ts` -- Preserve owned read models and project scope alignment.
- `src/features/chat-trips/actions.ts` -- Preserve create/delete mutation semantics.
- `tests/auth-gate.test.ts` -- Keep protected-route assertions.
- `tests/ai-ask-shell.test.ts` and `tests/ai-ask-sessions.test.ts` -- Update UI contract assertions for empty shell, sidebar, mobile/sheet semantics where covered, and preserved side effects.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep UI.2 status aligned.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/ai-ask/page.tsx` -- Route authenticated empty state into a shell with left sidebar plus centered main start surface and no right detail panel -- align to `home-logged-in-empty.html`.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Refactor only as needed to separate empty start UI from active-message UI while preserving existing submit, streaming, image, delete, project, and session behavior -- reduce regression risk.
- [x] `src/features/chat-trips/conversation-list.tsx` -- Ensure desktop sidebar rows, active state, new-chat action, delete action, and keyboard/touch affordances remain usable in the redesigned shell -- preserve ownership behavior.
- [x] Tests -- Update empty AI Ask shell assertions to require centered greeting/composer/starter cards and absence of a right detail panel before messages -- protect accepted mockup behavior.
- [x] Tests -- Re-run existing auth/session/composer tests and add focused coverage for no protected data on unauthenticated access if missing -- preserve security boundary.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move UI.2 through `in-progress`, `review`, and `done` as work advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given a signed-in traveler opens `/ai-ask` without an active conversation, when the page renders, then it shows a left sidebar, centered Vietnamese greeting, centered composer, starter cards, and no right detail panel.
- Given the traveler is on mobile, when they open navigation, then conversation history and trip projects are available through a sheet/drawer and closing it restores focus appropriately.
- Given a selected trip project exists without active messages, when the empty state renders, then the composer/main surface clearly indicates the project context without turning the right panel on.
- Given the traveler submits invalid text or unsupported image input, when validation runs, then no provider call, conversation side effect, retrieval, or usage record is created.
- Given an unauthenticated user requests `/ai-ask`, when the route resolves, then sign-in redirect occurs before protected chat/trip/admin data loads.

## Design Notes

Use the accepted `home-logged-in-empty.html` mockup. Keep the empty state calm and centered. Do not show the right contextual panel until a selected answer entity exists in later retrofit stories.

## Verification

**Commands:**
- `pnpm test:run tests/auth-gate.test.ts tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- expected: focused shell/session coverage passes.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Redesigned authenticated `/ai-ask` empty state to two desktop columns: persistent left conversation sidebar plus centered main greeting/composer/starter surface.
- Removed the previous right-side suggestions/storage panel from the route; storage notice and starter cards now live under the centered empty composer.
- Kept server-side auth gating, owned conversation/project reads, submit streaming path, image validation, delete flows, and focus-restoring mobile sheet behavior intact.
- Mobile sheet now includes trip-project scope controls plus conversation history so history/projects remain reachable without enabling a right detail panel.
- Review patch fixed the first-answer pending state so empty starter UI is hidden while a response is in flight and starter cards cannot overwrite pending input.

### Verification Results

- `pnpm test:run tests/auth-gate.test.ts tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- passed, 3 files, 84 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

### File List

- `_bmad-output/implementation-artifacts/spec-ui-2-authenticated-empty-ai-ask-shell-redesign.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/ai-ask/page.tsx`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/ai-ask-shell.test.ts`

## Review Triage Log

### 2026-07-10 — Follow-up review findings
- [x] [Review][Patch] Desktop trip projects are outside the left sidebar, contrary to the sidebar IA contract [src/features/ai/ai-ask-composer.tsx:762]
- [x] [Review][Patch] Starter cards can overwrite a preserved public ask draft on the empty state [src/features/ai/ai-ask-composer.tsx:924]
- [x] [Review][Patch] Mobile sidebar/sheet acceptance behavior is not covered by an interaction test [tests/ai-ask-shell.test.ts:86]
- [x] [Review][Patch] Mobile sheet accessible name says only conversation list while it also contains trip-project controls [src/features/ai/ai-ask-composer.tsx:960]
- [x] [Review][Patch] Story frontmatter final_revision still points at the baseline revision instead of the reviewed UI.2 commit [spec-ui-2-authenticated-empty-ai-ask-shell-redesign.md:6]

### 2026-07-10 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 1, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Empty starter UI remained visible and interactive while the first answer was pending; added `showEmptyState = !hasMessages && !isPending` and disabled/guarded starter cards with `askFormDisabled`.

## Auto Run Result

Status: done

Summary: Implemented the authenticated empty AI Ask redesign with a left sidebar, centered Vietnamese greeting/composer, starter cards, project context, and no right detail panel before active messages.

Files changed:
- `../../src/app/ai-ask/page.tsx` -- removed the right aside and changed the authenticated shell to a two-column layout.
- `../../src/features/ai/ai-ask-composer.tsx` -- separated empty start UI from active-message UI, added starter cards, moved storage notice, preserved mobile sheet access to history/projects, and fixed first-answer pending starter state.
- `../../tests/ai-ask-shell.test.ts` -- updated empty-shell assertions for UI.2.
- `sprint-status.yaml` -- marked UI.2 done.
- `spec-ui-2-authenticated-empty-ai-ask-shell-redesign.md` -- recorded implementation, verification, and review outcome.

Review findings breakdown: 1 medium patch applied; 0 deferred; 0 rejected.

Follow-up review recommendation: false.

Verification performed:
- `pnpm test:run tests/auth-gate.test.ts tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- passed, 3 files, 84 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Residual risks: none known.
