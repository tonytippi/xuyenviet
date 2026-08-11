---
story_id: 20-2
status: done
created: 2026-08-11
epic: 20
---

# Story 20.2: Deliver Knowledge Mission Drill-Downs

## Story

As an operator,
I want to trace Discovery needs from coverage gaps through queries to candidates,
so that I can understand why a URL matters before reviewing or accepting it.

## Acceptance Criteria

1. **Given** an authorized operator opens Knowledge Mission, **when** they select a Mission view, **then** they can inspect Coverage needs, Queries, Candidates, and the Discovery funnel as four distinct, server-owned, safe read models.
   - Coverage can organize a need only by safe corridor, location, route segment, taxonomy, and persisted seasonal context when available, plus closed freshness/conflict/demand context.
   - Do not infer season, geography, taxonomy, freshness, conflict, or demand from card/source prose, AI Ask content, raw comments, or client-side heuristics. A missing safe field renders as unavailable, not invented data.
   - Mission is a readable workbench, not a KPI-card wall, raw event stream, or Health dashboard.
2. **Given** a high-priority coverage or freshness need exists, **when** the operator opens its detail, **then** the server admits the current opaque Mission need and returns its linked system query proposal, its latest safe run context, and its ranked candidates.
   - Join an upstream Coverage need to Discovery only by its durable `missionActionId`; never match mutable `queryText`, `targetDigest`, or client-created identifiers.
   - Operator-created queries are intentionally unlinked: they appear only in the combined Queries view because the preserved create command carries no durable Mission association. Do not imply a text/digest/client-ID association or add one in this story.
   - A candidate entry exposes only a validated existing `recommendationId`. Render a link to the existing candidate-review workspace only when the server confirms the recommendation remains review-admissible (`pending` plus immutable `consider`); otherwise render it as a non-actionable trace record. Candidate detail admission and Accept/Defer/Skip remain authoritative in that workspace.
   - No raw AI Ask content, raw source material, comments, provider payloads, prompts/responses, evidence spans, capture/source IDs, credentials, cookies, transcripts, media, or traveler data is returned, rendered, logged, or included in an error.
3. **Given** the operator manages a query from Mission, **when** they create, edit, reprioritize, pause, or resume a simple query, **then** the UI distinguishes `Hệ thống đề xuất` from `Operator tạo`, displays reason, priority, enabled/paused state, and next run, and calls the existing role-protected Discovery query commands.
   - Preserve the established command policy: only operator-origin proposals allow text editing; system-origin proposals remain text-immutable but can be reprioritized, paused, or resumed through their existing commands.
   - Global-off and operator-paused states remain distinct. A globally paused enabled query has no next run and shows `Tạm dừng do Discovery đang tắt`; an operator-paused query shows `Tạm dừng bởi operator`.
   - Do not introduce advanced rule builders, blocking/exclusion policy, a second query aggregate, Worker configuration controls, client-owned writes, or a new Knowledge mutation path.

## Tasks / Subtasks

- [ ] Define exact, bounded Mission read contracts (AC: 1, 2)
  - [ ] Extend `packages/contracts/src/youtube-discovery/index.ts` with separate exact-key parsers/types for paginated Coverage, Queries, and Candidates views; Mission detail; safe linked-query/latest-run context; Mission candidate entries; and Funnel. Every multi-row projection uses a fixed server page size, opaque versioned keyset cursor, deterministic ordering tuple, `items`/`nextCursor` response shape, canonical ISO timestamps, and safe `400` rejection for malformed/stale/version-incompatible cursors. Never silently truncate.
  - [ ] Reuse `AdminYoutubeDiscoveryQuery` unchanged as the individual item shape in the paginated Queries view. Do not add `targetDigest`, `missionActionId`, safe signal summaries, raw schedule anchors, Worker lease data, provider diagnostics, or arbitrary JSON to that public shape.
  - [ ] Use closed unions for codes, statuses, reasons, and stages. Safe location/corridor/route labels may be bounded validated text because they are persisted labels, not closed vocabularies. A missing safe field renders as unavailable.
  - [ ] Define Funnel as a current-state, `asOf`-timestamped server aggregate. Its fixed named stages count each canonical candidate at most once using its current recommendation/operator state and its most recent safe linked ranking stage; it has deterministic zero/no-data output and never counts raw history rows. It must not expose raw run/ranking history or become a Health throughput/incident projection owned by Story 20.3.
  - [ ] Define Mission candidate eligibility and order precisely: include only canonical candidates with lineage through a Mission-linked system proposal -> run -> appearance; emit a candidate once even across multiple appearances; select its most recent linked appearance/ranking by canonical timestamp then stable ID; order by current recommendation priority, selected rank, selected timestamp, then canonical candidate ID. A candidate without a current safe recommendation is unavailable rather than guessed.
  - [ ] Make every parser reject extra keys, malformed opaque IDs, noncanonical timestamps, unbounded lists/text, unknown codes, and prohibited raw fields.

