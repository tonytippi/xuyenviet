---
title: 'Retire Auth.js, BFF runtime, and legacy transport'
type: 'refactor'
created: '2026-08-03'
status: 'done'
baseline_revision: '1015389'
final_revision: '1015389'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-14-context.md'
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** Auth.js, root `/admin`, root BFF routes/helpers, bearer-principal admission, and their deployment contracts remain after traveler and admin direct-API cutovers. They preserve obsolete authentication and transport owners that contradict the approved Nest browser-session clean break.

**Approach:** Prove the remaining owner inventory, remove browser-facing Auth.js/BFF/legacy Next ownership, make Nest browser-session-only, and retain or relocate only worker/readiness behavior that does not require a browser session.

## Boundaries & Constraints

**Always:** Keep Nest as the sole OAuth, opaque-session, CSRF, origin-admission, and `RequestPrincipal` authority. Preserve valid direct browser session behavior, package/domain worker behavior, safe API contracts, and one writer per aggregate. Treat Auth.js sessions as non-adoptable: users authenticate through Nest after deployment. Test integration behavior serially with `DATABASE_URL_TEST`.

**Block If:** A module still has a live non-browser worker, readiness, or deployed consumer whose behavior cannot be preserved without Auth.js, or any removal would leave a current browser capability without its completed Nest replacement.

**Never:** Do not add compatibility sessions, bearer/BFF fallback, transport selection, shadow reads, root Next route/server-action writers, direct root database owners, session migration, or destructive deletion of the historical Auth.js database table/data without a separately approved retention migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Protected direct API request | Valid Nest cookie, allowed Origin, and CSRF proof for mutation | Nest admits the current browser-session principal and executes the existing direct API capability | Invalid/expired/revoked session or invalid Origin/CSRF returns the existing safe envelope before domain work |
| Obsolete credential request | `Authorization: Bearer` header with any former BFF credential | No bearer principal is constructed and protected capability is not admitted | Safe unauthenticated/forbidden response without token or configuration disclosure |
| Legacy runtime request | Request to removed Auth.js or BFF Next route | No route, session issuance, bearer minting, relay, or root admin capability remains | Next returns normal absence semantics; no legacy fallback is introduced |
| Retained worker/readiness behavior | Existing non-browser operation formerly imports Auth.js helper/type | Operation uses an explicit package-owned principal/executor or is removed when obsolete | Stop implementation if its production behavior cannot be preserved safely |

</intent-contract>

## Code Map

