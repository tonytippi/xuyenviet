---
title: 'Story 2.0: Introduce Test Framework And Retroactive Coverage For Epic 1 Protected Paths'
type: 'chore'
created: '2026-07-06'
status: 'done'
baseline_revision: 'e546eada68868e79076448312e860e6865713c78'
final_revision: 'e546eada68868e79076448312e860e6865713c78'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-retro-2026-07-06.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
warnings:
  - oversized
---

<intent-contract>

## Intent

**Problem:** Epic 1 protected paths (auth gate, role checks, audit wrapper, env guards) shipped with zero automated tests; five deferrals accrued across stories 1.2–1.6 and the env-guard debt is unowned in `deferred-work.md`. Epic 2 stories 2.2+ build on these foundations and the Epic 1 retro team agreement requires server-side integration tests for any story adding persistence, ownership, AI provider calls, or failure-state contracts.

**Approach:** Add Vitest plus a dedicated test PostgreSQL database (separate from dev/prod), wire `pnpm test` to run Drizzle migrations against the test DB then execute integration tests with fake OAuth/AI credentials and no external provider calls, and add retroactive coverage asserting the fail-closed, transactional, and constraint behavior of the four Epic 1 protected-path areas. Shipping this story closes the `deferred-work.md` env-guard entry.

## Boundaries & Constraints

**Always:**
- Test database must be separate from dev and production (resolved via `DATABASE_URL_TEST`); tests must never point at `DATABASE_URL`.
- `pnpm test` must pass with fake/missing `AUTH_GOOGLE_*`, `AI_GATEWAY_*`, and `TAVILY_API_KEY`, and must make zero real external provider calls (no Google OAuth, no AI Gateway, no Tavily, no network).
- Integration tests for audit/constraint/rollback assertions must exercise real Drizzle migrations against the real test Postgres — do not mock Drizzle transactions or DB constraints for those assertions.
- Env-guard tests must save and restore `process.env` per case; `getDb()` singleton must be reset between integration tests (via `vi.resetModules()` or a test-only reset seam) so DB state does not bleed across tests.
- Preserve all existing `pnpm lint`, `pnpm typecheck`, `pnpm build` scripts and behavior; the test framework must not break them, and test files must be excluded from the production build.
- Use pnpm; add a `test` script. Keep app code under `src/`; place integration tests under a top-level `tests/` directory.
- Mock only external boundaries (`next-auth` Google provider, network); do not mock the DB or the wrappers under test.
- Any test seam added to production code must not change production runtime behavior — only enable injection for tests.

**Block If:**
- A real Postgres instance cannot be reached in the test environment for integration tests (test DB unavailable). Do not silently fall back to mocks for constraint/rollback assertions — HALT and report.
- Adding the test framework requires production auth/env/mutation code changes beyond minimal, behavior-preserving test seams. HALT and surface the design decision before proceeding.

**Never:**
- Do not test against dev or production databases.
- Do not add an E2E framework (Playwright/Cypress) — retro deferred E2E until staging plus a real-OAuth CI environment exists.
- Do not add unit tests for pure UI components in this story; focus on protected-path server behavior.
- Do not add new product tables or migrations; only run existing migrations against the test DB.
- Do not implement Story 2.1+ features (chat shell, conversations, AI answers).
- Do not change production behavior of auth/audit/env code; only add behavior-preserving test seams if strictly required.
- Do not commit real secrets or test DB credentials; `.env.example` keeps placeholders only.
- Do not mock Drizzle transactions for the audit wrapper contract test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Auth gate: unauthenticated AI Ask | `GET /ai-ask`, no session | redirect to `/sign-in?next=/ai-ask`, no side effects | No thrown error to caller |
| Auth gate: session storage throws | `auth()` rejects | `getAuthenticatedSession` returns `null` (swallows throw) | `null`, not throw |
| Auth gate: session missing id/email | session.user without id or email | returns `null` | `null` |
| Admin: traveler denied | session + `roles=[traveler]` | `requireAdminSession` throws `AdminAuthorizationError`; layout does not render children | Typed error |
| Admin: operator allowed | `roles=[operator]` | access granted | None |
| Admin: admin allowed | `roles=[admin]` | access granted | None |
| Role constraint violation | insert `userRoles` with `role='superuser'` | DB rejects via `user_roles_role_check` | Throws |
| Audit: both succeed | action + audit both return | both commit in one transaction | None |
| Audit: action throws | action throws mid-tx | audit row NOT written; tx rolls back | Throws, no partial commit |
| Audit: audit throws | `recordAuditEvent` throws | action's changes rolled back | Throws, no partial commit |
| Audit: no session | `runAuditedAuthenticatedMutation` with null session | throws `Authentication required` | Throws |
| Env: prod missing var | `APP_ENV=production`, `AUTH_SECRET` missing | `ServerEnvError` thrown | Typed error |
| Env: placeholder value | `APP_ENV=production`, `DATABASE_URL='replace-with-real'` | `ServerEnvError` thrown | Typed error |
| Env: localhost prod DB | `APP_ENV=production`, `DATABASE_URL=postgres://localhost/x` | `ServerEnvError` thrown | Typed error |
| Env: non-production | `APP_ENV=dev`, missing vars | no-op, no throw | None |
| Env: valid production | `APP_ENV=production`, all valid non-placeholder vars | no throw | None |
| `pnpm test` without OAuth creds | fake `AUTH_GOOGLE_*`, no network | full suite passes | None |

