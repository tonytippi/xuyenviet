---
baseline_commit: 066a87861491ea7febf1f09791fd6f466d226af0
---

# Story 4.1E: Extract And Approve All Captured Facebook Drafts With Guardrails

Status: done

<!-- Note: Validation is optional. Run bmad-create-story validate for quality check before bmad-dev-story. -->

## Story

As an operator,
I want an `Extract & Approve All` action for trusted reviewed captures,
so that low-risk captured source material can move faster into approved knowledge while preserving safeguards.

## Acceptance Criteria

1. Given an admin is viewing a captured Facebook source with readable raw text and `needs_review` status, when they select `Extract & Approve All`, then the UI requires explicit confirmation that they reviewed the captured text, source trust, confidence, and freshness before proceeding, and the action is available to authenticated admin and operator roles but cannot run without confirmation.
2. Given confirmation is provided, when extraction produces valid draft cards, then the system approves all generated cards in the same operator-initiated workflow, and the capture review status becomes `extracted_approved`.
3. Given extraction produces zero valid drafts or invalid output, when `Extract & Approve All` runs, then no cards are approved, and the review status becomes `extraction_failed` with a safe error.
4. Given generated cards come from a Facebook/community source, when they are approved through this action, then they remain community or unverified unless source metadata already identifies an official/provider-backed source, and traveler answers cannot present them as guaranteed or official facts.
5. Given an approved card includes freshness-sensitive facts such as price, schedule, availability, road condition, opening hours, weather, service status, or promotions, when approve-all runs, then freshness-sensitive flags from extraction are preserved, and cards remain eligible for later freshness warnings in retrieval/provenance flows.
6. Given any card approval fails during the action, when the workflow completes, then the system does not leave a partially approved set without a safe status and audit trail, and the admin can see whether retry or manual review is required.

## Tasks / Subtasks

- [x] Add a guarded Facebook capture extract-and-approve server action (AC: 1, 2, 3, 4, 5, 6)
  - [x] Add an exported server action in `src/features/knowledge/actions.ts`, for example `extractAndApproveFacebookCaptureDraftsForm(formData: FormData)`.
  - [x] Authorize with the existing admin/operator role path before reading review state, source IDs, raw text, linked cards, or form confirmation details.
  - [x] Accept `reviewId` from form data and resolve the source through `getAdminFacebookCaptureReviewExtractionTarget(reviewId)`; do not trust a client-provided `sourceId`.
  - [x] Require explicit confirmation fields before extraction starts. At minimum require a checkbox value proving the operator reviewed raw text, source trust/confidence, and freshness-sensitive facts.
  - [x] Allow the action only for `needs_review` captures with readable raw text, source kind `facebook`, no existing extraction-prompt-version cards, and safe source trust state.
  - [x] Reuse `extractKnowledgeDraftsFromSource(...)` with the same `assertFacebookCaptureStillNeedsReview(...)` pre-provider guard used by Story 4.1D; do not create a second AI prompt, direct Gateway call, or duplicate extraction parser.

- [x] Approve all generated drafts safely after extraction (AC: 2, 4, 5, 6)
  - [x] Reuse existing draft approval validation logic from `src/features/knowledge/review.ts`; do not bypass `assertApprovalReady`, raw-source leak checks, confidence clamping rules, source-link checks, or audit behavior.
  - [x] If existing `approveKnowledgeDraft(...)` cannot be reused atomically because it opens its own transaction, add a small Knowledge-owned internal helper in `review.ts` that accepts the current transaction and session; keep the public single-draft approval behavior unchanged.
  - [x] Approve all returned draft IDs inside one approval transaction. If any returned draft fails approval validation or update, roll back the whole approval batch so the system does not leave only some generated drafts approved.
  - [x] Approve only the `draftIds` returned by `extractKnowledgeDraftsFromSource(...)`; do not approve arbitrary existing drafts linked to the source.
  - [x] Preserve extracted `freshnessSensitive` values during approval. Do not clear freshness flags or overwrite generated card fields in the approve-all action.
  - [x] Preserve Facebook/community confidence ceilings. Community Facebook captures must not be upgraded to `curated`, `partner`, or `official` by approve-all unless the linked source already has approved official/partner-backed source metadata.
  - [x] Do not create search documents, embeddings, retrieval decisions, traveler source bundles, or traveler-facing source UI in this story. Approval may make cards eligible for later retrieval/indexing flows, but indexing/search activation remains owned by existing Epic 4/5 paths.

