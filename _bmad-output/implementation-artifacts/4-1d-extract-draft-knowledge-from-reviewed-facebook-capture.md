---
baseline_commit: 32f8709
---

# Story 4.1D: Extract Draft Knowledge From Reviewed Facebook Capture

Status: review

<!-- Note: Validation is optional. Run bmad-create-story validate for quality check before bmad-dev-story. -->

## Story

As an operator,
I want to click `Extract` from a reviewed Facebook capture,
so that AI creates draft cards without me copying source IDs manually.

## Acceptance Criteria

1. Given an admin is viewing a captured Facebook source with readable raw text and `needs_review` status, when they click `Extract`, then the existing AI extraction workflow creates one or more draft knowledge cards linked to that source, and the generated cards remain `draft` and `needsReview=true`.
2. Given extraction succeeds, when the action completes, then the capture review status becomes `extracted`, and the admin is shown links to the generated draft cards or the draft review queue.
3. Given extraction fails because no capable model is active, provider output is invalid, or the provider call fails, when the action completes, then the review status becomes `extraction_failed`, and a safe, non-provider-payload error is shown to the admin.
4. Given the source was already extracted, when an admin attempts extraction again, then the action is blocked before any provider call, and the admin sees links to existing linked cards where available.
5. Given AI extraction creates cards from Facebook/community content, when drafts are saved, then confidence and source trust defaults remain community or unverified unless separately changed under an approved operator workflow, and no draft is approved or made retrievable by the `Extract` action.

## Tasks / Subtasks

- [x] Add a Facebook-capture-specific extraction server action (AC: 1, 2, 3, 4, 5)
  - [x] Add an exported server action in `src/features/knowledge/actions.ts`, for example `extractKnowledgeDraftsFromFacebookCaptureForm(formData: FormData)`.
  - [x] Accept `reviewId` from form data, not arbitrary client-provided `sourceId` as the only authority.
  - [x] Resolve the review through an admin-gated helper before extraction so normal travelers and unauthenticated users fail before raw source material or source IDs are read.
  - [x] Allow extraction only when the review status is `needs_review`, the linked source is Facebook/community material, and readable `rawText` exists.
  - [x] Reuse `extractKnowledgeDraftsFromSource(...)`; do not create a second extraction implementation, second prompt, or direct Gateway call.

- [x] Coordinate review-status transitions with extraction outcome (AC: 2, 3, 4)
  - [x] On successful draft creation, call `markFacebookCaptureReviewStatus(..., { status: "extracted" })` so `reviewerUserId`, `reviewedAt`, safe audit summary, and `updatedAt` are recorded consistently.
  - [x] Treat the return value from `markFacebookCaptureReviewStatus` as authoritative: success requires `{ status: "updated" }`; if it returns `stale_review`, `invalid_transition`, `missing_extracted_cards`, or `not_found`, do not claim extraction completed normally and redirect with a safe recovery message plus linked-card/status context.
  - [x] If extraction fails with `model_unavailable`, `provider_failed`, `invalid_model_output`, or another retryable extraction failure, mark the review `extraction_failed` with a short safe error such as `Extraction failed: model_unavailable`; do not store provider payloads, raw prompts, raw outputs, captured post text, stack traces, or raw error strings.
  - [x] If extraction fails with `already_extracted`, do not call the provider again and do not mark a new failure; redirect back to the capture detail with a safe already-extracted message and linked existing cards.
  - [x] Preserve current transition rules in `src/features/knowledge/facebook-capture-review.ts`: `extracted` is allowed from `needs_review` or `extraction_failed`, and requires extraction-prompt-version linked cards.
  - [x] Handle stale concurrent attempts safely: if another request has already moved the review out of `needs_review`, show a safe message and links instead of making a provider call.

- [x] Wire the capture detail page action UI (AC: 1, 2, 3, 4, 5)
  - [x] Replace the disabled `Extract (4.1D)` placeholder in `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` with a real form button only for actionable captures.
  - [x] Keep `Extract & Approve All (4.1E)` and `Reject / reopen capture (4.1F)` as disabled placeholders or explanatory future-story actions.
  - [x] When review status is `needs_review`, show Vietnamese-first copy that the action creates draft cards only and still requires operator review.
  - [x] When review status is `extracted`, `extracted_approved`, `rejected`, or blocked by existing extraction cards, show links/status instead of an active duplicate extraction button.
  - [x] After success, redirect to the capture detail page or draft review queue with safe query params such as draft count/source ID; avoid embedding raw text, provider messages, or long error content in URLs.

