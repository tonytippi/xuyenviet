---
baseline_commit: fddf146
---

# Story 8.6: Verify Actor Isolation and Attribution End to End

Status: review

## Story

As a product owner,
I want automated verification of the new actor model and its migrations,
so that attribution stays correct as Audit, workers, and user-facing reporting evolve.

## Acceptance Criteria

1. **Actor-shape and identity-isolation matrix**
   - Given AuditActor validation and persistence tests run,
   - When they exercise every allowed and rejected user/system shape,
   - Then valid rows satisfy database constraints and invalid, mixed, missing, or catalog-invalid shapes fail before or at persistence.
   - And the tests prove every cataloged system actor cannot authenticate, obtain a user role, own a user-scoped resource, receive a referral, or become a session principal.

2. **Automated-flow attribution and direct-write enforcement**
   - Given automated knowledge, indexing, capture, recommendation resolution, AI usage, and Trip Proposal expiry flows are tested,
   - When they perform a write,
   - Then each records its required cataloged executor while preserving a real requester/submitting user only in its semantically human field.
   - And no direct feature insert into `audit_events`, `trip_plan_change_history`, or `ai_usage_events` remains permitted.

3. **Clean migration/seed and final repository/data audit**
   - Given a clean database migration and `db:seed` run in verification,
   - When repository and data checks inspect reserved IDs, invalid-domain system emails, and seed output,
   - Then no fake-user creation/reference path remains outside the documented system catalog and architecture/proposal documentation.
   - And verification records the clean database result without relying on legacy backfill behavior.

## Tasks / Subtasks

- [x] Establish one focused final actor-isolation regression suite (AC: 1, 3)
  - [x] Add `tests/story-8-6-actor-isolation.test.ts` using `tests/helpers/db.ts` and the isolated `DATABASE_URL_TEST` conventions. Reuse the Story 8.5 explicit test-database seed-subprocess pattern if a seed result must be inspected; never inherit `DATABASE_URL`, invoke `pnpm db:reset`, or reset the development database from Vitest.
  - [x] Exercise the valid user actor and all five valid system actors: `system-ai-orchestration`, `system-knowledge-pipeline`, `system-trip-planning`, `system-facebook-capture`, and `system-youtube-capture`.
  - [x] Exercise malformed input at the Audit boundary and persistence boundary: blank/missing user ID or email, blank/unknown system ID, mixed user/system fields, missing/invalid class, non-record values, and SQL `NULL`-bypass attempts. Reuse the canonical generic actor/XOR coverage rather than duplicating writers or schema fixtures unnecessarily.
  - [x] Prove catalog IDs are execution identifiers only: none appears as a `users` row, OAuth account, Auth.js session, `user_roles` row, referral relationship, owner/requester/submitter/reviewer/approver value, or authenticated session principal. Include `system-ai-orchestration`, not only the four historic fake IDs.
  - [x] Keep deliberate human fixtures valid and prove their existing role, source-submitter, Trip Project, and conversation relationships remain real-user relationships.

- [x] Verify attribution through the complete automated-flow matrix (AC: 2)
  - [x] Reuse and extend existing focused flow tests instead of recreating production paths: ingestion/recovery/extraction/indexing and automated recommendations use `system-knowledge-pipeline`; synchronous authenticated model work uses `system-ai-orchestration` while retaining the actual initiator; Facebook and YouTube capture use their respective catalog executors while retaining originating source submitter and source lineage; Trip Proposal expiry uses `system-trip-planning` without owner/session impersonation.
  - [x] Assert transition semantics, not just final values: human queue enqueue has no false executor; worker claim/retry/complete carries `system-knowledge-pipeline`; human recommendation resolution/supersession clears executor and retains human provenance; system worker transitions are paired with transaction-coupled Audit events; a lost/reclaimed worker lease writes no stale success side effect or audit.
  - [x] Verify worker-only usage has `initiatedByUserId: null`, required catalog executor, and does not affect user-facing roster aggregation. Verify authenticated orchestration retains available trip/conversation/message context and human initiator while recording its executor.
  - [x] Preserve existing worker fencing, transaction ownership, best-effort telemetry policies, source privacy, owner scoping, and proposal idempotency. This verification story must not weaken a flow merely to make an assertion convenient.

