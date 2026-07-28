# Story 9.1: Establish BFF Credentials and API Request Principals

Status: ready-for-dev

## Story

As a traveler or operator,
I want my BFF-authenticated request to become a validated private API principal,
so that API authorization does not trust browser cookies or expose an internal credential to the browser.

## Acceptance Criteria

1. Given a web or admin BFF has validated its own host-only Auth.js session, when it calls the private API, then it mints an ES256 JWT with issuer `xuyenviet-web-bff` or `xuyenviet-admin-bff`, audience `api.railway.internal`, stable user subject, session ID, sorted roles, authorization version, `jti`, `kid`, and a maximum five-minute lifetime. The credential contains no email, cookie, provider token, or unrestricted claims and is never returned to the browser.
2. Given Nest receives a protected request, when its resource-server guard creates a `RequestPrincipal`, then it verifies the issuer-specific ES256 key, known `kid`, exact issuer/audience, clock bounds, unique token ID, active unexpired session matching subject/session ID, and current authorization version. Invalid signature, claim, session, or authorization-version requests fail through the safe API error envelope without entering a domain use case.
3. Given an active BFF signing key rotates, when the API validates credentials during the bounded overlap, then it accepts only the active key and one previous verification-only key for the matching issuer. Unknown, expired-overlap, or cross-issuer keys are rejected.

## Tasks / Subtasks

- [ ] Establish the workspace/API foundation required by this identity slice (AC: 1-3)
  - [ ] Add `apps/api` as a Nest HTTP bootstrap; retain the root Next app as the traveler BFF.
  - [ ] Add only shared packages that are needed by more than one runtime, starting with contracts/config/domain seams as justified.
  - [ ] Do not create `apps/web`, move the existing traveler app, create a worker runtime, or migrate an API capability in this story.
  - [ ] Add the shared safe API error contract now: `code`, safe `message`, `requestId`, and optional bounded field violations. The guard must use this same contract; Story 9.3 only wires its global transport implementation.
  - [ ] Add validated API/BFF signing configuration with separate web and admin issuer key sets, active `kid`, and one bounded previous verifier key with an explicit verification-end timestamp.
- [ ] Define domain-neutral identity contracts (AC: 1-2)
  - [ ] Define the minimal internal JWT claim contract and `RequestPrincipal` without importing Auth.js, Next, cookies, or request objects into the domain contract.
  - [ ] Add the persisted authorization-version field and a Drizzle-owned forward migration; preserve existing human-only `users` and `user_roles` constraints.
  - [ ] Add a host-only BFF session-token resolver that reads the exact Auth.js database-session cookie from the server request, resolves its `sessions.sessionToken`, and verifies the current user/expiry binding before minting. The API lookup validates the same session ownership and expiry without depending on browser session serialization.
- [ ] Implement BFF credential minting (AC: 1)
  - [ ] Keep `src/server/auth.ts` as the host-only Auth.js boundary. Mint credentials only after it has validated the current BFF session and the server-only session-token resolver has returned its matching database session token.
  - [ ] Include exactly `sub`, `sid`, sorted `roles`, `rv`, `jti`, `iss`, `aud`, `iat`, `nbf`, `exp`, and protected JOSE `kid` metadata; enforce a maximum 300-second lifetime.
  - [ ] Keep private signing material server-only and never serialize the token into a page, action result, browser response, log, or error.
- [ ] Implement Nest resource-server verification and principal creation (AC: 2-3)
  - [ ] Require a bearer token for protected routes and verify it before controller/use-case entry.
  - [ ] Select verification keys by exact issuer, reject cross-issuer/unknown `kid`, and limit rotation acceptance to active plus one configured previous key before its explicit verification-end timestamp.
  - [ ] Verify signature, issuer, audience, `iat`/`nbf`/`exp`, a cryptographically random nonblank `jti`, session existence/expiry/user match, and current authorization version before producing a normalized principal. `jti` is token identity, not a replay ledger.
  - [ ] Project all rejection paths through the safe API error contract; do not leak token data, key-selection detail, session data, stack, or SQL error.
