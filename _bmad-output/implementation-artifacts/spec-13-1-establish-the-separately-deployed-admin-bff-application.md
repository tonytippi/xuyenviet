---
title: 'Establish the Separately Deployed Admin BFF Application'
type: 'feature'
created: '2026-08-01'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: 'f29c2cf'
baseline_revision: 'f55851f'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/13-1-establish-the-separately-deployed-admin-bff-application.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-13-context.md'
warnings: [oversized, multiple-goals]
---

> **Schema-admission portions superseded on 2026-08-05.** The admin deployment and identity record remains historical context, but release matrices, `SCHEMA_RELEASE_*` policy, and global schema-version readiness were removed. See `ARCHITECTURE-SPINE.md` AD-3 for the active contract.

<intent-contract>

## Intent

**Problem:** The operator console is coupled to the traveler Next runtime and direct database-backed Auth.js helpers. It cannot be independently deployed or securely access the private API without exposing database, OAuth-provider, or internal credential material to the browser or admin runtime.

**Approach:** Establish API-owned OAuth/session/authorization handoff operations and an isolated `apps/admin` Next BFF. The BFF holds only host-only opaque cookies and its own ES256 signer, requests live authorization from API Identity before every mint, and calls the private bearer-only API.

## Boundaries & Constraints

**Always:** API Identity owns OAuth state, PKCE, Google exchange, provider secrets, persistent sessions, revocation, roles, authorization-version checks, readiness admission, and database access. Admin owns only `__Host-` browser cookies, CSRF material, isolated `xuyenviet-admin-bff` signing key, and private service authentication. Credentials are ES256, five minutes or less, non-refreshable, audience `api.railway.internal`, have only allowlisted claims, and never reach browser output. API authentication remains in `ResourceServerGuard`; capability authorization uses the same operator/admin matrix at the BFF and API boundary. Unsafe cookie-authenticated BFF requests reject invalid exact origin, Fetch Metadata, or signed double-submit CSRF before handoff, minting, or API calls. Health fails closed without revealing deployment state. Preserve bearer-only/no-CORS API behavior and Vietnamese-first admin presentation.

**Block If:** The existing data model cannot represent API-owned opaque admin OAuth/session state, or the private service-authenticated handoff/readiness channel cannot be established without giving `apps/admin` database/provider credentials or weakening the API/browser boundary.

**Never:** Import root `src/*` aliases, Auth.js, legacy `/admin`, server actions, database/Drizzle/domain mutation packages, `DATABASE_URL`, provider secrets/tokens, root session/cookie/CSRF material, or API private verification keys into `apps/admin`. Do not migrate or retire legacy admin capabilities, add browser-to-API access/CORS, duplicate release admission evaluation, or claim external Railway/DNS/OAuth/staging proof.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin sign-in | Valid operator Google callback through admin adapter | API consumes one OAuth state, creates opaque admin session; BFF sets only host-only session cookie | No provider token or session value in browser payload |
| Invalid OAuth | Malformed, mismatched, or replayed state | No session or credential is created | Safe generic failure; transaction is not reusable |
| Protected request | Live operator/admin cookie, valid handoff | BFF mints bounded admin credential and private API authorizes declared capability | No credential/cookie/private URL leaves BFF |
| Stale authority | Expired/revoked session, changed authorization version, unavailable/invalid handoff | BFF does not mint or invoke API; API rejects stale already-minted bearer credential | Safe denial/unavailable response, no protected navigation/data |
| Authorization matrix | Traveler/anonymous or operator calling exact-admin capability | BFF and API deny before protected work; admin admits exact admin | API returns safe 401/403 without CORS or cookies |
| Readiness | Invalid config, policy, private admission, or incompatible release state | `/api/health` is not ready | Fail closed with no matrix/schema/target/secret disclosure |

</intent-contract>

## Code Map

