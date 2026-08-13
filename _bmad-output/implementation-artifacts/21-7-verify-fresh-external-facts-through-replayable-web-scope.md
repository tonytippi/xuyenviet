# Story 21.7: Verify Fresh External Facts Through Replayable Web Scope

Status: ready-for-dev

## Story

As a traveler, I want changing external information checked for the exact place, route, and time, so that unrelated or old warnings are not presented as live route authority.

## Acceptance Criteria

1. Before Search, Retrieval persists an immutable minimized query-plan manifest containing requirement keys, canonical allowed scope terms, excluded private-context classes, query-builder and provider-request-policy versions, policy versions, and digest.
2. Fact assertions pin capture, text, parser, segmentation, registry, and resolver versions; one query-specific decision binds one assertion to one requirement/leg.
3. Mismatched, ambiguous, or unknown facts cannot satisfy coverage. Provider failure preserves a gap and practical recovery.
4. Replay with identical dependencies reproduces a decision; changed dependencies create an immutable projection. `WS-01` through `WS-07` pass.

## Tasks / Subtasks

- [ ] Evolve `web-search.ts` and `source-bundle.ts` to require need-specific admission/minimized scope from Story 21.6's immutable requirement key and Story 21.5's route/scope resolution, preserving run/leg/version fences (AC: 1-4).
- [ ] Add immutable query, capture/fact assertion, projection, and scope-decision persistence via forward migration (AC: 1-4).
- [ ] Integrate through prepared/finalized owner ports only; do not emit an answer before render provenance exists (AC: 2-3).
- [ ] Add privacy, ordering, replay, provider-failure, exact-scope, query-to-capture-to-fact-to-decision-to-contribution-to-render provenance-chain, and `WS-01`-`WS-07` tests; verify rendered warnings contain source, applicable place/time, unverified status, and a practical action (AC: 1-4).

## Dev Notes

- Available private context is not authorization. Never send notes, child details, budgets, or preferences unless explicitly permitted by the exact key.
- A warning retains source/place/time, unverified status, and verification action; it must never become live closure, traffic, navigation, or guaranteed-safety authority.
- Retrieval owns decisions; AI Orchestration owns prompt-render/provenance. Add no endpoint, service, worker loop, or runtime configuration authority.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.7]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-35-and-AD-36]
- [Source: packages/database/src/web-search.ts]
- [Source: tests/web-search-quality.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Replayable-Web-Scope]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Web-Scope]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
