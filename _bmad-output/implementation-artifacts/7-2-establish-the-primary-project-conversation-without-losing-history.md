---
baseline_commit: 5f7e482
---

# Story 7.2: Establish the Primary Project Conversation Without Losing History

Status: review

## Story

As a Trip Project owner,
I want one primary conversation for my trip while retaining historic linked chats,
so that I have a clear planning command surface without losing prior discussion.

## Acceptance Criteria

1. **Idempotent primary-conversation migration**
   - **Given** an existing owner-scoped Trip Project has zero, one, or multiple linked conversations
   - **When** the idempotent primary-conversation migration runs
   - **Then** it selects or creates exactly one owner-linked conversation as the primary conversation.
   - **And** it preserves every existing owner-linked historic conversation and its access path.

2. **Safe primary selection and replacement**
   - **Given** a command sets or replaces the primary conversation
   - **When** it commits
   - **Then** the selected conversation belongs to the same owner and Trip Project and is neither deleted nor unlinked.
   - **And** the command locks or fences the Trip Project so concurrent requests cannot leave multiple or invalid primary pointers.

3. **Single project authoring surface**
   - **Given** a traveler opens the Trip Project workspace
   - **When** they continue planning in the central composer
   - **Then** new messages are written to the one primary conversation with the project context visibly active.
   - **And** historic chats remain available from an explicit history entry rather than competing as parallel project composers.

## Scope And Boundaries

### In Scope

- Add the nullable, migration-only `trip_projects.primary_conversation_id` pointer with database-enforced same-project and same-owner integrity.
- Add a forward, deterministic, idempotent backfill that selects one existing linked conversation or creates one only when an owned Trip Project has none.
- Add authenticated Chat/Trips commands/reads to initialize, resolve, and safely replace a primary conversation; all pointer changes must lock the owned Trip Project.
- Preserve existing linked conversations, messages, and valid history access while clearly separating primary authoring from historic review/continuation.
- Route project-scoped AI Ask sends to the resolved primary conversation, including a project request that supplies no conversation ID.
- Canonicalize the project workspace around its primary conversation, preserve URL-owned/server-loaded selection, and expose historic linked chats through an explicit `Lịch sử trao đổi` affordance rather than parallel project composers.
- Make owned conversation deletion primary-aware so a live Trip Project cannot retain a pointer to a deleted conversation; retain ordinary/historic conversation deletion behavior where valid.
- Add focused database-backed and shell/route regressions for migration, ownership, deletion, concurrency, canonical selection, and historic access.

### Explicitly Out Of Scope

- Structured plan item or constraint mutations; Story 7.1 already established the aggregate and Story 7.5 owns owner-confirmed proposal application.
- Trip Home focus, plan timeline/read model, detailed Trip Workspace panel, or proposal history UI (Story 7.3 and later).
- AI proposal drafting/persistence, direct provider-to-plan writes, proposal apply/dismiss/expiry, or plan-change history (Stories 7.4-7.5).
- A manual plan editor, alternate project composer, transcript/chat-context promotion into structured plan records, or client-side persistence for selection/history.
- Maps, weather, live route/ETA, bookings, availability, budget tracking, checklists, vault, notifications, sharing, collaboration, or location sharing.
- A general same-conversation streaming-concurrency redesign. Preserve the open action item; this story specifically fences primary-pointer initialization/replacement and project-scoped stream creation.

## Tasks / Subtasks

- [x] Add the safe persisted primary-conversation invariant and generated migration artifacts (AC: 1, 2)
  - [x] Update `src/db/schema.ts` so `tripProjects` has nullable `primaryConversationId` / `primary_conversation_id`; it is permitted to be null only during the forward backfill/initialization path.
  - [x] Use a named composite foreign key from `(primary_conversation_id, id, user_id)` to the existing unique conversation tuple `(conversations.id, conversations.trip_project_id, conversations.user_id)`. Do not use an unscoped conversation-ID reference: it cannot prove same owner/project linkage.
  - [x] Retain the existing conversation-to-project owner FK and its `ON DELETE SET NULL` semantics for direct database project deletion. Application-level project deletion must continue explicitly deleting linked conversations.
  - [x] Generate the next Drizzle migration from the schema with `pnpm db:generate`; retain the generated `0062_*.sql`, matching snapshot, and `_journal.json` entry. A reviewed, tracked forward data-backfill section may be added to that generated migration when required; it is not untracked schema drift. Do not edit old snapshots.
  - [x] Resolve the reverse-FK schema declaration with pinned Drizzle 0.44.5 before generating: safely reorder declarations, use a supported lazy foreign-key form, or make the reverse FK migration-owned with a schema comment. Do not introduce a temporal-dead-zone/circular module failure. Verify the final named FK, delete action, and any deferrability decision from PostgreSQL catalog metadata, and ensure `pnpm db:generate` does not emit duplicate/destructive drift.
  - [x] Make the migration forward, deterministic, and idempotent: leave an already valid primary unchanged; otherwise repair a null/invalid pointer by choosing a stable existing same-owner linked conversation (newest `updated_at`, then `id`) or create exactly one linked conversation when an owned Trip Project has none. Never delete, detach, or copy transcript, message, or `chat_context` data during backfill.

