---
title: 'Story 1.7: Capture Referral Attribution At Sign-Up'
type: 'feature'
created: '2026-07-06'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_commit: 'd54764d'
final_revision: 'NO_COMMIT_CREATED'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Referral codes are preserved in public/sign-in URLs, but the system has no source of truth for valid codes and no server-side attribution capture when a new Google user first signs in. Without this, future referral programs cannot attribute registrations safely.

**Approach:** Add minimal Drizzle-owned referral code and referral attribution tables, then use Auth.js sign-in flow state to validate a submitted `ref` code and create exactly one first-touch attribution for newly created users. Keep the UX silent and capture-only.

## Boundaries & Constraints

**Always:** Validate referral codes server-side against `referral_codes`; preserve normal sign-in for missing or invalid codes; create attribution only when the signed-in user has no existing attribution; keep referral behavior separate from rewards, credits, payouts, rankings, balances, and admin correction.

**Block If:** Auth.js cannot make the submitted `ref` value available to server-side sign-in/account creation without adding an unsafe client trust path, or Drizzle migration generation cannot run because local database configuration is unavailable.

**Never:** Do not block Google sign-in for referral failures, do not create reward or ledger tables, do not show traveler-facing reward UI, do not overwrite an existing attribution, and do not store provider tokens or raw OAuth payloads as referral evidence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid first referral | New Google user signs in after `/sign-in?ref=VALID` and `VALID` exists/active | One `referral_attributions` row links the new user to the code and resolvable referrer, with timestamp | Sign-in continues even if attribution insert fails due to race/existing row |
| Invalid referral | New Google user signs in after `/sign-in?ref=BAD` and no active code matches | User/session/account are still created; no attribution row is created | No user-facing provider or DB detail is exposed |
| Existing attribution | User with existing attribution signs in later with another valid `ref` | Original attribution remains unchanged | Later referral is ignored silently |
| Missing referral | User signs in without `ref` | Normal Google sign-in behavior unchanged | No attribution attempt required |
| Self referral | User signs in with a code whose referrer resolves to the same user | Sign-in works, no self-attribution is created | Ignore silently; no reward behavior exists |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- Owns Auth.js, role, audit tables; add `referral_codes` and `referral_attributions` with constraints/indexes and export them in `schema`.
- `src/features/referrals/attribution.ts` -- New server-only referral ownership module for sanitizing codes, reading the pending referral cookie/state, validating active codes, and creating first-touch attribution idempotently.
- `src/features/auth/actions.ts` -- Existing sign-in server action that receives hidden `ref`; set short-lived server-readable referral state before starting Google OAuth.
- `src/auth.ts` -- Auth.js configuration and callbacks; call referral capture from a server-side callback/event after user identity is known.
- `src/app/page.tsx`, `src/app/sign-in/page.tsx`, `src/app/ai-ask/page.tsx` -- Already preserve `ref`; tighten normalization only if needed, without adding reward UI.
- `drizzle/migrations/*` -- Generated migration for the two referral tables and constraints.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 1.7 in-progress/review/done during execution.
- `_bmad-output/implementation-artifacts/spec-1-7-capture-referral-attribution-at-sign-up.md` -- Record implementation, verification, review triage, and result details.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` -- Add referral code and attribution tables with first-touch uniqueness, active code validation fields, optional referrer user reference, and indexes -- provides the required source of truth.
- [x] `src/features/referrals/attribution.ts` -- Implement server-only helpers to normalize referral codes, store/read/clear pending referral state, validate codes, and create attribution only if none exists -- keeps referral ownership isolated.
- [x] `src/features/auth/actions.ts` -- Persist sanitized `ref` before `signIn("google")` redirects and keep existing safe redirect behavior -- carries referral intent through OAuth without exposing new client write paths.
- [x] `src/auth.ts` -- Invoke referral attribution after Auth.js resolves a user and ensure failures do not block sign-in -- makes capture server-side and tied to authenticated identity.
- [x] `drizzle/migrations/*` -- Run `pnpm db:generate` after schema changes -- keeps database migration history authoritative.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- Keep status, task checkboxes, verification, review triage, and auto-run result aligned.

**Acceptance Criteria:**
- Given referral support is configured, when the schema is migrated, then the system has a minimal server-side referral-code source of truth and validates submitted codes against it.
- Given a public visitor opens XuyenViet with a valid referral code and completes Google sign-in as a new user, when Auth.js resolves the user, then one server-side attribution row links the user to the referral code and referrer when resolvable.
- Given a referral code is invalid or missing, when the user signs in, then sign-in still works normally and no reward, credit, payout, ranking, balance, or conversion state is created.
- Given a user already has referral attribution, when they open a different referral link later, then the first attribution is preserved.
- Given referral capture encounters a recoverable validation, duplicate, or insert error, when sign-in completes, then the user-facing flow does not expose sensitive DB/OAuth details.

## Spec Change Log

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 3)
- defer: 0
- reject: 2: (medium 1, low 1)
- addressed_findings:
  - `[high]` `[patch]` Moved referral capture from the pre-persistence Auth.js `signIn` callback to the post-persistence `events.signIn` hook so first-time OAuth users have a persisted user ID before attribution insert.
  - `[medium]` `[patch]` Gated referral attribution on `isNewUser` so existing users without attribution cannot retroactively claim a referral after sign-up.
  - `[medium]` `[patch]` Stopped clearing the pending referral cookie on transient capture exceptions, while still clearing it for terminal invalid, existing-attribution, self-referral, and successful capture cases.
  - `[medium]` `[patch]` Removed the referral code from the post-auth redirect URL after storing it in an HTTP-only cookie, reducing exposure through browser history, logs, analytics, and referrer headers.

## Verification

**Commands:**
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- expected: migration is generated or reports no schema drift after generation.
- `pnpm lint` -- expected: ESLint passes.
- `pnpm typecheck` -- expected: TypeScript passes.
- `pnpm build` -- expected: Next.js production build passes.

**Results:**
- `pnpm db:generate` -- passed; generated `drizzle/migrations/0003_loving_barracuda.sql` and `drizzle/migrations/meta/0003_snapshot.json`.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.
- `pnpm typecheck` -- initially failed when run in parallel before `.next/types` existed; passed after `pnpm build` regenerated Next.js type files.
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- passed; no schema changes after migration generation.

## Auto Run Result

Status: done

Summary of implemented change:
- Implemented Story 1.7 referral attribution capture with Drizzle-owned referral code and attribution tables, server-only pending referral state, new-user-only Auth.js attribution capture, and no reward/credit/payout behavior.
- Applied review patches so capture happens after Auth.js persists the user, existing users cannot retroactively claim referral attribution, transient capture errors preserve pending state, and post-auth redirects no longer expose referral codes.

Files changed:
- `src/db/schema.ts` -- Added `referral_codes` and `referral_attributions` tables, constraints, indexes, and schema exports.
- `src/features/referrals/attribution.ts` -- Added server-only referral normalization, HTTP-only pending referral cookie handling, active code validation, self-referral guard, and idempotent first-touch attribution insert.
- `src/features/auth/actions.ts` -- Stores sanitized pending referral state before starting Google OAuth and redirects without keeping `ref` in the post-auth URL.
- `src/auth.ts` -- Captures first-touch referral attribution in Auth.js `events.signIn` only for newly created users.
- `drizzle/migrations/0003_loving_barracuda.sql` -- Creates referral tables, constraints, indexes, and foreign keys.
- `drizzle/migrations/meta/0003_snapshot.json` and `drizzle/migrations/meta/_journal.json` -- Updated Drizzle migration metadata.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Story 1.7 done.
- `_bmad-output/implementation-artifacts/spec-1-7-capture-referral-attribution-at-sign-up.md` -- Recorded implementation, review, verification, and final result.

Review findings breakdown:
- Patches applied: 4 findings fixed: 1 high, 3 medium.
- Items deferred: 0.
- Items rejected: 2 findings: one medium active-code deactivation race not relevant until an admin deactivation mutation exists, and one low artifact-verification concern resolved by running and recording final checks.

Follow-up review recommendation: true.

Verification performed:
- `pnpm db:generate`: passed; migration generated.
- `pnpm lint`: passed.
- `pnpm build`: passed.
- `pnpm typecheck`: passed after build generated `.next/types`.
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate`: passed; no schema changes.

Residual risks:
- No automated unit/integration test framework exists yet, so referral OAuth capture behavior is covered by type/build checks, code review, and schema generation rather than executable auth-flow tests.
- Referral codes require seed/admin-created/config-backed records before attribution can be observed in a real environment.
- No commit was created because commits require explicit user request in this environment.
