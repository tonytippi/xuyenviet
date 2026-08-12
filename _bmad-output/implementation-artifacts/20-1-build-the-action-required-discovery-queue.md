---
story_id: 20-1
status: done
created: 2026-08-11
epic: 20
---

# Story 20.1: Build the Action-Required Discovery Queue

## Story

As an operator,
I want Discovery to open on the work that needs my attention,
so that I can act quickly without scanning a noisy dashboard or routine history.

## Acceptance Criteria

1. **Given** an authorized operator opens Discovery, **when** the default action queue loads, **then** it renders a short, server-owned, action-only worklist containing only:
   - reviewable pending `consider` candidates, with a single escalation label when a high-priority candidate has exceeded its review-age threshold;
   - stalled high-priority Mission needs;
   - persistent Discovery failures, repeated schema failures, or safely classified provider rate limits; and
   - safe links to high-impact open Knowledge recommendations.
   - Ordinary deferrals, skipped/accepted candidates, routine successful runs, one-off transient retries, raw history, metrics, and KPI-card walls do not appear.
2. **Given** an action-queue item is selected, **when** it represents a candidate, Mission need, Health incident, or Knowledge recommendation, **then** it opens the matching candidate review workspace, Mission surface, Health surface, or existing Knowledge recommendation surface.
   - Candidate links select the exact active `recommendationId` only after the existing server detail admission succeeds.
   - Mission and Health may introduce only a focused safe landing/detail shell needed to receive an action-queue route; Story 20.2 owns Mission drill-down/read models and Story 20.3 owns Health dashboards, trends, and incident detail expansion.
   - Discovery never verifies, publishes, suppresses, resolves, or otherwise mutates a Knowledge claim.
3. **Given** no action-required work remains or the queue is paged/navigated with keyboard or assistive technology, **when** the queue renders, **then** it shows a calm completion state or announces its exact result range with predictable focus.
   - The completion state links to Mission and Health without inventing work or replacing the worklist with KPIs.
   - Rows have visible focus, explicit Vietnamese labels/type/status text, 44px minimum targets, and narrow sequential reflow without two-dimensional scrolling.

## Locked Initial Policy Values

- `highPriorityMaximum = 20`: smaller numeric priority is more urgent; only priorities `1..20` can be escalated as high priority.
- `maximumOperatorReviewAgeHours = 72`: a pending review is still reviewable before this time; it receives an age escalation after it, not a different eligibility state or duplicate queue row.
- `maximumMissionStallHours = 48`: a high-priority safe Mission need is stalled when its owner projection reports no enabled linked query, global Discovery disabled, or no safe progress since this threshold.
- A high-impact Knowledge recommendation is only an open `risk` or `relation` recommendation with priority `1..20`. It is a link to Knowledge, never a Discovery decision.
- A non-rate-limit incident is persistent only after at least two terminal failures for the same query and safe failure category within 24 hours. A safely classified provider rate limit is action-required immediately and remains so until a later successful run for that query/category.
- These priority thresholds and queue ordering apply only to this action projection: smaller numeric values are more urgent. Do not change existing Discovery planning/merge priority behavior in this story.
- Persist these values on the versioned Discovery policy and include only bounded values in its audit summary. Do not hard-code thresholds in React, scripts, or scattered database queries.

## Tasks / Subtasks

### Review Findings

- [x] [Review][Patch] Surface typed provider rate limits while retrying [packages/database/src/admin-youtube-discovery.ts:47]
- [x] [Review][Patch] Preserve Mission action IDs in direct system-query creation [packages/database/src/youtube-discovery/index.ts:555]
- [x] [Review][Patch] Reconcile legacy system-query identities before adding Mission IDs to the digest [packages/domain/src/youtube-discovery/planning.ts:38]
- [x] [Review][Patch] Bound and paginate each action-queue source rather than loading all historical rows [packages/database/src/admin-youtube-discovery.ts:44]
- [x] [Review][Patch] Keep the unavailable queue state distinct from a successful empty completion state [apps/admin/app/knowledge/youtube-discovery/queue.tsx:35]
- [x] [Review][Patch] Reject non-canonical Mission cursor urgency [packages/database/src/youtube-discovery-mission-action-frontier.ts:15]
- [x] [Review][Patch] Exclude cancelled runs from action-required incident events [packages/database/src/admin-youtube-discovery.ts:419]