</intent-contract>

## Code Map

- `package.json` -- add vitest devDeps + `test`/`test:run` scripts; confirm pnpm lockfile updates
- `vitest.config.ts` -- new; reuse `@/*` alias via `vite-tsconfig-paths`, set test environment/globals, exclude from build
- `drizzle.config.ts` -- existing; test setup must override `DATABASE_URL` to `DATABASE_URL_TEST` before running migrations against test DB (no prod behavior change)
- `.env.example` -- add `DATABASE_URL_TEST` and missing `AUTH_URL` placeholders
- `src/server/env.ts` -- exports under test: `assertProductionLaunchEnv`, `getRequiredServerEnv`, `ServerEnvError`, `isPlaceholderValue`, `isLocalProductionDatabaseUrl`, `getAppEnv`
- `src/server/auth.ts` -- exports under test: `getAuthenticatedSession`, `getUserRoles`, `hasAdminAccess`, `requireAdminSession`, `AdminAuthorizationError`
- `src/server/mutations.ts` -- exports under test: `runAuditedAuthenticatedMutation`, `runAuditedAdminMutation`, `runAuthenticatedMutation`, `MutationTransaction`
- `src/features/audit/events.ts` -- `recordAuditEvent` (2nd-arg `database` is the test injection seam)
- `src/db/schema.ts` -- `userRoles` + `user_roles_role_check`, `auditEvents` + `audit_events_operation_check`
- `src/db/client.ts` -- `getDb()` singleton; needs per-test reset (prefer `vi.resetModules`, else minimal test-only seam)
- `src/auth.ts` -- Auth.js config + `events.signIn` referral hook; Google provider must be mocked in tests, `assertProductionLaunchEnv` call at config factory must be bypassed via `APP_ENV=test`
- `src/app/ai-ask/page.tsx` -- auth gate redirect behavior
- `src/app/admin/layout.tsx` -- role-protected layout denial + children suppression
- `src/features/admin/actions.ts` -- `validateAdminActionAccess`, `runAuditedAdminMutation` usage
- `src/features/auth/actions.ts` -- `signInWithGoogle`, `signOutCurrentUser`, `getSafeRedirectPath` allowlist
- `src/features/referrals/attribution.ts` -- `captureFirstTouchReferralAttribution` (covered indirectly via auth hook mock)
- `tests/setup.ts` -- new; global setup: run Drizzle migrations against test DB once, set fake env defaults (`APP_ENV=test`, fake OAuth/AI/Tavily)
- `tests/helpers/db.ts` -- new; test DB client, per-test truncation/reset, `getDb` singleton reset
- `tests/helpers/env.ts` -- new; `process.env` save/restore helper
- `tests/env-guards.test.ts` -- new; env guard coverage (1.6)
- `tests/auth-gate.test.ts` -- new; auth gate + session fail-closed coverage (1.2/1.3)
- `tests/admin-roles.test.ts` -- new; admin role + constraint coverage (1.4)
- `tests/audit-mutation.test.ts` -- new; audit wrapper transactional contract coverage (1.5)
- `README.md` -- document `pnpm test`, test DB setup, no-real-credentials requirement
- `_bmad-output/implementation-artifacts/deferred-work.md` -- mark env-guard entry resolved by 2.0 with ship date

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- add `vitest`, `@vitest/coverage-v8`, `vite-tsconfig-paths`, and `@vitejs/plugin-react` as devDeps; add `test` (watch) and `test:run` (CI) scripts -- enable `pnpm test`
- [x] `vitest.config.ts` -- create config reusing `@/*` alias, setting `environment: 'node'`, serial DB-backed test files, and `tests/` include -- centralize test runtime
- [x] `.env.example` -- add `DATABASE_URL_TEST` and `AUTH_URL` placeholders -- document test DB and missing prod var
- [x] `tests/setup.ts` -- per-file setup: point `DATABASE_URL` at `DATABASE_URL_TEST`; set default fake env (`APP_ENV=local`, fake `AUTH_GOOGLE_*`, `AI_GATEWAY_*`, `TAVILY_API_KEY`, `AUTH_SECRET`) -- ensure no real OAuth/AI needed
- [x] `tests/helpers/db.ts` -- test DB client + per-test truncation + `vi.resetModules` singleton reset -- isolate integration tests
- [x] `tests/helpers/env.ts` -- `withEnv()` helper that saves/restores `process.env` around a case -- prevent env bleed
- [x] `tests/env-guards.test.ts` -- cover `assertProductionLaunchEnv` missing/placeholder/localhost-DB in production, no-op in non-production, valid production pass; `getAppEnv` enum rejection -- close 1.6 deferred debt
- [x] `tests/auth-gate.test.ts` -- cover `getAuthenticatedSession` fail-closed (throw swallowed, missing id/email), AI Ask gate redirect to `/sign-in?next=/ai-ask`, `getSafeRedirectPath` allowlist -- close 1.2/1.3 deferred debt
- [x] `tests/admin-roles.test.ts` -- cover `requireAdminSession` denial for no-session/traveler, access for operator/admin, `user_roles_role_check` DB constraint rejection -- close 1.4 deferred debt
- [x] `tests/audit-mutation.test.ts` -- cover audited wrapper: action+audit commit together, action throws → rollback no audit, audit throws → rollback no action, no session → throws; assert audit row presence/absence in test DB -- close 1.5 deferred debt
- [x] `src/db/client.ts` -- if `vi.resetModules` is insufficient, add a behavior-preserving test-only reset seam (e.g., `_resetForTests()` guarded by `NODE_ENV==='test'`) -- `vi.resetModules` was sufficient, so no production code seam was added
- [x] `README.md` -- document `pnpm test`, `DATABASE_URL_TEST` setup, and no-real-credentials guarantee -- onboarding clarity
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark env-guard entry `resolved_by: Story 2.0` with ship date `2026-07-06` -- close deferred-work entry per AC