- `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/server/auth.ts`, `src/features/auth/actions.ts`, `src/types/next-auth.d.ts` -- Auth.js authority, route, session resolver, and sign-out type/action boundary to retire.
- `src/app/admin/layout.tsx` -- final root `/admin` presentation/auth gate; the separately deployed `apps/admin` is its replacement.
- `src/app/api/bff/session/route.ts`, `src/server/bff-credentials.ts`, `src/server/bff-session-token.ts`, `src/server/bff-api-client.ts`, `src/server/csrf.ts`, `src/server/protected-bff-adapter.ts`, `src/server/mutations.ts` -- root BFF/session/mutation ownership to remove after consumer disposition.
- `src/features/chat-trips/*`, `src/features/knowledge/*`, `src/features/feedback/evaluation.ts` -- legacy Auth.js-coupled wrappers; retain only package/worker/readiness behavior after explicit session-boundary extraction.
- `apps/api/src/auth/resource-server.guard.ts`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/openapi.controller.ts` -- API bearer admission/config/OpenAPI path to remove while retaining browser sessions.
- `packages/contracts/src/index.ts`, `packages/config/src/index.ts` -- obsolete BFF issuer, principal transport, credential, signing, CSRF, and transport configuration contracts.
- `package.json`, `pnpm-workspace.yaml`, `patches/next-auth@5.0.0-beta.31.patch`, `pnpm-lock.yaml` -- Auth.js dependency and patch retirement.
- `.env.example`, `.web.env.example`, `apps/api/.env.example`, `src/server/env.ts`, `Dockerfile`, `README.md` -- active runtime configuration and deployment documentation to align with direct Nest access.
- `tests/browser-identity.integration.test.ts`, `tests/api-platform-contract.test.ts`, `tests/bundled-runtime-startup.test.ts`, direct API/admin tests -- browser-only admission and runtime factories to retain/update.
- `tests/bff-*.test.ts`, `tests/auth-*.test.ts`, `tests/admin-roles.test.ts`, inventory tests -- obsolete test removal/replacement and zero-owner proof.

## Tasks & Acceptance

**Execution:**
- [x] `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/server/auth.ts`, `src/features/auth/actions.ts`, `src/types/next-auth.d.ts`, and `src/app/admin/layout.tsx` -- retired after confirming `apps/admin` remains the direct API replacement.
- [x] `src/app/api/bff/session/route.ts`, `src/server/bff-credentials.ts`, `src/server/bff-session-token.ts`, `src/server/bff-api-client.ts`, `src/server/csrf.ts`, `src/server/protected-bff-adapter.ts`, and `src/server/mutations.ts` -- removed obsolete BFF session, bearer, relay, CSRF, and mutation owners.
- [x] `src/features/chat-trips/*`, `src/features/knowledge/*`, `src/features/feedback/evaluation.ts`, `packages/domain/*`, `packages/database/*`, and `apps/worker/*` -- removed root Auth.js-coupled wrappers and retained package/worker behavior without root session imports.
- [x] `apps/api/src/auth/resource-server.guard.ts`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/openapi.controller.ts`, `packages/contracts/src/index.ts`, and `packages/config/src/index.ts` -- removed bearer configuration, claims, principal transport, JWT verification, bootstrap inputs, and OpenAPI bearer security while retaining browser-session admission.
- [x] `package.json`, `pnpm-workspace.yaml`, `patches/next-auth@5.0.0-beta.31.patch`, `pnpm-lock.yaml`, `.env.example`, `.web.env.example`, `apps/api/.env.example`, `src/server/env.ts`, `Dockerfile`, and `README.md` -- removed active Auth.js/BFF dependencies, configuration, and documentation; regenerated the lockfile with pnpm.
- [x] `tests/bff-*.test.ts`, `tests/auth-*.test.ts`, `tests/admin-roles.test.ts`, `tests/browser-identity.integration.test.ts`, `tests/api-platform-contract.test.ts`, `tests/bundled-runtime-startup.test.ts`, and a new retirement inventory test -- replaced legacy coverage with zero-owner and browser-session-only admission proof.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- recorded the final retirement inventory, retained historical database-table decision, verification results, and Story 14.6-only deployment evidence deferred.

**Acceptance Criteria:**
- Given Story 14.2 through 14.4 direct replacements are complete, when the retirement inventory runs, then no live Auth.js runtime, BFF route/helper/credential, root `/admin` operational route, legacy Next domain route, or server-action writer remains.
- Given a browser accesses a protected migrated capability, when it presents a valid Nest opaque session and required Origin/CSRF inputs, then the existing Nest direct API behavior succeeds without a BFF credential or Auth.js session.
- Given any bearer header or former BFF configuration, when it reaches a protected API, then it cannot create a principal or execute a capability and the safe response discloses no authentication internals.
- Given a retained Worker or readiness path previously depended on root auth code, when Story 14.5 completes, then it uses an explicit non-browser package/domain boundary or is retired, and no production import reaches Auth.js/root session resolution.
- Given runtime configuration, dependency, OpenAPI, deployment documentation, and tests are inspected, when the retirement is complete, then none presents BFF/Auth.js as active architecture; historical artifacts remain preserved as superseded evidence.

## Design Notes

The Auth.js `sessions` table is not an active runtime dependency after this story, but dropping historical data is intentionally outside the runtime clean break. Do not introduce a migration solely to erase it. `jose` remains because Nest browser OAuth/session code uses it; remove only BFF bearer-specific imports and configuration.

The zero-owner test must inspect production source and configuration boundaries, not merely test files. It must distinguish allowed historical BMad artifacts from active runtime documentation and code.

## Verification

**Commands:**
- `pnpm test:unit` -- expected: infrastructure-free retirement/static tests pass without database configuration.
- `pnpm test:integration` -- expected: serial browser-session and direct API authorization coverage passes with `DATABASE_URL_TEST`.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm typecheck` -- expected: all workspaces compile without removed Auth.js/BFF contracts.
- `pnpm build` -- expected: root, API, admin, and worker production builds complete with direct API runtime configuration only.
- `git diff --check` -- expected: no whitespace errors.

## Completion Notes

- Root Auth.js runtime, Next auth/BFF routes, bearer credential transport, root `/admin`, root server-action writers, and root database readiness were retired. `apps/admin`, Nest, packages, and Worker remain the active boundaries.
- The historical Auth.js `sessions` table/data is intentionally preserved. No migration or destructive database operation was added; users authenticate through Nest sessions after deployment.
- `pnpm install --lockfile-only`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm lint`, `pnpm build`, and `git diff --check` were run for this retirement. `pnpm typecheck` and `git diff --check` passed. Broader suite failures are recorded below; deployment/ingress/OAuth smoke evidence is deferred exclusively to Story 14.6.

## Verification Limitations

- `pnpm test:unit` reached the retirement inventory but also has two pre-existing `tests/traveler-ui-foundation.test.ts` assertions for an obsolete Inter/theme-token baseline.
- `pnpm test:integration` ran serially with `DATABASE_URL_TEST` but the existing database is incompatible (`knowledge_ingestion_jobs.discovery_complete` is absent) and has residual rows, causing unrelated worker/outbox failures.
- `pnpm lint` reports pre-existing `no-explicit-any` errors in `packages/database/src/admin-knowledge-review.ts`; these are outside the retirement scope.

## Review Triage Log

### 2026-08-03 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (medium 1, low 1)
- defer: 2: (medium 2)
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Reject a non-empty `Authorization` header before browser-session admission and prove a cookie-plus-bearer request receives the safe unauthorized envelope.
  - `[low] [patch]` Replace retired Facebook/YouTube capture and BFF-test runbook commands with accurate retirement and Worker ownership guidance.

## Auto Run Result

### Summary

- Retired active root Auth.js, BFF, bearer-principal, root `/admin`, and legacy Next transport ownership. Nest browser-session admission is now the only protected browser transport.
- Preserved package and Worker behavior without a root session dependency. Historical Auth.js `sessions` data remains untouched by design.

### Files Changed

- Root `src/` auth, BFF routes/helpers, server actions, and legacy wrappers -- removed obsolete browser/session owners.
- `apps/api/` and `packages/{contracts,config}/` -- removed bearer configuration/admission while retaining Nest browser sessions.
- Runtime configuration, dependencies, lockfile, Dockerfile, README, and runbooks -- removed active Auth.js/BFF instructions and dependencies.
- Direct browser integration and retirement inventory tests -- prove cookie-only admission, bearer rejection, and zero active legacy owners.
- Sprint status and this spec -- recorded retirement scope, verification, and Story 14.6 deployment evidence boundaries.

### Review Outcome

- Patches applied: 2. A mixed bearer-plus-cookie request is rejected before session admission; obsolete operational runbook commands were retired.
- Deferred: public ingress routing and cross-site cookie topology evidence remain Story 14.6 launch-gate work.
- Rejected: 0.
- Follow-up review recommended: false. The two repairs are localized and covered by focused direct-session and static documentation checks.

### Verification

- Passed: `pnpm install --lockfile-only`, `pnpm typecheck`, `pnpm vitest run --project unit tests/legacy-auth-retirement.test.ts`, focused serial browser-session integrations, `pnpm build`, and `git diff --check`.
- Review-repair verification passed: `pnpm vitest run --project integration tests/admin-workspace-browser.integration.test.ts --maxWorkers=1 --no-file-parallelism`, `pnpm typecheck`, and `git diff --check`.
- Known baseline limitations remain: broad unit tests include two obsolete theme-token assertions; broad integration tests encounter incompatible residual shared-test database state; lint retains unrelated `no-explicit-any` errors in `packages/database/src/admin-knowledge-review.ts`.

### Residual Risk

- Production ingress, deployed OAuth smoke, rollback, and cross-site cookie topology are intentionally not claimed here and must be evidenced by Story 14.6.
