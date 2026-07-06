---
title: 'Story 2.2: Create Conversation And Send First Message'
type: 'feature'
created: '2026-07-06'
status: 'done'
baseline_revision: '65ce04e5c75d049e7156ff75c42ac8dc70141140'
final_revision: '65ce04e5c75d049e7156ff75c42ac8dc70141140'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-authenticated-ai-ask-chat-shell.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Valid AI Ask submissions still stop at a placeholder, so authenticated travelers cannot start a durable conversation and later Epic 2 stories have no persisted message history to build on.

**Approach:** Extend the existing authenticated `submitAiAsk` action to validate the first question, create a user-owned conversation, and persist the trimmed first user message in one database transaction, then return stable IDs for later answer-generation and continuation stories.

## Boundaries & Constraints

**Always:** Keep `/ai-ask` and `submitAiAsk` server-authenticated. Reject empty, malformed, and over-2000-character questions before any database write. Persist conversation ownership with the authenticated `userId`, persist the first message with role `user`, timestamp, and conversation ID, and make cross-user conversation access impossible through any new server read helper. Add Drizzle schema and migration for conversations/messages with clear owner and lookup indexes. Keep Vietnamese user-facing success/error copy safe and accurate.

**Block If:** A product decision is required about conversation routes, assistant message generation, streaming, retrieval, usage events, or deletion semantics beyond cascade/removal for user-owned conversation rows. Block if migration generation cannot be completed or the schema cannot preserve owner-scoped access.

**Never:** Do not call an AI provider, create assistant messages, usage events, retrieval/provenance rows, web search records, trip project context, fake answers, fake citations, or a new conversation detail route in this story. Do not create conversations for invalid or unauthenticated submissions. Do not expose another user's conversation or add generic cross-module write helpers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid first message | Authenticated user submits `  Đi Đà Nẵng 5 ngày  ` | Creates one owned conversation and one linked `user` message with trimmed content; returns `conversation-created`, `conversationId`, and `messageId` | No error expected |
| Empty question | Authenticated user submits whitespace | Rejects with required-question validation | No conversation or message row |
| Too-long question | Authenticated user submits more than 2000 chars | Rejects with max-length validation | No conversation or message row |
| Malformed direct payload | Authenticated caller sends missing/non-string `question` | Rejects with safe validation error | No conversation or message row |
| Unauthenticated submit | No valid session submits any question | Rejects through existing authenticated mutation guard | No conversation or message row |
| Cross-user read | User B requests User A's conversation through new server helper | Access denied/returns null without messages | No messages exposed |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- add `conversations` and `messages` tables, message role type/check, owner/conversation indexes, and exports in `schema`.
- `drizzle/migrations/0004_wild_nemesis.sql` -- generated migration for conversation/message tables and constraints.
- `src/features/ai/ask-gate.ts` -- replace valid-submit placeholder with authenticated transactional persistence and ID return.
- `src/features/ai/ai-ask-composer.tsx` -- update success copy to reflect that a conversation and first message were saved, without rendering fake assistant content.
- `src/features/chat-trips/conversations.ts` -- add a small server-only owner-scoped read helper for conversation access tests and future stories.
- `tests/ai-ask-shell.test.ts` -- update existing action expectations and add persistence/invalid/no-side-effect assertions.
- `tests/ai-ask-conversation.test.ts` -- add owner-scoped conversation access coverage if keeping it separate improves clarity.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 2.2 `in-progress` during work and `done` after verification/review.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/*` -- add conversation/message persistence owned by users with Drizzle migration -- enable durable first-message storage.
- [x] `src/features/ai/ask-gate.ts` -- keep existing validation/auth seam and create conversation plus first user message in one transaction -- satisfy Story 2.2 without AI side effects.
- [x] `src/features/chat-trips/conversations.ts` -- add owner-scoped read helper returning null/denial for non-owners -- enforce server-side cross-user access behavior.
- [x] `src/features/ai/ai-ask-composer.tsx` -- change valid-submit success status to saved-conversation copy and preserve no fake assistant answer behavior -- keep UI honest for this story.
- [x] `tests/ai-ask-shell.test.ts` and optional `tests/ai-ask-conversation.test.ts` -- cover the I/O matrix with DB assertions -- verify writes only happen on valid authenticated submissions.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- keep Story 2.2 status aligned -- maintain BMad workflow state.

**Acceptance Criteria:**
- Given an authenticated user is on AI Ask, when they submit a valid Vietnamese planning question, then one conversation is created for that user and one trimmed user message is persisted with timestamp and conversation ID.
- Given a user message is empty, malformed, or over the limit, when submission runs, then the request is rejected with a clear validation message and no conversation, message, retrieval, usage, or AI provider side effect is created.
- Given a conversation belongs to one user, when another authenticated user attempts to access it through server code, then access is denied without exposing messages.
- Given the first message is saved, when the composer reports success, then it states the conversation was saved and that AI answering arrives later, without showing fake assistant output.

## Spec Change Log

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 3, low 1)
- defer: 0
- reject: 5: (high 0, medium 4, low 1)
- addressed_findings:
  - `[medium]` `[patch]` Added database-level conversation/message ownership integrity with a composite conversation owner foreign key and supporting unique index.
  - `[medium]` `[patch]` Changed owner-scoped conversation reads to derive the user from the authenticated server session instead of trusting a caller-supplied user ID.
  - `[low]` `[patch]` Added deterministic message ordering with `createdAt` plus `id` tie-breaker.
  - `[medium]` `[patch]` Added a database check preserving the 2000-character limit for `user` messages beyond the server action validation seam.

## Design Notes

Deletion behavior for these first conversation/message tables is intentionally simple: user-owned conversations cascade to messages, and later Epic 3 deletion stories can add soft-delete, disabled embeddings, or retention-specific behavior before retrievable chat/project-derived content exists.

## Verification

**Commands:**
- `pnpm db:generate` -- expected: creates one Drizzle migration for the new conversation/message schema.
- `pnpm test:run` -- expected: all tests pass with no external network calls.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Auto Run Result

Status: done

Summary: Implemented and reviewed Story 2.2. Valid authenticated AI Ask submissions now create a user-owned conversation and trimmed first `user` message in one transaction, invalid or unauthenticated submissions create no rows, owner-scoped conversation reads derive ownership from the authenticated session, and the UI success copy stays honest without assistant/provider/retrieval side effects.

Files changed:
- `src/db/schema.ts`
- `drizzle/migrations/0004_wild_nemesis.sql`
- `drizzle/migrations/meta/0004_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/features/ai/ask-gate.ts`
- `src/features/ai/ai-ask-composer.tsx`
- `src/features/chat-trips/conversations.ts`
- `tests/ai-ask-shell.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/spec-2-2-create-conversation-and-send-first-message.md`

Review findings breakdown: 4 patches applied (3 medium, 1 low), 0 deferred, 5 rejected.

Follow-up review recommended: false. Review-driven fixes were localized to ownership integrity, authenticated read boundaries, deterministic ordering, and DB validation; no broad architecture or product behavior changed.

Verification performed:
- `pnpm db:generate` -- passed; generated consolidated migration `0004_wild_nemesis` after review patch.
- `pnpm test:run` -- passed, 5 test files, 57 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Residual risks:
- The local `DATABASE_URL_TEST` schema was reset during verification to remove an obsolete uncommitted migration journal entry from the earlier generated migration name; the final suite passed from a clean test migration state.
- No browser interaction suite exists for the composer; current coverage is server/static render plus DB integration tests, consistent with current project test scope.
- Changes were not committed because runtime developer instruction requires explicit user request before committing.
