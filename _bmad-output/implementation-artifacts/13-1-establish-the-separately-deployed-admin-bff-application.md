# Story 13.1: Establish the Separately Deployed Admin BFF Application

Status: backlog

## Story

As an operator,
I want a dedicated admin application that securely reaches protected capabilities,
so that operator releases and access controls are separate from traveler presentation.

## Acceptance Criteria

1. **Given** the admin application is deployed to staging, **when** an operator signs in through its host-only session, **then** it uses the admin BFF issuer and private API connectivity with no browser credential or database credential, **and** its independent build, release, health, OAuth callback, and least-privilege configuration are documented.
2. **Given** a normal traveler accesses the admin application or API capability, **when** authorization is evaluated, **then** the request is denied server-side without disclosing protected data or navigation, **and** the same API authorization matrix governs the admin BFF and controllers.

## Readiness Gate

Do not begin this story until a reviewed admin identity-handoff decision specifies its complete server-side flow: Google callback handling; the authority that creates, stores, and validates the admin host-only session; session identifier lookup; credential-mint authorization; issuer/key ownership and rotation; logout, expiry, revocation, and authorization-version invalidation; CSRF/origin enforcement; and least-privilege environment ownership.

The design must preserve the no-direct-database boundary: `apps/admin` has neither `DATABASE_URL` nor database imports, while the API still validates `sid` and `rv` against its identity repository. The existing root Auth.js and web credential minter both query Drizzle, so they cannot be copied into admin. Until this decision and its failure-mode test plan are approved, keep the story in `backlog`; do not scaffold an admin sign-in flow, share the root cookie, use a browser secret, or grant database access.

## Tasks / Subtasks

- [ ] Satisfy the admin identity-handoff entry gate before creating a deployable app (AC: 1, 2)
  - [ ] Obtain approval for the concrete flow named in **Readiness Gate**, including its trusted session authority and the endpoint or service boundary through which admin validates the session without direct database access.
  - [ ] Define tests for valid sign-in, host-only cookie isolation, root-cookie rejection, expired/revoked session rejection, logout, role-change authorization-version invalidation, signer/key isolation, browser non-disclosure, and API identity-store unavailability.
  - [ ] Do not copy `src/auth.ts`, `src/server/bff-session-token.ts`, or `src/server/bff-credentials.ts` into the admin app: all currently verify sessions/roles against Drizzle and are therefore incompatible with the no-direct-database requirement.
  - [ ] Reuse the existing API resource-server model: bounded ES256 credentials, issuer `xuyenviet-admin-bff`, audience `api.railway.internal`, only allowlisted claims, and API-side session/authorization-version verification. Admin private signing material is isolated from the web issuer; API receives public verification material only.
  - [ ] If the gate cannot be satisfied, leave the story in `backlog` and open an architecture decision. Do not grant the admin runtime database credentials or loosen the browser/API boundary to make progress.

- [ ] Create a separately buildable, deployable admin Next.js BFF runtime (AC: 1)
  - [ ] Add `apps/admin` as its own Next.js application with its own package metadata, TypeScript configuration, root layout, sign-in/callback routes, protected landing route, and Vietnamese-first operator shell. It must not import root `src/*` aliases, root Next app modules, Drizzle/database packages, domain mutation modules, or files marked `"use server"`.
  - [ ] Give the admin app a distinct host-only Auth.js cookie name, callback/sign-in paths, and origin for `admin.xuyenviet.app`; never set a `.xuyenviet.app` cookie domain or share `xuyenviet.session-token` with traveler web.
  - [ ] Keep the browser-to-admin interaction session/cookie based. The admin BFF alone mints the short-lived internal credential and calls `https://api.railway.internal`; do not expose internal tokens, JWKs, private API URLs, database URLs, provider credentials, raw API errors, or operator-only data to browser JavaScript.
  - [ ] Provide admin-local BFF API adapters that preserve the existing request ID, abort/timeout, origin, Fetch Metadata, signed double-submit CSRF, bounded DTO projection, safe error mapping, and declared-only idempotency-key rules. Generalize shared config only where both web and admin genuinely need it; do not make the generic adapter a domain owner.