- [x] Improve linked-card navigation after extraction (AC: 2, 4)
  - [x] Ensure `existingCards` rendered on the capture detail page include actionable links to draft review detail pages or the draft queue when routes exist.
  - [x] If individual generated draft IDs are available from the action result, prefer direct links to `/admin/knowledge/drafts/[draftId]`; otherwise link to `/admin/knowledge/drafts` with a safe success count.
  - [x] Keep linked-card rows status-labeled with visible text, not color-only.

- [x] Preserve Facebook/community trust and retrieval boundaries (AC: 1, 5)
  - [x] Do not change `sources.sourceType`, `verificationStatus`, `official`, or `partner` in this story.
  - [x] Verify generated draft cards remain `status='draft'` and `needsReview=true` via the existing `knowledgeCards` constraints and extraction service behavior.
  - [x] Verify Facebook/community drafts are clamped to `community` or `unverified` confidence by existing extraction/review logic; do not allow model output to upgrade a community source to `curated`, `partner`, or `official`.
  - [x] Do not create approved cards, search documents, embeddings, retrieval decisions, traveler source bundles, or traveler-visible source UI in this story.

- [x] Add focused tests (AC: all)
  - [x] Add or extend tests around the new Facebook capture extraction action; a likely file is `tests/facebook-capture-review-admin.test.ts` or a new adjacent `tests/facebook-capture-extraction-action.test.ts`.
  - [x] Test success from `needs_review`: drafts are created through the existing extraction workflow, linked to the source, `draft/needsReview=true`, and review status becomes `extracted` with safe audit metadata.
  - [x] Test no active capable extraction model: no provider call, no drafts, review status becomes `extraction_failed`, and `extractionError` is a short safe summary.
  - [x] Test provider failure or invalid model output: no drafts persist, safe usage behavior from extraction is preserved where applicable, and review status becomes `extraction_failed` without storing provider payload or raw text.
  - [x] Test duplicate extraction: existing extraction-prompt-version cards block provider calls and the UI/action exposes existing links/status.
  - [x] Test unauthorized and traveler users fail before extraction, source lookup for raw text, provider calls, draft creation, usage writes, or review status updates.
  - [x] Add a render test for the detail page when `needs_review` to verify the real Extract form appears with Vietnamese copy and future actions remain disabled.

- [x] Update story tracking (AC: all)
  - [x] Keep this story file updated during implementation: task checkboxes, Dev Agent Record, Completion Notes, Debug Log References, File List, and Change Log.
  - [x] Move `_bmad-output/implementation-artifacts/sprint-status.yaml` story key `4-1d-extract-draft-knowledge-from-reviewed-facebook-capture` through implementation statuses.

## Dev Notes

### Product Boundary