- [x] Make the protected-write enforcement repository-wide (AC: 2)
  - [x] Extend the Story 8.4 source-level convention guard or add a focused Audit-owned enforcement regression that scans production feature source for direct inserts into `auditEvents`, `tripPlanChangeHistory`, and `aiUsageEvents`.
  - [x] Permit direct inserts only in `src/features/audit/events.ts`, `src/features/audit/history.ts`, and `src/features/audit/usage.ts`. Exclude tests, migrations, and seed fixtures deliberately rather than weakening production enforcement.
  - [x] Detect receiver and formatting variants, including whitespace/newline forms and chained writers such as `getDb().insert(...)`. Audit-owned typed writers remain the only legal production boundary.

- [x] Verify clean-break migration, seed, and repository state (AC: 3)
  - [x] Use `DATABASE_URL_TEST` for automated migration/seed regressions. Prove the test seed output contains no `users.id LIKE 'system-%'`, no historic reserved IDs, and no invalid system-email user fixture, while valid person fixtures and their human-owned relationships remain present.
  - [x] Search current migration history, seed/runtime code, test helpers/fixtures, and active runbooks for reserved-user migrations, fake system IDs/emails, and user-creation paths. Catalog references and explicitly historical/superseded BMad documents may remain; no active migration, seed, runtime path, fixture/helper, or active runbook may create a catalog executor as a person.
  - [x] If an authoritative development `pnpm db:reset` plus migration/seed check is required, first resolve the effective `DATABASE_URL`, verify its credential-free host/port/database identity directly, and obtain affirmative confirmation that the exact local target and all its contents are disposable. If it is non-local, protected, durable, customer-facing, operational, or cannot be confirmed disposable, stop and request an expand-migrate-contract rollout. Do not reset, backfill, delete, or treat `DATABASE_URL_TEST` as proof that the development target is safe.

- [x] Run and record scoped verification (AC: 1, 2, 3)
  - [x] Run database-backed tests serially: `tests/story-8-6-actor-isolation.test.ts`, `tests/audit-actors.test.ts`, `tests/audit-attribution-migration.test.ts`, `tests/story-8-5-clean-break.test.ts`, `tests/ai-usage-events.test.ts`, `tests/admin-user-management.test.ts`, `tests/knowledge-ingestion-pipeline.test.ts`, `tests/knowledge-indexing-worker.test.ts`, `tests/knowledge-extraction-worker.test.ts`, `tests/knowledge-draft-extraction.test.ts`, `tests/knowledge-recommendation-queue.test.ts`, `tests/facebook-capture.test.ts`, `tests/youtube-capture.test.ts`, `tests/trip-change-proposals.test.ts`, `tests/trip-proposal-expiry-worker.test.ts`, and `tests/trip-planning-safety.test.ts`.
  - [x] Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Record actual results and existing warnings/failures exactly; do not claim a full-suite or `pnpm db:generate` pass without current evidence.
   - [x] Do not require `pnpm db:generate` unless a confirmed production/schema defect requires a migration. Its known non-TTY rename-disambiguation prompt must be recorded as a blocker if encountered, not bypassed.

### Review Findings

- [x] [Review][Patch] Clean migration verification [tests/story-8-6-actor-isolation.test.ts] — **High repaired.** Each regression recreates only `DATABASE_URL_TEST`'s `public` and Drizzle journal schemas, invokes an explicitly bound `drizzle-kit migrate`, then invokes the explicitly bound seed subprocess before inspecting schema and data.
- [x] [Review][Patch] Catalog actors cannot become user/auth principals [src/db/schema.ts; drizzle/migrations/0072_reject_system_executor_user_ids.sql; tests/story-8-6-actor-isolation.test.ts] — **High repaired.** The database rejects all five catalog IDs at the `users.id` boundary, transitively preventing accounts, sessions, roles, and user-scoped foreign-key rows; regressions prove direct user/account/session/role creation fails.
- [x] [Review][Patch] Actor-isolation matrix covers user-scoped relationships [tests/story-8-6-actor-isolation.test.ts] — **Medium repaired.** The regression discovers every foreign key targeting `users`, scans each for all catalog IDs, asserts the required remover/reviewer/creator/submitter relationships, and preserves valid seed-person assertions.
- [x] [Review][Patch] Audit-owned direct-write guard is non-bypassable for supported forms [tests/story-8-6-actor-isolation.test.ts] — **Medium repaired.** Import-aware TypeScript AST inspection catches direct, aliased, namespace/member, optional, computed, and local-alias protected-table insert calls; adversarial bypass forms are rejected.

