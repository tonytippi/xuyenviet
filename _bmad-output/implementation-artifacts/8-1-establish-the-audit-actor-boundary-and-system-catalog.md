---
baseline_commit: 555fba8a56a3d53a37c82f060fd2799b5b9ab96c
---

# Story 8.1: Establish the Audit Actor Boundary and System Catalog

Status: review

## Story

As a product operator,
I want one validated actor boundary for human and automated actions,
so that all protected writes identify the correct kind of actor without treating a system as a user.

## Acceptance Criteria

1. **Authenticated request and worker construction**
   - Given an authenticated request or a worker entrypoint needs to record an actor,
   - When it constructs an `AuditActor`,
   - Then an authenticated request converts only to a user actor with a real `users.id` and immutable, nonblank email snapshot, while a worker constructs a system actor directly.
   - And no worker requires an authenticated session, fake login, OAuth account, or user role.

2. **Closed system catalog and server-owned labels**
   - Given a system actor is requested,
   - When its ID is validated or rendered for an audit read model,
   - Then it is exactly one server-owned catalog entry from `system-ai-orchestration`, `system-knowledge-pipeline`, `system-trip-planning`, `system-facebook-capture`, or `system-youtube-capture`.
   - And labels come from catalog metadata rather than user input, while `system-youtube-capture` is not created by seed data.

3. **Fail-closed shared boundary**
   - Given an actor payload has a missing or blank email, an arbitrary system ID, or mixed user and system fields,
   - When an Audit-owned API validates it,
   - Then validation rejects the payload before any database write.
   - And feature modules consume the exported typed boundary rather than defining incompatible actor shapes.

## Tasks / Subtasks

- [x] Create an Audit-owned actor module (AC: 1, 2, 3)
  - [x] Add a discriminated `AuditActor` union with explicit `user` and `system` variants.
  - [x] Export the closed `SystemAuditActorId` type and immutable server-owned catalog for exactly the five AD-31 IDs.
  - [x] Export narrow constructors/validators for user actors, system actors, and safe system-label lookup.
  - [x] Reject blank identifiers/emails, unknown IDs, and mixed actor fields before any writer is invoked.
  - [x] Keep labels separate from identity; callers never supply labels.
- [x] Route the Audit event API through the typed boundary (AC: 1, 3)
  - [x] Change `AuditEventInput.actor` from `AuthenticatedSession` to the Audit-owned `UserAuditActor`, not the full `AuditActor` union in this story. `AuditActor` remains the construction/validation boundary; `recordAuditEvent` must reject any runtime value that is not a valid user actor before invoking its writer. Story 8.2 widens the persistence writer atomically with the user-or-system XOR schema contract.
  - [x] Remove optional caller-controlled `actorClass` and `actorSystem` input fields that permit contradictory actor payloads.
  - [x] Convert every current authenticated `recordAuditEvent` caller to `toUserAuditActor(session)` before the call. Initial inventory: all three wrappers in `src/server/mutations.ts`; `src/features/chat-trips/conversations.ts`; `src/features/chat-trips/context-extraction.ts`; `src/features/chat-trips/trip-projects.ts`; `src/features/chat-trips/trip-change-proposals.ts` for its authenticated draft, apply, and dismiss audit events; `src/features/knowledge/batch-intake.ts`; `src/features/knowledge/extraction.ts`; `src/features/knowledge/review.ts`; and `src/features/knowledge/suggestions.ts`. Confirm with a repository search that no session-shaped actor remains at a `recordAuditEvent` call.
  - [x] Do not migrate existing fake-system event/history callers to a new system persistence path in this story. For the existing `expireTripChangeProposal` audit call in `src/features/chat-trips/trip-change-proposals.ts`, retain its current legacy user-row persistence behavior through a validated `UserAuditActor` compatibility conversion only; do not pass a `kind: "system"` actor, `actorClass`, or `actorSystem` to `recordAuditEvent`. Story 8.2 widens persistence atomically, and Story 8.4 replaces this legacy expiry attribution with `system-trip-planning`.
  - [x] Preserve `normalizeAuditSummary`, the 2,000-character summary cap, and injectable transaction writer behavior.
  - [x] Do not change the current `audit_events` persistence shape or migration in this story; Story 8.2 owns XOR persistence and system-row writes.