- [ ] Add identity integration coverage (AC: 1-3)
  - [ ] Test valid web credentials, configured admin-issuer verifier isolation, and issuer-specific key selection. Live admin-BFF minting is a later separate-admin deployment test.
  - [ ] Test invalid signature, issuer, audience, `kid`, clock claims, malformed/missing claims, session absence/expiry/mismatch, and stale authorization version.
  - [ ] Test active/previous key overlap and rejection after overlap/cross-issuer use.
  - [ ] Prove rejected credentials never invoke the protected controller or domain use case and no browser-facing response contains an internal credential.

## Dev Notes

### Implementation Guardrails

- This is the first API-first vertical slice. The repository is currently one root Next.js application with no Nest app or workspace packages. Introduce the minimum foundation needed for private identity, including the shared safe-error contract; do not perform a big-bang monorepo migration.
- Nest may import only extracted workspace packages. It must not import `src/app`, `next/*`, `next-auth`, `server-only`, or modules marked `"use server"`.
- Keep PostgreSQL and Drizzle as the state/migration owner. Add the user authorization version through schema plus a reviewed forward migration; do not use an in-memory revocation list as a substitute for the session/version checks.
- A principal is domain-neutral. Controllers receive `RequestPrincipal`, and domain use cases must not receive `Request`, `Response`, Auth.js sessions, or Next callbacks.
- `user_roles` remains authoritative. The JWT role claim is an asserted snapshot that must be tied to the live authorization version; it does not become an alternative role store.
- `sessions.sessionToken` is the current Auth.js database-session identifier and is the intended `sid` lookup reference. The BFF must resolve it only from the verified server request using the host-specific Auth.js cookie configuration; validate its user ownership and expiration before minting and again at the API boundary. Never substitute `user.id` or return the token to a browser.
- The root Next app is the only BFF deployed in this story. Implement and test web issuer credentials end to end. Define the admin issuer config and API verifier isolation, but defer live admin-host session minting until the separate admin BFF exists; do not simulate a second host by sharing the root Auth.js cookie.
- Use a maintained ES256/JWT library selected during implementation. Do not implement JWT signing or verification primitives manually.

### Existing Code to Preserve

- `src/auth.ts` currently configures Auth.js database sessions and referral attribution. Preserve Google sign-in and referral behavior. Its environment-driven role provisioner is deliberately retired in Story 9.2, not silently changed here unless a shared extraction makes a compatible preparatory change necessary.
- `src/server/auth.ts` currently resolves the host-only Auth.js session and database roles. It is a BFF adapter boundary, not an API authorization dependency.
- `src/db/schema.ts` defines real-human `users`, database `sessions`, constrained `user_roles`, and actor-correct audit persistence. Do not weaken system-actor exclusions or audit checks.
- Existing audit APIs are owned by `src/features/audit/*`; feature code must not directly insert protected audit/history/usage tables.

### Suggested File Structure

- NEW `apps/api/src/main.ts`, `apps/api/src/app.module.ts`: Nest bootstrap and module composition.
- NEW `apps/api/src/auth/*`: bearer extraction, resource-server guard, principal decorator, issuer/key verifier, and session/version verifier.
- NEW shared `packages/contracts/src/errors/*`: safe envelope and safe validation violations used by the guard and later global exception filter.
- NEW extracted `packages/contracts/src/auth/*` and only necessary `packages/config`/`packages/domain` modules: claim/principal and configuration contracts usable by both BFF and API.
- NEW `src/server/bff-credentials.ts`: root Next BFF adapter that mints an internal credential after local Auth.js validation.
- UPDATE `src/db/schema.ts` and `drizzle/migrations/*`: authorization version and migration only.
- UPDATE root workspace/package/build configuration only to support the API slice. Keep existing root Next scripts functioning.

### Testing Requirements