- [x] Implement Chat/Trips-owned primary conversation commands and read models (AC: 1, 2, 3)
  - [x] Extend `src/features/chat-trips/trip-projects.ts`, the existing authenticated owner-scoped aggregate boundary. Keep protected code `server-only`, use `@/*` imports, and return safe non-leaking outcomes (`unauthenticated`, `not_found`, `invalid`, or a narrowly justified conflict result) rather than exposing another owner's resource existence.
  - [x] Add an internal/public-to-owner resolver that locks the project row with `FOR UPDATE`, resolves or initializes exactly one primary conversation, and returns it for project-scoped use. Both selected-project page loading and stream entry must use it so a newly created or migration-null project has a primary before its first authoring render/send. It must recheck the target's `id`, `userId`, and `tripProjectId` inside the transaction, leave `aggregateVersion` unchanged, and audit initialization only with IDs/counts/fence metadata if an audit is required.
  - [x] Add a replacement command only if needed by deletion/recovery or the current UI. It must authenticate, lock the owner project before validating/writing, reject cross-owner, cross-project, unlinked, missing, or deleted targets, and audit successful pointer changes with IDs/counts/version metadata only. Do not audit transcript, message, plan, or context content.
  - [x] Define a project summary/read model that exposes the primary conversation separately from preserved historic conversation summaries. Continue using the existing safe first-user-message preview and ordering pattern; do not load another owner's rows or raw provider/provenance material.
  - [x] Preserve the Story 7.1 aggregate lock/version conventions where relevant. Do not mutate structured plan rows, constraints, or aggregate versions solely to establish/replace the primary pointer unless the implementation explicitly establishes and tests that contract.

- [x] Preserve deletion and history invariants (AC: 1, 2)
  - [x] Update `src/features/chat-trips/conversations.ts` so deleting a historical project conversation remains owner-scoped and removes its dependent content/context as today.
  - [x] For deletion of a primary conversation on a live project, use an owner-scoped transaction that locks the Trip Project before locking/re-reading the owned target, selects or creates a valid replacement, updates the pointer, then deletes the old primary. Use this project-first lock order wherever both rows are locked; never leave a live project pointing to a deleted conversation or deadlock against project deletion. Historic deletion remains owner-scoped and does not mutate the pointer.
  - [x] Preserve `deleteOwnedTripProject(...)`'s project-first lock, explicit deletion of all owned linked conversations, cascade cleanup, and non-content audit summary. Before deleting linked conversations, clear `primary_conversation_id` on the locked project; then delete conversations and the project. Preserve direct raw project deletion, whose `conversations.trip_project_id ON DELETE SET NULL` behavior must remain valid.
  - [x] Preserve historic messages and chat access after primary migration. Do not convert historic conversation transcript or `chat_context` entries into structured Trip Project records.

