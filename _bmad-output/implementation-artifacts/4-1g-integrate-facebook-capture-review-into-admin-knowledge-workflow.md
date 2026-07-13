---
baseline_commit: afde2f2
---

# Story 4.1G: Integrate Facebook Capture Review Into Admin Knowledge Workflow

Status: done

<!-- Note: Validation is optional. Run bmad-create-story validate for quality check before bmad-dev-story. -->

## Story

As an operator,
I want the admin knowledge area to route me from Facebook capture to review, extraction, drafts, and approved cards,
so that I do not need to remember source IDs or CLI-only next steps.

## Acceptance Criteria

1. Given an admin opens the knowledge admin area, when Facebook captures exist that need review, then navigation or dashboard copy exposes a clear entry point to the Facebook capture review queue, and the operator can reach review without manually copying a source ID.
2. Given an operator submits or queues a Facebook source in intake, when the source is saved or shown in intake status, then the UI explains that Playwright capture must run before review if raw text is missing, and it links to the review queue once captured text exists.
3. Given `Extract` succeeds from a capture detail page, when the result is shown, then the admin sees next-step links to generated draft cards or the draft queue, and already-extracted captures show status and links instead of active duplicate extraction buttons.
4. Given `Extract & Approve All` succeeds, when the result is shown, then the admin sees links to approved cards or the approved knowledge list, and the UI confirms that Facebook/community confidence guardrails were preserved.
5. Given a capture is rejected, when the admin returns to the workflow, then rejected captures are absent from the default actionable queue, and status filters or safe messages make it clear why the item no longer appears.
6. Given the admin UI displays Facebook capture workflow states, when statuses, buttons, or empty states are shown, then copy uses Vietnamese-first operator-facing language consistent with existing admin knowledge pages, and it does not imply Facebook content is official, verified, or traveler-visible before approval.

## Tasks / Subtasks

### Review Findings

- [x] [Review][Patch] Non-draft linked cards are routed to draft detail pages [src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx:47]

- [x] Add Facebook capture workflow entry points to admin overview and knowledge intake (AC: 1, 2, 6)
  - [x] Update `src/app/admin/page.tsx` so the command-center dashboard clearly includes the Facebook capture workflow, with a link to `/admin/knowledge/facebook-captures` and copy that says captured Facebook/community material remains unverified until reviewed.
  - [x] Preserve the existing sidebar link in `src/app/admin/layout.tsx`; adjust copy only if needed. Do not replace the role gate or create a second admin navigation system.
  - [x] Update `src/app/admin/knowledge/intake/page.tsx` success and helper copy for Facebook URLs so operators understand queued Facebook links require the Playwright operator tool before the review queue can show readable raw text.
  - [x] Add a review-queue link near intake success/status messaging so operators can continue to captured review without copying source IDs once capture has completed.

- [x] Improve Facebook capture queue status/empty-state workflow routing (AC: 1, 5, 6)
  - [x] Update `/admin/knowledge/facebook-captures` empty states so default `needs_review` explains two distinct outcomes: no captured text has been saved yet, or all captures have moved to extracted/approved/rejected filters.
  - [x] Keep the default queue filtered to actionable `needs_review` rows with readable raw text; do not re-add rejected or recapture-ready empty-text rows to the default actionable list.
  - [x] Ensure rejected filter copy shows the safe rejection reason and explains that rejected captures no longer appear in the actionable queue and have not created traveler-visible knowledge.
  - [x] Keep status labels text-based and Vietnamese-first; do not rely on color alone.

- [x] Tighten capture detail next-step links and duplicate-extraction messaging (AC: 3, 4, 6)
  - [x] In `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`, ensure successful extract-only results link to `/admin/knowledge/drafts` and, when generated/linked card IDs are available through `review.existingCards`, show direct links to draft detail pages.
  - [x] Ensure successful approve-all results link to `/admin/knowledge/approved` and, when linked approved cards are present, show direct links to approved card detail pages.
  - [x] For already-extracted or non-actionable captures, keep extraction buttons hidden and show status plus linked draft/approved cards instead of prompting operators to paste source IDs into intake.
  - [x] Keep the current raw-text warning and trust label visible on the detail page; do not make success states look official/verified.

