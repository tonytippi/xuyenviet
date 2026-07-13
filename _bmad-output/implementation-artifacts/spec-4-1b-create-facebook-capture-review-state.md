---
title: 'Story 4.1B: Create Facebook Capture Review State'
type: 'feature'
created: '2026-07-13'
status: 'review'
baseline_commit: '1798323ec9c480ddab6a17803c1787080c1f70a2'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
  - '{project-root}/_bmad-output/planning-artifacts/implementation-readiness-report-2026-07-10.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md'
  - '{project-root}/docs/facebook-capture-operations.md'
warnings:
  - 'This story creates workflow state only. Do not build the admin capture queue UI, extraction action, approve-all action, or reject/reopen actions here; those are Stories 4.1C-4.1G.'
  - 'Captured Facebook raw text remains operator-only in raw_source_material. Do not expose it to travelers, audit summaries, source bundles, or approved knowledge retrieval.'
---

# Story 4.1B: Create Facebook Capture Review State

Status: review

<!-- Note: Validation is optional. Run bmad-create-story validate for quality check before bmad-dev-story. -->

## Story

As an operator,
I want captured Facebook source material to have explicit review workflow state,
so that admin review, extraction, approval, rejection, and retry behavior are consistent.

## Acceptance Criteria

1. Given a Facebook source has captured raw text, when capture review state is created, then the system stores a `facebook_capture_reviews` row linked to the source and raw source material, and the initial status is `needs_review`.
2. Given Facebook capture review state exists, when the system queries reviewable captures, then it can filter by status: `needs_review`, `rejected`, `extracted`, `extracted_approved`, or `extraction_failed`, and review queue filtering does not depend on parsing `raw_source_material.rawMetadata` JSON.
3. Given capture review state changes, when an admin/operator extracts, approves all, rejects, or encounters extraction failure, then the review row records the current status, reviewer user ID when applicable, review timestamp when applicable, safe rejection reason or extraction error when applicable, and updated timestamp, and raw captured text remains in `raw_source_material` as operator-only material.
4. Given a Facebook source has already been extracted through the AI extraction workflow, when review state is displayed or updated, then duplicate extraction is blocked, and the UI can link to existing draft or approved cards instead of creating another extraction set.
5. Given the review table is added, when migrations run, then database constraints preserve one active review state per captured Facebook source, and non-Facebook sources are not accidentally added to the Facebook capture review queue.

## Tasks / Subtasks

- [x] Add Facebook capture review schema and migration (AC: 1, 2, 3, 5)
  - [x] Add `facebookCaptureReviewStatusValues` and type in `src/db/schema.ts` with exactly `needs_review`, `rejected`, `extracted`, `extracted_approved`, and `extraction_failed`.
  - [x] Add `facebookCaptureReviews` table in `src/db/schema.ts` and export it from `schema`.
  - [x] Include required columns: `id`, `sourceId`, `rawSourceMaterialId`, `status`, `reviewerUserId`, `reviewedAt`, `rejectionReason`, `extractionError`, `createdAt`, and `updatedAt`.
  - [x] Add foreign keys to `sources.id`, `raw_source_material.id`, and nullable `users.id` for reviewer. Prefer `onDelete: restrict` for source/raw material so review history cannot silently disappear while workflow state exists.
  - [x] Add a unique index on `sourceId` to enforce one active review state per captured Facebook source for MVP.
  - [x] Add indexes for `status`, `updatedAt`, and source/raw material lookup as needed by later queue/detail pages.
  - [x] Add check constraints for valid status values, safe bounded rejection/error strings, status-field shape, and non-null review timestamp/reviewer for terminal operator-reviewed states where applicable.
  - [x] Create the Drizzle migration with `pnpm db:generate`; do not hand-edit generated snapshot JSON unless Drizzle output is broken and the fix is explicitly documented.

