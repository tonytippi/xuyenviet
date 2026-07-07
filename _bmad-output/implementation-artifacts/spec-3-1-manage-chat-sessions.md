---
title: 'Manage Chat Sessions'
type: 'feature'
created: '2026-07-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '9c5bdc49834eacb3eb698bce30a4436c5af6fc15'
final_revision: '8285534e8ae68b76a15e3908b468a9f350592214'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** `/ai-ask` supports only one active conversation per visit. There is no UI to start a fresh chat, see past chats, or switch between them, so travelers cannot keep separate planning questions separate.

**Approach:** Add a server entrypoint that lists the authenticated user's own conversations (with a first-message preview and recency), render a session sidebar (desktop persistent / mobile sheet) with a "new chat" affordance, and let selecting a session reopen it via the existing `/ai-ask?conversationId=` URL-driven flow. No schema change — multiple conversations per user are already supported and `conversations.updatedAt` is already bumped on every message insert.

## Boundaries & Constraints

**Always:**
- List and read paths must resolve the authenticated user server-side and scope every query by `userId`; never expose another user's conversations.
- Reuse the existing `getOwnedConversation` owner-scoped read for reopening; do not add a second unscoped read path.
- Reuse the existing `key={loadedConversation?.id || "new-conversation"}` remount strategy on the composer so switching via URL resets state.
- Conversation creation stays lazy in the existing stream route (on first message send); do not create empty conversation rows upfront and do not refactor the stream route's creation/audit behavior in this story.
- UI is Vietnamese-first with diacritics; the session list is a left sidebar on desktop and a sheet on mobile; the existing right aside (example prompts + storage notice) stays.

**Block If:**
- A schema migration turns out to be required for the list/preview (it should not — confirm at implementation).