- [ ] Compose owner-safe, side-effect-free Mission projections (AC: 1, 2)
  - [ ] Keep Coverage need data in a narrow Knowledge-owned read port/module. Add explicitly named `listMissionCoverage` and `getMissionDetail` projections rather than overloading the action-queue input shape; expose only the minimum safe Coverage/Mission-detail data needed. Discovery must not read Knowledge tables directly or export a generic cross-domain repository.
  - [ ] Keep query/run/appearance/ranking/candidate lineage in Discovery's read port/repository. Compose owner ports explicitly in the Nest composition root, not in `apps/admin`.
  - [ ] Trace Coverage -> query proposal through persisted `knowledgeRecommendations.discoveryMissionActionId` and `youtubeDiscoveryQueryProposals.missionActionId`; Mission detail returns only this durable system proposal. Trace proposal -> run -> candidate through the persisted proposal/run/appearance/recommendation relationships. Never use text/digest matching.
  - [ ] Add a server-side Mission detail admission check. A syntactically valid `mission-<32 hex>` path value is not authorization or existence proof: unavailable, closed, or unlinked needs return safe `404 { code: "not_found" }` without rendering the ID.
  - [ ] Keep all Mission GET operations read-only. They must not call `listReview` or its reconciliation path, perform Knowledge handoff lookup, write audits, mutate review state, create a source, invoke capture eligibility, execute/retry/schedule/claim Worker work, or call YouTube/Gateway providers.
  - [ ] Latest run context means the latest run for the linked proposal by `createdAt`, then stable run ID. It contains only safe closed run state, `createdAt`, retry count, and terminal category when present; run-level `stage` is not persisted and must not be invented from ranking history. Render explicit no-run/unavailable closed states. Expanded incident detail, provider/rate-limit diagnosis, telemetry, and Health recovery belong to Story 20.3.

- [ ] Expose protected read endpoints and reuse existing commands (AC: 1-3)
  - [ ] Add these focused GET endpoints in `AdminYoutubeDiscoveryController`: `GET /mission/coverage?cursor=<opaque-cursor>`, `GET /mission/queries?cursor=<opaque-cursor>`, `GET /mission/candidates?cursor=<opaque-cursor>`, `GET /mission/funnel`, and `GET /mission/:actionId`. Each accepts only its declared key; detail accepts no query keys. Reuse `@RequiresAdminCapability("admin.knowledge.write")`, `@AllowsAdminBrowserSession()`, strict query/path validation, principal forwarding, controller response parsing, and exact safe `400 validation_error`, `404 not_found`, and `503 internal_error` envelopes.
  - [ ] Preserve authorization before port admission: anonymous requests receive the existing `401`, non-operator travelers receive `403`, and no Mission owner/repository work runs before guards admit the request.
  - [ ] Do not alter `GET /v1/admin/knowledge/youtube-discovery`, `POST` query command routes, their strict parsers, CSRF behavior, audits, locking, or system-query text immutability. The Mission UI calls those existing endpoints for create/edit/reprioritize/pause/resume.

- [ ] Replace the Mission placeholder with Vietnamese-first readable views (AC: 1-3)
  - [ ] Replace `apps/admin/app/knowledge/youtube-discovery/mission/page.tsx` and `mission/[actionId]/page.tsx` with protected, typed Mission route composition and focused client presentation under the same folder. The list route uses a validated URL-owned `view=coverage|queries|candidates|funnel` selection (default `coverage`); reject/replace invalid view values rather than client-filtering a broad payload.
  - [ ] Use credentialed `no-store` API reads with a request ID, strict contract parsing before state/render, existing `401` Google sign-in recovery, explicit loading/unavailable/empty states, and stale-response fencing for detail/view changes.
  - [ ] Provide explicit accessible view controls for `Nhu cầu phủ sóng`, `Truy vấn`, `Ứng viên`, and `Luồng Discovery`; selected-state semantics and focus must be visible and announced. Use wide readable paginated lists/tables plus an optional focused detail pane, not charts or dense analytics cards. Announce result range, retain focus on load-more after append, and move focus predictably to the heading or first result after replacement.
  - [ ] A review-admissible Mission candidate opens `/knowledge/youtube-discovery-review?recommendationId=<validated-id>` only. Do not duplicate candidate details, scoring eligibility, Accept, Defer, Skip, or Knowledge intake controls in Mission; non-admissible trace records expose no review action.
  - [ ] Render query origin, reason, priority, state, and next-run text with Vietnamese copy. Hide/disable text edit for system proposals; keep explicit enabled query actions and field-level validation recovery for operator query forms. Use existing credentialed CSRF command transport, disable each command while pending, fence stale command/read responses, and preserve drafts after validation/conflict failure.
  - [ ] Preserve map-paper/green/amber admin styling, borders before shadows, text plus non-color status cues, visible focus, polite live feedback, 44px controls, `min-w-0`, and sequential narrow/mobile reflow without horizontal two-dimensional scrolling. Do not add a new admin shell, modal workflow, or infinite scrolling feed.
  - [ ] State clearly near candidates that ranking is operational context, not verification, evidence, capture completion, or publication approval.