- [x] Enforce Facebook/captured-source eligibility at the service boundary (AC: 1, 5)
  - [x] Add Knowledge-owned service functions, likely in `src/features/knowledge/facebook-capture-review.ts`, for creating and querying review state.
  - [x] Accept an explicit Drizzle DB or transaction object for pure helpers so capture can create review state inside the existing raw-text update transaction and tests can use `testDb`.
  - [x] Require `sources.kind = 'facebook'` and `raw_source_material.raw_text` present/non-blank before creating a review row.
  - [x] Link the review row to the exact raw material row used for captured text; do not infer reviewability from `rawMetadata` keys.
  - [x] Make creation idempotent for already-created review rows so capture retry or repeated script completion does not create duplicates.
  - [x] Return a safe read model that contains source IDs, source label/URL/canonical URL, safe capture metadata, status, timestamps, and linked draft/card IDs when available, but not raw captured text unless a later admin detail story explicitly asks for it.

- [x] Wire capture completion to review-state creation (AC: 1, 2)
  - [x] Update `src/features/knowledge/facebook-capture.ts` so `updateQueuedFacebookSourceRawText` creates or confirms a `needs_review` row in the same transaction as the raw text update.
  - [x] Preserve the existing script-safe import boundary: `facebook-capture.ts` currently avoids `server-only` and imports schema relatively. Do not import `src/db/client.ts`, `src/server/auth.ts`, `src/server/mutations.ts`, or any module that imports `server-only` into the Playwright script path.
  - [x] Keep the existing raw text update/audit atomic behavior from Story 4.1A.
  - [x] If review-state creation fails, the raw text write should not partially commit without review state; the captured source must not become stranded outside the review workflow.

- [x] Add status transition helpers for later stories (AC: 2, 3, 4)
  - [x] Add minimal functions to mark review state as `extracted`, `extracted_approved`, `extraction_failed`, or `rejected` with safe validation, but do not wire UI buttons or new extraction behavior yet.
  - [x] Require an authenticated admin/operator actor for transition functions that represent admin review actions. Use `requireAdminSession` in server-only transition entrypoints, not in script-safe capture functions.
  - [x] Store `reviewerUserId` and `reviewedAt` on human review transitions; leave them null for initial script-created `needs_review` unless an actual reviewer acted.
  - [x] Bound `rejectionReason` and `extractionError` to short safe strings and reject newlines/provider payload/raw captured text.
  - [x] Record audit events for review-state transitions with source ID, review ID, actor, previous status, new status, timestamp, and safe reason/error summary only. Never include raw captured Facebook text or provider payloads in audit summaries.
  - [x] Block transitions that would duplicate extraction when `knowledge_card_sources` already links cards to the source. The helper should report existing linked draft/approved cards for later UI linking instead of starting another extraction set.

- [x] Preserve extraction and approval invariants (AC: 3, 4)
  - [x] Do not change `extractKnowledgeDraftsFromSource` to run automatically after capture.
  - [x] Do not approve cards, create embeddings, create retrieval records, traveler-render raw material, or expose raw metadata in this story.
  - [x] Keep Facebook/community trust defaults intact: `sourceType='community'`, `verificationStatus='unverified'`, `official=false`, `partner=false` unless a separate approved source workflow changes them.
  - [x] Ensure duplicate extraction checks remain based on `knowledge_card_sources` plus extraction prompt/version behavior already present in `src/features/knowledge/extraction.ts`.

- [x] Add focused tests (AC: all)
  - [x] Add tests for migration-backed schema behavior in the existing DB test style; likely extend `tests/facebook-capture.test.ts` and/or add `tests/facebook-capture-review.test.ts`.
  - [x] Cover successful capture update creates `needs_review` row with source/raw material IDs.
  - [x] Cover idempotent review row creation on repeated create call.
  - [x] Cover filtering by each allowed status without reading/parsing `rawMetadata` JSON.
  - [x] Cover exclusion/rejection of non-Facebook sources and Facebook sources without captured raw text.
  - [x] Cover duplicate extraction blocking when `knowledge_card_sources` already links a card to the source.
  - [x] Cover safe transition metadata: reviewer ID/timestamp stored where applicable, rejection/error bounded and not raw-text/provider-payload shaped.
  - [x] Cover that raw captured text remains in `raw_source_material` and is not copied into `facebook_capture_reviews`, audit summaries, or safe list read models.