- [x] Convert authenticated mutation wrappers at the request boundary (AC: 1, 3)
  - [x] Convert an already authenticated `AuthenticatedSession` to a user actor through the Audit-owned API immediately before recording the audit event.
  - [x] Preserve existing authentication, admin authorization, exact-admin advisory lock/revalidation, and action-plus-audit transaction atomicity.
  - [x] Keep `AuthenticatedSession` an auth/authorization type, not a polymorphic actor or worker identity.
- [x] Render existing audit actor read models from the server-owned catalog (AC: 2)
  - [x] Update `formatPlanHistoryRow` in `src/features/chat-trips/trip-change-proposals.ts` to resolve a system row's label through the Audit-owned lookup using `row.actorSystem`; never promote an absent, unknown, or raw system string to a display label.
  - [x] Keep this as read-model-only adoption. It does not migrate expiry writes or `trip_plan_change_history` persistence, which remain Stories 8.2 and 8.4.
- [x] Add focused actor-boundary coverage (AC: 1, 2, 3)
  - [x] Cover valid conversion from a complete authenticated session, including preservation of its email snapshot.
  - [x] Cover direct construction of every cataloged system actor without auth/session access.
  - [x] Cover server-owned label lookup and rejection of unknown/blank system IDs.
  - [x] Cover rejection of blank/missing user email and malformed/mixed user-system payloads before a database writer can run.
  - [x] Retain existing audited-mutation transaction tests: unauthenticated failure precedes action execution; action/audit commit together; either failure rolls the transaction back.

### Review Findings

- [x] [Review][Patch] Runtime audit metadata can override the authenticated actor [`src/server/mutations.ts:52`] Fixed all three wrappers by spreading metadata before the server-constructed actor; authenticated identity is now authoritative even for untyped/cast metadata.
- [x] [Review][Patch] Session conversion accepts mixed user/system runtime values [`src/features/audit/actors.ts:55`] Fixed `toUserAuditActor` to require exactly the `userId` and `email` runtime keys; direct regression coverage rejects a payload with `system`.
- [x] [Review][Patch] Exact-admin revalidation test never reaches the transaction-time check [`tests/audit-mutation.test.ts:137`] Replaced the pre-transaction-only fixture with an initially exact-admin user whose admin role is removed immediately before the transactional recheck; the test asserts no action or audit write runs.

## Dev Notes

### Story Boundary

- This story establishes the reusable Audit domain boundary only. It is the prerequisite for every later Epic 8 story.
- Do not add or alter database actor-shape checks, make `audit_events` system-write capable, migrate `trip_plan_change_history`, migrate `ai_usage_events`, or add executor columns. Those changes are Story 8.2.
- Do not migrate knowledge ingestion, indexing, recommendations, capture commands, synchronous AI work, or worker callers. Those changes are Story 8.3.
- Do not migrate Trip Proposal expiry/history callers. That is Story 8.4.
- Do not remove fake-user migrations, seed records, helpers, fixtures, or runtime paths. That clean-break work is Story 8.5, after replacement persistence paths exist.
- Do not add a compatibility/backfill rollout. The architecture permits a reset/reseed clean break only while the target data is disposable; if durable customer or production data exists before rollout, stop and redesign as expand-migrate-contract.

### Required Domain Contract

- Audit owns the union, catalog, validation, session conversion, label metadata, and typed write helpers. Feature modules must import this boundary rather than declare lookalike actor objects.
- Model a user actor with `kind: "user"`, a real `userId`, and nonblank immutable email snapshot. The email is an event-time snapshot, not a label to be resolved later.
- Model a system actor with `kind: "system"` and exactly one `system` ID from the catalog. It has no user ID and no person email.
- The catalog must contain exactly these execution-class IDs:
  - `system-ai-orchestration`
  - `system-knowledge-pipeline`
  - `system-trip-planning`
  - `system-facebook-capture`
  - `system-youtube-capture`
