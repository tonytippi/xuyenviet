# Epic 9 Context: Trusted Private API Foundation

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Establish a private, API-first boundary so traveler and future operator BFFs call documented `/v1` domain APIs with validated domain-neutral principals, not browser cookies or Next.js session serialization. Prove the migration with one protected read, stable safe failures, and exactly one transport owner.

## Stories

- Story 9.1: Establish BFF Credentials and API Request Principals
- Story 9.2: Govern Initial Administration and Role Changes
- Story 9.3: Enforce the Private BFF Transport Boundary
- Story 9.4: Publish Versioned API Contracts and Migrate a Protected Read

## Requirements & Constraints

- Covers FR-51, FR-52, FR-54, FR-55, and FR-56; NFR-14 and NFR-15.
- Versioned contracts support traveler web, the future separately deployed operator app, and future mobile without coupling domain authorization to Next.js internals or Auth.js session serialization.
- Browsers stay behind their BFF. They never receive an internal credential or call the private API; the API is bearer-only, never parses browser cookies, and emits no CORS allow-origin response.
- Every protected operation receives a normalized `RequestPrincipal`. Invalid signature, claims, session, or authorization-version state must return the safe error envelope before a domain use case executes; authorization and ownership stay server-side.
- Safe errors contain only machine-readable `code`, safe localized `message`, correlation `requestId`, and applicable bounded safe field violations. Never expose credentials, cookies, tokens, stack traces, SQL errors, provider payloads, raw evidence, or private configuration.
- Propagate correlation IDs and safe telemetry across BFF/API work. Web/admin-to-API and database traffic stay private, and environments use isolated credentials, OAuth configuration, API audiences, and observability.
- Document health/version and protected-capability validation, authorization, ownership, safe errors, and stable ordering or pagination. The first protected conversation-summary read is bounded, unpaginated, deterministic (`updatedAt DESC, id DESC`), and uses ISO-8601 UTC timestamps.
- Readiness verifies assigned configuration, database/critical dependencies, and schema compatibility; liveness verifies process operation only. Record applied schema version under a migration advisory lock before dependent traffic.
- A capability routes to exactly one transport owner before acceptance. Read comparison cannot change responses or invoke a second public owner; rollback changes routing or compatible code, never destructively rolls back schema.

## Technical Decisions

- NestJS owns the `/v1` resource server; Next.js remains traveler/admin presentation and BFF runtime. Extracted domain/data packages provide the API and legacy-adapter seam.
- Web and admin use separate host-only Auth.js cookies, callbacks, signing keys, and issuers: `xuyenviet-web-bff` and `xuyenviet-admin-bff`. Both target `api.railway.internal`. Epic 9 establishes issuer/verifier isolation but does not deploy the separate admin BFF.
- A BFF validates its host-specific Auth.js session, resolves its exact database session token server-side, verifies user/expiry binding, and mints an ES256 JWT with a five-minute maximum lifetime. Claims are only `sub`, `sid`, sorted `roles`, `rv`, random `jti`, issuer, audience, time claims, and `kid`; never email, cookie, provider token, or unrestricted claims. The credential never reaches the browser.
- The guard verifies the issuer-specific ES256 key/signature, known `kid`, exact issuer/audience, clock bounds, nonblank random `jti`, matching active unexpired session, and current authorization version before creating `RequestPrincipal`. Accept only the active key and one issuer-matching, time-bounded previous verification key.
- `user_roles` is authoritative. A one-shot `INITIAL_ADMIN_EMAIL` deployment command can grant only `admin` when no active admin exists and the normalized email identifies a real user with a linked Auth.js account. It increments authorization version and audits `system-admin-bootstrap`. Only authenticated Admin domain commands can change `operator`/`admin`, with locked role rows, atomic authorization-version increment, actor-correct audit, and last-admin protection.
- Unsafe cookie-authenticated BFF routes validate exact origin, supplied same-site Fetch Metadata, and signed double-submit CSRF cookie/header matching before minting credentials or calling the API. Shared contracts own the safe-error DTO; Nest emits it globally and BFFs project it while forwarding validated input, correlation ID, timeout/abort, and `Idempotency-Key` where applicable.
- Validate issuer keys, previous-key expiry, private API URL, BFF origin, and cutover settings before readiness. `XV_CONVERSATION_SUMMARY_API_ENABLED` is validated and default-off; select legacy or API transport before either is invoked.

## UX & Interaction Patterns

- Project safe API failures into Vietnamese recovery copy without internal transport details, secrets, or provider diagnostics.
- Role-gated admin navigation is presentation only; protected BFF/API boundaries enforce authorization.

## Cross-Story Dependencies

- Story 9.1 establishes credential minting, request-principal/session validation, issuer isolation, and safe-error primitives. Story 9.2 starts only after 9.1 proves authorization-version changes invalidate existing principals.
- Story 9.3 consumes verified 9.1 identity primitives and starts only after identity integration coverage passes.
- Story 9.4 starts only after 9.1-9.3 integration coverage passes. Its protected transport handler is verification infrastructure; the conversation-summary read is the first real BFF/API capability cutover.
- Epic 10 owns AI Ask streaming, idempotency, fences, and outbox work. Epic 12 owns dedicated worker runtime operations beyond Epic 9 schema admission. Epic 13 deploys the separate admin BFF, and Epic 14 retires remaining legacy transport owners.