- [ ] Enforce server-side operator access and API authorization alignment (AC: 2)
  - [ ] The admin shell and every BFF route must deny unauthenticated users and users without `operator` or `admin` before a protected API call, read, navigation response, or mutation is performed. Exact `admin` remains required for role governance and AI model catalog changes.
  - [ ] Add an explicit API capability-authorization seam. `ResourceServerGuard` authenticates and normalizes a principal but does not authorize individual operator capabilities; controllers/use cases must enforce the same role matrix server-side, independent of admin UI checks.
  - [ ] Preserve private API properties: bearer-only API requests, no cookie parsing in Nest, no direct-browser API path, no CORS allow-origin response, and safe error envelopes only.

- [ ] Add independent readiness, build, and release boundaries (AC: 1)
  - [ ] Implement `/api/health` liveness/readiness in `apps/admin`, reusing `schemaCompatibilityDeclarations.admin`, `futureAdminSchemaCompatibilityConsumer`, approved release-policy parsing, and the fail-closed one-row release admission semantics. Do not duplicate release-version evaluation or expose schema/matrix/target data in health output.
  - [ ] Add an `admin-runner` Docker target and, if Compose remains supported, a separate admin service/health check. Include deployment-owned `docs/release-matrices` and set `SCHEMA_RELEASE_MATRIX_DIRECTORY`; preserve the independent API/web/Worker targets.
  - [ ] Update root build/typecheck orchestration to include admin without merging its start/release lifecycle into traveler web. Keep `pnpm-lock.yaml` authoritative.
  - [ ] Document independent Railway service selection, private API route, migration-before-traffic dependency, readiness probe, OAuth callback/redirect configuration, host-only cookie behavior, required least-privilege environment variables, and the fact that staging/private-network evidence must be collected outside repository tests.

- [ ] Prove boundary and denial behavior (AC: 1, 2)
  - [ ] Add tests for distinct admin session/CSRF cookie namespaces and callback origin; prove root traveler cookie values cannot authenticate admin and no cookie has a parent-domain scope.
  - [ ] Add credential tests for admin issuer acceptance, web/admin signing-key isolation, exact claim/lifetime limits, revoked/expired session rejection, and authorization-version invalidation after role changes.
  - [ ] Add BFF/API integration coverage proving traveler/anonymous requests are denied at both layers before protected data or navigation is returned; prove exact-admin-only capabilities reject an operator.
  - [ ] Add static/import and runtime tests proving admin has no database credential/import path, browser output contains no API credential/session token/private JWK, and private API calls carry only bearer/request-ID/allowed DTO headers.
  - [ ] Add admin readiness/build/container tests for malformed config, invalid/missing release policy, unavailable/incompatible release state, and a successful compatible admin runtime. Preserve existing web/API/Worker tests.
  - [ ] Run focused tests plus `pnpm lint`, `pnpm typecheck`, `pnpm build`, relevant Docker/Compose checks, and `git diff --check`. Record exact commands and external staging blockers in the Dev Agent Record.

## Dev Notes

### Current State To Preserve

| Surface | Current behavior | Story direction |
| --- | --- | --- |
| `src/app/admin/**` | Legacy root `/admin` pages use server-side role checks, direct feature/database reads, and Server Actions. | Do not copy these imports into `apps/admin`; they remain legacy until a capability is migrated in Story 13.2. |
| `src/auth.ts` | Root Auth.js uses a Drizzle adapter, database sessions, hard-coded `xuyenviet.session-token`, and `/sign-in`. | Admin needs an independent host-only session configuration and an approved no-DB identity handoff. |
| `src/server/bff-credentials.ts` | Web BFF validates session, roles, and authorization version through direct DB queries, then mints web credentials. | Reuse claim security rules, not its database dependency or web issuer. |
| `packages/contracts/src/index.ts` | Declares both BFF issuers and the future `admin` schema consumer. | Reuse these shared contracts; do not create a parallel issuer or schema admission evaluator. |
| `apps/api/src/auth/resource-server.guard.ts` | Validates ES256 credential claims and current API-side session/authorization version. | Keep it as authentication; introduce capability authorization separately. |
| `src/server/bff-api-client.ts` and `protected-bff-adapter.ts` | Defines safe private-API transport, CSRF ordering, timeout/abort, and error projection. | Extract/reuse only import-safe primitives; preserve all safety properties in admin-local adapters. |

### Architecture Compliance and Guardrails

