---
baseline_commit: 0aa139f
---

# Story 4.1F: Reject Captured Facebook Source Material

Status: done

<!-- Note: Validation is optional. Run bmad-create-story validate for quality check before bmad-dev-story. -->

## Story

As an operator,
I want to reject captured Facebook source material,
so that unusable, private, irrelevant, or low-quality captures do not continue through extraction.

## Acceptance Criteria

1. Given an admin is viewing a captured Facebook source with `needs_review` or `extraction_failed` status, when they click `Reject Capture`, then the system requires or accepts a safe rejection reason, and the review status becomes `rejected`.
2. Given a capture is rejected, when the actionable review queue is displayed, then the rejected capture no longer appears as needing action, and it remains available to admins through status filtering or audit trail where appropriate.
3. Given a rejected capture has raw source material, when rejection is saved, then raw captured text remains operator-only and is not exposed to travelers, and no knowledge draft or approved card is created by the rejection action.
4. Given a capture was rejected because the capture script selected wrong or incomplete text, when the operator wants to update the script and rerun capture, then the UI provides an explicit audited reopen-for-recapture action, and the source can return to a recapture-ready state without losing source provenance or prior audit history.
5. Given a rejected capture is reopened for recapture, when the capture tool is rerun successfully for the same source, then the new captured raw text replaces the prior rejected raw text only through the controlled capture workflow, and the review status returns to `needs_review` for operator inspection before extraction.
6. Given rejection is audited, when the audit event is recorded, then it includes source ID, actor, operation, status transition, timestamp, and safe rejection reason, and it does not include the full captured post text.

## Tasks / Subtasks

- [x] Add a guarded reject-capture server action (AC: 1, 2, 3, 6)
  - [x] Add an exported server action in `src/features/knowledge/actions.ts`, for example `rejectFacebookCaptureReviewForm(formData: FormData)`.
  - [x] Authorize with the existing admin/operator role path before reading review state, raw text, source IDs, or form values.
  - [x] Accept only `reviewId` and a short rejection reason from form data; resolve all source/review context server-side.
  - [x] Allow rejection only from `needs_review` or `extraction_failed` captures. Treat `extracted`, `extracted_approved`, and already `rejected` as non-actionable and redirect with safe status copy.
  - [x] Reuse `markFacebookCaptureReviewStatus(getDb(), { status: "rejected", rejectionReason, actor })`; do not duplicate direct table update/audit logic.
  - [x] Inspect the returned status. Success requires `{ status: "updated" }`; handle `not_found`, `invalid_transition`, and `stale_review` without claiming success.
  - [x] Ensure rejection creates no knowledge cards, approvals, source trust changes, embeddings, search documents, retrieval decisions, provider calls, usage events, or traveler-facing source output.

- [x] Add explicit reopen-for-recapture behavior (AC: 4, 5, 6)
  - [x] Add a Knowledge-owned service/action path for reopening a `rejected` Facebook capture for recapture. A likely shape is `reopenFacebookCaptureForRecaptureForm(formData: FormData)` in `src/features/knowledge/actions.ts` backed by a small helper in `src/features/knowledge/facebook-capture-review.ts` or a new script-safe helper.
  - [x] Reopen only from `rejected` status. Do not reopen `extracted` or `extracted_approved` captures because linked drafts/cards already exist and this story must not create a destructive replacement path for reviewed knowledge.
  - [x] Clear or disable the current captured raw text in `raw_source_material` only through an audited, controlled Knowledge-owned mutation that makes the source visible to `listQueuedFacebookSources(...)` again. Preserve the same `sources` row, `raw_source_material` row, source URL/canonical URL, and prior audit history.
  - [x] Clear only operator-only capture content needed for recapture (`rawText` and stale capture metadata fields if necessary). Do not delete the source row, card-source linkage, audit rows, submitted-by actor, or provenance metadata that should remain historically auditable.
  - [x] Transition the review into a truthful recapture-ready state without inventing a new enum value unless a migration is unavoidable. Preferred minimal approach: delete/recreate or update review state only if compatible with existing schema and tests; otherwise add a deliberate migration and update all status filters/labels.
  - [x] Ensure a successful later `updateQueuedFacebookSourceRawText(...)` call can replace the prior rejected raw text only via the existing Playwright/operator-controlled capture workflow and recreate or return the review as `needs_review`.
  - [x] Audit reopen with source ID, review ID, actor, operation, `rejected -> recapture-ready` transition summary, timestamp, and safe reason. Do not include full raw captured text.

