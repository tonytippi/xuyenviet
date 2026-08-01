# Story 13.1: Establish the Separately Deployed Admin BFF Application

Status: in-progress

## Story

As an operator,
I want a dedicated admin application that securely reaches protected capabilities,
so that operator releases and access controls are separate from traveler presentation.

## Acceptance Criteria

1. **Given** the admin application is deployed to staging, **when** an operator signs in through its host-only session, **then** it uses the admin BFF issuer and private API connectivity with no browser credential or database credential, **and** its independent build, release, health, OAuth callback, and least-privilege configuration are documented.
2. **Given** a normal traveler accesses the admin application or API capability, **when** authorization is evaluated, **then** the request is denied server-side without disclosing protected data or navigation, **and** the same API authorization matrix governs the admin BFF and controllers.

## Approved Identity Handoff

**Approved 2026-08-01.** The API Identity boundary owns the Google OAuth transaction, the authoritative admin-session store, and session validation. `apps/admin` owns the host-only browser cookie and the `xuyenviet-admin-bff` credential signer, but never has database access.

1. Admin sign-in and callback routes are thin server-side adapters. They forward OAuth start/callback data only to a private, service-authenticated API Identity handoff endpoint. The API owns OAuth state, PKCE verifier, Google code exchange, user/account resolution, and role lookup; the admin runtime never receives provider tokens.
2. After a successful callback, API Identity creates a random opaque admin session, persists only its protected server-side representation, and returns the opaque session identifier to the admin BFF over the private channel. The admin response sets it only as a distinct `__Host-` cookie for `admin.xuyenviet.app` (`Secure`, `HttpOnly`, `Path=/`, no `Domain` attribute). OAuth transaction cookies are similarly host-only and are removed after the callback.
3. For every protected admin BFF request, `apps/admin` sends the opaque session identifier only through the private service-authenticated handoff channel. API Identity resolves the session and fails closed unless it is live, belongs to the requested subject, is unrevoked/unexpired, and has current authorization-version and `operator` or `admin` authority. It returns only the allowlisted subject, session reference, current authorization version, and roles required for credential minting.
4. Only after a successful handoff, the admin BFF mints a five-minute, non-refreshable ES256 credential with issuer `xuyenviet-admin-bff`, audience `api.railway.internal`, bounded allowlisted claims, random token ID, and its isolated active signing key. The private key is an admin-only environment secret; API receives only active plus one bounded previous public verification key. Web and admin keys, issuers, cookies, CSRF secrets, OAuth redirects, and service identities are separate.
5. API resource-server validation remains authoritative: it verifies signature, `kid`, issuer, audience, time bounds, token ID, `sid`, and `rv`, then resolves the live session and current authorization version from its identity repository before creating `RequestPrincipal`. Exact-admin capabilities re-check `admin` server-side. Logout/revocation invalidates the stored session; any role change increments authorization version, invalidating already minted credentials.
6. Admin BFF unsafe cookie-authenticated routes perform exact admin-origin, Fetch Metadata, and signed double-submit CSRF validation before handoff, minting, or API invocation. API remains bearer-only, does not parse browser cookies, and sends no CORS allow-origin response.
7. Least privilege is mandatory: `apps/admin` receives Google public client/callback configuration, its own session/CSRF/signing material, private API URL, and identity-handoff service authentication only. It receives neither `DATABASE_URL`, database credentials, root web secrets/cookies, API private verification material, nor raw provider tokens. API Identity alone owns database and Google client-secret access.

Required failure-mode proof: valid sign-in; host-only cookie isolation; root-cookie rejection; malformed/replayed OAuth state rejection; expired/revoked session rejection; logout; role-change authorization-version invalidation; unavailable/invalid handoff rejection before minting; web/admin signer and issuer isolation; CSRF/origin rejection before handoff; browser non-disclosure; API identity-store unavailability; and no admin database import or credential path.

## Tasks / Subtasks

- [x] Implement the approved admin identity handoff before creating a deployable app (AC: 1, 2)
  - [x] Use the API Identity boundary as the trusted OAuth/session authority and private service-authenticated handoff endpoint; keep the admin BFF as the host-only cookie owner and isolated admin credential signer.
  - [x] Add the required failure-mode tests in **Approved Identity Handoff**, including malformed/replayed OAuth state and handoff failure before credential minting.
  - [x] Do not copy `src/auth.ts`, `src/server/bff-session-token.ts`, or `src/server/bff-credentials.ts` into the admin app: all currently verify sessions/roles against Drizzle and are therefore incompatible with the no-direct-database requirement.
  - [x] Reuse the existing API resource-server model: bounded ES256 credentials, issuer `xuyenviet-admin-bff`, audience `api.railway.internal`, only allowlisted claims, and API-side session/authorization-version verification. Admin private signing material is isolated from the web issuer; API receives public verification material only.
