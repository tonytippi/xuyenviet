---
title: 'Deliver Knowledge Mission Drill-Downs'
type: 'feature'
created: '2026-08-11'
baseline_revision: '1ea67ae'
final_revision: '77241b3'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-20-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Operators cannot currently trace a safe Discovery coverage need through its system query, latest execution context, and ranked candidates. The Mission routes are placeholders, so they provide neither the rationale needed before review nor the existing query-management controls.

**Approach:** Add protected, server-owned and read-only Mission projections for Coverage, Queries, Candidates, Funnel, and a durable Mission detail trace. Replace the placeholders with a Vietnamese-first typed workbench that consumes those contracts and reuses the established query commands and candidate-review workspace.

## Boundaries & Constraints

**Always:** Join Knowledge needs to Discovery only by durable `missionActionId`; keep Knowledge coverage data behind a narrow owner port and compose it explicitly at the API root. All collections use fixed-size deterministic keyset pagination with opaque versioned cursors and exact contract parsing. Mission GETs are side-effect-free: they must not reconcile reviews, mutate state/audits/handoffs, invoke providers, schedule work, or access capture/intake paths. Return only bounded safe labels and closed operational codes; seasonal context remains unavailable because no safe persisted field exists. A candidate review CTA requires server-confirmed current `pending` review state and immutable `consider` recommendation. Preserve authorization-before-port-admission and existing query command/CSRF policy.

**Block If:** A required safe Mission field has no durable owner-safe representation and cannot be shown as unavailable, or the projection would require direct Discovery reads of Knowledge tables, inferred text linkage, or a read-side mutation.

**Never:** Match mutable query text, digests, client IDs, prose, AI Ask content, comments, provider/source/prompt payloads, evidence, capture/source IDs, credentials, media, or traveler data. Do not add a migration, new aggregate, provider/Worker control, Health dashboard, advanced query rule builder, Knowledge mutation, or duplicate candidate review/intake actions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Authorized Mission list | Valid view and optional view-specific cursor | Safe paginated Coverage, Queries, or Candidates list with deterministic order and `{ items, nextCursor }`; Funnel is an `asOf` current-state aggregate | No writes, no raw fields, empty output remains deterministic |
| Mission detail | Existing open Knowledge need linked to a system proposal | Safe need, linked query, latest run by `createdAt` then ID, and deduplicated ranked candidate trace | Closed/unlinked/unknown need returns `404 { code: "not_found" }` without the supplied ID |
| Invalid request | Unknown query key/view, malformed/stale/version-incompatible cursor, malformed action ID | No port/repository admission and no partial data | `400 { code: "validation_error" }` |
| Candidate trace | Multiple linked runs/appearances for one canonical candidate | Select most recent linked appearance/ranking by timestamp then ID; emit candidate once and order by current priority, rank, timestamp, candidate ID | No recommendation becomes explicit unavailable/non-actionable trace |
| Query management | Operator/system query, local/global pause state | Existing protected commands preserve system text immutability; UI names origin, reason, priority, state, next run and pause reason | Per-field recovery keeps drafts; commands disable while pending and fence stale responses |
| Unauthorized/unsafe projection | Anonymous/traveler request or adapter/parser failure | Guards precede port work; typed UI shows safe unavailable/sign-in recovery | `401`/`403` existing behavior; `503 { code: "internal_error" }` with no diagnostics |

</intent-contract>

## Code Map

- `packages/contracts/src/youtube-discovery/index.ts` -- exact safe Mission projections, cursors, request and response parsers.
- `packages/domain/src/youtube-discovery/admin.ts` -- Mission read ports and typed validation/not-found boundaries.
- `packages/database/src/knowledge-discovery-action-inputs.ts` -- narrow Knowledge-owned Coverage/Mission detail inputs.
- `packages/database/src/admin-youtube-discovery.ts` -- side-effect-free Discovery projection for queries, runs, candidate lineage, and Funnel.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts`, `apps/api/src/main.ts` -- protected Mission transport and explicit owner-port composition.
- `apps/admin/app/knowledge/youtube-discovery/mission/` -- typed list/detail workbench replacing route placeholders.
- `tests/admin-youtube-discovery-contract.test.ts`, `tests/youtube-discovery-mission.integration.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/admin-youtube-discovery-mission-ui.test.ts`, `vitest.config.ts` -- contract, serial persistence, protected API, and DB-free UI coverage.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/youtube-discovery/index.ts` -- define exact-key, bounded Mission contracts for Coverage, paginated existing query items, candidates, detail, latest safe run, and current-state Funnel; reject unknown/prohibited fields and invalid cursors.
- [x] `packages/domain/src/youtube-discovery/admin.ts` and `packages/database/src/knowledge-discovery-action-inputs.ts` -- publish minimal named Knowledge Mission projections and port contracts without generic cross-domain data access.
- [x] `packages/database/src/admin-youtube-discovery.ts` -- compose deterministic read-only Mission projections from owner inputs and Discovery lineage without `listReview` reconciliation; apply durable linking, candidate dedupe, latest-run selection, and current-state Funnel rules.
- [x] `apps/api/src/admin/admin-youtube-discovery.controller.ts` and `apps/api/src/main.ts` -- add guarded strict Mission GET endpoints, safe error envelopes, parser-before-response behavior, and owner-port wiring while preserving existing commands.
- [x] `apps/admin/app/knowledge/youtube-discovery/mission/` -- replace placeholders with credentialed no-store typed reads, validated URL-owned views, accessible Vietnamese workbench/detail, safe candidate deep links, and existing fenced CSRF query commands.
- [x] `tests/` and `vitest.config.ts` -- prove contracts/cursors/forbidden fields, serial durable lineage/funnel/zero-write reads, endpoint auth/envelopes, and DB-free UI transport/accessibility boundaries.