- [x] Extend the versioned Discovery policy and closed operational classification (AC: 1)
  - [x] Add one forward Drizzle migration, schema fields, constraints, contracts, policy creation/update paths, and audit summary fields for the five locked policy values above. Preserve existing policy-version/run snapshot semantics; a run/action projection must use its applicable policy version, not environment defaults.
  - [x] Apply the policy version explicitly by item type: candidate age uses its immutable `consider` recommendation's `policyVersionId`; an incident uses each grouped run's `policyVersionId`; Mission stalled/global enablement uses the current owner-safe policy projection; Knowledge inclusion is its owner projection's fixed open `risk|relation` and `1..20` filter, not a guessed historical Discovery policy. Do not add an artificial policy snapshot to Knowledge recommendations in this story.
  - [x] Add a closed run-safe incident category vocabulary and forward storage needed to retain its classification through retry to the terminal run. It must include at least `provider_rate_limited`, `triage_schema_invalid`, and a non-rate-limit terminal execution category; never infer any category from provider error text. Map only typed provider/rate-limit and triage-parser outcomes to their corresponding category; ordinary unknown/transient execution failures remain non-rate-limit.
  - [x] Use `queryProposalId` plus safe incident category as an incident group identity. A rate-limit group is actionable from its first classified run and clears only after a later successful run for that same query proposal; a non-rate-limit group is actionable only after two terminal rows in the preceding 24 hours. A null query-proposal run is never an action-queue incident in this slice.
  - [x] Retain no provider error body, raw model output, prompt/response, credential, or provider payload. A queue item maps only a closed category to Vietnamese copy.

- [x] Publish owner-safe Mission and Knowledge action inputs (AC: 1, 2)
  - [x] Add narrow read-only owner ports for the action queue: a Knowledge-owned projection for current high-priority Mission needs and high-impact Knowledge recommendation links, and a Discovery-owned projection for candidate review and incidents. Do not let Discovery query Knowledge tables directly, add a cross-domain repository export, or persist raw source/evidence/traveler content in Discovery.
  - [x] The Mission owner must publish a stable bounded opaque Mission need ID; do not route with `targetDigest` or synthesize an ID from mutable query text. Its projection exposes only that ID, closed label/reason code, priority, created/progress timestamp, and closed stalled reason. It determines stalled status from locked policy/current safe owner state, including the exact enabled-linked-query, global-disabled, and no-safe-progress cases, not client clocks or guessed target-digest joins.
  - [x] The Knowledge-link projection exposes only the existing recommendation ID, safe bounded display label, work type, priority, and creation time. Use a server-owned closed fallback label when an owner-safe title is unavailable; do not derive title/summary from raw card, source, evidence, or recommendation notes. Exclude resolved/superseded/non-`risk`/non-`relation` recommendations.
  - [x] Wire the ports explicitly in the Nest composition root. `apps/admin` remains a typed API client and no new direct database/domain import is allowed there.

- [x] Add a strict, read-only Discovery action-queue contract and projection (AC: 1)
  - [x] Extend `packages/contracts/src/youtube-discovery/index.ts` with an exact-key, bounded paginated action-queue response. Set a fixed server page size and use one closed item union for `candidate_review`, `mission_need`, `health_incident`, and `knowledge_recommendation`; lock exact shared/item-specific keys, bounded Vietnamese-mappable display label/context, ISO timestamp precision, closed destination/reason/status/urgency codes, and safe stable/group IDs. An item exposes only its destination's validated opaque ID; candidate uses `recommendationId`, Mission/Health use their owner-safe action ID, and Knowledge uses `recommendationId`.
  - [x] Add `listActionRequired(principal, cursor)` to `AdminYoutubeDiscoveryPort` and implement it in `packages/database/src/admin-youtube-discovery.ts` with injected owner ports. Keep reads bounded, deterministic, and side-effect-free: action-queue reads must not reconcile handoffs, write audits, mutate candidate state, create a source, or execute/retry Worker work.
  - [x] Reuse the existing active candidate predicate exactly: `pending` review state, same-candidate immutable `consider` recommendation, and non-null query provenance. Calculate the 72-hour review age from immutable active `consider` recommendation `createdAt`, not candidate creation time. Include an eligible candidate once even when it is aged; represent escalation in its closed reason/status rather than duplicate rows.
  - [x] Order by closed urgency group, then smaller priority, then normalized oldest relevant timestamp, item kind, then stable ID. The cursor must retain that complete canonical tuple and its contract version; timestamp source is recommendation creation for candidates/Knowledge, Mission progress-or-created time for Mission, and first grouped classified failure time for incidents. Reject malformed, stale-anchor, or version-incompatible cursors with `400 validation_error`.
  - [x] Derive persistent incident grouping from only safe `queryProposalId`/category/timestamp rows. Never call generic `retry_exhausted` a rate limit. Exclude ordinary `retrying`, one-off non-rate-limit terminal failures, completed/cancelled work, policy-revoked cancellations, and all null-query-proposal runs.

