# Story 21.6: Retrieve And Pack Evidence By Required Planning Need

Status: backlog

## Story

As a traveler, I want answers to cover important needs of my trip rather than merely related cards, so that missing guidance remains visible and actionable.

## Acceptance Criteria

1. Retrieval validates owner-row eligibility, resolves canonical geographic/facet authority, persists a deterministic scope-first allowlist with stable order and bounded inputs, and creates deterministic versioned requirement keys before candidate generation.
2. Each contribution binds one eligible fact, revisions, scope/freshness decision, requirement key, and render variant; no card-level shortcut satisfies another need.
3. Capacity pressure prioritizes consequential needs, records deterministic exclusions, and makes every dropped required need `missing`, `requires_verification`, or `requires_clarification` before generation.
4. Final coverage recomputes from the prompt-render manifest, not card count. The lexical stage searches only the allowlist with field-aware fact fields; source metadata cannot affect relevance. FTS activates only after its G0 gate, otherwise deterministic indexed field-aware lexical remains active. `RN-01` through `RN-07` and lexical allowlist/isolation/order/bound/fallback fixtures pass.

## Tasks / Subtasks

- [ ] Add Retrieval-owned requirement, contribution, outcome, and selection-manifest schema/migration and owner ports (AC: 1-4).
- [ ] Evolve `source-bundle.ts`, `approved-knowledge.ts`, and `knowledge-search.ts` around required-need contributions; recompute outcomes from the final prompt-render manifest after packing, version revocation, and source-handle pressure, immediately before generation (AC: 1-4).
- [ ] Persist/pin the allowlist, lexical implementation/version, search input projection version, stable candidate bound/order, and pre-cap exclusions. Search only title, type, canonical route/location, summary, tags, and allowlisted practical details; exclude source/provenance/evidence/provider metadata from lexical relevance (AC: 1, 4).
- [ ] Record the G0 deployed PostgreSQL/provider/Vietnamese FTS spike result; use FTS only when its deployability, recall, and critical false-exclusion gates pass, otherwise keep deterministic indexed field-aware lexical active (AC: 4).
- [ ] Prepare immutable retrieval inputs for existing finalization without taking Story 21.8 ownership (AC: 1-3).
- [ ] Add pure identity/coverage tests and serial immutable provenance/capacity tests covering stable pre-cap telemetry, `eligible_but_cap_excluded`, and all `RN-01`-`RN-07` fixtures (AC: 1-4).

## Dev Notes

- Requirement identity includes intent-profile version, facet, importance, scope/leg, constraint, and freshness. Final coverage comes exclusively from the prompt-render manifest.
- Consume Story 21.1 profile identities, Story 21.4 `PlanningExecutionRef`, and Story 21.5 route-resolution output with their pinned fences; stale inputs fail closed rather than being re-derived from chat or Trip rows.
- Retrieval is sole writer for runs, keys, contributions, outcomes, and selection manifests; AI Orchestration may coordinate but cannot write Retrieval tables.
- Do not retire the legacy target-count trigger in this story; Story 21.12 owns behavioral retirement and Story 21.16 owns later physical cleanup after G3.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-34-and-AD-36]
- [Source: packages/database/src/source-bundle.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Required-Needs-And-Coverage]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Required-Need-Coverage-And-Capacity]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.6` is normative. Guide AC 1 maps to canonical allowlist/key creation, AC 2 to fact-bound contribution safety, AC 3 to capacity outcomes, and AC 4 to final coverage plus lexical isolation/fallback proof. Completion must satisfy both documents.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