- [x] Make the AI Ask project workspace author only through the primary conversation (AC: 3)
  - [x] Update `src/app/api/ai-ask/stream/route.ts` to resolve the primary conversation transactionally for a valid `tripProjectId`; a project-scoped request without a conversation ID must not insert a new arbitrary linked conversation.
  - [x] When a client supplies both IDs, retain current owner/project mismatch protection and additionally reject or normalize a non-primary linked conversation so it cannot become a parallel project authoring path. The resolved primary ID must be used for history, user message, attachments, context extraction, provenance, usage, and final response events.
  - [x] Preserve validation before persistence/provider calls: authenticated owner/project validation, question/image validation, selected model capability checks, source-bundle/provenance ordering, and no provider call on invalid access/input.
  - [x] Update `src/app/ai-ask/page.tsx` to load/canonicalize selected Trip Project state around the primary conversation. Define separate URL/server-loaded state for historic review: `tripProjectId` plus `historyConversationId` renders that owned linked transcript read-only, while `conversationId` remains the primary authoring conversation. Do not allow a historic ID to become `conversationId` in project mode. Clear/redirect stale, unauthorized, ordinary, or mismatched history selections without leaking resource existence.
  - [x] Update `src/features/ai/ai-ask-composer.tsx` without creating a new data owner. In project mode, the center composer must always submit to the primary conversation, visibly show active project context, and offer historic linked chats under explicit Vietnamese `Lịch sử trao đổi` UI. In historic-review state, render the historic transcript without a competing composer and provide a clear action to continue in the primary conversation. Keep primary optimistic turns and stream reconciliation bound only to the primary message state; they must never append to a historic transcript before URL/server reconciliation.
  - [x] Preserve the responsive shell: desktop and mobile use the same server-loaded data and URL selection; mobile history/navigation remains an accessible sheet that closes on selection and restores/moves focus according to existing shell conventions. Keep client session/message copies optimistic only until URL/server reconciliation.

- [x] Add focused regression coverage (AC: 1, 2, 3)
  - [x] Extend `tests/trip-projects.test.ts` using real PostgreSQL/Drizzle tests to prove the composite pointer FK prevents cross-owner/cross-project/unlinked pointer values. Add a migration integration path that starts from `0061`, seeds legacy rows, applies `0062`, and verifies zero/one/multiple linked-conversation outcomes, deterministic selection, no-linked-conversation creation, repeat/idempotent execution, and preservation of every prior linked row/message/`chat_context`; the normal global setup already applies all migrations and cannot prove this backfill contract. If a narrowly exported transaction-aware backfill primitive is used, test it directly and retain an integration smoke of the actual migration.
  - [x] Verify primary set/replace rejects unauthorized, cross-owner, cross-project, deleted/unlinked, and stale/invalid targets with no partial pointer/audit write. Exercise concurrent initialization/replacement (parallel transactions or an equivalent deterministic lock/fence test) and prove a project ends with one valid pointer.
  - [x] Verify resolver initialization for a newly created project before any send, first selected-project page load, migration-null recovery, and concurrent first sends; prove one valid pointer and no aggregate-version mutation.
  - [x] Extend `tests/ai-ask-sessions.test.ts` so historic project-chat deletion remains valid, primary deletion atomically replaces the pointer, and project deletion first clears the pointer then removes all linked chats and project data. Exercise the actual application deletion order with a primary pointer, as well as direct raw project deletion.
  - [x] Extend `tests/ai-ask-shell.test.ts` for canonical project-primary selection, direct historic-chat review via `historyConversationId`, explicit history UI, visible project context, primary-only composer/optimistic stream state, and stream routing. Replace the existing expectation that a project request with no conversation creates a fresh linked conversation: it must use the one primary conversation.
  - [x] Test stream boundaries: a valid project-scoped send persists both turns only on the primary conversation; cross-user/cross-project/non-primary attempts cause no provider call or extra message/conversation; ordinary conversations retain their current behavior.
  - [x] Follow established test setup: `vi.doMock("@/server/auth", ...)`, dynamic module import after `vi.resetModules()`, real PostgreSQL constraints/migrations from global setup, and serial-safe fixtures.
  - [x] Run `pnpm vitest run tests/trip-projects.test.ts`, `pnpm vitest run tests/ai-ask-sessions.test.ts`, `pnpm vitest run tests/ai-ask-shell.test.ts`, then `pnpm test:run`, `pnpm lint`, `pnpm typecheck`, `pnpm db:generate`, and `git diff --check`. Record exact blockers rather than claiming verification passed if the database/migration environment is unavailable.

## Dev Notes

### Product And Authority

