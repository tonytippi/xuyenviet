# Story 14.1: Establish NestJS Google OAuth, Opaque Browser Sessions, and Direct API Admission

Status: ready-for-dev

## Story

As a traveler or operator,
I want NestJS to manage my Google sign-in and long-lived secure browser session,
so that web and PWA clients can call protected APIs directly without Auth.js or a BFF.

## Source Requirements

- `epics.md`: Epic 14, Story 14.1.
- `prd.md`: FR-8, FR-9, FR-42, FR-51 through FR-56, FR-60, NFR-2, NFR-12 through NFR-16.
- `addendum.md`: direct API, NestJS OAuth/session ownership, same-site ingress, typed direct API clients.
- `ARCHITECTURE-SPINE.md`: AD-4, AD-6, AD-14, AD-33.
- `sprint-change-proposal-2026-08-03-direct-api-session-auth.md`: approved clean-break and session parameters.

## Decisions Already Made

- NestJS becomes the only Google OAuth and browser-session authority.
- Browser sessions are opaque random identifiers, database-backed, and sent only in a secure HttpOnly cookie. They are not JWTs.
- Session window: 30 days; renew only after admission when fewer than seven days remain.
- Existing Auth.js sessions are not adopted. The cutover intentionally requires a one-time re-login.
- Browser mutations require NestJS session-bound CSRF admission. Direct browser origins are explicitly allowlisted; credentialed CORS never uses `*`.
- Same-site ingress will route traveler `/auth/*` and `/v1/*` to NestJS. Deployment-specific host names remain configuration, not hard-coded behavior.
- Native mobile bearer/PKCE is deferred. This story must keep authorization dependent solely on `RequestPrincipal`, not on cookie parsing.
- Do not remove Auth.js, root auth code, BFF proxy/client code, or existing traveler UI in this story. Story 14.5 owns final retirement and Story 14.2 owns the first direct consumer cutover.

## Acceptance Criteria

1. **Google authorization initiation and callback**
    - Given an unauthenticated visitor starts sign-in through NestJS, when Google returns a valid callback tied to a non-expired, single-use OAuth transaction and the initiating browser's OAuth transaction cookie matches its transaction ID, NestJS resolves or creates the real Google user/account, creates an opaque browser session, sets its secure HttpOnly cookie, and redirects to an allowlisted presentation URL.
   - OAuth transaction state is high entropy, expires in at most ten minutes, is consumed atomically, and is not reusable.
   - Callback/start errors return a safe sign-in failure/redirect or safe API response and never disclose provider tokens, session values, client secret, database details, or stack traces.

2. **Direct protected API admission**
   - Given a browser calls a protected `/v1` endpoint with a valid opaque session cookie, NestJS verifies session expiry and revocation, user existence, current roles, and `authorizationVersion`, then attaches the existing domain-neutral `RequestPrincipal` before controller/domain code runs.
   - Missing, malformed, expired, revoked, stale-version, cross-user, or otherwise invalid credentials return the existing safe unauthorized response and do not reach domain code.
   - Keep the principal contract as the controller/domain boundary. If BFF-only `issuer`/`tokenId` fields prevent this, replace them with an explicit server-side credential-class/session representation that does not reintroduce JWT/BFF semantics; update all direct consumers and tests in the same change.

3. **Long-lived lifecycle**
   - Given a valid admitted session has fewer than seven days remaining, NestJS atomically extends its expiry to 30 days from the current time and refreshes only the secure HttpOnly cookie.
   - Requests with seven or more days remaining do not write/rotate the session.
   - A logout endpoint revokes the exact session and clears the cookie. An already revoked or unknown session is safe and idempotent.
   - Role changes already increment `authorizationVersion`; old sessions must fail authorization after the change. Disable/deletion handling must fail closed if no active user can be resolved.

4. **CSRF and origin admission**
   - State-changing direct `/v1` requests require an explicit allowlisted Origin and session-bound CSRF proof. Safe methods do not require CSRF.
   - Credentialed CORS emits an exact configured origin, `Access-Control-Allow-Credentials: true`, bounded allowed methods/headers, and never wildcard origin/headers with credentials.
   - Non-allowlisted, missing-for-cross-site, or invalid-origin mutation requests fail before domain logic. Same-site requests must remain usable through the planned ingress.