- [x] Preserve server-side boundaries and avoid new mutation mechanics (AC: all)
  - [x] Do not add new extraction, approve-all, rejection, reopen, recapture, Playwright, schema, migration, embedding, retrieval, or search-document behavior for this story.
  - [x] Reuse existing admin-gated reads from `src/features/knowledge/facebook-capture-review-admin.ts`; add only small read-model fields or counts if the UI needs them.
  - [x] If a new dashboard count/helper is needed, keep it Knowledge-owned, server-only when it touches auth/db, and safe: counts only, no raw text, no provider payloads, no operator-only metadata in public or traveler UI.
  - [x] Do not expose `raw_source_material.rawText` outside authenticated admin/operator pages.

- [x] Add focused tests for workflow integration (AC: all)
  - [x] Extend `tests/facebook-capture-review-admin.test.ts` or add a focused render/read test to cover the admin overview/intake links and queue empty/status copy.
  - [x] Extend capture detail render coverage for extracted, extracted-approved, rejected, and already-extracted states to verify next-step links and absence of duplicate extraction actions.
  - [x] Test that default queue still excludes rejected captures and recapture-ready rows with missing raw text, while `?status=rejected` shows safe rejection reason/status copy.
  - [x] Test unauthorized and normal traveler access remains blocked before raw captured text is read.

- [x] Update story tracking (AC: all)
  - [x] Keep this story file updated during implementation: task checkboxes, Dev Agent Record, Completion Notes, Debug Log References, File List, and Change Log.
  - [x] Move `_bmad-output/implementation-artifacts/sprint-status.yaml` story key `4-1g-integrate-facebook-capture-review-into-admin-knowledge-workflow` through implementation statuses.

## Dev Notes

### Product Boundary

- This story integrates the already-built Facebook capture review flow into the admin knowledge workflow. It is a routing, copy, and discoverability story, not a new capture/extraction/review-state story. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1G-Integrate-Facebook-Capture-Review-Into-Admin-Knowledge-Workflow`]
- Operators should be able to move from admin overview or intake to capture review, from capture detail to draft review, and from approve-all success to approved cards without remembering source IDs or CLI-only next steps. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1G-Integrate-Facebook-Capture-Review-Into-Admin-Knowledge-Workflow`]
- Facebook/community content must continue to be labeled unverified/community by default. Copy must not imply captured content is official, verified, approved, retrievable, or traveler-visible before the relevant review/approval path completes. [Source: `_bmad-output/planning-artifacts/epics.md#Story-4.1G-Integrate-Facebook-Capture-Review-Into-Admin-Knowledge-Workflow`]

### Architecture Guardrails

- Keep this in the existing Next.js App Router modular monolith. UI belongs under `src/app/admin/...`; Knowledge-owned server reads/actions belong under `src/features/knowledge/...`; do not add a service, worker, queue, public route, or browser automation path. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-1-MVP-Runtime-Is-A-Next.js-Modular-Monolith`]
- Every admin/operator route/action must validate session and role server-side before reading protected data. The current `src/app/admin/layout.tsx` role gate and `facebook-capture-review-admin.ts` `requireAdminSession()` helpers are the existing boundary to preserve. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4-Auth-Is-Public-Sign-In-Plus-Google-OAuth-And-Server-Side-Roles`]
- Knowledge owns sources, raw source material, Facebook capture reviews, knowledge cards, and card-source linkage. UI should use Knowledge-owned read helpers and actions; do not query or mutate these aggregates from unrelated modules. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-5-Feature-Ownership-Boundaries-Are-Explicit`]
- Raw source material remains operator-only. Traveler answer source bundles and public UI must not include `raw_source_material.rawText`, copied post bodies, image/OCR notes, operator-only fields, provider payloads, admin metadata, cookies, tokens, local storage, hidden data, or browser profile data. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7-Knowledge-Cards-Have-A-Human-Approval-Lifecycle`]
- Facebook capture remains operator-controlled and raw-material-only. This story must not run Playwright from a web request or persist Facebook credentials/cookies/tokens/local storage/full HTML/hidden page data. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`]

### Existing Code To Reuse And Preserve

- `src/app/admin/layout.tsx` already includes the admin sidebar link `{ href: "/admin/knowledge/facebook-captures", label: "Capture Facebook", eyebrow: "Queue" }`. Preserve it unless copy needs small refinement; do not duplicate navigation. [Source: `src/app/admin/layout.tsx`]
- `src/app/admin/page.tsx` is the admin command-center dashboard. It currently summarizes intake, review, and quality but does not surface the Facebook capture sub-workflow as a dashboard entry. This is the best place for the AC1 dashboard entry point. [Source: `src/app/admin/page.tsx`]
- `src/app/admin/knowledge/intake/page.tsx` owns source intake, source success copy, generic source extraction by pasted source ID, batch intake, and source suggestion forms. Add Facebook capture guidance here without removing generic extraction or batch workflows. [Source: `src/app/admin/knowledge/intake/page.tsx`]
- `src/app/admin/knowledge/facebook-captures/page.tsx` already lists status-filtered captures, defaults to `needs_review`, excludes empty recapture-ready rows through `listFacebookCaptureReviews(...)`, shows safe rejection reason for rejected rows, and links to detail pages. Preserve these invariants while improving copy and routing. [Source: `src/app/admin/knowledge/facebook-captures/page.tsx`; `src/features/knowledge/facebook-capture-review.ts`]
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` already renders raw text only inside admin/operator route, linked cards, extract-only, approve-all, reject, and reopen forms. Treat it as the central detail workflow surface and avoid adding a second place to trigger these actions. [Source: `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`]
- `src/features/knowledge/facebook-capture-review-admin.ts` is the server-only admin wrapper. Extend it for sanitized counts/read-model fields if needed, but keep script-safe capture helpers free of `server-only`, auth imports, and Next imports. [Source: `src/features/knowledge/facebook-capture-review-admin.ts`]
- `src/features/knowledge/actions.ts` already owns extract-only, approve-all, reject, reopen, source intake, draft review, and redirect behavior. Do not add new mutations unless a small safe redirect/link change is unavoidable. [Source: `src/features/knowledge/actions.ts`]