- Catalog IDs are stable execution identities, not display text. Resolve audit-read labels from server-owned metadata only; never trust a label supplied by a request, CLI option, worker configuration, or database payload.
- Keep the catalog module-private and runtime-frozen, or export only a frozen readonly catalog plus narrow constructors and lookup functions. Never export a mutable label map whose contents can be changed through JavaScript or an unsafe cast.
- `system-youtube-capture` belongs in the catalog even though seed creation is prohibited. Do not modify seed behavior in this story; explicitly retain the constraint for Story 8.5.
- A worker constructs a system actor from the Audit boundary directly. It never obtains or fabricates an `AuthenticatedSession`, OAuth account, user role, referral, ownership record, or authorization principal.
- Reject invalid input fail-closed before calling any database writer. A discriminated union prevents normal TypeScript callers from mixing fields, but runtime validators/constructors still must reject untyped, deserialized, or cast payloads with blank email, unknown system ID, or user/system field mixing.

### Existing Code And Required Changes

- Create `src/features/audit/actors.ts` (or an equivalently focused Audit-owned module) for the shared types, catalog, constructors/validators, session conversion, and label lookup. Keep it server-only because it defines protected audit identity behavior.
- Update `src/features/audit/events.ts`.
  - Today `AuditEventInput.actor` is `AuthenticatedSession` and optional `actorClass`/`actorSystem` fields allow a contradictory fake-system event while the writer always persists `actor.userId` and `actor.email`.
  - Replace the public actor input with the Audit-owned validated `UserAuditActor` and remove caller-controlled class/system overrides. Do not widen this pre-XOR writer to `AuditActor`: a valid system actor is constructible and label-resolvable in Story 8.1, but it is not persistable until Story 8.2.
  - Validate the runtime actor shape before calling `AuditEventWriter.insert`; a malformed, mixed, blank, or system-shaped payload must fail with a safe operational error and make no insert attempt.
  - Preserve `AuditEventWriter` injection so callers can pass the mutation transaction, and preserve `normalizeAuditSummary` truncation behavior.
  - Current schema requires a user ID/email, so avoid implementing a system persistence branch until Story 8.2 changes schema and writer atomically. The type boundary must not falsely claim that system events can now persist or break existing deferred worker paths.
- Update `src/server/mutations.ts`.
  - Convert the authenticated session to a user actor at the audited request boundary before calling `recordAuditEvent`.
  - Preserve all error timing and transactional behavior, including exact-admin `pg_advisory_xact_lock(727556452)` and re-check of the current admin role inside the transaction.
- Keep `src/server/auth.ts` focused on authentication and authorization. `AuthenticatedSession` remains `{ userId, email }`; do not add a system-session variant or allow systems through admin-role helpers.

### Existing Patterns To Preserve

- `src/features/audit/events.ts` owns protected audit recording and caps before/after summaries at 2,000 characters. Preserve both the writer injection and safe summary normalization.
- `src/server/mutations.ts` records the audit event in the same database transaction as the protected mutation. An audit insert failure must still roll back the action, and an action failure must write no audit row.
- `src/server/auth.ts` fails closed: missing user ID/email or Auth.js failure returns `null`. Preserve this behavior and make session-to-user-actor conversion reject whitespace-only IDs/emails even if an upstream caller constructs a malformed session object.
- User ownership/requester/submitter/reviewer/approver/referral/session/conversation fields remain genuine user FKs. This story must not make them polymorphic.
- System actors cannot authenticate, receive roles, own resources, receive referrals, or obtain authorization privileges. Do not modify `userRoles`, Auth.js, or role checks to accommodate a system actor.

### Known Future Consumers, Not This Story's Migration Scope

