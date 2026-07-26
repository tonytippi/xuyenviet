# Proposal: Eliminate Fake System Users With Audit Actors

**Status:** Proposed - no implementation in this document

**Decision requested:** Replace every non-human row in `users` that exists only to satisfy audit or automated-work foreign keys with a first-class `AuditActor` model. Keep real-user provenance where a person initiated work; represent automated execution as a system actor without a `users` record.

## Problem

The application currently represents several automated processes as reserved rows in the NextAuth `users` table:

| Reserved ID | Current purpose | Why it exists |
| --- | --- | --- |
| `system-knowledge-pipeline` | Canonical ingestion, recommendations, AI usage, knowledge cards, audit events | `created_by_user_id`, `resolved_by_user_id`, `user_id`, and audit FKs require a user |
| `system-trip-planning` | Expired trip-change proposal audit event | `audit_events.actor_user_id` requires a user |
| `system-facebook-capture` | Unattended Facebook capture audit work | Existing actor API and audit FK require a user |
| `system-youtube-capture` | Local seed fixture | Seed data models it as a user despite no verified runtime need |

The first three identities are added by migrations `0044`, `0064`, and `0065`. The latter two are also added by `scripts/db-seed.ts`. These rows are not people, cannot sign in meaningfully, and make user-centric tables, reporting, and administration ambiguous.

The issue is not the audit requirement. It is the overloaded meaning of a user foreign key: it currently carries both a real human principal and a system executor.

## Goals

- The `users` table contains only real authenticated people and deliberately created test fixtures representing people.
- Automated work remains fully attributable to a stable, explicit system identifier.
- Audit records distinguish who requested work from what executed it.
- Existing historical audit and provenance data remains queryable after migration.
- No worker needs a NextAuth session or a fake login identity.
- The change covers all current fake-system identities, not only the knowledge workers.

## Non-Goals

- Adding OAuth/API login capabilities for workers.
- Removing real-user ownership, author, reviewer, submitter, or approver foreign keys.
- Replacing infrastructure credentials. `DATABASE_URL` and provider API keys remain deployment concerns; least-privilege DB roles can be addressed separately.
- Rewriting unrelated user-owned records or changing authorization behavior.

## Proposed Domain Model

Introduce a domain-level discriminated union, named `AuditActor`:

```ts
type UserAuditActor = {
  kind: "user";
  userId: string;
  email: string;
};

type SystemAuditActor = {
  kind: "system";
  system: "knowledge-ingestion" | "trip-proposal-expiry" | "facebook-capture";
  workerId?: string;
};

type AuditActor = UserAuditActor | SystemAuditActor;
```

The runtime actor is an audit/execution identity, not an authentication session. `AuthenticatedSession` can be converted to a `UserAuditActor`, but must not be the only actor type accepted by audit APIs.

### Audit Event Persistence Contract

Migrate `audit_events` to express either a user or a system actor:

| Column | User actor | System actor |
| --- | --- | --- |
| `actor_class` | `user` | `system` |
| `actor_user_id` | Required FK to `users.id` | `NULL` |
| `actor_email` | Required historical email snapshot | `NULL` |
| `actor_system` | `NULL` | Required stable system identifier |
| `actor_worker_id` | `NULL` unless useful operationally | Optional bounded worker/deployment identifier |

Add database checks enforcing both valid shapes. A user actor must have `actor_user_id` and `actor_email` with no `actor_system`; a system actor must have no user ID/email and a nonblank `actor_system`. Keep the user FK for user actors only.

Use a stable system catalog in code, rather than arbitrary strings. Initial catalog:

| System ID | Executor |
| --- | --- |
| `knowledge-ingestion` | Canonical source-version pipeline |
| `knowledge-extraction` | Legacy queued knowledge extraction worker |
| `knowledge-indexing` | Search projection worker, if it begins emitting audit events |
| `trip-proposal-expiry` | Trip Change Proposal expiry worker |
| `facebook-capture` | Unattended Facebook capture command |

System ID records an executor class, while `workerId` is optional diagnostic context. It must not be treated as a human identity, authorization subject, or login account.

### Separate Provenance From Execution

Do not replace every `*_user_id` column with an audit actor. Classify each field by meaning:

| Meaning | Persistence rule |
| --- | --- |
| Ownership, approval, review, explicit user command, referral, session, conversation | Keep real-user FK; system actors are invalid |
| User requested or submitted asynchronous work | Keep nullable/required `requested_by_user_id` or existing `created_by_user_id` as real-user provenance |
| Automated creation, update, recommendation resolution, AI usage, or capture result | Store system executor through audit/executor columns, not a fake user FK |

For an async job created by an operator, preserve both facts:

```text
requested_by_user_id = real operator
executed_by = system:knowledge-extraction
```

The operator did not personally execute a later worker retry, so the worker must not write new side effects as that operator.

## Required Data-Model Changes

The implementation design must inventory every fake-user reference before finalizing the migration. Current known affected locations include:

| Area | Current fake-user dependency | Target direction |
| --- | --- | --- |
| `audit_events` | `actor_user_id NOT NULL` FK and `actor_email NOT NULL` | Apply the actor-shape contract above |
| `knowledge_cards.created_by_user_id` | Required user FK; ingestion writes `system-knowledge-pipeline` | Preserve real human author/provenance separately; add explicit creator/executor actor fields or define a generic created-by actor shape, then backfill system cards |
| `knowledge_source_suggestions.created_by_user_id` | Required user FK | Same classification and migration as automated suggestions; do not attach system output to a person |
| `ai_usage_events.user_id` | Pipeline records usage under fake user | Replace with nullable real initiating user plus explicit actor/executor fields, or rename to `initiated_by_user_id` and add system executor fields |
| `knowledge_recommendations.resolved_by_user_id` | Pipeline supersedes stale recommendations under fake user | Model a system resolution actor explicitly; retain real reviewer IDs for human resolutions |
| `trip_plan_change_history` | Already supports a null user and system class | Retain this pattern; align naming/validation with `AuditActor` where practical |
| Facebook capture APIs | `FACEBOOK_CAPTURE_SYSTEM_ACTOR` has a fake `userId` | Replace with system `AuditActor` |
| Extraction worker | Reuses enqueueing user as executor actor | Retain requester provenance on the job; emit worker side effects as `system:knowledge-extraction` |

The implementation must search for all `system-*-` constants, `@xuyenviet.invalid` system emails, and references to the reserved IDs in migrations, tests, seed scripts, reports, and runtime code. No system user may remain merely because it is outside the initially identified worker set.

## Migration And Rollout Plan

Use an expand-migrate-contract rollout. Do not delete a reserved user before all dependent rows and constraints are migrated.

1. **Inventory and freeze scope.** Produce a query-backed count of every row referencing each reserved ID and every code/test/seed dependency. Confirm whether any real deployment has unexpected user-role, session, account, or ownership data tied to these IDs. Block on unexpected data rather than silently deleting it.
2. **Expand schema.** Add nullable actor/executor fields and check constraints in a backward-compatible state. Update relevant tables according to their semantic classification above. Add indexes supporting audit views by `(actor_class, actor_system, created_at)`.
3. **Introduce `AuditActor`.** Update `recordAuditEvent` and all actor-taking domain APIs to accept the union. Add one conversion at authenticated request boundaries from session to `UserAuditActor`; worker entrypoints construct a `SystemAuditActor` directly.
4. **Migrate writes.** Change ingestion, extraction, trip expiry, Facebook capture, recommendations, and AI usage to write explicit system actors. Preserve job requester/submitting-user fields as provenance only.
5. **Backfill historical data transactionally.** For each reserved user ID, update dependent rows to the matching `actor_class = system`, `actor_system`, null user/email values, and any newly introduced system actor fields. Preserve original timestamps, targets, summaries, job ownership, and real-user provenance. Record a migration report with per-table row counts and checksums or stable IDs for verification.
6. **Validate.** Assert no row still references a reserved ID; assert all audit records satisfy their actor shape; run targeted worker and audit tests; query historical audit views for each system executor and real user.
7. **Remove data-seeding and reservation logic.** Remove migrations or runtime bootstrapping that create reserved user rows only where migration history permits. Do not edit historical applied migrations; add a forward migration that removes their records after all FK references are gone. Remove fake user entries from `scripts/db-seed.ts`, test setup, and fixtures. Retain real fixture users such as `seed-fixture-operator-user` and `seed-traveler-user` because they intentionally represent people.
8. **Contract schema.** Make the new actor shape mandatory, remove obsolete fake-user-only columns or requirements, and delete the reserved `users` rows in the same release or a verified follow-up migration.

