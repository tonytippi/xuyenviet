---
title: 'ADMIN_EMAIL auto role grant on login'
type: 'feature'
created: '2026-07-13'
status: 'done'
review_loop_iteration: 0
baseline_commit: '4b737fb2180333e0aa2dfcb9898a0422c172d1c3'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admin access currently requires a manual `pnpm db:promote-admin <email>` step after Google login. The requested `ADMIN_EMAIL` environment variable should let the configured admin account receive admin roles automatically when that email signs in.

**Approach:** Add login-time role provisioning in the Auth.js sign-in event: when the signed-in user's normalized email matches normalized `process.env.ADMIN_EMAIL`, insert `admin` and `operator` roles for that user id idempotently. Document the variable in `.env.example` and cover matching, non-matching, and repeated login behavior with tests.

## Boundaries & Constraints

**Always:** Keep authorization server-side. Normalize both configured and signed-in emails by trimming and lowercasing. Use `onConflictDoNothing` so repeated sign-ins are safe. Preserve existing first-touch referral attribution behavior for new users.

**Ask First:** Ask before supporting multiple admin emails, creating new roles, changing admin access semantics, or making the variable required in production launch checks.

**Never:** Do not grant roles without a persisted user id. Do not expose `ADMIN_EMAIL` to client code. Do not remove the existing manual `db:promote-admin` script.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Configured admin signs in | `ADMIN_EMAIL="Admin@Example.com"`, user email `admin@example.com`, user has id | `admin` and `operator` rows exist for that user | Duplicate rows are ignored on later logins |
| Different user signs in | `ADMIN_EMAIL` set to another email | No admin/operator roles are created | Existing sign-in behavior continues |
| Missing config or incomplete user | `ADMIN_EMAIL` blank, missing signed-in email, or missing user id | No roles are created | Existing sign-in behavior continues |

</frozen-after-approval>

## Code Map

- `src/auth.ts` -- Auth.js configuration, sign-in event, and existing referral capture hook.
- `src/db/schema.ts` -- `userRoles` table and `UserRole` values used for role insertion.
- `.env.example` -- Environment variable documentation for local and deployed setup.
- `tests/auth-admin-email.test.ts` -- New focused test file for login-time role provisioning.
- `tests/setup.ts` -- Provides deterministic env defaults and resets module state between tests.

## Tasks & Acceptance

**Execution:**
- [x] `src/auth.ts` -- Add a small server-side helper called from the existing `events.signIn` hook to provision `admin` and `operator` roles when `ADMIN_EMAIL` matches the signed-in user email.
- [x] `.env.example` -- Document optional `ADMIN_EMAIL` near Auth configuration without adding a real address.
- [x] `tests/auth-admin-email.test.ts` -- Add tests for normalized match, non-match, missing/incomplete data, idempotency, and preserving new-user referral capture.

**Acceptance Criteria:**
- Given `ADMIN_EMAIL` matches the signed-in user's email ignoring case and surrounding whitespace, when the user signs in with a persisted id, then the user has both `admin` and `operator` roles.
- Given the matching admin account signs in more than once, when roles already exist, then sign-in does not fail and does not create duplicate role rows.
- Given `ADMIN_EMAIL` is unset or does not match the signed-in email, when the user signs in, then no admin/operator role rows are created by this feature.
- Given an admin email match for a new user, when sign-in completes, then existing first-touch referral attribution behavior still runs.

## Spec Change Log

## Verification

**Commands:**
- `pnpm test:run tests/auth-admin-email.test.ts` -- expected: new focused auth role provisioning tests pass.
- `pnpm typecheck` -- expected: strict TypeScript compilation succeeds.

**Completion Notes:**
- Implemented login-time `ADMIN_EMAIL` role provisioning with normalized email comparison and idempotent `user_roles` inserts.
- Preserved the existing first-touch referral attribution call for new users before admin role provisioning.

## Suggested Review Order

**Login Provisioning**

- Start at the sign-in event where admin role provisioning is triggered.
  [`auth.ts:36`](../../src/auth.ts#L36)

- Review normalized matching and idempotent role insertion behavior.
  [`auth.ts:46`](../../src/auth.ts#L46)

**Configuration**

- Confirm `ADMIN_EMAIL` is documented as optional server-side configuration.
  [`.env.example:10`](../../.env.example#L10)

**Tests**

- Check focused coverage for matching, non-matching, incomplete, repeat, and referral paths.
  [`auth-admin-email.test.ts:55`](../../tests/auth-admin-email.test.ts#L55)