## Dev Notes

### Required Domain Contract

- `users` is for authenticated people and deliberate person fixtures only. A cataloged system executor is never a user, OAuth account, Auth.js session, role holder, referral participant, owner, requester, submitter, reviewer, approver, or authorization principal.
- Audit owns the immutable five-entry catalog, `AuditActor` construction/validation, session conversion, actor labels, and typed audit/history/usage writers. Feature modules must reuse these boundaries and must not define lookalike unions, arbitrary system strings, fake sessions, or user-like executor metadata.
- A user actor has a real user ID and nonblank immutable email snapshot. A system actor has exactly one catalog system ID and no human identity fields. Runtime validation is required even when TypeScript types are strict.
- `audit_events` and `trip_plan_change_history` persist exactly one user-or-system shape. `ai_usage_events` separates nullable `initiated_by_user_id` from required `executor_system`; user metrics use initiator only and worker work must not be attributed to a person.
- Human provenance remains in its semantic real-user field. In particular, `sources.submitted_by_user_id` stays the originating person for captured/discovered sources, while the relevant capture executor is stored separately.

### Existing Coverage To Reuse

- Use `tests/audit-actors.test.ts` for constructor/validator/writer behavior and `tests/audit-attribution-migration.test.ts` for database XOR and NULL-bypass regressions.
- Use `tests/story-8-5-clean-break.test.ts` for isolated clean-seed setup and fake-user absence; bind any child seed process explicitly to the resolved `DATABASE_URL_TEST`.
- Use the existing knowledge ingestion, indexing, extraction, recommendation, draft-extraction, Facebook, YouTube, usage, admin roster, and Trip Proposal expiry tests for real-flow attribution. Add only missing cross-cutting assertions or one focused suite; do not duplicate their workflow fixtures wholesale.
- The existing Chat/Trips direct-history test detects whitespace/newline and chained `.insert(tripPlanChangeHistory)` forms. Generalize the mechanism for all three Audit-owned tables without scanning tests or Audit-owned writers as violations.

### Architecture And Regression Guardrails

- Database checks require explicit `IS NOT NULL` clauses for correlated actor/executor shapes. Do not accept SQL three-valued-logic as validation.
- Keep transaction-coupled Audit events and existing `FOR UPDATE`, `SKIP LOCKED`, lease/fencing, compare-and-swap, advisory-lock, idempotency, and owner-scope rules intact. A stale/lost worker must not create terminal effects or an Audit success event.
- Separate a human action from later automation. Human enqueue does not become a pipeline executor; human resolution clears an earlier system executor; a worker has a catalog executor while retaining separate requester/submitter provenance.
- Do not reintroduce a compatibility user, fake user email, fake user session, arbitrary executor input, or durable-data backfill. The approved clean break applies only to affirmatively disposable local development data.
- Preserve privacy boundaries. Verification must not expose raw source material, provider payloads, capture credentials, or execution secrets in test output or read models.

### Scope Boundaries

- **In scope:** final regression/enforcement coverage, only the smallest production repair needed for a confirmed bypass, repository/data scans, and clean seed verification.
- **Not a redesign:** no new actor catalog, authentication/session/role mechanism, user ownership semantic, dependency, UI, reporting dashboard, generic data-access layer, or broad migration redesign.
- **Not a normal destructive test:** do not run `pnpm db:reset` or touch the development database without the explicit target identity/disposability confirmation described above.
- The pre-existing best-effort proposal-read expiry behavior may leave an elapsed pending proposal visible after a transient expiry failure. It is deferred work, not an attribution regression, unless this story changes it deliberately under an approved scope expansion.

### Verification Environment Notes

- Database-backed tests share `DATABASE_URL_TEST` and must run serially.
- The previously user-authorized disposable local `DATABASE_URL` target is historical Story 8.5 context only. It is not evidence that this Story 8.6 validation ran a reset, migration, or seed, and it does not waive the exact-target identity/disposability confirmation required before any future authoritative reset.
- Prior work recorded a non-interactive `pnpm db:generate` Drizzle rename-disambiguation prompt and unrelated full-suite UI/auth fixture failures. Re-evaluate current results during implementation; do not silently classify them as Story 8.6 failures or passes.
- There is no creation-stage implementation blocker. The only conditional blocker is any requested authoritative development reset when the exact target cannot be affirmatively confirmed as disposable local data; then stop for an expand-migrate-contract design.

