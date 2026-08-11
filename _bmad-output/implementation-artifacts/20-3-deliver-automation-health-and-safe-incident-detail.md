---
story_id: 20-3
status: ready-for-dev
created: 2026-08-11
epic: 20
---

# Story 20.3: Deliver Automation Health and Safe Incident Detail

## Story

As an operator,
I want to understand whether Discovery is operating and where it is blocked,
so that I can respond to persistent failures without exposing sensitive operational data.

## Acceptance Criteria

1. **Given** an authorized operator opens Automation Health, **when** safe Discovery projections are available, **then** they show enabled state, last/next run, most recent safe result, stage throughput, review backlog/deferred age, provider/rate-limit/schema incidents, and usage telemetry when available.
   - Incident state distinguishes retrying, terminal failed, and rate-limited work, with next-attempt context when available.
   - Health is a readable operations workbench, not a raw event stream, KPI-card wall, chart dashboard, or a second Action Required queue.
   - Global policy enablement is projection-only in this story. Story 20.4 exclusively owns the enable/disable command and its switch UI.
2. **Given** an operator drills into a run or incident, **when** affected records are displayed, **then** the detail contains only safe candidate/run identity, closed stage, timestamp, retry/terminal state, and stable safe error category.
   - A syntactically valid incident route identifier is not admission proof. Unknown, cleared, malformed, or unavailable incident detail is a safe `404 { code: "not_found" }` without rendering or echoing the supplied identifier.
   - Never infer a run stage from ranking history when no durable run-stage value exists. Render an explicit unavailable stage instead.
   - Never return, render, log, or include in errors raw comments, raw source material, source/capture IDs, provider payloads/diagnostics, prompts/responses, credentials/cookies, transcripts/media, evidence spans, AI Ask/traveler content, or Knowledge state.
3. **Given** Health has not run, has no incidents, is stale, or its projection is unavailable, **when** the Health surface renders, **then** it distinguishes each state, shows last-updated time when known, and offers safe reload/recovery.
   - Missing, unavailable, incomplete, or stale telemetry is never displayed as healthy operation or as a zero metric.
   - No-run/first-run, no-incident, retrying, rate-limited, terminal-failed, stale, and unavailable are distinct closed UI/contract states with Vietnamese-first text plus non-color status cues.

## Tasks / Subtasks

- [ ] Define exact bounded Health contracts (AC: 1-3)
  - [ ] Extend `packages/contracts/src/youtube-discovery/index.ts` with separate exact-key types/parsers for `HealthOverview`, `HealthIncidentGroup`, `HealthIncidentDetailPage`, and `HealthTelemetry`, plus a dedicated versioned opaque cursor when a detail page has multiple affected records. Keep the overview aggregate and paginated incident detail as separate response shapes.
  - [ ] Use only closed states/categories/stages and canonical millisecond ISO UTC timestamps. Reject extra keys, malformed IDs/cursors/timestamps, unbounded lists/text, unknown codes, and prohibited raw fields. Cursor parsing must reject malformed, stale, and version-incompatible anchors with `400 validation_error`; it must never silently truncate a multi-row result.
  - [ ] Define `freshness: current | stale | unavailable` server-side for every overview/telemetry aggregate. Include `asOf` and `lastUpdatedAt` when known. State the deterministic stale cutoff in the contract: use the current policy cadence for planning freshness and the relevant enabled-query cadence for query-run freshness; unavailable policy/schedule or missing required timestamp is `unavailable`, not `stale` or healthy.
  - [ ] Make Health aggregates explicit server-owned current snapshots or bounded recent-window values. Document every interval, selection/order tuple, and `asOf` timestamp in the response contract; do not create an analytics history table, a telemetry event stream, or a new persistence model merely to serve this story.
  - [ ] Define overview schedule/result ownership explicitly: project the singleton planning lease/outcome as planning schedule/result, and due-query runs as a separate query-run schedule/result. For each, specify the deterministic latest ordering (`terminalAt`/`createdAt`, then stable ID), no-run representation, and next scheduled value. Do not combine a current planning result with a blocked query run into one misleading healthy result.
  - [ ] Project stage throughput only as a bounded aggregate of durable ranking-history candidate stages, with an explicit interval and `asOf`; it is never a per-run stage or a stage inferred for an individual run. Affected-record detail renders its durable run stage only when one exists; otherwise it returns the explicit unavailable stage.
  - [ ] Project usage only as bounded aggregate telemetry for linked `youtube_discovery_triage` runs. Define its fixed recent window and safe fields (event count, available token totals, and cost availability) and distinguish `available`, `missing`, and `incomplete_pricing`/`incomplete_usage` states. Never turn absent Usage rows into zero cost, healthy provider operation, or a provider/model/request-ID projection.

