---
title: 'Story 1.3: Google Login With Auth.js'
type: 'feature'
created: '2026-07-06'
status: 'done'
baseline_revision: '391123bef07dd18c52de1f4224e45a4dab15ef8d'
final_revision: '391123bef07dd18c52de1f4224e45a4dab15ef8d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 1.2 added public sign-in and protected AI Ask gates, but auth still resolves to `null` and the Google button is disabled. Travelers need real Google login with persisted Auth.js user, account, and session records so later AI Ask ownership checks have a stable authenticated user.

**Approach:** Add Auth.js Google OAuth with the Drizzle PostgreSQL adapter, standard auth tables, Auth.js route handlers, server actions for sign-in/sign-out, and a real server-side session resolver that preserves the existing AI Ask gate seam.

## Boundaries & Constraints

**Always:** Use PostgreSQL-backed Auth.js sessions, keep provider secrets and session reads server-only, keep `/` and `/sign-in` public, keep `/ai-ask` and AI Ask submit protected by `getAuthenticatedSession()`, preserve strict `next=/ai-ask` redirect handling, keep traveler sign-in free of email allowlists, and show safe Vietnamese failure copy for OAuth/provider failures.

**Block If:** Auth.js or the Drizzle adapter cannot be installed, the adapter schema cannot be represented with Drizzle PostgreSQL tables, or implementation would require a production OAuth secret value, fake login bypass, email allowlist, roles/admin schema, referral attribution persistence, chat/trip persistence, retrieval, or AI provider calls.

**Never:** Do not add local auth bypasses, credentials/password login, JWT-only sessions, email allowlist checks, admin roles, referral rewards, booking/payment/maps UI, provider secret display, client-side auth as source of truth, or persistent product tables unrelated to Auth.js identity/session support.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Google sign-in | OAuth env vars and database are configured, visitor selects Google sign-in | Auth.js starts Google OAuth, callback creates or reuses PostgreSQL-backed `users`, `accounts`, and `sessions` rows, then returns to `/ai-ask` when requested | No email allowlist check runs |
| Existing session | User has active Auth.js database session cookie and opens `/ai-ask` | `getAuthenticatedSession()` resolves `{ userId, email }` and AI Ask renders the authenticated placeholder | If user/email is missing, treat as unauthenticated without exposing internals |
| Sign-out | Authenticated user selects sign-out | Auth.js clears the active session and redirects to the public sign-in page | The next `/ai-ask` visit redirects to `/sign-in?next=/ai-ask` |
| OAuth/provider failure | OAuth config, callback, or provider flow fails and redirects with an Auth.js error | `/sign-in` shows a safe retry message in Vietnamese | Do not render provider payloads, secrets, stack traces, or raw error details |
| Redirect safety | Visitor passes `next` or `ref` query params to `/sign-in` | Only `next=/ai-ask` is honored; `ref` may be preserved silently through sign-in links | No open redirect or reward UI is introduced |

</intent-contract>

## Code Map