- `src/features/knowledge/ingestion-pipeline.ts` and `src/features/knowledge/recommendations.ts` currently use fake `system-knowledge-pipeline` session-shaped identities and direct writes. Story 8.3 migrates them after Story 8.2 provides valid persistence.
- `src/features/chat-trips/trip-change-proposals.ts` currently carries a fake `system-trip-planning` audit actor for automated expiry. Story 8.4 owns this migration.
- `src/features/knowledge/facebook-capture.ts`, `src/features/knowledge/youtube-capture.ts`, `scripts/facebook-capture.ts`, and `scripts/youtube-capture.ts` have incompatible fake/session-shaped capture identities. Story 8.3 owns their executor migration.
- `src/features/usage/events.ts` changes with the `ai_usage_events` typed writer in Story 8.2, then its callers migrate in Story 8.3.
- `drizzle/migrations/0044_system_knowledge_pipeline_actor.sql`, `0064_system_trip_planning_actor.sql`, `0065_system_facebook_capture_actor.sql`, `scripts/db-seed.ts`, and related fake-user tests remain intact until Story 8.5. Partial removal now would break existing non-null user FKs and writers.

### Testing Requirements

- Use the established Vitest convention: mock Auth.js before importing modules that consume it, then dynamically import the target module after mocks are configured.
- Extend `tests/audit-mutation.test.ts` when practical, or add a focused Audit actor-boundary test file if it improves isolation. Test the Audit-owned constructors/validators directly without requiring a live database for invalid shapes.
- Preserve the current database-backed mutation tests using `testDb` and real person fixtures. System actor construction tests must prove no session lookup, role lookup, user fixture, or fake user row is required.
- Assert failure before side effects: use a writer spy/stub or database-row count to prove malformed actor input reaches no insert.
- Include each catalog value in direct-construction coverage and assert `system-youtube-capture` is included as a valid catalog ID.
- Assert catalog storage is runtime-immutable and contains exactly the five required IDs; catalog labels must not be mutable through an exported object.
- Add an `AuditEventWriter` spy test proving a system-shaped or otherwise invalid runtime payload is rejected before `insert`, while retaining direct catalog construction and label lookup coverage without persistence.
- Add regression coverage for every authenticated `recordAuditEvent` call site, including the proposal draft, apply, and dismiss calls, or a typecheck/repository completion check proving no session-shaped actor remains. Prove the deferred expiry path still commits its existing legacy user audit row through the compatibility conversion while direct system-shaped input to `recordAuditEvent` is rejected before `insert`.
- Extend `tests/audit-mutation.test.ts` for `runAuditedExactAdminMutation`: verify an exact admin commits action plus audit atomically, and a failed transaction-time exact-admin recheck invokes neither the action nor an audit write. Preserve the advisory lock `pg_advisory_xact_lock(727556452)` and the established Auth.js-mock-before-dynamic-import convention.
- Extend the plan-history read-model test to assert a `system-trip-planning` row renders the Audit catalog label, not the generic `"Hệ thống"` fallback or the raw system ID; unknown/absent system values must not become a trusted label.
- Do not replace or delete legacy fake-user migration, capture, ingestion, or proposal-expiry tests. Their migration belongs to later stories.
- Implementation verification baseline: `pnpm test:run` for relevant tests, `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Run `pnpm db:generate` only if a later scoped schema change occurs; Story 8.1 should not require a migration.

### Library And Framework Requirements

- Stay within the existing Next.js 15.3.5, React 19.1.0, TypeScript 5.8.3 strict, Drizzle 0.44.5, and Vitest 4.1.10 stack. No new dependency is needed.
- Use `server-only` for Audit actor code and maintain `@/*` aliases for app imports.
- Keep strict TypeScript: no `any`, unchecked casts, broad string system-ID types, or runtime bypass that lets an arbitrary system ID reach a writer.
- Do not introduce schema tables, migrations, worker authentication, or role model changes in this story.

### Project Structure Notes

- Keep audit ownership in `src/features/audit/`; do not place the actor union in generic `src/server/` because AD-31 explicitly assigns its ownership to Audit.
- Keep auth/session mechanics in `src/server/auth.ts` and mutation transaction orchestration in `src/server/mutations.ts`; consume the Audit-owned conversion instead of reversing those ownership boundaries.
- Keep test files under `tests/` and reuse `tests/helpers/db.ts` for the existing database-backed contract tests.
- This is backend/domain work; it adds no traveler or admin surface. Existing read models may render only server-owned labels and safe structured effects, actor, and timestamp. Never expose raw provider output, raw capture text, or execution secrets.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-8-Story-8.1]
- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.2-through-Story-8.6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-31-Audit-And-Automated-Execution-Use-First-Class-Actors]
- [Source: _bmad-output/planning-artifacts/proposal-eliminate-fake-system-users-with-audit-actors.md#Proposed-Domain-Model]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-26.md#Source-Authority]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-26.md#Dependency-Review]
- [Source: _bmad-output/project-context.md#Technology-Stack--Versions]
- [Source: _bmad-output/project-context.md#Critical-Implementation-Rules]
- [Source: src/features/audit/events.ts]
- [Source: src/server/auth.ts]
- [Source: src/server/mutations.ts]
- [Source: tests/audit-mutation.test.ts]
- [Source: tests/auth-gate.test.ts]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- BMad create-story workflow activation resolved with no prepend/append steps and the project-context persistent fact loaded.
- Story context validation completed non-interactively against the installed create-story checklist. The guide includes the Epic 8 contract, architecture guardrails, current code behavior, scope boundaries, future-story exclusions, and focused test requirements.
- `pnpm test:run tests/audit-actors.test.ts tests/audit-mutation.test.ts tests/trip-change-proposals.test.ts` passed: 80 tests.
- `pnpm lint` passed with 3 pre-existing warnings in `tests/knowledge-search.test.ts`; `pnpm typecheck` and `pnpm build` passed.
- Full `pnpm test:run` has three unrelated pre-existing failures: two Facebook capture extraction action UI assertions and the AI model catalog exact-admin fixture. They do not involve this story's files or audit actor boundary.
- `pnpm test:run tests/audit-actors.test.ts tests/audit-mutation.test.ts` passed: 14 tests after the three review patches.
- `pnpm typecheck` passed after the review patches.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story is ready for development planning only. No application code, migrations, tests, commits, or later Epic 8 stories were started.
- Implemented the immutable Audit-owned user/system actor boundary and five-entry system catalog with fail-closed runtime validation and server-owned label lookup.
- Converted all current authenticated `recordAuditEvent` callers to `toUserAuditActor`, removed caller-controlled actor class/system event input, and retained expiry's validated legacy user-row compatibility path.
- Added focused actor boundary, event writer side-effect, exact-admin transaction, and plan-history catalog-label coverage. No migration or persistence-shape change was made.
- Fixed CR-8.1-01 through CR-8.1-03 only: authenticated audit actor precedence, mixed runtime session rejection, and transaction-time exact-admin revocation coverage. No later story work or code review was started.

### File List

- _bmad-output/implementation-artifacts/8-1-establish-the-audit-actor-boundary-and-system-catalog.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/features/audit/actors.ts
- src/features/audit/events.ts
- src/features/chat-trips/context-extraction.ts
- src/features/chat-trips/conversations.ts
- src/features/chat-trips/trip-change-proposals.ts
- src/features/chat-trips/trip-projects.ts
- src/features/knowledge/batch-intake.ts
- src/features/knowledge/extraction.ts
- src/features/knowledge/review.ts
- src/features/knowledge/suggestions.ts
- src/server/mutations.ts
- tests/audit-actors.test.ts
- tests/audit-mutation.test.ts
- tests/trip-change-proposals.test.ts

## Change Log

- 2026-07-26: Implemented the Audit actor boundary, caller conversions, catalog-backed plan-history labels, and focused regression coverage; status moved to review.
- 2026-07-26: Code review found three patch items in authenticated actor precedence, mixed runtime session conversion, and exact-admin transaction-time revalidation coverage; status moved to in-progress.
- 2026-07-27: Fixed CR-8.1-01 through CR-8.1-03; focused audit tests and TypeScript check passed; status moved to review. No commit created.
