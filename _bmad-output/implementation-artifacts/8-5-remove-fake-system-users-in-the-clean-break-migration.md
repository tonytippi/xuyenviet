---
baseline_commit: 3a91fbf
---

# Story 8.5: Remove Fake System Users in the Clean-Break Migration

Status: review

## Story

As a development operator,
I want the disposable database reset and seed to contain only real people,
so that fake system identities cannot reappear through migrations, fixtures, or startup paths.

## Acceptance Criteria

1. **No fake-user creation paths**
   - Given the clean-break migration is prepared while development data remains disposable,
   - When reserved-user migrations, seed fixtures, test helpers, and runtime actor APIs are updated or removed,
   - Then no code path creates `system-knowledge-pipeline`, `system-trip-planning`, `system-facebook-capture`, or `system-youtube-capture` as a `users` row.
   - And deliberate person fixtures remain valid without system-only emails, accounts, sessions, roles, referrals, or ownership records.

2. **Safe clean-break preflight**
   - Given the current development environment is evaluated before migration execution,
   - When the clean-break precondition is checked,
   - Then the local-only reset guard and daily-reset development-data policy confirm that the exact target database is disposable.
   - And the migration is blocked from non-local or protected databases before any reset occurs.

3. **Clean reset and seed outcome**
   - Given a clean development database is reset, migrated, and seeded,
   - When seed validation completes,
   - Then it contains no non-human `users` row and no `users.id` beginning with `system-`.
   - And the resulting schema and seed data support valid user and system audit/executor attribution without backfilling fake-user history.

4. **Durable-data stop condition**
   - Given durable production, customer, or operational data exists before this work ships,
   - When implementation readiness is reassessed,
   - Then stop this clean-break migration before deployment.
   - And create an explicit expand-migrate-contract rollout rather than applying the development reset strategy.

## Tasks / Subtasks

- [x] Confirm the clean-break preflight before any migration-history or database action (AC: 2, 4)
  - [x] Resolve the exact `DATABASE_URL` that `pnpm db:reset` will use: process environment takes precedence over `.env.local`, then `.env`, as implemented by `scripts/db-env.ts`. Record a credential-free identity of its host, port, and database name, and verify it is the intended reset-only local development database.
  - [x] Before any migration-history edit or `pnpm db:reset`, connect only to that resolved target and confirm its server/database identity (for example, `current_database()`, server address, and port) matches the recorded target. Affirm that every record on it is intentionally disposable; `APP_ENV=local`, a local host, and a non-protected database name are necessary guards, but do not prove that populated data is disposable.
  - [x] Confirm `DATABASE_URL_TEST` is distinct from the resolved `DATABASE_URL`. It is the isolated Vitest target and is not evidence that the actual development reset target is safe or that `pnpm db:reset` has validated it.
  - [x] Preserve `scripts/db-env.ts` local-host/protected-database guards and `scripts/db-reset.ts` reset sequence. Do not weaken them or add an override.
  - [x] If the target is non-local, protected, durable, customer-facing, operational, or its reset-only status cannot be affirmatively confirmed, stop before modifying migration history or running `pnpm db:reset`. Obtain an expand-migrate-contract design; do not backfill, delete, or preserve fake-user history under this story.

- [x] Remove obsolete reserved-user migration history and tests (AC: 1)
  - [x] Delete `drizzle/migrations/0044_system_knowledge_pipeline_actor.sql`, `drizzle/migrations/0064_system_trip_planning_actor.sql`, and `drizzle/migrations/0065_system_facebook_capture_actor.sql`. They exist solely to insert reserved non-human rows into `users`.
  - [x] Remove exactly the matching entries from `drizzle/migrations/meta/_journal.json`; preserve all other entries and their order. Do not add a compensating deletion migration: the authorized implementation is a reset/reseed clean break.
  - [x] Delete `tests/system-knowledge-pipeline-actor-migration.test.ts` and `tests/system-facebook-capture-actor-migration.test.ts`, which assert the obsolete fake-user migrations create `users` rows. Do not retain equivalent reserved-user behavior under a different test name.
  - [x] Keep later attribution migrations `0069_persist_audit_usage_attribution.sql`, `0070_story_8_3_knowledge_executor_attribution.sql`, and `0071_story_8_3_search_projection_executor_required.sql` unchanged unless a clean migration proves a real dependency. They establish the replacement actor/executor model.

