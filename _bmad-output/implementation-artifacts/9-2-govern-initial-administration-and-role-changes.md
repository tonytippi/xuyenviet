# Story 9.2: Govern Initial Administration and Role Changes

Status: ready-for-dev

## Story

As a deployment operator and administrator,
I want administration to be explicitly bootstrapped and role changes to be auditable,
so that environment configuration, callbacks, and direct data edits cannot silently grant privileges.

## Acceptance Criteria

1. Given no active administrator exists and `INITIAL_ADMIN_EMAIL` names an existing authenticated real user, when the one-shot deployment bootstrap runs, then it normalizes the email, grants only the `admin` role through the Auth/Admin command, increments that user's authorization version, and writes an audit event. It fails without mutation when an admin already exists, the user is absent, or the command runs again.
2. Given an authenticated administrator changes a user's `operator` or `admin` role, when the Auth/Admin domain command commits, then it locks the affected role rows, authorizes the caller, writes an actor-correct audit event, and increments the target user's authorization version in the same transaction. It rejects removal of the last active administrator.
3. Given sign-in callbacks, environment-email matching, or direct database mutation attempt to grant a role, when repository and integration checks run, then no such alternative grant path is available and `user_roles` remains the sole authorization authority.

## Tasks / Subtasks

- [ ] Establish the principal-based Auth/Admin domain command (AC: 1-2)
  - [ ] Extract role grant/revoke behavior from Next server-action ownership into a domain command accepting `RequestPrincipal` plus typed input.
  - [ ] Recheck the caller's live exact-admin authority inside the transaction.
  - [ ] Lock affected target role rows and active administrator rows as needed; preserve the final-admin protection under concurrent operations.
  - [ ] Grant/revoke only `operator` and `admin`, increment the target authorization version only for a committed role change, and record the actor-correct audit transition in the same transaction.
- [ ] Implement the one-shot initial-admin bootstrap (AC: 1)
  - [ ] Add a deployment command using `INITIAL_ADMIN_EMAIL`, normalized consistently with Auth.js email handling.
  - [ ] Find an existing real user with a linked Auth.js account by normalized email, fail closed when absent or when any admin already exists, and use the same transactional role-write boundary without requiring an admin `RequestPrincipal`.
  - [ ] Invoke the capability-scoped `system-admin-bootstrap` deployment context, grant `admin` only, increment authorization version, and record its system audit event. A repeat invocation must make no mutation.
- [ ] Retire all alternative privilege-grant paths (AC: 3)
  - [ ] Remove the `ADMIN_EMAIL` sign-in callback provisioner from `src/auth.ts` while preserving referral attribution for new users.
  - [ ] Remove or replace `scripts/db-promote-admin.ts` and `pnpm db:promote-admin` so no generic direct database promotion path remains.
  - [ ] Adapt temporary Next admin/server-action callers to the extracted command rather than retaining a second role writer.
  - [ ] Ensure request-serving code, migrations/seeds/test helpers, and repository scripts do not create roles through environment matching or a feature-level direct insert bypass. Treat isolated migration/DBA credentials as trusted deployment control plane only; document/audit any exceptional role repair rather than claiming database owners are technically prevented from writes.
- [ ] Verify role governance and token revocation behavior (AC: 1-3)
  - [ ] Cover bootstrap success, normalization, missing user, existing admin, and repeat execution with no mutation on failure.
  - [ ] Cover authorized/unauthorized grant and revoke, target-row locking/concurrent role changes, final-admin rejection, actor correctness, and transaction rollback.
  - [ ] Cover authorization-version increments and prove a previously minted principal becomes stale after a committed role change.
  - [ ] Replace obsolete callback-provisioning tests with repository/integration checks proving there is no callback, environment, or direct role-grant route.

## Dev Notes

### Implementation Guardrails