- [x] Coordinate review-state transitions and partial-failure recovery (AC: 2, 3, 6)
  - [x] Treat approve-all as a two-phase capture-review transition inside one operator workflow: successful draft extraction first establishes extraction evidence, then successful approval of all returned drafts allows `markFacebookCaptureReviewStatus(..., { status: "extracted_approved" })`.
  - [x] Respect the current transition rules in `src/features/knowledge/facebook-capture-review.ts`: `extracted_approved` is currently valid from `extracted`, not directly from `needs_review`. Either call `extracted` then `extracted_approved` in a controlled sequence or update transition rules deliberately with tests.
  - [x] Inspect the return value from every `markFacebookCaptureReviewStatus(...)` call. Success requires `{ status: "updated" }`; handle `stale_review`, `invalid_transition`, `missing_extracted_cards`, and `not_found` with safe recovery redirects.
  - [x] Do not start approval if the post-extraction transition to `extracted` fails. Redirect with recovery status and linked draft context so the operator can manually review generated drafts.
  - [x] If extraction fails before drafts are created, mark `extraction_failed` with a short safe error and leave cards unapproved.
  - [x] If extraction succeeds but approval batch validation fails, do not silently claim approve-all completed. Leave all generated cards in draft/reviewable state, keep the review in `extracted` or another truthful safe status, and redirect with copy telling the operator to use manual draft review or retry as appropriate.
  - [x] Never store provider payloads, raw prompts, raw outputs, captured post text, stack traces, or raw error strings in `extractionError`, audit summaries, query params, or UI messages.

- [x] Wire the capture detail page UI (AC: 1, 2, 3, 4, 5, 6)
  - [x] Replace the disabled `Extract & Approve All (4.1E)` placeholder in `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` with a real guarded form only for actionable captures.
  - [x] Keep `Reject / reopen capture (4.1F)` disabled or explanatory; Story 4.1F owns rejection/reopen behavior.
  - [x] Use Vietnamese-first copy that makes the guardrail explicit: this action approves generated cards immediately and should only be used after the operator has reviewed raw text, trust/confidence, and freshness-sensitive facts.
  - [x] Require a visible confirmation checkbox with labels, not color-only status. Suggested label: `Tôi đã kiểm tra nội dung capture, trust/confidence và freshness; có thể trích xuất và phê duyệt tất cả thẻ được tạo.`
  - [x] On success, show links to approved cards or `/admin/knowledge/approved` and confirm Facebook/community confidence guardrails were preserved.
  - [x] On failure or partial failure, show safe Vietnamese copy and links to the capture detail, generated draft cards, or draft queue as applicable. Do not put raw text or provider details in URLs.

- [x] Add focused tests (AC: all)
  - [x] Add or extend an action-focused test file, likely `tests/facebook-capture-extraction-action.test.ts` or a new `tests/facebook-capture-approve-all-action.test.ts`.
  - [x] Test missing confirmation: action redirects with a safe error, no provider call, no draft creation, no approval, no review-status change.
  - [x] Test success from `needs_review`: existing extraction workflow creates draft cards, only returned drafts are approved, `needsReview=false`, source links are preserved, `freshnessSensitive` is preserved, confidence remains community/unverified as appropriate, and review status becomes `extracted_approved`.
  - [x] Test zero/invalid provider output: no approved cards persist and review status becomes `extraction_failed` with a safe short error.
  - [x] Test provider failure or model unavailable: no cards are approved, provider/usage behavior remains consistent with existing extraction tests, and no provider payload or raw text is stored.
  - [x] Test stale or concurrent review-state change before provider call: provider is not called and review/cards remain safe.
  - [x] Test approval failure after draft creation, such as raw-source leak or invalid draft fields: no partial success is claimed, generated drafts remain reviewable or the truthful safe status is shown, and audit trail exists for completed substeps only.
  - [x] Test unauthorized and traveler users fail before review lookup, raw source read, provider calls, draft approval, usage writes, or review status updates.
  - [x] Add a render test for the detail page when `needs_review` to verify the approve-all form appears with confirmation copy and is not available for extracted/rejected/failed captures.