- [x] Remove fake seed identities while preserving deliberate people and human provenance (AC: 1, 3)
  - [x] In `scripts/db-seed.ts`, remove only the `system-facebook-capture` and `system-youtube-capture` user fixtures. Retain `seed-fixture-operator-user`, `seed-traveler-user`, their valid role/ownership records, and their source/trip/conversation relationships.
  - [x] Preserve `sources.submittedByUserId: "seed-fixture-operator-user"` for Facebook and YouTube seed sources. It is deliberate human submitter provenance; never replace it with a catalog executor ID.
  - [x] Do not add a user fixture for any cataloged executor, including `system-youtube-capture`. The catalog in `src/features/audit/actors.ts` remains required and is not seed data.

- [x] Remove stale fake-person fixtures and active operational instructions (AC: 1)
  - [x] In `tests/facebook-capture.test.ts` and `tests/youtube-capture.test.ts`, replace reserved fake-user metadata fixture values with generic legacy user-like metadata while retaining assertions that `captureActorId` and `importActorId` are never persisted. Preserve system executor audit assertions and real-person source submitter fixtures.
  - [x] Update `docs/runbooks/youtube-capture.md`: remove the instruction to create a service-actor `users` row. State that capture executes as cataloged `system-youtube-capture`, has no user/session/role, and requires real source-submitter provenance.
  - [x] Update `docs/runbooks/facebook-capture.md`: replace the reserved-user/migration-0065 instructions and failure recovery with the cataloged `system-facebook-capture` executor model. Preserve the no-session/no-OAuth/no-role/no-approval-authority rule, because the executor is not a `users` row.
  - [x] Do not alter historical Story 7.5 or readiness records merely to erase historical context. Story 8.4 already marks the obsolete session-shaped expiry guidance as superseded. Update only active documents that direct operators to create or rely on fake users.

- [x] Prove the clean migration and seed result (AC: 1, 3)
  - [x] Add focused Story 8.5 Vitest coverage using the existing `tests/helpers/db.ts`/`DATABASE_URL_TEST` conventions for repeatable database regressions: prove the four reserved IDs are absent from `users`, no user ID starts with `system-`, deliberate person fixtures remain valid with their source/trip/conversation relationships, and a cataloged system audit/executor write does not require a matching user row. Do not point a test at `DATABASE_URL`, invoke `pnpm db:reset` from Vitest, or treat a truncated test database as a clean migration/seed proof.
  - [x] Prove a valid cataloged system audit/executor write succeeds without a matching `users` row. Reuse `tests/audit-actors.test.ts` and `tests/audit-attribution-migration.test.ts` for generic actor XOR behavior rather than duplicating their matrix.
  - [x] Only after the exact-target preflight approval, run `pnpm db:reset` against the resolved `DATABASE_URL`. This is the authoritative clean migration/seed acceptance check. Query that same reset database for IDs/emails matching the historic system identities and for every `users.id LIKE 'system-%'`; expected result: zero rows. Query `seed-fixture-operator-user` and `seed-traveler-user`, then confirm their expected role, source submitter, trip, and conversation relationships remain. Do not substitute a successful `DATABASE_URL_TEST` run for this check.
  - [x] Search the repository for the three deleted migration names, reserved invalid/internal system emails, and `users` inserts. Catalog constants/usages and clearly superseded historical documentation may remain; no migration, seed, runtime path, active test fixture/helper, or active runbook may create a system identity as a person.

- [x] Verify the scoped implementation (AC: 1, 2, 3)
  - [x] Run the new focused clean-break/seed test plus `tests/audit-actors.test.ts`, `tests/audit-attribution-migration.test.ts`, `tests/facebook-capture.test.ts`, and `tests/youtube-capture.test.ts` serially because the database-backed tests share `DATABASE_URL_TEST`.
  - [x] Run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
  - [x] Do not require `pnpm db:generate`: this story removes data-only migration files and does not change schema. If it is run, record the known non-TTY Drizzle rename-disambiguation result exactly rather than treating it as a Story 8.5 failure.

## Dev Notes

### Required Domain Contract

- `users` is for authenticated people and deliberate person fixtures only. It is never a polymorphic actor registry. System executors cannot have an OAuth account, session, user role, referral, ownership, or authorization privilege.
- Audit owns the closed five-entry `AuditActor` catalog and typed event/history/usage boundaries. Keep `system-ai-orchestration`, `system-knowledge-pipeline`, `system-trip-planning`, `system-facebook-capture`, and `system-youtube-capture` as catalog identifiers; remove only their fake `users` representations.
- A user actor carries a real `users.id` and nonblank email snapshot. A system actor carries a cataloged system ID with no user ID or person email. Existing XOR persistence and typed writers from Stories 8.1-8.4 are the replacement for the deleted user rows.
- This is a disposable-development-data clean break. Do not create a forward deletion/backfill migration, compatibility user, migration-time preservation path, or fake session. If durable data exists, stop and redesign as expand-migrate-contract.

### Current State To Change

