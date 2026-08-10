---
story_id: 19-5
status: ready-for-dev
created: 2026-08-10
epic: 19
---

# Story 19.5: Defer, Skip, and Verify Candidate Decision Safety

## Story

As an operator,
I want safe alternatives to acceptance and reliable review recovery,
so that the queue reflects deliberate decisions without duplicate intake or inaccessible actions.

## Acceptance Criteria

1. **Given** an authorized operator selects `Để sau` or `Bỏ qua`, **when** the corresponding audited command succeeds, **then** only the current Discovery review state changes from `pending` to respectively `deferred` or `skipped`.
   - The candidate leaves the immediate active-review queue and only bounded, policy-allowed Discovery history/audit remains.
   - Validate and lock the exact existing association at command time: `pending` review state, its same-candidate immutable `consider` recommendation, and a run with non-null query-proposal provenance.
   - A missing, inactive, stale, or concurrently decided association returns non-disclosing `404` without a state write or audit.
   - Do not introduce candidate, channel, or query blocking/exclusion, an exclusion list, a query pause, a ranking-policy change, or a new review-state table.

2. **Given** an Accept, defer, or skip command completes, **when** the review queue refreshes, **then** it re-fetches the server-owned active ranked result set and selects the first remaining server-ranked eligible candidate.
   - Reuse the existing full-refresh and selection-generation fences from Accept. Do not derive a client-only next item from stale local rows.
   - If no active candidate remains, render the established calm completion state and move focus to its queue heading/completion state; do not substitute Mission or Health work.
   - Keep Accept submitted/duplicate/failed/reconciling behavior intact, including selected-detail retention and server reconciliation. Defer/Skip never submit or reconcile a Knowledge handoff; they only enforce the existing unresolved-handoff read guard.

3. **Given** focused unit, serial integration, API-contract, and UI-accessibility tests run, **when** they exercise authorization, stale/concurrent decisions, submitted/duplicate/failed/unknown Accept outcomes, retry/reconciliation, keyboard focus, live feedback, and narrow reflow, **then** only authorized valid transitions persist and manual capture remains separate.
   - No test path permits Defer/Skip to create Knowledge sources or other Knowledge state beyond the existing Accept intake result.
   - Tests prove no direct/indirect Gemini or `youtube:capture` invocation, scheduling, enqueueing, or retry behavior.

## Tasks / Subtasks

- [ ] Define closed Defer/Skip contracts and port methods (AC: 1, 3)
  - [ ] Add exact-empty-JSON request parsers and the route-specific closed result parsers below to `packages/contracts/src/youtube-discovery/index.ts`. The browser passes only `recommendationId` in the route; reject bodies containing URL, candidate, state, reason, audit, or Knowledge data.
  - [ ] Add narrow `deferReview(principal, recommendationId)` and `skipReview(principal, recommendationId)` methods to `AdminYoutubeDiscoveryPort`. Do not add a generic command framework or extend query-proposal command unions.
  - [ ] Return route-specific exact closed success results: Defer returns `{ outcome: "deferred" }`; Skip returns `{ outcome: "skipped" }`. Add `AdminYoutubeDiscoveryDeferReviewResult`, `AdminYoutubeDiscoverySkipReviewResult`, and exact parsers that reject every extra field and every outcome not valid for that route. Do not serialize canonical URL, candidate/recommendation state, audit ID, source/capture IDs, or diagnostics.

- [ ] Implement one audited, transaction-safe Discovery transition seam (AC: 1, 3)
  - [ ] In `packages/database/src/admin-youtube-discovery.ts`, use one small private helper restricted to `"deferred" | "skipped"`, with explicit public port methods.
  - [ ] Reuse Accept's active association lock/revalidation predicate and `UPDATE ... WHERE state = 'pending'` compare-and-swap. The winning transaction writes exactly one `youtube_discovery_candidate_review` audit event with actor attribution and bounded `{ decision }` summary.
  - [ ] Return `null` for every non-winning/missing/inactive association. Never report a decision as successful merely because a row is already terminal.
  - [ ] Do not create, update, delete, or reconcile `youtube_discovery_knowledge_handoffs`, and do not call `knowledgeHandoff.submit` from a new Defer/Skip command. Before either transition, perform only the narrow existing read-side guard required to reject an association with an unresolved/reconciling Discovery handoff; it must return `null` with no review-state write or audit. Preserve the existing queue/detail read reconciliation and its owner-owned `lookup` behavior; do not generalize, alter, or trigger it as a Defer/Skip side effect. No migration is expected because `youtube_discovery_candidate_review_states` already supports both terminal states.

