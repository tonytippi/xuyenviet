---
title: 'Story 4.5: Batch Seed Source URL Intake'
type: 'feature'
created: '2026-07-08'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: 'f76320e'
final_revision: 'f76320e36cc345ec23be46276bd2b73fbafeec57-uncommitted'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-ai-suggests-create-or-update-from-source-url.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Operators can submit one URL at a time, but public-MVP seeding needs a durable way to submit curated URL lists and track each URL independently through intake and later review outcomes. Without batch item status, failed or duplicate URLs either block the whole seed run or become invisible after submission.

**Approach:** Add a protected batch seed URL intake workflow that parses a newline-separated URL list, creates safe source/raw-material rows for valid items, stores per-URL batch item status and error summaries, exposes the batch result in admin intake, and keeps AI processing/review approval separate.

## Boundaries & Constraints

**Always:** Authorize operator/admin before parsing, validation, inserts, audit, or status reads. Track each submitted line as its own batch item with status `pending`, `failed`, or later lifecycle statuses derived from linked source/draft/suggestion state. Preserve source/raw separation: batch intake may store the URL and safe metadata, but it must not fetch pages, call AI, create drafts, approve cards, or expose raw material. Invalid URLs and duplicates within the same submission must be recorded as failed/duplicate item outcomes without rolling back valid URLs. Keep source canonicalization and Facebook/community defaults consistent with single-source intake. Cap batch size to avoid admin timeouts.

**Block If:** Durable per-item tracking requires a product decision beyond the fixed MVP statuses, or if URL fetching/crawling is required to satisfy acceptance criteria.

