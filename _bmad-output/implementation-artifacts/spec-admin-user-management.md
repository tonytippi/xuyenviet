---
title: 'Admin User Management'
type: 'feature'
created: '2026-07-26'
status: 'done'
review_loop_iteration: 0
baseline_commit: '39b9ddd'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The admin console has no way to review registered users or manage their operational roles. Administrators currently need a database script to grant access, while the existing operator-inclusive admin guard would make a generic role-management page a privilege-escalation risk.

**Approach:** Add an exact-admin-only user-management route with a safe, paginated roster and narrow role grant/revoke controls. Keep the established operator/admin console access unchanged for all other operations, and audit each authorized role change.

## Boundaries & Constraints

**Always:** Use a server-only data boundary and authorization check for both roster reads and mutations; select only safe user profile and role fields, never account/session/provider-token data; preserve Vietnamese-first, responsive admin styling; record a safe before/after role delta in the existing audit transaction; require the actor to have the `admin` role exactly, not merely `operator`; validate target IDs and roles on the server; prevent revoking the final administrator or an administrator's own final admin role.

**Ask First:** Expanding user management beyond viewing users and granting/revoking existing `operator` and `admin` roles; deleting users, managing authentication providers, changing role definitions, or changing the configured `ADMIN_EMAIL` provisioning behavior.

**Never:** Change `hasAdminAccess` or `requireAdminSession` semantics for existing operator operations; expose credentials, sessions, or OAuth/provider data; accept a client-trusted replacement array of roles; allow operator access to the user roster or any role mutation; add database schema or migration changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| View roster | Authenticated actor has `admin`; optional trimmed search and page | Server-rendered, safe user projection with deterministic pagination and role badges | Invalid page falls back to page one; no matching users has an explicit empty state |
| Grant role | Exact admin submits a valid target and `operator` or `admin` role | Role is inserted idempotently, page refreshes, audit event records role delta | Unknown target or invalid role fails safely without an audit event |
| Revoke role | Exact admin revokes a valid target role while another administrator remains | Role is removed, page refreshes, audit event records role delta | Reject self-final-admin removal and any final-admin removal without mutation/audit |
| Unauthorized request | Unauthenticated, traveler, or operator directly invokes roster/action | No roster data or role change is returned/persisted | Exact-admin authorization error before mutation/audit side effects |

</frozen-after-approval>

## Code Map

- `src/server/auth.ts` -- existing authenticated session and operator-inclusive admin guard; add a separate exact-admin guard without changing current behavior.
- `src/server/mutations.ts` -- transaction and audit wrapper for protected writes; add an exact-admin counterpart.
- `src/db/schema.ts` -- `users`, additive `userRoles`, valid role union, and `auditEvents` persistence.
- `src/features/admin/actions.ts` -- existing audited admin actions; owns narrow user-role mutations.
- `src/features/admin/users.ts` -- new server-only, exact-admin roster read model.
- `src/app/admin/layout.tsx` -- central admin navigation; add a Users destination.
- `src/app/admin/users/page.tsx` -- new server-rendered search/pagination roster and role-control forms.
- `tests/admin-roles.test.ts` -- existing authorization and layout testing convention.
- `tests/ai-models.test.ts` -- audited mutation, denial-without-side-effects test convention.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/auth.ts` and `src/server/mutations.ts` -- add exact-admin authorization and audited mutation entrypoint while preserving the existing operator-inclusive operations guard.
- [x] `src/features/admin/users.ts` -- implement a server-only safe user roster with exact-admin authorization, case-insensitive name/email search, role aggregation, stable ordering, and bounded pagination.
- [x] `src/features/admin/actions.ts` -- add idempotent, exact-admin-only grant/revoke actions for `operator` and `admin`, including target validation, final-admin protections, and safe role-delta audit metadata.
- [x] `src/app/admin/layout.tsx` and `src/app/admin/users/page.tsx` -- add the navigation item and a responsive Vietnamese roster with search, pagination, role badges, and form-based management controls.
- [x] `tests/admin-user-management.test.ts` -- cover exact-admin success, operator/traveler/anonymous denial, invalid input, audit records, idempotency, final-admin protection, and safe roster fields.

**Acceptance Criteria:**
- Given a signed-in exact administrator, when they open `/admin/users`, then they can search and paginate a roster that exposes only name, email, avatar, verification state, and roles.
- Given a signed-in operator without `admin`, when they request `/admin/users` or invoke a role mutation, then access is denied before any user-role or audit data changes.
- Given an exact administrator, when they grant or revoke a permitted role for a valid target, then the result is persisted transactionally and a safe audit event identifies the role delta.
- Given a role-revocation request would leave no administrator, when it is submitted, then it is rejected with no persisted role or audit change.
- Given existing operator workflows, when this feature is deployed, then their authorization behavior remains operator-inclusive and unchanged.

## Design Notes

Role administration is stricter than the existing admin console: `operator` retains access to operational knowledge tools but cannot list users or change roles. The role actions are deltas rather than replacement payloads so hidden or future role data cannot be overwritten by a client request.

## Verification

**Commands:**
- `pnpm test:run -- tests/admin-user-management.test.ts tests/admin-roles.test.ts` -- expected: role-management and existing authorization tests pass.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm typecheck` -- expected: strict TypeScript passes.

## Suggested Review Order

**Role-management security**

- Separates exact administrators from operator-inclusive operational access.
  [`auth.ts:47`](../../../src/server/auth.ts#L47)

- Revalidates exact-admin access transactionally while serializing role changes.
  [`mutations.ts:68`](../../../src/server/mutations.ts#L68)

- Applies narrow, audited role deltas and preserves the final administrator.
  [`actions.ts:174`](../../../src/features/admin/actions.ts#L174)

**Safe roster and UI**

- Returns only safe profile fields, aggregated roles, and valid paginated results.
  [`users.ts:31`](../../../src/features/admin/users.ts#L31)

- Presents exact-admin-only search, role badges, and form-based role controls.
  [`page.tsx:12`](../../../src/app/admin/users/page.tsx#L12)

- Adds the management surface to the existing administration navigation.
  [`layout.tsx:11`](../../../src/app/admin/layout.tsx#L11)

**Verification**

- Exercises authorization, safe reads, idempotency, audit records, and final-admin protection.
  [`admin-user-management.test.ts:28`](../../../tests/admin-user-management.test.ts#L28)