### Project Structure Notes

- Keep Audit ownership under `src/features/audit/`, feature flow tests under `tests/`, database test helpers under `tests/helpers/`, clean-break scripts under `scripts/`, and migration history under `drizzle/migrations/`.
- Use strict TypeScript, `server-only` existing server boundaries, PostgreSQL/Drizzle, Vitest, pnpm, and `@/*` imports. Add no dependency.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.6-Verify-Actor-Isolation-and-Attribution-End-to-End]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-31-Audit-And-Automated-Execution-Use-First-Class-Actors]
- [Source: _bmad-output/implementation-artifacts/8-1-establish-the-audit-actor-boundary-and-system-catalog.md#Review-Findings]
- [Source: _bmad-output/implementation-artifacts/8-2-persist-valid-audit-history-and-usage-attribution.md#Review-Findings]
- [Source: _bmad-output/implementation-artifacts/8-3-attribute-knowledge-capture-and-ai-work-to-system-executors.md#Review-Findings]
- [Source: _bmad-output/implementation-artifacts/8-4-attribute-trip-proposal-expiry-through-the-audit-boundary.md#Review-Findings]
- [Source: _bmad-output/implementation-artifacts/8-5-remove-fake-system-users-in-the-clean-break-migration.md#Architecture-And-Regression-Guardrails]
- [Source: _bmad-output/project-context.md]
- [Source: src/features/audit/actors.ts]
- [Source: src/features/audit/events.ts]
- [Source: src/features/audit/history.ts]
- [Source: src/features/audit/usage.ts]
- [Source: tests/helpers/db.ts]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- BMad installation was verified through `_bmad/_config/bmad-help.csv`; `bmad-help` and `bmad-create-story` activation completed with no prepend/append steps. `_bmad-output/project-context.md` was loaded as the persistent project fact.
- Full sprint status, the Epic 8 contract, AD-31, completed Stories 8.1-8.5, the latest clean-break status, repository test/source research, and recent commit titles were analyzed.
- The story was validated non-interactively against the installed `bmad-create-story` checklist. It names the complete actor/isolation matrix, all automated-flow attribution paths, direct-insert enforcement, clean-break preflight, and prior review regression traps.
- Prior Story 8.5 records establish that a local development target was user-authorized as disposable for that story; this validation did not inspect, reset, migrate, seed, or otherwise touch `DATABASE_URL`. That prior authorization remains context, not current Story 8.6 completion evidence or a substitute for the future exact-target confirmation.
- No application code, migration, test execution, database reset, seed run, commit, or code review was performed.
- 2026-07-27: Began Story 8.6 implementation. The user confirmed `localhost:5432/xuyenviet` was just reset and is disposable; verification will inspect its migration/seed state without performing another reset. Database-backed Story 8.6 tests will run serially against `DATABASE_URL_TEST`.
- 2026-07-27: Verified `DATABASE_URL` identity read-only as `127.0.0.1:5432/xuyenviet` (user `postgres`), with 69 applied migrations and the three attribution tables present. No development reset was run.
- 2026-07-27: Development seed inspection found 2 deliberate people, 0 `system-%` user IDs/emails, and 0 catalog account/session/role rows. It preserved 18 operator-submitted sources plus one traveler Trip Project and conversation.
- 2026-07-27: Added `tests/story-8-6-actor-isolation.test.ts`: explicit `DATABASE_URL_TEST` seed subprocess, five-system-catalog actor checks, malformed boundary cases, catalog identity/ownership/referral/session isolation, clean seed checks, and the global Audit-owned insert guard.
- 2026-07-27: Serial `DATABASE_URL_TEST` matrix passed: 16 files, 279 tests. `pnpm lint` passed with 0 errors and 3 existing unused-variable warnings in `tests/knowledge-search.test.ts`; `pnpm build` and a post-build `pnpm typecheck` passed. The first typecheck run raced concurrent `.next/types` regeneration and was rerun successfully. `pnpm db:generate` was not required and was not run; no migration/schema change was needed.

### Completion Notes List

- Read-only development identity/migration/seed inspection completed without a reset. The confirmed local development target was `127.0.0.1:5432/xuyenviet` with 69 applied migrations, attribution tables present, two deliberate people, no system users/emails, and no catalog account/session/role rows.
- The serial `DATABASE_URL_TEST` verification matrix passed: 16 files and 279 tests.
- `pnpm lint` passed with 0 errors and 3 existing unrelated unused-variable warnings in `tests/knowledge-search.test.ts`; `pnpm build` and the post-build `pnpm typecheck` passed. The first typecheck raced `.next/types` regeneration and the rerun passed.
- `pnpm db:generate` was not required and was not run; no migration or schema change was needed.
- Story status remains `review`. Chief of Staff authorized an internal adversarial checkpoint, but it was not performed because the prior worker ended at the prompt. An independent post-commit BMad code review remains required before Story 8.6 can be finalized.
- 2026-07-27: Repaired only the four Story 8.6 review findings. Added migration `0072_reject_system_executor_user_ids` to reserve all five catalog IDs at the `users` boundary. The final suite recreates only `DATABASE_URL_TEST` schemas, explicitly migrates and seeds that target, rejects catalog user/auth principal creation, dynamically scans every user foreign-key relationship, and uses import-aware TypeScript AST enforcement for protected Audit-owned inserts. Serial `DATABASE_URL_TEST` matrix passed: 16 files, 280 tests. `pnpm typecheck` and `pnpm build` passed; `pnpm lint` had 0 errors and 3 existing unused-variable warnings in `tests/knowledge-search.test.ts`. No development target reset and no Story 8.5 change occurred. Status returned to `review`; independent review remains required before `done`.

### File List

- _bmad-output/implementation-artifacts/8-6-verify-actor-isolation-and-attribution-end-to-end.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- tests/story-8-6-actor-isolation.test.ts
- src/db/schema.ts
- drizzle/migrations/0072_reject_system_executor_user_ids.sql
- drizzle/migrations/meta/_journal.json

## Change Log

- 2026-07-27: Created and non-interactively validated the Story 8.6 implementation guide; status set to `ready-for-dev`. No code, migration, database action, test, commit, review, or other story work was performed.
- 2026-07-27: Revalidated Story 8.6 readiness against the create-story checklist, Epic 8, AD-31, and Story 8.5 completion record. Clarified that prior disposable-target authorization is historical context only and does not constitute Story 8.6 reset/seed evidence or waive future target confirmation. Status remains `ready-for-dev`; no code, test, reset, seed, migration, commit, or other work was performed.
- 2026-07-27: Started Story 8.6 development after explicit confirmation that the disposable local `localhost:5432/xuyenviet` target was reset. No reset will be run unless separately required.
- 2026-07-27: Added final actor-isolation, clean-seed, and protected-write enforcement coverage; verified the clean local migration/seed state without resetting it. The required serial `DATABASE_URL_TEST` matrix passed (16 files, 279 tests); lint (0 errors, 3 pre-existing warnings), post-build typecheck, and build passed. Status set to `review`; no migration, development reset, `db:generate`, or commit was performed.
- 2026-07-27: Evidence/status synchronization only. Recorded the read-only development migration/seed identity check, serial 16-file/279-test `DATABASE_URL_TEST` matrix, lint, post-build typecheck, and build evidence. Story remains `review`; the Chief-of-Staff-authorized internal adversarial checkpoint was not executed because the prior worker ended at its prompt. Independent post-commit BMad code review remains required. No code, test, migration, database, or commit action was performed.
- 2026-07-27: Independent post-commit BMad code review of `fddf146..2257a4ac3b5c353fb7e440cace7c1a995afb0f67` ran Blind Hunter, Edge Case Hunter, and Acceptance Auditor. Four unresolved findings require repair: two High (clean migration verification is missing; catalog executors are only absent from seed data rather than prevented from user/auth principal use) and two Medium (the isolation matrix omits user-scoped relationships; the direct-write guard is bypassable). Status set to `in-progress`; no implementation, test, migration, database, or commit action was performed.
- 2026-07-27: Repaired all four authorized Story 8.6 review findings. Added the catalog-user-ID rejection migration; clean verification now recreates, migrates, and seeds only `DATABASE_URL_TEST`; user-scoped relationship coverage is discovered from database foreign keys; and protected-write enforcement uses import-aware TypeScript AST inspection with adversarial bypass coverage. Serial 16-file/280-test matrix, lint (0 errors; 3 existing warnings), typecheck, and build passed. No `DATABASE_URL` reset, Story 8.5 modification, or commit was performed. Status returned to `review` pending independent follow-up review.