- `0044_system_knowledge_pipeline_actor.sql`, `0064_system_trip_planning_actor.sql`, and `0065_system_facebook_capture_actor.sql` each insert a reserved fake user. Their journal entries retain them in clean migration history.
- `scripts/db-seed.ts` currently creates `system-facebook-capture` and `system-youtube-capture` alongside two valid person fixtures. The seeded capture sources already use the real operator fixture as their submitter and must retain that relationship.
- The two historical migration tests directly require the obsolete migrations and must be deleted, while the capture tests only need their legacy metadata values made non-reserved.
- `docs/runbooks/youtube-capture.md` and `docs/runbooks/facebook-capture.md` are active instructions that still direct operators to a fake service user or migration. They must describe the current first-class executor model.
- No current runtime module should create a reserved `users` row. Do not remove `system-*` values from `src/features/audit/actors.ts` or valid executor call sites; those are correct system catalog references, not fake users.

### Architecture And Regression Guardrails

- Do not modify `src/db/schema.ts`, the Audit actor/writer modules, knowledge/capture execution attribution, proposal expiry, or `0069`-`0071` unless migration verification proves a concrete dependency. Stories 8.1-8.4 already delivered the required replacement paths.
- Preserve human-only foreign keys and source lineage. In particular, captured source `submitted_by_user_id` is the real originating person, never the capture executor.
- Run database-backed tests serially. `pnpm db:reset` uses `DATABASE_URL`; Vitest uses `DATABASE_URL_TEST`. Do not mistake a successful test reset for validation of the actual development reset target.
- The local reset guard rejects a non-local host, `APP_ENV != local`, and protected database names. It does not establish that the target's contents are disposable; explicit confirmation is mandatory before reset.
- Resolve and record the effective `DATABASE_URL` before any destructive action because `scripts/db-env.ts` gives process environment precedence over `.env.local` and `.env`. Verify its credential-free host/port/database identity against a direct connection; never paste credentials into the story record, test output, or commit.
- Focused Vitest coverage is limited to `DATABASE_URL_TEST` and runs serially with the other database-backed files. The one approved `pnpm db:reset` run is a separate manual development-data acceptance check against `DATABASE_URL`, not a test-suite setup step.
- Keep active runbooks aligned to current runtime behavior. Historical BMad artifacts may retain superseded context if it is explicitly identified as such; do not rewrite prior story history outside the target scope.

### Scope Boundaries

- **In scope:** removal of reserved-user migration/journal history, seed rows, obsolete migration tests, unnecessary reserved fixture values, active runbook instructions, reset/seed proof, and focused regression coverage.
- **Not Stories 8.1-8.4:** no new actor union, persistence shape, executor migration, worker attribution, direct-write enforcement, proposal-expiry work, or schema redesign.
- **Not Story 8.6:** do not claim final end-to-end actor-isolation certification. Story 8.6 owns the complete allowed/rejected actor matrix, authentication/role/ownership/referral isolation proof, all-flow attribution verification, repository-wide direct-insert enforcement, and final broad repository/data scans.
- No new dependency, UI, role/auth behavior, background worker, migration backfill, or durable-data rollout is authorized.

### Project Structure Notes