### Current State Of Files Likely To Touch

- `src/app/admin/page.tsx`: add dashboard card/link/copy for Facebook capture review workflow.
- `src/app/admin/knowledge/intake/page.tsx`: add Facebook queue/capture guidance and review-queue link around source intake success/helper copy.
- `src/app/admin/knowledge/facebook-captures/page.tsx`: improve status filter/empty/rejected copy while preserving default filters and safe metadata.
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`: refine next-step result copy and linked-card routing after extract/approve/reject states; preserve action guards.
- `src/features/knowledge/facebook-capture-review-admin.ts`: optional, only if UI needs safe counts or additional sanitized read fields.
- `tests/facebook-capture-review-admin.test.ts`: likely place for render/read-helper coverage.
- `tests/facebook-capture-extraction-action.test.ts`, `tests/facebook-capture-approve-all-action.test.ts`, and `tests/facebook-capture-reject-action.test.ts`: reference patterns for action redirects and non-actionable states if detail render tests need updates.

### UI And Copy Guidance

- Dashboard entry label: `Capture Facebook` or `Duyệt capture Facebook`.
- Dashboard detail: `Link Facebook đã capture text sẽ vào hàng đợi duyệt. Nguồn Facebook/cộng đồng vẫn chưa xác minh cho tới khi vận hành review và phê duyệt thẻ.`
- Intake helper for Facebook URLs: `Nếu chỉ lưu link Facebook chưa có raw text, hãy chạy công cụ Playwright operator trước. Sau khi capture thành công, nguồn sẽ xuất hiện trong hàng đợi duyệt Facebook.`
- Review queue CTA: `Mở hàng đợi duyệt capture Facebook`.
- Default empty state: `Chưa có capture cần duyệt. Nếu vừa lưu link Facebook, hãy chạy công cụ capture trước; nếu đã xử lý xong, kiểm tra các filter Đã trích xuất, Đã trích xuất và duyệt, hoặc Đã từ chối.`
- Rejected filter helper: `Capture đã từ chối không còn nằm trong hàng đợi cần xử lý và chưa tạo thẻ tri thức cho traveler.`
- Already extracted helper: `Capture này đã có thẻ liên kết. Kiểm tra bản nháp hoặc thẻ đã duyệt thay vì trích xuất lại.`
- Continue using `Nguồn Facebook/cộng đồng, chưa xác minh`; do not use green/success styling to imply official or guaranteed source trust.

### Scope Boundaries

- Do not alter Playwright capture behavior, browser profile handling, capture script arguments, raw text update rules, or raw metadata sanitization.
- Do not add manual raw-text edit/paste UI for Facebook captures.
- Do not create or modify database schema/migrations for this story unless implementation proves a small safe read field is impossible without it; expected implementation needs no migration.
- Do not change review transition rules for `needs_review`, `rejected`, `extracted`, `extracted_approved`, or `extraction_failed`.
- Do not approve drafts, create search documents, embeddings, retrieval decisions, answer provenance, traveler source chips, or public source rendering in this story.
- Do not expose raw captured text, provider payloads, prompts, model outputs, stack traces, cookies, tokens, local storage, hidden page data, browser profile data, or long rejection text in dashboard/intake/queue copy, query params, audit rows, usage events, or traveler UI.

### Testing Requirements

- Use Vitest and existing helpers; do not introduce a new test framework. [Source: `_bmad-output/project-context.md#Testing-Rules`]
- Keep DB-heavy targeted test files sequential while debugging because prior stories noted shared test database contention. [Source: `_bmad-output/implementation-artifacts/4-1f-reject-captured-facebook-source-material.md#Testing-Requirements`]
- Add render/read-helper tests around admin overview/intake/queue/detail workflow routing. Prefer extending existing Facebook capture admin tests rather than creating broad brittle UI snapshots.
- Baseline verification remains `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, and `pnpm build` after targeted tests pass. [Source: `_bmad-output/project-context.md#Testing-Rules`]

