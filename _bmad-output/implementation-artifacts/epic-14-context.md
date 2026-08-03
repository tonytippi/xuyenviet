# Epic 14 Context: Direct API Consolidation and Legacy Retirement

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make traveler web and the separate admin application presentation-only clients of the versioned NestJS API. NestJS becomes the sole owner of Google OAuth, opaque browser sessions, CSRF admission, request-principal construction, and migrated domain transport, eliminating the duplicate Auth.js/BFF/root-backend ownership that blocks a safe, maintainable launch.

## Stories

- Story 14.1: Establish NestJS Google OAuth, Opaque Browser Sessions, and Direct API Admission
- Story 14.2: Cut AI Ask and Traveler Shell Reads to Direct API
- Story 14.3: Move Traveler Commands and Remove Root Domain Writers
- Story 14.4: Complete Admin Direct API Ownership
- Story 14.5: Retire Auth.js, BFF Runtime, and Legacy Transport
- Story 14.6: Produce the Direct API Launch Evidence Gate

## Requirements & Constraints

- Browser clients call documented `/v1` NestJS APIs directly using only NestJS-managed secure session cookies. They never receive database credentials, internal service credentials, browser tokens, BFF credentials, or domain writers.
- NestJS authorizes every protected read and command from a live opaque server-side session and current authorization state, producing the existing domain-neutral `RequestPrincipal` before controller or domain logic runs.
- OAuth callback admission requires a valid, non-expired, one-time transaction and redirects only to allowlisted application URLs. Safe responses must not reveal provider tokens, cookie values, session IDs, signing material, or internal error details.
- Sessions use a 30-day sliding expiry and renew only when fewer than seven days remain. Logout revokes the server session and clears its cookie; role changes and account invalidation invalidate prior authorization through current authorization/session checks.
- State-changing browser requests require an explicit allowed origin and valid session-bound CSRF proof. Credentialed CORS is never wildcarded and must not expose authentication internals.
- Preserve versioned API contracts, OpenAPI, validation, owner-scoped authorization, safe errors with correlation IDs and safe field violations, stable ordering/pagination where applicable, and documented session/CSRF admission semantics.
- AI Ask keeps its direct API NDJSON contract: `preparing`, `delta`, `done`, and `error`, abort handling, and atomic terminal persistence. No BFF proxy or legacy fallback remains for a migrated scope.
- Every aggregate command has exactly one transport writer. A migration may compare reads only outside production; it must never dual-write or affect the selected browser response.
- The cutover is approved as a clean break: legacy Auth.js sessions are not adopted, and users authenticate once through NestJS after deployment. If durable or overlapping data invalidates clean-break assumptions, an approved expand-migrate-contract plan is required instead.
- Keep PostgreSQL as the product, job, and session state plane and Drizzle as migration owner. Preserve worker claim, lease, fencing, idempotency, and isolation protocols.
- No new Next.js route handler, server action, BFF credential/client, transport selector, shadow read, or direct database access may become a domain capability owner. Root traveler and admin applications contain UI, rendering, and typed direct API clients only after their cutovers.

## Technical Decisions

- NestJS is the sole Google OAuth and browser-session authority. Its secure opaque session cookie is `HttpOnly`, `Secure`, host-only where deployment permits, `Path=/`, and `SameSite=Lax` by default.
- Cookie parsing and session implementation are transport concerns only. Controllers and domain policy consume `RequestPrincipal`, never cookie data or Auth.js serialization.
- Use same-site ingress for the initial cutover: traveler `/v1/*` and `/auth/*` route to NestJS while remaining routes go to the traveler presentation app. The ingress terminates/routs traffic only; it contains no authentication or domain behavior and is not a BFF. The separately deployed admin origin uses the direct API through the allowlisted origin policy.
- Maintain the modular-monolith boundaries: domain policy/use cases in `@xuyenviet/domain`, PostgreSQL repositories/migrations in `@xuyenviet/database`, schemas in `@xuyenviet/contracts`, and HTTP adapters in `apps/api`. `apps/api`, `apps/worker`, and `apps/admin` must not import root `src/` business/domain code.
- A capability is complete only when its presentation client uses NestJS directly, it has one command writer, API integration coverage proves authorization and ownership, and its matching Next route/server action/BFF adapter/direct-database owner is removed in the same story.
- Root `/admin` workflows move to the separately deployed `apps/admin` and protected `/v1/admin` APIs. Auth.js, BFF runtime/configuration, legacy Next transport, root domain writers, and legacy `/admin` retire only after an inventory proves no live capability owner remains.
- Record safe correlation telemetry for session admission, API, Worker, and provider activity, including capability, principal class, result, latency, and safe operational identifiers.

## UX & Interaction Patterns

- Preserve Vietnamese sign-in, sign-out, session-expiry, AI Ask reconnect, and safe-error recovery behavior while replacing server-side session resolution with direct API session/read clients.
- Unauthenticated, expired, revoked, malformed, cross-origin, and unauthorized requests recover through safe API responses without exposing OAuth, session, CSRF, provider, or database details.
- Existing visual, responsive, accessibility, ownership, and shell-state requirements remain valid; this epic changes session and transport ownership, not product interaction scope.

## Cross-Story Dependencies

- Story 14.1 is the prerequisite for every direct browser API request. Complete it before Stories 14.2-14.4.
- Migrate vertical capabilities in order: AI Ask and traveler shell reads (14.2), traveler commands (14.3), then remaining admin workflows (14.4). Delete matching legacy/BFF owners with each slice.
- Story 14.5 follows the capability cutovers and requires an inventory proving zero remaining live legacy transport owners.
- Story 14.6 follows the cutover and validates ingress/origin/cookie/CSRF topology, migration-before-traffic, one-writer and retirement inventory, rollback, OAuth smoke, Worker readiness, monitoring, backup/restore, and connection-pool and AI-stream concurrency evidence.
- Completed Epics 9-13 remain evidence of internal API, Worker, and separate-admin foundations only. Their Auth.js/BFF transport decisions are superseded by the approved 2026-08-03 direct API course correction and are not direct-browser implementation evidence.