- [x] Wire reject and reopen UI on the capture detail page (AC: 1, 4, 5)
  - [x] Replace the disabled `Reject / reopen capture (4.1F)` placeholder in `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` with real guarded forms.
  - [x] Show `Reject Capture` only for `needs_review` and `extraction_failed` captures.
  - [x] Require a visible reason input or textarea for rejection. Enforce short safe text server-side; client hints are not sufficient.
  - [x] Show reopen-for-recapture only for `rejected` captures and make the destructive nature explicit: the capture returns to the recapture queue and must be captured/reviewed again before extraction.
  - [x] Keep `Extract` and `Extract & Approve All` unavailable for rejected captures until recapture succeeds and status returns to `needs_review`.
  - [x] Add safe result messages for rejected, reopen-success, invalid-status, stale-review, and failure cases. Do not put raw text, provider details, stack traces, or long reason text in query params.
  - [x] Use Vietnamese-first operator copy and visible text status labels, not color-only state.

- [x] Preserve queue/status behavior (AC: 2)
  - [x] Confirm the default queue at `/admin/knowledge/facebook-captures` still filters to `needs_review` and excludes `rejected` captures.
  - [x] Confirm `?status=rejected` shows rejected captures with rejection reason and safe metadata where appropriate.
  - [x] Confirm rejected captures remain reachable through direct detail URLs for authorized admins/operators.
  - [x] Do not add broad dashboard/navigation integration beyond the local queue/detail behavior; Story 4.1G owns broader workflow routing.

- [x] Add focused tests (AC: all)
  - [x] Extend `tests/facebook-capture-review.test.ts` for service-level rejection/reopen transition rules, safe reason validation, audit summaries, raw-text non-overlap checks, and invalid transitions.
  - [x] Add or extend an action-focused test file, likely `tests/facebook-capture-reject-action.test.ts`, for server-action authorization, success, invalid status, stale review, safe redirects, no provider calls, and no knowledge-card side effects.
  - [x] Extend `tests/facebook-capture-review-admin.test.ts` or the relevant render test to verify the detail page shows reject form for `needs_review`/`extraction_failed`, reopen form for `rejected`, and no extract/approve actions for rejected captures.
  - [x] Test default queue excludes rejected captures and `?status=rejected` includes them without exposing raw text in the queue row.
  - [x] Test reopen makes the source recapture-ready for `listQueuedFacebookSources(...)`, preserves source ID/provenance/audit history, and a later `updateQueuedFacebookSourceRawText(...)` returns review state to `needs_review`.
  - [x] Test rejection reason safety: blank, over-length, newline, raw-text overlap, provider payload, cookies/tokens/local storage/HTML/secret-like strings are rejected or safely summarized according to existing helper behavior.
  - [x] Test unauthorized and normal traveler users fail before review lookup, raw source read, raw-text clearing, audit write, provider calls, card creation, or status updates.

- [x] Update story tracking (AC: all)
  - [x] Keep this story file updated during implementation: task checkboxes, Dev Agent Record, Completion Notes, Debug Log References, File List, and Change Log.
  - [x] Move `_bmad-output/implementation-artifacts/sprint-status.yaml` story key `4-1f-reject-captured-facebook-source-material` through implementation statuses.

### Review Findings

- [x] [Review][Patch] Reopen returns an empty capture to the actionable `needs_review` queue before recapture succeeds [`src/features/knowledge/facebook-capture-review.ts:302`]
- [x] [Review][Patch] Reopened empty capture can be rejected again without replacement raw text [`src/features/knowledge/facebook-capture-review.ts:230`]
- [x] [Review][Patch] Reject/reopen error query parameters render arbitrary operator-facing text [`src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx:78`]
- [x] [Review][Patch] Rejected queue rows omit the safe rejection reason required for filtered review [`src/app/admin/knowledge/facebook-captures/page.tsx:75`]