5. **No new Auth.js sessions**
   - Nest direct OAuth creates and reads only Nest-owned session state after its admission flag/release path is enabled.
   - Legacy Auth.js cookies are not accepted by the Nest guard. No migration/adoption or silent conversion is added.
   - Existing BFF behavior is preserved until Story 14.2 switches its first consumer; do not break current API BFF integration tests merely by changing the guard.

6. **Contract and verification**
   - OpenAPI documents cookie session authentication, auth/session/logout endpoints, CSRF requirements for mutations, and safe responses. Remove BFF-only claims only where replacement behavior is live.
   - Add focused unit tests for parsing/configuration/CSRF/origin decisions and serial PostgreSQL integration coverage for callback consumption, session creation, current principal, renewal threshold, logout/revocation, authorization-version invalidation, and direct protected-controller non-disclosure.
   - `pnpm test:unit`, the targeted `pnpm test:integration` selection, `pnpm typecheck`, and `pnpm --filter @xuyenviet/api build` pass. Record any environment-only blocker exactly.

## Implementation Plan

1. Inventory the existing two identity paths before changing them:
   - Root Auth.js: `src/auth.ts`, `src/server/auth.ts`, and `src/app/api/auth/[...nextauth]/route.ts`.
   - API BFF JWT guard: `apps/api/src/auth/resource-server.guard.ts`, `packages/contracts/src/index.ts`, `packages/config/src/index.ts`, and `apps/api/src/main.ts`.
   - API admin identity contains reusable Google authorization-code/PKCE patterns in `apps/api/src/auth/admin-identity.controller.ts`, but it is service-token protected and must not be exposed or reused as a browser controller unchanged.

2. Add a dedicated browser-auth Nest module/controller/guard rather than expanding `AdminIdentityController`.
   - `GET /auth/google/start` creates the one-time transaction and redirects to Google.
   - `GET /auth/google/callback` validates/consumes state, exchanges code, validates the Google identity, persists the user/account/session, sets cookie, and redirects only to configured allowlisted UI URL.
   - `GET /auth/session` or `GET /v1/me` returns a deliberately bounded session/profile projection required by future presentation clients.
   - `POST /auth/logout` requires current browser session plus CSRF, revokes only that session, clears cookie, and has no credential disclosure.
   - Provide a bounded CSRF bootstrap/read path only if the chosen double-submit/session-bound design needs it; do not introduce a generic signed BFF CSRF token.

3. Extend `@xuyenviet/database` first.
   - Do not continue using the Auth.js `sessions.session_token` semantics as the Nest format without a reviewed migration/ownership decision.
   - Introduce an explicit Nest browser-session table/fields with opaque session lookup protection, user FK, expiry, revocation, and enough state to bind CSRF safely. Store only a hash of an opaque credential when practical; never log raw values.
   - Add a dedicated OAuth transaction persistence shape with state hash, PKCE verifier or securely protected verifier, allowed return URL, and expiry. Consume it atomically.
   - Reuse `users`, Google `accounts`, roles, and `authorizationVersion`; preserve their existing role-governance behavior.
   - Follow the clean-break rule. New migrations must be forward-only and integration tested. No reset or production data action is part of this story.

4. Evolve API auth incrementally.
   - Keep BFF JWT admission working temporarily for existing migrated endpoints, but add an explicit browser-session credential strategy that produces the same authorization-safe principal.
   - The guard must select one credential strategy per request; never combine a cookie principal and BFF principal, and never trust roles supplied by the browser.
   - Make public auth endpoints explicitly public. Keep health/version public as currently intended.
   - Apply request ID and safe exception filter to the new controllers.

5. Add configuration validation in `@xuyenviet/config`.
   - Google client ID/secret, public API/auth origin, presentation redirect allowlist, session cookie settings, CSRF secret/material, and release admission must fail closed when invalid in deployable environments.
   - Do not add a JWT issuer, BFF signer, or mobile-token configuration.
   - Keep local test configuration explicit; no production-like insecure cookie/CORS fallback.

6. Do not change traveler UI/API consumers yet beyond a minimal test harness if needed. Story 14.2 owns direct AI Ask/shell consumption. Do not delete Auth.js or BFF dependencies in this story.

## Existing Code Constraints