- Use the existing Vitest plus PostgreSQL `DATABASE_URL_TEST` harness for session, role, and authorization-version integration behavior. Do not replace the test stack.
- Add a genuine Nest API integration layer for crypto/guard behavior; mocked guard-only tests are insufficient.
- Run targeted identity tests plus `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Run the applicable migration/schema verification and record exact blockers if the known non-interactive Drizzle prompt remains.

### Scope Boundaries

- No public API origin, mobile/OIDC issuer, generated SDK, Redis/BullMQ/Kafka/Temporal, worker runtime, AI Ask cutover, separate deployed admin app, or public `api.xuyenviet.app`.
- No protected capability cutover yet. Story 9.4 owns the first BFF-to-API read, OpenAPI health/version contract, routing switch, and single-owner proof.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.1: Establish BFF Credentials and API Request Principals]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-1: API-First Modular Monolith Runtime]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4: Identity Maps Into A Domain-Neutral Request Principal]
- [Source: docs/proposals/nestjs-api-implementation-plan.md#Kiến Trúc Package Chuyển Tiếp]
- [Source: src/auth.ts]
- [Source: src/server/auth.ts]
- [Source: src/db/schema.ts#users, sessions, and userRoles]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Review-repair scope decision (2026-07-28): Story 9.1 retains the shared safe-error contract and has the resource-server guard emit its safe unauthorized envelope directly. Global exception-filter registration is deferred to Story 9.3, which owns API-wide transport enforcement. The production bootstrap no longer registers `SafeApiExceptionFilter`.
- Review repairs (2026-07-28): isolated web BFF signing configuration from API public-verifier configuration; eliminated the exported session minting bypass; removed the production identity test controller; validated JWK use/material, public/private correspondence, `kid` consistency, and active/previous key distinction; moved Nest integration coverage to the `DATABASE_URL_TEST` PostgreSQL identity repository; and added non-disclosure coverage for browser-facing BFF serialization.
- Independent review 2026-07-28 of exact range `2d9228ed5b8e8d3480c8e23dc231b4d18cd20cff..9a43e32618b806c6d9013fe3a8c4d36ed47f9905` ran Blind Hunter, Edge Case Hunter, and Acceptance Auditor synchronously. Status remains in-progress; no implementation changes were made.
- Actionable findings:
  - PATCH [high] `src/server/bff-credentials.ts:99-118`, `packages/config/src/index.ts:5-8`, `apps/api/src/main.ts:12`: the root web BFF loads the deferred admin private signing key, and API configuration permits private signing material. Separate BFF signing config from API verification config; the web runtime must load only its own private key and API must accept public verifiers only.
  - PATCH [medium] `src/server/bff-credentials.ts:49-96`: exported `mintWebBffCredentialForSession` bypasses Auth.js request validation and cookie/session-token resolution. Make this internal or require an unforgeable authenticated BFF context.
  - PATCH [medium] `apps/api/src/app.module.ts:12-21`: production module exposes the test-only `GET /_identity-test` capability, crossing the Story 9.4 protected-read scope boundary. Move it to test setup or remove it from production bootstrap.
  - DECISION-NEEDED [medium] `apps/api/src/main.ts:13-15`, `apps/api/src/safe-api-exception.filter.ts:5-17`: registering the global API exception filter crosses the explicit Story 9.3 transport-implementation boundary. Clarify narrowly authorized Story 9.1 guard transport handling versus deferring global registration to Story 9.3.
  - PATCH [medium] `packages/config/src/index.ts:38-52`: configuration does not validate active/private/public key correspondence, `kid` consistency, or distinct active and previous `kid` values. Invalid or duplicate rotation configuration can start successfully and reject valid credentials at runtime.
  - PATCH [medium] `packages/config/src/index.ts:58-60`: ES256 validation accepts JWKs without required public coordinates or private material where signing is configured. Fail invalid configuration at startup.
  - PATCH [medium] `tests/api-request-principal.integration.test.ts:26,68-78,94-106`: Nest integration uses an in-memory identity repository rather than `DATABASE_URL_TEST` and the production PostgreSQL session/user/authorization-version lookup. Add genuine persistence-backed API boundary coverage.
  - PATCH [medium] `tests/bff-credentials.test.ts:30-43`, `tests/api-request-principal.integration.test.ts:35-123`: no browser-facing BFF route/action response proves an internal credential/session token/signing material cannot serialize to a browser response.

### File List