- [x] Update operator documentation and BMad tracking (AC: all)
  - [x] Update `docs/facebook-capture-operations.md` workflow language so captured rows enter the Facebook capture review state/queue before extraction instead of requiring operators to paste source IDs into the intake page.
  - [x] Keep this story file updated during implementation: task checkboxes, Dev Agent Record, Completion Notes, Debug Log References, File List, and Change Log.
  - [x] Move `_bmad-output/implementation-artifacts/sprint-status.yaml` story key `4-1b-create-facebook-capture-review-state` through implementation statuses.

## Dev Notes

### Product Boundary

- Story 4.1B is the workflow-state bridge between the completed Playwright capture script and later admin web review. It is not the UI queue itself. Story 4.1C owns the admin queue/detail pages; Story 4.1D owns click-to-extract; Story 4.1E owns extract-and-approve-all; Story 4.1F owns reject/reopen; Story 4.1G owns broader admin navigation integration. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1B-Create-Facebook-Capture-Review-State`]
- Captured Facebook text is operator-only raw source material. It must remain in `raw_source_material.rawText`; the review table should store workflow state and safe metadata only, not a second copy of the post body. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`]
- Facebook/community content remains incomplete/risky and unverified until human approval. Creating review state does not make the content traveler-ready or retrievable. [Source: `_bmad-output/implementation-artifacts/epic-4-context.md#Requirements-&-Constraints`]

### Architecture Guardrails

- The app remains a root-level Next.js App Router modular monolith. Add code under the owning Knowledge feature, not a separate service, worker, queue, or monorepo package. [Source: `_bmad-output/project-context.md#Framework-Specific-Rules`]
- PostgreSQL is the source of truth and Drizzle owns schema/migrations. Any new persistent table must be added in `src/db/schema.ts` and through `drizzle/migrations`. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-3-Drizzle-Owns-Schema-And-Migrations`]
- Knowledge owns cards, card-source linkage, raw source material, and this capture review state. Do not export generic cross-module upsert/delete helpers. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6-Mutations-Are-Server-Side-And-Audited`]
- Protected admin/operator mutations must validate session and role server-side and record safe audit context where appropriate. Do not rely on client-side filtering or UI-only authorization. [Source: `_bmad-output/project-context.md#Framework-Specific-Rules`]
- Traveler source bundles and retrieval must never include `raw_source_material.raw_text`, operator-only fields, browser metadata, raw provider payloads, or captured Facebook post bodies. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Retrieval-Contract`]

### Existing Code To Reuse And Preserve

- `src/db/schema.ts` already defines `sources`, `rawSourceMaterial`, `knowledgeCards`, `knowledgeCardSources`, and `auditEvents`. Add the new review table near source/raw/knowledge tables and export it in the `schema` object. [Source: `src/db/schema.ts`]
- `sources.kind` already allows `facebook`; `sourceType` values are currently `curated | community`; `verificationStatus` values are currently `unverified | verified`. Do not implement architecture prose values such as `operator_curated` unless a separate schema migration updates the source contract. [Source: `src/db/schema.ts`]
- `raw_source_material.source_id` is unique and `raw_text` must be null or non-blank up to 20,000 characters. Review eligibility should require non-blank raw text after capture. [Source: `src/db/schema.ts`]
- `src/features/knowledge/facebook-capture.ts` is script-safe and currently updates raw text plus audit in one transaction. Any review-state creation called from this path must remain script-safe. [Source: `src/features/knowledge/facebook-capture.ts`]
- `src/features/knowledge/extraction.ts` already blocks duplicate extraction through `sourceAlreadyHasExtraction` using `knowledge_card_sources` and extraction prompt version. Do not remove or weaken this check; expose compatible helper data for later UI instead. [Source: `src/features/knowledge/extraction.ts`]
- `src/features/knowledge/review.ts` contains server-only admin review patterns for draft update/reject/approve and raw-leak checks. Use its style for bounded safe strings and audit summaries when adding server-only transition helpers. [Source: `src/features/knowledge/review.ts`]
- `docs/facebook-capture-operations.md` currently tells operators to paste source IDs into `/admin/knowledge/intake` after capture. This story should update that wording to reflect review-state creation, without promising the 4.1C UI is already shipped. [Source: `docs/facebook-capture-operations.md#Workflow`]