- [ ] Add side-effect-free Health projections to the Discovery admin port (AC: 1-3)
  - [ ] Extend `packages/domain/src/youtube-discovery/admin.ts` with read-only Health methods and a dedicated Health cursor validation error. Keep Health in the existing `AdminYoutubeDiscoveryPort`; do not create a generic cross-domain repository or add an admin-owned database/data-domain seam.
  - [ ] Implement the PostgreSQL projections in `packages/database/src/admin-youtube-discovery.ts`, composing existing versioned policy, planning/run records, ranking history, candidate review state, and linked Usage rows. No migration is expected: existing durable Discovery and Usage fields are the default substrate. Stop for a narrow design decision if a required safe metric cannot be derived deterministically.
  - [ ] Reuse `groupedIncidents` semantics for persistent failures and rate-limit clearance. Provider rate limits are actionable immediately; schema/execution incidents require the persisted run-policy threshold/window; a later successful run clears a rate-limit group according to the existing logic. Ordinary retrying work remains visible in Health but is not automatically an Action Required alert.
  - [ ] Preserve the existing opaque Health group identity `${queryProposalId}:${incidentCategory}` from `groupedIncidents`; add a closed parser for its URL-decoded form. A syntactically valid identifier is admitted only while the server recomputes the same grouped incident under current persisted threshold/window and clearance rules. Cleared, expired, malformed, or unavailable groups return `null` to the controller and become safe `404` responses.
  - [ ] Keep recommendation (`skip | defer | consider`), candidate state (`pending | accepted | deferred | skipped`), and run state (`queued | running | retrying | completed | failed | cancelled`) independent. A deferred candidate is not a run failure; a terminal run is never reopened.
  - [ ] Every Health read is select-only. It must not call `listReview()` or `reconcileActiveReviews()`, call Knowledge handoff/capture eligibility, write an audit, change review state, create a source, invoke/schedule/retry `youtube:capture`, claim/schedule/retry Worker work, or call YouTube/Gateway providers.

- [ ] Expose protected safe Health endpoints (AC: 1-3)
  - [ ] Add focused GET endpoints under `AdminYoutubeDiscoveryController`, such as `GET /health` and `GET /health/:actionId?cursor=<opaque>`, while preserving its controller-level `@RequiresAdminCapability("admin.knowledge.write")` and `@AllowsAdminBrowserSession()` safeguards.
  - [ ] Require strict allowed query/path keys and parse every port response before returning it. Validate the decoded Health group ID before port admission. Malformed input or stale cursor maps to `400 { code: "validation_error" }`; unavailable/cleared detail maps to `404 { code: "not_found" }`; port failure or unsafe response maps to `503 { code: "internal_error" }`.
  - [ ] Preserve authorization before port admission: anonymous callers receive the established `401`, travelers receive `403`, and no Health owner/repository work starts before the guards succeed.
  - [ ] Do not modify candidate decision routes, Knowledge intake handoff, query commands, CSRF command transport, Worker adapter logic, policy mutation, or the `/mission` contracts/routes in this story.

- [ ] Replace Health placeholders with typed Vietnamese-first Health views (AC: 1-3)
  - [ ] Replace `apps/admin/app/knowledge/youtube-discovery/health/page.tsx` and `health/[actionId]/page.tsx`; remove the current raw route-ID echo. Add focused client presentation under the same folder using the established credentialed `no-store` fetch, request ID, strict parse-before-render, `401` Google sign-in recovery, abort/stale-response fencing, polite live status, reload, and focus-restoration patterns from the Action Required and Mission surfaces.
  - [ ] Show enabled/disabled state, schedule context, safe last result, stage throughput, review/deferred backlog, grouped incidents, telemetry availability/freshness, and clear last-updated context. Use direct Vietnamese copy such as `Đang bật`, `Đang tắt`, `Chưa có lần chạy`, `Dữ liệu sức khỏe chưa sẵn sàng`, `Dữ liệu có thể đã cũ`, and `Discovery đang bị giới hạn bởi nhà cung cấp. Hệ thống sẽ thử lại theo lịch.`
  - [ ] Health links to a detail only for server-admitted incident records. Detail renders only contract-approved safe fields and supports explicit paginated load-more when applicable; it does not expose a raw event feed or a client-computed provider diagnosis.
  - [ ] Preserve map-paper/green/amber admin styling, borders before shadows, text plus non-color state cues, visible focus, 44px controls, `min-w-0`, and sequential narrow/mobile reflow without two-dimensional scrolling. Do not add a new admin shell, modal workflow, chart library, infinite scrolling, policy editor, or enablement switch.