- [x] Update story tracking (AC: all)
  - [x] Keep this story file updated during implementation: task checkboxes, Dev Agent Record, Completion Notes, Debug Log References, File List, and Change Log.
  - [x] Move `_bmad-output/implementation-artifacts/sprint-status.yaml` story key `4-1e-extract-and-approve-all-captured-facebook-drafts-with-guardrails` through implementation statuses.

### Review Findings

- [x] [Review][Patch] Final `extracted_approved` transition is not atomic with approvals [src/features/knowledge/actions.ts:315]
- [x] [Review][Patch] Missing approve-all provider-failure coverage [tests/facebook-capture-approve-all-action.test.ts:168]
- [x] [Review][Patch] Render test does not cover extracted and rejected non-actionable states [tests/facebook-capture-approve-all-action.test.ts:274]
- [x] [Review][Patch] Missing-confirmation redirect message is discarded by the UI [src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx:84]

## Dev Notes

### Product Boundary

- This story adds a faster operator path for trusted reviewed Facebook captures. It does not remove manual `Extract` or manual draft review; those remain safer fallback paths for uncertain captures. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1E-Extract-And-Approve-All-Captured-Facebook-Drafts-With-Guardrails`]
- This action is intentionally high-trust and high-risk because approval makes generated cards eligible for approved-knowledge workflows. The UI must force explicit operator confirmation and must not imply Facebook/community material is official or guaranteed. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1E-Extract-And-Approve-All-Captured-Facebook-Drafts-With-Guardrails`]
- Facebook-derived facts remain community/unverified unless source metadata already identifies an official/provider-backed source. Traveler answers must not present them as guaranteed or official. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1E-Extract-And-Approve-All-Captured-Facebook-Drafts-With-Guardrails`]

### Architecture Guardrails

- Keep this in the existing Next.js App Router modular monolith. UI belongs under `src/app/admin/knowledge/...`; Knowledge-owned server actions/helpers belong under `src/features/knowledge/...`; do not add a separate worker, service, queue, public route, or browser automation path. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-1-MVP-Runtime-Is-A-Next.js-Modular-Monolith`]
- Every admin/operator route/action must validate session and role server-side before reading or mutating protected data. Approve-all must authorize before resolving review IDs, raw source material, linked cards, or confirmation validity. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4-Auth-Is-Public-Sign-In-Plus-Google-OAuth-And-Server-Side-Roles`]
- Knowledge owns sources, raw source material, capture reviews, knowledge cards, and card-source linkage. UI should call Knowledge-owned actions/read helpers rather than writing tables directly from route components. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-5-Feature-Ownership-Boundaries-Are-Explicit`]
- Protected mutations must be server-side and audited with safe summaries. Do not place captured raw text, provider payloads, prompt/response bodies, browser metadata, cookies, tokens, local storage, or stack traces in audit summaries. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6-Mutations-Are-Server-Side-And-Audited`]
- Raw source material remains operator-only. Traveler AI Ask source bundles must not include `raw_source_material.raw_text`, copied post bodies, image/OCR notes, operator-only fields, provider payloads, or admin metadata. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Retrieval-Contract`]
- AI extraction must use the Gateway adapter/model catalog path. Do not call OpenAI directly or hard-code an extraction model in the approve-all action. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-10-AI-Gateway-Access-Is-Adapter-Based-And-Source-Bundled`]
- Only approved cards are eligible for normal traveler retrieval. Approval must still preserve normalized `sources` linkage through `knowledge_card_sources`; retrieval/source metadata must come from linked `sources` rows, not free-text card fields. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7-Knowledge-Cards-Have-A-Human-Approval-Lifecycle`]

### Existing Code To Reuse And Preserve