- [ ] Expose matching protected Nest commands (AC: 1, 3)
  - [ ] Add `POST /v1/admin/knowledge/youtube-discovery/review/:recommendationId/defer` and `/skip` to `apps/api/src/admin/admin-youtube-discovery.controller.ts`.
  - [ ] Preserve `@RequiresAdminCapability("admin.knowledge.write")`, `@AllowsAdminBrowserSession()`, exact `{}` parsing, route-ID validation, principal forwarding, and safe response parsing.
  - [ ] Preserve guard-owned `401`, role denial, and `403 csrf_invalid`. Map malformed route/body to `400 validation_error`, absent/inactive/non-reviewable association to `404 not_found`, and adapter/parser failure to `503 internal_error` without historical-state disclosure.

- [ ] Wire Defer/Skip into the established review workbench (AC: 1-3)
  - [ ] Replace only the disabled `Để sau` and `Bỏ qua` previews in `apps/admin/app/knowledge/youtube-discovery-review/review.tsx`; keep the queue-plus-inspector workbench and narrow sequential detail behavior.
  - [ ] Reuse one narrowly scoped client decision transport/recovery path for all terminal Discovery decisions where appropriate, while keeping Accept's Knowledge-specific reconciling semantics and copy isolated.
  - [ ] Use the existing credentialed, no-store, exact-Origin, request-ID, CSRF-protected POST pattern. Preserve 401 sign-in redirect and fail closed on malformed responses.
  - [ ] Disable all three actions while any decision is pending or server-projected Accept reconciliation is active. Keep detail context visible until terminal Defer/Skip success; announce pending/success/failure through the existing polite live region without dialogs or focus-stealing toasts.
  - [ ] Add concise Vietnamese pending/success/failure copy in `review-copy.ts`. Skip is immediate with no confirmation dialog in this slice.
  - [ ] After a successful Defer/Skip, clear selection only under the current operation/selection fences, refresh active reviews, retain terminal feedback through refresh, select the first item of the refreshed server-ranked queue when available, and otherwise retain the calm completion view with predictable focus.

- [ ] Verify complete decision, boundary, and accessibility safety (AC: 3)
  - [ ] Extend DB-free contract tests for exact command/result shapes and unsafe extra-field rejection. Assert Defer accepts only `{ outcome: "deferred" }`, Skip accepts only `{ outcome: "skipped" }`, and both parsers reject cross-route outcomes, empty/partial results, and every additional field. Extend UI boundary tests for Defer/Skip endpoint-only transport, action disablement, stale operation fencing, Vietnamese copy, live status, keyboard-labelled controls, 44px controls, and narrow queue/detail focus return.
  - [ ] Extend serial PostgreSQL tests with `resetTestDatabase()` in local setup: one valid transition for each decision; exactly one audit; inactive detail/queue exclusion; repeated/double-click/concurrent Defer-vs-Skip races; no write/audit on stale/accepted/deferred/skipped/missing/non-reviewable rows; immutable recommendation preservation; and no Knowledge handoff row/port/source/capture side effect. Include a pending review with a persisted reconciling Knowledge-handoff marker: both Defer and Skip return the non-disclosing stale/not-found result, make no review-state or audit write, and never invoke `knowledgeHandoff.submit`; existing queue/detail read-side reconciliation remains covered separately.
  - [ ] Extend API integration tests for operator success/principal forwarding, anonymous/traveler/CSRF denial, exact-body enforcement, 404 non-disclosure, 503 safety, and closed response bodies for both routes.
  - [ ] Retain and run regression coverage for Accept submitted, duplicate, failed, reconciling, retry, and fresh-read reconciliation; Story 19.5 must not weaken its admission, audit, cursor, or UI race fences.
  - [ ] Run focused DB-free tests with `pnpm test:unit`, focused serial PostgreSQL/API tests with `pnpm test:integration`, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact blockers without weakening unit/integration separation.

## Dev Notes

### Scope and sequence

- Stories 19.1-19.4 are complete. Story 19.2 owns immutable deterministic recommendation; Story 19.3 owns the single durable review association/read projection; Story 19.4 owns Accept and Knowledge intake reconciliation. This story owns only Defer/Skip, shared active-queue recovery, and cross-action safety verification.
- Keep the three state concepts separate: immutable recommendation (`skip | defer | consider`), mutable review state (`pending | accepted | deferred | skipped`), and Discovery run state. Never derive a decision from current ranking/history or mutate a recommendation.
- Epic 20 owns the broader action queue, Mission, and Health surfaces. Do not build a generic action queue, dashboard, filtering policy, blocking mechanism, or control-tower navigation in this story.

### Architecture and ownership guardrails