- This story connects the existing Facebook capture review detail page to the existing AI knowledge draft extraction workflow. It does not implement approve-all, reject/reopen, broader dashboard routing, embeddings, search documents, retrieval, or traveler-facing source display. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1D-Extract-Draft-Knowledge-From-Reviewed-Facebook-Capture`]
- The `Extract` action creates review-needed draft cards only. Human approval remains mandatory before cards become traveler-retrievable. [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.4-Knowledge-Collection`]
- Facebook-derived content is community/unverified by default and must not become official or guaranteed through this action. [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.5-Retrieval-Web-Search-And-Answer-Grounding`]

### Architecture Guardrails

- Use the existing Next.js App Router modular monolith. Keep admin UI under `src/app/admin/knowledge/...` and Knowledge-owned server actions/helpers under `src/features/knowledge/...`; do not add a separate worker, service, public route, or browser automation path for extraction. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-1-MVP-Runtime-Is-A-Next.js-Modular-Monolith`]
- Every admin/operator route/action must validate session and role server-side before reading or mutating protected data. The extraction action must authorize before resolving the review/source/raw material. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4-Auth-Is-Public-Sign-In-Plus-Google-OAuth-And-Server-Side-Roles`]
- Knowledge owns sources, raw source material, capture reviews, knowledge cards, and card-source linkage. UI should call Knowledge-owned actions/read helpers rather than writing tables directly from route components. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-5-Feature-Ownership-Boundaries-Are-Explicit`]
- Protected mutations must be server-side and audited with safe summaries. Do not place captured raw text, provider payloads, prompt/response bodies, browser metadata, cookies, tokens, or local storage in audit summaries. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6-Mutations-Are-Server-Side-And-Audited`]
- Raw source material remains operator-only. Traveler answer source bundles must not include `raw_source_material.raw_text`, copied post bodies, operator-only fields, provider payloads, or admin metadata. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Retrieval-Contract`]
- AI extraction must use the Gateway adapter/model catalog path. Do not call OpenAI directly or hard-code an extraction model in the Facebook capture action. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-10-AI-Gateway-Access-Is-Adapter-Based-And-Source-Bundled`]

### Existing Code To Reuse And Preserve

- `src/features/knowledge/extraction.ts` already implements `extractKnowledgeDraftsFromSource(sourceId)`: admin auth, readable raw text validation, active extraction-capable model selection, Gateway extraction, JSON parsing, confidence clamping, raw-overlap/sensitive-field rejection, draft insert, card-source linking, audit event, usage event, and duplicate extraction blocking. Reuse this implementation instead of duplicating logic. [Source: `src/features/knowledge/extraction.ts`]
- `src/features/knowledge/actions.ts` already exports `extractKnowledgeDraftsFromSourceForm(formData)` for generic source extraction from intake. This story should add a capture-specific action because capture extraction needs review-status gating and review-status updates. Do not overload the generic intake redirect behavior for capture detail. [Source: `src/features/knowledge/actions.ts`]
- `src/features/knowledge/facebook-capture-review.ts` provides `markFacebookCaptureReviewStatus(...)`, `getExistingCardsForCaptureSource(...)`, and transition guards. Reuse `markFacebookCaptureReviewStatus` for `extracted` and `extraction_failed` so DB constraints, reviewer fields, and audit behavior stay consistent. [Source: `src/features/knowledge/facebook-capture-review.ts`]
- `markFacebookCaptureReviewStatus(...)` returns structured non-throwing outcomes for stale/invalid/missing-card cases. The capture extraction action must inspect those outcomes; do not assume the transition updated just because the function resolved. [Source: `src/features/knowledge/facebook-capture-review.ts`]
- `src/features/knowledge/facebook-capture-review-admin.ts` provides admin-gated queue/detail reads and sanitizes capture metadata. If a capture-specific action needs detail loading, add a server-only helper here or adjacent; keep script-safe helpers in `facebook-capture-review.ts` free of `server-only` and Next-only imports because capture scripts import script-safe paths. [Source: `src/features/knowledge/facebook-capture-review-admin.ts`]
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` currently renders disabled placeholders for `Extract (4.1D)`, `Extract & Approve All (4.1E)`, and `Reject / reopen capture (4.1F)`. This story should replace only the Extract placeholder with a real guarded form/action. [Source: `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`]
- `src/db/schema.ts` defines `facebookCaptureReviews` statuses and constraints, `knowledgeCards` draft/review constraints, `knowledgeCardSources`, `aiGatewayModels`, `aiUsageEvents`, and source trust fields. Use these existing tables; no migration is expected for this story unless implementation discovers an unavoidable missing field. [Source: `src/db/schema.ts`]

### Current State Of Files Likely To Touch