- [ ] Verify Health contracts, ownership, authorization, safety, and accessibility (AC: 1-3)
  - [ ] Extend `tests/admin-youtube-discovery-contract.test.ts` with exact Health shapes, closed unions, canonical time/opaque cursor bounds, stale/no-run/no-incident/unavailable distinctions, next-attempt constraints, and forbidden-field rejection including provider payload/diagnostic, provider request/model IDs, source/capture IDs, prompts/responses, evidence, and traveler fields.
  - [ ] Add `tests/youtube-discovery-health.integration.test.ts` as a serial PostgreSQL suite. Each clean-table case calls `resetTestDatabase()` locally and proves deterministic schedule/result, throughput, pending/deferred backlog, retrying/rate-limit/schema/execution incident behavior, rate-limit clearance after later success, safe detail pagination/order, bounded Usage aggregation, and every Health read's zero side effects by snapshotting audits, review states, handoffs, policy, runs, and Usage before/after.
  - [ ] Extend `tests/admin-youtube-discovery-api.integration.test.ts` for operator success; anonymous `401`; traveler `403`; authorization-before-port-admission; malformed action/cursor/extra keys `400`; unknown detail safe `404` without ID echo; unsafe/invalid port results `503`; and exact bodies without prohibited fields.
  - [ ] Add `tests/admin-youtube-discovery-health-ui.test.ts` to `vitest.config.ts` `unitTests`. Prove endpoint-specific credentialed reads, strict parsing, no POST/intake/capture/decision requests, safe route detail, reload and `aria-live` feedback, distinct Vietnamese states, visible focus/labels/44px controls, `min-w-0` sequential reflow structure, and stale response fencing.
  - [ ] Run DB-free checks using `pnpm test:unit`; run PostgreSQL/API checks using serial `pnpm test:integration`; then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Do not make unit tests depend on a database, add a global reset hook, or enable integration parallelism.

## Dev Notes

### Scope and sequencing

- Story 20.1 created only the Health route handoff placeholders. Replace them rather than layering another Health surface beside them. Story 20.2 intentionally left expanded incidents, provider/rate-limit diagnosis, telemetry freshness, and Health recovery to this story.
- Story 20.4 owns the audited global Discovery enable/disable control. Health reads the persisted policy state and explains it, but does not add a mutation, switch, policy editor, fencing command, or cancellation UI.
- Story 20.5 owns end-to-end and cross-control-tower accessibility evidence. This story still must follow existing focused accessibility patterns and preserve all authorized functions at narrow widths.
- Discovery remains URL-only. It never writes Knowledge sources, capture versions, ingestion jobs, evidence, cards, publication state, or a Knowledge source link; it never invokes, schedules, or retries manual `youtube:capture`.

### Existing implementation to preserve

