---
baseline_commit: d074c6bab12e8aac26804add1614ce4ce7e4cd8a
---

# Story OPS.1: Async Knowledge Extraction Worker

Status: review

<!-- Note: Validation is optional. Run bmad-create-story validate for quality check before bmad-dev-story. -->

## Story

As an operator,
I want knowledge extraction to run asynchronously in a durable worker,
so that long AI Gateway extraction calls can finish or retry without timing out the admin request.

## Acceptance Criteria

1. Given an admin/operator starts extraction from a reviewed Facebook capture or source intake path, when they submit the action, then the request enqueues a durable extraction job and returns without waiting for the AI Gateway provider call.
2. Given an extraction job is queued, when the long-running worker process is running, then it claims jobs from PostgreSQL safely, processes one job at a time by default, and no two worker processes can process the same job.
3. Given a job is processed, when the AI Gateway extraction call runs, then it runs outside any long-lived database transaction and uses the existing model catalog, extraction prompt, parser, validation, draft persistence, audit, and AI usage event semantics.
4. Given a transient provider/network/timeout failure occurs, when attempts remain, then the job is retried with bounded backoff and a safe error summary, without creating draft cards or exposing provider payloads.
5. Given retries are exhausted or the failure is non-retryable, when the worker finalizes the job, then the job is marked failed and any related Facebook capture review is marked `extraction_failed` with a short safe error.
6. Given extract-only succeeds, when the worker commits the result, then draft cards are linked to the source, remain review-needed, the related review reaches `extracted`, and the UI exposes linked draft context.
7. Given async `Extract & Approve All` is confirmed and succeeds, when the worker commits the result, then generated draft cards are approved through the existing approval guardrails, the related review reaches `extracted_approved`, and no partial approve-all success is claimed.
8. Given the worker crashes or is killed while a job is `running`, when stale-running recovery executes, then the job can return to `queued` after a safe timeout and retry without duplicate draft creation or duplicate approvals.
9. Given a source already has extraction-prompt-version cards, when enqueue or worker processing runs, then duplicate extraction is blocked before provider calls where possible and rechecked under the final source lock before draft insertion or approval.
10. Given the admin UI displays extraction controls, when a job is queued or running, then the UI shows a Vietnamese in-progress state and disables duplicate extract / extract-and-approve submission for that review/source.
11. Given local or production operations need the worker, when setup is checked, then package scripts and documentation expose a long-running command such as `pnpm knowledge:extraction-worker` and a one-shot debug mode such as `pnpm knowledge:extraction-worker --once`.
12. Given the worker script runs under `tsx`, when it imports app modules, then it uses script-safe server modules or deliberately factored shared code and does not crash because of Next-only `server-only` import poisoning.
13. Given tests run, when enqueue, worker success, async approve-all success, retry, terminal failure, duplicate prevention, stale recovery, worker import/runtime smoke, and UI in-progress states are exercised, then they pass without requiring real AI Gateway credentials.

## Tasks / Subtasks

- [x] Add durable extraction job state (AC: 1, 2, 4, 5, 7, 8, 9)
  - [x] Add a Drizzle schema table such as `knowledgeExtractionJobs` with source ID, optional Facebook capture review ID, mode (`extract_only` or `extract_and_approve_all`), status, attempt count, max attempts, next run time, locked timestamp, locked worker ID, started/finished timestamps, safe last error code/message, created-by actor fields, and result draft count.
  - [x] Persist result draft IDs or another durable job-owned result reference if needed to make approve-all retries idempotent after draft creation. The worker must never approve drafts not produced by the confirmed job attempt.
  - [x] Generate a migration and metadata snapshot through the existing Drizzle workflow.
  - [x] Add indexes for queued job claiming by `status` and `nextRunAt`, review/source lookup, and stale-running recovery.
  - [x] Define a tight status enum such as `queued`, `running`, `succeeded`, `failed`, and optionally `cancelled`; avoid ad hoc string statuses.
  - [x] Store only safe operational metadata in the job row. Do not store raw source text, raw model output, prompts, provider payloads, screenshots, cookies, local storage, stack traces, or secrets.

