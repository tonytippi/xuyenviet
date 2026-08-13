# Story 21.9: Keep A Current Chat-To-Trip Opportunity Available

Status: backlog

## Story

As a traveler, I want a persistent `Chuyển thành chuyến đi` action when chat has useful planning context, so that I can convert it when ready.

## Acceptance Criteria

1. Terminal useful unscoped profiled answers refresh one owner-bound persistent opportunity and CTA from canonical clarification claims, not flat `chat_context` or suppressed extraction.
2. The projection deterministically reduces eligible non-superseded claims, refreshes its manifest, suspends recoverable ambiguity/insufficiency, and protects against stale tabs.
3. Only explicit dismissal writes a decline fence; resolved context restores the suspended ID with a new manifest and later context creates a new opportunity.
4. UI consumes server projection, is keyboard/touch accessible, and refetches after terminal AI Ask events. Required `TC-01` through `05`, `11`, `12`, `14` through `16`, `19`, `20` pass.

## Tasks / Subtasks

- [ ] Evolve the existing `trip-recommendations.ts` aggregate and recommendation schema in place to opportunity/manifest state (AC: 1-3).
- [ ] Migrate contracts, domain ports, existing accept/decline controller/OpenAPI routes, direct API client, and composer from `decisionId` to `opportunityId`; no parallel endpoint (AC: 1-4).
- [ ] Refresh synchronously in existing AI Ask terminalization and render server-projected CTA state (AC: 1, 4).
- [ ] Validate `TripConversionProjectionPolicy` before eligibility and reject empty, over-limit, duplicate, conflicting, unknown-field, and schema-incompatible mappings; `TC-13` coverage is mandatory before this story can complete (AC: 1-3).
- [ ] Add DB-free projection/policy/presentation tests with `pnpm test:unit`, and serial PostgreSQL manifest/CAS/ownership/deletion plus API contract tests with local `resetTestDatabase()` where clean tables are required (AC: 1-4).

## Dev Notes

- AD-40/RTA-13: Chat/Trips owns closed opportunity transitions `eligible -> suspended|dismissed|consumed|invalidated` and `suspended -> eligible|invalidated`.
- One ordinary conversation has one current nonterminal opportunity and manifest. Pending newer turn is visible-disabled projection only, never dismissal.
- Manifest pins revisions, claims/value IDs, policy/schema/serialization versions, source watermark, typed payload, and digest. Fail closed for ambiguity, assumptions-only, unsupported or digest mismatch.
- No Worker, queue, feature flag, model purpose, service, or cache. Vietnamese-first copy and browser authority remain server-owned.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-40]
- [Source: packages/database/src/trip-recommendations.ts]
- [Source: apps/web/src/features/ai/ai-ask-composer.tsx]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Persistent-Chat-To-Trip-Conversion]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware-solution-design.md#Persistent-Chat-To-Trip-Conversion]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.9` is normative. Guide AC 1-4 map one-to-one to its four canonical criteria. `TC-13` is required before completion and before Story 21.10 starts.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