- Migration history belongs in `drizzle/migrations/` and `drizzle/migrations/meta/_journal.json`; seed behavior belongs in `scripts/db-seed.ts`; active operator instructions belong in `docs/runbooks/`; database-backed tests belong in `tests/`.
- Use strict TypeScript, the existing Vitest/PostgreSQL test helpers, pnpm scripts, and `@/*` app imports. Add no dependency.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.5-Remove-Fake-System-Users-in-the-Clean-Break-Migration]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-31-Audit-And-Automated-Execution-Use-First-Class-Actors]
- [Source: _bmad-output/planning-artifacts/proposal-eliminate-fake-system-users-with-audit-actors.md#Migration-And-Rollout-Plan]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-26.md#Resolved-Story-Sizing-and-Environment-Preconditions]
- [Source: _bmad-output/implementation-artifacts/8-1-establish-the-audit-actor-boundary-and-system-catalog.md#Known-Future-Consumers-Not-This-Storys-Migration-Scope]
- [Source: _bmad-output/implementation-artifacts/8-2-persist-valid-audit-history-and-usage-attribution.md#Story-Boundary]
- [Source: _bmad-output/implementation-artifacts/8-3-attribute-knowledge-capture-and-ai-work-to-system-executors.md#Scope-Boundaries]
- [Source: _bmad-output/implementation-artifacts/8-4-attribute-trip-proposal-expiry-through-the-audit-boundary.md#Scope-Boundaries]
- [Source: _bmad-output/project-context.md]
- [Source: scripts/db-env.ts]
- [Source: scripts/db-reset.ts]
- [Source: scripts/db-seed.ts]
- [Source: drizzle/migrations/meta/_journal.json]
- [Source: src/features/audit/actors.ts]
- [Source: tests/audit-attribution-migration.test.ts]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- BMad installation was verified through `_bmad/_config/bmad-help.csv`; `bmad-help` and `bmad-create-story` activation completed with no prepend/append actions. `_bmad-output/project-context.md` was loaded as the persistent project fact.
- Full sprint status, Epic 8, AD-31, the clean-break proposal/readiness record, Stories 8.1-8.4, current migration journal/files, seed script, reset safeguards, active runbooks, capture tests, Audit catalog, and five recent commits were analyzed.
- Story context was non-interactively validated against the installed `bmad-create-story` checklist. No application code, migration, test execution, commit, or Story 8.6 work was performed.
- Preflight before migration-history edits and reset: effective `DATABASE_URL` source `.env`; credential-free configured identity `localhost:5432/xuyenviet`; `APP_ENV=local`; direct connection identity `current_database()=xuyenviet`, server `127.0.0.1/32`, port `5432`. `DATABASE_URL_TEST` resolved separately to `localhost:5432/xuyenviet_test`. User authorization affirmatively confirmed the exact development target and all contents were disposable.
- `pnpm db:reset` completed on the approved `DATABASE_URL` target. Post-reset direct query returned zero system-ID or historic internal/invalid-email users; deliberate people and relationships were preserved: 1 traveler role, 18 source submitter records, 1 trip, and 1 conversation.
- Scoped serial Vitest command passed: 5 files, 54 tests. Full suite was also attempted: 1,046 passed and 7 unrelated pre-existing failures in `tests/ai-ask-shell.test.ts`, `tests/ai-models.test.ts`, `tests/auth-gate.test.ts`, and `tests/traveler-ui-foundation.test.ts`; they concern UI/auth assertions outside Story 8.5. `pnpm lint` passed with 3 existing unrelated warnings; post-build `pnpm typecheck` and `pnpm build` passed.
- Final bounded Story 8.5 review found no actionable in-scope issue. The only remaining reserved-email scan hits are explicitly superseded historical Story 7.5/8.4 artifacts, which this story must retain. No commit and no Story 8.6 work were performed.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story status is `ready-for-dev`; sprint status is synchronized to `ready-for-dev`.
- Implementation is conditionally ready: Stories 8.1-8.4 provide the first-class actor/executor replacements. Before any reset or migration-history change, the implementer must affirm that the exact `DATABASE_URL` target is intentionally disposable local development data.
- Hard blocker if that confirmation is unavailable or target data is durable: stop Story 8.5 and obtain an expand-migrate-contract design. Do not reset, backfill, or delete fake-user history.
- Removed the three obsolete reserved-user migration files and journal entries, two obsolete migration tests, and the two fake seed users. Active capture runbooks now identify cataloged executors as non-user identities.
- Added `tests/story-8-5-clean-break.test.ts` for isolated seed and cataloged-system-audit regression coverage. All Story 8.5 tasks and acceptance criteria are complete; status is `review`.

### File List

- _bmad-output/implementation-artifacts/8-5-remove-fake-system-users-in-the-clean-break-migration.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- docs/runbooks/facebook-capture.md
- docs/runbooks/youtube-capture.md
- drizzle/migrations/0044_system_knowledge_pipeline_actor.sql (deleted)
- drizzle/migrations/0064_system_trip_planning_actor.sql (deleted)
- drizzle/migrations/0065_system_facebook_capture_actor.sql (deleted)
- drizzle/migrations/meta/_journal.json
- scripts/db-seed.ts
- tests/facebook-capture.test.ts
- tests/story-8-5-clean-break.test.ts
- tests/system-facebook-capture-actor-migration.test.ts (deleted)
- tests/system-knowledge-pipeline-actor-migration.test.ts (deleted)
- tests/youtube-capture.test.ts

## Change Log

- 2026-07-27: Created and non-interactively validated the Story 8.5 implementation guide; status set to `ready-for-dev`. No code, migration, reset, test, commit, or Story 8.6 work was performed.
- 2026-07-27: Revalidated the Story 8.5 guide and clarified the effective `DATABASE_URL` identity/disposability preflight and the separation between `DATABASE_URL_TEST` regressions and the authoritative development reset/seed acceptance check. Status remains `ready-for-dev`. No code, migration, reset, test, commit, or Story 8.6 work was performed.
- 2026-07-27: Completed the authorized clean-break implementation and approved local reset/reseed of `localhost:5432/xuyenviet`; removed fake-user migration/seed/test/runbook paths, added focused seed coverage, and set status to `review`. No commit or Story 8.6 work was performed.