- [x] Add enqueue path for current extraction actions (AC: 1, 7, 9, 10)
  - [x] Add a knowledge-owned enqueue helper that authorizes admin/operator before reading review/source/raw-material state.
  - [x] For Facebook capture extraction, accept `reviewId` as the authority and resolve source through the existing admin-gated target helper; do not trust client-provided `sourceId` alone.
  - [x] For Facebook capture `Extract & Approve All`, require the same explicit confirmation fields before enqueue that Story 4.1E requires before synchronous execution.
  - [x] Persist the requested job mode so the worker can distinguish extract-only from confirmed extract-and-approve-all.
  - [x] For generic source intake extraction, enqueue by source ID only after existing admin/operator validation and readable raw-text checks.
  - [x] Block duplicate enqueue when any active `queued` or `running` extraction job exists for the same source/review, regardless of mode. Do not allow extract-only and approve-all to race each other.
  - [x] Block enqueue when `sourceAlreadyHasExtraction(...)` or existing linked extraction cards prove the source was already extracted.
  - [x] Return safe job IDs/status values to UI redirects; do not put raw error or provider content in query params.

- [x] Add in-progress review/source UI state (AC: 1, 6, 7, 10)
  - [x] Add a Facebook capture review in-progress state such as `extracting`, or derive in-progress from active jobs with equivalent duplicate-prevention behavior. If deriving, keep UI and action guards consistent across page loads.
  - [x] If adding a persisted `extracting` review status, update all status checks, DB constraints, counters, filters, transitions, and recovery paths. If deriving from jobs, do not add a review status or transition that creates inconsistent dual state.
  - [x] Update `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` to show Vietnamese in-progress copy such as `Đang trích xuất bằng AI` with attempt/status context where safe.
  - [x] Disable extract-only and extract-and-approve actions while any extraction job is queued/running for the review/source.
  - [x] Keep extracted, extracted-approved, rejected, failed, and existing-card states truthful and visible; do not use color-only status.
  - [x] Add a retry affordance only for terminal failed jobs if implementation can route it through the same enqueue/duplicate guardrails safely.

- [x] Split synchronous extraction into reusable worker-safe phases (AC: 3, 6, 7, 9, 12)
  - [x] Refactor current extraction code so provider calls can run outside long database transactions.
  - [x] Separate script-safe core extraction/worker code from Next-only server-action wrappers. Files imported by `scripts/*.ts` must not import `server-only`, `next/navigation`, or `@/server/auth` directly.
  - [x] Preserve existing extraction prompt, model catalog selection, parser, confidence clamping, raw-source leak checks, draft insertion, card-source linkage, audit summaries, and usage-event behavior.
  - [x] Keep provider usage events recorded for every provider call success/failure according to current Story 4.2 and Story 5.9 semantics.
  - [x] Support worker execution without `requireAdminSession()` by passing the stored initiating actor or an explicit worker/system actor with `initiatedBy` context in audit summaries.
  - [x] Recheck source/review actionability and duplicate extraction inside a short final transaction before inserting drafts or marking review success.
  - [x] Keep the source advisory lock for final write/transition safety, but do not hold it while awaiting the AI Gateway call.
  - [x] For `extract_and_approve_all`, approve only draft IDs produced by that job and use the existing approval validation path; never approve arbitrary existing linked drafts.
  - [x] For `extract_and_approve_all`, make retry behavior explicit: if drafts were created but approval did not finish, retries must either resume approval for the job-owned draft IDs or stop with a safe recoverable status. They must not call the provider again and create a second draft set.

- [x] Implement long-running worker process (AC: 2, 4, 5, 7, 10, 11, 12)
  - [x] Add a Node/tsx script path such as `scripts/knowledge-extraction-worker.ts` using existing DB and env conventions.
  - [x] Follow the existing operations script pattern in `scripts/facebook-capture.ts`: create a script-safe DB connection explicitly or through script-safe helpers, and avoid importing Next request/session modules.
  - [x] Add package scripts for long-running and one-shot modes, for example `knowledge:extraction-worker` and support for `--once`.
  - [x] Claim work atomically with PostgreSQL row locking, for example `FOR UPDATE SKIP LOCKED`, or an equivalent Drizzle/raw SQL helper.
  - [x] Default concurrency to one job at a time. Do not add parallel processing until a later need proves provider and DB capacity.
  - [x] Sleep when no jobs are available and keep the interval configurable with a safe default such as 5 seconds.
  - [x] Handle `SIGINT` and `SIGTERM`: stop claiming new jobs, finish or safely release current pre-provider jobs, and rely on stale-running recovery if killed mid-provider call.
  - [x] Add stale-running recovery for jobs locked longer than a conservative threshold, such as 15 minutes, while keeping duplicate draft prevention fail-closed.

