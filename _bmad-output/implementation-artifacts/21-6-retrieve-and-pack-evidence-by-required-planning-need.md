# Story 21.6: Retrieve And Pack Evidence By Required Planning Need

Status: backlog

## Story

As a traveler, I want answers to cover important needs of my trip rather than merely related cards, so that missing guidance remains visible and actionable.

## Acceptance Criteria

**Given** a ready planning execution enters Retrieval
**When** the intent profile expands its needs
**Then** it creates deterministic versioned requirement keys with exact facet, importance, scope/leg, constraint, and freshness identity before candidate generation
**And** it validates current owner-row eligibility, resolves canonical geographic/facet authority, and persists a deterministic scope-first allowlist with stable order and bounded candidate inputs before lexical retrieval.

**Given** a deterministic scope-first allowlist exists
**When** the versioned field-aware lexical stage generates candidates
**Then** it searches only that allowlist using title, type, canonical route/location, summary, tags, and policy-allowlisted practical-detail fields
**And** source labels, URLs, publishers, capture/provenance/evidence/provider metadata, and other source metadata cannot create or improve lexical relevance.

**Given** the G0 deployed PostgreSQL/provider/Vietnamese lexical spike result is recorded
**When** Retrieval selects its v6 lexical implementation
**Then** PostgreSQL FTS activates only after deployability, candidate-recall, and critical false-exclusion gates pass
**And** otherwise `v6_active` uses the deterministic indexed field-aware lexical implementation and keeps FTS inactive.

**Given** candidate evidence contains mixed facts, different legs, duplicate coverage, or an off-scope high-prestige source
**When** eligibility and contribution decisions run
**Then** each contribution binds one exact eligible fact, owner/capture revision, scope/freshness decision, requirement key, and permitted render variant
**And** one fact, leg, source reputation, similarity score, or card-level shortcut cannot authorize another need or scope.

**Given** token, candidate, or source-handle capacity cannot retain every contribution
**When** the selector and final prompt packer run
**Then** consequential route, safety, and traveler constraints take priority and stable pre-cap telemetry records eligible exclusions
**And** every dropped required need becomes an explicit `missing`, `requires_verification`, or `requires_clarification` outcome before model generation.

**Given** one exact contribution covers the only required need or three cards leave a required need uncovered
**When** final coverage is recomputed from the prompt-render manifest
**Then** the first request is sufficient without count-only web fallback and the second keeps the gap despite its card count
**And** `RN-01` through `RN-07`, lexical allowlist/source-metadata/order/bound/fallback fixtures, FR-61..62, SC-8, SC-10, and AC-31 pass, including literal-zero hard-off-route, unrelated-need satisfaction, source-metadata leakage, and critical hard-filter/cap false exclusion.

## Tasks / Subtasks

- [ ] In `packages/database/src/schema.ts` and `drizzle/migrations/`, add one forward migration for Retrieval-owned runs, requirement keys, fact-bound contributions, outcomes, scope-first allowlists, pre-cap exclusions, and immutable selection manifests; export only aggregate-owned row types and transaction-aware ports from `packages/database/src/retrieval-required-needs.ts` and `packages/database/src/index.ts` (AC: 1, 4).
- [ ] In `packages/database/src/knowledge-search.ts` and `packages/database/src/approved-knowledge.ts`, replace source-metadata-weighted document scoring with the versioned field-aware projection over title, type, canonical route/location, summary, tags, and policy-allowlisted practical details; constrain candidate generation to the persisted allowlist with stable bound/order and pin the lexical/search-projection versions (AC: 1-3).
- [ ] In `packages/database/src/retrieval-required-needs.ts` and `packages/database/src/source-bundle.ts`, expand the pinned intent profile into deterministic requirement keys, bind each eligible atomic fact to one requirement/leg and render variant, prioritize consequential requirements, and persist `eligible_but_cap_excluded` plus explicit gap outcomes without retiring the legacy count trigger (AC: 1-5).
- [ ] In `packages/database/src/source-bundle.ts`, recompute final outcomes exclusively from the final prompt-render manifest after packing, owner/capture revision revalidation, and source-handle pressure immediately before provider generation; expose immutable prepared inputs for Story 21.8 without implementing its terminal transaction (AC: 4-6).
- [ ] In `_bmad-output/implementation-artifacts/evidence/story-21-6/g0-vietnamese-lexical-spike.md`, record the exact deployed PostgreSQL/provider version, Vietnamese corpus, SQL/CLI commands executed, allowlist/candidate bounds, recall and critical false-exclusion results, and the pass/fail decision. In `packages/database/src/knowledge-search.ts`, activate FTS only for a recorded passing result; otherwise select and test the deterministic indexed field-aware fallback (AC: 2-3, 6).
- [ ] In `tests/retrieval-required-needs.test.ts` and `tests/knowledge-search.test.ts`, add DB-free identity, coalescing, lexical field-isolation, stable-order, capacity, and `RN-01` through `RN-07` coverage; in `tests/retrieval-required-needs.integration.test.ts`, add serial PostgreSQL allowlist, owner-row revalidation, immutable provenance, pre-cap telemetry, revocation-before-render, and prompt-manifest recomputation coverage with local `resetTestDatabase()` setup (AC: 1-6).

### Verification

- `pnpm test:unit -- tests/retrieval-required-needs.test.ts tests/knowledge-search.test.ts`
- `pnpm test:integration -- tests/retrieval-required-needs.integration.test.ts`
- `pnpm typecheck`
- `pnpm exec drizzle-kit check`
- `git diff --check`

### Block If

- Stories 21.1, 21.4, and 21.5 are not complete or their pinned profile, `PlanningExecutionRef`, and route-resolution contracts are unavailable.
- FTS activation is blocked when `_bmad-output/implementation-artifacts/evidence/story-21-6/g0-vietnamese-lexical-spike.md` is absent, incomplete, or failing. No repository spike runner exists at story creation time; record the exact commands actually executed rather than inventing a passing script. This blocks FTS only: the story must proceed with the deterministic indexed field-aware fallback.

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
