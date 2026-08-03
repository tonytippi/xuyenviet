---
title: 'Establish NestJS Google OAuth, opaque browser sessions, and direct API admission'
type: 'feature'
created: '2026-08-03'
status: 'done'
baseline_revision: '99a9a322b744d67c0c36882dfc341f153442806a'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-14-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Traveler browser authentication is owned by Auth.js and protected NestJS APIs accept only BFF-minted JWTs. There is no Nest-owned Google OAuth flow, revocable opaque browser session, or safe direct cookie admission for the approved direct-API cutover.

**Approach:** Add a dedicated Nest browser-identity persistence and transport boundary for Google OAuth, hashed opaque sessions, session-bound CSRF, configured origin admission, and a transport-neutral request principal. Preserve the BFF credential path during this prerequisite story without accepting legacy Auth.js sessions.

## Boundaries & Constraints

**Always:** Use PostgreSQL/Drizzle-owned dedicated traveler browser-session and OAuth-transaction records, storing only a lookup hash for the opaque session value. OAuth state is one-time, short-lived, PKCE-bound, browser-bound by a separate host-only secure HttpOnly SameSite=Lax transaction-ID cookie, and atomically consumed only after that cookie matches parsed state; clear the transaction cookie on every callback outcome. Nest responses set or clear only secure HttpOnly browser-session or transaction-ID cookies and never serialize provider tokens, OAuth state/verifier, session values/IDs, CSRF secrets, BFF credentials, private signing material, or internal errors. Protected direct requests must validate the current session, expiry, revocation, current user roles, and authorization version before controller/domain execution; unsafe requests additionally require an exact allowed origin and session-bound CSRF proof. Renew 30-day sessions only below the seven-day threshold. Continue to emit existing safe envelopes and correlation IDs. Keep integration tests serial and use `DATABASE_URL_TEST` plus local `resetTestDatabase()` setup.

**Block If:** The intended browser callback/redirect or API origins cannot be represented as explicit configured allowlists; the target requires adoption of existing Auth.js sessions; or persistent database data makes the approved clean-break migration unsafe. Halt and record the concrete origin/data constraint rather than weaken admission or invent a migration path.

**Never:** Do not reuse `sessions` (Auth.js) or `admin_sessions`, accept a legacy Auth.js cookie, expose raw OAuth/session/CSRF material, put cookie parsing in a controller or domain use case, add a BFF credential to the browser, make credentialed CORS wildcarded, create a second domain writer, remove Auth.js/BFF routes, or migrate traveler/admin capability clients. Those cutovers belong to Stories 14.2-14.5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| OAuth success | Valid Google callback, matching initiating-browser transaction-ID cookie, live one-time transaction, allowlisted return target | Resolve/create real user/account, persist hashed opaque browser session and session CSRF binding, set secure HttpOnly session cookie, clear transaction cookie, redirect | No token/session/CSRF/provider data in response |
| OAuth replay/expired | Missing/mismatched, reused, malformed, or expired state/transaction | Clear transaction cookie; no account/session creation and no redirect to an untrusted target | Safe failure without callback internals |
| Protected browser read | Valid current opaque session cookie | Construct transport-neutral principal before controller; use current roles/version | Missing, expired, revoked, stale, malformed, legacy, or cross-origin session fails safely without controller execution |
| Unsafe browser request | Valid session plus exact origin and valid session-bound CSRF proof | Admit request with credentialed exact-origin CORS response | Missing/invalid origin or CSRF returns safe `forbidden`/`csrf_invalid`; no domain execution |
| Renewal/logout | Session has under seven days remaining, or owner logs out | Renewal produces a 30-day server expiry and refreshed cookie; logout revokes row and clears cookie | An exact-origin retry with the matching session-bound CSRF proof may clear only its stale logout cookie; stale sessions cannot regain generic protected admission |

</intent-contract>

## Code Map