- `apps/admin` is a presentation/BFF client, not a second domain owner. It calls versioned Nest API contracts only; it never performs direct Drizzle access, imports mutation code, or proxies legacy Server Actions.
- Use the current stack: pnpm workspace, Next.js 15, React 19, strict TypeScript, Nest API, PostgreSQL/Drizzle owned by API/domain boundaries, Vitest, and existing ES256 `jose` credential handling. Do not add another auth protocol, database, generated SDK, queue, microservice, or generic admin backend.
- Keep access server-authoritative. `operator | admin` is the ordinary operator class; `admin` is the exact elevated class. UI visibility is not authorization.
- Credentials are short lived, audience-scoped, private-network-only, and non-refreshable. Browser receives neither them nor any private key/configuration.
- CSRF for unsafe cookie-authenticated admin BFF routes remains exact origin plus Fetch Metadata plus signed double-submit header/cookie. Its cookie is host-only, `Secure`, `SameSite=Strict`, `Path=/`.
- Health/readiness fails closed on invalid config, database/release admission failure, or incompatible schema. Do not report secret, URL, schema version, matrix, approval, SQL, provider payload, or protected data.
- Do not claim Railway deployment, DNS, OAuth provider setup, private networking, staging probes, monitoring, migration-job execution, or public-launch readiness from local code. Capture those as externally-owned evidence/runbook steps.

### Project Structure Notes

- New admin runtime code belongs under `apps/admin/`; share only minimal neutral contracts/configuration from `packages/contracts` and `packages/config`.
- API controllers remain under `apps/api/src/`; database/domain ownership stays in approved workspace packages. Root `src/app/admin/**` is legacy presentation and must not become an import dependency of the new app.
- Docker targets and root workspace scripts may be updated; do not remove legacy `/admin` pages in this story. Story 13.2 owns capability-specific cutovers and retirements; Epic 14 owns full inventory/public-launch proof.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 13: Separate Operator Application Cutover`]
- [Source: `docs/proposals/nestjs-api-and-separated-admin.md#Admin Tách Riêng`]
- [Source: `docs/proposals/nestjs-api-and-separated-admin.md#Authentication Và Session Boundary`]
- [Source: `_bmad-output/project-context.md#Critical Don't-Miss Rules`]
- [Source: `src/app/admin/layout.tsx`]
- [Source: `src/auth.ts`]
- [Source: `src/server/bff-credentials.ts`]
- [Source: `src/server/bff-session-token.ts`]
- [Source: `src/server/bff-api-client.ts`]
- [Source: `src/server/protected-bff-adapter.ts`]
- [Source: `packages/contracts/src/index.ts`]
- [Source: `packages/config/src/index.ts`]
- [Source: `apps/api/src/auth/resource-server.guard.ts`]
- [Source: `Dockerfile`]

## Story Validation

- [x] Both Epic 13.1 acceptance criteria are reproduced and mapped to implementation tasks.
- [x] The unresolved no-database admin session/credential handoff is explicit and blocks unsafe implementation shortcuts.
- [x] Existing issuer, API guard, BFF transport, CSRF, safe-error, schema admission, and deployment patterns are identified for reuse.
- [x] Exact authorization roles, browser non-disclosure, private networking, host-only cookies, readiness, independent lifecycle, and test evidence are concrete.
- [x] Scope excludes legacy capability retirement, external staging claims, direct database access, and full public-launch evidence.

### Validation Outcome

**BLOCKED - not ready for development.** The no-database admin identity/session and credential-minting design is a mandatory unresolved security decision. Revalidate only after the entry-gate decision and named failure-mode tests are approved.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- Story preparation and validation only. No application code, dependency, deployment, database, test, or external environment action was performed.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Created from Epic 13 requirements, separated-admin proposal, project context, completed Epic 12 release-admission patterns, current root admin/auth/BFF/API code, tests, Docker topology, sprint status, and recent Git history.
- Key prerequisite recorded: the current Auth.js and BFF minting implementations require Drizzle/database access and cannot be reused by the separate no-database admin runtime unchanged.
- 2026-08-01 validation correction: story status changed to `backlog` because identity handoff is a prerequisite security decision, not an implementation-time choice.

### File List

- `_bmad-output/implementation-artifacts/13-1-establish-the-separately-deployed-admin-bff-application.md`
