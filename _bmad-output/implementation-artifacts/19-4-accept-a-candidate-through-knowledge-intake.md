---
story_id: 19-4
status: ready-for-dev
created: 2026-08-10
epic: 19
---

# Story 19.4: Accept a Candidate Through Knowledge Intake

## Story

As an operator,
I want to accept a useful candidate directly from Discovery,
so that its canonical URL enters the existing Knowledge intake workflow without Discovery taking ownership of capture.

## Acceptance Criteria

1. **Given** an authorized operator selects an active reviewable candidate, **when** they use immediate `Accept`, **then** the audited Discovery command hands exactly that server-resolved canonical URL to the existing Knowledge one-URL/seed-batch intake boundary.
   - The browser supplies only the selected immutable `recommendationId`; it cannot supply, replace, or edit the URL.
   - Validate and lock the exact review-state association at command time: it must still be `pending`, reference the same candidate's immutable `consider` recommendation, and retain non-null query-proposal provenance. A missing, inactive, stale, or concurrently decided association fails without calling Knowledge intake or disclosing historic state.
   - Discovery does not directly write `sources`, capture versions, ingestion jobs, evidence, cards, publication state, or a Knowledge source link/ID. It does not invoke Gemini or execute, invoke, schedule, enqueue, or retry `youtube:capture`.
   - Use the established role/cookie/Origin/CSRF command boundary, `admin.knowledge.write` capability, request principal, and safe audit writer. `apps/admin` remains a typed API client only.

2. **Given** Knowledge intake produces a terminal one-URL `submitted` outcome, **when** Accept completes, **then** Discovery atomically transitions the already-locked review state to `accepted` and writes one bounded safe audit event.
   - The active review projection excludes the candidate after the state transition.
   - Return only the typed submitted outcome and this exact Vietnamese feedback: `Đã thêm URL vào nguồn chờ xử lý. Bạn vẫn cần chạy YouTube Capture thủ công.`
   - Do not claim capture, evidence, cards, verification, publication, or traveler retrieval occurred.

3. **Given** Knowledge intake produces a terminal one-URL `duplicate` outcome, **when** Accept completes, **then** Discovery atomically transitions the review state to `accepted`, writes one bounded safe audit event, and returns a distinct duplicate outcome.
   - The feedback is `URL này đã có trong nguồn chờ xử lý hoặc đã được lưu trước đó.`
   - Do not infer capture state, expose a source identifier, or direct the operator to run capture again.

4. **Given** an intake invocation is interrupted, unavailable, malformed, or otherwise ambiguous, **when** the command outcome is not durably known, **then** the command/UI enters the distinct reconciling state `Đang kiểm tra kết quả thêm URL` before retry can be exposed.
    - Knowledge owns the durable one-URL handoff ledger: it binds an opaque retry-stable identity to one canonical URL and actor/owner context, atomically records admission and terminal outcome, and exposes only a closed owner-side lookup. Discovery may retain only its opaque handoff reference and a safe `reconciling` marker; it must never retain a Knowledge batch/source identifier, capture state, or lifecycle link.
    - The active review queue/detail projection exposes a closed safe action availability state so a pending-but-reconciling candidate remains visible but cannot expose Accept after reload or a new session. The server resolves/reconciles the original handoff before it can project that candidate as actionable again.
    - Unknown/reconciling results do not transition the review state to `accepted`, do not create a second source/intake attempt, and do not claim a source or capture exists.
   - A confirmed terminal intake failure preserves the same candidate as `pending` and reviewable, returns only safe retry/recovery feedback, and writes no accepted audit outcome.

5. **Given** the inspector renders an Accept command, **when** a request is pending or reconciling, **then** Accept, `Để sau`, and `Bỏ qua` are disabled while the safe candidate context remains visible.
    - Accept is immediate and opens no confirmation dialog. Use polite live feedback and non-blocking toast/inline state without stealing focus.
    - On confirmed `submitted` or `duplicate`, this story removes/refetches the accepted candidate and selects the first remaining active candidate, or shows the established calm empty/completion state. This behavior belongs to Accept; Story 19.5 must reuse it for Defer/Skip.
    - Wire only Accept in this story. `Để sau` and `Bỏ qua`, their commands, and generic stale/concurrent decision recovery belong to Story 19.5.

## Tasks / Subtasks

