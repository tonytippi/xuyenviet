# Story 21.5: Preserve Canonical Trip Paths And Supported Route Coverage

Status: backlog

## Story

As a traveler, I want route advice to reflect my selected path or real product coverage, so that text similarity cannot masquerade as journey authority.

## Acceptance Criteria

**Given** existing transport legs contain free-text endpoints
**When** the forward migration runs
**Then** canonical origin, destination, selected path, and registry-snapshot references remain null together unless explicitly owner-confirmed
**And** no migration, label parser, or model infers a durable route choice from historical text.

**Given** an owner reviews a typed route-choice proposal
**When** `applyApprovedTripChange(...)` applies `set-leg-path` or `clear-leg-path`
**Then** it validates owner, Trip/item versions, endpoint/path membership, active registry identity, and ordering preconditions before writing all route references atomically
**And** stale, retired, mismatched, unresolved, or unauthorized references apply nothing and return safe review guidance.

**Given** Retrieval publishes a route-registry release and coverage projections
**When** the bounded existing Worker operation validates and activates it
**Then** `publishRouteRegistryRelease(...)` is the sole writer, the release and dependencies are replayable, and partial failure leaves the previous release active
**And** deployment configuration cannot create a second registry authority.

**Given** a requested leg is selected, fully supported, partially supported, ambiguous, unsupported, or stale
**When** route resolution runs
**Then** it returns the corresponding `authoritative_selected`, `authoritative_complete`, `known_partial`, `ambiguous_paths`, `no_path`, or `stale_selected_path` state with bounded traveler guidance
**And** `RP-01` through `RP-10`, FR-16O..Q, FR-63..64, AC-29, and AC-30 pass without claiming live navigation or nationwide coverage.

## Tasks / Subtasks

- [ ] Extend `tripPlanItems` in `packages/database/src/schema.ts` with nullable canonical origin, canonical destination, selected path, and registry-snapshot references; add Retrieval-owned immutable release/location/segment/path/membership/coverage tables and forward migration `drizzle/migrations/0068_add_route_registry_and_trip_paths.sql`. Non-transport items require all four Trip route references null; transport legs require all four null or all four present, and the migration must leave every historical free-text leg all-null (AC: 1, 3).
- [ ] Add `TripLegRouteChoice`, `set-leg-path`, `clear-leg-path`, route-resolution, release-manifest, and traveler projection contracts/parsers to `packages/contracts/src/planning-context.ts`; extend the pending-proposal affected-operation projection in `packages/contracts/src/index.ts` (AC: 2-4).
- [ ] Extend proposal prompting in `packages/database/src/prompts.ts`, untrusted Worker parsing in `packages/worker-domain/src/features/ai/trip-proposal-draft.ts`, and Worker draft validation/persistence in `packages/worker-domain/src/features/chat-trips/trip-change-proposals.ts` for the two closed operation discriminators. Model output may draft exact IDs only from supplied server candidates and never grants route authority (AC: 2).
- [ ] Extend canonical normalization/write helpers in `packages/database/src/trip-plan-commands.ts` and the aggregate-locked apply/fence/history/projection paths in `packages/database/src/traveler-proposal-commands.ts` and `packages/database/src/index.ts`. `set-leg-path` revalidates owner, Trip/leg versions, transport discriminator, exact endpoints, active registry snapshot, path membership, and ordering before writing all four references; `clear-leg-path` clears all four; any failure writes nothing (AC: 2).
- [ ] Implement Retrieval-owned immutable validation, active-release CAS, exact OD/path lookup, and `resolveQueryLeg(...)` in new `packages/database/src/route-registry.ts`, export it from `packages/database/src/index.ts`, and make `packages/database/src/answer-context.ts` project the selected historical choice while `packages/database/src/source-bundle.ts` consumes only the Story 21.4 planning execution and typed resolution (AC: 3-4).
- [ ] Add the code-reviewed bounded reference manifest in new `packages/worker-domain/src/features/retrieval/route-registry-manifest.ts` and the sole transaction-aware `publishRouteRegistryRelease(...)` operation in new `packages/worker-domain/src/features/retrieval/route-registry-release.ts`; export it from `packages/worker-domain/src/index.ts` and invoke it through new one-shot `scripts/publish-route-registry-release.ts` plus `route-registry:publish` in `package.json`. Do not add a supervisor adapter, continuous loop, environment-selected authority, admin writer, or second endpoint (AC: 3).
- [ ] Project selected/stale/partial/ambiguous/no-path review state from `packages/database/src/index.ts` through `packages/contracts/src/planning-context.ts` and render bounded Vietnamese limitation/next-action copy in `apps/web/src/features/ai/ai-ask-composer.tsx`; only `authoritative_selected` and `authoritative_complete` permit hard route authority (AC: 3-4).
- [ ] Add `RP-01`-`RP-10` data to `tests/fixtures/planning-context-v6.ts`; extend `tests/trip-proposal-command-contract.test.ts`, and add DB-free validation/resolution/publisher tests in new `tests/route-registry.test.ts`, serial migration/release-CAS/proposal/fence/stale-release/set-clear-reopen coverage in new `tests/route-registry.integration.test.ts`, and traveler projection accessibility coverage in `tests/traveler-ui-foundation.test.ts` (AC: 1-4).
- [ ] Verify with `pnpm test:unit -- tests/trip-proposal-command-contract.test.ts tests/route-registry.test.ts tests/traveler-ui-foundation.test.ts`, `pnpm test:integration -- tests/route-registry.integration.test.ts`, `pnpm db:generate`, `pnpm typecheck`, and `pnpm build`; record exact environmental blockers (AC: 1-4).

## Dev Notes

- Free-text endpoint labels are query aids only. Never infer/backfill durable canonical choice from labels or model output.
- The four-field null rule is intentionally asymmetric by item type: non-transport items are always all-null; transport legs are either all-null or all-present. All-null transport legs remain valid historical/unselected state.
- Only the first two resolution states permit route authority. All other states must provide bounded Vietnamese next steps without live traffic, navigation, closure, nationwide, or safety guarantees.
- Consume Story 21.4 mode/fences; do not redefine planning authority or add a direct route-write endpoint.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.5]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29-AD-30-AD-35]
- [Source: packages/database/src/trip-plan-commands.ts]
- [Source: packages/database/src/traveler-proposal-commands.ts]
- [Source: tests/trip-proposal-command-contract.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Trip-Persistence-Delta]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Route-Registry-And-Resolution]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Canonical-Trip-Path-And-Route-Resolution]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.5` is normative. Guide AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