### Verification Commands

- `pnpm test:run tests/facebook-capture-review-admin.test.ts`
- `pnpm test:run tests/facebook-capture-extraction-action.test.ts`
- `pnpm test:run tests/facebook-capture-approve-all-action.test.ts`
- `pnpm test:run tests/facebook-capture-reject-action.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm build`

### Previous Story Intelligence

- Story 4.1A established that capture/Playwright code and imported helpers must remain script-safe; importing `server-only` into capture paths can break Node/tsx operations scripts. Keep any admin dashboard reads in server-only admin wrappers, not capture script helpers. [Source: `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md#Script-Safe-Import-Warning`]
- Story 4.1B added `facebook_capture_reviews`, status filtering, safe transition summaries, conflict-safe review creation, extraction-prompt-version duplicate checks, stale transition guards, and existing-card linkage. Preserve those transition semantics. [Source: `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md#Review-Findings`]
- Story 4.1C added admin queue/detail routes and metadata value sanitization. Do not trust arbitrary raw metadata values just because key names are allowlisted. [Source: `_bmad-output/implementation-artifacts/4-1c-review-captured-facebook-sources-in-admin-queue.md#Review-Findings`]
- Story 4.1D added click-to-extract, duplicate blocking before provider calls, stale review recheck under source advisory lock, safe extraction failure handling, and recovery-status UI. Integration copy must not encourage duplicate extraction or source-ID pasting as the normal path for captured Facebook rows. [Source: `_bmad-output/implementation-artifacts/4-1d-extract-draft-knowledge-from-reviewed-facebook-capture.md#Completion-Notes-List`]
- Story 4.1E added approve-all guardrails and fixed atomic approval/final-status behavior. Success copy must confirm guardrails without implying Facebook/community material became official. [Source: `_bmad-output/implementation-artifacts/4-1e-extract-and-approve-all-captured-facebook-drafts-with-guardrails.md#Completion-Notes-List`]
- Story 4.1F added reject/reopen, fixed recapture-ready queue behavior, safe query messages, missing-raw-text rejection guard, and rejected queue reason display. Do not reintroduce rejected captures or empty recapture-ready rows into the default actionable queue. [Source: `_bmad-output/implementation-artifacts/4-1f-reject-captured-facebook-source-material.md#Completion-Notes-List`]

### Git Intelligence Summary

- `afde2f2 Fix: address story 4.1F review findings` tightened recapture-ready queue behavior and safe rejected-state UI.
- `961ec83 Feat: reject Facebook capture reviews` added reject/reopen actions and UI.
- `0aa139f Fix: address story 4.1E review findings` tightened approve-all atomicity and non-actionable render coverage.
- `d8a6b8b Feat: approve Facebook capture drafts` added approve-all action and UI.
- `dd20cfe Feat: extract drafts from Facebook captures` added extract-only action and detail page result flow.
- `5309ad3 Feat: add Facebook capture review queue` added queue/detail admin UI and admin wrapper.
- This story should be a small continuation: dashboard/intake/queue/detail copy and links, possibly safe counts, and focused render tests. No schema or service churn is expected.

### Latest Technical Information