- `src/features/knowledge/actions.ts`: server action module. Current state has generic extraction form redirecting back to `/admin/knowledge/intake`. This story likely adds `extractKnowledgeDraftsFromFacebookCaptureForm`; preserve existing intake extraction behavior.
- `src/features/knowledge/facebook-capture-review-admin.ts`: admin-only read wrapper. Current state authorizes before detail reads and sanitizes allowlisted metadata values. A small helper such as `getAdminFacebookCaptureReviewExtractionTarget(reviewId)` can live here if it authorizes before returning `sourceId`, status, raw text presence, and existing cards.
- `src/features/knowledge/facebook-capture-review.ts`: script-safe transition/helper module. Current state has strict transition rules and safe summary normalization. Avoid adding `server-only`, `@/server/auth`, `@/db/client`, or Next imports here.
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`: detail server component. Current state renders raw captured text for admins and disabled future action buttons. Add the real Extract form carefully without weakening raw-text warnings or future-story placeholders.
- `tests/facebook-capture-review.test.ts`: script-safe transition tests. Extend only if transition behavior changes; do not duplicate admin auth setup here.
- `tests/facebook-capture-review-admin.test.ts`: admin helper/render tests. Good candidate for capture detail action/render coverage because it already mocks auth and renders the queue/detail pages.
- `tests/knowledge-draft-extraction.test.ts`: generic extraction tests. Reuse setup patterns for AI Gateway model, mocked fetch, draft assertions, usage events, and duplicate extraction behavior.

### UI And Copy Guidance

- Primary button label: `Trích xuất bản nháp`.
- Supporting copy: `AI sẽ tạo thẻ nháp để bạn duyệt. Chưa có thẻ nào được phê duyệt hoặc dùng cho câu trả lời của khách.`
- Success copy/query handling may say: `Đã tạo {n} bản nháp. Mở hàng đợi duyệt để kiểm tra trước khi phê duyệt.`
- Failure copy should be short and safe: `Không thể trích xuất capture này. Trạng thái đã chuyển sang Trích xuất lỗi để bạn kiểm tra hoặc thử lại.`
- Already-extracted copy: `Capture này đã có thẻ được trích xuất. Kiểm tra các thẻ liên kết thay vì trích xuất lại.`
- Continue to label trust as `Nguồn Facebook/cộng đồng, chưa xác minh`; do not use green/success styling to imply extracted content is trustworthy or approved.

### Scope Boundaries

- Do not implement `Extract & Approve All`; Story 4.1E owns confirmation and approval guardrails.
- Do not implement reject/reopen/recapture; Story 4.1F owns those mutations.
- Do not implement broader admin workflow navigation; Story 4.1G owns route/dashboard integration beyond direct links needed for extraction result visibility.
- Do not alter Playwright capture behavior, raw text storage rules, or metadata sanitization unless required by a test failure directly related to extraction action safety.
- Do not expose raw captured text, provider payloads, prompts, model outputs, or internal error stack traces in query params, audit rows, usage events, linked-card rows, or traveler UI.
- Do not approve cards, build search documents, create embeddings, make cards retrievable, or modify traveler answer provenance/source rendering.

### Testing Requirements

- Use Vitest and existing DB helpers in `tests/helpers/db.ts`; do not introduce a new test framework. [Source: `_bmad-output/project-context.md#Testing-Rules`]
- Tests that mock auth should follow existing patterns in `tests/facebook-capture-review-admin.test.ts`, `tests/knowledge-draft-extraction.test.ts`, and other admin server-action tests.
- DB-backed tests share a test database; run targeted DB-heavy files sequentially while debugging to avoid reset/migration contention noted by prior stories.
- Baseline verification remains `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, and `pnpm build` after targeted tests pass.

### Verification Commands

- `pnpm test:run tests/facebook-capture-review-admin.test.ts`
- `pnpm test:run tests/knowledge-draft-extraction.test.ts`
- `pnpm test:run tests/facebook-capture-review.test.ts`
- Add and run any new action-focused test file, for example `pnpm test:run tests/facebook-capture-extraction-action.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm build`

### Previous Story Intelligence

- Story 4.1A established that capture/Playwright code and imported helpers must remain script-safe; importing `server-only` into capture paths can break Node/tsx operations scripts. Keep admin-gated wrappers separate from script-safe capture helpers. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`]
- Story 4.1A review fixes required actor identity for capture writes, atomic update plus audit, deep metadata sanitization, and no raw text in audit summaries. Do not regress those invariants through extraction status transitions or failure summaries. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`]
- Story 4.1B added `facebook_capture_reviews` and fixed transition summary safety, conflict-safe creation, extraction-prompt-version duplicate checks, stale transition guards, and existing-card linkage. Preserve these safeguards and use current code as source of truth. [Source: `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md`]
- Story 4.1C added `src/features/knowledge/facebook-capture-review-admin.ts`, queue/detail routes, linked existing cards, metadata value sanitization, and tests proving queue rows do not expose raw text while detail pages do only after admin authorization. This story should build on that detail page rather than introducing another review surface. [Source: `_bmad-output/implementation-artifacts/4-1c-review-captured-facebook-sources-in-admin-queue.md`]
- Story 4.1C review found that allowlisted metadata keys still needed value-level sanitization. Do not trust arbitrary raw metadata values just because key names are allowed. [Source: `_bmad-output/implementation-artifacts/4-1c-review-captured-facebook-sources-in-admin-queue.md#Review-Findings`]
- Recent commits include `Feat: add Facebook capture review queue` and `Fix: address story 4.1C review findings`; treat committed code as the current implementation baseline. [Source: `git log --oneline -10`]

