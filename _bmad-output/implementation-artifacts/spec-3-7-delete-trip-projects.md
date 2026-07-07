---
title: 'Delete Trip Projects'
type: 'feature'
created: '2026-07-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '31a36ae040d7e9485afe7290d3dd8591a64cdfb4'
final_revision: 'eb0117bbb8482d0db785b767cb66855ae46fc12e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-6-delete-chat-sessions.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Travelers can create and use trip projects, but they cannot delete a project they no longer want stored or used as durable trip-planning context. This leaves project context visible in normal project lists and potentially usable in future retrieval paths, violating Epic 3's user-owned data-control requirement.

**Approach:** Add an authenticated owner-only trip project delete mutation, expose a clear destructive confirmation in the AI Ask project scope UI, and use the existing database contract: deleting a project removes project-scoped context by cascade and detaches linked conversations instead of deleting their chat messages.

## Boundaries & Constraints

**Always:**
- Delete only trip projects owned by the authenticated user; unauthenticated or non-owner requests must not remove data or expose whether another user's project exists.
- Preserve linked conversations by detaching them from the deleted project, matching the current `conversations.tripProjectId ON DELETE SET NULL` schema behavior.
- Remove project-scoped `chat_context` rows through the existing trip-project cascade so deleted project context cannot appear in normal UI or retrieval use.
- Make the detach behavior clear before deletion in Vietnamese confirmation copy.
- If the active project is deleted, remove it from the local project selector/list, clear loaded project-scoped chat state, close the mobile session sheet, and route to ordinary `/ai-ask`.
- Disable project deletion while an AI response is pending or another destructive mutation is in flight.
- Record a minimal non-content audit event for successful deletion with identifiers/counts only, not project title, notes, messages, or extracted context values.

**Block If:**
- Implementation requires changing the existing linked-chat behavior from detach to delete.
- Implementation requires adding a context embeddings table or external vector-store cleanup before any embeddings table exists in this codebase.
- Product requires deleted project title/notes/context to remain user-visible after deletion.

