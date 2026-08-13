# Story 21.5: Preserve Canonical Trip Paths And Supported Route Coverage

Status: backlog

## Story

As a traveler, I want route advice to reflect my selected path or real product coverage, so that text similarity cannot masquerade as journey authority.

## Acceptance Criteria

1. Historical free-text legs keep canonical origin, destination, selected path, and registry snapshot null together unless owner-confirmed.
2. Proposal-applied `set-leg-path` and `clear-leg-path` validate owner, versions, membership, active registry, and ordering, then atomically write all references or nothing.
3. `publishRouteRegistryRelease(...)` is the sole Retrieval writer and activates only complete replayable releases.
4. Resolution returns only `authoritative_selected`, `authoritative_complete`, `known_partial`, `ambiguous_paths`, `no_path`, or `stale_selected_path`; `RP-01` through `RP-10` pass.

## Tasks / Subtasks

- [ ] Extend `tripPlanItems` and add Retrieval-owned immutable registry/release/coverage persistence via forward migration; enforce that origin, destination, selected path, and registry snapshot are all null or all present, and null is valid only for transport-leg items (AC: 1, 3).
- [ ] Extend proposal parser/validator/application with `set-leg-path` and `clear-leg-path`; retain aggregate lock/version behavior (AC: 2).
- [ ] Implement bounded existing Worker release publishing and server projection of selected-path review state (AC: 3-4).
- [ ] Expose typed route resolution with pinned path IDs, coverage assertion revision, direction, and reason code for Story 21.6; add unit validation/resolution and serial proposal, fence, migration, stale-release, set/clear reopen, and all `RP-01`-`RP-10` tests (AC: 1-4).

## Dev Notes

- Free-text endpoint labels are query aids only. Never infer/backfill durable canonical choice from labels or model output.
- Only the first two resolution states permit route authority. All other states must provide bounded Vietnamese next steps without live traffic, navigation, closure, nationwide, or safety guarantees.
- Consume Story 21.4 mode/fences; do not redefine planning authority or add a direct route-write endpoint.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.5]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29-AD-30-AD-35]
- [Source: packages/database/src/trip-plan-commands.ts]
- [Source: packages/database/src/traveler-proposal-commands.ts]
- [Source: tests/trip-proposal-command-contract.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Canonical-Paths-And-Route-Coverage]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Route-Paths]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.5` is normative. Guide AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
