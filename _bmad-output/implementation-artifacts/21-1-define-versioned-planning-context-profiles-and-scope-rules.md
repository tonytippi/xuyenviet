# Story 21.1: Define Versioned Planning Context Profiles And Scope Rules

Status: backlog

## Story

As a traveler, I want XuyenViet to recognize the details material to each part of my request, so that it asks only relevant questions without leaking preferences between days, stops, meals, or stays.

## Acceptance Criteria

**Given** a profiled request asks for an itinerary, route comparison, accommodation, food, activity, or mixed planning deliverables
**When** Retrieval resolves the applicable planning-context profiles
**Then** every deliverable instance receives an immutable profile with typed fields, materiality, conditional applicability, allowed scopes, value validation, precedence, completeness, and safe-assumption policy
**And** readiness cannot be declared from prompt prose, model confidence, global traveler completeness, or an undeclared context key.

**Given** a planning request contains journey, day-range, leg, place, destination-stay, transit-stay, meal, activity, group, or deliverable scope
**When** its proposed scope graph is validated
**Then** the graph uses the versioned relation comparator and deterministic `equal`, `ancestor`, `descendant`, `overlap`, `sibling`, or `unrelated` result
**And** cycles, duplicate nodes, orphan parents, invalid references, and policy limits for nodes, instances, depth, parents, values, and text lengths are rejected without partial persistence.

**Given** a traveler specifies a nicer Đà Nẵng destination stay and simple sleep-only transit stays
**When** effective values are evaluated
**Then** strict ancestry or an explicit profile precedence rule applies each value only to its compatible subtree
**And** incomparable overlap becomes ambiguous rather than latest-write-wins or journey-wide leakage.

**Given** the profile, plan policy, scope comparator, or value schema changes
**When** a session, answer claim, fixture result, or evaluation result is created
**Then** it pins the exact versions used
**And** `CLAR-01`, `CLAR-07`, `CLAR-08`, `CLAR-13`, `CLAR-21`, `CLAR-22`, and `CLAR-23` remain executable canonical cases for FR-5, RTA-11, and RTA-12.

## Tasks / Subtasks

- [ ] Define browser-safe closed types, exact-key parsers, and version-reference contracts in new `packages/contracts/src/planning-context.ts`, then export them from `packages/contracts/src/index.ts`; keep traveler-free profile semantics out of the contracts package (AC: 1-4).
- [ ] Implement the Retrieval-owned immutable catalog, deliverable resolver, plan-policy validator, deterministic graph identity/coalescing, completeness evaluator, and pure scope comparator in new `packages/database/src/planning-context-profiles.ts`, then export that feature from `packages/database/src/index.ts` (AC: 1-3).
- [ ] Add only reusable profile/policy/value-schema version records to `packages/database/src/schema.ts` and create forward migration `drizzle/migrations/0066_add_planning_context_profiles.sql`; do not create conversation sessions, claims, values, or attempt rows in this story (AC: 1, 4).
- [ ] Add canonical executable inputs for `CLAR-01`, `CLAR-07`, `CLAR-08`, `CLAR-13`, and `CLAR-21`-`CLAR-23` in new `tests/fixtures/planning-context-v6.ts`; add DB-free resolver/identity/coalescing coverage in new `tests/planning-context-profiles.test.ts` and serial schema/migration coverage in new `tests/planning-context-profiles.integration.test.ts` (AC: 1-4).
- [ ] Verify with `pnpm test:unit -- tests/planning-context-profiles.test.ts`, `pnpm test:integration -- tests/planning-context-profiles.integration.test.ts`, `pnpm db:generate`, and `pnpm typecheck`; record any environmental database blocker exactly rather than weakening a fixture or assertion (AC: 1-4).

## Dev Notes

- This is the vocabulary foundation for 21.2-21.12. `packages/contracts` owns only browser-safe shapes/parsers; Retrieval owns profile semantics, validation, comparison, and pure completeness. Chat/Trips must not duplicate them or write a global traveler profile.
- Every field pins type/schema version, materiality, condition, permitted scopes, validation, precedence, and safe-assumption rule. Bound node/instance/depth/parent/value/text sizes deterministically.
- Validated graphs retry to the same identity and deterministically coalesce equivalent deliverables; no consumer may infer profile identity from prose or a global completion flag.
- Do not add a service, queue, Worker loop, or environment configuration. New durable data requires deletion semantics when later chat/Trip-derived rows are introduced.
- Session, answer-claim, and plan/extraction-attempt persistence belongs to Story 21.2. Story 21.1 supplies only the version references those rows will pin.

### Project Structure Notes

- Use explicit feature exports. `packages/database/src/source-bundle.ts` is legacy retrieval assembly, not an owner for mutable clarification state.
- Keep strict TypeScript and forward-only Drizzle migration conventions.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-39]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Multi-Turn-Clarification-And-Scoped-Context]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Multi-Turn-Clarification-And-Scoped-Preferences]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.1` is normative. Guide AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