## Dev Notes

### Product Boundary

- This story closes the operator decision path for unusable Facebook captures. It is not an extraction, approve-all, card review, retrieval, or traveler-facing source story. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1F-Reject-Captured-Facebook-Source-Material`]
- Rejection blocks the current captured raw material from continuing through extraction. It must not create drafts or approved cards, and it must not change source trust defaults. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1F-Reject-Captured-Facebook-Source-Material`]
- Reopen-for-recapture exists specifically for wrong or incomplete captured text. The replacement text must come through the controlled capture workflow, not a direct admin paste/edit path in this story. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1F-Reject-Captured-Facebook-Source-Material`]

### Architecture Guardrails

- Keep this in the existing Next.js App Router modular monolith. UI belongs under `src/app/admin/knowledge/...`; Knowledge-owned server actions/helpers belong under `src/features/knowledge/...`; do not add a separate service, queue, worker, or public scraping route. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-1-MVP-Runtime-Is-A-Next.js-Modular-Monolith`]
- Every admin/operator route/action must validate session and role server-side before reading or mutating protected data. Reject/reopen must authorize before resolving review IDs, source IDs, raw source material, or rejection reasons. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4-Auth-Is-Public-Sign-In-Plus-Google-OAuth-And-Server-Side-Roles`]
- Knowledge owns sources, raw source material, capture reviews, knowledge cards, and card-source linkage. UI should call Knowledge-owned actions/read helpers rather than mutating tables directly from route components. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-5-Feature-Ownership-Boundaries-Are-Explicit`]
- Protected mutations must be server-side and audited with safe summaries. Do not place captured raw text, provider payloads, prompt/response bodies, browser metadata, cookies, tokens, local storage, HTML dumps, hidden data, browser profile paths, or stack traces in audit summaries. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6-Mutations-Are-Server-Side-And-Audited`]
- Captured Facebook text remains operator-only raw source material. Traveler AI Ask source bundles must not include `raw_source_material.raw_text`, copied post bodies, image/OCR notes, operator-only fields, provider payloads, or admin metadata. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Retrieval-Contract`]
- Facebook capture remains operator-controlled and raw-material-only. Reopen/recapture must not run from public traveler request paths or store Facebook credentials, cookies, tokens, local storage, full HTML dumps, hidden page data, or browser profile data. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`]

### Existing Code To Reuse And Preserve

- `src/features/knowledge/facebook-capture-review.ts` already implements `markFacebookCaptureReviewStatus(...)`, `markFacebookCaptureReviewStatusInTransaction(...)`, `getExistingCardsForCaptureSource(...)`, safe summary normalization, stale transition guards, and audit events. It already allows `rejected` from `needs_review` and `extraction_failed`; reuse it for rejection instead of writing a new reject update path. [Source: `src/features/knowledge/facebook-capture-review.ts`]
- `markFacebookCaptureReviewStatus(...)` requires a non-empty safe `rejectionReason` for `status: "rejected"`, rejects newline/over-length/unsafe summaries, and rejects summaries overlapping with raw captured text. Preserve these safety checks. [Source: `src/features/knowledge/facebook-capture-review.ts`]
- `src/features/knowledge/actions.ts` already hosts Facebook capture extraction and approve-all server actions. Add reject/reopen actions here so form wiring, admin auth handling, redirect safety, and capture-detail route conventions stay consistent. [Source: `src/features/knowledge/actions.ts`]
- `src/features/knowledge/facebook-capture-review-admin.ts` provides server-only admin-gated detail/extraction target reads and metadata sanitization. Extend this wrapper if reject/reopen needs additional admin-gated target data. Do not move `requireAdminSession()` into script-safe modules imported by capture scripts. [Source: `src/features/knowledge/facebook-capture-review-admin.ts`]
- `src/features/knowledge/facebook-capture.ts` owns queued Facebook source reads and `updateQueuedFacebookSourceRawText(...)`. Reopen-for-recapture should make the source compatible with `listQueuedFacebookSources(...)` and later recapture through this existing update path; do not add a second browser-capture mutation. [Source: `src/features/knowledge/facebook-capture.ts`]
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` currently renders real Extract and Extract & Approve All forms plus a disabled `Reject / reopen capture (4.1F)` placeholder. Replace only the 4.1F placeholder in this story. [Source: `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`]
- `src/db/schema.ts` already defines `facebookCaptureReviews.status`, `rejectionReason`, `extractionError`, reviewer fields, and constraints. No migration is expected for basic rejection. Reopen may need careful schema evaluation; prefer a minimal state-compatible implementation unless tests prove a migration is necessary. [Source: `src/db/schema.ts`]

