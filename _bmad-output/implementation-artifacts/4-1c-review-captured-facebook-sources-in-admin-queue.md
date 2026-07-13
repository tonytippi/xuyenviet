---
baseline_commit: e6a1d83f8beac90c364060b88bd019b53285362b
---

# Story 4.1C: Review Captured Facebook Sources In Admin Queue

Status: review

<!-- Note: Validation is optional. Run bmad-create-story validate for quality check before bmad-dev-story. -->

## Story

As an operator,
I want to see captured Facebook source material in an admin review queue,
so that I can inspect captured content before using AI extraction.

## Acceptance Criteria

1. Given one or more Facebook captures have `needs_review` status, when an admin opens the Facebook capture review queue, then they see captured sources with source label, source URL, final URL when available, captured timestamp, safe author/timestamp metadata when available, and review status, and raw captured post text is visible only inside authenticated admin/operator routes.
2. Given a captured source is already extracted, extracted-and-approved, rejected, or failed, when the queue is displayed, then actionable review queues show only sources that still need operator action, and non-actionable statuses remain accessible through filters or status links where useful.
3. Given an admin opens a capture detail page, when the page loads, then it shows the captured raw text, source metadata, capture metadata, trust defaults, existing extraction status, and available actions, and it never displays cookies, local storage, full HTML dumps, hidden page data, provider payloads, or browser profile data.
4. Given a normal traveler or unauthenticated user requests the Facebook capture review pages, when authorization runs, then access is denied before raw source material is read, and no raw captured Facebook text is exposed.
5. Given a Facebook source remains community/unverified, when the review UI displays it, then the UI clearly labels the content as Facebook/community-derived and not official by default, and copy does not imply captured content is verified or traveler-ready.

## Tasks / Subtasks

- [x] Add admin-gated read helpers for Facebook capture queue/detail (AC: 1, 2, 3, 4)
  - [x] Extend or wrap `src/features/knowledge/facebook-capture-review.ts` with server-only admin-facing read functions that call `requireAdminSession()` before any query that can return `rawSourceMaterial.rawText`.
  - [x] Keep the existing script-safe helpers in `facebook-capture-review.ts` importable by `src/features/knowledge/facebook-capture.ts`; if a server-only wrapper is needed, put it in a separate file such as `src/features/knowledge/facebook-capture-review-admin.ts` so Playwright capture scripts do not import `server-only` accidentally.
  - [x] Provide a default actionable queue read model filtered to `status='needs_review'`.
  - [x] Provide explicit status filtering for `needs_review`, `rejected`, `extracted`, `extracted_approved`, and `extraction_failed`; do not filter by `raw_source_material.rawMetadata` JSON.
  - [x] Provide a detail read model by review ID that includes `rawText` only after admin/operator authorization succeeds.
  - [x] Include existing linked cards from `getExistingCardsForCaptureSource(...)` so extracted/non-actionable records can show links/status instead of encouraging duplicate extraction.

- [x] Create Facebook capture review queue route (AC: 1, 2, 4, 5)
  - [x] Add `src/app/admin/knowledge/facebook-captures/page.tsx` or equivalent under the existing admin shell.
  - [x] Render the default queue as actionable `needs_review` captures only.
  - [x] Add filter/status links or tabs for all review statuses; status filtering may use search params.
  - [x] Show source label, source URL/canonical URL, captured final URL when available, captured timestamp, author text, visible timestamp text, current review status, and existing card count/status where available.
  - [x] Do not show raw captured post text in the queue list unless the implementation deliberately makes each row an authenticated admin-only detail preview; prefer raw text only on the detail page for lower leak risk.
  - [x] Use Vietnamese-first operator copy and labels that call out `Nguồn Facebook/cộng đồng, chưa xác minh`.

- [x] Create capture detail route (AC: 3, 4, 5)
  - [x] Add a detail route such as `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`.
  - [x] Load through the admin-gated detail helper before rendering raw text.
  - [x] Show captured raw text, safe source metadata, safe capture metadata, trust defaults, current review status, reviewer/reviewed timestamp when available, rejection/extraction error when available, and linked draft/approved cards when available.
  - [x] Show available action placeholders only for future story-owned actions: `Extract` (4.1D), `Extract & Approve All` (4.1E), `Reject Capture`/reopen (4.1F). In this story, placeholders may be disabled or explanatory links/copy; do not implement those mutations.
  - [x] Never display cookies, tokens, local storage, full HTML dumps, hidden page data, provider payloads, browser profile paths, or raw metadata JSON dumps.
  - [x] For missing review IDs or unauthorized access, return a safe not-found/permission outcome that does not expose whether raw Facebook text exists.