- `packages/contracts/src/youtube-discovery/index.ts` is the exact-key, closed-union, bounded projection and opaque-cursor model. Follow its Action Required, Mission, and review parser patterns rather than adding permissive schema parsing.
- `packages/database/src/admin-youtube-discovery.ts#groupedIncidents` is the current authoritative incident grouping/clearance logic. Reuse it rather than reimplementing thresholds or determining health from raw provider errors.
- Health overview must distinguish the singleton planning lease/outcome from due-query runs. Use the deterministic server-owned selection and freshness rules in the contract; do not compress independent schedules into one healthy/not-healthy label.
- Ranking history is permitted only for bounded aggregate candidate-stage throughput. It must never supply a missing individual run stage or appear as a raw history/event feed.
- `aiUsageEvents` contains sensitive provider/model/request identity fields. Health reads only linked `youtube_discovery_triage` aggregate usage for its documented recent window and emits closed availability/cost states, never individual Usage rows.
- Existing action-queue Health links use `${queryProposalId}:${incidentCategory}`. Treat that as an opaque, server-admitted incident-group identity, validate only its decoded closed form, and never echo it in an unavailable/not-found response.
- `packages/database/src/admin-youtube-discovery.ts#listReview` has reconciliation side effects. Health must never reuse it; side-effect-free Mission projections demonstrate the required select-only pattern.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` is the sole Discovery admin route namespace. Preserve its guard, strict validation, safe envelope, and parse-before-return approach.
- `apps/admin/app/knowledge/youtube-discovery/queue.tsx` and `mission/mission.tsx` establish direct credentialed API reads, `no-store`, request IDs, strict contract parsing, sign-in recovery, AbortController request fencing, `aria-live`, load-more focus retention, and Vietnamese admin visual language.
- Existing data sources are `youtubeDiscoveryPolicyVersions`, planning/run records, `youtubeDiscoveryRankingHistory`, candidate review/recommendation state, and `aiUsageEvents` linked to a Discovery run. Keep Health an aggregate projection, not a new raw-history store.

### Project Structure Notes

- Expected production paths: `packages/contracts/src/youtube-discovery/index.ts`; `packages/domain/src/youtube-discovery/admin.ts`; `packages/database/src/admin-youtube-discovery.ts`; `apps/api/src/admin/admin-youtube-discovery.controller.ts`; and focused Health route/components under `apps/admin/app/knowledge/youtube-discovery/health/`. Update `apps/api/src/main.ts` only if a clearly bounded existing-owner composition is required.
- Expected tests: `tests/admin-youtube-discovery-contract.test.ts`; `tests/youtube-discovery-health.integration.test.ts`; `tests/admin-youtube-discovery-api.integration.test.ts`; `tests/admin-youtube-discovery-health-ui.test.ts`; and `vitest.config.ts` unit registration.
- No dependency, migration, provider integration, Worker loop, generic repository, raw event/telemetry store, charts, dashboard framework, policy editor, switch command, Knowledge writer, source/capture link, capture scheduler, or blocking/exclusion policy is permitted by this story.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 20 and Story 20.3]
- [Source: _bmad-output/implementation-artifacts/epic-20-context.md#Requirements & Constraints]
- [Source: _bmad-output/implementation-artifacts/20-2-deliver-knowledge-mission-drill-downs.md#Scope and sequencing]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1 through AD-8]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/EXPERIENCE.md#Automation Health and State Patterns]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/DESIGN.md#Layout & Spacing and Components]
- [Source: packages/contracts/src/youtube-discovery/index.ts]
- [Source: packages/domain/src/youtube-discovery/admin.ts]
- [Source: packages/database/src/admin-youtube-discovery.ts#groupedIncidents]
- [Source: apps/api/src/admin/admin-youtube-discovery.controller.ts]
- [Source: apps/admin/app/knowledge/youtube-discovery/queue.tsx]
- [Source: apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx]
- [Source: tests/youtube-discovery-mission.integration.test.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story analysis completed 2026-08-11 using the full sprint status, Epic 20 context, Story 20.2 completion/review intelligence, Discovery architecture and UX, current contracts/domain/database/API/admin seams, focused test patterns, and recent Git history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story status is ready-for-dev. No implementation, migration, database reset, test execution, or commit was performed while creating this story.
- The guide locks Health as a safe, side-effect-free aggregate read model, reuses existing incident grouping semantics, requires explicit stale/unavailable states, and leaves global enablement mutation to Story 20.4.
- Story validation applied 2026-08-11: contract bounds, zero-write isolation, guarded API failure mapping, raw-ID non-disclosure, usage/telemetry ambiguity handling, UI request fencing, and unit/integration boundaries are explicit.
- Story validation applied 2026-08-11: Health freshness is server-owned and deterministic; planning and due-query schedule/result ownership is separate; grouped-incident admission uses the existing opaque identity and clearance semantics; throughput and Usage aggregation have explicit safe ownership/window boundaries.

### File List

- _bmad-output/implementation-artifacts/20-3-deliver-automation-health-and-safe-incident-detail.md
