---
title: 'Story 4.1: Submit Travel Source For AI Reading'
type: 'feature'
created: '2026-07-08'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '3a53476e92eb5dce75dccb6183394015d32894f0'
final_revision: '3a53476e92eb5dce75dccb6183394015d32894f0'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Operators need a protected intake path for URLs, Facebook/community links, copied text, pasted text, and screenshot/file metadata so AI-assisted knowledge work can start without mixing safe provenance metadata with raw operator-only material. Intake must not create approved knowledge or expose raw source material to travelers.

**Approach:** Add knowledge-owned persistence, validation, server action, admin intake UI, and tests that create one normalized safe source record plus one separate raw source material record inside an audited operator/admin mutation.

## Boundaries & Constraints

**Always:** Gate every mutation server-side to operator/admin roles; store safe source metadata in `sources` and raw text/file/raw metadata in `raw_source_material`; default Facebook links and copied/community content to community/unverified with `official=false` and `partner=false`; keep audit summaries safe and raw-content-free; update Drizzle schema and migration metadata for new tables.

**Block If:** A live file upload/storage backend is required instead of metadata-only screenshot intake; the story must perform AI extraction/provider reads; existing schema/migration generation cannot run and the table contract cannot be represented safely by hand.

**Never:** Do not create knowledge cards, approved knowledge, embeddings, AI provider calls, traveler-facing source bundles, reward/credit behavior, or direct DB writes from UI components.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Operator URL intake | Operator submits `https://example.com/path?utm_source=x` with optional label/publisher/date | Creates `sources` row with kind `url`, canonical URL without tracking noise when possible, source type `curated`, verification `unverified`, and a linked operator-only raw material row | No error expected |
| Facebook/community intake | Operator submits Facebook URL or copied community content | Creates safe source metadata defaulted to `community` and `unverified`, with official/partner flags false | No error expected |
| Pasted text intake | Operator submits non-empty pasted text without URL | Creates source kind `pasted_text`, safe label, no traveler-visible raw content, raw text only in `raw_source_material` | Reject empty/oversized text before DB writes |
| Screenshot metadata intake | Operator submits allowed image metadata | Creates source kind `screenshot`, safe file metadata in raw material, no file upload or image reading | Reject missing file name/type/size or unsupported/oversized image metadata before DB writes |
| Unauthorized intake | Traveler or unauthenticated user calls action | No source, raw material, or audit rows are created | Throw existing admin authorization error safely |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- Drizzle schema object and enum/check/index conventions for new `sources` and `raw_source_material` tables.
- `drizzle/migrations/` -- generated SQL and snapshot metadata for persistent knowledge intake tables.
- `src/server/mutations.ts` -- existing `runAuditedAdminMutation` transaction/audit wrapper for protected operator actions.
- `src/server/auth.ts` -- existing operator/admin access rules reused by mutation wrapper and admin shell.
- `src/features/audit/events.ts` -- audit summary behavior; keep raw source text and raw metadata out.
- `src/features/knowledge/` -- currently empty feature boundary; add knowledge-owned source normalization and action entrypoints here.
- `src/app/admin/layout.tsx` -- existing role-protected admin shell and navigation.
- `src/app/admin/knowledge/intake/page.tsx` -- new Vietnamese-first operator intake form and safe feedback surface.
- `tests/helpers/db.ts` -- test database helper and cleanup pattern.
- `tests/ai-models.test.ts` -- reference pattern for admin/operator action tests with auth mocking and audit assertions.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` -- add typed source/raw material enum values, `sources`, `rawSourceMaterial`, checks, indexes, foreign keys, and schema exports -- create the durable safe-vs-raw persistence boundary.
- [x] `drizzle/migrations/` -- generate the migration for the new knowledge intake tables -- keep Drizzle migration state authoritative.
- [x] `src/features/knowledge/sources.ts` -- add server-only normalization/validation helpers for source kind, canonical URL, labels, community defaults, dates, raw text limits, and screenshot metadata limits -- keep UI/action logic small and reusable.
- [x] `src/features/knowledge/actions.ts` -- add `submitTravelSourceForAiReading` using `runAuditedAdminMutation` to insert source and raw material in one transaction and return only safe metadata -- enforce protected knowledge ownership and safe audit behavior.
- [x] `src/app/admin/layout.tsx` -- add a knowledge intake navigation link under the existing admin shell -- expose the new operator workflow without changing traveler UI.
- [x] `src/app/admin/knowledge/intake/page.tsx` -- add Vietnamese-first server-rendered intake page with form fields for URL/Facebook link, copied/pasted text, and screenshot metadata -- let operators submit sources and recover from validation failures.
- [x] `tests/knowledge-source-intake.test.ts` -- cover the I/O matrix and schema constraints for safe/rawl split, Facebook/community defaults, unauthorized denial, and screenshot/raw text validation -- prevent regressions in the security boundary.
- [x] `_bmad-output/implementation-artifacts/spec-4-1-submit-travel-source-for-ai-reading.md` -- update status, task checkboxes, change notes, and file list as implementation progresses -- keep BMad artifacts aligned.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- move story 4.1 to the appropriate terminal status after implementation/review -- keep sprint tracking aligned.

**Acceptance Criteria:**
- Given an operator opens the admin knowledge intake page, when they submit a URL, Facebook link, pasted/copied text, or screenshot metadata, then the system stores one normalized source record and one linked operator-only raw material record.
- Given raw material includes copied text, screenshot metadata, or provider-specific metadata, when intake completes, then the action response and source row expose only safe source metadata and raw material stays in `raw_source_material`.
- Given the submitted source is Facebook-derived or copied community content, when it is stored, then it defaults to community/unverified and is not marked official or partner.
- Given source submission validation fails, when the operator submits the form, then the UI shows a recoverable safe error and no approved knowledge, source, raw material, or audit side effect is created for that failed submission.
- Given a traveler or unauthenticated user calls the intake action, when authorization runs, then server-side role checks deny access before creating source, raw material, or audit rows.

## Spec Change Log

- 2026-07-08: Implemented operator knowledge source intake persistence, action, admin UI, migration, and focused tests. Status left `in-review` for main workflow completion.

## Review Triage Log

### 2026-07-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 5, low 0)
- defer: 0
- reject: 3: (high 0, medium 2, low 1)
- addressed_findings:
  - `[medium]` `[patch]` Moved source input normalization inside the audited admin mutation action so role authorization happens before validation and before DB side effects.
  - `[medium]` `[patch]` Re-throws `AdminAuthorizationError` from the form wrapper instead of converting unauthorized calls into recoverable validation redirects.
  - `[medium]` `[patch]` Stores canonicalized URLs in the safe `url` and `canonicalUrl` fields so tracking parameters are not returned in safe source metadata.
  - `[medium]` `[patch]` Tightened collected-date validation to reject calendar rollover dates such as `2026-02-31`.
  - `[medium]` `[patch]` Generalized derived screenshot source labels so file names stay in raw source material rather than safe source metadata or audit summaries.

### 2026-07-08 — Follow-up Review Findings
- [x] [Review][Patch] Bound safe source metadata so label/publisher cannot become raw-content leaks [`src/features/knowledge/sources.ts:57`] -- fixed with app and DB safe metadata limits.
- [x] [Review][Patch] Map unexpected form failures to a generic safe error instead of redirecting with raw exception messages [`src/features/knowledge/actions.ts:75`] -- fixed with allowlisted validation errors.
- [x] [Review][Patch] Classify Facebook short-link hosts such as `fb.watch` as community Facebook sources [`src/features/knowledge/sources.ts:129`] -- fixed and covered by focused test.
- [x] [Review][Patch] Enforce the one-raw-material-row-per-source intake invariant at the database layer [`src/db/schema.ts:191`] -- fixed with a unique index migration.
- [x] [Review][Patch] Strengthen `collected_date` persistence validity beyond regex-only dates [`src/db/schema.ts:184`] -- fixed with a DB calendar-date check.

## Design Notes

Use a metadata-only screenshot path for this story. The accepted screenshot input represents a file already known to the operator UI by name/type/size/storage key; actual upload/storage and image extraction are later responsibilities unless already available in the codebase. This keeps Story 4.1 focused on the source/raw boundary required by later AI extraction.

## Verification

**Commands:**
- `pnpm db:generate` -- expected: migration generated from the updated Drizzle schema.
- `pnpm test:run tests/knowledge-source-intake.test.ts` -- expected: focused Story 4.1 coverage passes.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm typecheck` -- expected: TypeScript strict checks pass.
- `pnpm test:run` -- expected: full Vitest suite passes.
- `pnpm build` -- expected: production build succeeds.