- [x] Expose the protected endpoint and destination routes (AC: 1, 2)
  - [x] Add `GET /v1/admin/knowledge/youtube-discovery/action-required?cursor=<opaque-cursor>` to the existing `AdminYoutubeDiscoveryController`. Reuse `@RequiresAdminCapability("admin.knowledge.write")`, `@AllowsAdminBrowserSession()`, principal forwarding, strict query parsing, exact response parsing, and safe `401`/`403` guard behavior.
  - [x] Map malformed input/cursor to `400 { code: "validation_error" }`; unsafe projection/adapter failure to `503 { code: "internal_error" }`; never return a partial or diagnostic fallback.
  - [x] Add `/knowledge/youtube-discovery` as the default Discovery landing route and replace the current Discovery navigation entry with it. Preserve `/knowledge/youtube-discovery-review` as the candidate workspace.
  - [x] Support safe deep links: candidate destination carries only `recommendationId`; Knowledge uses its existing recommendation route; Mission and Health receive only their safe action IDs. Validate all route input and show a concise unavailable/not-found state rather than rendering unvalidated IDs or data.

- [x] Build the Vietnamese-first action worklist (AC: 1-3)
  - [x] Add a focused client component under `apps/admin/app/knowledge/youtube-discovery/` using credentialed, `no-store`, request-ID `GET` transport, existing `401` sign-in redirect behavior, and contract parsing before state/rendering.
  - [x] Render a short ordered list, not cards/charts/metric tiles. Each row states its work type, concise safe reason, priority/date context, and one explicit link/action to its owner surface. Use text alongside any tonal treatment; warning color means a persistent failure/rate limit, never video correctness.
  - [x] Provide loading, unavailable, paginated/load-more, and calm-empty states. Announce the loaded result range through a polite live region. Keep focus on load-more after append; after page navigation, move focus predictably to the queue heading or first result without focus-stealing toasts.
  - [x] Preserve the admin map-paper/green/amber visual language, border-first queue rows, visible focus, 44px controls, and `min-w-0` sequential narrow/mobile reflow. Do not introduce a dashboard aesthetic, a modal, a new admin shell, or an infinite scroll feed.

- [x] Verify policy, ownership, safety, routing, and accessibility boundaries (AC: 1-3)
  - [x] Add DB-free contract tests for exact action-queue/cursor shapes, closed codes, duplicate candidate suppression, invalid/stale cursor rejection, bounded fields, and prohibited-field rejection.
  - [x] Add serial PostgreSQL integration coverage with local `resetTestDatabase()` for 72-hour candidate escalation, owner-supplied Mission and Knowledge inclusion/exclusion, two-failure/24-hour incident escalation, immediate classified rate-limit escalation, later-success clearance, stable ordering/paging, stale cursor rejection, and zero queue-read writes.
  - [x] Add API tests for operator success, anonymous/traveler denial, authorization before port admission, malformed cursor `400`, unsafe adapter `503`, and safe exact bodies.
  - [x] Add admin UI boundary tests for default navigation, safe endpoint-only GET transport, each destination, no candidate decision POST/capture/Knowledge mutation, Vietnamese empty/range copy, live status, focus, visible labels, 44px controls, and narrow structural reflow.
  - [x] Run focused DB-free tests with `pnpm test:unit`, focused serial PostgreSQL/API tests with `pnpm test:integration`, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact blockers without weakening unit/integration isolation or enabling parallel integration workers.

