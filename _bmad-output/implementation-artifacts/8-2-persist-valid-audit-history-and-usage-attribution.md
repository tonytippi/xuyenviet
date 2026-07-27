---
baseline_commit: 5776071
---

# Story 8.2: Persist Valid Audit, History, and Usage Attribution

Status: review

## Story

As a product operator,
I want audit, history, and usage records to persist unambiguous actor and executor attribution,
so that human activity, autonomous work, and reporting cannot be conflated.

## Acceptance Criteria

1. **Valid actor XOR persistence**
   - Given a user or system actor writes an audit event or trip-plan change-history record,
   - When the migration and typed writer persist it,
    - Then a user `audit_events` row has `actor_class = 'user'`, a non-null user FK, its required email snapshot, and no system ID; a user `trip_plan_change_history` row has the same class/user/no-system shape but no email snapshot column; and a system row in either table has `actor_class = 'system'`, a nonblank cataloged system ID, and null human fields.
   - And database checks and application validation enforce exactly one valid shape.

2. **Usage initiator and executor attribution**
   - Given an AI usage event is recorded,
   - When the Audit/Usage writer persists it,
    - Then it accepts `{ initiatedByUserId?, executorSystem, tripProjectId?, ... }`, stores nullable `initiated_by_user_id`, nullable `trip_project_id`, and required `executor_system`, and preserves nullable conversation/message references for worker-only work.
    - And user-facing roster or billing views aggregate initiators only, while operations reporting groups autonomous work by cataloged executor without assigning it to a person.

## Tasks / Subtasks

- [x] Change the three attribution persistence contracts and generate their migration (AC: 1, 2)
  - [ ] Update `audit_events`: make `actor_user_id` and `actor_email` nullable while retaining the restricting real-user FK; retain `actor_class`/`actor_system`; add a correlated user-or-system XOR `CHECK`.
  - [ ] Update `trip_plan_change_history`: retain its project-owner relationship and existing safe JSON/operation constraints; add the same actor XOR `CHECK` appropriate to a table with no email snapshot column.
   - [ ] Replace `ai_usage_events.user_id` with nullable `initiated_by_user_id` (real-user FK retaining the current `onDelete: cascade` behavior), add nullable `trip_project_id` for applicable trip context, and add required `executor_system`; replace the user-created index with an initiator-created index and add an index beginning with `executor_system`.
   - [ ] Preserve all existing usage status, token, cost, provider-request-ID, and nullable message/conversation constraints. The new trip-project reference must preserve usage after project deletion with the same nullable-context behavior as conversation/message references. Do not introduce a system-actor database table or a catalog-label column.
  - [ ] Generate and inspect the Drizzle migration. Do not remove reserved-user migrations, seed rows, fixtures, or reset/reseed behavior: those clean-break changes belong only to Story 8.5. If the target database is durable rather than disposable, stop and request an expand-migrate-contract design instead of inventing a backfill.

- [x] Widen the Audit event writer and add the Audit-owned plan-history writer (AC: 1)
  - [ ] In `src/features/audit/events.ts`, change the accepted actor from `UserAuditActor` to `AuditActor`, call `validateAuditActor` before its injected writer, and map the validated discriminant to exactly one persistence shape.
  - [ ] Preserve `normalizeAuditSummary`, its 2,000-character cap, and transaction-writer injection. A system event must write null human fields; a user event must retain the immutable email snapshot.
  - [ ] Add a focused Audit-owned history writer under `src/features/audit/` that accepts an `AuditActor`, the existing project/history payload, and an injected transaction writer. It must derive actor columns solely from the validated actor, preserve caller-supplied owner/project scope and safe JSON payloads, and never open a separate global transaction.
  - [ ] Migrate the compatible owner apply/dismiss history writes in `src/features/chat-trips/trip-change-proposals.ts` to this helper without changing proposal fencing, locking, terminal transitions, or audit transaction coupling.
   - [ ] Replace every direct **user-actor** `audit_events` insert with `recordAuditEvent` and the caller's existing transaction writer. Inventory the repositories before completing; current known user-actor paths include `src/features/knowledge/recommendations.ts`, `src/features/knowledge/source-removal.ts`, `src/features/knowledge/source-captures.ts`, `src/features/knowledge/review-approval-core.ts`, `src/features/knowledge/facebook-capture.ts`, `src/features/knowledge/facebook-capture-review.ts`, and `src/features/knowledge/youtube-capture.ts`. Do not convert worker/system attribution in those modules here except where an existing audit-event path already declares a system actor and would fail the new XOR check.
   - [ ] `src/features/knowledge/facebook-capture.ts` currently accepts a polymorphic `FacebookCaptureActor` and directly writes its user fields even when `actorClass: 'system'`. In this story, adapt only its three audit-event writes through the Audit boundary so the existing `system-facebook-capture` branch persists a valid system audit row (null human fields) and its user branch persists a valid user row. Preserve the existing capture caller/input and discovered-source persistence unchanged while the reserved-user compatibility remains; Story 8.3 must replace its system-shaped capture caller with explicit executor plus real requester/submission provenance before Story 8.5 removes fake users. Keep `sources.submitted_by_user_id` real-user-only; do not add capture executor columns or otherwise migrate non-audit capture artifacts here.
  - [ ] Do not migrate `expireTripChangeProposal(...)`'s legacy audit/history behavior beyond schema compatibility. Story 8.4 exclusively owns its `system-trip-planning` final wiring, idempotent terminal-history assertion, and direct-insert removal.

