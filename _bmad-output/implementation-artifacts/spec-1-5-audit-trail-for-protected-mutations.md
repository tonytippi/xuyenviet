---
title: 'Story 1.5: Audit Trail For Protected Mutations'
type: 'feature'
created: '2026-07-06'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_commit: 'fd77b13'
final_revision: 'NO_COMMIT_CREATED'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Protected server-side mutation seams exist, but successful protected operations do not yet create an auditable record. Future admin, knowledge, chat/trip, deletion, usage, and referral command modules need one shared append-only audit pattern before they start mutating protected state.

**Approach:** Add a minimal PostgreSQL-backed `audit_events` table, a server-only audit helper, and audited mutation wrappers that authorize before work runs and write audit events only after successful protected mutations. Wire the existing admin server-action seam through the audited wrapper so the pattern is proven without adding unrelated domain aggregates.

## Boundaries & Constraints

**Always:** Keep audit writes server-only, append-only, PostgreSQL-backed, and owned by the audit feature. Capture actor user ID/email, operation, target type/ID when known, timestamp, and before/after summaries where relevant. Authorize before any protected mutation work runs. Keep command modules responsible for their own aggregates; audit helpers must record events, not perform generic cross-module upserts/deletes.

**Block If:** Implementing the audit table through Drizzle migration is not possible, authenticated/admin session resolution cannot provide a stable actor, or a required atomic transaction contract cannot be satisfied by the current database client without a larger data-access redesign.