- `packages/database/src/schema.ts` -- identity, account, Auth.js session, admin-session, role, and new direct-browser identity schema.
- `packages/database/src/index.ts` -- API identity repository and PostgreSQL implementations used by admission and OAuth flows.
- `drizzle/migrations/` -- generated/checked direct-browser identity migration, preserving the clean-break boundary.
- `packages/contracts/src/index.ts` -- `RequestPrincipal` and safe API contracts currently coupled to BFF issuer/token claims.
- `packages/config/src/index.ts` -- fail-closed API/direct-auth environment configuration parsing.
- `apps/api/src/auth/resource-server.guard.ts` -- global BFF-only admission seam to extend with exclusive browser-session strategy selection.
- `apps/api/src/auth/admin-capability.guard.ts` -- authorization boundary that needs an explicit server-derived transport/credential classification.
- `apps/api/src/auth/admin-identity.controller.ts` -- PKCE/atomic transaction security reference; remains internal-admin-only.
- `apps/api/src/app.module.ts` and `apps/api/src/main.ts` -- API dependency wiring, safe middleware/filter setup, and credentialed CORS bootstrap.
- `apps/api/src/openapi.controller.ts` -- BFF-only API security documentation to evolve for direct session admission.
- `tests/api-request-principal.integration.test.ts` and `tests/api-platform-contract.test.ts` -- serial PostgreSQL/API contract baselines for direct browser admission.
- `tests/admin-identity-routes.test.ts`, `tests/auth-role-governance.test.ts`, and `tests/safe-api-exception.filter.test.ts` -- OAuth security, authorization invalidation, and safe-envelope reference coverage.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/schema.ts`, `drizzle/migrations/`, and `packages/database/src/index.ts` -- add dedicated direct-browser OAuth transaction/session persistence, hashed lookup, revocation, session-bound CSRF data, atomic transaction consumption, role/current-version lookup, bounded renewal, and logout revocation; do not alter legacy Auth.js or admin session ownership.
- [x] `packages/contracts/src/index.ts` and `apps/api/src/auth/admin-capability.guard.ts` -- make `RequestPrincipal` transport-neutral while retaining a server-derived classification that preserves existing BFF/admin policy and cannot be supplied by browser input.
- [x] `packages/config/src/index.ts` -- validate direct Google OAuth, public/callback/redirect origins, cookie/session lookup and CSRF secrets, and CORS allowlists fail closed with no development bypass or insecure default.
- [x] `apps/api/src/auth/` -- add public browser Google start/callback, an admitted same-origin session-CSRF nonce projection, and logout routes; create services that issue secure cookies, run PKCE/state checks, atomically consume transactions, resolve/create users/accounts, and redact operational failures. Keep `admin-identity` service-only.
- [x] `apps/api/src/auth/resource-server.guard.ts`, `apps/api/src/app.module.ts`, and `apps/api/src/main.ts` -- select exactly one BFF-bearer or direct opaque-cookie strategy, reject legacy cookies, construct principals before controllers, apply renewal, and enforce configured credentialed CORS plus mutation-only origin/CSRF admission without wildcard behavior.
- [x] `apps/api/src/openapi.controller.ts` and related API contract metadata -- document browser cookie authentication, OAuth/session/logout/CSRF endpoints, CSRF/origin requirements, and safe errors without documenting secrets or weakening retained BFF endpoint contracts.
- [x] `tests/api-request-principal.integration.test.ts`, `tests/api-platform-contract.test.ts`, and focused new/updated auth tests -- cover each matrix scenario, including one-time callback, opaque hashed persistence/non-disclosure, live current-role/version admission, expiry/revocation/logout, renewal boundary, legacy-cookie rejection, exact CORS, CSRF/origin rejection, session-CSRF projection denial, and no-controller execution on failed admission.

**Acceptance Criteria:**
- Given a valid Nest-started Google callback bound to a non-expired one-time transaction, when it completes, then Nest resolves or creates the real user/account, persists one opaque PostgreSQL session, sets only its secure HttpOnly cookie, and redirects only to an allowlisted application URL without serializing sensitive authentication material.
- Given direct browser traffic to a protected `/v1` capability, when its Nest session is live and current, then Nest supplies a domain-neutral principal before controller execution; missing, malformed, legacy, expired, revoked, cross-origin, unauthorized, stale-version, or stale-role admission fails safely before domain logic.
- Given a session is within the renewal window or is logged out, when the respective admitted request occurs, then renewal reaches 30 days only below seven days and logout revokes the persisted session plus clears the cookie; subsequent use is denied.
- Given a state-changing direct browser request, when origin and CSRF are evaluated, then only an explicit configured origin with valid session-bound CSRF proof is admitted and credentialed CORS never uses a wildcard or exposes authentication internals.
- Given legacy Auth.js browser state exists after release, when it reaches Nest direct admission, then it is not adopted and a user must complete the Nest flow; the retained BFF path remains functional until its later explicit cutover.

## Design Notes

One request chooses one admission strategy. A bearer credential remains the existing BFF path; an opaque cookie remains the direct-browser path. Neither can fall through to Auth.js state or manufacture the other strategy's principal fields. This limits the compatibility surface while allowing Story 14.1 to precede presentation-client migration.

Store only a keyed lookup hash of the browser cookie/session secret. The raw secret exists only in the secure cookie and never in a response, loggable API DTO, or database row. Bind CSRF verification to the admitted server-side session rather than a BFF-signing or generic double-submit secret.

## Verification

**Commands:**
- `pnpm test:unit -- <focused auth/config tests>` -- expected: direct-auth pure logic, configuration, cookies, and safe serialization pass without a database.
- `DATABASE_URL_TEST=<test URL> pnpm test:integration -- <focused direct-auth/API files>` -- expected: serial PostgreSQL OAuth/session/admission regressions pass with each database-dependent file resetting its own state.
- `pnpm lint` -- expected: no new errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: production builds succeed.

## Implementation Record

### Completed Work

- [x] Added dedicated `browser_oauth_transactions` and `browser_sessions` PostgreSQL tables and forward migrations. Browser session rows store only keyed session and CSRF lookup hashes, a revocation timestamp, and the authorization-version snapshot; neither Auth.js `sessions` nor `admin_sessions` was changed.
- [x] Added PostgreSQL browser identity operations for atomic OAuth transaction consumption, Google-account user/account resolution, opaque-session creation/lookup/renewal/revocation, current roles, and authorization-version invalidation.
- [x] Added fail-closed direct-browser configuration (`XV_BROWSER_GOOGLE_CLIENT_ID`, `XV_BROWSER_GOOGLE_CLIENT_SECRET`, `XV_BROWSER_GOOGLE_CALLBACK_URL`, `XV_BROWSER_ALLOWED_ORIGINS`, `XV_BROWSER_ALLOWED_RETURN_ORIGINS`, `XV_BROWSER_SESSION_LOOKUP_KEY`, and `XV_BROWSER_CSRF_KEY`) and exact credentialed CORS setup.
- [x] Added Nest Google OAuth start/callback and logout routes. The callback uses PKCE and one-time state, creates a secure HttpOnly host cookie, and redirects only to configured return origins. BFF/Auth.js routes remain unchanged.
- [x] Extended request admission to choose exactly one BFF bearer or browser opaque-cookie strategy. Browser admission checks expiry, revocation, current roles, authorization version, exact mutation origin, and session-bound CSRF proof before controller execution; eligible sessions renew only below seven days.
- [x] Made principals transport-classified at the server boundary and retained admin capability access for the admin BFF bearer class only.
- [x] Documented direct browser session/OAuth/logout admission in OpenAPI and added serial PostgreSQL integration coverage for opaque persistence, legacy-cookie rejection, role/version invalidation, mutation origin/CSRF rejection, renewal, and logout revocation.
- [x] Added `GET /auth/csrf`, which requires an admitted direct browser session, its matching opaque cookie, and its exact configured origin. It returns only `{ csrfToken }`; the deterministic session-bound nonce remains verifiable through its persisted lookup hash and is unavailable to anonymous, BFF-bearer, cross-origin, expired, revoked, and legacy Auth.js-session requests.
- [x] Repaired final admission findings: any present `Authorization` header selects the BFF bearer path and invalid or malformed credentials return `401` without cookie fallback; direct browser admission accepts any non-empty current valid role set and attaches those roles, while capability guards remain responsible for route authorization.
- [x] Repaired logout idempotency: a revoked, expired, or unknown opaque cookie may reach only `POST /auth/logout` after the existing exact-origin and session-bound CSRF checks, where it is cleared with `204`; persisted stale cookies use their stored CSRF binding and unknown cookies require their derived session-bound proof. This path cannot construct an admitted principal for any other protected route or renew a session.
- [x] Repaired Auth.js Google-account migration: when a valid browser OAuth callback resolves an existing linked Google account with no roles, it adds only the baseline `traveler` role, increments `authorizationVersion`, and snapshots that current version in the new browser session. Existing role sets are left unchanged; subject/account mismatches still fail closed.
- [x] Added the direct AI Ask `idempotency-key` request header to the bounded credentialed CORS allowlist, while preflight continues to reject arbitrary or bearer-credential headers.

### Verification Results

- PASS: Logout idempotency repair -- `pnpm exec vitest run --project integration tests/api-request-principal.integration.test.ts tests/browser-identity.integration.test.ts` -- 2 files, 47 tests passed. Covers first logout followed by a revoked-cookie retry returning `204` and clearing the secure cookie, unknown opaque-cookie clearing with the derived session-bound proof, foreign-origin and invalid-CSRF stale-cookie denials without a clear-cookie response, and generic protected-route denial without controller execution.
- PASS: `pnpm typecheck` -- root, admin, worker-domain, API, and worker TypeScript checks passed. The first run encountered stale missing `.next/types` references; the required `pnpm build` regenerated those artifacts and the rerun passed.
- PASS WITH EXISTING WARNINGS: `pnpm lint` -- no errors; 5 unrelated unused-variable warnings in `tests/domain-outbox.test.ts`, `tests/knowledge-search.test.ts`, and `tests/operational-telemetry.test.ts`.
- PASS: `pnpm build` -- root Next, admin Next, API, and Worker production builds succeeded.
- PASS: `git diff --check`.

- PASS: Final CORS repair -- `pnpm exec vitest run --project integration tests/api-request-principal.integration.test.ts` -- 1 serial PostgreSQL file, 28 tests passed. An allowed-origin AI Ask preflight receives exactly `content-type`, `x-xuyenviet-csrf`, `x-request-id`, and `idempotency-key`; `authorization` and arbitrary headers remain excluded.
- PASS: `pnpm exec vitest run --project integration tests/api-platform-contract.test.ts` -- 1 file, 4 tests passed.
- PASS: `pnpm typecheck` -- root, admin, worker-domain, API, and worker TypeScript checks passed after build generated current Next route types.
- PASS WITH EXISTING WARNINGS: `pnpm lint` -- no errors; 5 unrelated unused-variable warnings.
- PASS: `pnpm build` -- root Next, admin Next, API, and Worker production builds succeeded.
- PASS: `git diff --check`.

- PASS: Auth.js Google-user migration repair -- `pnpm exec vitest run --project integration tests/browser-identity.integration.test.ts tests/api-request-principal.integration.test.ts` -- 2 serial PostgreSQL files, 48 tests passed. Coverage includes an existing Auth.js-style Google account with no roles completing Nest OAuth, receiving only `traveler`, obtaining the incremented authorization-version session snapshot, and being admitted to protected direct `GET /auth/csrf`; a same-subject user with existing operator/admin roles retains both roles and authorization version.
- PASS: `pnpm typecheck` -- root, admin, worker-domain, API, and worker TypeScript checks passed after `pnpm build` regenerated stale root `.next/types` artifacts.
- PASS WITH EXISTING WARNINGS: `pnpm lint` -- no errors; 5 unrelated unused-variable warnings in `tests/domain-outbox.test.ts`, `tests/knowledge-search.test.ts`, and `tests/operational-telemetry.test.ts`.
- PASS: `pnpm build` -- root Next, admin Next, API, and Worker production builds succeeded.
- PASS: `git diff --check`.

- PASS: Final confirmed Story 14.1 findings repair -- `pnpm exec vitest run --project integration tests/api-request-principal.integration.test.ts tests/browser-identity.integration.test.ts` -- 2 files, 47 tests passed. Covers Basic and malformed Bearer `Authorization` headers with a valid opaque browser cookie returning `401` without controller execution, plus operator-only browser-session admission to a generic protected route with current roles attached while the admin capability route remains `403`.
- PASS: `pnpm --filter @xuyenviet/api typecheck`.
- PASS: `pnpm --filter @xuyenviet/api build`.
- PASS: `pnpm typecheck` -- root, admin, worker-domain, API, and worker TypeScript checks passed after typed test environment fixtures gained `NODE_ENV: "test"`.
- PASS WITH EXISTING WARNINGS: `pnpm lint` -- no errors; 5 unrelated unused-variable warnings in `tests/domain-outbox.test.ts`, `tests/knowledge-search.test.ts`, and `tests/operational-telemetry.test.ts`.
- PASS: `git diff --check`.
- PASS: Final confirmed Story 14.1 repair -- `pnpm exec vitest run --project integration tests/browser-identity.integration.test.ts tests/api-request-principal.integration.test.ts tests/api-platform-contract.test.ts` -- 3 files, 46 tests passed. Covers denial of an email-selected user when its existing Google account has a different subject, with no browser session and no account-link takeover; preserves same-subject Google login; and verifies OpenAPI describes retained BFF bearer or direct browser-session admission for applicable traveler `/v1` routes while admin workspace remains bearer-only.
- PASS: `pnpm --filter @xuyenviet/api typecheck`.
- PASS: `pnpm --filter @xuyenviet/api build`.
- PASS WITH EXISTING WARNINGS: `pnpm lint` -- no errors; 5 unrelated unused-variable warnings.
- PASS: `git diff --check`.
- BLOCKED (PRE-EXISTING): `pnpm typecheck` -- `tests/admin-identity-routes.test.ts:44` fixture omits required `ProcessEnv.NODE_ENV`.
- PASS: Final confirmed medium-finding repair -- `pnpm exec vitest run --project integration tests/api-request-principal.integration.test.ts tests/browser-identity.integration.test.ts` -- 2 files, 37 tests passed. Covers fail-closed exact-origin browser-session admission, public OAuth release/schema readiness before persistence or provider work, bounded expired browser OAuth transaction cleanup, and Google token/userinfo 429/5xx retryable safe failures while invalid, malformed, and unauthorized responses remain 401.
- PASS: `pnpm --filter @xuyenviet/api typecheck`.
- PASS: `pnpm --filter @xuyenviet/api build`.
- PASS WITH EXISTING WARNINGS: `pnpm lint` -- no errors; 5 unrelated unused-variable warnings.
- PASS: `git diff --check`.
- PASS: Story 14.1 review repair -- `pnpm exec vitest run --project integration tests/api-request-principal.integration.test.ts tests/browser-identity.integration.test.ts` -- 2 files, 27 tests passed. Covers browser schema/release readiness before controller execution, redacted logout persistence failures, exact credentialed CORS request headers, and no-Origin navigation admission without renewal.
- PASS: `pnpm --filter @xuyenviet/api typecheck`.
- PASS: `pnpm --filter @xuyenviet/api build`.
- PASS WITH EXISTING WARNINGS: `pnpm lint` -- no errors; 5 unrelated unused-variable warnings.
- PASS: `git diff --check`.
- PASS: `pnpm exec vitest run --project integration tests/api-request-principal.integration.test.ts tests/browser-identity.integration.test.ts` -- 2 files, 24 tests passed. Review repairs cover supplied foreign-origin safe-read rejection with no-Origin navigation admission, refreshed secure HttpOnly renewal cookies, safe 503 projection for browser lookup/renewal failures, and no user/account/session creation for unverified Google email profiles.
- PASS: `pnpm --filter @xuyenviet/api typecheck`.
- PASS: `pnpm --filter @xuyenviet/api build`.
- PASS: `git diff --check`.
- PASS WITH EXISTING WARNINGS: `pnpm lint` -- no errors; 5 existing unused-variable warnings in unrelated test files.
- PASS: `pnpm exec vitest run --project integration tests/api-request-principal.integration.test.ts` -- 1 file, 21 tests passed. Includes session-CSRF projection success and denial for anonymous, BFF bearer (including with a browser cookie), cross-origin, legacy, revoked, and expired session requests.
- PASS: `pnpm exec vitest run --project integration tests/api-platform-contract.test.ts` -- 1 file, 4 tests passed.
- PASS: `pnpm --filter @xuyenviet/api typecheck`.
- PASS: `pnpm lint` -- no errors; 5 existing unused-variable warnings in unrelated test files.
- PASS: `pnpm build` -- root Next, admin Next, API, and Worker production builds succeeded.
- BLOCKED: `pnpm typecheck` -- stale root `.next/types` includes reference generated route type files that are absent after the production build. API-specific typecheck passes; this is unrelated to the endpoint implementation.
- NOT USED: `pnpm test:unit` -- no direct-auth unit project files are registered in `vitest.config.ts`; the focused serial integration suite covers the implemented behavior.

### Remaining Acceptance Gap

- None. The admitted same-origin `GET /auth/csrf` projection supplies the session-bound CSRF nonce required for direct browser mutations without disclosing authentication material.

## Auto Run Result

Status: done

Resolved decision: The product owner approved an explicit same-origin endpoint available only after Nest admits a direct browser session. It may return the session-bound CSRF nonce required for unsafe request admission. This nonce is not an authentication credential and must never be returned with a session ID/value, OAuth/provider token, BFF credential, signing key, or other authentication material. It must remain unavailable to unauthenticated, BFF-bearer, cross-origin, expired, revoked, and legacy Auth.js-session requests; credentialed CORS remains exact-origin only.

Completed implementation evidence before the block: the Nest-owned OAuth transaction/session persistence, PKCE callback, hashed opaque cookie session, direct admission, renewal, logout revocation, fail-closed origin configuration, exact credentialed CORS, OpenAPI documentation, and serial PostgreSQL integration coverage were implemented. The focused integration suite (20 tests), API typecheck, lint, build, and diff check passed. Repository-wide `pnpm typecheck` remains blocked by the pre-existing `tests/admin-identity-routes.test.ts:44` fixture missing `NODE_ENV`.

Final summary: NestJS now owns traveler browser Google OAuth, encrypted one-time OAuth transactions, opaque PostgreSQL sessions, direct API admission, session-bound CSRF bootstrap, bounded credentialed CORS, renewal, and idempotent logout. Auth.js/BFF capability cutover and retirement remain deferred to later Epic 14 stories.

Review findings: 19 patches applied across the synchronous adversarial review and repair cycle; no findings were deferred or rejected. The final independent adversarial and edge-case passes found no high or medium issues. A follow-up review is recommended because the final implementation changed a security-sensitive cross-layer boundary after the first review pass.

Residual risks: deployed origins, Google callback registration, new browser-auth secrets, and the clean-break session migration require staging/production evidence in later Epic 14 work. Existing lint warnings are unrelated and carry no Story 14.1 behavior change.

## Spec Change Log

- 2026-08-03: Final confirmed repair: reject an email-selected user if it already has a Google account linked to another provider subject, preserving the existing account and issuing no browser session. OpenAPI now describes retained BFF bearer and direct browser-session alternatives only on applicable traveler `/v1` routes; it does not claim BFF retirement.
- 2026-08-03: The blocked implementation exposed an intent contradiction: direct browser mutations required a session-bound CSRF proof, but the original non-disclosure constraint prohibited any CSRF serialization. The product owner approved a same-origin, admitted-browser-session-only endpoint returning the CSRF nonce. This avoids an unusable direct mutation path while retaining non-disclosure of session/OAuth/credential/key material. KEEP: opaque hashed session storage, exact-origin credentialed CORS, and no Auth.js/BFF migration in this story.
- 2026-08-03: Final confirmed findings repaired: presence of `Authorization` now exclusively selects bearer admission, so Basic and malformed Bearer credentials cannot fall back to a valid browser cookie. Browser admission now accepts any non-empty current valid role set, including operator-only users, and attaches that set to the principal; admin capability routes remain denied to browser-session principals. Typed test environment fixtures now include required `NODE_ENV` values.
- 2026-08-03: Logout idempotency repair: route metadata scopes stale browser-cookie admission to `POST /auth/logout` only. The exception preserves exact configured Origin and session-bound CSRF proof by comparing a persisted stale session's hash when available, or the derived nonce binding for an unknown opaque cookie. It does not renew or restore the session, and uses a non-authorizing principal solely so the logout controller can clear the matching cookie. All other stale-session requests remain denied before controller/domain execution.
- 2026-08-03: Confirmed migration-path repair: valid Nest direct Google OAuth now provisions the baseline `traveler` role for an existing Auth.js-style linked Google user only when the user has no roles. The changed role increments `authorizationVersion` and the callback uses the returned current version for its opaque session. Existing operator/admin roles remain untouched, and the existing different-subject account conflict remains fail-closed.

## Review Triage Log

### 2026-08-03 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 19 (high 1, medium 18)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Rejected Google subject/email account-link conflicts before session issuance.
  - `[medium]` `[patch]` Hardened browser origin, CSRF, OAuth transaction, release-readiness, provider-failure, session-renewal, CORS, OpenAPI, logout, and migration-path behavior; final signoff found no remaining high or medium findings.
