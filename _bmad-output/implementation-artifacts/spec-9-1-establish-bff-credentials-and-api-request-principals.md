---
title: 'Establish BFF credentials and API request principals'
type: 'feature'
created: '2026-07-28'
status: 'done'
baseline_revision: '2d9228ed5b8e8d3480c8e23dc231b4d18cd20cff'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The root Next.js BFF currently has no private API identity handoff, and there is no Nest resource server able to reject invalid BFF credentials before domain code executes. Browser cookies and internal credentials must remain isolated from the API and browser respectively.

**Approach:** Add the smallest workspace foundation for framework-neutral contracts, validated issuer configuration, database-backed session/version validation, a root-only web BFF ES256 credential minter, and a Nest protected-route guard. Cover real BFF/API behavior with PostgreSQL-backed integration tests.

## Boundaries & Constraints

**Always:** Preserve root Next.js as the sole traveler BFF; retain Auth.js database sessions, Google sign-in, referrals, human-only users, user-role constraints, and audit constraints. Mint only ES256 credentials with `sub`, `sid`, sorted `roles`, `rv`, `jti`, `iss`, `aud`, `iat`, `nbf`, `exp`, and protected `kid`, for no more than 300 seconds. The BFF validates its host-only Auth.js session and matching database session token before minting. API validation requires exact issuer/audience, issuer-bound active or one in-overlap previous `kid`, valid clock claims, nonblank cryptographically generated `jti`, live matching session, and current authorization version. All API rejection paths use the bounded safe error envelope and stop before controller/use-case invocation.

**Block If:** The installed Auth.js version cannot expose or safely resolve the host-specific database-session cookie after validated server-session resolution; an implementation would need to guess a cookie name, accept a browser token, or reuse the web cookie for admin minting. Also block if a required migration cannot safely preserve existing `users`, `sessions`, `user_roles`, and audit constraints.

**Never:** Do not create `apps/web`, a worker, a public API/CORS policy, a protected product capability, an admin BFF, a replay ledger, an in-memory revocation substitute, or an API import of Next.js/Auth.js/root server-only modules. Do not serialize, log, return, or otherwise expose a credential, cookie, provider token, private signing key, SQL error, stack trace, or key/session-selection detail. Do not alter the story artifact or sprint status.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Web BFF credential | Valid host session, matching unexpired DB session, roles, current version | ES256 JWT has exact bounded claims, sorted roles, web issuer/audience, active `kid`, and <=300s lifetime | Credential stays server-only |
| Protected API success | Valid current web credential and matching DB state | Guard attaches normalized `RequestPrincipal`; protected controller executes once | No error expected |
| Invalid credential | Bad signature/issuer/audience/kid/clock/claims/jti or missing bearer | Controller/use case is never called | Safe error envelope only |
| Revoked/stale state | Missing, expired, mismatched session or changed authorization version | Principal is not created | Safe error envelope only |
| Rotation/isolation | Previous issuer key inside/outside overlap, cross-issuer/unknown key | Only configured issuer's active or in-window previous key validates | Reject safely without key detail |

</intent-contract>