- [x] Add retry/backoff and timeout behavior (AC: 3, 4, 5)
  - [x] Increase extraction provider timeout above the current 30-second failure point, preferably with an extraction-specific setting such as `AI_GATEWAY_EXTRACTION_TIMEOUT_MS` so chat/evaluation timeouts do not change accidentally.
  - [x] Keep any timeout setting clamped to a safe maximum already supported by the gateway adapter, or update the adapter clamp deliberately with tests.
  - [x] Treat network aborts, gateway network errors, provider timeouts, and transient 5xx/rate-limit classes as retryable when attempts remain.
  - [x] Treat invalid source, unsupported material, duplicate extraction, invalid model output, and non-actionable review state as non-retryable unless implementation has a clear safe retry reason.
  - [x] Use bounded backoff through `nextRunAt`, for example 30 seconds, 2 minutes, then 5 minutes, without unbounded retries.
  - [x] On each attempt, persist safe error code/message and latency where available; never persist raw provider payloads.

- [x] Preserve approve-all and manual review boundaries (AC: 6, 7, 10)
  - [x] Keep async extract-only jobs creating draft cards only.
  - [x] Implement async approve-all as a confirmed job mode and preserve Story 4.1E requirements: explicit confirmation before enqueue, only returned draft IDs approved, no partial approve-all success, and community trust guardrails.
  - [x] Replace the existing synchronous `Extract & Approve All` action with enqueue behavior so it no longer waits for the provider call in the admin request.
  - [x] If extraction succeeds but approval validation fails, leave generated cards in truthful reviewable state, do not claim approve-all completed, and record safe job/review recovery state.
  - [x] Do not create embeddings, search documents, retrieval decisions, traveler source bundles, or traveler-visible source UI in this story.

- [x] Add focused tests (AC: all)
  - [x] Add tests for enqueue success from Facebook capture and source intake paths: no provider call during the request, job row created, review/source UI can show in-progress state.
  - [x] Add tests for async approve-all enqueue: missing confirmation blocks enqueue, valid confirmation creates an `extract_and_approve_all` job, and no provider call occurs during the request.
  - [x] Test duplicate active job blocks second enqueue across modes and does not call provider.
  - [x] Test worker success: claims a queued job, calls mocked AI Gateway, inserts draft cards, links source, writes audit/usage, and marks job/review succeeded.
  - [x] Test worker approve-all success: claims confirmed approve-all job, extracts drafts, approves only returned draft IDs through existing guardrails, and marks review `extracted_approved`.
  - [x] Test worker approve-all approval failure: no partial approval is claimed, unsafe approvals roll back, and generated drafts/review/job status remain truthful and recoverable.
  - [x] Test approve-all retry idempotency after drafts exist: the worker does not call the provider again or create duplicate draft cards, and it only resumes/settles job-owned draft IDs.
  - [x] Test transient timeout/network failure retries with `nextRunAt`, attempt count, safe error storage, and no draft persistence.
  - [x] Test terminal failure after max attempts marks job failed and review `extraction_failed` with safe short error.
  - [x] Test stale `running` recovery requeues an old locked job and duplicate draft rechecks prevent duplicate cards.
  - [x] Test unauthorized callers cannot enqueue before review/source/raw material or job state is exposed.
  - [x] Test the worker can run in one-shot mode and exits after available work or no work.
  - [x] Add an import/runtime smoke test or equivalent targeted coverage proving the worker entrypoint can load under `tsx` without Next-only `server-only` import failures.

- [x] Update operations documentation and story tracking (AC: 10, 11)
  - [x] Document local usage, production deployment expectation, environment variables, shutdown behavior, retry policy, and safe recovery in `README.md` or a focused operations doc under `docs/`.
  - [x] Update `.env.example` if new worker timeout, poll interval, or stale-lock settings are env-backed.
  - [x] Update this story file during implementation: task checkboxes, Dev Agent Record, Completion Notes, Debug Log References, File List, and Change Log.
  - [x] Add this story key to `_bmad-output/implementation-artifacts/sprint-status.yaml` as `ready-for-dev` or the active implementation status.

## Dev Notes

### Product Boundary

- This story solves the observed AI Gateway extraction timeout problem by moving long provider calls out of the admin HTTP/server-action request. The operator should get immediate acknowledgement and truthful progress instead of waiting for a 30-second request timeout.
- This story is operational reliability work for Knowledge extraction. It should not change what AI extracts, what drafts contain, or what becomes traveler-retrievable.
- The default behavior should remain human-review-first for extract-only. Approve-all is deliberately included as a separate confirmed async job mode and must preserve the existing Story 4.1E confirmation and approval guardrails.