## Dev Notes

### Scope and sequencing

- Epic 19 is complete. Reuse its active review association, exact contracts, strict parsers, API controller, workbench, concurrency fences, and safe candidate projection. Do not recalculate recommendation, change `Accept`/Defer/Skip, or duplicate the review workbench.
- Story 20.2 owns full Knowledge Mission views and traceability; Story 20.3 owns Automation Health metrics, trends, and expanded incident details; Story 20.4 owns the global switch; Story 20.5 owns cross-control-tower E2E/accessibility evidence. This story creates only the action-queue landing and minimal typed route handoff needed by its rows.
- The accepted policy values are an initial operational baseline for high-volume discovery. They must be configurable only through the existing audited, versioned policy path and reviewed after operational evidence, not treated as permanent architecture constants.

### Architecture and ownership guardrails

- Discovery is URL-only. It must not write `sources`, capture versions, ingestion jobs, evidence, cards, publication state, or a Knowledge source link. It must never invoke, schedule, enqueue, or retry `youtube:capture`.
- Worker owns Discovery execution, retry, provider calls, and run transitions. API/admin action-queue reads are projections only.
- Keep contracts in `packages/contracts`, owner ports/policies in `packages/domain`, persistence in `packages/database`, Nest transport/composition in `apps/api`, and typed presentation in `apps/admin`.
- Persist/render only bounded safe operational information. Never expose raw comments, prompts/responses, provider diagnostics/payloads, source/capture IDs, transcripts, media, credentials, cookies, raw source material, evidence spans, or traveler/AI Ask content.
- Candidate recommendation, mutable review state, run state, incident category, and Knowledge recommendation state are distinct. A candidate score/recommendation is never correctness, verification, capture completion, publication eligibility, or a Knowledge decision.

### Existing implementation to preserve