**Acceptance Criteria:**
- Given the repo has no test framework, when Story 2.0 is implemented, then Vitest is configured with a test database separate from dev/production, Drizzle migrations run against the test DB, and `pnpm test` runs the suite without real OAuth credentials or external providers.
- Given Story 1.2/1.3 auth gate fail-closed behavior, when integration tests exercise unauthenticated AI Ask and session-storage failure, then tests verify redirect to `/sign-in?next=/ai-ask`, `null` return on session throw, and no side effects on blocked paths.
- Given Story 1.4 role-protected admin, when tests exercise `/admin` with traveler/operator/admin roles, then traveler is denied server-side (`AdminAuthorizationError`, children not rendered) and operator/admin access renders.
- Given Story 1.5 audit trail, when tests exercise the audited mutation wrapper, then protected changes and audit rows commit together or not at all (action throws → no audit; audit throws → no action commit; no session → throws).
- Given Story 1.6 env guards, when tests exercise missing/placeholder/localhost production DB and valid dev/staging, then guards fail closed on placeholder/localhost/missing secrets and allow valid dev/staging config.
- Given the `deferred-work.md` 1.6 entry, when Story 2.0 ships, then the env-guard test debt entry is marked resolved.
- Given the Epic 1 retro team agreement, when Story 2.2 starts, then the test framework, test DB, and ownership-denial test pattern from 2.0 are reusable.

## Spec Change Log

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 2, medium 3, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Hardened `DATABASE_URL_TEST` loading so tests fail fast unless `DATABASE_URL` is present, URLs differ after normalization, the test DB name contains `test`, and the host is local/test/CI.
  - `[high]` `[patch]` Replaced hard-coded DB reset table list with dynamic truncation of all public base tables so future migrated tables do not leak rows across tests.
  - `[medium]` `[patch]` Loaded `.env.local` before `.env`, matching README and Drizzle precedence.
  - `[medium]` `[patch]` Raised README Node requirement to 20.19+ to match Vitest/Vite tooling engine requirements.
  - `[medium]` `[patch]` Added a global `fetch` guard that fails tests on unexpected network calls.
  - `[low]` `[patch]` Extended local env parsing to support `export KEY=value`, spaces around `=`, and inline comments.

## Design Notes

**Real Postgres over mocks.** `user_roles_role_check`, `audit_events_operation_check`, and the audit wrapper's transactional all-or-nothing contract cannot be honestly asserted with in-memory mocks. Use a real test Postgres via `DATABASE_URL_TEST`; global setup runs `drizzle-kit migrate` once before the suite; per-test truncation resets state.

**No external providers.** Default test env sets `APP_ENV=test` so `assertProductionLaunchEnv` is a no-op by default. Stub `next-auth`/Google provider where importing `src/auth.ts` would otherwise initialize OAuth. Fake `AUTH_GOOGLE_ID/SECRET`, `AI_GATEWAY_*`, `TAVILY_API_KEY`, `AUTH_SECRET` are set in `tests/setup.ts`. Env-guard tests explicitly set `APP_ENV=production` with `withEnv()` restore.