### Proposed Data Contract

Suggested Drizzle shape, to adapt to existing style:

```ts
export const facebookCaptureReviewStatusValues = [
  "needs_review",
  "rejected",
  "extracted",
  "extracted_approved",
  "extraction_failed",
] as const;

export const facebookCaptureReviews = pgTable("facebook_capture_reviews", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sourceId: text("source_id").notNull().references(() => sources.id, { onDelete: "restrict" }),
  rawSourceMaterialId: text("raw_source_material_id").notNull().references(() => rawSourceMaterial.id, { onDelete: "restrict" }),
  status: text("status").$type<FacebookCaptureReviewStatus>().default("needs_review").notNull(),
  reviewerUserId: text("reviewer_user_id").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { mode: "date" }),
  rejectionReason: text("rejection_reason"),
  extractionError: text("extraction_error"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});
```

Required constraints not fully expressible in Drizzle alone may need SQL checks in the generated migration or schema `check(...)` clauses:

- `status` in the five allowed values.
- One row per source for MVP: unique index on `source_id`.
- `rejection_reason` null unless status is `rejected`; when present, length between 1 and 500 and no newline/carriage return.
- `extraction_error` null unless status is `extraction_failed`; when present, length between 1 and 500 and no newline/carriage return.
- `reviewed_at` and `reviewer_user_id` required for `rejected`, `extracted`, `extracted_approved`, and `extraction_failed`; nullable for initial `needs_review` created by capture.
- `updated_at >= created_at` if practical.

PostgreSQL cannot enforce `sources.kind = 'facebook'` through a normal check constraint on this table because it requires looking into another table. Enforce that in service functions and tests. If the dev chooses a database-level trigger, keep it small, documented, and covered by tests; do not introduce broad trigger infrastructure.

### Service Function Guidance

Expected minimal helper API, names can vary:

- `ensureFacebookCaptureReviewForCapturedSource(db, { sourceId, rawSourceMaterialId, now })`: script-safe, called from capture transaction, requires Facebook source with non-blank raw text, creates `needs_review` if absent, returns existing row if already present.
- `listFacebookCaptureReviews({ status })`: server-only/admin-gated or DB-injected testable query, filters by `facebook_capture_reviews.status` directly, not JSON metadata.
- `markFacebookCaptureReviewStatus(...)`: server-only/admin-gated transition helper for later stories, validates actor, status transition, safe reason/error, duplicate extraction state, and audit summary.
- `getExistingCardsForCaptureSource(...)`: query linked `knowledge_card_sources` + `knowledge_cards` so later UI can link to existing draft/approved cards and avoid duplicate extraction.

Keep script-safe helpers free of `import "server-only"`, `@/db/client`, and `@/server/*`. Server-only wrappers may import auth/audit and call pure DB helpers with `getDb()`. Pure helpers that need to participate in capture must accept the transaction object passed by `db.transaction(...)`; otherwise a dev could accidentally create raw text and review state in separate transactions and strand a captured source if the second write fails.