- `package.json` -- add Auth.js and Drizzle adapter dependencies.
- `pnpm-lock.yaml` -- lock dependency graph after install.
- `src/db/schema.ts` -- define Auth.js PostgreSQL tables and export schema for Drizzle.
- `src/db/client.ts` -- create a server-only Drizzle client using `DATABASE_URL` and Neon serverless.
- `src/auth.ts` -- configure Auth.js Google provider, Drizzle adapter, database session strategy, safe pages, and callbacks.
- `src/app/api/auth/[...nextauth]/route.ts` -- expose Auth.js GET/POST handlers.
- `src/server/auth.ts` -- replace the fail-closed stub with Auth.js session resolution mapped to the existing app session contract.
- `src/features/auth/actions.ts` -- add server actions for Google sign-in and sign-out with safe redirect handling.
- `src/app/sign-in/page.tsx` -- replace disabled placeholder with real Google sign-in form and safe OAuth failure state.
- `src/app/ai-ask/page.tsx` -- keep server-side gate and add a sign-out control for authenticated users.
- `.env.example` -- document required Auth.js Google OAuth env names and callback expectations without real secrets.
- `drizzle/migrations/*` -- generated migration for Auth.js tables.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- move Story 1.3 through `in-progress`, `review`, and `done` as work completes.
- `_bmad-output/implementation-artifacts/spec-1-3-google-login-with-auth-js.md` -- record completion notes, review triage, verification, and file list.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` and `pnpm-lock.yaml` -- Install `next-auth` and `@auth/drizzle-adapter` so the app can use Auth.js with Drizzle PostgreSQL.
- [x] `src/db/schema.ts` -- Add Auth.js-compatible `users`, `accounts`, `sessions`, and `verificationTokens` tables with PostgreSQL column definitions and indexes needed by the adapter.
- [x] `src/db/client.ts` -- Add a server-only Drizzle client from `DATABASE_URL` without weakening the existing fail-closed Drizzle command behavior.
- [x] `src/auth.ts` and `src/app/api/auth/[...nextauth]/route.ts` -- Configure Google OAuth, Drizzle adapter, database session strategy, Auth.js handlers, and safe sign-in/error page routing.
- [x] `src/server/auth.ts` -- Resolve Auth.js server sessions into `{ userId, email }`, returning `null` when no safe user/email exists.
- [x] `src/features/auth/actions.ts` -- Add server actions for Google sign-in and sign-out, preserving only approved redirect destinations.
- [x] `src/app/sign-in/page.tsx` -- Replace the disabled Google placeholder with a working sign-in form, preserve `next=/ai-ask` and `ref`, and show safe OAuth failure copy.
- [x] `src/app/ai-ask/page.tsx` -- Keep the protected server route behavior and add sign-out access that clears the active session.
- [x] `.env.example` -- Ensure local Auth.js, Google OAuth, and callback configuration placeholders are documented safely.
- [x] `drizzle/migrations/*` -- Generate and keep the migration for Auth.js tables.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- Update implementation status, verification, review triage, change log, and file list.

**Acceptance Criteria:**
- Given Google OAuth credentials and `DATABASE_URL` are configured, when a user selects Google sign-in, then Auth.js completes the OAuth flow, creates or reuses PostgreSQL-backed user/session/account records, and requires no email allowlist.
- Given an authenticated user has an active database session, when they revisit `/ai-ask` or call the guarded AI Ask server seam, then the server resolves their authenticated user through `getAuthenticatedSession()`.
- Given an authenticated user signs out, when they revisit `/ai-ask`, then the active session is cleared and the route redirects to public sign-in.
- Given OAuth or provider configuration fails, when the user returns to sign-in, then the app shows safe Vietnamese failure copy without exposing secrets, provider payloads, or stack traces.

## Spec Change Log

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (medium 1)
- defer: 0
- reject: 3: (medium 1, low 2)
- addressed_findings:
  - `[medium]` `[patch]` `getAuthenticatedSession()` now fails closed to `null` if Auth.js/database-backed session lookup throws, avoiding a protected-route 500 when session storage is unavailable.
  - rejected: Static checks cannot exercise a real Google OAuth callback or database session creation without configured OAuth credentials and a live database; this is recorded as a residual risk, not a code defect in this environment.
  - rejected: Additional sign-in action `AuthError` handling is not required because Auth.js routes OAuth failures to the configured `/sign-in?error=...` page, which now renders safe Vietnamese failure copy.
  - rejected: Sign-out database deletion failure handling beyond Auth.js default behavior is outside this story's AC and no safe product-specific recovery route exists yet.

## Verification

**Commands:**
- `pnpm db:generate` -- failed closed as expected without `DATABASE_URL`.
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- passed; generated `drizzle/migrations/0000_steep_titania.sql`.
- `pnpm lint` -- passed with no ESLint errors.
- `pnpm typecheck` -- passed with strict TypeScript.
- `pnpm build` -- passed; production build succeeded without requiring a live OAuth flow.

## Auto Run Result

Status: done

Summary of implemented change:
- Implemented Story 1.3 Google Login with Auth.js using Google OAuth, Drizzle PostgreSQL adapter, database-backed sessions, Auth.js route handlers, and server-side session resolution.
- Replaced the disabled sign-in placeholder with a real server-action Google sign-in flow and added sign-out from the authenticated AI Ask placeholder.
- Added Auth.js identity/session tables and migration without adding roles, referral attribution persistence, chat/trip persistence, retrieval, or AI provider calls.

Files changed:
- `.env.example` -- Documented Auth.js Google OAuth callback and `AUTH_URL` deployment hint.
- `package.json` -- Added `next-auth` v5 beta and `@auth/drizzle-adapter`.
- `pnpm-lock.yaml` -- Locked Auth.js dependencies.
- `src/db/schema.ts` -- Added Auth.js `users`, `accounts`, `sessions`, and `verification_tokens` tables.
- `src/db/client.ts` -- Added server-only Drizzle client backed by `DATABASE_URL`.
- `src/auth.ts` -- Added Auth.js configuration with Google provider, Drizzle adapter, database session strategy, and session user ID mapping.
- `src/app/api/auth/[...nextauth]/route.ts` -- Added Auth.js GET/POST route handlers.
- `src/server/auth.ts` -- Replaced stub with Auth.js session resolution and fail-closed database/auth error handling.
- `src/features/auth/actions.ts` -- Added server actions for Google sign-in and sign-out with safe redirect handling.
- `src/app/sign-in/page.tsx` -- Added real Google sign-in form, safe OAuth failure copy, and preserved allowed redirect/ref parameters.
- `src/app/ai-ask/page.tsx` -- Added authenticated sign-out control while preserving the server-side route gate.
- `src/types/next-auth.d.ts` -- Added session user ID type augmentation.
- `drizzle/migrations/0000_steep_titania.sql` -- Added Auth.js tables migration.
- `drizzle/migrations/meta/0000_snapshot.json` -- Added Drizzle migration snapshot.
- `drizzle/migrations/meta/_journal.json` -- Registered the generated migration.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Story 1.3 done.
- `_bmad-output/implementation-artifacts/spec-1-3-google-login-with-auth-js.md` -- Added dev-auto spec, verification, review triage, and result details.

Review findings breakdown:
- Patches applied: 1 medium edge-case patch. `getAuthenticatedSession()` now returns `null` if Auth.js/database session lookup throws, preserving fail-closed protected gates.
- Items deferred: 0.
- Items rejected: 3. Runtime OAuth callback/session/sign-out behavior needs real credentials and database to manually exercise; sign-in/sign-out action failure handling is acceptable because Auth.js redirects expected OAuth errors to `/sign-in?error=...` and sign-out database deletion failure is not required by the current AC beyond clearing normal active sessions.

Follow-up review recommendation: false.

Verification performed:
- `pnpm db:generate`: failed closed without `DATABASE_URL`, as intended.
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate`: passed and generated the Auth.js migration.
- `pnpm lint`: passed after implementation and after review patch.
- `pnpm typecheck`: passed after implementation and after review patch.
- `pnpm build`: passed after implementation and after review patch.

Residual risks:
- Real Google OAuth callback, database session creation, and sign-out cookie/database deletion were not exercised end-to-end because no live `DATABASE_URL`, Google OAuth credentials, or browser flow are configured in this environment.
- `next-auth` v5 is still beta; it is the minimal fit for App Router server actions, but version stability should be watched before production launch.
- No automated auth route tests exist because this repository has no test framework yet.
- No commit was created because committing requires explicit user request in this environment.