### Current State Of Files Likely To Touch

- `src/features/knowledge/actions.ts`: server action module. Add reject and reopen form actions; preserve existing generic source intake, extract-only, and approve-all redirects.
- `src/features/knowledge/facebook-capture-review.ts`: script-safe transition/helper module. Basic rejection likely does not need changes. Reopen may need a new helper, but keep this file free of `server-only`, `@/server/auth`, `@/db/client`, and Next imports.
- `src/features/knowledge/facebook-capture-review-admin.ts`: server-only admin wrapper. Extend only if reject/reopen target resolution needs additional sanitized fields.
- `src/features/knowledge/facebook-capture.ts`: capture queue/update helper. Touch only if reopen needs a reusable recapture-ready helper aligned with `listQueuedFacebookSources(...)` and `updateQueuedFacebookSourceRawText(...)`.
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`: detail server component. Add reject/reopen forms and safe result messages without weakening raw-text warnings or existing extract/approve-all behavior.
- `tests/facebook-capture-review.test.ts`: existing transition/safety tests. Extend for rejection/reopen service behavior.
- `tests/facebook-capture-review-admin.test.ts`: existing admin helper/render tests. Extend for detail page form visibility and queue filtering.
- `tests/facebook-capture-extraction-action.test.ts` and `tests/facebook-capture-approve-all-action.test.ts`: reference patterns for server action auth, redirects, mocked providers, and render tests. Consider a new `tests/facebook-capture-reject-action.test.ts` instead of overloading these files.

### UI And Copy Guidance

- Reject button label: `Từ chối capture`.
- Rejection reason label: `Lý do từ chối an toàn`.
- Rejection reason helper: `Không nhập nguyên văn bài viết, cookie, token, payload, hoặc dữ liệu nhạy cảm. Chỉ ghi tóm tắt ngắn như: Sai bài viết, Nội dung riêng tư, Không liên quan, Text capture thiếu.`
- Rejection success copy: `Đã từ chối capture. Nội dung này không còn nằm trong hàng đợi cần xử lý và chưa tạo thẻ tri thức.`
- Reopen button label: `Mở lại để capture lại`.
- Reopen warning copy: `Hành động này đưa nguồn về hàng đợi capture lại. Text cũ không được dùng để trích xuất; lần capture mới vẫn phải được duyệt trước khi trích xuất.`
- Reopen success copy: `Đã mở lại nguồn để capture lại. Chạy công cụ capture Facebook để lấy text mới rồi duyệt lại.`
- Continue to label trust as `Nguồn Facebook/cộng đồng, chưa xác minh`; do not use green/success styling to imply rejected or recaptured content is official, verified, approved, or traveler-visible.

### Scope Boundaries

- Do not change the Playwright/browser automation script behavior except through existing recapture readiness expected by `listQueuedFacebookSources(...)` and `updateQueuedFacebookSourceRawText(...)`.
- Do not add a manual raw-text edit/paste UI for rejected captures. Replacement text must come from the controlled capture workflow.
- Do not reject or reopen knowledge cards/drafts. This story rejects the Facebook capture review/raw material path only.
- Do not remove or weaken existing `Extract` and `Extract & Approve All` actions.
- Do not allow rejection/reopen for `extracted_approved` unless a later correct-course explicitly defines how to handle already-approved cards.
- Do not expose raw captured text, provider payloads, prompts, model outputs, stack traces, cookies, tokens, local storage, hidden page data, browser profile data, or long rejection text in query params, audit rows, usage events, linked-card rows, or traveler UI.
- Do not create search documents, embeddings, retrieval decisions, traveler answer provenance, traveler source chips, or public source rendering.

### Testing Requirements

- Use Vitest and existing DB helpers in `tests/helpers/db.ts`; do not introduce a new test framework. [Source: `_bmad-output/project-context.md#Testing-Rules`]
- Tests that mock auth should follow existing patterns in `tests/facebook-capture-extraction-action.test.ts`, `tests/facebook-capture-approve-all-action.test.ts`, `tests/facebook-capture-review-admin.test.ts`, and `tests/admin-roles.test.ts`.
- DB-backed tests share a test database; run DB-heavy targeted test files sequentially while debugging to avoid reset/migration contention noted by prior stories.
- Baseline verification remains `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, and `pnpm build` after targeted tests pass.

### Verification Commands

- `pnpm test:run tests/facebook-capture-review.test.ts`
- `pnpm test:run tests/facebook-capture-review-admin.test.ts`
- Add and run any new reject/reopen action test file, for example `pnpm test:run tests/facebook-capture-reject-action.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm build`
- `pnpm test:run tests/facebook-capture-review.test.ts && pnpm test:run tests/facebook-capture-reject-action.test.ts && pnpm test:run tests/facebook-capture-review-admin.test.ts`

### Previous Story Intelligence

- Story 4.1A established that capture/Playwright code and imported helpers must remain script-safe; importing `server-only` into capture paths can break Node/tsx operations scripts. Keep admin-gated reject/reopen code in server-only action/admin wrapper paths, not capture script helpers. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md#Script-Safe-Import-Warning`]
- Story 4.1A review fixes required actor identity for capture writes, atomic update plus audit, deep metadata sanitization, and no raw text in audit summaries. Do not regress those invariants through reject/reopen summaries or raw-text clearing. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md#Review-Findings`]
- Story 4.1B added `facebook_capture_reviews` and fixed transition summary safety, conflict-safe creation, extraction-prompt-version duplicate checks, stale transition guards, and existing-card linkage. Reuse current transition return values as authoritative. [Source: `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md#Review-Findings`]
- Story 4.1C added admin queue/detail routes and metadata value sanitization. Do not trust arbitrary raw metadata values just because key names are allowlisted. [Source: `_bmad-output/implementation-artifacts/4-1c-review-captured-facebook-sources-in-admin-queue.md#Review-Findings`]
- Story 4.1D added click-to-extract, duplicate blocking before provider calls, stale review recheck under source advisory lock, safe extraction failure handling, and recovery-status UI. Rejection/reopen must not re-enable extraction for stale or non-actionable captures except through explicit recapture returning to `needs_review`. [Source: `_bmad-output/implementation-artifacts/4-1d-extract-draft-knowledge-from-reviewed-facebook-capture.md#Completion-Notes-List`]
- Story 4.1E added approve-all guardrails and fixed atomic approval/final-status behavior. Do not allow rejection/reopen to bypass the safe statuses established for `extracted` or `extracted_approved` captures. [Source: `_bmad-output/implementation-artifacts/4-1e-extract-and-approve-all-captured-facebook-drafts-with-guardrails.md#Completion-Notes-List`]