### Audit Requirements

- Initial `needs_review` creation inside the capture script may rely on the existing raw-source capture audit event if no human reviewer acted yet, but the review row itself must still be created atomically with the raw text update.
- Human review transitions must write a safe audit event with `targetType` such as `facebook_capture_review`, `targetId` as the review row ID, and before/after summaries limited to IDs, status transition, and short safe reason/error metadata.
- Audit summaries must not include `raw_source_material.rawText`, copied post excerpts, provider payloads, full metadata JSON, browser profile paths, cookies, tokens, or Playwright diagnostics that could reveal hidden page data.
- If a transition helper cannot write its audit event, the status transition should fail in the same transaction rather than silently changing review state without audit.

### Status Semantics

- `needs_review`: capture has readable raw text and awaits operator inspection before extraction.
- `extracted`: operator-triggered extraction created one or more draft cards; cards still require normal draft review/approval.
- `extracted_approved`: later guarded flow extracted and approved all generated cards.
- `extraction_failed`: extraction was attempted and failed safely; store only a short safe error summary.
- `rejected`: operator rejected the captured source material; no draft/approved card should be created by rejection.

Default actionable queue in later Story 4.1C should use `needs_review` and possibly `extraction_failed`; this story only needs query support and tests.

### File Structure Requirements

Likely updates:

- `src/db/schema.ts`
- `drizzle/migrations/0031_*.sql`
- `drizzle/migrations/meta/0031_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/features/knowledge/facebook-capture.ts`
- `src/features/knowledge/facebook-capture-review.ts` or equivalent Knowledge-owned helper
- `tests/facebook-capture.test.ts`
- `tests/facebook-capture-review.test.ts` if separate tests are clearer
- `docs/facebook-capture-operations.md`
- `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

Do not add these in this story unless explicitly needed for tests:

- Admin routes under `src/app/admin/knowledge/facebook-captures/*`
- Navigation items in `src/app/admin/layout.tsx`
- New extraction UI buttons
- Cron/scheduler/background queue infrastructure
- Facebook Graph API, scraping endpoints, or headless public request-path capture
- Retrieval, embedding, source-bundle, or traveler UI changes

### Testing Requirements

- Use Vitest and existing DB helpers in `tests/helpers/db.ts`. Do not introduce a new test framework.
- Tests can import script-safe helpers through `@/features/knowledge/facebook-capture*`; server-only wrappers should be tested only in patterns compatible with existing server action/auth tests.
- Database reset truncates all public tables, so new table constraints must work with `resetTestDatabase()`.
- Run targeted DB tests first, then full baseline checks.

### Verification Commands

- `pnpm db:generate`
- `pnpm test:run tests/facebook-capture.test.ts`
- `pnpm test:run tests/facebook-capture-review.test.ts` if created
- `pnpm test:run tests/knowledge-draft-extraction.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm build`

### Previous Story Intelligence

- Story 4.1A completed a script-safe helper and Playwright operation. It deliberately avoided importing `server-only` into the script path because Node/tsx scripts fail when `server-only` is imported outside Next/Vitest aliasing. Preserve that boundary. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md#Script-Safe-Import-Warning`]
- Story 4.1A review fixes required actor identity for writes, made update plus audit atomic, audited the raw material row, deep-sanitized metadata, and ensured extraction handoff evidence. Review-state creation should be part of the same atomic capture update path. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md#Review-Findings`]
- Story 4.1A docs introduced a service actor for scheduled capture. Initial `needs_review` rows may be created by that service actor through the capture script, but human `reviewerUserId` should represent admin/operator review transitions, not the capture service actor unless a human review action actually happened. [Source: `docs/facebook-capture-operations.md#Service-Audit-Actor`]
- Recent commits include `Feat: add service actor for Facebook capture`, `Docs: facebook capture updates`, and `Feat: modernize admin UI`. Preserve existing admin UI style and docs, but defer UI changes to Story 4.1C. [Source: `git log --oneline -10`]

### Open Questions For Dev To Record, Not Block

- Whether rejected captures should allow multiple historical review rows after Story 4.1F reopen-for-recapture. For MVP 4.1B, use one row per source and update status; 4.1F can revisit history modeling if needed.
- Whether extraction status should be updated inside `extractKnowledgeDraftsFromSource` or only through 4.1D wrapper action. For 4.1B, provide safe transition helper and do not alter current intake extraction behavior unless needed for duplicate-state tests.

## Project Structure Notes

- Keep app code under `src/`; operations scripts under `scripts/`; BMad artifacts under `_bmad-output/implementation-artifacts/`.
- Use `@/*` imports for app/test code. Use relative imports in script entrypoints and script-safe helpers when preserving current `scripts/facebook-capture.ts` behavior.
- `tsconfig.json` includes `**/*.ts`, so any new scripts/tests/helpers must pass strict typecheck.
- Drizzle generated migrations and snapshots are source-controlled artifacts; include them in the implementation file list.

### References

- `_bmad-output/planning-artifacts/epics.md#Story-4.1B-Create-Facebook-Capture-Review-State`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`
- `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`
- `_bmad-output/implementation-artifacts/epic-4-context.md`
- `_bmad-output/project-context.md`
- `src/db/schema.ts`
- `src/features/knowledge/facebook-capture.ts`
- `src/features/knowledge/extraction.ts`
- `src/features/knowledge/review.ts`
- `tests/facebook-capture.test.ts`
- `docs/facebook-capture-operations.md`