- [ ] Verify contracts, ownership, authorization, traceability, and accessibility (AC: 1-3)
  - [ ] Add DB-free contract tests for all Mission projection/parser shapes, exact keys, closed codes, bounded safe text, ISO/opaque-ID bounds, forbidden fields, pagination/cursor ordering and rejection, Funnel current-state dedupe, seasonal present/unavailable states, and malformed-query rejection.
  - [ ] Add serial PostgreSQL integration coverage using local `resetTestDatabase()` for Coverage need -> durable Mission ID -> linked system query -> deterministic latest safe run -> ranked candidate lineage; multi-appearance/multi-run candidate dedupe; operator query distinction; operator/global pause projection; safe Funnel aggregation; unavailable/closed/unlinked Mission `404`; and zero writes from every Mission GET. Snapshot audits, review states, handoffs, and runs before/after every Mission GET to prove no hidden reconciliation/write.
  - [ ] Add API tests for every declared Mission endpoint: operator success, anonymous `401`, traveler `403`, authorization-before-port-admission, malformed path/cursor `400`, unavailable projections `503`, exact safe response bodies, no raw/provider/source/evidence/traveler fields, and a valid-but-unknown Mission ID whose `404` body excludes the supplied ID. Cover malformed URL-owned `view` handling at the admin route boundary test.
  - [ ] Add admin UI boundary tests for endpoint-specific credentialed reads and contract parsing; no capture/intake/candidate-decision POST; safe review deep links and non-actionable traces; Vietnamese labels; system versus operator text-edit behavior; CSRF headers, pending-disablement, request fencing, draft preservation, field error association/focus; unavailable detail without rendering its route ID; live status/range; visible labels/focus; 44px controls; and narrow sequential reflow. Register the dedicated DB-free Mission UI test file in `vitest.config.ts` `unitTests`; keep projection/API tests serial under integration.
  - [ ] Run focused DB-free tests with `pnpm test:unit`, focused serial PostgreSQL/API tests with `pnpm test:integration`, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact blockers without weakening the unit/integration split or enabling integration parallelism.

## Dev Notes

### Scope and sequencing

- Story 20.1 created only the route handoff shells at `mission/page.tsx` and `mission/[actionId]/page.tsx`; it deliberately does not own full Mission reads. Replace these placeholders rather than layering a second Mission surface beside them.
- Story 20.3 owns Automation Health schedule/backlog/throughput/incident details. Story 20.4 owns global enablement control. Story 20.5 owns cross-control-tower E2E/accessibility proof. Keep this story to Mission traceability and the existing query-management commands.
- Existing Epic 18-19 query, run, candidate, triage, immutable recommendation, review-state, and candidate-review contracts are the source of truth. Do not recalculate recommendation/ranking or introduce persistence unless a current safe projection field has no durable representation.
- Seasonal grouping is not present in the existing safe Discovery signal/action input. Do not invent it. If product requires a populated season grouping now, stop and obtain a narrow persisted/safe-field decision before adding a migration.

### Architecture and ownership guardrails

- Discovery is URL-only: it must never write `sources`, capture versions, ingestion jobs, evidence, cards, publication state, or a Knowledge source link. Never invoke, schedule, enqueue, or retry `youtube:capture`.
- Worker owns Discovery execution, provider calls, retries, leasing, and run state transitions. API/admin Mission reads are projections only.
- Keep contracts in `packages/contracts`, ownership interfaces/policies in `packages/domain`, persistence projections in `packages/database`, protected transport/composition in `apps/api`, and typed UI in `apps/admin`.
- Preserve the separate closed states: triage recommendation (`skip | defer | consider`), candidate operator state (`pending | accepted | deferred | skipped`), and run state (`queued | running | retrying | completed | failed | cancelled`). Do not report one as another.
- Persist/render only bounded safe operational information. Never return or expose raw comments, raw AI Ask content, source material, prompts/responses, provider payloads/diagnostics, source/capture IDs, transcripts, media, credentials, cookies, evidence spans, or traveler data.

### Existing implementation to preserve