- `packages/database/src/admin-youtube-discovery.ts` owns the authoritative active-review predicate and keyset ordering. Its `listReview` reconciles unresolved Knowledge handoffs; the action queue must not call that reconciliation writer as a read side effect.
- `packages/contracts/src/youtube-discovery/index.ts` exact-key parser style and the existing review opaque-cursor implementation are mandatory patterns.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` is the only Discovery admin route namespace and owns safe envelopes.
- `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` owns candidate selection, detail/decision request fencing, live feedback, and narrow focus behavior. Extend it only for validated deep-link selection; retain its guarded server read and no client-side eligibility calculation.
- Existing `/knowledge/recommendations/[id]` is the only Knowledge recommendation destination. The action queue must link to it rather than copy its evidence/detail or add a Discovery mutation.

### Project Structure Notes

- Expected changed paths: a forward `drizzle/migrations/<next>_*.sql` and migration journal; `packages/database/src/schema.ts`; `packages/contracts/src/youtube-discovery/index.ts`; `packages/domain/src/youtube-discovery/admin.ts` plus narrow owner-port definitions; `packages/database/src/admin-youtube-discovery.ts`; current Worker safe failure classification seam; API composition/controller; `apps/admin/app/admin-access-gate.tsx`; new `apps/admin/app/knowledge/youtube-discovery/` route/component; and focused tests.
- No new dependency, service, database, provider integration, raw-history store, analytics dashboard, capture/runbook, blocking/exclusion policy, or generic cross-domain repository is permitted.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 20 and Story 20.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1 through AD-8 and Deferred]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/EXPERIENCE.md#Action queue, Health incident, State Patterns, Accessibility Floor]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/DESIGN.md#Layout & Spacing and Components]
- [Source: docs/proposals/ai-first-youtube-discovery.md#Control tower and implementation requirements]
- [Source: _bmad-output/implementation-artifacts/19-5-defer-skip-and-verify-candidate-decision-safety.md#Existing implementation to preserve]
- [Source: packages/contracts/src/youtube-discovery/index.ts]
- [Source: packages/domain/src/youtube-discovery/admin.ts]
- [Source: packages/database/src/admin-youtube-discovery.ts]
- [Source: apps/api/src/admin/admin-youtube-discovery.controller.ts]
- [Source: apps/admin/app/knowledge/youtube-discovery-review/review.tsx]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story analysis completed 2026-08-11 using the complete sprint status, Epic 20 requirements, Discovery architecture/UX, Epic 19 story intelligence, project context, current contracts/domain/database/API/admin seams, and recent Git history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Product decision confirmed 2026-08-11: initial high-volume discovery thresholds are high priority `1..20`, candidate review age `72` hours, Mission stall `48` hours, high-impact open Knowledge `risk`/`relation` at priority `1..20`, two same query/category terminal failures in `24` hours, and immediate safely classified rate-limit escalation.
- The guide requires these values in versioned/audited Discovery policy and prohibits UI hard-coding or rate-limit inference from generic failure text.
- Validation completed 2026-08-11: locked terminal incident vocabulary/mapping and query/category clearance semantics; required a durable owner-safe Mission ID/progress projection; scoped policy-version selection per item type; and specified closed queue contract, timestamp, ordering/cursor, priority, and Knowledge display fallback semantics.
- No implementation, migration, database reset, test execution, or commit was performed while creating this story.
- 2026-08-11: Started implementation. Added the versioned action-queue policy thresholds, forward migration, bounded queue contract/cursor, read-only queue projection, protected endpoint, owner-input adapter, and Vietnamese-first default Discovery worklist.
- 2026-08-11: `pnpm typecheck`, `pnpm lint` (0 errors; existing warnings), `pnpm build`, and `git diff --check` passed. The integration suite is blocked because its current database schema does not contain the new required action-queue policy columns; apply migration `0061_discovery_action_required_queue` to the integration database before rerunning.
- 2026-08-11: Do not mark complete yet. Worker mapping for typed provider rate-limit and triage-schema incidents, exact Mission stall ownership semantics, and the required persistence/accessibility integration coverage remain incomplete.
- 2026-08-11: Completed typed terminal incident propagation without message parsing, owner-decided Mission stall projection with durable opaque IDs, server-admitted review deep links, and fixed the malformed 0061 migration/journal entry. Focused static checks pass; full suite blockers remain recorded below.
- 2026-08-11: Added focused serial PostgreSQL action-queue coverage. `pnpm exec vitest run --project integration tests/youtube-discovery-action-required.integration.test.ts` passed (3 tests): active candidate age escalation without duplicate and write-free reads; typed rate-limit escalation and later-success clearance plus two terminal same-category failures; owner input inclusion/exclusion, deterministic ordering, cursor continuation, and stale-anchor rejection.
- 2026-08-11: Repaired confirmed Story 20.1 review findings and verified them with focused unit and serial integration tests. Action-queue inputs now use canonical ordering with fail-closed bounded capacity, rate-limit clearance compares against the latest classified failure, terminal categories survive retries and lease expiry, Knowledge uses the persisted action policy threshold, malformed/stale cursors are admitted before owner worklist reads, and Mission/Health handoff routes validate their opaque IDs before rendering.
- 2026-08-11: Verified follow-up review repairs: Mission stall projection now uses Knowledge-owned opaque needs composed with Discovery-owned enabled-link/latest-success state, mixed-version incidents use the latest run's persisted threshold semantics, the action queue contract is a closed discriminated union, and all queue sources paginate without a 500-row truncation/fail-closed path. Focused contract test passed (5 tests), serial integration test passed (6 tests), `pnpm typecheck` and `git diff --check` passed.
- 2026-08-11: Final review repair verified: removed the action-queue free-form `label` from owner inputs, persistence projection, public contract, and UI. The UI now renders only local Vietnamese closed reason copy, including `mission_no_enabled_query`. Focused unit tests passed (10 tests); serial action-queue/API integration tests passed (22 tests), including explicit anonymous `401` and traveler `403` admission checks for `GET action-required`; `pnpm typecheck` and `git diff --check` passed. No commit created.
- 2026-08-11: Code-review repair applied: typed provider rate limits appear while retrying; direct system proposals retain Mission action IDs; the planner adopts one compatible legacy system query before using its Mission-specific digest; and failed queue loads render an unavailable retry state instead of a false completion state. Focused unit tests passed (10 tests), focused serial integration/API tests passed (23 tests), `pnpm typecheck`, and `git diff --check` passed. The source-level database keyset pagination repair remains open because the current owner-port contract returns complete unpaged Mission/Knowledge projections; adding an arbitrary limit would silently omit action work.
- 2026-08-12: Investigated the remaining source-pagination review finding. A bounded candidate/Knowledge frontier is feasible, but Mission cannot be correctly keyset-paged through its current Knowledge-only port: its public Action Queue tuple orders by Discovery-owned `latestSuccessAt` or linked-query creation time, while the port can seek only Knowledge recommendation creation time. A bounded first Knowledge page can therefore omit a globally earlier stalled Mission need; iterating every owner page recreates the prohibited unbounded load. Incident grouping similarly needs a grouped SQL frontier rather than loading all run history. No production/test changes were retained because the attempted bounded-page implementation still loaded every page in-process. Completion requires an architecture decision authorizing a narrow, read-only composed Mission action-frontier port (Knowledge identity/eligibility plus Discovery progress), alongside grouped incident SQL pagination; the existing story rule forbids Discovery directly querying Knowledge tables or adding a cross-domain repository.
- 2026-08-12: User approved the narrow read-only composed Mission action-frontier. Implemented four source-bounded Action Queue frontiers: active candidates, grouped incidents, composed Mission needs, and Knowledge recommendations. Each applies the public global tuple cursor with millisecond UTC precision, returns at most `pageSize + 1`, and validates a stale cursor at its owning frontier before the bounded merge. The Mission adapter exposes only opaque action IDs, priority, closed stalled reason, and occurred time; it deliberately composes Knowledge Mission identity with Discovery query/run progress without exposing source, evidence, prompt, provider, or traveler data. Incident grouping now stays in SQL and preserves typed rate-limit clearance/reopen plus immutable failure threshold/window semantics.
- 2026-08-12: Final repair made Knowledge cursor admission exact: it now requires the same eligible open row, priority cap, urgency, outward millisecond timestamp, and action ID. Focused evidence passed serially: DB-free unit suite (341 tests); Action Queue integration (9 tests); Mission integration (2 tests); protected admin API integration (19 tests); `pnpm lint` (0 errors, 54 existing warnings); `pnpm typecheck`; `pnpm build`; and `git diff --check`. `pnpm test:integration -- <path>` was not used as final focused evidence because the script ignores path selectors and launches the whole shared-database suite; an earlier invocation timed out after 120 seconds. No migration, dependency, API route, Worker loop, Knowledge writer, capture scheduler, or direct admin database access was added.

### File List

- _bmad-output/implementation-artifacts/20-1-build-the-action-required-discovery-queue.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- apps/admin/app/admin-access-gate.tsx
- apps/admin/app/knowledge/youtube-discovery/page.tsx
- apps/admin/app/knowledge/youtube-discovery/queue.tsx
- apps/admin/app/knowledge/youtube-discovery/mission/page.tsx
- apps/admin/app/knowledge/youtube-discovery/mission/[actionId]/page.tsx
- apps/admin/app/knowledge/youtube-discovery/health/page.tsx
- apps/admin/app/knowledge/youtube-discovery/health/[actionId]/page.tsx
- apps/api/src/admin/admin-youtube-discovery.controller.ts
- apps/api/src/main.ts
- apps/api/src/main.ts
- drizzle/migrations/0061_discovery_action_required_queue.sql
- drizzle/migrations/meta/_journal.json
- packages/contracts/src/youtube-discovery/index.ts
- packages/database/src/admin-youtube-discovery.ts
- packages/database/src/index.ts
- packages/database/src/knowledge-discovery-action-inputs.ts
- packages/database/src/youtube-discovery-mission-action-frontier.ts
- packages/database/src/schema.ts
- packages/database/src/youtube-discovery/index.ts
- packages/domain/src/youtube-discovery/admin.ts
- packages/domain/src/youtube-discovery/policy.ts
- tests/admin-youtube-discovery-api.integration.test.ts
- tests/admin-youtube-discovery-contract.test.ts
- tests/admin-youtube-discovery-review-ui.test.ts
- tests/youtube-discovery-action-required.integration.test.ts
- tests/youtube-discovery-mission.integration.test.ts