- [ ] Define the narrow, idempotent Knowledge handoff seam (AC: 1-4)
  - [ ] Extend the existing Knowledge intake domain contract rather than introducing Discovery-owned source persistence or calling an HTTP endpoint from the database adapter. Knowledge owns a one-URL handoff ledger whose seam accepts exactly one canonical URL, request actor/owner context, and retry-stable opaque handoff identity, returning a closed result: `submitted`, `duplicate`, `failed`, or `reconciling`.
  - [ ] Preserve `submitAdminKnowledgeSeedBatch(...)` and the public `POST /v1/admin/knowledge/seed-batches` batch behavior for existing callers. A Knowledge-owned one-URL adapter may reuse its normalization, advisory-lock, source insert, and batch-item behavior, but must durably record/retrieve the handoff result without exposing `batchId` or `sourceId` to Discovery/browser code.
  - [ ] Give the Knowledge ledger a unique opaque handoff identity plus canonical URL and actor/owner binding. It must reject mismatched/malformed lookup and cannot use source existence or aggregate counters alone to resolve an interrupted attempt. Discovery stores at most its opaque reference and a safe reconciling marker, never a Knowledge ID/link, source ID, capture state, provider data, or a second source lifecycle.
  - [ ] For one URL, classify terminal aggregate counters exactly: only `(submitted=1, duplicate=0, failed=0)` is submitted; only `(0,1,0)` is duplicate; only `(0,0,1)` is failed. Any malformed, mixed, incomplete, unavailable, or missing result is reconciling, never success.

- [ ] Add the focused audited Discovery Accept command (AC: 1-4)
  - [ ] Extend `AdminYoutubeDiscoveryPort` with a typed `acceptReview(principal, recommendationId)` command and a closed result parser in `packages/contracts/src/youtube-discovery/index.ts`. Do not extend the existing query-proposal command union for this distinct review action.
  - [ ] In `packages/database/src/admin-youtube-discovery.ts`, lock and revalidate the exact review-state/recommendation/candidate/run tuple before first intake admission. Preserve Story 19.3's `pending` + `consider` + query-provenance predicate; never choose a latest recommendation or recalculate eligibility/ranking at runtime.
  - [ ] Serialize same-candidate Accept operations with the review-state row lock/CAS and a durable handoff identity. A second click/request must join/reconcile the first operation rather than initiate another intake submission or create another accepted audit event.
  - [ ] After a confirmed `submitted` or `duplicate`, transition only `pending -> accepted` and write the decision audit in the same Discovery transaction. This atomicity applies to the Discovery transition plus audit, not to the independently committed Knowledge handoff; the durable Knowledge ledger and Discovery opaque reference are the recovery bridge between those transactions. Audit actor, target, action, timestamp, and bounded summary may contain the decision and closed intake outcome only; exclude source IDs, capture state, raw errors, provider payloads, and raw source material.
  - [ ] On confirmed `failed`, retain `pending`. On `reconciling`, preserve the pending review row and persist/reuse only the safe opaque reconciliation marker required to resolve it. Extend the active review projection with a closed safe action state so reloads render it non-actionable until server-side reconciliation reaches a terminal outcome. Do not implement defer/skip transitions.
  - [ ] Inject the Knowledge handoff port at API composition in `apps/api/src/main.ts`; do not construct a Knowledge table reader in the controller/Discovery adapter or reuse Worker composition.

- [ ] Expose the protected API command (AC: 1-4)
  - [ ] Add a POST route below the existing `v1/admin/knowledge/youtube-discovery/review/:recommendationId` namespace in `apps/api/src/admin/admin-youtube-discovery.controller.ts`. Require exactly JSON `{}`: missing, `null`, array, malformed JSON, or an object with any key is `400 validation_error`. Use the existing `@RequiresAdminCapability("admin.knowledge.write")` and `@AllowsAdminBrowserSession()` guards.
  - [ ] Parse route/body/result through `@xuyenviet/contracts`. Keep response data to the closed command outcome only; do not return a batch ID, source ID, canonical URL, candidate ID, capture state, or internal diagnostic.
  - [ ] Preserve safe envelopes: malformed ID/body is `400 validation_error`; absent/inactive/non-reviewable state is `404 not_found`; unavailable/unsafe command infrastructure is `503 internal_error`; browser CSRF/origin failures remain guard-owned `403 csrf_invalid`. A confirmed intake `failed` or `reconciling` result is a typed safe command response, not a fabricated 503.

- [ ] Wire immediate Accept into the existing review inspector (AC: 2-5)
  - [ ] Replace only Story 19.3's disabled Accept preview in `apps/admin/app/knowledge/youtube-discovery-review/review.tsx`. Leave `Để sau` and `Bỏ qua` disabled previews for Story 19.5.
  - [ ] Follow established admin mutation transport: credentialed `POST`, `cache: "no-store"`, `x-request-id`, exact browser Origin, and session-bound CSRF nonce from `GET /auth/csrf`. Preserve the existing 401 sign-in redirect and fail closed on an unparseable result.
  - [ ] Disable every inspector action while the request or server-projected handoff is pending/reconciling; keep the selected detail rendered. On reload, do not expose retry for a reconciling candidate until the server resolves it. Announce pending, reconciling, submitted, duplicate, and confirmed failure through the existing polite status region. Do not open a dialog or let a toast move focus.
  - [ ] Submitted shows the exact manual-capture reminder; duplicate shows only duplicate-specific feedback; failure retains the selected candidate and a safe retry affordance. On submitted/duplicate, refetch active reviews, remove the accepted candidate, and select the first remaining candidate or render the established completion state. Extract/reuse this narrow success-recovery behavior so Story 19.5 can apply it after Defer/Skip.