- The active authority is `epics.md`, the final PRD, `ARCHITECTURE-SPINE.md`, UX `DESIGN.md`/`EXPERIENCE.md`, the 2026-07-25 readiness report, and current code. The older `_bmad-output/implementation-artifacts/epic-7-context.md` describes an incompatible UI-convergence Epic 7 and is not authority for this story.
- This is the second Epic 7 story after completed Story 7.1. Sequence is fixed: aggregate (7.1), primary conversation (7.2), Trip Home/workspace (7.3), proposals (7.4), terminal proposal actions/history (7.5), safety verification (7.6).
- FR-16E and MVP AC-21 require exactly one primary conversation while retaining historic owner-linked chats. This is not permission to hide, detach, delete, or silently reclassify historic conversations.
- A primary conversation is the exclusive plan-authoring surface. Chat requests may later create typed proposals, but no transcript, `chat_context`, AI response, provider output, or current story UI may write confirmed plan state.

### Existing Implementation To Preserve

- `src/db/schema.ts` already has `tripProjects` composite uniqueness on `(id, userId)` and `conversations` uniqueness on `(id, tripProjectId, userId)`. The latter exists specifically to support a composite primary pointer. `conversations.tripProjectId` is nullable; direct project deletion detaches it with `ON DELETE SET NULL`.
- `src/features/chat-trips/trip-projects.ts` is the correct command/read module. It authenticates internally; owner-scopes reads and mutations; locks owned projects with `FOR UPDATE`; and explicitly deletes all linked conversations before application-level project deletion. `getOwnedTripProjectSummary()` currently returns all linked conversations as `relatedChats`; refactor this read model instead of adding a parallel query surface.
- `src/features/chat-trips/conversations.ts` currently allows deletion of any owned linked conversation. It must become primary-aware, but must keep safe `not_found` behavior, dependent-record deletion, usage reference nulling, and non-content audit counts.
- `src/app/api/ai-ask/stream/route.ts` currently creates a new linked conversation whenever a `tripProjectId` is sent without a `conversationId`. This is the critical behavior to replace: project sends must resolve the primary under the project lock and retain all current request validation and streaming/provenance persistence behavior.
- `src/app/ai-ask/page.tsx` currently infers project scope from any linked conversation and allows it to be the selected composer. Canonical project selection must instead resolve the primary conversation while keeping historic access explicit and non-authoring.
- `src/features/ai/ai-ask-composer.tsx` owns URL reconciliation, temporary client state, responsive navigation sheets, focus handling, and stream form data. Do not add `localStorage`, `sessionStorage`, a breakpoint-specific loader, or an independent history state store. Reuse its accessible sheet/focus patterns and Vietnamese-first copy.
- No new service or library is needed. Use pinned Next.js 15.3.5, React 19.1.0, TypeScript 5.8.3 strict mode, Drizzle ORM 0.44.5, Drizzle Kit 0.31.4, PostgreSQL, pnpm 10.26.2, and Vitest 4.1.10.

### Database And Concurrency Guardrails

- `trip_projects.primary_conversation_id` is nullable only while forward migration/initialization establishes the invariant. Do not add an application assumption that it may be absent forever; all owned project workspace/stream paths must resolve one safely.
- The primary pointer must refer to a live conversation linked to the exact same `trip_project_id` and `user_id`. A bare conversation FK, client validation, or an owner-only FK is insufficient.
- Backfill must be deterministic. Select a stable existing linked row when there are several, keep that decision stable on rerun, and never create a duplicate when a valid primary already exists.
- Execute pointer initialization/replacement and target validation in one transaction after locking the owned `trip_projects` row. Do not select a target before acquiring the lock and write it later. The lock is required to serialize concurrent first sends, replacements, and deletion recovery.
- Avoid a circular-FK deletion failure: account for the new project-to-conversation reference when deleting conversations/project records. Preserve explicit project deletion semantics and test both direct database project deletion and owner command deletion.
- Protected mutations remain server-side and audit successful state changes in the same transaction. Audit summaries may include project/conversation IDs, operation, counts, and safe version/fence values only; never message content, project metadata, plan details, or raw provider data.

### UX And URL Guardrails

- The primary conversation is the Trip Project center column and central composer. It must visibly indicate active project context.
- Historic linked chats must have an explicit `Lịch sử trao đổi` entry. They remain owner-accessible, but cannot expose a second project composer, replace the primary in URL canonicalization, or receive a new project-scoped send.
- Conversation/project selection remains URL-owned and server-loaded. Keep canonical query parameter handling for `conversationId`, `tripProjectId`, `ref`, and `draft`; stale/unauthorized/mismatched selections must safely clear or redirect without leaking resource existence.
- Preserve desktop/mobile accessibility: keyboard-focusable history actions, visible focus, Vietnamese labels, no hover-only row action, one interactive sheet/detail surface at a time, and focus moved to main chat heading/composer after a mobile selection.
- Do not prematurely implement the persistent Trip Workspace/Trip Home/timeline/proposal panel in this story. The only UI necessary here is enough to preserve one primary authoring path and an explicit historic-chat access path.