- Story 9.1 supplies `RequestPrincipal`, authorization-version schema, and safe error contract. Build on it; do not define a parallel principal, role version, or JWT revocation mechanism.
- Start only after Story 9.1 identity integration coverage verifies principal staleness after a committed authorization-version change.
- Auth/Admin owns role policy. The Next server action and future API controller are adapters only. They may parse/project input but may not implement separate authorization, transaction, audit, or role-write behavior.
- `user_roles` is the only authorization authority. Do not add a role column to `users`, trust a configured email after bootstrap, or make a JWT claim authoritative without Story 9.1 live-version validation.
- Audit must use the existing typed Audit boundary and a real authenticated user actor. Do not directly insert `audit_events`.
- The role change, version increment, and audit record must share one transaction. A failed audit or authorization check must roll back the role/version change.
- The initial bootstrap applies only to an existing real person with a linked Auth.js account. It must never create a user, OAuth identity, session, system user, or operator role as a shortcut. It uses the capability-scoped `system-admin-bootstrap` audit actor because no administrator exists yet; ordinary later role changes must retain the real admin caller actor.

### Existing Code to Preserve or Replace

- `src/features/admin/actions.ts` already has exact-admin role grant/revoke logic, locks all admin rows before final-admin revocation, and uses audited server mutations. Treat it as behavior reference, then extract/replace its role functions because it is a `"use server"` adapter and lacks authorization-version handling.
- `src/server/mutations.ts` demonstrates an exact-admin transaction lock and actor-correct audit insertion. Do not reuse it as the domain API because it accepts `AuthenticatedSession`; preserve it only for temporary adapters where appropriate.
- `src/auth.ts` currently calls `provisionConfiguredAdminRoles()` on every sign-in with `ADMIN_EMAIL`, granting both `admin` and `operator`. This is incompatible with the story and must be removed, while `captureFirstTouchReferralAttribution()` remains.
- `scripts/db-promote-admin.ts` and the `db:promote-admin` package script are legacy direct-grant paths to retire.
- Existing `users` system-executor exclusion and `user_roles` constraints remain mandatory. Never let a cataloged system executor authenticate or receive roles. `system-admin-bootstrap` is an execution actor only, not a user or database role.

### Suggested File Structure

- NEW extracted Auth/Admin command module under the shared domain package created by Story 9.1; keep its inputs principal-based and its DB/audit dependencies explicit.
- NEW/REPLACED `scripts/bootstrap-initial-admin.ts`: one-shot deployment adapter, not a reusable privileged data-edit tool.
- UPDATE `src/features/admin/actions.ts`: temporary Next form/action adapter to the domain command, with form parsing and presentation concerns only.
- UPDATE `src/auth.ts`, `package.json`, and remove/retire `scripts/db-promote-admin.ts` to eliminate the forbidden grants.
- UPDATE/add focused role/bootstrap tests beside existing `tests/admin-user-management.test.ts`, `tests/admin-roles.test.ts`, and `tests/auth-admin-email.test.ts`.

### Testing Requirements

- Run database-backed transactional tests serially when they share role/session fixtures.
- Assert database state and audit rows after every success/failure path, not only returned errors.
- Add a source-level regression that rejects direct role writes outside the Auth/Admin command only if it can be made robust without a brittle matcher; behavior-level integration tests remain required.
- Run targeted tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and relevant Story 9.1 principal-staleness coverage.

### Scope Boundaries

- Do not migrate the separate admin application or broad admin workflows. Epic 13 owns that deployment/capability cutover.
- Do not add an admin API surface unless required as the thin adapter for the extracted command; Story 9.4 owns the first selected protected read and shared OpenAPI contract proof.
- Do not retain backwards-compatible `ADMIN_EMAIL` or `db:promote-admin` behavior. The required security change is a clean replacement.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.2: Govern Initial Administration and Role Changes]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4: Identity Maps Into A Domain-Neutral Request Principal]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Domain Use Cases Own Mutations, Authorization, And Audit]
- [Source: src/features/admin/actions.ts#grantAdminUserRole and revokeAdminUserRole]
- [Source: src/server/mutations.ts#runAuditedExactAdminMutation]
- [Source: src/auth.ts#events.signIn and provisionConfiguredAdminRoles]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- 2026-07-28 repair: initial-admin lookup now applies the shared JavaScript Unicode normalization to stored user emails rather than comparing PostgreSQL `lower(email)` against a JavaScript-normalized configuration value. Added a dotted-I regression covering the previously divergent casing path. Focused `pnpm exec vitest run tests/auth-role-governance.test.ts` passed (15 tests).

### File List

- src/features/auth/role-governance.ts
- tests/auth-role-governance.test.ts
- _bmad-output/implementation-artifacts/9-2-govern-initial-administration-and-role-changes.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