- [ ] Verify ownership, idempotency, outcomes, and UI safety (AC: 1-5)
  - [ ] Add DB-free contract/unit tests for exact `{}` Accept request parsing, all closed outcomes and safe action availability states, malformed/mixed one-item counter rejection, Vietnamese submitted/duplicate/failure/reconciling copy, and no source/capture/batch/internal fields in browser results.
  - [ ] Add serial PostgreSQL integration tests for Knowledge-ledger identity/actor/canonical-URL binding and durable lookup; active-state admission, row lock/CAS behavior, canonical URL server derivation, submitted/duplicate atomic Discovery `accepted` plus one safe audit, failed retention as pending, concurrent duplicate click idempotency, timeout/unknown reconciliation that remains non-actionable after a fresh review read, and rejected stale/deferred/skipped/already-accepted commands with no intake call.
  - [ ] Test the negative boundary at persistence and composition seams: Discovery never inserts/updates `sources` directly, never retains a Knowledge source ID/link, and never invokes/schedules/retries `youtube:capture` or Gemini.
  - [ ] Extend API integration coverage for anonymous `401`, non-operator `403`, invalid CSRF `403`, malformed ID/body `400`, inactive state non-disclosure `404`, typed confirmed failure/reconciling, safe `503`, and principal-to-audit attribution.
  - [ ] Extend admin UI tests for immediate no-dialog Accept, JSON `{}` plus CSRF transport, action disablement during pending/reconciling including a reloaded server-projected reconciling candidate, retained detail, polite live outcomes, submitted-only capture reminder, duplicate no-capture instruction, confirmed-failure retry, successful queue refetch/next selection or completion state, and no request path for defer/skip/capture.
  - [ ] Run focused DB-free tests with `pnpm test:unit` and focused serial PostgreSQL/API tests with `pnpm test:integration`. Every clean-table integration file must call `resetTestDatabase()` in local setup.
  - [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`; record exact failures/blockers without weakening test project separation.

## Dev Notes

### Scope and sequence

- Story 19.3 is complete and supplied the durable `youtube_discovery_candidate_review_states` association plus safe queue/detail reads. Its state has exactly `pending | accepted | deferred | skipped`, while recommendations remain immutable. Reuse this association; do not add a second review table, replace its recommendation, or derive active review from score/history.
- Story 19.4 exclusively owns immediate Accept, its success recovery, the Knowledge handoff outcome matrix, and its required audited/idempotent reconciliation seam. Story 19.5 owns Defer/Skip, reuse of the success-recovery behavior after those decisions, and broad stale/concurrent action verification. Do not preempt either scope.
- Story 19.4 owns success recovery for Accept: after submitted/duplicate it refetches active reviews and selects the first remaining candidate or completion state. Story 19.5 reuses that behavior after its Defer/Skip commands; it does not defer successful Accept navigation.
- The existing public seed-batch response exposes only aggregate counts and currently does not identify an interrupted one-URL request. It is insufficient by itself to truthfully reconcile an unknown outcome. Knowledge owns the smallest internal one-URL handoff ledger/lookup contract necessary to make the outcome durable and retry-safe; do not expose its internal identity through the browser API. Discovery may only persist the opaque reference plus safe reconciling state needed to keep a review non-actionable across reload.

### Architecture and ownership guardrails

- Discovery is URL-only. Knowledge exclusively owns `sources`, seed batch items, capture versions, ingestion, evidence, cards, publication, and capture eligibility internals. Discovery calls an owned port, never a Knowledge table/query or direct source writer.
- Manual `youtube:capture` remains the only operator-controlled Gemini video-analysis workflow. Accepted means only Knowledge intake returned submitted or duplicate.
- Keep Discovery persistence and mutations server-side, PostgreSQL/Drizzle-backed, and audited. Use `youtube_discovery_*` naming for any genuinely necessary Discovery-owned durable handoff/reconciliation record.
- Persist and return bounded safe operational data only. Never serialize raw comments, prompts/responses, provider diagnostics/payloads, source/capture IDs or internals, transcripts, media, credentials, cookies, raw source material, evidence spans, or traveler data.
- Keep role and CSRF enforcement at the existing Nest browser-session boundary. `apps/admin` has no database/domain ownership and must use typed direct API clients.

### Existing implementation to preserve

- `packages/domain/src/admin-knowledge-intake.ts` and `packages/database/src/admin-knowledge-intake.ts` are the only existing seed-batch command path. The database implementation normalizes URLs, uses a per-canonical-URL advisory lock, inserts sources only in Knowledge, and returns aggregate counts. Reuse it or extract a narrow owner-owned handoff primitive; do not duplicate its canonicalization/dedupe logic in Discovery.
- `packages/domain/src/youtube-discovery/admin.ts`, `packages/database/src/admin-youtube-discovery.ts`, and `apps/api/src/admin/admin-youtube-discovery.controller.ts` are the Discovery admin port, adapter, and transport seam. Extend these rather than creating a controller, route root, repository, or generic command layer.
- `apps/api/src/main.ts` constructs both existing ports. Use this composition root for explicit dependency injection.
- `drizzle/migrations/0057_add_discovery_candidate_review_state.sql` establishes active pending review association and rollout trigger. Preserve its backfill/runtime invariant and the active read predicate in `admin-youtube-discovery.ts`.
- `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` already owns selected detail, narrow-layout focus, status live region, and disabled action previews. Preserve its Vietnamese-first workbench visual language and existing direct read transport patterns.

### UX and accessibility guardrails

- Accept is a primary green immediate action, never a confirmation dialog. While pending/reconciling, preserve the inspector context and disable all actions. Feedback is concise, Vietnamese, text-based, and polite-live announced; toast feedback never replaces persistent state or steals focus.
- Submitted copy must be exact and mention manual YouTube Capture. Duplicate copy must be distinct and never imply an existing capture. Failure must leave the candidate reviewable. Unknown must visibly reconcile before retry is possible.
- Do not make numeric ranking context, prior-capture outcome, or duplicate intake status appear as verification, credibility, source correctness, capture completion, or publication.
- Desktop/tablet queue-plus-inspector and narrow sequential layout are established. Do not redesign the workspace or introduce a dashboard/modal/sheet solely for Accept.

### Testing requirements

- Unit tests are DB-free. Integration tests use `DATABASE_URL_TEST`, stay serial, and every clean-table test file calls `resetTestDatabase()` locally. Do not introduce global reset or integration parallelism.
- Treat command outcome safety as a full-stack contract: prove parsers, API envelopes, persisted state/audit, composition injection, and UI rendering. A client-only assertion cannot prove authorization, source-write isolation, or idempotency.
- Include post-commit/timeout ambiguity in tests. A mere retry yielding Knowledge duplicate is not reconciliation proof unless the original command is durably linked, resolved exactly once, and yields stable Discovery/audit behavior.

### Project Structure Notes

- Expected touched paths: `packages/contracts/src/youtube-discovery/index.ts`, `packages/domain/src/youtube-discovery/admin.ts`, the smallest appropriate Knowledge intake domain/database seam, `packages/database/src/admin-youtube-discovery.ts`, `apps/api/src/main.ts`, `apps/api/src/admin/admin-youtube-discovery.controller.ts`, `apps/admin/app/knowledge/youtube-discovery-review/review.tsx`, focused tests, and a forward migration only if durable Discovery handoff/reconciliation state is required.
- Do not change Worker adapters, Discovery triage/recommendation/ranking, canonicalizer behavior, Knowledge capture scripts/runbooks, or source/capture lifecycle semantics. Do not modify defer/skip commands or a generalized action queue recovery flow.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 19.4]
- [Source: _bmad-output/implementation-artifacts/epic-19-context.md#Requirements & Constraints]
- [Source: _bmad-output/implementation-artifacts/19-3-review-one-ranked-candidate-at-a-time.md#Scope and sequencing and Existing implementation to preserve]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1, AD-2, AD-6, and AD-7]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/EXPERIENCE.md#Component Patterns, State Patterns, and Interaction Primitives]
- [Source: packages/domain/src/admin-knowledge-intake.ts]
- [Source: packages/database/src/admin-knowledge-intake.ts]
- [Source: packages/domain/src/youtube-discovery/admin.ts]
- [Source: packages/database/src/admin-youtube-discovery.ts]
- [Source: apps/api/src/admin/admin-youtube-discovery.controller.ts]
- [Source: apps/admin/app/knowledge/youtube-discovery-review/review.tsx]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story artifact, implementation, architecture, UX, and prior-story analysis completed 2026-08-10.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- The guide locks the current one-URL intake ambiguity behind a minimal idempotent, owner-owned reconciliation seam; it prohibits inferred acceptance after a timeout or direct Discovery Knowledge writes.
- No implementation, migration, database reset, test execution, or commit was performed while creating this story.

### File List

- _bmad-output/implementation-artifacts/19-4-accept-a-candidate-through-knowledge-intake.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
