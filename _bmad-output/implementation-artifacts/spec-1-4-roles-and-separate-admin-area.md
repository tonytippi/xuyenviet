---
title: 'Story 1.4: Roles And Separate Admin Area'
type: 'feature'
created: '2026-07-06'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_commit: 'de61e1cc3690068ad47baa2c086ea6325df1dfd0'
final_revision: 'NO_COMMIT_CREATED'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Google-authenticated users exist, but the app has no PostgreSQL-backed role model or role-protected admin area. Future knowledge management needs an admin/operator surface that normal travelers cannot see or access.

**Approach:** Add minimal role storage, server-only role authorization helpers, a protected admin shell, safe admin sign-in redirect support, and a role-protected server action seam for future admin mutations.

## Boundaries & Constraints

**Always:** Store roles in PostgreSQL, treat server-side role checks as the source of truth, deny normal travelers before rendering admin UI, keep admin workflows visually/navigationally separate from AI Ask, preserve public sign-in and AI Ask behavior, and keep role helpers server-only.

**Block If:** The role model cannot be added through Drizzle schema and migration, Auth.js session resolution cannot provide a stable user ID for role lookup, or implementation would require production admin bootstrap secrets, a separate admin auth system, email allowlists as the role source of truth, or real knowledge-management data mutations.

