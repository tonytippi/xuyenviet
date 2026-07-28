# Epic 9 Context: Trusted Private API Foundation

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Establish a private, API-first boundary so traveler and future operator BFFs call documented `/v1` domain APIs using validated domain-neutral principals rather than browser cookies or Next.js session serialization. This prevents credential exposure and transport-level authorization drift, provides stable safe failures, and proves the migration path with one protected read while preserving exactly one transport owner.

## Stories

- Story 9.1: Establish BFF Credentials and API Request Principals
- Story 9.2: Govern Initial Administration and Role Changes
- Story 9.3: Enforce the Private BFF Transport Boundary
- Story 9.4: Publish Versioned API Contracts and Migrate a Protected Read

## Requirements & Constraints

- Versioned contracts must support the traveler web, future separately deployed operator app, and future mobile clients without coupling domain authorization to Next.js internals or Auth.js session serialization.
- Browsers remain behind their BFF: they never receive an internal credential or call the private API directly. The API accepts bearer credentials only, never parses browser cookies, and sends no CORS allow-origin response.
- Every protected read and command receives a normalized `RequestPrincipal`; invalid identity, session, or authorization-version state fails through the safe envelope before domain use cases run. Authorization and ownership remain server-side.
- API failures always return machine-readable `code`, localized-safe `message`, correlation `requestId`, and only applicable bounded safe field violations. Do not expose token material, cookies, stack traces, SQL errors, provider payloads, raw evidence, or private configuration.
- Propagate correlation IDs across BFF and API work and emit safe telemetry for capability, principal class, result code, latency, and safe identifiers. Web/admin-to-API and database traffic remain private and use isolated environment credentials, OAuth configuration, API audiences, and observability.
- Document health/version and protected-capability validation, authorization, ownership scope, safe errors, and stable list ordering or pagination. The initial conversation-summary read is bounded and unpaginated with deterministic `updatedAt DESC, id DESC` ordering and ISO-8601 UTC timestamps.
- Readiness must validate assigned configuration, database/critical dependencies, and schema compatibility; liveness verifies only process operation. Migration records the applied schema version under an advisory lock before dependent traffic.
- A cutover routes each request to exactly one transport owner before it is accepted. Development/staging read comparison cannot alter the response or invoke another public owner; rollback changes routing or compatible code, never destructively rolls back schema.

## Technical Decisions

- NestJS owns the `/v1` domain API/resource server; Next.js remains traveler/admin presentation and BFF runtime. Shared extracted domain/data packages form the API and legacy-adapter seam.
- Web and admin retain separate host-only Auth.js cookies, callback configuration, signing keys, and issuers: `xuyenviet-web-bff` and `xuyenviet-admin-bff`. Both target only `api.railway.internal`. Epic 9 configures issuer isolation but does not deploy the separate admin BFF.
- After validating its host-specific Auth.js session, a BFF resolves the exact database session token server-side and verifies user/expiry binding. It mints a maximum five-minute ES256 JWT with only `sub`, `sid`, sorted `roles`, authorization version `rv`, random `jti`, issuer, audience, time claims, and `kid`; it contains no email, cookie, provider token, or unrestricted claims and never reaches the browser.
- The resource-server guard validates issuer-specific ES256 signature and key, issuer/audience, clock bounds, token ID, matching active session, and current authorization version before creating `RequestPrincipal`. Session validity and authorization-version freshness revoke credentials. Rotation permits only an active key and one issuer-matching previous verification key within its explicit overlap.
- `user_roles` is the sole authorization authority. A one-shot `INITIAL_ADMIN_EMAIL` bootstrap may grant `admin` only if no active admin exists and the target is an existing authenticated real user; it normalizes email, increments authorization version, and audits with `system-admin-bootstrap`. Authorized Auth/Admin commands alone change `operator` or `admin`, lock role rows, increment target authorization version atomically, audit the real actor, and cannot remove the final active admin.
- Unsafe cookie-authenticated BFF routes validate exact origin, supplied same-site Fetch Metadata, and signed double-submit CSRF cookie/header matching before credential minting or API calls. The shared contracts package owns the safe-error DTO; Nest emits it globally and BFFs project only it. The BFF client forwards correlation IDs, validated input, timeout/abort behavior, and `Idempotency-Key` when applicable.
- Configuration validates issuer keys, previous-key expiry, private API URL, BFF origin, and cutover settings before readiness. `XV_CONVERSATION_SUMMARY_API_ENABLED` is the validated, default-off switch; the BFF selects legacy or API transport before invoking either.

## UX & Interaction Patterns

- Project safe API failure codes to Vietnamese recovery copy without internal transport diagnostics, secrets, or provider details.
- Role-gated admin navigation is not authorization; protected route and API boundaries enforce the required role.

## Cross-Story Dependencies

- Story 9.1 provides credential minting, request-principal/session validation, issuer isolation, and safe-error primitives. Story 9.2 starts only after 9.1 proves authorization-version changes stale existing principals.
- Story 9.3 consumes verified 9.1 identity primitives for BFF transport and CSRF enforcement; it starts only after identity integration coverage passes.
- Story 9.4 requires verified 9.1-9.3 primitives and integration coverage. Its protected transport handler is verification infrastructure, not a second production capability.
- Epic 10 builds AI Ask streaming, idempotency, fences, and outbox behavior on this boundary. Epic 13 deploys the separate admin BFF; Epic 14 retires remaining legacy transport owners.