### Previous Story Intelligence

- Story 7.1 intentionally deferred `primaryConversationId`; adding it here is correct and must not be backported into Story 7.1 scope.
- Story 7.1 established the owner-scoped aggregate lock/version command boundary and project deletion graph. Reuse `FOR UPDATE` project locking and same-transaction safe audit patterns rather than introducing an independent primary-conversation service.
- Story 7.1 recovery found that malformed values must be rejected before transaction/persistence; validate untrusted request target IDs/shape before any pointer write and prove invalid requests do not produce partial rows/audits.
- Drizzle 0.44.5 did not expose a needed PostgreSQL deferrability option for Story 7.1. Generate schema/migration artifacts first, inspect the generated SQL and metadata, and document any PostgreSQL-only migration action in schema comments instead of creating untracked drift.
- Existing unresolved action item: same-conversation continuation concurrency hardening. Do not claim it is resolved by this story; lock/fence the project pointer path required by AC 2 and retain the broader stream concern for its tracked follow-up.

### File Structure Requirements

**Update**

- `src/db/schema.ts`
- `src/features/chat-trips/trip-projects.ts`
- `src/features/chat-trips/conversations.ts`
- `src/features/chat-trips/actions.ts` if the deletion result shape or primary-replacement URL reconciliation changes
- `src/app/api/ai-ask/stream/route.ts`
- `src/app/ai-ask/page.tsx`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/trip-projects.test.ts`
- `tests/ai-ask-sessions.test.ts`
- `tests/ai-ask-shell.test.ts`
- `drizzle/migrations/meta/_journal.json`

**New generated files**

- `drizzle/migrations/0062_<generated-name>.sql`
- `drizzle/migrations/meta/0062_snapshot.json`

Do not create a new generic service, package, client persistence store, plan/proposal/history table, or manual editor. Keep all aggregate logic in the owning Chat/Trips feature.

### Testing Requirements

- Database integrity tests must use the real PostgreSQL test database. Mocked DB tests cannot prove the composite primary pointer, migration backfill, lock/fence semantics, or deletion ordering.
- The test global setup applies all Drizzle migrations. Confirm that the generated migration and journal/snapshot chain work from a clean test database before relying on test results.
- Normal test setup cannot prove a data backfill because it starts after all migrations. Use an isolated pre-`0062` migration integration path or a directly tested transaction-aware backfill primitive plus migration smoke; do not claim pointer backfill coverage from post-migration fixtures alone.
- Preserve old behavior deliberately: ordinary chats work normally; historic project chat deletion remains owner-scoped; app-level trip deletion deletes all linked chats; direct raw project deletion retains its documented detach semantics; invalid access/input makes no provider call and no persistent side effect.
- If a primary deletion can return a recoverable result rather than replacing atomically, update `src/features/chat-trips/actions.ts` and the composer together with a typed outcome, Vietnamese copy, and no stale client removal. Prefer the specified atomic replacement path; after success, reconcile selection to the returned replacement primary through the URL/server shell.
- No external technical research was needed: this story uses the repository-pinned framework/database versions and current project-owned APIs, with no new dependency or third-party API integration.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.2: Establish the Primary Project Conversation Without Losing History]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7: Controlled Trip Project Planning]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.2 User Authentication, Chats, And Trips]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.7 Trip Planning Foundation Contract]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#MVP Acceptance Criteria]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Mutations Are Server-Side And Audited]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13: Users Delete Their Own Chats And Trip Projects]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29: Trip Planning Is A Chat/Trips-Owned Structured Aggregate]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30: Primary Conversation And Change Proposals Are Explicit Commands]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Trip Planning minimum persisted contract]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Component Catalog]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Interaction Primitives]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-25.md#Trip Project Traceability]
- [Source: _bmad-output/project-context.md#Technology Stack & Versions]
- [Source: _bmad-output/project-context.md#Development Workflow Rules]
- [Source: _bmad-output/implementation-artifacts/7-1-establish-the-versioned-structured-trip-project-aggregate.md#Previous Story Intelligence]
- [Source: src/db/schema.ts#tripProjects]
- [Source: src/db/schema.ts#conversations]
- [Source: src/features/chat-trips/trip-projects.ts#getOwnedTripProjectSummary]
- [Source: src/features/chat-trips/trip-projects.ts#deleteOwnedTripProject]
- [Source: src/features/chat-trips/conversations.ts#deleteOwnedConversation]
- [Source: src/app/api/ai-ask/stream/route.ts#streamAnswer]
- [Source: src/app/ai-ask/page.tsx#AiAskPage]
- [Source: src/features/ai/ai-ask-composer.tsx#AiAskComposer]
- [Source: tests/trip-projects.test.ts#Trip project helpers]
- [Source: tests/ai-ask-sessions.test.ts#AI Ask owned conversation deletion]
- [Source: tests/ai-ask-shell.test.ts#AI Ask authenticated shell]

## Dev Agent Record

### Agent Model Used

OpenCode gpt-5.6-terra-review

### Debug Log References

- BMad workflow customization resolved successfully; no prepend or append activation steps were configured.
- Exhaustive source analysis completed across active PRD, architecture, Epic 7, readiness report, UX experience contract, project context, Story 7.1, current schema, Chat/Trips modules, AI Ask route/page/composer, focused tests, and recent Git history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story validation completed against the installed create-story checklist: the final artifact identifies the authoritative active Epic 7 contract, prevents use of superseded UI context, names every known update/generated file, distinguishes database and transactional safeguards, preserves current behavior, and specifies targeted regression coverage.
- The story deliberately limits UI work to one primary project composer and explicit historic access. Trip Home, timeline, proposals, apply/dismiss/expiry, history, and manual plan edits remain owned by Stories 7.3 through 7.5.
- Recovered the supplied Story 7.2 implementation and verified the primary-pointer schema/migration, owner-scoped resolver, primary-aware deletion, canonical project/history shell, and project-scoped stream routing.
- Focused checks passed serially: `pnpm vitest run tests/trip-projects.test.ts` (19), `pnpm vitest run tests/ai-ask-sessions.test.ts` (10), and `pnpm vitest run tests/ai-ask-shell.test.ts --maxWorkers=1 --fileParallelism=false` (80). `pnpm typecheck`, `pnpm db:generate`, and `git diff --check` also passed. `pnpm lint` completed with three pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`.
- Corrected the focused concurrency assertion to use the supported Vitest `Set.size` assertion.
- Added an actual `0062` migration smoke using temporary pre-0062 legacy tables. It verifies zero/one/multiple linked conversations, deterministic newest selection, created primary for no-chat projects, idempotent rerun, and retained historic messages and chat context.
- The migration smoke found and fixed PostgreSQL-invalid `ON UPDATE SET NULL (column-list)` SQL. The composite FK is now `DEFERRABLE INITIALLY DEFERRED` with `ON UPDATE NO ACTION`.
- Final verification: `pnpm vitest run tests/trip-projects.test.ts` (20), `pnpm vitest run tests/ai-ask-sessions.test.ts` (10), `pnpm vitest run tests/ai-ask-shell.test.ts` (80), `pnpm vitest run tests/answer-context.test.ts` (94), and `pnpm vitest run --maxWorkers=1` (50 files, 761 tests) all passed. `pnpm typecheck`, `pnpm db:generate`, and `git diff --check` passed. `pnpm lint` has only 3 pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`.

### File List

- _bmad-output/implementation-artifacts/7-2-establish-the-primary-project-conversation-without-losing-history.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- drizzle/migrations/0062_faithful_mysterio.sql
- drizzle/migrations/meta/0062_snapshot.json
- drizzle/migrations/meta/_journal.json
- src/app/ai-ask/page.tsx
- src/app/api/ai-ask/stream/route.ts
- src/db/schema.ts
- src/features/ai/ai-ask-composer.tsx
- src/features/chat-trips/conversations.ts
- src/features/chat-trips/trip-projects.ts
- tests/ai-ask-sessions.test.ts
- tests/ai-ask-shell.test.ts
- tests/trip-projects.test.ts
- tests/answer-context.test.ts

### Change Log

- 2026-07-25: Created and validated the Story 7.2 implementation guide; status synchronized to ready-for-dev.
- 2026-07-25: Recovered implementation, added migration/backfill, concurrency, shell, and stream regression coverage, fixed the migration FK SQL, and synchronized the complete story to review.