- `apps/api/src/auth/resource-server.guard.ts` -- retain strict bearer authentication and live session/`rv` validation; adapt API-owned session lookup only where necessary.
- `apps/api/src/auth/` and `packages/database/src/` -- API Identity handoff, opaque transaction/session persistence, service authentication, readiness admission, and capability authorization seam.
- `packages/contracts/src/index.ts` -- existing issuer/role/credential/schema contracts; add bounded identity-handoff and capability declarations.
- `packages/config/src/index.ts` -- strict admin signer, origin/CSRF/service-auth config while retaining verification-only API keys and release-policy parsing.
- `apps/admin/` -- isolated Next BFF, cookies, handoff client, signer, private adapters, protected Vietnamese shell, and health route.
- `Dockerfile`, `compose.yaml`, `package.json`, `docs/release-matrices/`, `.env.example`, `README.md` -- independent build/release/readiness and deployment runbook.
- `tests/` -- existing BFF credential/transport, API principal, schema-admission, and bundled runtime test patterns plus focused admin boundary coverage.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/index.ts`, `packages/config/src/index.ts` -- define strict admin-only handoff, capability, signer, transport, CSRF, and service configuration contracts without relaxing web/API isolation.
- [x] `packages/database/src/index.ts`, `apps/api/src/auth/*`, `apps/api/src/app.module.ts` -- implement API-owned OAuth state/PKCE/code exchange, opaque admin sessions, validation/revocation, private service handoff/readiness operations, and fail-closed identity storage behavior.
- [x] `apps/api/src/auth/*` and focused controller/test seam -- add declared capability matrix/guard separate from `ResourceServerGuard`; prove operator/admin and exact-admin authorization occurs before protected work.
- [x] `apps/admin/**` -- create a separately buildable Next BFF with independent config/package metadata, host-only session and transaction cookies, signed double-submit CSRF, thin sign-in/callback/logout adapters, live identity handoff before signing, bounded ES256 credential minting, safe private API adapters, protected Vietnamese shell, and fail-closed health route.
- [x] `Dockerfile`, `compose.yaml`, `package.json`, docs and release matrices -- add independent `admin-runner`, optional Compose service/health check, root build/typecheck inclusion, deployment-owned matrices, and least-privilege/Railway/OAuth/private-network/migration runbook documentation.
- [x] `tests/**` -- prove OAuth malformed/replay rejection, host-only isolation/root-cookie rejection, CSRF/origin ordering, no-DB/import/config leakage, session expiration/revocation/logout/role-change invalidation, signer/issuer isolation and claims, BFF/API capability denials, browser non-disclosure, readiness failure/success, build/container/Compose boundaries.
- [x] Verification -- run focused tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, relevant Docker/Compose checks, and `git diff --check`; record exact external staging evidence still required.
- [x] `apps/api/src/auth/admin-identity.controller.ts`, `tests/story-13-1-final-repair.test.ts` -- classify Google token/UserInfo upstream `429` and `5xx` responses as redacted retryable `503 internal_error` before payload parsing, while retaining OAuth credential and malformed-payload authentication denial regressions.

**Acceptance Criteria:**
- Given a staging deployment with valid operator sign-in, when the admin BFF completes the API-owned OAuth/session handoff, then it uses a distinct host-only session, an isolated admin issuer/signer, and private API connectivity without browser/database credentials, and its independent lifecycle/configuration is documented.
- Given an anonymous/traveler or insufficiently privileged operator reaches the admin BFF or protected API capability, when roles are evaluated, then the request is server-side denied before navigation/data/work, API and BFF use the same declared authorization matrix, and safe responses disclose no protected data.

## Spec Change Log

## Review Triage Log

### 2026-08-01 — Final review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - Final Blind Hunter, Edge Case Hunter, and Acceptance Auditor pass found no actionable local findings after bounded security repairs.

### 2026-08-01 — Policy-Free Admission Repair Review
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

### 2026-08-02 — OAuth upstream classification review
- intent_gap: 0
- bad_spec: 0
- patch: 1 (low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[low]` `[patch]` Reject empty provider `access_token` and `sub` fields as malformed authentication-denial payloads before UserInfo or role/session work.

### 2026-08-02 — OAuth upstream classification final review
- intent_gap: 0
- bad_spec: 0
- patch: 1 (low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[low]` `[patch]` Reject whitespace-only provider `access_token` and `sub` fields as malformed authentication-denial payloads.

### 2026-08-02 — OAuth upstream classification confirmation
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

## Design Notes

The existing root Auth.js and credential modules are intentionally unsuitable because they query Drizzle directly. Do not extract their database behavior. Generalize only neutral validation/cryptographic/transport policy. Admin readiness must obtain a private API allow/deny admission result because database-backed web readiness is forbidden in the admin workload.

## Verification

**Commands:**
- `pnpm vitest run tests/api-request-principal.integration.test.ts tests/bff-credentials.test.ts tests/bff-transport.test.ts` -- identity, credentials, capability, transport, and no-CORS behavior pass.
- `pnpm vitest run tests/*admin* tests/*schema* tests/bundled-runtime-startup.test.ts` -- admin isolation/readiness/runtime regressions pass.
- `pnpm lint` -- no lint errors.
- `pnpm typecheck` -- all workspace TypeScript checks pass.
- `pnpm build` -- traveler, API, worker, and independent admin builds pass.
- `docker build --target admin-runner .` -- deployable isolated admin image builds.
- `docker compose config` -- independent admin service topology validates when Compose is supported.
- `git diff --check` -- no whitespace errors.

## Implementation Record

### Completed Work

- Added the `apps/admin` standalone Next.js BFF workspace with a Vietnamese operator shell, separate build/typecheck lifecycle, host-only `__Host-xuyenviet-admin-*` cookie names, thin sign-in/callback/logout adapters, protected server-side landing route, and fail-closed private API readiness route.
- Added API-owned admin identity operations: service-authenticated OAuth transaction start/callback, one-time state consumption, PKCE verifier persistence, Google exchange inside the API, opaque session creation/revocation, live identity handoff, and readiness admission. The admin runtime has no database dependency or provider credential path.
- Added the shared admin capability matrix plus API capability guard seam. `operator | admin` is admitted for ordinary admin workspace capability; exact `admin` remains required for role governance and AI model catalog writes.
- Added isolated admin signer/config validation, API private handoff configuration, OAuth transaction persistence migration, independent Docker `admin-runner` target, Compose `admin` service/health check, root workspace orchestration, and deployment/runbook documentation.
- Added focused admin boundary tests for host-only cookie namespace/isolation and the shared capability matrix. Existing credential tests continue to cover bounded ES256 claim/security behavior and issuer-key isolation.
- Repaired the OAuth callback transaction cookie to be host-only `SameSite=Lax`, while retaining host-only strict session and CSRF cookies. Added `GET /api/auth/csrf`, which returns only a signed CSRF token and sets its distinct non-HttpOnly cookie.
- Made logout fail safe: a failed or unconfirmed API revocation leaves the admin session cookie intact and returns a safe unavailable response. Sign-in now uses `getAdminBffConfig()` through the shared bounded handoff client rather than direct environment reads.
- Bounded API Identity Google token and userinfo calls with a five-second abort timeout.
- Added the bounded, non-disclosing `GET /v1/admin/workspace` capability protected by `@RequiresAdminCapability("admin.workspace.read")`, plus the admin BFF `GET /api/workspace` adapter. This is Story 13.1 bootstrap proof only; no legacy Story 13.2 capability was migrated or retired.
- Added split `.web.env.example`, `.worker.env.example`, `.api.env.example`, and `.admin.env.example` templates. Compose defaults now require the corresponding separate runtime files and include an API service; the admin profile remains explicitly non-e2e locally because Compose does not supply the deployed HTTPS/private-network OAuth boundary.
- Revoke now requires a live identity handoff for the same opaque session and subject before API Identity revokes it; the admin logout client resolves that live subject first and retains its cookie on every failed or unconfirmed step.
- API Identity purges at most 100 expired admin OAuth transactions before creating a new transaction and fails closed if that bounded cleanup is unavailable.
- The bundled runtime fixture now supplies isolated web/admin ES256 verifier keys and key IDs plus the required API identity service token. Explicit `Reflector` injection keeps the API's bundled global admin-capability guard functional, including public liveness routes.
- The API admin-capability guard now requires the `xuyenviet-admin-bff` issuer in addition to the declared role matrix; a web-issued operator bearer is denied before the workspace handler runs.
- API Identity resolves Google-account roles before creating an admin session and denies traveler-only accounts without creating any session.
- Admin BFF identity and private-adapter authorization failures project as safe `unauthorized`/`forbidden` results, allowing routes to return 401/403; configuration, transport, and unavailable-service failures remain safe 503 responses.
- Final repair uses concrete SafeValidationPipe DTOs for every API Identity request body, stores only keyed HMAC admin-session lookup values in the database, fails closed for OAuth/handoff/revocation while release admission is unready, and rejects non-default private API/handoff ports.

### Verification Results

- PASS: `pnpm vitest run tests/admin-boundary.test.ts tests/bff-credentials.test.ts` (2 files, 9 tests).
- PASS: `pnpm lint` (0 errors; 5 pre-existing unused-variable warnings in unrelated test files).
- PASS: `pnpm typecheck` (root, admin, worker-domain, API, and worker).
- PASS: `pnpm build` (traveler web, independent admin, API, and worker).
- PASS: `docker build --target admin-runner .`.
- PASS: `ADMIN_ENV_FILE=.env docker compose config`.
- PASS: `git diff --check`.
- PASS: `pnpm vitest run tests/admin-boundary.test.ts tests/story-13-1-final-repair.test.ts tests/api-request-principal.integration.test.ts` (3 files, 23 tests), including actual Nest metadata/guard route authorization, bearer-only root-cookie rejection, safe denial, OAuth timeout signal, CSRF isolation, and identity failure handling.
- PASS: `pnpm typecheck`.
- PASS: `pnpm vitest run tests/admin-identity-routes.test.ts tests/story-13-1-final-repair.test.ts tests/api-request-principal.integration.test.ts tests/bff-transport.test.ts tests/schema-release-matrix-artifact.test.ts` (5 files, 81 tests), including actual Nest DTO validation, no plaintext admin session storage, functional keyed lookup/revocation, release-admission denial, and private/handoff port rejection.
- PASS: `pnpm --filter @xuyenviet/admin build`.
- PASS WITH PRE-EXISTING WARNINGS: `pnpm lint` (0 errors; 5 unrelated unused-variable warnings in existing test files).
- PASS: `git diff --check`.
- EXPECTED FAIL-CLOSED: `docker compose config` without split `.web.env` / `.api.env` / `.worker.env` / `.admin.env` files reports the missing `.web.env`; no local Compose readiness claim was made.
- PASS: Follow-up repair focused tests: `pnpm vitest run tests/admin-identity-routes.test.ts tests/story-13-1-final-repair.test.ts tests/admin-boundary.test.ts tests/api-request-principal.integration.test.ts` (4 files, 27 tests). These verify admin-only readiness declaration/admission, missing `Sec-Fetch-Site` rejection, actual workspace-route adapter delegation and generated/forwarded request IDs, admin credential claims/key isolation, traveler-cookie rejection, and callback-origin denial.
- PASS WITH PRE-EXISTING WARNINGS: `pnpm lint` (0 errors; 5 unrelated existing unused-variable warnings).
- PASS: `pnpm typecheck`.
- PASS: `pnpm build` and `docker build --target admin-runner .` (the independent build resolves its required Next ESLint peers).
- PASS: `ADMIN_ENV_FILE=.admin.env.example WEB_ENV_FILE=.web.env.example API_ENV_FILE=.api.env.example WORKER_ENV_FILE=.worker.env.example docker compose config`.
- PASS: `git diff --check`.
- PASS: Final review repair: `pnpm vitest run tests/bff-credentials.test.ts tests/story-13-1-final-repair.test.ts` (2 files, 18 tests). Verification configuration now rejects every web/admin active-or-previous verifier `kid` or public-key overlap, preserving issuer signing isolation.
- PASS: `pnpm typecheck`, `pnpm build`, and `docker build --target admin-runner .` after final review repair.
- PASS WITH PRE-EXISTING WARNINGS: `pnpm lint` (0 errors; 5 unrelated existing unused-variable warnings).
- PASS: `ADMIN_ENV_FILE=.admin.env.example WEB_ENV_FILE=.web.env.example API_ENV_FILE=.api.env.example WORKER_ENV_FILE=.worker.env.example docker compose config` after final review repair.
- PASS: `pnpm vitest run tests/story-13-1-final-repair.test.ts tests/bff-credentials.test.ts` (20 tests), including live session/subject-bound revoke and bounded fail-closed OAuth transaction cleanup.
- PASS: `pnpm vitest run tests/bundled-runtime-startup.test.ts` with isolated web/admin verifier keys and bundled API public liveness.
- PASS: clean-state `pnpm build` after removing `.next`, `apps/admin/.next`, `apps/api/dist`, and `apps/worker/dist`; the root, admin, API, and Worker builds completed without the `pages-manifest.json` ENOENT.
- PASS: `pnpm typecheck`, `docker build --target admin-runner .`, `ADMIN_ENV_FILE=.admin.env.example WEB_ENV_FILE=.web.env.example API_ENV_FILE=.api.env.example WORKER_ENV_FILE=.worker.env.example docker compose config`.
- PASS: `pnpm vitest run tests/story-13-1-final-repair.test.ts tests/api-request-principal.integration.test.ts tests/admin-identity-routes.test.ts tests/bff-credentials.test.ts` (4 files, 38 tests), including web-issued operator denial at the protected API route, traveler OAuth rejection before session creation, and workspace-route 401/403 projection.
- PASS: `pnpm typecheck`.

### External Evidence Still Required

- Railway service selection, private-network reachability, migration-before-traffic execution, admin DNS, Google redirect registration, staging readiness probe, and least-privilege secret provisioning are deployment-owned actions and were not claimed or performed locally.

## Auto Run Result

- Summary: Repaired policy-free API Identity release admission so identity operations share the API's `20260728.1` ceiling and reject `20260729.1` without `SCHEMA_RELEASE_PHASE_POLICY`.
- Files changed: `apps/api/src/release-schema.ts` centralizes the API policy-free compatibility declaration; `apps/api/src/auth/admin-identity.controller.ts` derives the admin policy-free declaration from that ceiling; `tests/story-13-1-final-repair.test.ts` proves handoff admission and rejection.
- Review: Blind Hunter, Edge Case Hunter, and Acceptance Auditor completed with no actionable findings; no deferred or rejected findings.
- Verification: Focused identity and schema tests, typecheck, lint, build, and `git diff --check` passed. Lint retained five pre-existing unrelated warnings.
- Residual risks: Deployment-owned Railway/private-network/OAuth/DNS/migration-readiness evidence remains required as previously recorded.

### 2026-08-02 OAuth Upstream Classification Repair

- Summary: Google token and UserInfo upstream `429` and `5xx` responses now map to the existing redacted retryable `503 internal_error` before JSON parsing. Normal OAuth credential-denial `4xx` responses and malformed provider payloads, including missing, empty, and whitespace-only required fields, remain authentication denials.
- Files changed: `apps/api/src/auth/admin-identity.controller.ts` classifies retryable Google statuses and validates usable provider fields; `tests/story-13-1-final-repair.test.ts` proves the stage-by-stage separation.
- Review: Blind Hunter, Edge Case Hunter, and Acceptance Auditor completed. Two low localized malformed-field patches were applied; no findings were deferred or rejected, and the final confirmation was clean.
- Follow-up review recommendation: false. The final changes are localized and the post-repair confirmation review was clean.
- Verification: `pnpm vitest run tests/story-13-1-final-repair.test.ts tests/admin-identity-routes.test.ts` (25 tests), `pnpm typecheck`, `pnpm lint` (0 errors; 5 existing unrelated warnings), `pnpm build`, and `git diff --check` passed.
- Residual risks: Deployment-owned Railway/private-network/OAuth/DNS/migration-readiness evidence remains required as previously recorded.