- `packages/contracts/src/youtube-discovery/index.ts` establishes exact-key validation, bounded public projections, and opaque cursor parsing. Apply that style to every Mission contract.
- `packages/domain/src/youtube-discovery/admin.ts` and `packages/database/src/admin-youtube-discovery.ts` own the existing query list/commands. `list()` already has the safe query projection required by Mission.
- `packages/database/src/admin-youtube-discovery.ts#listReview` reconciles active Knowledge handoffs. Never reuse it for Mission candidates because a Mission read must have no reconciliation or write side effect.
- `packages/database/src/knowledge-discovery-action-inputs.ts` is the current narrow Knowledge-owned action-input boundary. Coverage needs must expand from this owner boundary, never through a Discovery query of Knowledge tables.
- `packages/database/src/knowledge-lifecycle.ts` creates opaque missing-context Mission IDs; `packages/domain/src/youtube-discovery/planning.ts` and `packages/database/src/youtube-discovery/index.ts` persist the durable system-query link. Keep it stable across legacy compatible proposal reconciliation.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` is the only Discovery admin route namespace. Use its guard/envelope pattern and parse every adapter result before returning it.
- `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` owns server-admitted candidate selection, deep links, decision fencing, and accessibility behavior. Mission routes into it with a validated `recommendationId`; it does not reimplement it.

### Project Structure Notes

- Expected changed paths: `packages/contracts/src/youtube-discovery/index.ts`; `packages/domain/src/youtube-discovery/admin.ts` plus a narrow Mission owner-port type if needed; `packages/database/src/admin-youtube-discovery.ts`; `packages/database/src/knowledge-discovery-action-inputs.ts` or a narrowly named Knowledge Mission projection module; `apps/api/src/admin/admin-youtube-discovery.controller.ts`; API composition in `apps/api/src/main.ts`; Mission route/components under `apps/admin/app/knowledge/youtube-discovery/mission/`; `vitest.config.ts`; and focused tests.
- Expected test seams: `tests/admin-youtube-discovery-contract.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, a dedicated serial Mission projection integration suite, and a dedicated Mission UI boundary suite.
- No new dependency, service, database/provider integration, generic cross-domain repository, raw-history store, analytics dashboard, capture/runbook, policy editor, advanced rule builder, blocking/exclusion policy, or Knowledge writer is permitted.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 20 and Story 20.2]
- [Source: _bmad-output/implementation-artifacts/epic-20-context.md#Requirements & Constraints]
- [Source: _bmad-output/implementation-artifacts/20-1-build-the-action-required-discovery-queue.md#Existing implementation to preserve]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1 through AD-8]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/EXPERIENCE.md#Knowledge Mission, Query proposal list, and Accessibility Floor]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/DESIGN.md#Layout & Spacing and Components]
- [Source: packages/contracts/src/youtube-discovery/index.ts]
- [Source: packages/domain/src/youtube-discovery/admin.ts]
- [Source: packages/database/src/admin-youtube-discovery.ts]
- [Source: packages/database/src/knowledge-discovery-action-inputs.ts]
- [Source: apps/api/src/admin/admin-youtube-discovery.controller.ts]
- [Source: apps/admin/app/knowledge/youtube-discovery-review/review.tsx]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story analysis completed 2026-08-11 using complete sprint status, Epic 20 context, Story 20.1 implementation/review intelligence, Discovery architecture and UX, current contracts/domain/database/API/admin seams, focused serial test patterns, and recent Git history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story status is ready-for-dev. No implementation, migration, database reset, test execution, or commit was performed while creating this story.
- The guide locks the existing durable Mission linkage (`missionActionId`), preserves system-query text immutability, prevents read-side effects from `listReview`, and explicitly leaves seasonal grouping unavailable unless a safe persisted field is approved.
- Story validation applied 2026-08-11: Mission detail follows only durable system proposals; every collection has cursor pagination and deterministic ordering; candidate/run/Funnel selection is explicit; routes, CSRF/request-fencing behavior, safe unavailable rendering, and unit-test registration are locked.
- 2026-08-11: BMad code review repaired all seven findings. Focused unit `8/8`, focused serial integration/API `20/20`, typecheck, build, and diff check pass. Lint has 0 errors and 50 existing warnings. Full integration has 17 unrelated failures; no Story 20.2 test failed.

### File List

- _bmad-output/implementation-artifacts/20-2-deliver-knowledge-mission-drill-downs.md
- _bmad-output/implementation-artifacts/spec-20-2-deliver-knowledge-mission-drill-downs.md
- packages/contracts/src/youtube-discovery/index.ts
- packages/database/src/admin-youtube-discovery.ts
- packages/database/src/knowledge-discovery-action-inputs.ts
- apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx
- apps/admin/app/knowledge/youtube-discovery/mission/[actionId]/detail.tsx
- tests/admin-youtube-discovery-contract.test.ts
- tests/admin-youtube-discovery-mission-ui.test.ts
- tests/youtube-discovery-mission.integration.test.ts