- [x] Preserve admin shell and workflow boundaries (AC: 1, 2, 5)
  - [x] Keep the broader admin navigation integration minimal. Adding a direct nav item is acceptable only if it does not overtake Story 4.1G's broader workflow-routing scope; otherwise link from existing intake success/help copy or leave the route directly accessible.
  - [x] Do not call AI extraction, approve cards, create embeddings/search documents, create retrieval records, reject/reopen captures, or alter source trust defaults in this story.
  - [x] Preserve Facebook sources as community/unverified unless an existing approved source workflow has already changed those fields.
  - [x] Preserve existing admin visual language from `src/app/admin/layout.tsx` and existing knowledge pages: warm map-paper surfaces, route green primary actions, guide amber metadata, readable mobile/tablet layout.

- [x] Add focused tests (AC: all)
  - [x] Add or extend tests for admin-gated read helpers: admin/operator can read queue/detail; traveler/unauthenticated paths fail before `rawText` is returned.
  - [x] Test default actionable queue includes `needs_review` and excludes `rejected`, `extracted`, `extracted_approved`, and `extraction_failed` unless explicitly filtered.
  - [x] Test detail read model includes raw captured text only through the admin-gated detail helper.
  - [x] Test queue/detail read models include safe capture metadata (`captureMethod`, `capturedAt`, `finalUrl`, `authorText`, `timestampText`) and linked existing cards.
  - [x] Test unsafe metadata keys/values are not displayed or returned by admin-safe read models; do not snapshot raw `rawMetadata` wholesale.
  - [x] Add a render test if practical for the queue/detail page to verify Vietnamese labels and no accidental raw-text output in the queue list.

- [x] Update documentation and BMad tracking (AC: all)
  - [x] Update `docs/facebook-capture-operations.md` to name the admin review queue path once implemented.
  - [x] Keep this story file updated during implementation: task checkboxes, Dev Agent Record, Completion Notes, Debug Log References, File List, and Change Log.
  - [x] Move `_bmad-output/implementation-artifacts/sprint-status.yaml` story key `4-1c-review-captured-facebook-sources-in-admin-queue` through implementation statuses.

## Dev Notes

### Product Boundary

- This story is the admin queue/detail review surface between captured raw Facebook text and later extraction actions. It does not implement extraction, extract-and-approve-all, rejection/reopen, or full workflow navigation. Those are Stories 4.1D-4.1G. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1C-Review-Captured-Facebook-Sources-In-Admin-Queue`]
- Captured Facebook text remains operator-only raw source material. It may be displayed to authenticated admin/operator users inside this review workflow, but must never be exposed to normal travelers, traveler source bundles, retrieval, audit summaries, or public UI. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`]
- Facebook-derived content must stay labeled community/unverified unless a later approved operator workflow changes trust metadata. The review UI must not imply the content is official, verified, approved, or traveler-ready. [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.5-Retrieval-Web-Search-And-Answer-Grounding`]

### Architecture Guardrails

- Use the existing Next.js App Router modular monolith. Add admin pages under `src/app/admin/knowledge/...` and Knowledge-owned read helpers under `src/features/knowledge/...`; do not create a separate service, worker, or public scraping route. [Source: `_bmad-output/project-context.md#Framework-Specific-Rules`]
- Every admin/operator route/action must validate session and role server-side before reading or mutating protected data. For this story, authorization must happen before reading `raw_source_material.rawText`. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4-Auth-Is-Public-Sign-In-Plus-Google-OAuth-And-Server-Side-Roles`]
- Keep feature ownership explicit. Knowledge owns sources, raw source material, knowledge cards, card-source linkage, and Facebook capture review state. UI should call Knowledge-owned server entrypoints/read helpers. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-5-Feature-Ownership-Boundaries-Are-Explicit`]
- Do not add generic cross-module table helpers. If the UI needs linked card summaries, reuse or extend `getExistingCardsForCaptureSource(...)` from the Knowledge module. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6-Mutations-Are-Server-Side-And-Audited`]
- Traveler-safe retrieval/source bundles must not include raw source text, copied post bodies, operator-only fields, provider payloads, or admin metadata. This admin review page is not a retrieval source-bundle surface. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Retrieval-Contract`]

### Existing Code To Reuse And Preserve

