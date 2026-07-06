---
title: 'Story 1.6: Environment And Public Launch Safety Baseline'
type: 'feature'
created: '2026-07-06'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_commit: '48e50da'
final_revision: 'NO_COMMIT_CREATED'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Runtime and migration code fail closed for missing database config, but the app does not yet centrally represent local/staging/production environment boundaries or reject placeholder secrets before public launch. Production readiness requirements are present in planning artifacts but are not yet an actionable checklist for operators.

**Approach:** Add a small server-only environment guard for app environment, required protected-runtime settings, and production placeholder detection. Wire database/Auth.js/Drizzle configuration through the guard where relevant, expand `.env.example`, and add a public launch readiness checklist to README without introducing deployment-provider-specific infrastructure.

## Boundaries & Constraints

**Always:** Keep validation server-only, fail closed for missing `DATABASE_URL` in database-backed paths, reject obvious placeholders and localhost database URLs in production, preserve local developer convenience, and document separate dev/staging/production secrets and databases.

**Block If:** Production validation requires choosing a final hosting/provider-specific secret manager, OAuth domain, database vendor, AI provider privacy setting, or backup vendor that is not already specified.

**Never:** Do not add local auth/admin bypasses, do not expose secrets through client code or user-facing errors, do not require AI/search provider keys for local public pages before those features exist, do not add reward/referral/payment behavior, and do not create unrelated domain tables.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Local development config | `APP_ENV=local` with `.env.local` or `.env` containing local placeholders | Local docs and database commands remain usable; protected provider features can still fail when their own missing config is reached | Missing `DATABASE_URL` still throws a server-side operational error |
| Production database placeholder | `APP_ENV=production` with localhost or placeholder `DATABASE_URL` | Database-backed server startup/path is blocked before connecting | Throw server-side config error without secret value |
| Production Auth.js placeholder | `APP_ENV=production` with missing or placeholder auth/Google OAuth values | Auth configuration is blocked before protected auth behavior is used | Throw server-side config error naming the invalid variable only |
| Production launch checklist | Operator prepares public onboarding | README checklist covers separate DB/secrets, OAuth config, admin roles, provider privacy, and backup/restore expectations | Gaps remain visible as checklist items, not hidden defaults |

</intent-contract>

## Code Map

- `src/server/env.ts` -- New server-only environment helper for `APP_ENV`, required variable lookup, production placeholder detection, and protected-runtime assertions.
- `src/db/client.ts` -- Use the shared environment helper for `DATABASE_URL` while preserving database fail-closed behavior.
- `src/auth.ts` -- Assert protected runtime/Auth.js production configuration before creating the Auth.js adapter/providers.
- `drizzle.config.ts` -- Keep local `.env.local`/`.env` convenience and reject production placeholder/localhost database URLs for migration commands.
- `.env.example` -- Document separate local/staging/production configuration expectations and safe placeholder use.
- `README.md` -- Add public launch safety checklist with environment, OAuth, admin, provider privacy, and backup/restore expectations.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 1.6 in progress/review/done as implementation proceeds.
- `_bmad-output/implementation-artifacts/spec-1-6-environment-and-public-launch-safety-baseline.md` -- Record implementation, verification, review triage, and result details.

## Tasks & Acceptance

**Execution:**
- [x] `src/server/env.ts` -- Add server-only `APP_ENV` and production validation helpers so config policy is centralized and not copied across features.
- [x] `src/db/client.ts` -- Replace direct `process.env.DATABASE_URL` handling with the shared helper so production database placeholders are rejected consistently.
- [x] `src/auth.ts` -- Assert production Auth.js/Google OAuth variables before Auth.js uses provider configuration so placeholder secrets are not accepted in production.
- [x] `drizzle.config.ts` -- Add migration-time production database guard while keeping local `.env.local` and `.env` loading for developer commands.
- [x] `.env.example` -- Expand comments to show local/staging/production separation and identify placeholders as local-only examples.
- [x] `README.md` -- Add an actionable public launch safety checklist covering separate database/secrets, OAuth config, admin roles, provider privacy settings, and backup/restore expectation.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- Keep story status, task checkboxes, verification, review triage, and auto-run result aligned.