### Architecture Guardrails

- Current architecture says the MVP is a Next.js modular monolith and not split into independent services. This story introduces one long-running worker process, but it must stay inside the same repository, same TypeScript codebase, same Postgres data plane, and same feature ownership boundaries. It is a process boundary for background execution, not a new domain service.
- PostgreSQL remains the durable job source of truth. Do not introduce Redis, BullMQ, SQS, Cloud Tasks, or a hosted job platform in this story unless the user explicitly changes direction.
- Use Drizzle-managed schema and migrations for job persistence. Raw SQL is acceptable for row locking or advisory locks when Drizzle cannot express the needed PostgreSQL behavior cleanly.
- Knowledge owns extraction jobs, source validation, draft writes, and Facebook capture review transitions. UI and scripts should call Knowledge-owned helpers rather than writing tables directly.
- AI Gateway access must remain adapter/model-catalog based. Do not call provider APIs directly or hard-code `cx/gpt-5.4-mini` in worker logic.
- Protected data remains protected: raw source material is operator-only, provider prompts/responses are not persisted in job rows, and normal travelers must never see worker state that reveals raw/admin-only data.
- Operations scripts in this repo currently import script-safe modules rather than Next-only modules. Preserve that pattern: worker-importable modules must not depend on `server-only`, `next/navigation`, request cookies, or session-bound auth.

### Existing Code To Reuse And Preserve

- `src/features/knowledge/extraction.ts` currently implements `extractKnowledgeDraftsFromSource(...)`, including admin auth, raw text validation, active model selection, `completeExtraction(...)`, parser/validation, draft insert, card-source linkage, audit, usage, source advisory lock, and duplicate extraction checks. Refactor this logic into worker-safe phases rather than duplicating extraction behavior.
- `src/features/knowledge/actions.ts` owns existing generic and Facebook capture extraction form actions plus approve-all behavior. Update those entrypoints to enqueue extract-only or confirmed extract-and-approve-all jobs and safely delegate to enqueue helpers.
- `src/features/knowledge/facebook-capture-review.ts` owns review transitions and safe error summaries. Reuse or extend it deliberately for in-progress/failed/succeeded states.
- `src/features/knowledge/facebook-capture-review-admin.ts` owns admin-gated target reads. Keep review/source resolution here or adjacent; authorize before exposing source IDs, raw text presence, linked cards, or active job context.
- `src/features/ai/gateway.ts`, `src/features/ai/models.ts`, `src/features/ai/prompts.ts`, and `src/features/usage/events.ts` already provide the provider adapter, model catalog, prompt version, and usage persistence path. Worker code should reuse them.
- Existing tests `tests/facebook-capture-extraction-action.test.ts`, `tests/facebook-capture-approve-all-action.test.ts`, `tests/knowledge-draft-extraction.test.ts`, and `tests/ai-usage-events.test.ts` are the closest regression anchors.
- `src/features/ai/gateway.ts` currently uses a single `AI_GATEWAY_TIMEOUT_MS` with a 30-second default and 180-second maximum for non-streaming and streaming calls. This story should avoid accidentally changing chat/evaluation behavior while increasing extraction reliability.

### Current State Of Files Likely To Touch