- [x] Make the usage writer explicit and update attribution-safe consumers (AC: 2)
  - [ ] Export the typed usage-write boundary from Audit/Usage ownership: Audit owns actor/executor validation and the public explicit attribution contract; the existing Usage module may retain token/cost normalization as its implementation detail. Do not leave competing public writer contracts.
   - [ ] In the resulting typed usage writer, replace `userId` with `initiatedByUserId?: string | null`, add `tripProjectId?: string | null`, and require `executorSystem: SystemAuditActorId`; validate the cataloged executor before invoking `insert`. Preserve supplied trip-project context where applicable and keep it null for worker-only/no-project work.
  - [ ] Never retain a compatibility `userId` field or accept an input that can conflate initiator and executor. Preserve UUID generation, token normalization, pricing/cost calculation, bounded provider request ID normalization, and returned usage-event ID.
  - [ ] Migrate these request-path consumers to pass the authenticated/requesting person as `initiatedByUserId` and `system-ai-orchestration` as `executorSystem`: `src/app/api/ai-ask/stream/route.ts`, `src/features/ai/evaluation-answer.ts`, `src/features/ai/trip-proposal-draft.ts`, `src/features/chat-trips/context-extraction.ts`, `src/features/feedback/evaluation.ts`, and `src/features/retrieval/source-bundle.ts`. Preserve their existing atomic AI Ask/evaluation success writes and best-effort telemetry behavior.
  - [ ] Migrate every remaining `writeAiUsageEvent` caller in this story because the removed `userId` input cannot leave a compile-breaking deferred caller. `src/features/knowledge/extraction.ts` and `src/features/knowledge/suggestions.ts` receive a real requesting operator ID, so preserve it as `initiatedByUserId` and use `system-ai-orchestration` as executor for that synchronous model call. `src/features/knowledge/ingestion-pipeline.ts` is worker-only, so use `initiatedByUserId: null` and `system-knowledge-pipeline`. Preserve existing best-effort behavior and human requester/submission provenance in their separate fields. This is usage-API compatibility only, not Story 8.3's knowledge/capture executor-column migration or broader artifact-side-effect migration.
   - [ ] Update `src/features/admin/users.ts` to group/filter `initiatedByUserId` only, preserving its bounded paged-roster aggregation and all-status/null-token behavior. A worker-only event (`initiatedByUserId: null`) must not affect any roster member. There is no new operations-reporting UI in this story; prove at the persistence/query level that autonomous events remain groupable by `executorSystem` and are never grouped under a user initiator.
  - [ ] Defer knowledge/capture executor-column work and non-usage artifact/side-effect migration to Story 8.3. Do not add executor columns to knowledge or capture artifacts in this story.