**Never:** Do not audit Auth.js adapter internals, do not write audit events from client components, do not log secrets/provider payloads/raw source material, do not create usage billing/provenance/referral ledger behavior, and do not introduce knowledge/chat/trip domain tables in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Successful admin protected action | Admin/operator submits the existing admin action form | Server validates admin role, runs the protected action, and inserts one audit event with actor, operation, target, timestamp, and summary | No user-facing sensitive details are exposed |
| Unauthorized admin protected action | Unauthenticated or traveler-only caller invokes the admin action | Authorization rejects before protected work and before any audit insert for a changed state | Generic admin authorization error; no protected state changes |
| Future authenticated mutation | Feature command calls the shared audited authenticated wrapper with audit metadata | Wrapper authenticates, runs the feature-owned action, then records audit metadata server-side | Authentication failure rejects before action and audit write |
| Audit metadata optionality | Mutation has no before/after summary or target ID yet | Audit row still records actor, operation, target type, and timestamp, with nullable optional fields | No placeholder fake summaries are stored |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- Add `audit_events` table, TypeScript audit operation metadata shape, indexes, and schema export.
- `drizzle/migrations/*` -- Introduce audit table and indexes through Drizzle migration artifacts.
- `src/features/audit/events.ts` -- Add server-only append-only audit event helper and audit metadata types.
- `src/server/mutations.ts` -- Add audited authenticated/admin mutation wrappers while preserving existing unaudited authenticated helper.
- `src/features/admin/actions.ts` -- Route the admin protected action seam through the audited admin mutation wrapper.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 1.5 in progress/review/done as implementation proceeds.
- `_bmad-output/implementation-artifacts/spec-1-5-audit-trail-for-protected-mutations.md` -- Record implementation, verification, review triage, and result details.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/*` -- Add `audit_events` with append-only event fields and useful actor/target/created indexes so protected mutations can be reviewed later.
- [x] `src/features/audit/events.ts` -- Add `recordAuditEvent()` as the server-only audit owner helper that inserts sanitized audit summaries.
- [x] `src/server/mutations.ts` -- Add `runAuditedAuthenticatedMutation()` and `runAuditedAdminMutation()` so future command modules can authorize, mutate, and record audit metadata without bypassing aggregate ownership.
- [x] `src/features/admin/actions.ts` -- Update `validateAdminActionAccess()` to use the audited admin wrapper and write a minimal proof audit event only for successful admin/operator access.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- Keep story status, task checkboxes, verification, review triage, and auto-run result aligned.

**Acceptance Criteria:**
- Given a protected server-side mutation succeeds, when it changes protected state or exercises the protected action seam, then an audit event records actor, target, operation, timestamp, and relevant before/after summary where appropriate.
- Given a mutation fails authorization, when the request is rejected, then protected work does not run and no changed-state audit event is written.
- Given future modules need audited writes, when they implement command modules, then they can use a shared server-only audit wrapper/helper without receiving generic cross-module write access.
- Given audit rows are stored, when operators need later traceability, then the data model preserves actor, target, operation, timestamp, and optional summaries without storing sensitive payloads.

## Spec Change Log

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (medium 2)
- defer: 3: (medium 3)
- reject: 6: (high 4, medium 2)
- addressed_findings:
  - `[medium]` `[patch]` Wrapped audited mutation actions and audit inserts in a shared Drizzle transaction so state-changing command modules can avoid committing protected changes without their audit row when they use the wrapper.
  - `[medium]` `[patch]` Bounded audit before/after summaries to 2000 characters to reduce accidental log bloat while preserving concise audit context.
  - deferred: Audit coverage remains opt-in by design until future stories add real protected aggregate command modules; existing unaudited helper stays for auth-only non-state-changing seams.
  - deferred: No automated tests were added because the repository has no test framework yet; behavior is covered by lint/typecheck/build and review only.
  - deferred: User deletion/anonymization behavior for audit rows is not defined yet and should be handled with future account deletion/privacy stories.

## Verification

**Commands:**
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- expected: audit table migration generated or schema reports no drift after generation.
- `pnpm lint` -- expected: ESLint passes.
- `pnpm typecheck` -- expected: TypeScript passes.
- `pnpm build` -- expected: Next.js production build passes.

**Results:**
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate` -- passed; generated `drizzle/migrations/0002_modern_vulture.sql`, then passed cleanly after review patches with `No schema changes, nothing to migrate`.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

## Auto Run Result

Status: done

Summary of implemented change:
- Implemented Story 1.5 audit foundation with a PostgreSQL-backed `audit_events` table, server-only audit event helper, transaction-aware audited authenticated/admin mutation wrappers, and an audited admin action seam.
- Applied review patches to keep feature actions and audit inserts in one transaction for wrapper users and to bound audit summary size.

Files changed:
- `src/db/schema.ts` -- Added `AuditOperation`, `audit_events`, operation check constraint, actor/target/time indexes, and schema export.
- `drizzle/migrations/0002_modern_vulture.sql` -- Added audit table migration.
- `drizzle/migrations/meta/0002_snapshot.json` -- Added Drizzle snapshot for audit schema.
- `drizzle/migrations/meta/_journal.json` -- Registered the audit migration.
- `src/features/audit/events.ts` -- Added server-only `recordAuditEvent()` with summary normalization.
- `src/server/mutations.ts` -- Added audited authenticated/admin mutation wrappers using a shared transaction.
- `src/features/admin/actions.ts` -- Routed the admin action guard seam through audited admin mutation logging.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Story 1.5 done.
- `_bmad-output/implementation-artifacts/spec-1-5-audit-trail-for-protected-mutations.md` -- Recorded implementation, review, verification, and result.

Review findings breakdown:
- Patches applied: 2 medium findings fixed.
- Items deferred: 3 medium items for future audit enforcement/testing/privacy lifecycle work.
- Items rejected: 6 findings were either contradicted by the actual file state, outside current story scope, or duplicates of patched/deferred items.

Follow-up review recommendation: false.

Verification performed:
- `DATABASE_URL="postgresql://xuyenviet:xuyenviet@localhost:5432/xuyenviet" pnpm db:generate`: passed; generated migration and later confirmed no schema drift.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.

Residual risks:
- Runtime audit behavior was not exercised against a live migrated database/session because this environment has no configured OAuth session flow.
- No automated tests exist yet in this repository; audit behavior currently relies on type/build checks and code review.
- Future real protected aggregate commands must deliberately use the audited wrappers or an equivalent transaction-aware audit pattern.
- Audit row retention/anonymization behavior should be defined when account deletion/privacy workflows are introduced.
- No commit was created because commits require explicit user request in this environment.