### Git Intelligence Summary

- `0aa139f Fix: address story 4.1E review findings` tightened approve-all atomicity and non-actionable render coverage.
- `d8a6b8b Feat: approve Facebook capture drafts` added the current approve-all action and UI.
- `066a878 Fix: address story 4.1D review findings` tightened stale-review and transition-result behavior for capture extraction.
- `dd20cfe Feat: extract drafts from Facebook captures` added extract-only server action and detail page form.
- `32f8709 Fix: address story 4.1C review findings` tightened safe metadata handling after review.
- `5309ad3 Feat: add Facebook capture review queue` added current queue/detail UI and admin wrapper.
- The implementation should be a small continuation: server actions, maybe one script-safe recapture helper, detail page forms/messages, focused tests, and no schema churn unless reopen cannot be represented safely.

### Latest Technical Information

- No new external library or framework is required for this story. Use the existing stack: Next.js 15.3.5 App Router, React 19.1.0, TypeScript 5.8.3, Drizzle 0.44.5, Vitest, and existing server-action/admin patterns. [Source: `_bmad-output/project-context.md#Technology-Stack-&-Versions`]

### References

- `_bmad-output/planning-artifacts/epics.md#Story-4.1F-Reject-Captured-Facebook-Source-Material`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.4-Knowledge-Collection`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.5-Retrieval-Web-Search-And-Answer-Grounding`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6-Mutations-Are-Server-Side-And-Audited`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`
- `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md`
- `_bmad-output/implementation-artifacts/4-1c-review-captured-facebook-sources-in-admin-queue.md`
- `_bmad-output/implementation-artifacts/4-1d-extract-draft-knowledge-from-reviewed-facebook-capture.md`
- `_bmad-output/implementation-artifacts/4-1e-extract-and-approve-all-captured-facebook-drafts-with-guardrails.md`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/facebook-capture-review.ts`
- `src/features/knowledge/facebook-capture-review-admin.ts`
- `src/features/knowledge/facebook-capture.ts`
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`
- `src/db/schema.ts`
- `tests/facebook-capture-review.test.ts`
- `tests/facebook-capture-review-admin.test.ts`
- `tests/facebook-capture-extraction-action.test.ts`
- `tests/facebook-capture-approve-all-action.test.ts`