**`getDb()` singleton.** Prefer `vi.resetModules()` + re-import per integration test to swap the client. Only add a minimal `_resetForTests()` seam to `src/db/client.ts` if reset-modules proves insufficient — and guard it by `NODE_ENV==='test'` so production behavior is unchanged.

**Test layout.** Integration tests live under top-level `tests/` (keeps `src/` clean, mirrors BMad artifact convention). Pure-helper unit tests (env, `getSafeRedirectPath`) may co-locate as `*.test.ts` next to source if convenient — pick one in implementation and document in README.

Golden env-guard test shape:
```ts
withEnv({ APP_ENV: 'production', AUTH_SECRET: '' }, () => {
  expect(() => assertProductionLaunchEnv()).toThrow(ServerEnvError);
});
```

## Verification

**Commands:**
- `pnpm test` -- expected: all tests pass; zero real OAuth/AI/Tavily calls; no dev/prod DB access
- `pnpm lint` -- expected: passes
- `pnpm typecheck` -- expected: passes
- `pnpm build` -- expected: passes (test files excluded)

**Manual checks:**
- Confirm `DATABASE_URL_TEST` in local `.env.local` points at a database distinct from `DATABASE_URL`.
- Confirm `pnpm test` still passes with `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` unset in the shell env.
- Confirm `deferred-work.md` env-guard entry shows resolved status with ship date.

## Auto Run Result

Status: done

Summary: Introduced Vitest server-side integration testing with a dedicated PostgreSQL test database, automatic Drizzle migration setup, fail-fast DB safety guards, no-network test guard, and retroactive coverage for Epic 1 auth gate, admin roles, audited mutations, and production env guards.

Files changed:
- `../../package.json` -- added Vitest/Vite test tooling and `test`/`test:run` scripts.
- `../../pnpm-lock.yaml` -- locked added test dependencies.
- `../../vitest.config.ts` -- added Vitest config, React transform, tsconfig paths, server-only test alias, global setup, and serialized DB-backed test execution.
- `../../.env.example` -- documented `DATABASE_URL_TEST` and `AUTH_URL`.
- `../../README.md` -- documented Node 20.19+ requirement and test DB/test command setup.
- `../../src/features/auth/redirects.ts` -- extracted existing safe redirect helper for direct testing without changing behavior.
- `../../src/features/auth/actions.ts` -- imports the extracted redirect helper.
- `../../tests/global-setup.ts` -- runs Drizzle migrations against `DATABASE_URL_TEST`.
- `../../tests/setup.ts` -- sets fake local test env defaults, resets DB per test, and blocks unexpected network calls.
- `../../tests/helpers/env-file.ts` -- loads `.env.local`/`.env`, validates safe test DB URLs, and prevents accidental dev/prod DB use.
- `../../tests/helpers/db.ts` -- creates the test DB client and truncates all public application tables between tests.
- `../../tests/helpers/env.ts` -- adds env save/restore helpers and valid production env fixture.
- `../../tests/mocks/server-only.ts` -- aliases `server-only` for Vitest.
- `../../tests/env-guards.test.ts` -- covers production env guard fail-closed and valid cases.
- `../../tests/auth-gate.test.ts` -- covers session fail-closed behavior, AI Ask redirect, and redirect allowlist.
- `../../tests/admin-roles.test.ts` -- covers admin authorization, layout denial/allow behavior, and role DB constraints.
- `../../tests/audit-mutation.test.ts` -- covers audited mutation transaction commit/rollback semantics.
- `deferred-work.md` -- marked the Story 1.6 env-guard test debt resolved.
- `sprint-status.yaml` -- marked Epic 2 in progress and Story 2.0 done.
- `epic-2-context.md` -- compiled Epic 2 context for this dev-auto run.
- `spec-2-0-introduce-test-framework-and-retroactive-epic-1-coverage.md` -- created and completed this executable spec.

Review findings breakdown: 6 patches applied (2 high, 3 medium, 1 low), 0 deferred, 0 rejected.

Follow-up review recommended: true. The review-driven fixes touched destructive test DB safety and future table isolation; an independent follow-up is useful despite all checks passing.

Verification performed:
- `pnpm test:run` -- passed, 4 test files, 47 tests.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.
- `pnpm typecheck` -- passed after build regenerated `.next/types`; the earlier parallel typecheck/build run failed only because `.next/types` was being regenerated concurrently.

Residual risks:
- Test DB setup still requires a reachable local/test PostgreSQL database and `DATABASE_URL_TEST`; this is documented and guarded.
- The Vite/Vitest toolchain requires Node 20.19+, higher than the previous README minimum.
- Changes were not committed because the runtime developer instruction says to commit only when explicitly requested.