### Git Intelligence Summary

- `32f8709 Fix: address story 4.1C review findings` tightened safe metadata handling after review.
- `5309ad3 Feat: add Facebook capture review queue` added current queue/detail UI and admin wrapper.
- `e6a1d83 Fix: address story 4.1B review findings` and `c218bfa Feat: add Facebook capture review state` established review-state transition rules.
- The implementation should be a small continuation of those commits: server action, page form, tests, and no schema churn unless proven necessary.

### Latest Technical Information

- No new external library or framework is required for this story. Use the existing stack: Next.js 15.3.5 App Router, React 19.1.0, TypeScript 5.8.3, Drizzle 0.44.5, Vitest, and the existing OpenAI-compatible AI Gateway adapter/model catalog. [Source: `_bmad-output/project-context.md#Technology-Stack-&-Versions`]

### References

- `_bmad-output/planning-artifacts/epics.md#Story-4.1D-Extract-Draft-Knowledge-From-Reviewed-Facebook-Capture`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.4-Knowledge-Collection`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.5-Retrieval-Web-Search-And-Answer-Grounding`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-10-AI-Gateway-Access-Is-Adapter-Based-And-Source-Bundled`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`
- `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md`
- `_bmad-output/implementation-artifacts/4-1c-review-captured-facebook-sources-in-admin-queue.md`
- `src/features/knowledge/extraction.ts`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/facebook-capture-review.ts`
- `src/features/knowledge/facebook-capture-review-admin.ts`
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`
- `src/db/schema.ts`
- `tests/knowledge-draft-extraction.test.ts`
- `tests/facebook-capture-review.test.ts`
- `tests/facebook-capture-review-admin.test.ts`

## Dev Agent Record

### Agent Model Used

gpt-5.5-review

### Debug Log References

- `pnpm test:run tests/facebook-capture-extraction-action.test.ts tests/facebook-capture-review-admin.test.ts` initially failed during red phase because the capture extraction action/UI did not exist.
- `pnpm test:run tests/facebook-capture-extraction-action.test.ts tests/facebook-capture-review-admin.test.ts` passed after implementation.
- Parallel DB-heavy targeted run showed reset contention; reran `tests/knowledge-draft-extraction.test.ts` and `tests/facebook-capture-review.test.ts` sequentially and both passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test:run` passed: 27 files, 352 tests.
- `pnpm build` passed.

### Completion Notes List

- Added `extractKnowledgeDraftsFromFacebookCaptureForm` that accepts `reviewId`, resolves the source through an admin-gated helper, blocks duplicate/non-actionable captures before provider calls, reuses `extractKnowledgeDraftsFromSource`, and coordinates safe `extracted` / `extraction_failed` review transitions.
- Added `getAdminFacebookCaptureReviewExtractionTarget` in the admin wrapper so authorization happens before returning source IDs, raw text presence, status, and linked card context.
- Replaced the disabled 4.1D Extract placeholder with a real Vietnamese-first form for actionable captures while leaving 4.1E and 4.1F disabled.
- Added safe query/result handling and direct linked-card navigation to draft detail routes.
- Added focused action and render tests covering success, unavailable model failure, duplicate blocking, authorization, and UI rendering.

### File List

- `_bmad-output/implementation-artifacts/4-1d-extract-draft-knowledge-from-reviewed-facebook-capture.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/facebook-capture-review-admin.ts`
- `tests/facebook-capture-extraction-action.test.ts`
- `tests/facebook-capture-review-admin.test.ts`

## Change Log

- 2026-07-13: Story created by BMad create-story workflow. Ultimate context engine analysis completed; comprehensive developer guide created.
- 2026-07-13: Implemented Facebook capture draft extraction action, guarded UI, linked-card navigation, tests, and validation; story moved to review.