- [ ] Add focused migration, writer, transaction, and reporting coverage (AC: 1, 2)
  - [ ] Extend `tests/audit-actors.test.ts`: valid user and system `recordAuditEvent` rows, null human fields for system rows, preserved email snapshot for user rows, and malformed/mixed/blank/catalog-invalid actor input rejected before writer invocation.
  - [ ] Add focused coverage for the plan-history writer: user and system actor mappings, validation before insert, injected-transaction use, and preservation of existing safe payload/owner fields.
   - [ ] Update `tests/ai-usage-events.test.ts` fixtures/assertions for `initiatedByUserId`, `executorSystem`, and nullable `tripProjectId`; retain all existing cost/token/privacy assertions and add a worker-only usage event with null initiator plus a catalog-invalid executor rejection before insert. Prove executor-based operations grouping keeps autonomous work separate from user initiators.
   - [ ] Extend `tests/admin-user-management.test.ts` to prove usage aggregates by initiator and excludes a null-initiator worker event.
  - [ ] Update all affected database fixtures and call-site assertions, including at least `tests/ai-ask-sessions.test.ts`, `tests/trip-projects.test.ts`, `tests/chat-trip-context-extraction.test.ts`, `tests/knowledge-ingestion-pipeline.test.ts`, and affected knowledge/capture usage tests. Do not leave obsolete `aiUsageEvents.userId` fixtures after the schema rename.
   - [ ] Use database-backed schema/migration tests where available to prove both valid actor shapes and rejection of every malformed shape: user class with missing user FK or non-null system ID; system class with non-null user/email, blank/missing system ID; and missing/invalid class. Include the existing Facebook-capture system actor path to prove it no longer attempts the former mixed shape. Keep existing audited-mutation and proposal terminal-change transaction tests passing, and add a regression proving the Audit history helper uses the supplied transaction so terminal update, history, and audit roll back together.
  - [ ] Run `pnpm db:generate`, relevant `pnpm test:run` targets, `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Record exact failures/blockers; do not claim verification not run.

## Dev Notes

### Story Boundary

- This story establishes valid persistence for the existing Audit actor catalog. It changes only `audit_events`, `trip_plan_change_history`, and `ai_usage_events`, their Audit/Usage writers, compatible direct-write callers, admin usage aggregation, migrations, and tests.
- Audit owns the public actor/executor validation and typed audit, history, and usage-write boundaries. The existing Usage module may remain the internal home for usage token/cost normalization, but it must not expose a competing ambiguous writer API.
- User ownership/requester/submitter/reviewer/approver/referral/session/conversation fields remain real-user FKs. Do not make them polymorphic.
- The closed catalog and validators already exist in `src/features/audit/actors.ts`. Reuse `AuditActor`, `SystemAuditActorId`, `validateAuditActor`, and `isSystemAuditActorId`; do not declare lookalike unions or accept arbitrary strings.
- Application validation must reject catalog-invalid system IDs before an insert. Database checks enforce shape and nonblank fields but cannot make the TypeScript catalog a foreign key.
- Story 8.3 owns knowledge/capture executor columns and non-usage artifact-side-effect migration for knowledge pipeline, capture, indexing, and related worker attribution. Story 8.2 must still migrate every usage-writer caller to compile against its required explicit attribution API. Story 8.4 owns automated proposal-expiry attribution. Story 8.5 owns fake-user migration/seed/helper removal. Story 8.6 verifies the complete end-to-end no-direct-insert state.

### Current Code And Required Changes

- `src/db/schema.ts`
  - `auditEvents` currently requires `actorUserId` and `actorEmail` and has only separate operation/class checks (around lines 276-305). Add a correlated XOR check; retain `actorUserId`'s `onDelete: restrict` FK and target/created indexes.
  - `tripPlanChangeHistory` already permits nullable `actorUserId` but only checks `actorClass`'s enum (around lines 778-807). It has no email snapshot column, so its user shape requires user FK/no system and its system shape requires null user/nonblank system.
  - `aiUsageEvents` currently has non-null `userId` with `onDelete: cascade`, an initiator-unaware index, and nullable conversation/message fields (around lines 1509-1579). Rename the application/schema contract rather than preserving an ambiguous alias; retain its initiator deletion behavior and add nullable trip-project context with deletion-safe nullable-reference semantics.
- `src/features/audit/events.ts` currently rejects a valid system actor. Widen only after the schema XOR migration exists, and preserve the injected transaction writer and summary normalization exactly.
- There is currently no Audit-owned typed writer for `trip_plan_change_history`; `trip-change-proposals.ts` directly inserts terminal history rows for apply, dismiss, and expiry. Add the focused Audit helper and use the caller transaction. Do not let the helper bypass Chat/Trips ownership checks.
- User-actor direct audit inserts in Knowledge/Capture modules must move to `recordAuditEvent` in this story with their existing transaction handles. System/worker direct writes, including those in `src/features/knowledge/ingestion-pipeline.ts`, stay deferred to Story 8.3 rather than being incorrectly attributed as human actions. The exception is Facebook capture's already-declared system audit branch: it must adopt the valid system audit persistence shape now because the Story 8.2 XOR check otherwise rejects it; this does not migrate capture artifacts or their executor columns.
- `src/features/usage/events.ts` currently stores `input.userId` directly. Retain only its token/cost normalization implementation behind the Audit-owned explicit writer contract; after this change neither its public nor internal attribution input may be named `userId`. Its extensive normalization/cost behavior must remain unchanged while explicit `initiatedByUserId` and `executorSystem` fields are mapped to persistence.
- Request-path caller migration includes AI Ask streaming, evaluation answer, trip-proposal draft, chat-context extraction, feedback evaluation, retrieval web fallback, and operator-requested knowledge extraction/suggestions. Each records a real initiator when one exists and `system-ai-orchestration` as executor; pass existing trip-project context when that caller has it. The knowledge ingestion pipeline is worker-only and records a null initiator with `system-knowledge-pipeline`. Every usage caller must adopt the required input to keep the build valid; this does not add Story 8.3 executor columns or migrate other knowledge/capture artifacts.
- `src/features/admin/users.ts` currently aggregates `aiUsageEvents.userId` only for the current roster page. Change the selected/grouped/filter column to `initiatedByUserId`; do not broaden the query or make system execution appear as a person. No operations-reporting surface is added here: the executor-leading index and executor grouping test provide the reporting-safe data contract.

### Transaction And Regression Guardrails

- `src/server/mutations.ts` must retain action-plus-audit atomicity, auth-before-action rejection, and exact-admin transaction revalidation. A writer refactor must not make its audit write use a new database handle.
- Proposal apply/dismiss terminal updates, history writes, and audits remain in their existing transaction and lock/fence flow. No change may weaken owner scoping, conflict handling, or all-or-nothing application.
- Successful AI Ask writes keep usage coupled to the assistant message/conversation/provenance transaction and its existing retry structure. Do not move usage outside that flow or duplicate an event on retry.
- Existing proposal-draft, web-search, context-extraction, and similar telemetry writes are deliberately best-effort. New executor validation must occur before insert, but a caught telemetry error must remain non-fatal where the current path treats it that way.
- Preserve safe data boundaries: usage events must not gain prompts, answers, raw provider payloads, raw source material, or execution secrets.

### Library And Framework Requirements

- Use the existing Next.js 15.3.5, TypeScript 5.8.3 strict, Drizzle ORM 0.44.5, Drizzle Kit 0.31.4, PostgreSQL, and Vitest 4.1.10 stack. No dependency is needed.
- Keep server-only Audit modules under `src/features/audit/` and app imports on the `@/*` alias. Do not use `any`, unchecked casts, or broad string executor types.
- Use `pnpm` scripts. Drizzle commands must fail closed without `DATABASE_URL`; ordinary lint/typecheck/build must not require a live database.

### Project Structure Notes

- Audit owns actor validation and the public audit/history/usage write helpers. Usage retains token/cost normalization only as an internal implementation dependency and consumes the Audit catalog/type rather than duplicating it.
- Chat/Trips continues to own proposal aggregate authorization, lock/fence behavior, and safe history content. It calls the Audit history boundary with its current transaction.
- Tests stay under `tests/`; reuse existing writer-spy and `testDb` patterns. Configure mocks before dynamic imports for modules that consume Auth.js or database clients.
- This is backend/domain work. Do not add a traveler or admin UI, expose raw actor metadata, or alter current catalog label rendering.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-8-Story-8.2]
- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.3-through-Story-8.6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-31-Audit-And-Automated-Execution-Use-First-Class-Actors]
- [Source: _bmad-output/implementation-artifacts/8-1-establish-the-audit-actor-boundary-and-system-catalog.md#Story-Boundary]
- [Source: _bmad-output/project-context.md#Technology-Stack--Versions]
- [Source: _bmad-output/project-context.md#Critical-Implementation-Rules]
- [Source: src/db/schema.ts#auditEvents]
- [Source: src/db/schema.ts#tripPlanChangeHistory]
- [Source: src/db/schema.ts#aiUsageEvents]
- [Source: src/features/audit/actors.ts]
- [Source: src/features/audit/events.ts]
- [Source: src/features/usage/events.ts]
- [Source: src/features/admin/users.ts]
- [Source: src/features/chat-trips/trip-change-proposals.ts]
- [Source: tests/audit-actors.test.ts]
- [Source: tests/ai-usage-events.test.ts]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- BMad create-story workflow activation resolved with no prepend/append steps; `_bmad-output/project-context.md` was loaded as the persistent fact.
- Source analysis loaded the Epic 8 story contract, AD-31 architecture spine, completed Story 8.1 handoff, current schema/writers/admin aggregation/tests, and the five most recent commits.
- Story context validation completed non-interactively against the installed create-story checklist. The final guide specifies exact persistence shapes, Audit/Usage ownership, direct-write disposition, complete usage-caller migration, transaction and telemetry boundaries, regression tests, and later-story exclusions.
- Revalidation repaired the history-table email distinction, preserved required AI usage trip-project context and initiator deletion semantics, made executor-only reporting verification explicit without adding a reporting UI, and scoped the existing Facebook-capture system audit branch to valid XOR persistence only.
- A second validation clarified that `userId` cannot remain as an internal usage-attribution alias and that Facebook capture must preserve its existing fake-user caller/provenance only until Story 8.3 migrates it before Story 8.5 removal; both constraints are now explicit without implementing either later story.
- No application code, migration, test, commit, or later Epic 8 story was started.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story is ready for development planning only. No implementation work, migration generation, test execution, commits, code review, or later-story work was performed.
- 2026-07-27 recovery: completed the attribution schema, Audit/Usage boundaries, compatible callers, and affected fixtures. Added `0069_persist_audit_usage_attribution.sql`; it renames the usage initiator column, adds nullable project context plus required executor attribution, and enforces audit/history actor XOR shapes. Drizzle's rename-disambiguation prompt cannot complete in the non-TTY runner, so the equivalent migration was written explicitly and verified by migration-driven tests; no durable database was migrated.
- Focused Story 8.2 coverage initially passed with 189 tests across actor validation, usage attribution, admin aggregation, AI Ask session deletion, trip projects, ingestion, and proposal history. Full-suite validation remains blocked by four pre-existing unrelated failures: a missing `answer_usefulness_feedback.userId` fixture, two Facebook recovery-page query-message assertions, and an operator fixture rejected by exact-admin authorization. `pnpm db:generate` is additionally blocked by Drizzle's non-TTY rename-disambiguation prompt; the equivalent explicit migration was verified by migration-driven tests.
- 2026-07-27 authorized exception: reran the focused Story 8.2 suite successfully (8 files, 272 tests). Advanced this story to `review` despite the four unrelated full-suite failures and the non-TTY `db:generate` rename prompt. No code, tests, migration, or other story records were changed as part of this status advancement; those blockers remain recorded for resolution outside Story 8.2.

### File List

- _bmad-output/implementation-artifacts/8-2-persist-valid-audit-history-and-usage-attribution.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- drizzle/migrations/0069_persist_audit_usage_attribution.sql
- drizzle/migrations/meta/_journal.json
- src/db/schema.ts
- src/features/audit/events.ts
- src/features/audit/history.ts
- src/features/audit/usage.ts
- src/features/usage/events.ts
- src/features/admin/users.ts
- src/features/chat-trips/trip-change-proposals.ts
- src/features/knowledge/recommendations.ts
- src/features/knowledge/review-approval-core.ts
- src/features/knowledge/source-captures.ts
- src/features/knowledge/source-removal.ts
- src/features/knowledge/youtube-capture.ts
- src/features/knowledge/facebook-capture.ts
- src/features/knowledge/facebook-capture-review.ts
- src/app/api/ai-ask/stream/route.ts
- src/features/ai/evaluation-answer.ts
- src/features/ai/trip-proposal-draft.ts
- src/features/chat-trips/context-extraction.ts
- src/features/feedback/evaluation.ts
- src/features/retrieval/source-bundle.ts
- src/features/knowledge/extraction.ts
- src/features/knowledge/ingestion-pipeline.ts
- src/features/knowledge/suggestions.ts
- tests/audit-actors.test.ts
- tests/ai-usage-events.test.ts
- tests/admin-user-management.test.ts
- tests/ai-ask-sessions.test.ts
- tests/ai-ask-shell.test.ts
- tests/trip-projects.test.ts
- tests/knowledge-ingestion-pipeline.test.ts

## Change Log

- 2026-07-27: Created, independently validated, and tightened the Story 8.2 implementation guide; status set to ready-for-dev.
- 2026-07-27: Revalidated and repaired Story 8.2 documentation-only gaps; status remains ready-for-dev.
- 2026-07-27: Recovered interrupted implementation; focused migration-driven coverage passes, but unrelated full-suite failures block review.
- 2026-07-27: Authorized exception applied: focused Story 8.2 evidence rerun passed (8 files, 272 tests); status advanced to review despite four pre-existing unrelated full-suite failures and the non-TTY Drizzle rename prompt.
