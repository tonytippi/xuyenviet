---
title: 'Delete Chat Sessions'
type: 'feature'
created: '2026-07-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'daf2664aca857aaab3ca40d001590905d13a6bd7'
final_revision: 'UNCOMMITTED'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-5-correct-trip-details-through-chat.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Travelers can create and revisit chat sessions, but they cannot remove a session they no longer want stored or used as remembered trip context. This violates the Epic 3 data-control requirement and leaves old messages, extracted context, and image metadata visible in normal UI/retrieval paths.

**Approach:** Add an authenticated owner-only chat session delete mutation, wire a sober confirmation flow into the existing session list on desktop and mobile, and rely on the current database cascade contract to remove the conversation, messages, image attachment metadata, and chat context while retaining non-content AI usage metadata with nulled conversation/message references.

## Boundaries & Constraints

**Always:**
- Delete only conversations owned by the authenticated user; unauthenticated or non-owner requests must not remove anything or expose whether another user's conversation exists.
- Remove the deleted session from ordinary and project session lists, and if the active session is deleted, clear loaded messages/context and navigate back to the matching empty AI Ask scope.
- Keep deletion disabled while an AI response is pending to avoid concurrent writes from the active stream.
- Record a minimal audit event for successful deletion with counts/identifiers only, not message contents or extracted values.
- Preserve AI usage events as non-content operational metadata; deleted conversation/message references must be null through existing FK behavior.

**Block If:**
- Implementation requires changing the `conversations`, `messages`, `message_image_attachments`, `chat_context`, or `ai_usage_events` schema.
- Non-null external image `storageKey` deletion is required before UI deletion can ship; no object-storage deletion helper exists in this codebase yet.
- Product requires project-scoped context extracted from a deleted project-linked chat to remain available after chat deletion.

**Never:**
- No bulk delete, undo/restore, admin delete, soft-delete UI, project deletion, object-storage integration, embeddings table, or new deletion queue.
- No deleting another user's data, no rendering raw audit details to travelers, and no false success message when the server action fails.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Delete owned ordinary chat | Authenticated user confirms deletion for their ordinary conversation | Conversation disappears from the list; active chat clears if it was selected; messages, image metadata, and chat context are removed by cascade | No error expected |
| Delete owned project chat | Authenticated user confirms deletion for a conversation linked to their selected trip project | Conversation disappears from the selected project's related chat list; project remains selected; chat-scoped and project-scoped context rows sourced from that conversation are removed | No error expected |
| Non-owner delete attempt | Authenticated user submits another user's conversation id | No rows are deleted and no cross-user data is exposed | Return a safe failure state/message |
| Delete active chat during stream | User tries to delete while `isPending` is true | Delete control is disabled and no request is sent | Existing pending status remains visible |
| Server deletion failure | Owned conversation remains because action fails | Session remains visible and active state is not cleared | Show retryable Vietnamese failure copy |

</intent-contract>

## Code Map