**Results:**
- `pnpm db:generate` -- passed; generated `drizzle/migrations/0014_nappy_wither.sql` and `drizzle/migrations/meta/0014_snapshot.json`.
- `pnpm test:run tests/knowledge-source-intake.test.ts` -- passed; 7 tests passed.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm test:run` -- passed; 11 files / 169 tests passed.
- `pnpm build` -- passed.
- Review fix verification: `pnpm test:run tests/knowledge-source-intake.test.ts` -- passed; 8 tests passed.
- Review fix verification: `pnpm lint` -- passed.
- Review fix verification: `pnpm typecheck` -- passed.
- Review fix verification: `pnpm test:run` -- passed; 11 files / 170 tests passed.
- Review fix verification: `pnpm build` -- passed.
- Follow-up review fix verification: `pnpm db:generate` -- passed; generated `drizzle/migrations/0015_glorious_inertia.sql` and `drizzle/migrations/meta/0015_snapshot.json`.
- Follow-up review fix verification: `pnpm test:run tests/knowledge-source-intake.test.ts` -- passed; 8 tests passed.
- Follow-up review fix verification: `pnpm lint` -- passed.
- Follow-up review fix verification: `pnpm typecheck` -- passed after tightening catch-block error narrowing.
- Follow-up review fix verification: `pnpm test:run` -- passed; 11 files / 170 tests passed.
- Follow-up review fix verification: `pnpm build` -- passed.

## Implementation Notes

- Added `sources` for safe provenance metadata and `raw_source_material` for operator-only raw text/file metadata/raw metadata.
- `submitTravelSourceForAiReading` gates through `runAuditedAdminMutation`, inserts source and raw material in one transaction, and returns only safe source fields.
- Facebook URLs and copied community content default to `community`/`unverified` with `official=false` and `partner=false`; audit summaries exclude raw text and raw metadata.
- Screenshot intake is metadata-only; no upload, storage, image reading, AI extraction, knowledge card, or embedding behavior was added.
- Review fixes ensure authorization precedes validation, safe URLs are canonicalized, impossible dates are rejected, and screenshot file names remain raw-only.

## Auto Run Result

Status: done

Summary: Implemented Story 4.1 operator knowledge source intake with safe source metadata, separate operator-only raw source material, audited operator/admin mutation, Vietnamese admin intake UI, Drizzle migration, and focused regression coverage.

Review findings breakdown: 5 patch findings fixed, 0 deferred, 3 rejected as non-blocking or already covered after context review. Follow-up review recommended: false.

Verification performed: `pnpm db:generate`, `pnpm test:run tests/knowledge-source-intake.test.ts`, `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, and `pnpm build` all passed. After review fixes, focused test, lint, typecheck, full test, and build were rerun and passed.

Residual risks: Screenshot handling is intentionally metadata-only; real file upload/storage and AI extraction remain future-story scope. No git commit was created because this session was not explicitly asked to commit.

## File List

- `_bmad-output/implementation-artifacts/spec-4-1-submit-travel-source-for-ai-reading.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0014_nappy_wither.sql`
- `drizzle/migrations/0015_glorious_inertia.sql`
- `drizzle/migrations/meta/0014_snapshot.json`
- `drizzle/migrations/meta/0015_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/app/admin/knowledge/intake/page.tsx`
- `src/app/admin/layout.tsx`
- `src/db/schema.ts`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/sources.ts`
- `tests/knowledge-source-intake.test.ts`
