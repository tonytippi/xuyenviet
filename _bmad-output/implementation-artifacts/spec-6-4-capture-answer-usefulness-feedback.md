---
title: '6.4 Capture Answer Usefulness Feedback'
type: 'feature'
created: '2026-07-11'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'c350fdf070c745558842b1b2a77431148d3e0a9b'
final_revision: 'uncommitted working tree based on c350fdf070c745558842b1b2a77431148d3e0a9b'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-3-family-aware-activities-and-suitability-notes.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** XuyenViet persists assistant answers and provenance, but travelers cannot mark whether an answer was useful. Epic 6 needs answer-level feedback linked to the persisted assistant response so the public MVP quality loop can measure usefulness without blocking chat or source inspection.

**Approach:** Add a protected, owner-scoped feedback path that stores one current usefulness rating per assistant answer with an optional short comment, loads it with owned conversation history, and renders a lightweight Vietnamese-first footer control on assistant answers.

## Boundaries & Constraints

**Always:** Link feedback to the persisted assistant message and owning user/conversation. Allow rating changes through deterministic upsert behavior so reports see one current rating per answer. Keep feedback optional and non-blocking for reading, continuing chat, opening sources, and detail-panel use. Store and return only safe feedback summaries; do not audit or expose assistant content, user prompts, raw source material, provider payloads, or provenance snapshots through feedback.

**Block If:** The implementation cannot verify the target message is an owned assistant message; a schema design would preserve traveler feedback after the underlying conversation/message is deleted without a product decision; optional comment requirements require sensitive personal data collection or unbounded free text.

