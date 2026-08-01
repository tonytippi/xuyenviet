# Epic 13 Context: Separate Operator Application Cutover

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Move operator knowledge and operational workflows to a separately deployed admin application with its own origin and release lifecycle. The admin application must securely reach the protected domain API through an admin-specific BFF, preserve role and ownership enforcement, and retire corresponding legacy `/admin` transport owners so operators can work independently of the traveler presentation without direct database or domain-mutation access.

## Stories

- Story 13.1: Establish the Separately Deployed Admin BFF Application
- Story 13.2: Migrate Operator Capabilities and Retire Legacy Admin Ownership

## Requirements & Constraints

- Deploy the operator/admin application independently to staging with its own origin, build and release process, health contract, OAuth callback configuration, and least-privilege environment configuration.
- Keep the browser behind the admin BFF. Browsers receive neither internal API credentials nor database credentials and never call the private domain API directly.
- The admin app must use the same versioned protected API boundary as other clients. It must not import domain mutation code; controllers and BFF adapters only adapt transport input and output.
- Enforce operator/admin access server-side for every protected read and command. A normal traveler must receive no protected data or admin navigation, and route access must not reveal whether protected resources exist.
- Protected capability responses use the stable safe error contract: machine-readable code, localized-safe message, request/correlation ID, and bounded safe field violations when applicable. Do not expose tokens, cookies, stack traces, SQL errors, raw provider payloads, raw captured text, unapproved evidence, execution secrets, or operator-only state.
- For each migrated capability, verify its API contract, authorization matrix, ownership scope, role enforcement, safe error handling, private networking, and staging behavior.
- Route each migrated request to exactly one transport owner before it is accepted. Never dual-write messages, assistant answers, provenance, usage, trip state, knowledge state, or any other aggregate. Retire the matching legacy `/admin` route or server-action owner after stable cutover.
- Public-launch readiness requires all operational workflows to be available through the separate admin app and the legacy `/admin` operational surface to be retired.

## Technical Decisions

- Use the pnpm workspace boundary with a separately deployed Next.js admin application in `apps/admin`; NestJS owns the `/v1` domain API and worker transport. Shared code belongs in extracted workspace packages only when multiple runtimes need it.
- The admin BFF validates its own host-only Auth.js session and resolves the exact server-side database-session token before minting an internal credential. Admin and traveler sessions, OAuth callbacks, cookies, issuers, and signing keys remain isolated.
- Mint only a five-minute ES256 credential from the `xuyenviet-admin-bff` issuer, scoped to the `api.railway.internal` audience. It carries only the stable user ID, session ID, sorted roles, authorization version, token ID, and standard time/issuer/audience claims; never include email, browser cookies, provider tokens, or unrestricted claims.
- The private API accepts bearer credentials only and sends no CORS allow-origin response. Its resource server verifies issuer-specific signature/key, exact issuer and audience, clock bounds, token ID, active matching session, subject, and current authorization version before constructing a domain-neutral `RequestPrincipal`.
- Unsafe admin BFF routes must complete exact-origin, allowed Fetch Metadata when supplied, and signed double-submit CSRF validation before minting credentials or calling the API. Use host-only `Secure`, `SameSite=Strict` CSRF cookies and constant-time header comparison.
- `user_roles` is authoritative. Admin BFF navigation is not authorization; controllers and domain use cases apply the same protected-capability authorization matrix. Role changes remain audited domain commands and cannot revoke the last active admin.
- Domain use cases own authorization, transactions, audit mapping, and mutations. Each mutable aggregate retains one owning command module; BFFs, controllers, server actions, and worker loops must not write domain state directly.
- Admin-to-API traffic uses only private `api.railway.internal` connectivity. Database connections are internal workload credentials, not admin application credentials. Dev, staging, and production isolate databases, secrets, OAuth configuration, API audiences, and observability.
- Railway workloads have distinct build/start commands, readiness, and least-privilege secrets. The migration job completes before a schema-dependent workload receives traffic; every admin release validates its declared schema compatibility before becoming ready.
- Every cutover requires a documented API contract, authorization matrix, integration coverage, rollback switch, selected transport owner, and removal proof. Rollback changes routing or compatible code before a new owner accepts requests and never destructively rolls back schema.

## UX & Interaction Patterns

- Keep the admin workspace separate from traveler planning. Admin entry is visibly separate and included only after server-side operator/admin role checks; normal traveler shell payloads contain no admin navigation or counts.
- Admin/operator surfaces may use Vietnamese labels with technical metadata names where useful and are optimized for dense tablet/desktop operational work. Core review, suppress/restore, verification, and evidence-validated editing should remain usable on mobile when feasible.
- Knowledge operations use structured forms and explicit actions rather than free-form edits to AI prose. Review queues use pagination or explicit load-more, not infinite scroll.
- Unauthorized admin access is denied server-side with a generic safe permission/not-found presentation. API failures map safe codes to Vietnamese recovery copy without transport diagnostics.
- Operator diagnostics may show safe aggregate and candidate-level ingestion outcomes. Do not show raw provider output, raw captured material, quotes outside approved evidence storage, or execution-fencing internals.

## Cross-Story Dependencies

- Story 13.1 establishes the deployable admin BFF, private connectivity, isolated admin issuer/session configuration, and health/release boundary required by Story 13.2.
- Epic 9 supplies the protected API foundation: request-principal verification, role authority, CSRF/BFF security primitives, safe errors, and protected capability patterns. Epic 13 must consume these rather than create alternate policy or identity paths.
- Migrated operator capabilities depend on their versioned API contracts and owning domain modules. The selected admin BFF/API route becomes the sole owner before its legacy `/admin` route or server action is retired.
- Epic 14 performs final public-launch inventory and verifies that no legacy Next.js domain transport owner, including legacy `/admin`, remains.