- No new external library or framework is required. Use the existing stack: Next.js 15.3.5 App Router, React 19.1.0, TypeScript 5.8.3, Drizzle 0.44.5, Vitest, and current admin/server-action patterns. [Source: `_bmad-output/project-context.md#Technology-Stack-&-Versions`]

### Project Structure Notes

- App routes stay under `src/app/admin/...`; feature-owned server logic stays under `src/features/knowledge/...`; tests stay under `tests/`.
- There is no `src/app/admin/knowledge/page.tsx` today. Use the existing `/admin` overview and `/admin/knowledge/intake` page unless implementation deliberately creates a knowledge landing page with matching sidebar/navigation updates.
- Keep BMad artifacts under `_bmad-output/implementation-artifacts/`; do not move story/spec files into app folders.

### References

- `_bmad-output/planning-artifacts/epics.md#Story-4.1G-Integrate-Facebook-Capture-Review-Into-Admin-Knowledge-Workflow`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.4-Knowledge-Collection`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.5-Retrieval-Web-Search-And-Answer-Grounding`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7-Knowledge-Cards-Have-A-Human-Approval-Lifecycle`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`
- `_bmad-output/implementation-artifacts/spec-4-1b-create-facebook-capture-review-state.md`
- `_bmad-output/implementation-artifacts/4-1c-review-captured-facebook-sources-in-admin-queue.md`
- `_bmad-output/implementation-artifacts/4-1d-extract-draft-knowledge-from-reviewed-facebook-capture.md`
- `_bmad-output/implementation-artifacts/4-1e-extract-and-approve-all-captured-facebook-drafts-with-guardrails.md`
- `_bmad-output/implementation-artifacts/4-1f-reject-captured-facebook-source-material.md`
- `src/app/admin/layout.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/knowledge/intake/page.tsx`
- `src/app/admin/knowledge/facebook-captures/page.tsx`
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/facebook-capture-review.ts`
- `src/features/knowledge/facebook-capture-review-admin.ts`
- `src/features/knowledge/facebook-capture.ts`
- `tests/facebook-capture-review-admin.test.ts`
- `tests/facebook-capture-extraction-action.test.ts`
- `tests/facebook-capture-approve-all-action.test.ts`
- `tests/facebook-capture-reject-action.test.ts`

## Dev Agent Record

### Agent Model Used

gpt-5.5-review

### Debug Log References

- `pnpm test:run tests/facebook-capture-review-admin.test.ts` initially failed on expected missing workflow copy/links, then passed after implementation.
- Parallel related DB-heavy test files showed shared test database contention; sequential rerun passed.
- `pnpm test:run` initially exposed a deterministic stale fixed timestamp in `tests/facebook-capture-review.test.ts`; updated the fixture timestamp to satisfy the existing `updated_after_created` constraint.

### Completion Notes List

- Story created by BMad create-story workflow. Ultimate context engine analysis completed; comprehensive developer guide created.
- Added admin dashboard and intake routing to the Facebook capture review queue with Vietnamese-first unverified/community guardrail copy.
- Improved Facebook capture queue empty states and rejected-state explanation without changing actionable queue filtering or exposing raw text.
- Added capture detail next-step links to draft/approved queues and direct linked cards while preserving duplicate-extraction guards and trust/raw-text warnings.
- Added focused render/read tests for admin overview, intake, queue empty/rejected states, detail extracted/approved routing, duplicate-action absence, and existing unauthorized raw-text protections.
- Validation passed: `pnpm test:run tests/facebook-capture-review-admin.test.ts`, related Facebook action tests sequentially, `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, and `pnpm build`.
- Review patch fixed non-draft/non-approved linked cards so rejected/archived/duplicate/no-action cards are not routed to draft detail pages, with focused regression coverage.

### File List

- `_bmad-output/implementation-artifacts/4-1g-integrate-facebook-capture-review-into-admin-knowledge-workflow.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/admin/page.tsx`
- `src/app/admin/knowledge/intake/page.tsx`
- `src/app/admin/knowledge/facebook-captures/page.tsx`
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`
- `tests/facebook-capture-review-admin.test.ts`
- `tests/facebook-capture-review.test.ts`

## Change Log

- 2026-07-13: Story created by BMad create-story workflow and marked ready-for-dev.
- 2026-07-13: Implemented Facebook capture workflow routing/copy integration, focused tests, and validation; marked ready for review.