- `src/features/knowledge/actions.ts` already exports `extractKnowledgeDraftsFromFacebookCaptureForm(formData)` for Story 4.1D. The approve-all action should mirror its authorization, target resolution, duplicate extraction blocking, safe redirects, and use of `assertFacebookCaptureStillNeedsReview(...)`; do not regress the 4.1D path. [Source: `src/features/knowledge/actions.ts`]
- `src/features/knowledge/extraction.ts` already implements `extractKnowledgeDraftsFromSource(sourceId, { preProviderGuard })`: admin auth, readable raw text validation, active extraction-capable model selection, Gateway extraction, JSON parsing, confidence clamping, raw-overlap/sensitive-field rejection, draft insert, card-source linking, audit event, usage event, source advisory lock, and duplicate extraction blocking. Reuse it rather than duplicating extraction logic. [Source: `src/features/knowledge/extraction.ts`]
- `src/features/knowledge/review.ts` already implements `approveKnowledgeDraft(draftId, expectedUpdatedAt?)`: admin auth, reviewable draft loading, stale updated-at guard, approval readiness checks, raw-source leak checks, status update to `approved`, `needsReview=false`, and safe audit. Approve-all should reuse or factor this logic, not bypass it with direct table updates. [Source: `src/features/knowledge/review.ts`]
- `src/features/knowledge/facebook-capture-review.ts` already implements `markFacebookCaptureReviewStatus(...)`, `getExistingCardsForCaptureSource(...)`, stale-transition guards, safe summary normalization, and audit events. It currently allows `extracted_approved` from `extracted` only, so the implementation must account for that deliberately. [Source: `src/features/knowledge/facebook-capture-review.ts`]
- `src/features/knowledge/facebook-capture-review-admin.ts` provides admin-gated detail/extraction target reads and metadata sanitization. If approve-all needs target data, extend this server-only admin wrapper rather than exposing raw text through script-safe helpers. [Source: `src/features/knowledge/facebook-capture-review-admin.ts`]
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` currently renders the real `Extract` form and disabled `Extract & Approve All (4.1E)` / `Reject / reopen capture (4.1F)` placeholders. Replace only the 4.1E placeholder in this story; preserve the 4.1F boundary. [Source: `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`]
- `src/db/schema.ts` defines `knowledgeCards`, `knowledgeCardSources`, `facebookCaptureReviews`, source trust fields, and `knowledge_card_search_documents`. No migration is expected for this story unless implementation discovers an unavoidable missing field; prefer service/action logic over schema churn. [Source: `src/db/schema.ts`]

### Current State Of Files Likely To Touch

- `src/features/knowledge/actions.ts`: server action module. Add `extractAndApproveFacebookCaptureDraftsForm` here. Preserve existing generic source extraction, Facebook extract-only, draft approve, and intake redirects.
- `src/features/knowledge/review.ts`: approval service. Likely needs an internal transaction/session-aware helper so approve-all can approve multiple extracted draft IDs without bypassing validation or creating awkward nested independent transactions. Keep exported single-draft behavior stable.
- `src/features/knowledge/facebook-capture-review.ts`: transition rules and audit helper. Touch only if necessary to support a deliberate `needs_review -> extracted_approved` transition. If touched, add tests for all existing transition behaviors.
- `src/features/knowledge/facebook-capture-review-admin.ts`: server-only admin wrapper. Extend only if approve-all needs additional sanitized target fields beyond the existing extraction target.
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`: detail server component. Add real approve-all form, confirmation copy, and result/failure messages without weakening raw-text warnings or future-story placeholders.
- `tests/facebook-capture-extraction-action.test.ts`: existing 4.1D tests. Good place for action tests if kept focused; otherwise create `tests/facebook-capture-approve-all-action.test.ts`.
- `tests/knowledge-draft-review.test.ts`: existing approval tests. Extend only for reusable approval helper behavior; avoid duplicating full approve-all action tests here.

### UI And Copy Guidance

- Primary button label: `Trích xuất và phê duyệt tất cả`.
- Confirmation label: `Tôi đã kiểm tra nội dung capture, trust/confidence và freshness; có thể trích xuất và phê duyệt tất cả thẻ được tạo.`
- Supporting warning: `Hành động này tạo thẻ bằng AI rồi phê duyệt ngay. Chỉ dùng khi capture đáng tin cậy và đã được kiểm tra.`
- Success copy: `Đã trích xuất và phê duyệt {n} thẻ. Confidence nguồn Facebook/cộng đồng vẫn được giữ theo guardrail.`
- Partial failure copy: `Đã tạo bản nháp nhưng chưa phê duyệt toàn bộ. Kiểm tra hàng đợi bản nháp trước khi thử lại.`
- Failure copy: `Không thể trích xuất và phê duyệt capture này. Trạng thái đã được cập nhật an toàn nếu phù hợp.`
- Continue to label trust as `Nguồn Facebook/cộng đồng, chưa xác minh`; do not use green/success styling to imply Facebook content is official or guaranteed.

### Scope Boundaries

