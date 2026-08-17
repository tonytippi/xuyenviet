---
title: 'Preserve Canonical Route Authority'
type: 'feature'
created: '2026-08-16'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-epic-21/story-contracts.md'
  - '_bmad-output/specs/spec-epic-21/SPEC.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Story 21.4 requires canonical, owner-confirmed route paths to persist on existing Trip legs and survive reopening, while free-text labels and pending proposals have no route authority.

**Approach:** Add a small static code-owned route manifest and pure resolver, then use the existing owner-locked proposal Apply transaction for typed `set-leg-path` and `clear-leg-path` changes only.

## Boundaries & Constraints

**Always:** Treat `story-contracts.md` Story 21.4 as exact; route results are only `selected`, `complete`, `partial`, `ambiguous`, `unsupported`, or `stale`; labels, similarity, popularity, model output, and pending proposals create no authority; preserve current owner and version fences.

**Block If:** The approved `0074_add_trip_plan_item_canonical_route_path_id.sql` migration cannot add only nullable `canonical_route_path_id` to existing `trip_plan_items`.

**Never:** Add a route-registry table, publisher, Worker operation, runtime activation state, route registry persistence, generic workflow, or a second command/endpoint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Selected path | Owner-applied supported canonical reference on a transport leg | `selected`; hard applicability may use that path | Reject stale owner/version fences |
| Static coverage | Supported endpoint pair without a selected path | `complete`, `partial`, or `ambiguous` from the typed manifest | Never select an alternative implicitly |
| Unsupported or stale | Unsupported endpoints or stored path absent from manifest | `unsupported` or `stale` with bounded limitation | Do not auto-replace the stored reference |
| Apply and reopen | Owner applies set-path then clear-path | Both atomic versioned changes persist and resolve after reload | Roll back the whole Apply on invalid path or stale fence |

</intent-contract>

## Code Map

- `packages/database/src/schema.ts:1040-1042` -- `trip_plan_items` is the existing owner-scoped transport-leg storage extended only with nullable `canonical_route_path_id` by Story 21.4.
- `drizzle/migrations/0073_clean_break_trip_aware_planning.sql:1-13` -- final Story 21.1 migration creates only `planning_context_sessions` and is not amended.
- `drizzle/migrations/0074_add_trip_plan_item_canonical_route_path_id.sql` -- reserved solely for Story 21.4 to add nullable `canonical_route_path_id` to existing `trip_plan_items`.
- `packages/database/src/trip-plan-commands.ts:11-30,72-80` -- existing normalized item write and owner/version-fenced update primitives.
- `packages/database/src/traveler-proposal-commands.ts:28-57,104-127` -- existing atomic proposal Apply boundary, operation fences, dispatcher, and in-memory item state.
- `packages/database/src/source-bundle.ts:72-175,636-649` -- source-bundle seam for pure route resolution and bounded prompt limitations.
- `packages/contracts/src/planning-context.ts:27-36` -- planning mode/execution reference contracts to extend only with route types when storage exists.
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md:93-114` -- static manifest and owner-confirmed set/clear authority contract.
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md:39-50` -- RP-01 through RP-08, including persistence after reopen.

## Tasks & Acceptance

**Execution:**
- [ ] Add exactly `drizzle/migrations/0074_add_trip_plan_item_canonical_route_path_id.sql`, containing only nullable `canonical_route_path_id` on existing `trip_plan_items`; do not amend `0073`.
- [ ] Define and startup-validate the static code-owned route manifest; Apply validates its ID, `clear-leg-path` sets the stored ID to `null`, and a stored ID absent from the manifest resolves `stale`.

**Acceptance Criteria:**
- Given an owner applies a manifest route-path ID, when the existing proposal Apply command validates ownership and versions, then it persists that ID in `trip_plan_items.canonical_route_path_id` atomically and rejects a missing manifest entry.
- Given an owner clears a canonical route path, when Apply succeeds, then `canonical_route_path_id` is set to `null` atomically.
- Given a persisted canonical route-path ID is no longer present in the static manifest, when route applicability resolves, then it returns `stale` and does not replace or re-authorize the stored value.

## Spec Change Log

- 2026-08-17 — Product owner approved a minor course correction: preserve final Story 21.1 migration `0073`; reserve exactly `0074_add_trip_plan_item_canonical_route_path_id.sql` for Story 21.4 to add only nullable `canonical_route_path_id` to existing `trip_plan_items`. The route manifest remains static and code-owned; Apply validates IDs, clear writes `null`, and absent manifest entries resolve `stale`. No other schema, persistence, runtime, endpoint, or dependency scope is authorized.

## Review Triage Log

## Auto Run Result

Status: ready-for-dev

Status history: blocked on 2026-08-16. The prior block found that canonical route references required durable Trip-leg storage, while final migration `0073` created only `planning_context_sessions`. No code or sprint-status change was made.

Resolution: product owner approved the exact minimal correction on 2026-08-17. Story 21.4 is ready for development with exactly one new migration, `0074_add_trip_plan_item_canonical_route_path_id.sql`, adding only nullable `canonical_route_path_id` to existing `trip_plan_items`. `0073` remains unamended. The static code-owned manifest validates IDs during Apply; clearing writes `null`; an absent manifest entry resolves `stale`. No other schema, persistence, worker, service, queue, flag, endpoint, or dependency is authorized.

## Verification

**Commands:**
- `git diff --check` -- expected: no whitespace errors in the approved planning correction.
- `git status --short` -- expected: clean after the planning correction commit.