## Dev Agent Record

### Agent Model Used

gpt-5.5-review

### Debug Log References

- `pnpm test:run tests/facebook-capture-review.test.ts` passed: 5 tests.
- `pnpm test:run tests/facebook-capture.test.ts` passed: 7 tests.
- `pnpm test:run tests/knowledge-draft-extraction.test.ts` passed: 13 tests.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test:run` passed: 25 files, 338 tests.
- `pnpm build` passed.
- Note: Running multiple DB-backed Vitest commands in parallel caused shared test DB reset/migration contention. Sequential runs passed.

### Completion Notes List

- Added `facebook_capture_reviews` persistence with five explicit statuses, one-review-per-source uniqueness, restrictive source/raw/reviewer foreign keys, status/shape checks, and queue-oriented indexes.
- Added script-safe Knowledge helpers for review creation, status-filtered listing, existing linked-card lookup, and audited status transitions.
- Wired Facebook capture completion so raw text and initial `needs_review` state are created in the same transaction; failed review creation rolls back capture.
- Kept captured Facebook text in `raw_source_material.rawText`; review rows, safe list models, and audit summaries do not copy raw text or provider payloads.
- Preserved extraction/approval boundaries: no automatic extraction, approval, embeddings, retrieval records, traveler rendering, admin queue UI, or navigation integration added in this story.
- Updated Facebook capture operations docs to describe review-state creation before later admin queue/extraction work.
- Fixed stale `tests/auth-gate.test.ts` auth mock during full-suite verification so it matches the current `getAuthenticatedSessionWithRoles` page contract.

### File List

- `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `docs/facebook-capture-operations.md`
- `drizzle/migrations/0031_round_the_call.sql`
- `drizzle/migrations/meta/0031_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/db/schema.ts`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/facebook-capture.ts`
- `src/features/knowledge/facebook-capture-review.ts`
- `tests/auth-gate.test.ts`
- `tests/facebook-capture-review.test.ts`

## Change Log

- 2026-07-13: Story created by BMad create-story workflow. Ultimate context engine analysis completed; comprehensive developer guide created.
- 2026-07-13: Implemented Facebook capture review state schema, migration, script-safe helpers, capture transaction wiring, status transition audit helpers, tests, and operations documentation; moved story to review.