**Never:** Do not allow unauthenticated feedback, cross-user feedback, feedback on user messages, anonymous public ratings, aggregate dashboard reporting, evaluation prompt sets, rewards, credits, or blocking modal/form flows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rate owned answer | Authenticated user rates their own persisted assistant message as useful or not useful | Feedback row is inserted or updated for that answer and safe summary is returned | No error expected |
| Change rating | Same user rates the same assistant message again | Existing row is updated instead of creating a duplicate | No error expected |
| Optional comment | User submits a rating with a short trimmed comment | Comment is stored with the current rating; blank comment becomes null | Reject comments beyond the configured limit with a typed validation result |
| Non-owned answer | User attempts to rate another user's assistant message | No row is written and UI receives a not-found/unauthorized style failure | Do not leak whether the target message exists |
| User message target | User attempts to rate a user-role message | No row is written | Return a typed invalid-target failure |
| Conversation history | Owned conversation with prior feedback is loaded | Assistant messages include their current feedback state; user messages do not | No cross-user feedback is returned |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- Owns Drizzle tables, enum-like value lists, ownership FKs, uniqueness, and feedback table export.
- `drizzle/migrations/` -- Stores the migration that creates answer usefulness feedback with owner-scoped FKs and checks.
- `src/features/feedback/` -- New feature owner for feedback types, server-only mutation/read helpers, and server action wrapper.
- `src/features/chat-trips/conversations.ts` -- Loads owned conversation history; should batch-load feedback and attach safe summaries to assistant messages.
- `src/features/chat-trips/actions.ts` or `src/app/ai-ask/page.tsx` -- Server action plumbing into the authenticated AI Ask composer.
- `src/features/ai/ai-ask-composer.tsx` -- Renders assistant answers, provenance footer/detail panel, stream completion messages, and client-side feedback interaction.
- `tests/answer-usefulness-feedback.test.ts` -- New focused coverage for feedback persistence, ownership, update behavior, and read summaries.
- `tests/ai-ask-shell.test.ts` -- Existing shell/UI coverage; extend for answer-footer controls and persisted feedback state.
- `tests/ai-ask-sessions.test.ts` -- Existing deletion coverage; extend if needed to verify feedback cascades with conversations/messages.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/*` -- Add answer usefulness feedback storage with `useful`/`not_useful`, optional bounded comment, owner-scoped message/conversation FKs, cascade deletion, and one current row per assistant message/user -- preserves reporting integrity and deletion behavior.
- [x] `src/features/feedback/` -- Add safe types plus authenticated server-side create/update mutation that verifies ownership and assistant-message role before upsert -- prevents unauthorized or invalid feedback.
- [x] `src/features/chat-trips/conversations.ts` -- Batch-load feedback for owned conversations and attach summaries only to assistant messages -- makes persisted ratings visible without N+1 queries or cross-user leakage.
- [x] `src/app/ai-ask/page.tsx` and `src/features/ai/ai-ask-composer.tsx` -- Wire the server action and render an optional answer-footer feedback control with Vietnamese labels, optimistic/pending states, validation errors, and no interference with provenance/detail controls -- satisfies traveler UX.
- [x] `tests/answer-usefulness-feedback.test.ts` -- Cover happy path, rating update, optional comment normalization/limit, unauthenticated and cross-user failures, user-message rejection, and conversation-history read behavior -- verifies the edge-case matrix.
- [x] `tests/ai-ask-shell.test.ts` and/or `tests/ai-ask-sessions.test.ts` -- Add focused UI/deletion regression coverage for footer visibility, persisted state, and cascade behavior where not already covered by the feedback test -- protects integration behavior.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- Mark Story 6.4 in progress/review/done as implementation and review progress -- keeps BMad artifacts aligned.

**Acceptance Criteria:**
- Given an authenticated traveler views an assistant answer, when the answer is persisted, then a lightweight optional usefulness control appears in the answer footer after source/provenance content.
- Given a traveler rates their own assistant answer, when the mutation succeeds, then exactly one current feedback row exists for that user and assistant message.
- Given the same traveler changes their rating or comment, when the mutation succeeds, then the existing feedback row is updated rather than duplicated.
- Given another user or an unauthenticated user attempts to rate an answer, when the mutation runs, then no feedback row is written and no answer existence details are leaked.
- Given the target message is not an assistant message, when feedback is submitted, then the mutation rejects it without writing feedback.
- Given an owned conversation is loaded later, when assistant messages are returned to the composer, then current feedback summaries are present only on assistant messages owned by the session user.
- Given a conversation or assistant message is deleted, when database cascades run, then dependent feedback rows are removed with the deleted answer.
- Given feedback UI is visible, when the user continues chat, opens sources, or selects detail-panel entities, then feedback controls do not block or replace those interactions.

## Spec Change Log

## Review Triage Log

### 2026-07-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 2, low 1)
- defer: 0
- reject: 1
- addressed_findings:
  - `[medium]` `[patch]` Added generated Drizzle migration snapshot/metadata by keeping `0029_familiar_gamma_corps.sql` and `meta/0029_snapshot.json`, avoiding inconsistent migration history.
  - `[medium]` `[patch]` Added DB-level assistant-role enforcement with `assistant_message_role`, a messages role composite uniqueness constraint, and an assistant-role FK/check guard, preventing direct SQL feedback on user messages.
  - `[low]` `[patch]` Added user-facing status when another feedback save is already pending, avoiding silently dropped clicks.
  - `[medium]` `[patch]` Removed redundant unsnapshotted 0030 migration journal entry because 0029 already contains the generated assistant-role guard schema, preventing Drizzle metadata drift.
  - `[medium]` `[patch]` Added runtime input-shape validation for feedback saves so malformed server-action payloads return `invalid_input` instead of throwing before typed error handling.
  - `[low]` `[patch]` Aligned feedback comment length validation with PostgreSQL character semantics by counting Unicode code points rather than UTF-16 code units.

### Review Findings
- [x] [Review][Patch] Remove redundant unsnapshotted migration 0030 metadata [drizzle/migrations/meta/_journal.json:209]
- [x] [Review][Patch] Validate malformed feedback action payloads before dereferencing fields [src/features/feedback/answer-usefulness.ts:32]
- [x] [Review][Patch] Align comment length counting with PostgreSQL character semantics [src/features/feedback/answer-usefulness.ts:45]

## Verification

**Commands:**
- `pnpm test:run tests/answer-usefulness-feedback.test.ts` -- expected: feedback service/read-path tests pass.
- `pnpm test:run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- expected: AI Ask UI/session regressions pass.
- `pnpm typecheck` -- expected: TypeScript passes.
- `pnpm lint` -- expected: ESLint passes.
- `pnpm build` -- expected: production build passes.

**Results:**
- `pnpm test:run tests/answer-usefulness-feedback.test.ts tests/ai-ask-shell.test.ts` -- passed, 67 tests.
- `pnpm typecheck` -- first run failed because the composer action prop type omitted the server action's pre-redirect `unauthenticated` reason; fixed the type.
- `pnpm typecheck` -- passed.
- `pnpm test:run tests/ai-ask-sessions.test.ts` -- passed, 9 tests.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.
- Review patch: reset local `xuyenviet_test` public and drizzle schemas after an earlier discarded manual migration had partially applied, then `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/xuyenviet_test pnpm exec drizzle-kit migrate` -- passed.
- Review patch: `pnpm test:run tests/answer-usefulness-feedback.test.ts tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- passed, 76 tests.
- Review patch: `pnpm typecheck` -- passed.
- Review patch: `pnpm lint` -- passed.
- Review patch: `pnpm build` -- passed.
- Follow-up review patch: `pnpm test:run tests/answer-usefulness-feedback.test.ts tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- passed, 77 tests.
- Follow-up review patch: `pnpm typecheck` -- passed.
- Follow-up review patch: `pnpm lint` -- passed.
- Follow-up review patch: `pnpm db:generate` -- passed with no schema changes after aligning the 0029 migration SQL with the generated snapshot.
- Follow-up review patch: `pnpm build` -- passed.

## Dev Agent Record

### Completion Notes

- Added answer usefulness feedback persistence with one current `useful` or `not_useful` rating per assistant answer and optional 500-character comment.
- Protected feedback writes through authenticated ownership checks and assistant-message role validation.
- Added DB-level assistant-target integrity using a role-backed composite FK/check guard so direct writes cannot attach feedback to user messages.
- Loaded safe feedback summaries with owned conversation history and attached them only to assistant messages.
- Rendered a lightweight Vietnamese-first answer footer after provenance, with pending/error states and optional comment entry only after a rating exists.
- Kept feedback independent from source/detail panel interactions and chat continuation.
- Generated Drizzle migration metadata and added a small idempotent role-guard patch migration to converge databases that had partially applied the earlier manual migration during this run.

### File List

- `src/db/schema.ts`
- `drizzle/migrations/0029_familiar_gamma_corps.sql`
- `drizzle/migrations/meta/_journal.json`
- `drizzle/migrations/meta/0029_snapshot.json`
- `src/features/feedback/types.ts`
- `src/features/feedback/answer-usefulness.ts`
- `src/features/feedback/actions.ts`
- `src/features/chat-trips/conversations.ts`
- `src/app/ai-ask/page.tsx`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/answer-usefulness-feedback.test.ts`
- `tests/ai-ask-shell.test.ts`
- `_bmad-output/implementation-artifacts/spec-6-4-capture-answer-usefulness-feedback.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Auto Run Result

Status: done

Summary: Implemented Story 6.4 answer usefulness feedback across schema, server mutation, conversation loading, and AI Ask answer-footer UI. Feedback is authenticated, owner-scoped, assistant-answer-only, updateable as one current row per answer, and optional/non-blocking for continued chat and source/detail inspection.

Files changed:
- `src/db/schema.ts` -- Added `answer_usefulness_feedback`, rating types, ownership FKs, uniqueness, comment checks, and DB-level assistant-role target guard.
- `drizzle/migrations/0029_familiar_gamma_corps.sql` -- Created feedback table and generated migration for the schema change.
- `drizzle/migrations/0030_answer_feedback_role_guard_patch.sql` -- Added idempotent convergence patch for assistant-role guard after review.
- `drizzle/migrations/meta/_journal.json` and `drizzle/migrations/meta/0029_snapshot.json` -- Added Drizzle migration metadata.
- `src/features/feedback/types.ts` -- Added shared safe feedback summary types and comment limit.
- `src/features/feedback/answer-usefulness.ts` -- Added server-only authenticated feedback save/upsert logic.
- `src/features/feedback/actions.ts` -- Added server action wrapper for the composer.
- `src/features/chat-trips/conversations.ts` -- Loaded feedback summaries with owned conversation history.
- `src/app/ai-ask/page.tsx` -- Passed feedback state/action into `AiAskComposer`.
- `src/features/ai/ai-ask-composer.tsx` -- Rendered answer-level feedback footer and client save state.
- `tests/answer-usefulness-feedback.test.ts` -- Added persistence, auth, ownership, role, comment, read-path, and cascade coverage.
- `tests/ai-ask-shell.test.ts` -- Added persisted feedback UI coverage.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Story 6.4 done.
- `_bmad-output/implementation-artifacts/spec-6-4-capture-answer-usefulness-feedback.md` -- Recorded spec, implementation, review, verification, and final status.

Review findings breakdown: 3 patches applied, 0 deferred, 1 rejected. Follow-up review recommendation: false.

Verification performed:
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/xuyenviet_test pnpm exec drizzle-kit migrate` -- passed after local test DB reset.
- `pnpm test:run tests/answer-usefulness-feedback.test.ts tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- passed, 76 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.

Residual risks: Feedback UI is covered by server-rendered shell tests and service tests, but not browser-driven interaction tests; future dashboard/evaluation stories still need aggregate reporting semantics.