| File | Current behavior to preserve or replace deliberately |
| --- | --- |
| `apps/api/src/auth/resource-server.guard.ts` | BFF bearer JWT validation, live session/version check, safe unauthenticated response, schema admission. Add browser-session admission without accepting legacy Auth.js cookies or weakening existing BFF path before 14.2. |
| `packages/contracts/src/index.ts` | `RequestPrincipal` currently encodes BFF `issuer` and `tokenId`. Make it credential-transport neutral if necessary; every controller/domain test must remain compatible. |
| `packages/database/src/schema.ts` | `users`, Google `accounts`, Auth.js `sessions`, and separate `admin_sessions` exist. Preserve real-user FK and role invariants. Do not reuse `admin_sessions` as traveler session storage. |
| `packages/database/src/index.ts` | API identity repository reads Auth.js sessions and admin session hashes; role changes increment authorization version. Add a dedicated browser auth repository rather than embedding OAuth/database operations in controller code. |
| `apps/api/src/auth/admin-identity.controller.ts` | Has Google OAuth code exchange and transaction lifecycle, but is an internal service endpoint for the admin BFF. Use as a security reference only; do not expose its service-token handoff flow to browsers. |
| `src/auth.ts` | Auth.js database session, Google provider, initial role/referral side effects. Leave operational until the later consumer cutover and retirement story; replicate required user/account/referral semantics in Nest before final deletion. |
| `apps/api/src/openapi.controller.ts` | Documents private BFF bearer security. Update only the endpoints/security whose direct browser session implementation is present. |

## Security Guardrails

- OAuth callback return URLs must be a static allowlist, not arbitrary request input.
- Validate OAuth state before exchanging a code; consume state once; enforce a short expiry; use PKCE if Google flow is browser public-client capable.
- Start sets a distinct host-only secure HttpOnly SameSite=Lax transaction cookie containing only the opaque transaction ID. Callback must require it to match the parsed state transaction ID before consuming persistence and must clear it on both successful and failed callbacks.
- Cookie values, OAuth codes, verifier/state values, provider responses, client secrets, and session IDs must never appear in logs, safe error envelopes, OpenAPI examples, telemetry, or browser JSON bodies.
- Never use `localStorage` or a readable cookie for session credentials.
- Do not accept an Auth.js cookie, an unverified `x-user-*` header, or browser-provided roles as authentication.
- Do not use CORS wildcard with credentials, and do not treat a missing Origin as automatically valid for browser mutation requests without a documented same-site rule.
- Preserve current role invalidation: a changed `authorizationVersion` invalidates an established principal before any domain use case.

## File Expectations

Expected additions/updates are intentionally provisional until the implementation design is validated:

- `apps/api/src/auth/browser-auth.controller.ts` - new browser auth HTTP surface.
- `apps/api/src/auth/browser-session.guard.ts` or an evolved credential-neutral guard - direct session admission.
- `apps/api/src/auth/*` - CSRF/origin middleware or guard, cookie helpers, public-route declarations.
- `apps/api/src/app.module.ts` and `apps/api/src/main.ts` - module wiring/configuration only.
- `packages/contracts/src/index.ts` - transport-neutral principal and bounded auth/session DTOs if required.
- `packages/config/src/index.ts` - direct browser auth/session/origin configuration parsing.
- `packages/database/src/schema.ts`, `packages/database/src/index.ts`, and a new Drizzle migration - session/OAuth transaction persistence and repository.
- `apps/api/src/openapi.controller.ts` - live cookie/CSRF API documentation.
- `tests/*` - focused unit and serial database integration coverage.

Do not modify `src/features/**`, root page/component behavior, `apps/admin` UI, AI Ask domain execution, Worker code, or legacy-removal dependencies except where a test-only integration harness requires a documented narrow change.

## Test Design

- Unit: malformed/missing configuration; cookie extraction; origin classification; CSRF failure; expiry/renewal boundary exactly at seven days; session-safe serialization.
- Integration: transaction one-time consume; callback identity lookup/create; no token disclosure; live principal; expired/revoked/stale role version rejection; safe logout; renewal writes only below threshold; exact origin CORS; mutation CSRF enforcement; no domain invocation on admission failure.
- Regression: existing BFF bearer API integration continues until Story 14.2 explicitly retires it.

## Definition of Done

- All acceptance criteria above are met with code and automated evidence.
- New direct browser auth surface is Nest-owned and has no dependency on `src/auth.ts` or Auth.js runtime calls.
- Existing browser application behavior is not switched yet; legacy Auth.js remains only as temporary presentation compatibility, not as a Nest credential strategy.
- Story record includes exact verification commands, results, migrations, configuration additions, security review notes, changed-file list, and any deployment evidence deferred to Story 14.6.

## Completion Note

Ultimate context analysis completed on 2026-08-03. This story is ready for implementation. Validate the story before running `bmad-dev-story`.
