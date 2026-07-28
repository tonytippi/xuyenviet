---
title: 'Govern initial administration and role changes'
type: 'feature'
created: '2026-07-28'
status: 'done'
baseline_revision: '45c5b752b835f96dffaee4e38ebcac0c3cddf2a4'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: '0a44713e2c783b900c4c2a3bb2e1702431db9ae6'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Roles can currently be granted through an Auth.js sign-in callback and a generic database script, while the authorized role writer is coupled to a Next server action. These paths can silently grant privilege and do not establish a single principal-based domain boundary.

**Approach:** Make Auth/Admin own transactional role governance through a principal-based command and add a one-shot, audited deployment bootstrap for an existing authenticated person. Remove every ordinary alternative role grant path while preserving referral attribution and the legacy Next action only as a thin adapter.

## Boundaries & Constraints

**Always:** Treat `user_roles` as the sole authorization authority. Commands manage only `operator` and `admin`; recheck a caller's live exact-admin membership in the transaction, lock role rows, preserve the final-admin invariant, update the target authorization version only for committed changes, and record the actor-correct typed audit event in that same transaction. Bootstrap normalizes `INITIAL_ADMIN_EMAIL`, requires an existing user with an Auth.js account, grants only `admin` when no admin exists, and uses `system-admin-bootstrap` solely as a cataloged system audit actor.

**Block If:** A required command cannot atomically preserve role mutation, authorization-version increment, and audit event; an existing real-user/Auth.js-account lookup cannot be expressed without creating identity data; or a supplied test database cannot run the required transactional integration coverage.

**Never:** Do not create an admin API, a user role column, a parallel principal/revocation system, a bootstrap user/account/session/operator role, `ADMIN_EMAIL` compatibility, generic direct promotion script, direct audit insert, or a new role grant path. Do not change the BMad story or sprint status.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Initial bootstrap | No admin; trimmed/case-varied configured email maps to an existing user with linked account | Transaction adds exactly `admin`, increments version, and writes a `system-admin-bootstrap` audit event | No error expected |
| Bootstrap refusal | Missing/unknown/unlinked configured email, pre-existing admin, or second invocation | No role, version, or audit mutation | Fail closed with safe operational error |
| Admin role change | Current exact-admin principal grants/revokes `operator` or `admin` | Live authority, target/role rows, version change, and user-actor audit commit atomically | No-op duplicate change has no version/audit change |
| Protected revoke | Revoking a final active admin or stale/non-admin caller | No affected role/version/audit state changes | Reject transaction |

</intent-contract>

## Code Map

- `src/features/admin/actions.ts` -- current server-action role behavior to reduce to form/session adaptation.
- `src/features/audit/actors.ts`, `src/features/audit/events.ts` -- typed user/system audit actor and transaction-safe audit boundary.
- `src/server/mutations.ts`, `src/server/auth.ts` -- existing exact-admin/session precedents; not the new domain API.
- `packages/contracts/src/index.ts` -- Story 9.1 `RequestPrincipal` shared type.
- `src/db/schema.ts`, `src/db/client.ts` -- users, Auth.js accounts, roles, and transaction owner.
- `src/auth.ts`, `scripts/db-promote-admin.ts`, `package.json` -- forbidden callback and promotion script to retire.
- `scripts/bootstrap-initial-admin.ts` -- new deployment-only bootstrap adapter.
- `tests/admin-roles.test.ts`, `tests/admin-user-management.test.ts`, `tests/auth-admin-email.test.ts`, `tests/audit-actors.test.ts`, `tests/api-request-principal.integration.test.ts` -- existing focused coverage to replace/extend.

## Tasks & Acceptance

**Execution:**
- [x] Shared Auth/Admin command module -- implement principal-based grant/revoke and capability-scoped bootstrap with explicit database/audit dependencies and one transactional boundary.
- [x] `src/features/admin/actions.ts` -- delegate role policy, locking, versioning, and auditing to the command; retain only Next form/session adaptation.
- [x] `src/features/audit/actors.ts` -- catalog `system-admin-bootstrap` as an execution audit actor, never a user or role.
- [x] `scripts/bootstrap-initial-admin.ts`, `package.json` -- add the one-shot `INITIAL_ADMIN_EMAIL` deployment command and replace `db:promote-admin`.
- [x] `src/auth.ts`, `scripts/db-promote-admin.ts` -- remove callback/environment role provisioning and generic direct promotion without affecting first-touch referrals.
- [x] Focused tests -- prove bootstrap outcomes, transactional role governance/rollback/concurrency, actor correctness, stale principals after a committed change, and no callback/environment/direct runtime bypass.

**Acceptance Criteria:**
- Given no active admin and a normalized configured email for an existing linked Auth.js user, when bootstrap runs, then it grants only admin, increments authorization version, records a system audit event, and makes all failure/repeat paths mutation-free.
- Given an authenticated administrator changes an operator/admin role, when the domain command commits, then it rechecks live exact-admin authority, locks affected roles, audits the actual actor, increments the target version atomically, and cannot remove the final admin.
- Given sign-in callbacks, environment matching, or ordinary direct database promotion are attempted, when repository and integration checks run, then they cannot grant roles and `user_roles` remains authoritative.

## Design Notes

The shared command is a server-side domain boundary, not an API surface. Its authenticated entrypoint accepts `RequestPrincipal`; the bootstrap entrypoint accepts only deployment-specific input and is intentionally incapable of generic role editing. PostgreSQL owners remain trusted deployment control-plane operators, so tests prevent repository/runtime bypasses rather than claiming to technically prevent DBA writes.

## Review Triage Log

### 2026-07-28 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5 (high 1, medium 3, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Revalidated the principal authorization version inside the governance transaction and rejected stale role-change callers.
  - `[medium] [patch]` Validated role operations at runtime, required one normalized bootstrap-email match, and made audit-recorder failure roll back the entire change.
  - `[medium] [patch]` Added deterministic advisory-lock contention coverage and retired the legacy `ADMIN_EMAIL` environment documentation.
  - `[low] [patch]` Locked the selected Auth.js account and synchronized the generated migration snapshot with the reserved bootstrap actor constraint.

## Auto Run Result

Summary: Added a single principal-based Auth/Admin role-governance command, a one-shot linked-user initial-admin bootstrap, typed bootstrap audit attribution, and removed callback/direct-promotion privilege grants.

Review: Two synchronous adversarial passes found five in-scope repairs, all applied. The final closing review was clean.

Verification: Focused governance suite passed (7 files, 67 tests); `pnpm db:generate`, `pnpm lint` (0 errors; four pre-existing warnings), `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.

Residual risk: PostgreSQL owners retain trusted deployment-control-plane ability to directly alter data; runtime/repository role grants now pass through the Auth/Admin command.

## Verification

**Commands:**
- `pnpm test:run -- tests/admin-user-management.test.ts tests/admin-roles.test.ts tests/auth-admin-email.test.ts tests/audit-actors.test.ts tests/audit-mutation.test.ts tests/api-request-principal.integration.test.ts` -- expected: serial database-backed governance, bootstrap, audit, and stale-principal cases pass.
- `pnpm lint` -- expected: no errors.
- `pnpm typecheck` -- expected: root and API/workspace checks pass.
- `pnpm build` -- expected: Next and API production builds pass.
- `git diff --check` -- expected: no whitespace errors.
