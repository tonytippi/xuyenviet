# Epic 14 Context: Direct API Consolidation and Legacy Retirement

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make traveler web and the separately deployed admin application presentation-only clients of the versioned NestJS API. NestJS becomes the sole Google OAuth, opaque browser-session, CSRF, request-principal, and migrated domain-transport owner. This eliminates duplicated Auth.js, BFF, root database, and legacy admin ownership while preserving protected product behavior and producing the operational evidence required before public launch.

## Stories

- Story 14.1: Establish NestJS Google OAuth, Opaque Browser Sessions, and Direct API Admission
- Story 14.2: Cut AI Ask and Traveler Shell Reads to Direct API
- Story 14.3: Move Traveler Commands and Remove Root Domain Writers
- Story 14.4: Complete Admin Direct API Ownership
- Story 14.5: Retire Auth.js, BFF Runtime, and Legacy Transport
- Story 14.6: Produce the Direct API Launch Evidence Gate

## Requirements & Constraints

- Browser clients call documented `/v1` NestJS APIs directly with NestJS-managed secure session cookies only. They never receive database credentials, internal service credentials, BFF credentials, provider tokens, session IDs, or signing material.
- Protected reads and commands must be authorized with a current, domain-neutral `RequestPrincipal`; requests that are missing, expired, revoked, malformed, cross-origin, stale, or unauthorized must fail through the safe API envelope before domain logic runs.
- API errors must provide a machine-readable code, safe message, correlation/request ID, and applicable safe field violations without sensitive implementation details. Versioned health, version, protected capability, validation, ownership, stable-ordering, pagination, streaming, and browser-session/CSRF contracts must be documented.
- Preserve exactly one writer for every aggregate command during each cutover. A migrated capability is incomplete until the browser or admin client uses the direct API, authorization and ownership integration coverage exists, and the matching Next.js route handler, server action, BFF adapter, or direct database writer is removed. Never dual-write product state or retain a legacy fallback.
- Preserve AI Ask NDJSON `preparing`, `delta`, `done`, and `error` events, abort behavior, and atomic terminal persistence. Direct-stream retry/reconnect reuses the original idempotency key rather than submitting ambiguous work again.
- Story 14.2 includes the traveler commands rendered by the AI Ask shell: conversation/trip creation and deletion, proposal apply/dismiss including annotation-bound actions, answer usefulness feedback, and visible referral attribution. Preserve owner-scoped deletion, proposal locks/fences/expiry/audit/history, annotation binding, and feedback semantics.
- Authenticated product behavior remains unchanged: Google login gates AI Ask; public entry remains reachable; admin access requires current role authorization; referral attribution remains silent; existing legacy Auth.js sessions are not adopted, so users reauthenticate once through NestJS.
- The separate admin application must use protected direct APIs and retain its independent origin and release lifecycle. Root `/admin` routes and actions are retired only after replacement workflows are live.
- API, worker, traveler web, admin app, and migration workloads remain independently deployable with least-privilege configuration and health contracts. Staging/production isolate credentials, databases, OAuth configuration, and observability. Migrations run before dependent traffic.
- Public launch requires direct-API topology, OAuth/session, CSRF/origin, one-writer, rollback, worker readiness, monitoring, backup/restore, and AI-stream concurrency evidence. Clean-break schema changes are allowed only while data is disposable; durable or overlapping data requires an approved expand-migrate-contract plan.

## Technical Decisions

- NestJS is the only Google OAuth and browser-session authority. It resolves an opaque session ID from an HttpOnly, secure, host-only-where-possible cookie into a `RequestPrincipal` only after verifying session expiry/revocation, user state, current roles, and authorization version. Controllers and domain code consume the principal, never cookie data or Auth.js serialization.
- Browser sessions use a 30-day sliding window and renew only on an admitted active request within the final seven days. Logout revokes the server-side session and clears its cookie; role changes or account invalidation invalidate prior authorization state.
- State-changing browser requests require session-bound CSRF proof and explicitly allowlisted origins. Credentialed CORS never uses a wildcard. Same-site ingress routes traveler `/v1/*` and `/auth/*` traffic to NestJS, performs transport only, and is not a BFF.
- The root Next.js traveler application and `apps/admin` contain UI, route rendering, and typed API clients only after a capability cutover. New domain policy/use cases belong in `@xuyenviet/domain`, PostgreSQL repositories in `@xuyenviet/database`, request/response schemas in `@xuyenviet/contracts`, and HTTP adapters in `apps/api`.
- Do not add Next.js domain route handlers, server-action writers, BFF credentials or clients, transport selectors, shadow reads, or direct database access as new capability owners. `apps/api`, `apps/worker`, and `apps/admin` must not import root `src/` business/domain code.
- Existing API, Worker, shared contracts/domain/database, safe errors, correlation, ownership checks, command idempotency, aggregate fences, outbox dispatch, and worker isolation remain mandatory foundations. Worker behavior continues to use PostgreSQL job, claim, lease, fencing, and idempotency protocols.

## UX & Interaction Patterns

- Keep the Vietnamese public sign-in path, protected-route gate, post-auth continuation, account sign-out, and silent referral experience. OAuth failures and session expiry/revocation use safe recovery copy and expose no provider, session, CSRF, transport, database, or internal error details.
- Preserve the responsive AI Ask shell and all existing traveler workspace behavior through direct APIs. Keep owner-scoped command interactions and accessible destructive confirmations intact.
- Streamed answers remain visibly pending until final persistence, announce progress/completion through `aria-live`, retain the draft on recoverable failure, and never imply a partial response was saved. `refresh_required` clears pending treatment and asks the traveler to refresh rather than showing a saved partial answer.
- Project stable API safe errors to Vietnamese recovery copy. Do not reveal tokens, provider payloads, SQL, stack traces, or internal diagnostics.

## Cross-Story Dependencies

- Story 14.1 is the prerequisite for all direct browser requests and establishes the OAuth, session, CSRF, origin, and principal boundary.
- Story 14.2 depends on Story 14.1 and performs the atomic traveler AI Ask, shell-read, and currently rendered command cutover; it retires traveler Auth.js only after inventory confirms no traveler caller remains. Root admin and `apps/admin` paths stay out of this slice.
- Story 14.3 follows the authenticated traveler baseline to migrate any remaining traveler command slices and remove their root writers.
- Story 14.4 completes the separate admin direct-API migration and retires matching root `/admin` owners.
- Story 14.5 can remove remaining Auth.js, BFF, and legacy transport only after all capability inventories prove no live owner remains.
- Story 14.6 follows the completed cutovers and owns deployment topology, migration ordering, rollback, legacy-retirement, worker, and operations evidence. Historical Epics 9-13 remain foundation evidence only; their BFF/Auth.js transport decisions are superseded and do not satisfy direct-browser requirements.