## Backfill Mapping

| Historical fake user | Target system actor |
| --- | --- |
| `system-knowledge-pipeline` | `knowledge-ingestion` |
| `system-trip-planning` | `trip-proposal-expiry` |
| `system-facebook-capture` | `facebook-capture` |
| `system-youtube-capture` | Remove as seed-only fixture unless a runtime reference is discovered; if historical system records exist, use `youtube-capture` |

Do not infer a human initiator from a fake system user. Where a job already stores `created_by_user_id`/`created_by_email`, preserve it as request provenance. Where no human initiator exists, leave initiator null rather than fabricating one.

## Compatibility And Operational Rules

- `users` must never be used as a polymorphic actor registry.
- A system actor cannot receive `user_roles`, an OAuth account, a session, a referral, ownership, or an admin privilege.
- Public and administrative user lists, metrics, and role counts must naturally exclude system executors because there will be no system rows in `users`.
- Audit reads must render system labels from a server-owned catalog, never a user-supplied string.
- Audit APIs must reject invalid actor shapes before database writes.
- Worker identity (`workerId`, container ID, deployment revision) is observability metadata. It does not grant authorization and should be bounded/redacted according to operational logging policy.
- Database deletion is guarded: the forward migration must fail if any FK reference to a reserved ID remains.

## Acceptance Criteria

1. No row representing `system-knowledge-pipeline`, `system-trip-planning`, `system-facebook-capture`, or `system-youtube-capture` exists in `users` after the migration.
2. No migration, startup routine, worker, or seed script creates a non-human `users` row for audit purposes.
3. Every audit event has exactly one valid actor shape: a real user actor or a system actor.
4. A system audit event has `actor_user_id IS NULL`, no person email snapshot, and a cataloged `actor_system` value.
5. A user audit event retains its real-user FK and email snapshot.
6. Canonical ingestion-created knowledge artifacts, recommendation supersessions, and AI usage are attributed to an explicit system executor, not a `users` row.
7. Knowledge extraction records the submitting user as requester/provenance while worker-created artifacts and status transitions identify the extraction system actor.
8. Trip-proposal expiry and Facebook capture write system audit actors without user records.
9. Historical audit records remain readable and retain their original timestamps, targets, summaries, and operational meaning.
10. `db:seed` retains only real-person fixtures; it creates no system identities.
11. Migration verification demonstrates zero remaining foreign-key references to every removed reserved ID before deletion.
12. Authorization tests prove a system actor cannot be used as an authenticated session or obtain user roles.

## Verification Plan

- Unit-test `AuditActor` validation and conversion from authenticated sessions.
- Database-test every allowed and rejected audit actor shape.
- Add regression tests for ingestion, extraction, recommendation, AI usage, trip expiry, and Facebook capture asserting system actor fields and absence of fake-user setup.
- Run a migration fixture containing historical rows for all three deployed reserved identities and verify both backfill correctness and guarded deletion.
- Run `db:seed` against an empty local database and assert that no user ID starts with `system-`.
- Run repository search checks for reserved IDs and invalid-domain system emails, allowing only documented historical migration/backfill references until those are archived as appropriate.

## Risks And Decisions To Resolve During Architecture

| Risk / open decision | Required resolution |
| --- | --- |
| Multiple tables use `*_user_id` for different meanings | Complete semantic inventory before selecting common columns; do not mechanically make all user IDs nullable |
| Immutable historical migrations cannot be removed safely | Add forward migrations; retain historical files as history but ensure fresh databases do not end with fake users |
| Existing deployed data could contain unexpected references | Require preflight counts and fail closed before deletion |
| `ai_usage_events` may need both billable initiator and executor | Define reporting semantics explicitly: request initiator versus system executor |
| Audit actor catalog evolution | Centralize catalog and label mapping; version/add entries through code review |
| Capture commands may run under a human-operated browser session | Separate browser/session provenance from database audit executor; the database actor remains a system command unless a user explicitly approves a command action |

## Recommended Follow-Up

Run `bmad-architecture` to turn this proposal into the authoritative schema and migration design, then create an implementation epic. This is cross-cutting data-model work and should not be executed as an unscoped worker-only refactor.