- `src/features/knowledge/facebook-capture-review.ts` already provides `listFacebookCaptureReviews(db, { status })`, `getExistingCardsForCaptureSource(db, sourceId)`, and status transition helpers. Existing list output includes safe source/capture metadata and `existingCards`, but intentionally does not return raw text. Reuse this for the queue where possible. [Source: `src/features/knowledge/facebook-capture-review.ts`]
- `src/features/knowledge/facebook-capture.ts` imports `ensureFacebookCaptureReviewForCapturedSource(...)` and must remain script-safe for Playwright operations. Do not add `import "server-only"`, `@/db/client`, `@/server/auth`, or Next-only imports to modules that the capture script imports. [Source: `src/features/knowledge/facebook-capture.ts`]
- `src/db/schema.ts` defines `facebookCaptureReviews`, `sources`, `rawSourceMaterial`, `knowledgeCards`, and `knowledgeCardSources`. `facebook_capture_reviews.source_id` is unique, status is one of five explicit values, and `raw_source_material.raw_text` is constrained to non-blank text up to 20,000 characters when present. [Source: `src/db/schema.ts`]
- `src/server/auth.ts` provides `requireAdminSession()`, `getAuthenticatedSessionWithRoles()`, and `hasAdminAccess(...)`. Admin pages should follow existing `src/app/admin/layout.tsx` server-side gate patterns. [Source: `src/server/auth.ts`, `src/app/admin/layout.tsx`]
- Existing admin knowledge pages (`src/app/admin/knowledge/intake/page.tsx`, draft/approved/progress pages) use Vietnamese-first copy, warm card surfaces, server components, and simple forms/links. Preserve that style instead of introducing a new component system. [Source: `src/app/admin/knowledge/intake/page.tsx`]

### Current State Of Files Likely To Touch

- `src/features/knowledge/facebook-capture-review.ts`: script-safe helper file. Current state lists review rows by status with safe metadata and existing linked cards, and handles safe transitions. This story may extend queue read output if needed, but should not add server-only imports here unless the script-safe boundary is split first. Preserve idempotent creation, safe transition validation, raw-text leakage checks, and duplicate-extraction safeguards.
- `src/features/knowledge/facebook-capture.ts`: script-safe capture queue/update helper. This story should not change capture behavior unless a small type/read-model adjustment is unavoidable. Preserve atomic raw-text plus review-state creation.
- `src/app/admin/layout.tsx`: admin shell and nav. If adding a nav item, follow the existing `adminNavItems` array style and keep labels Vietnamese-first. Do not weaken role gating.
- `src/app/admin/knowledge/intake/page.tsx`: existing intake workflow still tells operators about source intake/extraction. If linking to Facebook review queue from intake, do it with concise explanatory copy and do not remove existing manual extraction paths.
- `tests/facebook-capture-review.test.ts`: current DB tests cover creation/filtering/transitions. Extend or add adjacent tests rather than duplicating setup patterns.

### UI And Copy Guidance

- Queue title example: `Hàng đợi duyệt capture Facebook`.
- Trust label example: `Nguồn Facebook/cộng đồng, chưa xác minh`.
- Raw-text warning example: `Nội dung này chỉ dành cho vận hành. Chưa trích xuất, chưa duyệt, chưa dùng cho câu trả lời của khách.`
- Status labels should be visible text, not color-only: `Cần duyệt`, `Đã trích xuất`, `Đã trích xuất và duyệt`, `Đã từ chối`, `Trích xuất lỗi`.
- For metadata absent states, render `Chưa có` or omit optional rows; do not dump JSON.

### Scope Boundaries

- Do not implement the `Extract` mutation or wire `extractKnowledgeDraftsFromSource(...)` from the detail page in this story. Story 4.1D owns that.
- Do not implement `Extract & Approve All`. Story 4.1E owns that.
- Do not implement reject/reopen/recapture mutations. Story 4.1F owns those.
- Do not over-invest in dashboard/navigation workflow routing beyond what is needed to reach/review the queue. Story 4.1G owns broader integration.
- Do not create traveler UI, retrieval, embeddings, source-bundle, AI prompt, usage-event, or web-search changes.
- Do not store or display Facebook cookies, tokens, local storage, full HTML dumps, hidden page data, provider payloads, browser profile paths, or raw metadata JSON.

### Testing Requirements