- `src/db/schema.ts`: add extraction job table/status/mode enums and any review status enum change if `extracting` is persisted on `facebook_capture_reviews`.
- `drizzle/migrations/`: add generated migration and snapshot metadata.
- `src/features/knowledge/extraction.ts`: refactor synchronous extraction into enqueue/worker-safe execution phases and keep validation/audit/usage/approve-all behavior intact.
- Add a script-safe worker/core module if needed, for example under `src/features/knowledge/`, that contains DB/job/execution functions without Next-only imports. Keep server actions in `actions.ts` as Next-only wrappers.
- `src/features/knowledge/actions.ts`: change admin form actions to enqueue jobs and redirect with safe job/status params.
- `src/features/knowledge/facebook-capture-review.ts`: add or adapt transition support for in-progress/failed async state and safe status summaries.
- `src/features/knowledge/facebook-capture-review-admin.ts`: expose active job/in-progress context to detail reads if UI derives state from jobs.
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`: render in-progress/queued/failed retry states and disable duplicate extraction controls.
- `src/app/admin/knowledge/intake/page.tsx`: adapt generic extraction trigger/result copy if it currently waits synchronously.
- `scripts/knowledge-extraction-worker.ts`: add long-running worker entrypoint.
- `package.json`: add worker script command.
- `docs/` or `README.md`: document worker operation and deployment expectations.
- `tests/`: add or extend tests for job enqueue, worker processing, retry/failure, stale recovery, and UI states.

### UI And Copy Guidance

- In-progress label: `Đang trích xuất bằng AI`.
- Queued copy: `Yêu cầu trích xuất đã được đưa vào hàng đợi. Bạn có thể quay lại sau để xem bản nháp.`
- Running copy: `AI đang đọc nguồn này. Không cần bấm lại; hệ thống sẽ cập nhật khi hoàn tất.`
- Retryable failure copy: `Trích xuất lỗi tạm thời. Hệ thống sẽ thử lại tự động.`
- Terminal failure copy: `Không thể trích xuất nguồn này sau nhiều lần thử. Bạn có thể kiểm tra nội dung capture hoặc thử lại thủ công.`
- Keep all copy Vietnamese-first. Do not expose provider errors, raw text, prompts, or stack traces.

### Scope Boundaries

- Do not add a hosted queue service, Redis, or new deployment service dependency.
- Do not move the app into a monorepo or split Knowledge into a separate service.
- Do not introduce public route-triggered extraction as the primary async mechanism.
- Do not rely on Next.js `after()` as the durable job mechanism.
- Do not import Next-only server action modules from the worker script.
- Do not keep the provider call inside a long database transaction.
- Do not remove existing extraction validation, raw-source leak protection, confidence clamping, duplicate blocking, audit, or usage recording.
- Do not make unreviewed or Facebook-derived content retrievable for travelers, except when the explicitly confirmed async approve-all mode approves cards through the existing Story 4.1E guardrails.

### Testing Requirements

- Use Vitest and existing DB helpers in `tests/helpers/db.ts`; do not introduce a new test framework.
- Tests must mock AI Gateway/fetch and must not require real provider credentials.
- DB-backed tests may need to run sequentially while debugging because this suite shares a test database.
- Baseline verification remains `pnpm lint`, `pnpm typecheck`, `pnpm test:run`, and `pnpm build` after targeted tests pass.

### Verification Commands

- `pnpm db:generate`
- Add and run a worker-focused test file, for example `pnpm test:run tests/knowledge-extraction-worker.test.ts`
- Add and run approve-all async coverage if separate, for example `pnpm test:run tests/knowledge-extraction-worker-approve-all.test.ts`
- `pnpm test:run tests/facebook-capture-extraction-action.test.ts`
- `pnpm test:run tests/facebook-capture-approve-all-action.test.ts`
- `pnpm test:run tests/knowledge-draft-extraction.test.ts`
- `pnpm test:run tests/ai-usage-events.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm build`

### Previous Story Intelligence

- Story 4.2 added raw-text source extraction into draft cards and established the core safety invariant: raw text goes to the AI Gateway only inside server-only extraction, action responses and audits carry safe IDs/counts only, and malformed provider output fails closed.
- Story 4.2 follow-up review made duplicate extraction locking atomic, tightened raw-source leak checks, required route/location on drafts, and added DB JSON-shape checks. Async final writes must preserve these safeguards.
- Story 4.1D connected Facebook capture detail to extraction and fixed stale review-state rechecks under the source advisory lock before provider calls. Async enqueue and worker processing must preserve stale-state and duplicate blocking, but the provider call should no longer run in the admin request.
- Story 4.1E added extract-and-approve-all with explicit confirmation and atomic approval guardrails. If this story changes that path, it must not silently approve unconfirmed async output or leave partial approve-all success.
- Story 5.9 standardized AI usage event semantics. Worker provider calls must preserve success/failure usage records and avoid coupling operational job state to raw provider payload storage.

### Latest Technical Information

- Current stack: Next.js 15.3.5 App Router, React 19.1.0, TypeScript 5.8.3, Drizzle 0.44.5, PostgreSQL, Vitest, `tsx` scripts, and OpenAI-compatible AI Gateway adapter/model catalog.
- The observed failure shape is a 30-second abort: `latencyMs` around `30007`, `timeoutMs` `30000`, `reason` `AbortError`, and no HTTP status. Async worker should still increase extraction timeout and add retry; async alone only removes the admin request timeout.
- Existing `src/features/ai/gateway.ts` timeout behavior is controlled by `AI_GATEWAY_TIMEOUT_MS`, default `30000`, clamped from `1000` to `180000`. Prefer adding extraction-specific timeout control or proving global timeout change is acceptable.

### References

- `_bmad-output/project-context.md`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-1-MVP-Runtime-Is-A-Next.js-Modular-Monolith`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-2-PostgreSQL-Owns-Product-State-And-Retrieval-State`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-3-Drizzle-Owns-Schema-And-Migrations`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6-Mutations-Are-Server-Side-And-Audited`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7A-Facebook-Capture-Is-Operator-Controlled-And-Raw-Material-Only`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-10-AI-Gateway-Access-Is-Adapter-Based-And-Source-Bundled`
- `_bmad-output/implementation-artifacts/spec-4-2-ai-extracts-knowledge-drafts-from-source.md`
- `_bmad-output/implementation-artifacts/4-1d-extract-draft-knowledge-from-reviewed-facebook-capture.md`
- `_bmad-output/implementation-artifacts/4-1e-extract-and-approve-all-captured-facebook-drafts-with-guardrails.md`
- `_bmad-output/implementation-artifacts/spec-5-9-record-ai-usage-events.md`
- `src/features/knowledge/extraction.ts`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/facebook-capture-review.ts`
- `src/features/knowledge/facebook-capture-review-admin.ts`
- `src/features/ai/gateway.ts`
- `src/features/ai/models.ts`
- `src/features/usage/events.ts`
- `src/db/schema.ts`
- `package.json`