**Never:**
- No trip projects, context extraction, context usage in answers, corrections, or deletion (Stories 3.2–3.7).
- No storage-notice UI changes in this story.
- No new audit events for conversation creation or read; keep Epic 2 behavior.
- No title column, auto-title generation, or conversation rename; preview from first user message only.
- No Google Maps, booking, payments, or rewards UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Authenticated user opens AI Ask with past sessions | User has ≥1 conversation with messages | Left sidebar (desktop) / sheet (mobile) lists own sessions by recency with preview + relative time | No error expected |
| Authenticated user with no past sessions | User has 0 conversations | Sidebar shows an empty state prompting a new chat | No error expected |
| User starts a new conversation | Authenticated, no `conversationId` selected, first message sent | Stream route creates a session owned by the user; sidebar reflects the new session immediately; messages are scoped to that session | Existing stream error handling |
| User clicks "new chat" | Active session exists or a locally-created conversation is open | Composer resets to empty new-chat state and navigates to `/ai-ask` | No error expected |
| User selects a past session | Own conversation id | Navigates to `/ai-ask?conversationId=<id>`; composer remounts with that session's messages | No error expected |
| User opens another user's conversation URL | `?conversationId=<other-user-conv>` | `getOwnedConversation` returns null; page renders fresh new-chat state; no data exposed | Silent fallback, no error shown |
| Unauthenticated user visits `/ai-ask` | No session | Redirect to `/sign-in?next=/ai-ask` (existing) | Existing behavior |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- `conversations` (id, userId, createdAt, updatedAt) and `messages` (conversationId, userId, role, content, createdAt); multiple conversations per user already supported, no migration expected.
- `src/features/chat-trips/conversations.ts` -- server-only; owns `getOwnedConversation(conversationId)`. Add `listOwnedConversations()` here.
- `src/server/auth.ts` -- `getAuthenticatedSession()` returns `{ userId, email } | null`; use for list scoping.
- `src/app/ai-ask/page.tsx` -- server component; reads `searchParams.conversationId`, calls `getOwnedConversation`, redirects unauthenticated users, already remounts composer via `key`. Add list fetch + pass `initialSessions` to the composer.
- `src/features/ai/ai-ask-composer.tsx` -- client component; manages `messages` + `conversationId` state, calls `/api/ai-ask/stream`, already receives the new `conversationId` from the `done` event. Add sidebar rendering, new-chat action, session switching, and optimistic sidebar update after a new conversation is created.
- `src/app/api/ai-ask/stream/route.ts` -- POST route handler; creates conversation lazily, inserts messages, already bumps `conversations.updatedAt` on each message insert, already returns `conversationId` in `done`/`error` events. No change required in this story.
- `tests/ai-ask-shell.test.ts` -- existing Vitest shell test; pattern (mock `@/server/auth`, `testDb`, render page) for the new session test.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/chat-trips/conversations.ts` -- add `listOwnedConversations()` server-only function that resolves the authenticated session, returns `null` when unauthenticated, otherwise returns the caller's conversations ordered by `updatedAt` desc, each as `{ id, updatedAt, preview }` where `preview` is the truncated first user message content (localized placeholder when no user message exists) -- gives the sidebar owner-scoped data without a new endpoint.
- [x] `src/app/ai-ask/page.tsx` -- call `listOwnedConversations()` and pass `initialSessions` into `<AiAskComposer>` alongside existing props; preserve the existing auth redirect, the `key` remount strategy, and the silent cross-user/not-found fallback -- prevents layout regressions and keeps cross-user access denied.
- [x] `src/features/chat-trips/conversation-list.tsx` -- new client presentational component rendering the session sidebar/sheet: list of sessions (preview + relative time), active highlight, a "new chat" button, and an empty state; props `sessions`, `activeConversationId`, `onSelect(id)`, `onNewChat` -- keeps sidebar UI isolated and reusable for later trip-context work.
- [x] `src/features/ai/ai-ask-composer.tsx` -- accept `initialSessions`, hold `sessions` state, and render `<ConversationList>` as a left sidebar (desktop persistent, mobile sheet toggled from the header); wire `onSelect` to `router.push('/ai-ask?conversationId=<id>')` and `onNewChat` to reset the composer to an empty new-chat state and navigate to `/ai-ask`; after the stream returns a newly created `conversationId`, prepend that session to `sessions` state so the sidebar reflects it immediately -- delivers the create/list/switch/reopen UX.
- [x] `tests/ai-ask-sessions.test.ts` -- new Vitest test asserting `listOwnedConversations()` returns only the caller's conversations in `updatedAt` desc order and excludes other users' conversations, following the `tests/ai-ask-shell.test.ts` mocking pattern -- locks owner scoping and ordering.

**Acceptance Criteria:**
- Given an authenticated user opens AI Ask, when they start a new conversation, then the system creates a chat session owned by that user and messages in that session are scoped to that session.
- Given a user has multiple chat sessions, when they view their chat history, then they can see and reopen their own sessions and sessions from other users are never visible.
- Given a user continues an existing chat session, when they send a follow-up message, then the assistant can use relevant previous messages from that session and unrelated chat sessions are not included by default.

## Verification

**Commands:**
- `pnpm lint` -- expected: no new lint errors.
- `pnpm typecheck` -- expected: no new type errors.
- `pnpm test:run` -- expected: all existing tests plus the new session test pass.
- `pnpm build` -- expected: successful production build.

## Spec Change Log

Empty — no bad_spec loopback occurred.

## Review Triage Log

### Review Findings
- [x] [Review][Patch] Guard pending stream state when starting or selecting another chat [src/features/ai/ai-ask-composer.tsx:239]
- [x] [Review][Patch] Keep sidebar consistent when an in-flight new conversation is aborted after server persistence [src/features/ai/ai-ask-composer.tsx:336]
- [x] [Review][Patch] Make the mobile session sheet truly modal for keyboard users [src/features/ai/ai-ask-composer.tsx:182]
- [x] [Review][Patch] Prevent background page scroll while the mobile session sheet is open [src/features/ai/ai-ask-composer.tsx:504]
- [x] [Review][Patch] Stabilize relative timestamp rendering and invalid-date fallback [src/features/chat-trips/conversation-list.tsx:67]

### 2026-07-07 — Review pass 2
- intent_gap: 0
- bad_spec: 0
- patch: 5 (high 0, medium 3, low 2) — all applied.
- defer: 0
- reject: 1
- addressed_findings:
  - [medium] [patch] session switching and new-chat actions are disabled while a stream is pending, with request-id guards preventing stale stream callbacks from mutating a later UI state.
  - [medium] [patch] aborted in-flight new-conversation persistence can no longer be hidden by a new-chat action because the action is blocked until the stream completes.
  - [medium] [patch] mobile session sheet now traps Tab/Shift+Tab focus while open.
  - [low] [patch] mobile session sheet locks body scroll while open.
  - [low] [patch] relative session times now hydrate from a stable absolute date, update client-side every minute, and fall back safely for invalid timestamps.
- verification:
  - `pnpm lint` — clean, no errors.
  - `pnpm typecheck` — clean, no errors.
  - `pnpm test:run tests/ai-ask-sessions.test.ts tests/ai-ask-shell.test.ts` — 2 files, 38 tests passed.
  - `pnpm build` — successful production build; `/ai-ask` route 6.88 kB.

### 2026-07-07 — Review pass 1
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 3, low 5)
- defer: 4: (high 0, medium 0, low 4)
- reject: 1
- addressed_findings:
  - [medium] [patch] `handleNewChat` during an in-flight stream now aborts the stream and the catch path ignores AbortError so the reset state is not clobbered (Edge Case Hunter).
  - [medium] [patch] follow-up in an existing conversation now moves that session to the top of the sidebar with a fresh `updatedAt` (Edge Case Hunter).
  - [medium] [patch] mobile session sheet now closes on Escape, focuses the panel on open, and restores focus to the trigger on close (Blind Hunter + Edge Case Hunter).
  - [low] [patch] `handleSelectSession` encodes the conversation id in the URL via `encodeURIComponent` (Blind Hunter).
  - [low] [patch] removed the redundant `aria-label` from the inner `ConversationList` section; the label stays on the outer nav/dialog (Blind Hunter).
  - [low] [patch] `formatRelativeTime` returns an absolute date for negative diff (clock skew) instead of "Vừa xong" (Blind Hunter).
  - [low] [patch] `handleNewChat` clears the file input DOM value on same-URL reset (Edge Case Hunter).
  - [low] [patch] stabilized a pre-existing flaky `ai-ask-shell` test (createdAt collision + UUID id tiebreak) with explicit ordered `createdAt` so `pnpm test:run` is deterministic; surfaced during verification.

## Auto Run Result

**Summary:** Implemented Story 3.1 — Manage Chat Sessions. Added an owner-scoped `listOwnedConversations()` server entrypoint, a `ConversationList` client component (desktop left sidebar / mobile sheet with new-chat affordance), wired the AI Ask page and composer to list/switch/reopen sessions, and added a Vitest suite locking owner scoping and ordering. No schema migration; the existing lazy conversation creation in the stream route and its `updatedAt` bump are reused. Review pass 1 applied 8 patches (3 medium, 5 low) and deferred 4 low items.

**Files changed:**
- `src/features/chat-trips/conversations.ts` -- added `listOwnedConversations()` owner-scoped list with first-user-message preview.
- `src/features/chat-trips/conversation-list.tsx` -- new client presentational `ConversationList` (new-chat button, sessions, active highlight, empty state, relative time).
- `src/app/ai-ask/page.tsx` -- fetches the session list, passes `initialSessions` to the composer, 3-column desktop grid; right aside, auth redirect, key remount, and cross-user fallback preserved.
- `src/features/ai/ai-ask-composer.tsx` -- renders the sidebar/sheet, new-chat + select-session handlers, optimistic prepend + recency move-to-top, AbortError-safe catch, sheet Escape/focus a11y.
- `tests/ai-ask-sessions.test.ts` -- new Vitest tests for owner scoping, ordering, preview, truncation, unauthenticated null.
- `tests/setup.ts` -- global `next/navigation` mock so `useRouter` works in renderToStaticMarkup tests.
- `tests/ai-ask-shell.test.ts` -- stabilized pre-existing flaky ordering test with explicit `createdAt`.

**Review findings breakdown:**
- Patches applied: 8 (3 medium: in-flight new-chat abort, recency refresh, sheet a11y; 5 low: URL encoding, aria-label dedup, negative-diff time, file-input clear, flaky-test stabilization).
- Items deferred: 4 (logged in `deferred-work.md`) — query optimization + result cap, preview-logic dedup, ordering-tiebreaker test, full sheet focus-trap.
- Items rejected: 1 — global `next/navigation` test mock (reasonable test setup, verified compatible).

**Follow-up review recommendation:** false — the review pass made only localized fixes; no behavior/API/security/data-architecture changes beyond the spec, and verification is fully green.

**Verification performed:**
- `pnpm lint` — clean, no errors.
- `pnpm typecheck` — clean, no errors.
- `pnpm test:run` — 7 files, 101 tests passed (deterministic across 4 consecutive runs after stabilizing the flaky test).
- `pnpm build` — Compiled successfully; `/ai-ask` route 6.49 kB.

**Residual risks:** Sidebar list query is unbounded and uses a leftJoin-dedup (correct but N×M rows); tolerable at MVP volume, deferred for optimization. Optimistic preview truncation is duplicated server/client (deferred). Mobile sheet has Escape + focus restore but no full tab-cycling focus trap (deferred).