- Use Vitest and existing DB helpers in `tests/helpers/db.ts`. Do not introduce a new test framework.
- Tests that mock auth should follow existing patterns in `tests/admin-roles.test.ts`, `tests/ai-models.test.ts`, or other admin server-action tests.
- Because DB-backed tests share a test database, run DB-heavy targeted test files sequentially when debugging. Story 4.1B noted parallel DB-backed Vitest commands can contend on shared reset/migration state.
- Baseline verification remains `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, and `pnpm build` after targeted tests pass.

### Verification Commands

- `pnpm test:run tests/facebook-capture-review.test.ts`
- `pnpm test:run tests/admin-roles.test.ts`
- Add and run any new route/helper test file, for example `pnpm test:run tests/facebook-capture-review-admin.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm build`

### Previous Story Intelligence

- Story 4.1A established that Playwright capture code and imported helpers must remain script-safe; importing `server-only` into the capture path breaks Node/tsx scripts. If admin-gated read helpers need `requireAdminSession()`, put them in a separate server-only wrapper file. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md#Script-Safe-Import-Warning`]
- Story 4.1A review fixes required actor identity for capture writes, atomic update plus audit, deep metadata sanitization, and no raw text in audit summaries. Do not regress those invariants by rendering unsafe metadata or copying raw text into audit/log output. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md#Review-Findings`]
- Story 4.1B added `facebook_capture_reviews` and fixed multiple review findings: transition summaries reject raw-text overlap, creation is conflict-safe, extraction state checks align with extraction prompt version, transitions guard against stale overwrites, and list output includes safe capture metadata plus linked cards. Preserve these improvements. [Source: `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md#Review-Findings`]
- Story 4.1B explicitly deferred admin routes, navigation items, and UI buttons to 4.1C+. This story should now add queue/detail UI, but still defer mutation buttons to 4.1D-4.1F. [Source: `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md#File-Structure-Requirements`]
- Recent commits include `Feat: add Facebook capture review state` and `Fix: address story 4.1B review findings`; use the current committed implementation as source of truth over speculative earlier story guidance. [Source: `git log --oneline -10`]

### References

- `_bmad-output/planning-artifacts/epics.md#Story-4.1C-Review-Captured-Facebook-Sources-In-Admin-Queue`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.4-Knowledge-Collection`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.5-Retrieval-Web-Search-And-Answer-Grounding`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`
- `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md#Components`
- `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Component-Patterns`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`
- `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md`
- `docs/facebook-capture-operations.md`
- `src/features/knowledge/facebook-capture-review.ts`
- `src/features/knowledge/facebook-capture.ts`
- `src/db/schema.ts`
- `src/server/auth.ts`
- `src/app/admin/layout.tsx`
- `tests/facebook-capture-review.test.ts`
- `tests/facebook-capture.test.ts`

## Dev Agent Record

### Agent Model Used

gpt-5.5-review

### Debug Log References

- `pnpm test:run tests/facebook-capture-review.test.ts` passed before implementation and after changes.
- `pnpm test:run tests/facebook-capture-review-admin.test.ts` failed red before the admin wrapper existed, then passed after implementation.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test:run` passed: 26 files, 346 tests.
- `pnpm build` passed.

### Completion Notes List

- Added `src/features/knowledge/facebook-capture-review-admin.ts` as the `server-only` admin wrapper so `requireAdminSession()` runs before any detail query returns `rawText`, while preserving the script-safe capture helper boundary.
- Extended the script-safe queue list read model with safe `authorText` and `timestampText` fields only; raw captured post text remains excluded from queue rows.
- Added `/admin/knowledge/facebook-captures` with default `needs_review` queue and explicit status filter links for all review statuses.
- Added `/admin/knowledge/facebook-captures/[reviewId]` detail page that renders raw captured text only through the admin-gated helper, displays safe metadata and linked cards, and shows disabled placeholders for future extraction/reject stories without implementing mutations.
- Added focused admin helper and render tests covering admin/operator access, unauthenticated/traveler denial, default actionable filtering, explicit non-actionable filtering, linked cards, safe metadata, unsafe metadata exclusion, Vietnamese trust labels, and queue raw-text non-leakage.
- Updated Facebook capture operations documentation to name the admin review queue path.

### File List

- `_bmad-output/implementation-artifacts/4-1c-review-captured-facebook-sources-in-admin-queue.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `docs/facebook-capture-operations.md`
- `src/app/admin/layout.tsx`
- `src/app/admin/knowledge/facebook-captures/page.tsx`
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`
- `src/features/knowledge/facebook-capture-review.ts`
- `src/features/knowledge/facebook-capture-review-admin.ts`
- `tests/facebook-capture-review-admin.test.ts`

## Change Log

- 2026-07-13: Implemented admin Facebook capture queue/detail review surface with gated read helpers, tests, docs, and validation.
- 2026-07-13: Story created by BMad create-story workflow. Ultimate context engine analysis completed; comprehensive developer guide created.