**Never:** Do not approve knowledge, create embeddings, mutate approved cards, call AI automatically for the whole batch, introduce a crawler, expose provider/raw payloads, or let unauthenticated/traveler callers create or inspect batch intake state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Mixed batch | Operator submits several URLs with optional shared metadata | One batch is created; valid rows create source/raw records and pending batch items; invalid rows create failed items with safe reasons | Valid rows are not rolled back by invalid rows |
| Duplicate URL in same batch | Same canonical URL appears more than once | First valid row is pending; later duplicate rows are failed with duplicate/rejected-style status and safe reason | No duplicate source row for the repeated line |
| Later lifecycle visibility | Batch item source later has extracted drafts, suggestion traces, rejected drafts, or approved cards | Batch status read maps each item to extracted, needs review, duplicate, rejected, approved, failed, or pending as appropriate | Missing source remains failed/pending according to stored item state |
| Unauthorized caller | Traveler or unauthenticated caller submits or reads batch | Authorization fails before parsing, validation, inserts, or audit | No batch, source, raw material, or audit side effects |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- add compact batch and batch item tables plus fixed status enum/checks.
- `drizzle/migrations/*` -- add migration and Drizzle metadata for batch intake tables.
- `src/features/knowledge/batch-intake.ts` -- implement protected batch parsing, per-item persistence, status derivation, listing, and operational errors.
- `src/features/knowledge/actions.ts` -- expose server action/form wrapper for batch submission with safe redirects.
- `src/app/admin/knowledge/intake/page.tsx` -- add batch URL textarea, result summary, and recent batch item status display.
- `tests/knowledge-batch-source-intake.test.ts` -- cover mixed success/failure, duplicate handling, status derivation, authorization-before-side-effects, and caps.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- move Story 4.5 through implementation statuses.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/*` -- add `knowledge_seed_batches` and `knowledge_seed_batch_items` with item status checks and source linkage -- persist per-URL tracking independent of source provenance.
- [x] `src/features/knowledge/batch-intake.ts` -- implement operator-only batch URL intake, canonical duplicate detection, partial success persistence, safe error summaries, batch listing, and derived item statuses -- satisfy batch tracking without adding crawling or AI automation.
- [x] `src/features/knowledge/actions.ts` and `src/app/admin/knowledge/intake/page.tsx` -- add form action and admin intake UI for newline-separated seed URLs plus recent batch status visibility -- make the workflow usable by operators.
- [x] `tests/knowledge-batch-source-intake.test.ts` -- test the I/O matrix, cap enforcement, canonicalization, safe metadata, and authorization-first behavior -- prevent regressions.
- [x] `_bmad-output/implementation-artifacts/spec-4-5-batch-seed-source-url-intake.md` and `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update checkboxes, status, verification, notes, and file list -- keep BMad artifacts aligned.

**Acceptance Criteria:**
- Given an operator submits a list of source URLs, when batch intake starts, then each URL is tracked as a separate intake item with one of the fixed batch statuses.
- Given batch intake completes with some invalid or duplicate URLs, when the operator reviews the batch, then successful URLs remain pending for later extraction/suggestion and failed URLs show safe error reasons without blocking the batch.
- Given linked sources later produce draft/suggestion/review outcomes, when recent batch status is loaded, then item statuses reflect extracted, needs review, approved, failed, duplicate, or rejected without exposing raw source material.
- Given batch intake creates many source rows, when the operator opens the draft review queue, then existing source/suggestion metadata remains available for filtering and review context without any card being auto-approved.

## Spec Change Log

- 2026-07-08: Implemented Story 4.5 protected batch seed URL intake, durable batch/item tables with the full fixed status set including `reading`, admin UI, focused tests, migration metadata, and BMad tracking updates. No commit created per user instruction.

## Review Triage Log

### 2026-07-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 6, low 1)
- defer: 2: (high 0, medium 2, low 0)
- reject: 9
- addressed_findings:
  - `[medium]` `[patch]` Added missing fixed `reading` status to schema, migration, counts, and tests so the durable status set matches Story 4.5.
  - `[medium]` `[patch]` Persisted derived lifecycle statuses back to batch items when recent batches are listed, avoiding stale durable `pending` rows after review outcomes exist.
  - `[medium]` `[patch]` Split `duplicate` and `no_action` semantics by mapping no-action traces to `rejected` rather than collapsing every trace-only outcome into duplicate.
  - `[medium]` `[patch]` Added CR-only line splitting and oversized submitted/canonical URL guards so malformed rows become item failures instead of rolling back valid rows.
  - `[medium]` `[patch]` Mapped archived linked cards to `rejected` and added a source-shape DB constraint for progress statuses without source linkage.
  - `[medium]` `[patch]` Made recent batch and item ordering deterministic with secondary ordering by batch id and item batch id.
  - `[low]` `[patch]` Changed batch form redirect to fail closed if the service unexpectedly returns no result.

Deferred findings:
- Cross-batch/global canonical URL duplicate policy is not defined by Story 4.5; current implementation only rejects duplicates inside one submitted batch.
- Recent batch listing is global to authorized operators/admins; if per-operator privacy becomes required, scope or role-gate listing in a later story.

### 2026-07-08 — Retry code review
- patch: 2: (high 0, medium 2, low 0)
- defer: 0
- dismissed: 4
- [x] [Review][Patch] Align batch item source deletion behavior with the source-shape constraint [`src/db/schema.ts:685`] -- fixed by changing batch item `source_id` to `ON DELETE restrict` and consolidating Story 4.5 migration SQL around the same behavior.
- [x] [Review][Patch] Regenerate or repair Drizzle migration metadata for the final source-shape constraint [`drizzle/migrations/meta/0020_snapshot.json:1955`] -- fixed by regenerating Drizzle metadata, adding `0023_snapshot.json`, and confirming `pnpm db:generate` reports no schema changes.

## Design Notes

Use batch tables rather than adding workflow state to `sources`. Source rows remain provenance records; batch item rows represent one operator seed run and can derive later status from cards/suggestions without changing source semantics.

## Verification

**Commands:**
- `pnpm db:generate` -- expected: migration and metadata generated for new batch tables.
- `pnpm test:run tests/knowledge-batch-source-intake.test.ts` -- expected: focused Story 4.5 coverage passes.
- `pnpm test:run tests/knowledge-source-intake.test.ts` -- expected: single-source intake remains compatible.
- `pnpm typecheck` -- expected: TypeScript strict checks pass.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm build` -- expected: production build succeeds.
- `pnpm test:run` -- expected: full Vitest suite passes.

**Results:**
- `pnpm db:generate` -- passed; generated `drizzle/migrations/0020_stormy_caretaker.sql` and `drizzle/migrations/meta/0020_snapshot.json`, and updated `_journal.json`.
- `pnpm test:run tests/knowledge-batch-source-intake.test.ts` -- passed; 6 tests passed. PostgreSQL emitted an expected identifier-truncation notice for the generated long FK name.
- `pnpm test:run tests/knowledge-source-intake.test.ts` -- passed; 8 tests passed.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `pnpm build` -- passed; Next.js production build completed successfully.
- Final regression: `pnpm test:run` -- passed; 15 files / 207 tests passed. Existing expected stderr appeared in AI Ask failure-path tests and provider-failure tests.
- Review patch verification: `pnpm test:run tests/knowledge-batch-source-intake.test.ts` -- passed; 7 tests passed after fixing migration chain and status constraints.
- Review patch verification: `pnpm typecheck` -- passed.
- Review patch verification: `pnpm lint` -- passed.
- Review patch verification: `pnpm test:run` -- passed; 15 files / 208 tests passed. Existing expected stderr appeared in AI Ask failure-path tests and provider-failure tests.
- Review patch verification: `pnpm build` -- passed.
- Retry review patch verification: `pnpm db:generate` -- passed; no schema changes after migration metadata repair.
- Retry review patch verification: `pnpm test:run tests/knowledge-batch-source-intake.test.ts` -- passed; 7 tests passed. PostgreSQL emitted existing migration schema/relation notices.
- Retry review patch verification: `pnpm typecheck` -- passed.
- Retry review patch verification: `pnpm lint` -- passed.

## Implementation Notes

- Added `knowledge_seed_batches` and `knowledge_seed_batch_items` with fixed item statuses (`pending`, `reading`, `extracted`, `needs_review`, `approved`, `failed`, `duplicate`, `rejected`), source linkage, safe error summaries, per-batch line uniqueness, indexes, and generated Drizzle migration metadata.
- Added `submitKnowledgeSeedUrlBatch` as a server-only, operator/admin-protected service that authorizes before parsing, caps non-empty URL lines at 50, canonicalizes through existing single-source normalization, records duplicate URLs within the same submission as item-level duplicate failures, persists valid source/raw rows, and records a safe audit event.
- Validation failures are recorded per item, while unexpected persistence failures are not swallowed and instead fail the transaction to avoid orphaned partial writes.
- Added `listRecentKnowledgeSeedBatches` to derive and persist operator-visible item statuses from linked cards and Story 4.4 suggestion traces without loading or returning raw source material.
- Wired a server action and admin intake UI for newline-separated batch URLs, shared safe metadata, success/error summaries, and recent batch status visibility.
- Review fixes added CR-only line handling, oversized URL item failures, deterministic listing order, no-action vs duplicate distinction, archived-to-rejected mapping, additive constraint migrations for existing databases, and fail-closed batch redirect behavior.
- Retry review fixes aligned batch item source deletion with the source-shape constraint using `ON DELETE restrict` and repaired Drizzle metadata drift for the final Story 4.5 schema.
- No crawler, AI automation, approval, embeddings, approved-card mutation, or raw material exposure was added.

## Auto Run Result

Status: done

Summary: Implemented and review-hardened Story 4.5 end-to-end with durable batch URL intake tables, protected batch service, admin UI, status derivation/persistence, focused tests, migration chain fixes, and BMad tracking updates.

Acceptance criteria: complete. Batch URL lines are individually tracked with the fixed status set, invalid/duplicate rows do not block valid rows, later linked card/suggestion outcomes update item status, and raw source material is not returned by batch listing.

Review findings breakdown: 7 patch findings fixed, 2 deferred, 9 rejected as noise or out of current-story scope. Follow-up review recommended: true because review fixes touched schema constraints, migrations, durable status semantics, and lifecycle mapping.

Verification performed: focused Story 4.5 tests, adjacent source intake tests, typecheck, lint, full Vitest suite, and production build all passed after review fixes.

Residual risks: Cross-batch/global duplicate canonical URL policy and per-operator batch visibility remain intentionally deferred because Story 4.5 only specified per-submission duplicate handling and operator/admin access.

## File List

- `_bmad-output/implementation-artifacts/spec-4-5-batch-seed-source-url-intake.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0020_stormy_caretaker.sql`
- `drizzle/migrations/0021_fix_seed_batch_failure_shape.sql`
- `drizzle/migrations/0022_add_seed_batch_source_shape.sql`
- `drizzle/migrations/0023_fancy_moondragon.sql`
- `drizzle/migrations/meta/0020_snapshot.json`
- `drizzle/migrations/meta/0023_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/app/admin/knowledge/intake/page.tsx`
- `src/db/schema.ts`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/batch-intake.ts`
- `tests/knowledge-batch-source-intake.test.ts`
