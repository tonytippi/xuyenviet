# Epic 9 Context: Trusted Private API Foundation

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Establish a private, API-first boundary so the traveler web BFF, and eventually the separately deployed admin BFF, can call documented `/v1` domain APIs using validated domain-neutral principals rather than browser cookies or Next.js session serialization. This protects credentials and ownership decisions at the transport boundary, gives clients stable safe failures and contracts, and proves the migration path with one protected read without creating competing transport owners.

## Stories

- Story 9.1: Establish BFF Credentials and API Request Principals
- Story 9.2: Govern Initial Administration and Role Changes
- Story 9.3: Enforce the Private BFF Transport Boundary
- Story 9.4: Publish Versioned API Contracts and Migrate a Protected Read

## Requirements & Constraints

- Versioned API contracts must be usable by the traveler web, future separately deployed operator app, and future mobile clients without coupling domain authorization to Next.js internals or Auth.js session serialization.
- The browser stays behind its BFF. It must never receive an internal API credential or call the private API directly. The private API accepts bearer credentials only, does not parse browser cookies, and emits no CORS allow-origin response.
- Every protected API read and command must receive a normalized `RequestPrincipal`; invalid credentials must be rejected before a domain use case runs. Authorization and ownership remain server-side and must not be inferred from admin navigation or client state.
- API errors must use a stable, localized-safe envelope with machine-readable `code`, safe `message`, correlation `requestId`, and only applicable bounded safe field violations. Never expose tokens, cookies, stack traces, SQL errors, raw provider payloads, raw evidence, or private configuration.
- Carry correlation IDs across BFF and API operations and record safe structured telemetry for capability, principal class, result code, latency, and safe identifiers. Web/admin-to-API and database traffic use private connectivity and isolated per-environment credentials, OAuth configuration, API audiences, and observability.
- Document health/version and protected capability contracts, including validation, authorization, ownership scope, error responses, and deterministic list ordering or pagination. The first conversation-summary read is intentionally bounded and unpaginated; its order is `updatedAt DESC, id DESC`, and timestamps are ISO-8601 UTC.
- Releases must declare schema/workload compatibility. The migration job holds the advisory migration lock and records the applied schema version before dependent workloads become ready or receive traffic. Liveness is process-only; readiness additionally validates assigned configuration, database/critical dependencies, and compatible schema.
- During a capability migration, route each request to exactly one transport owner before it accepts the request. Safe read-only comparison in development/staging may not alter the response or invoke another public owner. Rollback changes routing or compatible code, never destructively rolls back schema.

## Technical Decisions

- NestJS is the `/v1` domain API/resource server within one modular monolith; Next.js is the traveler/admin presentation and BFF runtime. API/worker runtimes import only extracted workspace packages, never Next.js, Auth.js, server-only, or server-action code. Extracted domain read models and the shared database package provide the seam reused by API and legacy BFF adapters.
- Web and admin have separate host-only Auth.js cookies, callback configuration, signing keys, and issuers. The web BFF issuer is `xuyenviet-web-bff`; the reserved admin issuer is `xuyenviet-admin-bff`. Both use the exact `api.railway.internal` audience. Epic 9 prepares issuer isolation but does not deploy or mint credentials from the separate admin BFF.
- After validating its host-specific Auth.js session, a BFF resolves the exact database session token server-side and verifies its user/expiry binding. It mints a maximum five-minute ES256 JWT containing only stable user `sub`, session `sid`, sorted `roles`, authorization version `rv`, cryptographically random `jti`, `iss`, `aud`, issued/not-before/expiry times, and signing `kid`. It includes no email, browser cookie, provider token, or unrestricted claim and never reaches the browser.
- The resource-server guard verifies issuer-specific ES256 signatures, known `kid`, exact issuer/audience, clock bounds, nonblank token identity, active unexpired session matching `sub` and `sid`, and current authorization version matching `rv` before creating `RequestPrincipal`. `jti` identifies a token but is not a replay ledger; session validity and authorization-version freshness revoke credentials. Key rotation accepts only the active key plus one issuer-matching previous verification key until its explicit expiry.
- `user_roles` is the authorization authority. A one-shot deployment command may grant `admin` only when no active admin exists and `INITIAL_ADMIN_EMAIL` identifies an existing real user with a linked Auth.js account. It normalizes the email, increments authorization version, writes an audit event using `system-admin-bootstrap`, and is disabled after a successful commit. Thereafter only authorized Auth/Admin domain commands may grant or revoke `operator` or `admin`; they lock affected role rows, audit the real caller, increment the target authorization version transactionally, and cannot remove the last active admin. No sign-in callback, environment-email match, repository path, or ordinary application path may grant roles.
- Cookie-authenticated unsafe BFF routes validate the exact BFF origin, allowed same-site Fetch Metadata when supplied, and a signed double-submit token before credential minting or API calls. The host-only `Secure`, `SameSite=Strict`, `Path=/` CSRF cookie must match `X-XuyenViet-CSRF` in constant time and pass signature/expiry checks. Server actions retain framework origin protection and must not bypass this policy.
- The shared `contracts` package owns the safe-error DTO; a Nest global exception boundary emits it for all API failures and BFF adapters project only that DTO to presentation responses. A thin BFF client forwards/generates correlation IDs, validated inputs, timeout/abort behavior, and `Idempotency-Key` when applicable.
- The shared configuration package validates issuer keys, prior-key expiry, private API URL, BFF origin, and migration/cutover configuration before readiness. The first protected-read switch is validated boolean `XV_CONVERSATION_SUMMARY_API_ENABLED`, default false unless explicitly enabled; the BFF chooses legacy or API before calling either.

## UX & Interaction Patterns

- Project safe API failure codes to Vietnamese recovery copy without exposing internal transport diagnostics. Unauthorized owned-resource access shows a generic not-found/permission response without revealing whether the resource exists.
- Admin navigation is only server-side role gated and must not appear in normal traveler payloads. A user without the required role is denied at the route/server boundary.

## Cross-Story Dependencies

- Story 9.1 establishes the credential, principal, session-validation, issuer-isolation, and safe-error primitives. Story 9.2 begins only after 9.1 proves authorization-version changes make old principals stale.
- Story 9.3 consumes the verified 9.1 identity foundation for BFF transport and CSRF enforcement; it may begin after 9.1 identity integration coverage passes.
- Story 9.4 consumes the verified primitives from 9.1 through 9.3 and may begin only after all their integration coverage passes. Its protected transport test handler is verification infrastructure, not a second production capability.
- Epic 10 uses this foundation for AI Ask API streaming, idempotency, fences, and outbox work. The separately deployed admin BFF is Epic 13 work, while Epic 14 inventories and retires remaining legacy transport owners before launch.