**Never:**
- No schema migration, soft-delete/restore system, bulk project delete, admin delete, undo flow, external object-storage cleanup, or project deletion from outside the current AI Ask trip-project UI.
- No deleting linked chat messages as part of project deletion, no exposing raw audit details to travelers, and no false success message when deletion fails.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Delete owned project | Authenticated user confirms deletion for their own selected trip project | Project disappears from project selector/list; project-scoped context rows are removed; linked chats remain owned by the user with no project scope | No error expected |
| Delete project with active linked chat | User is viewing a conversation inside the project being deleted | Composer clears active messages/conversation state and routes to `/ai-ask`; the detached chat can later appear as an ordinary chat | No error expected |
| Non-owner delete attempt | Authenticated user submits another user's trip project id | No rows are deleted and no cross-user project data is exposed | Return a safe failure state/message |
| Delete during stream | User tries to delete a project while `isPending` is true | Delete control is disabled and no request is sent | Existing pending status remains visible |
| Server deletion failure | Owned project remains because action fails | Project remains visible/selected and user sees retryable Vietnamese failure copy | Do not claim deletion succeeded |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- existing delete contract: `conversations.tripProjectId` detaches on project delete and `chat_context.tripProjectId` cascades from trip projects.
- `src/features/chat-trips/trip-projects.ts` -- owns trip project reads/create; add owner-scoped delete mutation, counts, transaction, and audit summary.
- `src/features/chat-trips/actions.ts` -- server-action boundary; add delete trip project action with sign-in redirect and safe Vietnamese failure copy.
- `src/features/ai/ai-ask-composer.tsx` -- AI Ask project selector/scope UI; add delete project affordance, confirmation, pending guards, local state cleanup, and route reset.
- `src/app/ai-ask/page.tsx` -- passes trip-project delete action to the composer.
- `tests/trip-projects.test.ts` -- add server deletion tests for auth, owner checks, detach behavior, project-context cascade, and audit summary.
- `tests/ai-ask-shell.test.ts` -- add source/rendering tests for delete-project UI copy, disabled-pending behavior, and active-project cleanup/reroute contract.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- keep Story 3.7 status aligned with implementation progress.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/chat-trips/trip-projects.ts` -- add `deleteOwnedTripProject(tripProjectId)` that authenticates, locks/verifies the owned project, counts linked conversations and project-scoped context rows, deletes the owned project in a transaction, records a safe `delete` audit event, and returns `{ success: true }` or `{ success: false }` with `unauthenticated`, `not_found`, or `failed` reason -- enforces owner-only data deletion and non-content auditability.
- [x] `src/features/chat-trips/actions.ts` -- export `deleteTripProjectAction(tripProjectId)` with sign-in redirect behavior and Vietnamese retry copy consistent with existing delete conversation action -- gives the client a safe mutation boundary.
- [x] `src/features/ai/ai-ask-composer.tsx` -- accept `deleteTripProjectAction`, show a destructive delete button only when a selected project and action exist, confirm that project context will be removed and linked chats moved to ordinary chat history, disable during pending/deleting states, handle duplicate submissions, remove successful/stale projects locally, clear active conversation/messages when deleting the active project, close the mobile sheet, and route to `/ai-ask` -- keeps UI state consistent with the detach contract.
- [x] `src/app/ai-ask/page.tsx` -- pass `deleteTripProjectAction` into `AiAskComposer` -- wires the server action to the existing trip-project UI.
- [x] `tests/trip-projects.test.ts` -- cover unauthenticated/no-op, non-owner/no-op, owned project deletion, linked conversation detachment, project-scoped context cascade cleanup, and audit summary without content leakage -- verifies server deletion behavior.
- [x] `tests/ai-ask-shell.test.ts` -- cover rendered confirmation copy and source-level active-project/pending/failure cleanup contracts -- verifies UI affordance and state handling without adding a browser E2E stack.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 3.7 `in-progress` during work and `done` after successful review/verification -- keeps BMad sprint status aligned.

**Acceptance Criteria:**
- Given an authenticated traveler owns a trip project, when they confirm deletion, then the project no longer appears in normal project lists and its project context is removed from normal UI/retrieval use.
- Given the deleted trip project has linked chat sessions, when deletion succeeds, then those chats are detached rather than deleted and the pre-delete confirmation clearly states this behavior.
- Given a traveler attempts to delete a trip project they do not own, when the mutation runs, then no project or chat data is changed and the response does not reveal private project details.
- Given deletion fails server-side, when the UI receives the failure, then the project remains visible/selected and the traveler sees a retryable Vietnamese error instead of a false success.

## Spec Change Log

Empty -- no bad_spec loopback occurred.

## Review Triage Log

### 2026-07-07 -- Code review follow-up
- [x] [Review][Patch] Project deletion did not fully block competing submit/create/session actions [src/features/ai/ai-ask-composer.tsx] -- fixed by adding a delete-aware `askFormDisabled`, including destructive mutation state in project creation disables, and guarding session selection plus form submit while project deletion is in flight.

### 2026-07-07 -- Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 2, low 1)
- defer: 0
- reject: 3
- addressed_findings:
  - `[medium]` `[patch]` `src/features/ai/ai-ask-composer.tsx` -- replaced per-render destructuring array defaults with stable empty constants so omitted `initialMessages`, `initialSessions`, or `initialTripProjects` do not retrigger prop-sync effects indefinitely on ordinary `/ai-ask` renders.
  - `[medium]` `[patch]` `src/features/chat-trips/trip-projects.ts` -- changed project delete audit preparation from loading all linked conversation/context ids to aggregate counts so large projects do not allocate unnecessary row arrays.
  - `[low]` `[patch]` `src/features/ai/ai-ask-composer.tsx` -- cleared draft question, image input, and stale linked-session list in the stale `not_found` path and cleared stale linked sessions on successful project delete while routing to ordinary `/ai-ask`.

## Design Notes

- The linked-chat behavior is intentionally detach, not delete, because the current schema already encodes `ON DELETE SET NULL` for `conversations.tripProjectId`, and `tests/trip-projects.test.ts` has a regression test for this contract.
- Project-scoped extracted context can be hard-deleted with the project because `chat_context.tripProjectId` already cascades from `trip_projects`; no embeddings table exists yet, so future embeddings must adopt the same owner-status/deletion contract when introduced.

## Verification

**Commands:**
- `pnpm test:run tests/trip-projects.test.ts tests/ai-ask-shell.test.ts` -- expected: targeted trip deletion and shell contracts pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no type errors.
- `pnpm test:run` -- expected: all tests pass.
- `pnpm build` -- expected: production build succeeds.

## Auto Run Result

**Summary:** Implemented Story 3.7 -- Delete Trip Projects. The Chat/Trips module now exposes an authenticated owner-only project delete that removes project-scoped context through existing cascades, detaches linked chats through the existing `ON DELETE SET NULL` schema contract, and records a non-content audit summary. AI Ask now shows a selected-project deletion affordance with Vietnamese confirmation copy explaining that project context is removed while linked chats move to ordinary chat history.

**Files changed:**
- `src/features/chat-trips/trip-projects.ts` -- added `deleteOwnedTripProject` with owner verification, row lock, aggregate counts, hard project delete, detach-aware audit metadata, and safe failure reasons.
- `src/features/chat-trips/actions.ts` -- added `deleteTripProjectAction` with sign-in redirect and safe Vietnamese failure copy.
- `src/features/ai/ai-ask-composer.tsx` -- wired project delete action, confirmation, destructive pending guards, stable prop-sync defaults, local project/session cleanup, active chat clearing, and route reset to `/ai-ask`.
- `src/app/ai-ask/page.tsx` -- passed `deleteTripProjectAction` into the composer.
- `tests/trip-projects.test.ts` -- added server deletion coverage for unauthenticated/no-op, non-owner/no-op, linked chat detachment, project-context cascade cleanup, and non-content audit summary.
- `tests/ai-ask-shell.test.ts` -- added rendering/source contracts for project delete affordance, confirmation copy, pending/failure cleanup, action wiring, and delete lock/count ordering.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 3.7 done after review and verification.

**Verification performed:**
- `pnpm test:run tests/trip-projects.test.ts tests/ai-ask-shell.test.ts` -- passed; 2 files, 59 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm test:run` -- passed; 10 files, 162 tests.
- `pnpm build` -- passed; 8 pages generated.

**Review findings breakdown:**
- Patches applied: 3 (0 high, 2 medium, 1 low).
- Items deferred: 0.
- Items rejected: 3.
- Follow-up review recommendation: false -- fixes were localized to prop-sync stability, stale UI cleanup, and aggregate audit counting, with full verification passing.

**Residual risks:**
- Project deletion uses the browser `confirm` API, matching the existing chat-delete pattern and satisfying the explicit confirmation contract with minimal UI.
- Cross-tab stale project state is not synchronized live; stale actions still fail closed server-side and refresh/navigation resolves state. Review classified this as outside the current story's necessary scope.

**Blockers:** None.