**Acceptance Criteria:**
- Given the app is configured for local development, when environment variables are loaded, then dev, staging, and production settings are represented separately and local placeholders are documented as non-production defaults.
- Given production deployment is prepared, when required secrets or database URLs are missing or obvious placeholders, then protected runtime/database configuration fails safely server-side and no placeholder provider secrets are accepted.
- Given public user onboarding is planned, when production readiness is checked, then the README checklist includes separate database/secrets, OAuth config, admin roles, provider privacy settings, and backup/restore expectation.
- Given local database commands run, when developers use `.env.local` or `.env`, then Drizzle can still load local configuration while rejecting localhost/placeholder database URLs when `APP_ENV=production`.

## Spec Change Log

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 2, medium 3)
- defer: 1: (medium 1)
- reject: 1: (medium 1)
- addressed_findings:
  - `[high]` `[patch]` Updated `drizzle.config.ts` to read `APP_ENV` from shell, `.env.local`, or `.env` so production DB guards also apply when env files declare production.
  - `[high]` `[patch]` Added migration-time validation for invalid `APP_ENV` values so misspellings cannot bypass production database safety checks.
  - `[medium]` `[patch]` Replaced partial placeholder detection with embedded `replace-with-*`, `changeme`, and `change-me` matching in both runtime and Drizzle production guards.
  - `[medium]` `[patch]` Added IPv6 loopback detection for production database URLs.
  - `[medium]` `[patch]` Switched Auth.js protected-runtime validation to `assertProductionLaunchEnv()` so production auth/protected usage also enforces AI Gateway and search keys required before public launch.
  - deferred: No automated test framework exists yet; env guard behavior is covered by explicit CLI checks, lint, typecheck, build, and review for this story.

## Verification

**Commands:**
- `APP_ENV=production DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- expected: fails before migration generation because production cannot use localhost database URL.
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- expected: succeeds or reports no schema changes for local/default config.
- `pnpm lint` -- expected: ESLint passes.
- `pnpm typecheck` -- expected: TypeScript passes.
- `pnpm build` -- expected: Next.js production build passes.

**Results:**
- `APP_ENV=production DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- passed as expected failure; blocked production localhost DB URL before migration generation.
- `APP_ENV=prod DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- passed as expected failure; blocked invalid `APP_ENV` value.
- `APP_ENV=production DATABASE_URL="postgresql://replace-with-user:pass@db.example/xuyenviet" pnpm db:generate` -- passed as expected failure; blocked embedded placeholder database URL.
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- passed; no schema changes.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

## Auto Run Result

Status: done

Summary of implemented change:
- Implemented Story 1.6 environment and launch safety baseline with centralized server-only production env validation, database/Auth.js guard wiring, Drizzle migration-time production DB validation, expanded env examples, and a README public launch checklist.
- Applied review patches for env-file `APP_ENV` handling, invalid `APP_ENV` fail-closed behavior, embedded placeholder detection, IPv6 loopback DB detection, and full production launch validation for protected Auth.js runtime.

Files changed:
- `src/server/env.ts` -- Added server-only `APP_ENV`, required env, production placeholder, and local DB guard helpers.
- `src/db/client.ts` -- Routed `DATABASE_URL` access through the shared server env helper.
- `src/auth.ts` -- Added production launch env assertion before protected Auth.js runtime configuration.
- `drizzle.config.ts` -- Added local env-file lookup for `APP_ENV`/`DATABASE_URL` and production database URL safety checks for migration commands.
- `.env.example` -- Documented local/staging/production separation and local-only placeholder usage.
- `README.md` -- Added public launch safety checklist.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Story 1.6 done.
- `_bmad-output/implementation-artifacts/spec-1-6-environment-and-public-launch-safety-baseline.md` -- Recorded implementation, review, verification, and result.

Review findings breakdown:
- Patches applied: 5 findings fixed: 2 high, 3 medium.
- Items deferred: 1 medium item for automated env-guard tests once the repository has a test framework.
- Items rejected: 1 medium finding about production build/runtime-only secrets after preserving validation at protected runtime instead of adding provider-specific deploy assumptions.

Follow-up review recommendation: false.

Verification performed:
- `APP_ENV=production DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate`: expected failure passed.
- `APP_ENV=prod DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate`: expected failure passed.
- `APP_ENV=production DATABASE_URL="postgresql://replace-with-user:pass@db.example/xuyenviet" pnpm db:generate`: expected failure passed.
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate`: passed, no schema changes.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.

Residual risks:
- No automated tests exist yet in this repository; env safety behavior is currently guarded by code review and explicit CLI verification.
- Final hosting, database provider backup implementation, OAuth production domain, and provider privacy settings remain operator deployment decisions documented in the launch checklist.
- No commit was created because commits require explicit user request in this environment.