- Do not remove or weaken the existing extract-only action from Story 4.1D.
- Do not implement reject/reopen/recapture; Story 4.1F owns those mutations.
- Do not implement broader admin dashboard/navigation workflow routing; Story 4.1G owns integration beyond result links needed here.
- Do not alter Playwright capture behavior, raw text storage rules, raw metadata sanitization, or Facebook capture script behavior.
- Do not expose raw captured text, provider payloads, prompts, model outputs, internal stack traces, cookies, tokens, local storage, or hidden page data in query params, audit rows, usage events, linked-card rows, or traveler UI.
- Do not create search documents, embeddings, retrieval decisions, traveler answer provenance, traveler source chips, or public source rendering.
- Do not approve anything other than the draft IDs generated in the current confirmed approve-all request.

### Testing Requirements

- Use Vitest and existing DB helpers in `tests/helpers/db.ts`; do not introduce a new test framework. [Source: `_bmad-output/project-context.md#Testing-Rules`]
- Tests that mock auth should follow existing patterns in `tests/facebook-capture-extraction-action.test.ts`, `tests/facebook-capture-review-admin.test.ts`, and `tests/knowledge-draft-review.test.ts`.
- DB-backed tests share a test database; run DB-heavy targeted test files sequentially while debugging to avoid reset/migration contention noted by prior stories.
- Baseline verification remains `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, and `pnpm build` after targeted tests pass.

### Verification Commands

- `pnpm test:run tests/facebook-capture-extraction-action.test.ts`
- `pnpm test:run tests/knowledge-draft-review.test.ts`
- Add and run any new approve-all test file, for example `pnpm test:run tests/facebook-capture-approve-all-action.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm build`

### Previous Story Intelligence

- Story 4.1A established that capture/Playwright code and imported helpers must remain script-safe; importing `server-only` into capture paths can break Node/tsx operations scripts. Keep admin-gated approve-all code in server-only action/admin wrapper paths, not capture script helpers. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md#Script-Safe-Import-Warning`]
- Story 4.1A review fixes required actor identity for capture writes, atomic update plus audit, deep metadata sanitization, and no raw text in audit summaries. Do not regress those invariants through approve-all status transitions or failure summaries. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md#Review-Findings`]
- Story 4.1B added `facebook_capture_reviews` and fixed transition summary safety, conflict-safe creation, extraction-prompt-version duplicate checks, stale transition guards, and existing-card linkage. Preserve these safeguards and treat transition return values as authoritative. [Source: `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md#Review-Findings`]
- Story 4.1C added admin queue/detail routes and metadata value sanitization. Do not trust arbitrary raw metadata values just because key names are allowlisted. [Source: `_bmad-output/implementation-artifacts/4-1c-review-captured-facebook-sources-in-admin-queue.md#Review-Findings`]
- Story 4.1D added click-to-extract, duplicate blocking before provider calls, stale review recheck under source advisory lock, safe extraction failure handling, and recovery-status UI. Approve-all should build on those exact patterns. [Source: `_bmad-output/implementation-artifacts/4-1d-extract-draft-knowledge-from-reviewed-facebook-capture.md#Completion-Notes-List`]
- Story 4.1D review findings specifically fixed extraction after concurrent review-state change, ignored transition results, and misleading failure-status UI. Do not reintroduce those bugs in approve-all. [Source: `_bmad-output/implementation-artifacts/4-1d-extract-draft-knowledge-from-reviewed-facebook-capture.md#Review-Findings`]

### Git Intelligence Summary

- `066a878 Fix: address story 4.1D review findings` tightened stale-review and transition-result behavior for capture extraction.
- `dd20cfe Feat: extract drafts from Facebook captures` added the current extract-only server action and detail page form.
- `32f8709 Fix: address story 4.1C review findings` tightened safe metadata handling after review.
- `5309ad3 Feat: add Facebook capture review queue` added current queue/detail UI and admin wrapper.
- `e6a1d83 Fix: address story 4.1B review findings` and `c218bfa Feat: add Facebook capture review state` established review-state transition rules.
- The implementation should be a small continuation of those commits: server action, possibly reusable review helper, page form, tests, and no schema churn unless proven necessary.

### Latest Technical Information

- No new external library or framework is required for this story. Use the existing stack: Next.js 15.3.5 App Router, React 19.1.0, TypeScript 5.8.3, Drizzle 0.44.5, Vitest, and the existing OpenAI-compatible AI Gateway adapter/model catalog. [Source: `_bmad-output/project-context.md#Technology-Stack-&-Versions`]

### References