**Acceptance Criteria:**
- Given an authorized operator selects any Mission view, when its protected server projection loads, then Coverage, Queries, Candidates, and Funnel remain separate safe read models rather than client-filtered broad data or a dashboard.
- Given an open high-priority Mission need has a linked system query, when its detail loads, then it traces only the durable link to that query, its latest safe run, and deterministically ranked unique candidate records without read-side effects.
- Given an operator manages a Mission query, when they create, edit, reprioritize, pause, or resume it, then existing protected command rules hold, including system text immutability and distinct global/operator pause copy.
- Given invalid, unavailable, unauthorized, or non-admissible inputs, when Mission is accessed, then the API/UI use safe typed recovery without rendering raw identifiers, unsafe data, or unauthorized actions.

## Spec Change Log

### 2026-08-11 -- Re-derivation after review

- Trigger: the first derivation collapsed the declared endpoint contract and omitted durable current-state selection, URL-owned UI state, and command/accessibility behavior.
- Amendment: lock the five endpoint paths, detail query rejection, priority-aware and view-specific cursor tuples, combined queries, latest appearance/ranking selection, unavailable traces, current-state Funnel, and full client fencing/pagination/query-command requirements.
- Avoids: a transport that cannot be consumed as specified, stale or incomplete Mission traces, historical Funnel counts, and a read-only/non-shareable Mission UI.
- KEEP: preserve narrow owner-port composition, durable `missionActionId` joins, select-only Mission reads, strict parsers, and candidate review handoff to the existing workspace.

## Review Triage Log

### 2026-08-11 -- Review pass
- intent_gap: 0
- bad_spec: 14 (high 14)
- patch: 3 (medium 3)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[bad_spec]` Re-derived Mission contract requirements to retain endpoint-specific, durable current-state, and complete UI behavior from the authoritative story.

### 2026-08-11 -- Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8 (high 5, medium 3)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Scoped candidate lineage and cursors by Mission action, paginated detail candidates, and rejected stale collection cursors.
  - `[medium]` `[patch]` Recovered detail authentication, made command fencing per action, aligned cadence validation, and rendered the mandatory ranking safety copy.

## Auto Run Result

Status: done

Summary: Added protected, server-owned Knowledge Mission drill-downs for safe Coverage, combined Queries, ranked Candidates, current-state Funnel, and durable Mission detail trace. The Vietnamese admin workbench uses endpoint-specific typed reads, keyset pagination, accessible response handling, and existing CSRF-protected query commands while preserving candidate review ownership.

Files changed: Mission contracts, narrow Knowledge owner ports, select-only Discovery projections, protected API composition/routes, Mission admin route/components, and focused contract/API/UI/integration tests.

Review: Two independent review passes required one re-derivation and eight final patches. The completed result preserves durable `missionActionId` joins, current-state candidate/Funnel selection, stale cursor rejection, zero-write Mission GETs, and server-gated review links. Follow-up review is not recommended after the final independent review found no remaining findings.

Verification: `pnpm exec vitest run --project unit tests/admin-youtube-discovery-contract.test.ts tests/admin-youtube-discovery-mission-ui.test.ts` passed (8 tests). `pnpm exec vitest run --project integration tests/youtube-discovery-mission.integration.test.ts tests/admin-youtube-discovery-api.integration.test.ts` passed (20 tests). `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` passed. Lint retains pre-existing warnings outside this story.

Residual risk: Mission UI boundary coverage is focused rather than browser E2E; Story 20.5 owns cross-control-tower accessibility proof.

## Design Notes

Mission keeps its two owner boundaries explicit: Knowledge publishes only safe coverage/need records, while Discovery resolves query/run/candidate lineage. The API composition root joins the ports; the admin application never derives linkage or eligibility.

`listReview()` cannot be reused because its active-review reconciliation can write state. Mission candidate traces use a dedicated select-only projection and link to the existing review workspace only after the server marks the recommendation admissible.

## Verification

**Commands:**
- `pnpm test:unit -- tests/admin-youtube-discovery-contract.test.ts tests/admin-youtube-discovery-mission-ui.test.ts` -- expected: DB-free strict contract and UI-boundary tests pass.
- `pnpm test:integration -- tests/youtube-discovery-mission.integration.test.ts tests/admin-youtube-discovery-api.integration.test.ts` -- expected: serial database/API lineage and zero-write tests pass.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm build` -- expected: production builds pass.
- `git diff --check` -- expected: no whitespace errors.