## Code Map

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts` -- root workspace, quality scripts, and test configuration to extend without breaking Next.js.
- `src/auth.ts`, `src/server/auth.ts` -- current Auth.js database-session boundary that the BFF adapter must preserve.
- `src/db/schema.ts`, `src/db/client.ts`, `drizzle.config.ts`, `drizzle/migrations/` -- current single Drizzle schema/migration owner and persistence conventions.
- `tests/setup.ts`, `tests/global-setup.ts`, `tests/helpers/db.ts` -- serial PostgreSQL `DATABASE_URL_TEST` test harness.
- `apps/api/` -- new isolated Nest HTTP/resource-server runtime.
- `packages/contracts/`, `packages/config/`, `packages/database/` -- minimal framework-neutral shared seams for claims/errors, validated key configuration, and API database reads.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `pnpm-workspace.yaml`, root TypeScript/build configuration, `apps/api/package.json`, and `apps/api/tsconfig*.json` -- added Nest/JWT dependencies, a deployable API build/start path, workspace wiring, and API typechecking while preserving root Next scripts.
- [x] `packages/contracts/src/auth/*` and `packages/contracts/src/errors/*` -- defined domain-neutral internal credential claims, normalized `RequestPrincipal`, issuer/role types, and the shared safe API envelope without framework/request imports.
- [x] `packages/config/src/*` -- validated separate web/admin issuer configurations, active/previous ES256 keys, valid future overlap timestamps, and safe API JSON timestamp parsing.
- [x] `packages/database/src/*`, `src/db/schema.ts`, `drizzle/migrations/*`, and migration metadata -- extracted the API identity lookup and added non-null `users.authorizationVersion` through one forward migration/history.
- [x] `src/server/bff-session-token.ts`, `src/server/bff-credentials.ts`, and minimal `src/server/auth.ts` integration -- configured the host-only Auth.js session cookie, validated Auth.js/session binding, loaded sorted roles/version, and minted server-confined web credentials.
- [x] `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, and `apps/api/src/auth/*` -- added bearer-only Nest bootstrap, issuer-specific ES256 verification/rotation selection, database-backed checks, principal attachment, and safe pre-controller rejections.
- [x] `tests/bff-credentials.test.ts` and `tests/api-request-principal.integration.test.ts` -- added PostgreSQL-backed BFF and genuine Nest HTTP coverage for accepted/rejected credential, session, and rotation paths, including zero controller calls.
- [x] `package.json` scripts and affected configuration -- ran schema generation, targeted identity tests, lint, typecheck, build, and full-suite verification; recorded full-suite baseline failures below.

**Acceptance Criteria:**
- Given a validated root web-BFF Auth.js session and matching DB session, when the BFF calls its internal credential helper, then it produces a server-confined ES256 credential with the exact allowlisted claims, active `kid`, stable subject/session, sorted roles, current authorization version, and at most five-minute lifetime.
- Given a protected Nest route, when its guard receives a bearer credential, then it validates crypto, issuer/audience, bounded issuer-specific rotation, claims, session ownership/expiry, and authorization version before exposing only a domain-neutral principal to the controller.
- Given every invalid credential, session, version, issuer, or rotation state, when the protected route is requested, then the controller/use case is not invoked and the response is only a safe API error envelope with no sensitive values.
- Given the configured admin issuer, when API verification is configured but no admin BFF exists, then it remains isolated from web cookies and keys while active/previous keys are accepted only for their matching issuer during the configured overlap.

## Design Notes

The BFF/API split is deliberately asymmetric. Root `src/server/*` owns Auth.js/cookie resolution and private signing; Nest depends only on workspace packages plus a database seam. `sid` is the opaque Auth.js `sessions.sessionToken`, not the user ID. JWT roles are a snapshot bounded by `rv`; the database remains authoritative. The API may use a protected test controller only as integration infrastructure, not a migrated capability.

## Verification

**Commands:**
- `pnpm db:generate` -- expected: forward migration artifacts agree with the canonical schema, or record the known non-interactive prompt verbatim.
- `pnpm test:run -- tests/bff-credentials.test.ts tests/api-request-principal.integration.test.ts` -- expected: all BFF/API identity scenarios pass against `DATABASE_URL_TEST`.
- `pnpm test:run` -- expected: applicable full Vitest suite passes; unrelated baseline failures are reported precisely.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: root and API/workspace TypeScript checks pass.
- `pnpm build` -- expected: root Next and API production builds pass.

## Review Triage Log

### 2026-07-28 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5 (high 1, medium 3, low 1)
- defer: 1 (medium 1)
- reject: 1 (low 1)
- addressed_findings:
  - `[high] [patch]` Made the API workspace deployable with a bundled entrypoint, start command, direct dependencies, and no unresolved workspace runtime imports.
  - `[medium] [patch]` Rejected invalid/past previous-key overlap timestamps and parsed valid JSON timestamps at the API configuration boundary.
  - `[medium] [patch]` Made BFF minting validate the host-only Auth.js session and requested-user binding before cookie/database resolution.
  - `[medium] [patch]` Expanded Nest HTTP coverage for cryptographic, claim, clock, session, version, rotation, safe-envelope, and pre-controller isolation paths.
  - `[low] [patch]` Normalized duplicate `x-request-id` values to a generated bounded string.

## Auto Run Result

Summary: Added private BFF-to-API ES256 identity, issuer-isolated API verification, database session/version validation, safe errors, and the forward authorization-version migration.

Review: Five actionable findings repaired. Role-version mutation is deferred to Story 9.2, which owns role governance.

Verification: Targeted identity suite passed (11 tests); `pnpm db:generate`, `pnpm lint` (three pre-existing warnings), `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. Full `pnpm test:run` had 1,057 passing tests and seven unrelated baseline UI/auth failures.

Residual risk: Story 9.2 must increment `users.authorizationVersion` transactionally for role grants/revokes.
