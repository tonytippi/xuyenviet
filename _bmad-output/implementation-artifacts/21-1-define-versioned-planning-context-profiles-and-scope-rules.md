# Story 21.1: Define Versioned Planning Context Profiles And Scope Rules

Status: backlog

## Story

As a traveler, I want XuyenViet to recognize the details material to each part of my request, so that it asks only relevant questions without leaking preferences between days, stops, meals, or stays.

## Acceptance Criteria

1. Immutable typed profiles cover every itinerary, route, stay, food, activity, and mixed deliverable instance; readiness never derives from prose, confidence, global completeness, or undeclared keys.
2. The versioned scope comparator returns only `equal`, `ancestor`, `descendant`, `overlap`, `sibling`, or `unrelated`; invalid graphs and policy-limit violations reject atomically.
3. Values apply only through strict ancestry or declared precedence; incomparable overlap stays ambiguous.
4. Sessions, claims, fixtures, and evaluations pin exact profile, policy, comparator, and schema versions. `CLAR-01`, `CLAR-07`, `CLAR-08`, `CLAR-13`, `CLAR-21` through `CLAR-23` remain executable.

## Tasks / Subtasks

- [ ] Define browser-safe profile catalog/resolver for itinerary, route, stay, food, activity, mixed, and `general_planning` deliverables; define policy, scope-graph, validation, comparator, completeness, deterministic graph identity, and coalescing contracts in `packages/contracts/src/index.ts` (AC: 1-4).
- [ ] Implement Retrieval-owned immutable profile/policy validation and pure scope comparison; reject invalid graphs before persistence (AC: 1-3).
- [ ] Add only the profile/policy and required immutable version persistence to `packages/database/src/schema.ts` with a forward migration; do not prebuild Story 21.2 session state (AC: 1, 4).
- [ ] Pin profile/policy/comparator/schema identities in every session, claim, fixture, and evaluation contract; add DB-free resolver/identity/coalescing fixture coverage and serial migration coverage (AC: 1-4).

## Dev Notes

- This is the vocabulary foundation for 21.2-21.12. Retrieval owns profile semantics and pure completeness; Chat/Trips must not duplicate them or write a global traveler profile.
- Every field pins type/schema version, materiality, condition, permitted scopes, validation, precedence, and safe-assumption rule. Bound node/instance/depth/parent/value/text sizes deterministically.
- Validated graphs retry to the same identity and deterministically coalesce equivalent deliverables; no consumer may infer profile identity from prose or a global completion flag.
- Do not add a service, queue, Worker loop, or environment configuration. New durable data requires deletion semantics when later chat/Trip-derived rows are introduced.
- Unit tests: `pnpm test:unit`; schema/migration tests: serial `pnpm test:integration`, with local `resetTestDatabase()` when tables must be clean.

### Project Structure Notes

- Use explicit feature exports. `packages/database/src/source-bundle.ts` is legacy retrieval assembly, not an owner for mutable clarification state.
- Keep strict TypeScript and forward-only Drizzle migration conventions.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-39]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Multi-Turn-Clarification-And-Scoped-Context]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#CLAR]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.1` is normative. Guide AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