- Discovery is URL-only. It must not write `sources`, capture versions, ingestion jobs, evidence, cards, publication state, or a Knowledge source link. It must not invoke Gemini or invoke, schedule, enqueue, or retry `youtube:capture`.
- Defer/Skip are Discovery-only audited transitions. They must not mutate, submit, or reconcile the Story 19.4 Knowledge handoff ledger; the sole permitted interaction is the existing read guard that rejects an unresolved handoff before transition.
- Use the established API/domain/database ownership: contracts in `packages/contracts`, port in `packages/domain`, PostgreSQL transaction/audit in `packages/database`, Nest transport in `apps/api`, and typed presentation in `apps/admin`. Do not add direct database/domain imports to the admin app.
- Persist/project only bounded safe operational information. Do not expose raw comments, model prompts/responses, provider data, source/capture IDs, transcripts, media, credentials, cookies, raw source material, evidence spans, or traveler data.
- Candidate/channel/query blocking and exclusion are explicitly deferred. `deferred` and `skipped` decide one exact review association only; neither means suppress, never show again, disable a query, nor change eligibility.

### Existing implementation to preserve

- `packages/database/src/admin-youtube-discovery.ts` defines the authoritative active predicate: pending review state, linked immutable `consider` recommendation, and run query provenance. Reuse it for command lock/revalidation and preserve its keyset cursor behavior.
- Accept's `finalizeAcceptedReview`, `reconcileActiveReviews`, and `youtubeDiscoveryKnowledgeHandoffs` are Knowledge-intake-specific. Do not generalize them into Defer/Skip or alter their retention/reconciliation semantics without a demonstrated regression.
- `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` already owns `queueGeneration`, `selectionGeneration`, detail fencing, Accept operation fencing, status preservation, and narrow focus transitions. Reuse these guards; prior Accept repairs showed stale async handlers can otherwise mutate a newer selection.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` provides the only correct route namespace, capability/session guards, safe envelope conventions, and contracts seam.

### UX and accessibility guardrails

- Keep Vietnamese-first direct operational copy. `Accept`, `Để sau`, and `Bỏ qua` are explicit labelled buttons; no hover-only action or dialog for Defer/Skip.
- Keep a practical desktop queue-plus-inspector workbench and all functions in narrow sequential layout without two-dimensional scrolling. Status cannot rely on color alone.
- After terminal action, move focus to the next selected queue row; when empty, move it to queue heading/completion state. Toasts and polite live announcements must not steal focus.
- Do not present rank, recommendation, prior-capture outcome, or a decision as correctness, verification, capture completion, publication, or traveler retrieval.

### Testing requirements

- Unit tests are database-free. PostgreSQL tests use `DATABASE_URL_TEST`, remain serial, and each clean-state integration test calls `resetTestDatabase()` locally.
- The full integration command may retain unrelated baseline failures; run the narrow relevant serial suite first and record any wider blocker exactly. Do not loosen test boundaries, add global resets, or enable integration parallelism.
- No external-library research is required: this story reuses the current TypeScript, React, NestJS, Drizzle, and Vitest seams without adding or upgrading a dependency.

### Project Structure Notes

- Expected changed paths: `packages/contracts/src/youtube-discovery/index.ts`, `packages/domain/src/youtube-discovery/admin.ts`, `packages/database/src/admin-youtube-discovery.ts`, `apps/api/src/admin/admin-youtube-discovery.controller.ts`, `apps/admin/app/knowledge/youtube-discovery-review/review.tsx`, `apps/admin/app/knowledge/youtube-discovery-review/review-copy.ts`, and focused contract/API/UI/integration tests.
- No migration, schema table, Worker adapter, AI Gateway/Gemini configuration, canonicalizer, Knowledge persistence, capture script/runbook, recommendation policy, or Epic 20 surface should change unless implementation identifies a concrete required defect.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 19 and Story 19.5]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1, AD-2, AD-5, AD-6, and AD-7]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/DESIGN.md#Components]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/EXPERIENCE.md#Candidate queue, Candidate inspector, State Patterns, and Interaction Primitives]
- [Source: _bmad-output/implementation-artifacts/19-3-review-one-ranked-candidate-at-a-time.md#Existing implementation to preserve]
- [Source: _bmad-output/implementation-artifacts/19-4-accept-a-candidate-through-knowledge-intake.md#Existing implementation to preserve]
- [Source: packages/contracts/src/youtube-discovery/index.ts]
- [Source: packages/domain/src/youtube-discovery/admin.ts]
- [Source: packages/database/src/admin-youtube-discovery.ts]
- [Source: apps/api/src/admin/admin-youtube-discovery.controller.ts]
- [Source: apps/admin/app/knowledge/youtube-discovery-review/review.tsx]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story artifact, Epic 19 context, predecessor Story 19.1-19.4 analysis, architecture, UX, current implementation seams, and recent Git history analyzed on 2026-08-10.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story scope is intentionally limited to existing Discovery decision seams; the pre-existing review-state schema already represents `deferred` and `skipped`.
- Validation completed on 2026-08-10: the story now preserves the unresolved Accept-handoff fence, specifies exact route-specific Defer/Skip result contracts, and requires server-ranked refresh selection rather than a local successor calculation.
- No implementation, migration, database reset, test execution, or commit was performed while creating this story.

### File List

- _bmad-output/implementation-artifacts/19-5-defer-skip-and-verify-candidate-decision-safety.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