- `src/features/chat-trips/conversations.ts` -- owns authenticated conversation reads/lists; add owner-scoped delete mutation and audit/count summary.
- `src/features/chat-trips/actions.ts` -- server-action boundary for chat session deletion from the client UI.
- `src/features/chat-trips/conversation-list.tsx` -- session list UI; add non-nested delete button with explicit confirmation copy.
- `src/features/ai/ai-ask-composer.tsx` -- client chat shell; wire delete action, optimistic-safe state updates, active-chat clearing, routing, and mobile sheet behavior.
- `src/db/schema.ts` -- existing FK cascade and `set null` usage metadata contract; no schema changes expected.
- `tests/ai-ask-sessions.test.ts` -- add data-layer tests for owner-only deletion, cascade cleanup, usage metadata preservation, and audit event creation.
- `tests/ai-ask-shell.test.ts` -- add source/rendering tests for the delete affordance, confirmation, disabled-pending behavior, and active-session clearing contract.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- keep Story 3.6 status aligned with implementation progress.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/chat-trips/conversations.ts` -- add `deleteOwnedConversation(conversationId)` that authenticates, verifies ownership, counts related rows, deletes the owned conversation in a transaction, records a safe `delete` audit event, and returns `{ success: true }` or `{ success: false }` without leaking non-owner existence -- enforces server-side data ownership and deletion contract.
- [x] `src/features/chat-trips/actions.ts` -- export a server action wrapping `deleteOwnedConversation` with Vietnamese failure copy and sign-in redirect behavior consistent with existing actions -- gives the client a safe mutation boundary.
- [x] `src/features/chat-trips/conversation-list.tsx` -- add an accessible delete control per session with explicit Vietnamese confirmation text naming that messages and remembered details will be removed from normal use -- gives travelers clear control without accidental deletion.
- [x] `src/features/ai/ai-ask-composer.tsx` -- pass and invoke the delete action, disable delete while pending, keep failed deletes visible with retry status, remove successful deletes from `sessions`, clear active messages/state, close the mobile sheet, and route to `/ai-ask` or `/ai-ask?tripProjectId=...` as appropriate -- keeps UI state consistent after destructive mutation.
- [x] `tests/ai-ask-sessions.test.ts` -- cover unauthenticated/no-op, non-owner/no-op, owned ordinary/project chat delete, cascade removal of messages/attachments/chat_context, `ai_usage_events` set-null preservation, and audit event summary -- verifies server deletion behavior.
- [x] `tests/ai-ask-shell.test.ts` -- cover rendered delete copy and source-level active-session/pending/failure behavior contracts -- verifies UI affordance and state handling without adding a browser E2E stack.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 3.6 `in-progress` during work and `done` after successful review/verification -- keeps BMad sprint status aligned.

**Acceptance Criteria:**
- Given an authenticated traveler owns a chat session, when they confirm deletion, then the session no longer appears in normal AI Ask session lists and its messages, image metadata, extracted context, and future retrieval visibility are removed.
- Given a traveler attempts to delete a chat session they do not own, when the mutation runs, then no data is deleted and the response does not reveal private details about that session.
- Given a traveler deletes the currently open chat, when deletion succeeds, then the composer clears the loaded conversation and routes to an empty AI Ask state in the same ordinary/project scope.
- Given deletion fails server-side, when the UI receives the failure, then the session remains visible and the traveler sees a retryable Vietnamese error instead of a false success.

## Spec Change Log

Empty -- no bad_spec loopback occurred.

## Review Triage Log

### 2026-07-07 -- Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 5, low 0)
- defer: 1: (high 0, medium 1, low 0)
- reject: 7
- addressed_findings:
  - `[medium]` `[patch]` `src/features/chat-trips/conversation-list.tsx` and `src/features/ai/ai-ask-composer.tsx` -- hide the delete affordance when no delete action exists so reused/test composer instances do not show a false destructive control.
  - `[medium]` `[patch]` `src/features/ai/ai-ask-composer.tsx` -- add `deletingConversationIdRef` as a synchronous duplicate-submit guard so rapid double activation cannot dispatch a second delete that overwrites success with a stale failure.
  - `[medium]` `[patch]` `src/features/chat-trips/actions.ts` and `src/features/ai/ai-ask-composer.tsx` -- surface `not_found` as a safe stale-session reason and remove that session locally so deleted-elsewhere conversations do not remain stuck in the list.
  - `[medium]` `[patch]` `src/features/chat-trips/conversations.ts` -- count all AI usage events referencing the deleted conversation in the audit summary, even if inconsistent ownership metadata exists, matching the rows affected by FK nulling.
  - `[medium]` `[patch]` `src/features/chat-trips/conversations.ts` -- log unexpected deletion failures server-side while still returning safe traveler-facing failure copy.

## Design Notes

- Hard delete matches the current schema and Epic 3 wording because `messages`, `message_image_attachments`, and `chat_context` already cascade from `conversations`, while `ai_usage_events` keeps only operational metadata through `onDelete: "set null"` references.
- Project-linked chat deletion will remove project-scoped context rows sourced from that conversation. This is acceptable for Story 3.6 unless product decides that durable project context must survive chat deletion; that decision is explicitly blocked rather than guessed.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-sessions.test.ts tests/ai-ask-shell.test.ts` -- expected: targeted deletion and shell contracts pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no type errors.
- `pnpm test:run` -- expected: all tests pass.
- `pnpm build` -- expected: production build succeeds.

## Auto Run Result

**Summary:** Implemented Story 3.6 -- Delete Chat Sessions. The Chat/Trips module now exposes an authenticated owner-only hard delete that relies on existing cascades for messages, image metadata, and chat context, preserves AI usage metadata through existing `set null` references, and records a non-content audit summary. AI Ask session lists now expose a confirmation-based delete control, disable session actions while streaming/deleting, keep failed deletions visible with retryable Vietnamese copy, and clear/reroute when the active session is deleted.

**Files changed:**
- `src/features/chat-trips/conversations.ts` -- added `deleteOwnedConversation` with owner verification, row counts, transaction delete, and audit event.
- `src/features/chat-trips/actions.ts` -- added `deleteConversationAction` server action with sign-in redirect and safe Vietnamese failure copy.
- `src/features/chat-trips/conversation-list.tsx` -- added per-session accessible delete button and explicit Vietnamese confirmation text.
- `src/features/ai/ai-ask-composer.tsx` -- wired delete action, pending disablement, failure status, session removal, active-state clearing, mobile sheet close, and scope-preserving route reset.
- `src/app/ai-ask/page.tsx` -- passed the delete server action into the composer.
- `tests/ai-ask-sessions.test.ts` -- added server deletion coverage for unauthenticated/no-op, non-owner/no-op, ordinary/project delete, cascade cleanup, usage preservation, and audit summary.
- `tests/ai-ask-shell.test.ts` -- added rendered/source shell contracts for delete affordance, confirmation, pending disablement, failure copy, and active-session clearing.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 3.6 done after verification.

**Verification performed:**
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm test:run tests/ai-ask-sessions.test.ts tests/ai-ask-shell.test.ts` -- passed; 2 files, 55 tests.
- `pnpm test:run` -- passed; 10 files, 155 tests.
- `pnpm build` -- passed; 8 pages generated.

**Review findings breakdown:**
- Patches applied: 5 (0 high, 5 medium, 0 low).
- Items deferred: 1 -- future external object-storage cleanup once non-null image storage keys are introduced.
- Items rejected: 7.
- Follow-up review recommendation: false -- review-driven fixes were localized to delete affordance visibility, duplicate-submit/stale-session handling, audit counting, and logging, with targeted and full verification passing.

**Residual risks:**
- Delete confirmation uses the browser `confirm` API rather than a custom modal; it satisfies the explicit confirmation contract with minimal new UI.
- External object storage cleanup remains intentionally out of scope because no storage deletion helper exists yet and current image metadata stores `storageKey: null`; deferred work records the future cleanup requirement before non-null keys are used.

**Blockers:** None.