## Dev Agent Record

### Agent Model Used

gpt-5.5-review

### Debug Log References

- `pnpm db:generate` passed.
- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed.
- `pnpm test:run tests/knowledge-extraction-worker.test.ts` passed.
- `pnpm test:run tests/facebook-capture-extraction-action.test.ts` passed.
- `pnpm test:run tests/facebook-capture-approve-all-action.test.ts` passed.
- `pnpm test:run` passed: 32 files, 410 tests.
- `pnpm knowledge:extraction-worker --once` loads script/env, but local direct run requires the target `DATABASE_URL` database to have migration `0031_broad_grandmaster.sql` applied; the attempted local DB run failed on missing `knowledge_extraction_jobs` relation before migration.

### Completion Notes List

- Added a PostgreSQL-backed durable extraction job table with bounded statuses/modes, safe operational metadata, job-owned result draft IDs, and indexes for claiming/recovery/lookups.
- Changed admin extraction and Facebook capture approve-all actions to enqueue jobs and return safe redirect state instead of waiting for AI Gateway calls.
- Added worker-safe extraction execution that keeps provider calls outside long DB transactions while preserving prompt/model/parser/validation/audit/usage behavior and final duplicate rechecks.
- Added a long-running `pnpm knowledge:extraction-worker` process with `--once`, atomic PostgreSQL claiming, retry/backoff, stale-running recovery, and graceful shutdown handling.
- Added extraction-specific AI Gateway timeout configuration through `AI_GATEWAY_EXTRACTION_TIMEOUT_MS` without changing chat/evaluation defaults.
- Updated Facebook capture detail UI to show Vietnamese queued/running extraction state and disable duplicate extract / approve-all submissions while active jobs exist.
- Added focused enqueue, worker, approve-all idempotency, stale recovery, and worker import coverage; full regression passed.

### File List

- `.env.example`
- `README.md`
- `_bmad-output/implementation-artifacts/spec-ops-1-async-knowledge-extraction-worker.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0031_broad_grandmaster.sql`
- `drizzle/migrations/meta/0031_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `package.json`
- `scripts/knowledge-extraction-worker.ts`
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx`
- `src/db/schema.ts`
- `src/features/ai/gateway.ts`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/extraction-jobs.ts`
- `src/features/knowledge/extraction.ts`
- `src/features/knowledge/facebook-capture-review-admin.ts`
- `tests/facebook-capture-approve-all-action.test.ts`
- `tests/facebook-capture-extraction-action.test.ts`
- `tests/knowledge-extraction-worker.test.ts`

## Change Log

- 2026-07-14: Created ready-for-dev story for durable async knowledge extraction via long-running worker.
- 2026-07-14: Validated story and tightened worker script-safety, approve-all idempotency, duplicate cross-mode blocking, in-progress status, and extraction timeout requirements.
- 2026-07-14: Implemented async PostgreSQL-backed extraction jobs, worker processing, async approve-all, UI in-progress state, operations docs, and test coverage; moved story to review.

## Open Questions

- None.
