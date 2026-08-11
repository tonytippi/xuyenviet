---
title: 'Deliver Automation Health and Safe Incident Detail'
type: 'feature'
created: '2026-08-11'
baseline_revision: 'e55d3faad66bea12e6865ec34a63a502f7550a88'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-20-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Automation Health is currently a placeholder, leaving operators unable to inspect safe Discovery scheduling, failures, aggregate throughput, review state, and triage usage. The current incident detail route also echoes untrusted route input.

**Approach:** Add a protected, select-only Health overview and server-admitted incident detail read model across the existing Discovery contract, admin port, PostgreSQL adapter, API controller, and Vietnamese-first admin views.

## Boundaries & Constraints

**Always:** Add the approved narrow `deferred_at` timestamp to the existing candidate-review-state owner with a forward Drizzle migration. Set it only when a pending review transitions to `deferred`; leave it null for pending, accepted, and skipped states. Use strict exact-key contracts, closed states, canonical millisecond UTC timestamps, bounded aggregates, versioned opaque detail cursors, and existing `groupedIncidents` clearance semantics. Keep planning and query-run schedules/results separate. Health must be select-only and must not call `listReview`, reconcile reviews, mutate policy/audits/reviews/Knowledge, schedule or invoke worker/provider/capture work, or expose raw/provider/source/prompt/evidence/traveler data. A run-level stage is `unavailable` unless it is durably stored; ranking history supports bounded aggregate throughput only. Guards run before port admission; malformed input/stale cursors are `400`, unavailable detail is a non-echoing `404`, and unsafe adapter results are `503`.

**Block If:** A mandatory metric lacks a durable owner-safe representation and cannot be rendered as unavailable without violating the story.

**Never:** Infer deferred age from unrelated timestamps; add any persistence beyond the approved `deferred_at` column, a telemetry/event history, chart/dashboard framework, Health mutation, policy editor/switch, Knowledge writer, source/capture linkage, Worker control, or provider integration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Authorized Health overview | Current policy and safe Discovery projections available | Separate safe planning/query schedule-result context, bounded throughput, backlog, grouped incidents, and usage aggregate with explicit freshness | No writes or raw data |
| Health incident detail | Current server-admitted opaque incident group and optional valid cursor | Safe affected records ordered by the documented tuple; durable run stage or explicit unavailable stage | Invalid/stale cursor is `400`; cleared/unknown detail is non-echoing `404` |
| Missing or stale projections | No run, no incident, missing policy/timestamp/cadence, or stale telemetry | Distinct Vietnamese-first no-run, no-incident, stale, and unavailable states with safe reload | Never substitute zero or healthy state |
| Deferred backlog age | Candidate state is `deferred` with durable `deferredAt` | Bounded deferred count and oldest durable deferral timestamp | Null/legacy `deferredAt` is explicitly unavailable, never inferred |

</intent-contract>

## Code Map

- `packages/contracts/src/youtube-discovery/index.ts` -- exact safe contracts, parsers, and opaque cursor conventions to extend for Health.
- `packages/domain/src/youtube-discovery/admin.ts` -- existing `AdminYoutubeDiscoveryPort` requires Health read methods and a Health cursor validation boundary.
- `packages/database/src/admin-youtube-discovery.ts` -- select-only Discovery adapter and authoritative `groupedIncidents` grouping/clearance logic.
- `packages/database/src/schema.ts`, `drizzle/migrations/` -- existing candidate review state owner and approved forward `deferred_at` migration.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- sole guarded Discovery admin transport and strict response/error pattern.
- `apps/admin/app/knowledge/youtube-discovery/health/` -- unsafe Health placeholders to replace after the blocking data decision.
- `tests/admin-youtube-discovery-contract.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/youtube-discovery-mission.integration.test.ts` -- established contract, protected API, and serial zero-write test patterns.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/schema.ts`, `drizzle/migrations/`, and `packages/database/src/admin-youtube-discovery.ts` -- add and populate the approved candidate-review `deferred_at` timestamp only on a pending-to-deferred transition.
- [x] `packages/contracts/src/youtube-discovery/index.ts`, `packages/domain/src/youtube-discovery/admin.ts`, `packages/database/src/admin-youtube-discovery.ts` -- implement bounded, select-only Health overview and server-admitted incident detail contracts/projections with deterministic freshness, schedule/result separation, incident clearance, throughput, backlog/deferred age, and aggregate triage usage.
- [x] `apps/api/src/admin/admin-youtube-discovery.controller.ts`, `apps/admin/app/knowledge/youtube-discovery/health/` -- expose guarded strict GET endpoints and replace placeholders with safe typed Vietnamese Health workbench/detail views.
- [x] `tests/` and `vitest.config.ts` -- add focused contract, serial integration/API, and DB-free UI coverage for Health safety and accessibility boundaries.

**Acceptance Criteria:**
- Given deferred candidates exist, when Health renders the required deferred age, then its value is based on a durable deferral timestamp rather than any inferred candidate, recommendation, run, or ranking time.

## Design Notes

The approved schema change makes `youtubeDiscoveryCandidateReviewStates.deferredAt` the sole deferred-age source. Legacy deferred rows retain null and surface an unavailable age rather than a fabricated value. This preserves the migration boundary while making subsequent defer transitions deterministically observable.

## Auto Run Result

Status: done

Summary: Delivered protected, select-only Discovery Automation Health and server-admitted incident detail. Health now projects global policy state separately from query schedules, planning and query result freshness, bounded throughput, review/deferred backlog age, safe grouped incidents, and bounded Discovery-triage usage with explicit availability. Incident detail is paginated, server-admitted, and renders only safe identity, lifecycle phase, unavailable durable stage, time, retry, and category fields.

Files changed: Added the approved `deferred_at` migration and state ownership; extended Discovery contracts, port, PostgreSQL projections, protected API endpoints, typed Vietnamese Health views, and focused contract/UI/integration tests.

Review: Independent adversarial and edge-case passes identified and repaired contract, schedule ownership, telemetry availability, incident admission/detail, responsive client, and pagination defects. Final independent signoff reported no actionable findings.

Verification: Focused unit Health contracts/UI passed. Direct serial Health/API integration passed (33 tests). `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. The repository-wide integration script does not forward focused selectors and continues to surface unrelated existing failures; direct Story suites pass.

Residual risk: Health UI validation is component-boundary coverage rather than browser E2E. Story 20.5 owns cross-control-tower accessibility proof.

## Review Triage Log

### 2026-08-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 24 (high 0, medium 24, low 0)
- defer: 0
- reject: 1 (medium 1)
- addressed_findings:
  - `[medium]` `[patch]` Repaired safe schedule/result ownership, bounded aggregate and telemetry projections, incident admission/pagination, strict API response shapes, and credentialed Health detail rendering.
  - `[medium]` `[patch]` Added durable deferred-age ownership and migration coverage, current/stale/unavailable state handling, global policy projection, safe unavailable run stage, and explicit Health recovery/accessibility UI.
  - `[medium]` `[patch]` Tightened Health incident identifiers and parser invariants, stripped internal queue metadata, made result ordering deterministic, and fail-closed empty/incomplete telemetry.
  - `[medium]` `[reject]` Retained safe `404` for malformed incident detail route IDs because Story 20.3 AC 2 explicitly requires that response.