- [x] The approved gate is satisfied without granting the admin runtime database credentials or loosening the browser/API boundary.

- [x] Create a separately buildable, deployable admin Next.js BFF runtime (AC: 1)
  - [x] Add `apps/admin` as its own Next.js application with its own package metadata, TypeScript configuration, root layout, sign-in/callback routes, protected landing route, and Vietnamese-first operator shell. It must not import root `src/*` aliases, root Next app modules, Drizzle/database packages, domain mutation modules, or files marked `"use server"`.
  - [x] Give the admin app a distinct host-only Auth.js cookie name, callback/sign-in paths, and origin for `admin.xuyenviet.app`; never set a `.xuyenviet.app` cookie domain or share `xuyenviet.session-token` with traveler web.
  - [x] Keep the browser-to-admin interaction session/cookie based. The admin BFF alone mints the short-lived internal credential and calls `https://api.railway.internal`; do not expose internal tokens, JWKs, private API URLs, database URLs, provider credentials, raw API errors, or operator-only data to browser JavaScript.
  - [x] Provide admin-local BFF API adapters that preserve the existing request ID, abort/timeout, origin, Fetch Metadata, signed double-submit CSRF, bounded DTO projection, safe error mapping, and declared-only idempotency-key rules. Generalize shared config only where both web and admin genuinely need it; do not make the generic adapter a domain owner.

- [x] Enforce server-side operator access and API authorization alignment (AC: 2)
  - [x] The admin shell and every BFF route must deny unauthenticated users and users without `operator` or `admin` before a protected API call, read, navigation response, or mutation is performed. Exact `admin` remains required for role governance and AI model catalog changes.
  - [x] Add an explicit API capability-authorization seam. `ResourceServerGuard` authenticates and normalizes a principal but does not authorize individual operator capabilities; controllers/use cases must enforce the same role matrix server-side, independent of admin UI checks.
  - [x] Preserve private API properties: bearer-only API requests, no cookie parsing in Nest, no direct-browser API path, no CORS allow-origin response, and safe error envelopes only.

- [x] Add independent readiness, build, and release boundaries (AC: 1)
  - [x] Implement `/api/health` liveness/readiness in `apps/admin`, reusing `schemaCompatibilityDeclarations.admin`, `futureAdminSchemaCompatibilityConsumer`, approved release-policy parsing, and the fail-closed one-row release admission semantics. Do not duplicate release-version evaluation or expose schema/matrix/target data in health output.
  - [x] Add an `admin-runner` Docker target and, if Compose remains supported, a separate admin service/health check. Include deployment-owned `docs/release-matrices` and set `SCHEMA_RELEASE_MATRIX_DIRECTORY`; preserve the independent API/web/Worker targets.
  - [x] Update root build/typecheck orchestration to include admin without merging its start/release lifecycle into traveler web. Keep `pnpm-lock.yaml` authoritative.
  - [x] Document independent Railway service selection, private API route, migration-before-traffic dependency, readiness probe, OAuth callback/redirect configuration, host-only cookie behavior, required least-privilege environment variables, and the fact that staging/private-network evidence must be collected outside repository tests.

- [x] Prove boundary and denial behavior (AC: 1, 2)
  - [x] Add tests for distinct admin session/CSRF cookie namespaces and callback origin; prove root traveler cookie values cannot authenticate admin and no cookie has a parent-domain scope.
  - [x] Add credential tests for admin issuer acceptance, web/admin signing-key isolation, exact claim/lifetime limits, revoked/expired session rejection, and authorization-version invalidation after role changes.
  - [x] Add BFF/API integration coverage proving traveler/anonymous requests are denied at both layers before protected data or navigation is returned; prove exact-admin-only capabilities reject an operator.
  - [x] Add static/import and runtime tests proving admin has no database credential/import path, browser output contains no API credential/session token/private JWK, and private API calls carry only bearer/request-ID/allowed DTO headers.
  - [x] Add admin readiness/build/container tests for malformed config, invalid/missing release policy, unavailable/incompatible release state, and a successful compatible admin runtime. Preserve existing web/API/Worker tests.
  - [x] Run focused tests plus `pnpm lint`, `pnpm typecheck`, `pnpm build`, relevant Docker/Compose checks, and `git diff --check`. Record exact commands and external staging blockers in the Dev Agent Record.

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