## Dev Agent Record

### Agent Model Used

gpt-5.5-review

### Debug Log References

- `pnpm test:run tests/facebook-capture-review.test.ts`
- `pnpm test:run tests/facebook-capture-reject-action.test.ts`
- `pnpm test:run tests/facebook-capture-review-admin.test.ts`
- `pnpm test:run tests/facebook-capture-approve-all-action.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm build`

### Completion Notes List

- Added guarded `rejectFacebookCaptureReviewForm` server action that authorizes through the admin/operator path before reading form values, reuses `markFacebookCaptureReviewStatus(...)`, and redirects with safe success/status/error query copy.
- Added script-safe `reopenFacebookCaptureForRecapture(...)` helper plus `reopenFacebookCaptureForRecaptureForm`; rejected captures can return to recapture-ready `needs_review` state by clearing raw text/metadata on the same raw material row and auditing `rejected -> recapture-ready` without raw post text.
- Replaced the disabled capture-detail placeholder with Vietnamese-first reject and reopen forms, safe result messages, and status-gated availability while preserving extract/approve-all restrictions for rejected captures.
- Extended service, action, and admin render tests for rejection, reopen, queue filtering, safe reason handling, unauthorized behavior, no provider/card side effects, and controlled recapture through `updateQueuedFacebookSourceRawText(...)`.
- Verified with targeted tests, lint, typecheck, full test suite, and production build.
- Review fixes: recapture-ready rows remain available to the capture tool but are excluded from actionable `needs_review` review rows until raw text is present; rejection now fails when current raw text is missing; reject/reopen query messages are fixed safe copy; rejected queue rows show the safe rejection reason.

### File List

- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/facebook-capture-review.ts`
- `tests/facebook-capture-approve-all-action.test.ts`
- `tests/facebook-capture-reject-action.test.ts`
- `tests/facebook-capture-review-admin.test.ts`
- `tests/facebook-capture-review.test.ts`
- `_bmad-output/implementation-artifacts/4-1f-reject-captured-facebook-source-material.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-07-13: Implemented reject and reopen-for-recapture workflow; story moved to review.
- 2026-07-13: Story created by BMad create-story workflow. Ultimate context engine analysis completed; comprehensive developer guide created.