**Never:** Do not expose admin navigation to normal travelers, do not authorize from client session state, do not add reward/credit/referral behavior, do not introduce audit events before Story 1.5, do not add knowledge-card tables or raw source material, and do not weaken redirect safety with arbitrary `next` destinations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal traveler admin route | Signed-in user has no admin/operator role and opens `/admin` | Server resolves session, checks PostgreSQL roles, and renders a denied state without admin controls | No protected admin data is read or mutated |
| Operator/admin admin route | Signed-in user has `operator` or `admin` role in PostgreSQL and opens `/admin` | User sees a placeholder admin shell clearly separated from traveler chat | No error expected |
| Unauthenticated admin route | Visitor opens `/admin` without a session | Visitor is redirected to `/sign-in?next=/admin` before admin UI renders | No protected admin data is read or mutated |
| Admin server action seam | Caller invokes an admin-only server action with a valid or invalid role | Valid admin/operator role can pass the guard; non-admin/unauthenticated caller is rejected server-side before work runs | Safe generic authorization error; no mutation hook runs |
| Redirect safety | Visitor passes `next` to sign-in | Only `/ai-ask` and `/admin` are accepted | Invalid destinations fall back to `/ai-ask` |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- add the PostgreSQL role table and role type exports alongside Auth.js tables.
- `drizzle/migrations/*` -- introduce the role table and index through Drizzle migration artifacts.
- `src/server/auth.ts` -- add server-only role lookup and admin/operator authorization helpers.
- `src/features/admin/actions.ts` -- add a protected server action seam that validates session and role before running future admin work.
- `src/app/admin/layout.tsx` -- enforce admin route-segment protection and render the separated admin shell.
- `src/app/admin/page.tsx` -- add placeholder admin overview content and wire the admin server action guard seam.
- `src/features/auth/actions.ts` -- allow only safe `/admin` redirect in addition to `/ai-ask`.
- `src/app/sign-in/page.tsx` -- preserve safe admin redirect through the sign-in form.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- keep story 1.4 state aligned with implementation.
- `_bmad-output/implementation-artifacts/spec-1-4-roles-and-separate-admin-area.md` -- record implementation, verification, review triage, and result details.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/*` -- Add a minimal PostgreSQL-backed `user_roles` table keyed by user ID and role value, with role values limited in TypeScript to traveler/operator/admin.
- [x] `src/server/auth.ts` -- Add server-only helpers to resolve authenticated sessions with roles and to require admin/operator access from PostgreSQL roles.
- [x] `src/features/admin/actions.ts` -- Add an admin-only server action guard seam proving future admin route handlers/server actions validate session and role before protected work.
- [x] `src/app/admin/layout.tsx` and `src/app/admin/page.tsx` -- Add `/admin` route-segment protection that redirects unauthenticated visitors, denies normal travelers server-side, and renders a separated Vietnamese placeholder admin shell for admin/operator roles.
- [x] `src/features/auth/actions.ts` and `src/app/sign-in/page.tsx` -- Preserve safe `next=/admin` sign-in redirects while rejecting arbitrary redirect destinations.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- Update status, task checkboxes, verification, review triage, and auto-run result.

**Acceptance Criteria:**
- Given a signed-in user has only a normal traveler role or no elevated role, when they open `/admin`, then access is denied server-side and no admin navigation or controls are shown.
- Given a signed-in user has `admin` or `operator` in PostgreSQL, when they open `/admin`, then they can access a placeholder admin shell that is separate from traveler chat.
- Given roles are stored in PostgreSQL, when admin route handlers or server actions run, then they validate session and role before reading or mutating admin data.
- Given an unauthenticated visitor opens `/admin`, when the route gate runs, then the visitor is sent through public sign-in with a safe `/admin` return path.

## Spec Change Log

- 2026-07-06: Implemented PostgreSQL-backed roles, admin authorization helpers, protected `/admin` route segment, safe `/admin` sign-in redirect preservation, and admin action guard seam.
- 2026-07-06: Review patch moved the admin gate into `src/app/admin/layout.tsx`, wired the admin action guard into the shell, and added a PostgreSQL check constraint for role values.

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (medium 3)
- defer: 1: (low 1)
- reject: 1: (medium 1)
- addressed_findings:
  - `[medium]` `[patch]` Added `user_roles_role_check` at schema and migration level so PostgreSQL rejects roles outside `traveler`, `operator`, and `admin`.
  - `[medium]` `[patch]` Moved admin authorization into `src/app/admin/layout.tsx` so future `/admin/*` pages inherit the route-segment guard instead of relying only on `/admin/page.tsx`.
  - `[medium]` `[patch]` Wired `validateAdminActionAccess` into the placeholder admin shell so the server action seam is exercised from an admin entry point.
  - deferred: No automated route/action tests exist because the repository has no test framework yet; existing baseline verification is lint/typecheck/build.
  - rejected: Admin deep-link preservation for future `/admin/*` paths is outside this story because only `/admin` exists and redirect safety intentionally accepts exact destinations.

## Verification

**Commands:**
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- passed; generated `drizzle/migrations/0001_opposite_doorman.sql` and `drizzle/migrations/meta/0001_snapshot.json`.
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- passed after review patches with `No schema changes, nothing to migrate`.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.
- `pnpm typecheck` -- passed after build regenerated `.next/types`.

## Auto Run Result

Status: done

Summary of implemented change:
- Implemented Story 1.4 roles and separate admin area with PostgreSQL-backed `user_roles`, server-side role helpers, `/admin` route-segment protection, separated Vietnamese admin shell, safe `/admin` sign-in redirects, and an admin-only server action guard seam.
- Applied review patches for database role integrity, inherited admin-route protection, and visible server-action guard usage.

Files changed:
- `src/db/schema.ts` -- Added `UserRole`, `user_roles`, role index, cascade FK, and database check constraint.
- `drizzle/migrations/0001_opposite_doorman.sql` -- Added role table migration with role check constraint.
- `drizzle/migrations/meta/0001_snapshot.json` -- Added Drizzle snapshot for role table.
- `drizzle/migrations/meta/_journal.json` -- Registered the new role migration.
- `src/server/auth.ts` -- Added role lookup, role-aware session helper, admin access predicate, and `requireAdminSession()`.
- `src/features/admin/actions.ts` -- Added admin-only server action guard seam.
- `src/app/admin/layout.tsx` -- Added authenticated and role-checked admin route-segment shell plus denied state.
- `src/app/admin/page.tsx` -- Added placeholder admin overview and action guard form.
- `src/features/auth/actions.ts` -- Allowed safe `/admin` redirect target.
- `src/app/sign-in/page.tsx` -- Preserved safe `/admin` redirect and adjusted gate copy.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Story 1.4 done.
- `_bmad-output/implementation-artifacts/spec-1-4-roles-and-separate-admin-area.md` -- Recorded implementation, review, verification, and result.

Review findings breakdown:
- Patches applied: 3 medium findings fixed.
- Items deferred: 1 low testing gap because no test framework exists in the repo yet.
- Items rejected: 1 future nested admin redirect concern because `/admin/*` routes are not in scope yet and current exact redirect allowlist is intentional.

Follow-up review recommendation: false.

Verification performed:
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate`: passed and then passed cleanly after patches with no schema drift.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `pnpm typecheck`: passed after build regenerated Next type files.

Residual risks:
- Runtime admin access was not exercised against a live database/session because this environment has no configured OAuth session or migrated development database.
- No automated auth/admin tests exist yet; route and server-action behavior are covered by static checks and code review only.
- No commit was created because commits require explicit user request in this environment.