**PASS - ready for development.** The approved API Identity handoff keeps OAuth/session authority and database access outside `apps/admin`, while the admin BFF retains an isolated host-only browser boundary and credential signer. The required fail-closed identity, key-isolation, revocation, CSRF, and non-disclosure tests are explicit.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Implementation and Acceptance Evidence

- `apps/admin` is an independently buildable Next.js BFF. Its host-only `__Host-xuyenviet-admin-*` cookies, private API handoff, isolated ES256 signer, CSRF checks, safe BFF transport, and health route are covered by the Story 13.1 focused suite.
- API Identity owns OAuth transactions, PKCE verifier, Google exchange, opaque session creation, live session handoff, and revocation. The `/oauth/start` callback validator now requires the exact `https://admin.xuyenviet.app` origin, rejects URL credentials and non-default ports, and permits only `/api/auth/callback` without query or fragment.
- API capability authorization is separate from credential authentication; the focused suite proves operator denial for an exact-admin capability before handler work.
- The admin Docker target and Compose profile are present, root build/typecheck include the admin workspace, and documentation records the Railway/private-network/least-privilege boundary.

### Review Outcome

- Epic 13 completion review found a HIGH release-admission defect in `apps/api/src/auth/admin-identity.controller.ts`: when `SCHEMA_RELEASE_PHASE_POLICY` was absent, the admin declaration admitted `20260729.1`, while the API request boundary correctly admits only `20260728.1` without a bound policy. Keep this story in progress until identity admission pins policy-free maximum version to `20260728.1`, regression coverage proves rejection at `20260729.1`, and follow-up review verifies fail-closed alignment.
- Synchronous final repair review found the OAuth callback validator previously accepted credential-bearing URLs because it compared only protocol and hostname. The validator now compares `url.origin` to the exact production origin and additionally rejects non-empty URL credentials.
- Focused regression coverage rejects username-only, username/password, and non-default-port callback URLs before any OAuth transaction is created. No additional findings were identified in the repaired scope.
- Final critical repair replaced interface/inline identity request bodies with concrete SafeValidationPipe DTOs and added Nest HTTP validation coverage for every identity endpoint. Admin sessions now persist only an API-keyed HMAC lookup value; the migration invalidates existing sessions because their opaque bearer values cannot be safely transformed. Identity OAuth, handoff, and revocation fail closed while release admission is unavailable or incompatible. Admin private API and handoff configuration reject explicit non-default ports.
- Final synchronous Blind Hunter, Edge Case Hunter, and Acceptance Auditor review completed with no actionable local findings. External staging evidence remains explicitly deferred to deployment owners.

### Verification

- PASS: `pnpm vitest run tests/story-13-1-final-repair.test.ts` - 1 file and 16 tests passed. The suite applies local test migrations through its established global setup.
- PASS: `pnpm lint` - completed with 0 errors and 5 pre-existing unused-variable warnings in unrelated test files.
- PASS: `pnpm build` - web, admin, API, and Worker builds completed successfully.
- PASS: `pnpm typecheck` - completed successfully after `pnpm build` regenerated stale root `.next/types` files. The first run before build failed only because TypeScript included missing stale generated root Next type files.
- PASS: `docker build --target admin-runner -t xuyenviet-admin-runner:story-13-1 .` - completed successfully.
- PASS: `WEB_ENV_FILE=.web.env.example API_ENV_FILE=.api.env.example WORKER_ENV_FILE=.worker.env.example ADMIN_ENV_FILE=.admin.env.example docker compose --profile admin config --quiet` - completed successfully. The default command remains intentionally blocked when local `.admin.env` is absent.
- PASS: `git diff --check` - no whitespace errors.
- PASS: `pnpm vitest run tests/admin-identity-routes.test.ts tests/story-13-1-final-repair.test.ts tests/api-request-principal.integration.test.ts tests/bff-transport.test.ts tests/schema-release-matrix-artifact.test.ts` - 5 files and 81 tests passed, including actual Nest route validation, HMAC-only session persistence/functional revocation, release-admission denial, and private/handoff port rejection.

### External Staging Evidence Still Required

- Deployment owner must select the Railway `admin-runner` target, provision the separate admin service, and retain the private `https://api.railway.internal` route without public browser access.
- Deployment owner must run the migration-before-traffic release process and retain evidence of admin and API readiness probes after deployment.
- Deployment owner must configure DNS/TLS for `admin.xuyenviet.app` and register the exact Google redirect URI `https://admin.xuyenviet.app/api/auth/callback`.
- Deployment owner must demonstrate staging sign-in, host-only cookie isolation, private handoff connectivity, logout/revocation, and denied traveler/anonymous access using deployment secrets and live identity state. These cannot be proven from repository tests or local Compose.