- `_bmad-output/planning-artifacts/epics.md#Story-4.1E-Extract-And-Approve-All-Captured-Facebook-Drafts-With-Guardrails`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7-Knowledge-Cards-Have-A-Human-Approval-Lifecycle`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-10-AI-Gateway-Access-Is-Adapter-Based-And-Source-Bundled`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`
- `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md`
- `_bmad-output/implementation-artifacts/4-1c-review-captured-facebook-sources-in-admin-queue.md`
- `_bmad-output/implementation-artifacts/4-1d-extract-draft-knowledge-from-reviewed-facebook-capture.md`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/extraction.ts`
- `src/features/knowledge/review.ts`
- `src/features/knowledge/facebook-capture-review.ts`
- `src/features/knowledge/facebook-capture-review-admin.ts`
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`
- `src/db/schema.ts`
- `tests/facebook-capture-extraction-action.test.ts`
- `tests/knowledge-draft-review.test.ts`

## Dev Agent Record

### Agent Model Used

gpt-5.5-review

### Debug Log References

- `pnpm test:run tests/facebook-capture-approve-all-action.test.ts` failed during red phase because `extractAndApproveFacebookCaptureDraftsForm` and the real approve-all UI did not exist.
- `pnpm test:run tests/facebook-capture-approve-all-action.test.ts` passed after implementation: 8 tests.
- `pnpm test:run tests/facebook-capture-extraction-action.test.ts` passed: 7 tests.
- `pnpm test:run tests/facebook-capture-review-admin.test.ts` initially failed because an existing render test expected the old disabled 4.1E placeholder; updated expectation to the new real approve-all form, then passed: 9 tests.
- `pnpm test:run tests/knowledge-draft-review.test.ts` passed: 17 tests.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm test:run` passed: 28 files, 363 tests.
- `pnpm build` passed.
- Code review patch verification: `pnpm test:run tests/facebook-capture-approve-all-action.test.ts` passed: 9 tests.
- Code review patch verification: `pnpm typecheck` passed.
- Code review patch verification: `pnpm lint` passed.
- Code review patch verification: DB-heavy adjacent tests initially failed when run in parallel due shared test database contention, then passed sequentially: `pnpm test:run tests/knowledge-draft-review.test.ts && pnpm test:run tests/facebook-capture-review-admin.test.ts`.
- Code review patch verification: `pnpm test:run` passed: 28 files, 364 tests.
- Code review patch verification: `pnpm build` passed.

### Completion Notes List

- Added `extractAndApproveFacebookCaptureDraftsForm` with admin/operator authorization, explicit confirmation, review-id source resolution, duplicate extraction blocking, source/raw text gating, and Story 4.1D stale-review pre-provider guard reuse.
- Added transaction-scoped approval reuse in `review.ts` plus `approveKnowledgeDraftBatch(...)` so approve-all validates every generated draft with existing approval rules and rolls back partial approval failures.
- Coordinated `needs_review -> extracted -> extracted_approved` transitions through existing `markFacebookCaptureReviewStatus(...)` return values, with safe recovery redirects and `extraction_failed` handling for extraction failures.
- Replaced the disabled 4.1E placeholder with a guarded Vietnamese-first approve-all form, confirmation checkbox, safe success/failure/partial-failure copy, and approved-card navigation while keeping 4.1F disabled.
- Added focused approve-all action/UI coverage for confirmation, success, invalid output, model unavailable, stale review state, approval failure, unauthorized users, and actionable/non-actionable rendering.
- Addressed code review findings by making batch approval and the final `extracted_approved` transition share one rollback boundary, adding provider-failure and non-actionable render coverage, and rendering the specific approve-all confirmation error.

### File List

- `_bmad-output/implementation-artifacts/4-1e-extract-and-approve-all-captured-facebook-drafts-with-guardrails.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/facebook-capture-review.ts`
- `src/features/knowledge/review.ts`
- `tests/facebook-capture-approve-all-action.test.ts`
- `tests/facebook-capture-review-admin.test.ts`

## Change Log

- 2026-07-13: Story created by BMad create-story workflow. Ultimate context engine analysis completed; comprehensive developer guide created.
- 2026-07-13: Implemented guarded Facebook capture extract-and-approve-all action, batch approval helper, UI wiring, focused tests, and validation; story moved to review.
- 2026-07-13: Addressed code review findings, reran targeted and baseline verification, and moved story to done.
