# Proposal: Eliminate Fake System Users With Audit Actors

**Status:** Architecture ratified - implementation not started

**Development data policy:** The database is reset daily during active development. This change is a clean break: no historical fake-user rows need backfill or compatibility preservation. Reassess the rollout before applying to any environment with durable customer or operational data.

**Architecture record:** `architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md` AD-31 is the authoritative implementation contract. This proposal remains the problem statement and migration rationale.

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
- A clean development database has correct audit and provenance semantics after reset and reseed.
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
  system: SystemAuditActorId;
  workerId?: string;
};

type AuditActor = UserAuditActor | SystemAuditActor;
```

The runtime actor is an audit/execution identity, not an authentication session. `AuthenticatedSession` can be converted to a `UserAuditActor`, but must not be the only actor type accepted by audit APIs. The authoritative catalog and persistence rules are Architecture Decision AD-31.

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
| `system-ai-orchestration` | Synchronous authenticated model calls |
| `system-knowledge-pipeline` | Canonical ingestion, legacy extraction, and indexing workers |
| `system-trip-planning` | Trip Change Proposal expiry worker |
| `system-facebook-capture` | Unattended Facebook capture command |
| `system-youtube-capture` | Approved YouTube capture command; never a seed user |

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

Use a clean-break schema rollout while the database remains disposable. Update/remove reserved-user migrations, seed fixtures, test helpers, and actor APIs together, then reset and reseed the database. If durable data exists before implementation, stop and replace this section with an expand-migrate-contract plan.

1. **Inventory scope.** Search code, tests, seeds, and migrations for reserved IDs, invalid-domain system emails, and all user-or-system fields. Classify each field by human provenance versus automated execution.
2. **Replace schema and APIs.** Introduce the `AuditActor` union, actor-shape checks, executor fields, and typed audit/usage writers. Remove fake-user-only FKs and requirements in the same schema change.
3. **Migrate writes.** Change ingestion, extraction, indexing, trip expiry, Facebook/YouTube capture, recommendations, and AI usage to write explicit cataloged system actors. Preserve only real requester/submitting-user fields as provenance.
4. **Remove reservation and seed logic.** Remove reserved-user migrations, fake fixture rows, test helpers, and runtime identity checks. Keep person fixtures such as `seed-fixture-operator-user` and `seed-traveler-user`.
5. **Reset and validate.** Recreate the database, run `db:seed`, assert no system user exists, assert every actor shape is valid, and run targeted worker/audit tests.

## Backfill Mapping

| Historical fake user | Target system actor |
| --- | --- |
| `system-knowledge-pipeline` | `system-knowledge-pipeline` |
| `system-trip-planning` | `system-trip-planning` |
| `system-facebook-capture` | `system-facebook-capture` |
| `system-youtube-capture` | `system-youtube-capture` |

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

1. No row representing `system-knowledge-pipeline`, `system-trip-planning`, `system-facebook-capture`, or `system-youtube-capture` exists in `users` after database reset and seed.
2. No migration, startup routine, worker, or seed script creates a non-human `users` row for audit purposes.
3. Every audit event has exactly one valid actor shape: a real user actor or a system actor.
4. A system audit event has `actor_user_id IS NULL`, no person email snapshot, and a cataloged `actor_system` value.
5. A user audit event retains its real-user FK and email snapshot.
6. Canonical ingestion-created knowledge artifacts, recommendation supersessions, and AI usage are attributed to an explicit system executor, not a `users` row.
7. Knowledge extraction records the submitting user as requester/provenance while worker-created artifacts and status transitions identify the extraction system actor.
8. Trip-proposal expiry and Facebook capture write system audit actors without user records.
9. A newly seeded database records correct actor/provenance semantics for user and system activity.
10. `db:seed` retains only real-person fixtures; it creates no system identities.
11. Repository verification demonstrates no remaining fake-user creation or reference path outside documented migration-history deletion, if any.
12. Authorization tests prove a system actor cannot be used as an authenticated session or obtain user roles.

## Verification Plan

- Unit-test `AuditActor` validation and conversion from authenticated sessions.
- Database-test every allowed and rejected audit actor shape.
- Add regression tests for ingestion, extraction, recommendation, AI usage, trip expiry, and Facebook capture asserting system actor fields and absence of fake-user setup.
- Run `db:seed` against an empty local database and assert that no user ID starts with `system-`.
- Run repository search checks for reserved IDs and invalid-domain system emails; allow only system catalog constants and documentation, never fake `users` inserts or session-shaped worker identities.

## Risks And Decisions To Resolve During Architecture

| Risk / open decision | Required resolution |
| --- | --- |
| Multiple tables use `*_user_id` for different meanings | Complete semantic inventory before selecting common columns; do not mechanically make all user IDs nullable |
| Durable data is introduced before implementation | Stop clean-break work and replace it with a forward migration/backfill design before deployment |
| `ai_usage_events` may need both billable initiator and executor | Define reporting semantics explicitly: request initiator versus system executor |
| Audit actor catalog evolution | Centralize catalog and label mapping; version/add entries through code review |
| Capture commands may run under a human-operated browser session | Separate browser/session provenance from database audit executor; the database actor remains a system command unless a user explicitly approves a command action |

## Recommended Follow-Up

Create a dedicated implementation epic from Architecture Decision AD-31. This is cross-cutting data-model work and must not be executed as an unscoped worker-only refactor.
