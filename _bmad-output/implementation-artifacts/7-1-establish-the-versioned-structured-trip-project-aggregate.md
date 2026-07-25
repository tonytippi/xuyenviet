---
baseline_commit: 4e3442888ee71baf742fe35426685fe060af0a63
---

# Story 7.1: Establish the Versioned Structured Trip Project Aggregate

Status: review

## Story

As a traveler,
I want my Trip Project to own a structured plan and travel constraints,
so that confirmed trip state is durable, explicit, and separate from chat transcript context.

## Acceptance Criteria

1. **Versioned aggregate migration**
   - **Given** an authenticated owner has a Trip Project
   - **When** the Trip Planning migration is applied
   - **Then** the project can own versioned structured plan items and one versioned constraints record without changing ownership or deletion behavior of existing chat/project records.
   - **And** every new table, index, and constraint is introduced through Drizzle migrations.

2. **Structured plan-item discriminator and state**
   - **Given** a structured plan item is created or updated through the owning Chat/Trips command
   - **When** its kind is validated
   - **Then** it is exactly one of `anchor`, `leg`, or `activity`.
   - **And** an `anchor` has exactly one `anchorRole` of `origin`, `destination`, `region`, `required_stop`, or `accommodation` and no `type`.
   - **And** a `leg` or `activity` has exactly one `type` of `transport`, `visit`, `food`, `rest`, or `accommodation` and no `anchorRole`.
   - **And** every item has exactly one state: `idea`, `planned`, `confirmed`, or `backup`.

3. **Travel-only structured constraints**
   - **Given** an owner records trip constraints
   - **When** the record is persisted
   - **Then** it accepts only travel-relevant travelers/children, vehicle or EV needs, driving tolerance, budget range, preferences, and avoid-list data.
   - **And** sensitive personal data is rejected and never added to structured plan state.

4. **Owner-scoped deletion**
   - **Given** a Trip Project is deleted
   - **When** deletion completes
   - **Then** structured plan, constraints, and any future plan-derived retrievable state are removed or disabled from normal use with the rest of the owner-scoped project data.
   - **And** only minimal non-content audit metadata may remain.

## Scope And Boundaries

### In Scope

- Add the Trip Project aggregate version and the owner-scoped `trip_project_constraints` and `trip_plan_items` persistence model.
- Add Drizzle schema definitions, generated migration SQL, migration journal entry, and generated snapshot metadata.
- Establish database-safe constraints, indexes, owner/project foreign keys, and project-deletion behavior.
- Add narrow Chat/Trips-owned validation/persistence primitives only where necessary to make the aggregate safe and testable.
- Extend owner-scoped project deletion coverage for the structured records introduced here.
- Add focused database-backed tests for this aggregate's schema, ownership, deletion, privacy, and invariant behavior.

### Explicitly Out Of Scope

- Primary-conversation pointer or migration, and any change to historic conversation access (Story 7.2).
- Trip Home, plan timeline/read model, workspace UI, or a manual plan/constraint editor (Story 7.3 and later).
- AI proposal generation, proposal persistence, provider/table direct writes, or direct chat-context/transcript writes to plan state (Story 7.4).
- Proposal apply/dismiss/expiry actions and plan history (Story 7.5).
- Dynamic weather, route/ETA, maps/places, current location, provider snapshots, booking/availability, actual budget/expenses, checklist, vault, notifications, sharing, or collaboration.
- Adding future proposal/history tables early. Those entities begin only in Stories 7.4 and 7.5.

## Tasks / Subtasks

 - [x] Define the versioned aggregate schema and generated migration artifacts (AC: 1, 2, 3, 4)
  - [x] Extend `tripProjects` with a positive, defaulted current aggregate version; do not add `primaryConversationId` in this story.
   - [x] Add exported unions/constants and `tripProjectConstraints` with owner/project composite ownership, one row per project, positive version, timestamps, and project deletion binding. Persist only the canonical fields defined under **Constraint Field Contract**; do not use a generic JSON/document bucket. Reject unknown keys, arbitrary free-form profile fields, and all sensitive categories before persistence.
   - [x] Add exported unions/constants and `tripPlanItems` with owner/project composite ownership, kind discriminator, state, bounded label/notes, optional planned time, ordinal, item version, timestamps, parent reference, and backup target reference. Persist only the canonical location columns defined under **Plan-Item Location Contract**. Do not add exact GPS, provider, booking, route, or dynamic-data fields.
   - [x] Add database-enforceable checks: valid discriminator shape, valid item state, positive versions, scoped ordinal uniqueness, required backup target only for `backup`, and forbidden backup target otherwise. Root ordinal uniqueness must treat `parent_item_id = NULL` rows as the same root scope: use a reviewed PostgreSQL-safe `NULLS NOT DISTINCT` unique index if supported by the deployed PostgreSQL version, otherwise use equivalent separate root/child partial unique indexes.
   - [x] Add owner/project read and ordered-item indexes. Use the established composite owner/project foreign-key convention rather than only an unscoped project ID reference.
   - [x] Generate, inspect, and retain the next Drizzle migration, journal update, and schema snapshot. Do not hand-author SQL-only schema drift.

 - [x] Implement the minimum Chat/Trips aggregate command boundary (AC: 2, 3)
  - [x] Keep aggregate writes in `src/features/chat-trips`; server-authenticate and owner-scope every command.
   - [x] Do not expose a direct plan/constraint mutation command to UI, server actions, chat extraction, AI orchestration, or ordinary owner requests. If a primitive is needed now, keep it internal to Chat/Trips for database-backed tests and future `applyApprovedTripChange(...)`; only that future owner-confirmed proposal command may become the public persistent-plan writer.
   - [x] If this story introduces internal create/update/delete/reorder primitives, lock the owning project in a transaction and use this version protocol: project and new mutable rows start at version `1`; every successful plan or constraint mutation requires the expected current aggregate version and increments it exactly once; every existing item or constraints row whose persisted fields, parent, ordinal, or state change requires its expected version and increments its own version exactly once; creating a row starts it at `1`; deleting a row removes it while advancing the aggregate version. Reordering increments every existing item whose ordinal or parent changes. A stale aggregate/item version, missing row, or failed precondition writes nothing and returns a safe refresh-required result.
   - [x] Every successful internal aggregate mutation writes an actor-correct audit event in the same transaction with actor, target, operation, timestamp, and a non-content summary limited to IDs, operation/count/version metadata. Never audit constraint values, item labels/notes, location context, or transcript content; rejected/stale requests write no mutation audit.
   - [x] Validate cross-row rules that ordinary PostgreSQL `CHECK` constraints cannot prove: parent and backup target are same-project, only `activity` may be parented, parent is a `leg`, no cycles, and affected ordering scope is atomically renumbered.
   - [x] Treat `idea` as a valid open state. Treat `confirmed` only as owner confirmation or a real owner-supplied constraint; never infer booking, live route, weather, provider availability, or other external validation.
   - [x] Validate only the allowlisted travel-relevant constraint shape. Reject children full names, identity documents, payment data, medical details, exact home addresses, unknown keys, and arbitrary free-form sensitive fields before persistence.
   - [x] Do not alter `TripProjectInput`, legacy project metadata, `chat_context`, transcript extraction, AI Ask streaming, or existing answer-context behavior to duplicate or author the structured plan.

 - [x] Preserve and extend project deletion semantics (AC: 1, 4)
  - [x] Extend `deleteOwnedTripProject(...)` only as needed for structured aggregate cleanup and safe, non-content audit counts.
   - [x] Preserve the existing transactional owner lookup and project lock, explicit deletion of linked conversations, cascading dependent graph cleanup, and safe audit summaries.
   - [x] Ensure direct project deletion cannot leave structured plan or constraint rows usable; use project-owned cascade semantics where appropriate.
   - [x] Do not place constraint values, item labels, notes, or transcript content in audit summaries.

 - [x] Add focused database-backed regression tests (AC: 1, 2, 3, 4)
  - [x] Extend `tests/trip-projects.test.ts` unless aggregate-specific coverage makes a focused sibling test materially clearer.
   - [x] Verify migration-backed schema availability, constraints, indexes, and compatibility with existing owner/project conversation relationships.
   - [x] Verify one constraint row per project, owner isolation, every canonical constraint field/check, rejection/no persistence of unknown or sensitive fields, and bounded child age-range/comfort/preference values rather than child identity data.
   - [x] Verify valid item shapes and rejection of invalid kind/role/type/state/discriminator combinations, invalid backup shape, cross-project/cross-owner references, invalid activity hierarchy, cycles, and ordering conflicts. Prove duplicate ordinal rejection both for root anchors/legs with `parent_item_id IS NULL` and for children of the same leg.
   - [x] Verify the defined version protocol for every internal mutation primitive: versions begin at `1`; aggregate advances once per successful aggregate mutation; changed existing rows advance once; reordered rows advance when parent/ordinal changes; and stale expected versions leave all rows unchanged with a safe refresh-required result.
   - [x] Verify each successful internal mutation emits exactly one actor-correct, non-content audit record in its transaction and that stale/rejected requests emit neither plan changes nor mutation audits.
   - [x] Verify owned project deletion removes plan and constraint rows while retaining the existing linked-chat, context, derived-record cleanup, and non-content audit behavior.
   - [x] Run the focused Vitest suite, then `pnpm lint` and `pnpm typecheck`; record any environment blocker exactly.

## Dev Notes

### Product And Authority

- The active authority is the current PRD, architecture spine, `epics.md`, and the 2026-07-25 readiness assessment. An older `epic-7-context.md` under implementation artifacts describes an incompatible UI-focused Epic 7 and must not guide this story.
- Epic 7 follows the completed Chat/Trips baseline. Its sequence is aggregate (7.1), primary conversation (7.2), Trip Home (7.3), typed AI proposals (7.4), terminal proposal actions/history (7.5), then safety verification (7.6).
- The primary conversation is the exclusive future authoring surface. This story establishes persistence and safe Chat/Trips ownership; it must not create a manual editor or permit AI/chat extraction to mutate structured plan state.

### Aggregate Contract

- Chat/Trips exclusively owns one single-owner Trip Project aggregate. Every new row must be owner-scoped and tied to its project using composite owner/project integrity.
- Keep structured state separate from legacy `trip_projects` metadata, `chat_context`, and conversation transcript content. Do not silently migrate legacy origin/destination/dates/travelers/notes or extracted chat context into confirmed structured records.
- `trip_project_constraints` is exactly one versioned row per project. Store only structured, bounded travel-relevant data: travelers/children, vehicle or EV needs, driving tolerance, budget range, preferences, and avoid-list values.
- Constraints are an explicit allowlist, not a generic JSON/document bucket. The exact persisted field shapes and bounds are defined under **Constraint Field Contract**. Reject unknown keys and arbitrary free text that could carry sensitive personal data; never store child names, identity/payment/medical data, exact home addresses, actual expenses, or provider-derived state.
- Each `trip_plan_item` requires project ID, owner ID, kind, matching role/type discriminator, state, ordinal, positive version, timestamps, and bounded label/notes. `label` is required trimmed single-line text from `1` through `160` characters; `notes` is nullable trimmed text from `1` through `1,000` characters when present. Planned date/time is optional. The exact transport/accommodation location columns, their type-specific nullability, and bounds are defined under **Plan-Item Location Contract**. These fields let Story 7.3 identify deterministic confirmed-item gaps without inferring from labels or notes; they are not exact GPS, Maps/Places, booking, provider, or live-route data.
- Parent and alternative references never cross project boundaries. An activity may be a child only of a leg. Root anchors and legs use `parent_item_id = NULL`; ordering scope is exactly `(trip_project_id, parent_item_id)`, including the null root scope.
- A backup references exactly one same-project item it substitutes for. Non-backup items have no alternative target. Cycles are invalid.
- Enforce null-inclusive ordinal uniqueness at the database layer: a regular PostgreSQL composite unique index is insufficient because it permits repeated `NULL` parent values. Use verified `NULLS NOT DISTINCT` support or equivalent root/child partial indexes, and test both scopes directly.
- A project-level current aggregate version and mutable row versions are future conflict fences. They all start at `1`. Each successful aggregate mutation must compare the expected aggregate version, increment it once, compare/increment every changed existing item or constraints version once, and increment each reordered item's version when its parent/ordinal changes. Creates begin at `1`; deletes advance only the aggregate. A mismatch is an all-or-nothing, safe refresh-required result.
- Every successful aggregate mutation records an actor-correct audit event in the same transaction. Its safe summary may contain operation, target IDs, counts, and version transitions only; it never contains structured plan/constraint content. Rejected or stale requests create neither a plan mutation nor an audit event.

### Database Versus Command Validation

- PostgreSQL constraints should enforce local shape: enumerated values, discriminator nullability, one constraints row, positive versions, valid backup nullability, scoped ordinal uniqueness, bounded database-safe fields, foreign keys, and indexes.
- Enforce plan-item label/notes bounds at the database layer: label is required, trimmed, single-line text of `1..160` characters; notes are nullable trimmed text of `1..1,000` characters when present. The command validator must apply the same normalization before persistence.
- Do not claim that a plain `CHECK` enforces cross-row rules. Same-project parent/alternative validation, activity-under-leg, cycle prevention, version fencing, project locking, and atomic affected-scope renumbering require transactional Chat/Trips command validation unless a deliberately reviewed database mechanism is introduced.
- PostgreSQL `CHECK` constraints and JSON type checks cannot establish the semantic privacy allowlist alone. The internal Chat/Trips validation boundary must reject unknown constraint keys and forbidden/sensitive values before insert/update; tests must prove rejected input leaves no structured row or partial update behind.

### Constraint Field Contract

- Use named columns for scalar values and typed, bounded JSON arrays only where a repeated collection is required. The constraints table has no catch-all metadata, notes, profile, or arbitrary JSON column.
- `adult_count` and `child_count` are nullable integers from `0` through `20`. At least one is non-null when a constraints row is written; their non-null sum is between `1` and `20`.
- `children` is nullable JSONB containing at most `10` objects, each exactly `{ ageMin, ageMax, comfortTags, preferenceTags }`. `ageMin` and `ageMax` are integers from `0` through `17` with `ageMin <= ageMax`. `comfortTags` and `preferenceTags` are arrays of at most `6` values each, selected only from the exported enums below; no names, free-text descriptions, medical information, or other keys are permitted.
- `childComfortTag` values are exactly `car_seat`, `stroller`, `nap_breaks`, `short_drive_blocks`, and `quiet_time`. `childPreferenceTag` values are exactly `animals`, `beach`, `culture`, `food`, `nature`, `outdoor`, and `playground`.
- `vehicle_type` is nullable and exactly `car`, `motorcycle`, or `ev`. `ev_charging_need` is nullable and exactly `none`, `preferred`, or `required`; it is null unless `vehicle_type = 'ev'`.
- `driving_tolerance_hours` is nullable numeric/integer from `1` through `12` in whole hours. `budget_currency` is nullable and, when a budget exists, exactly `VND`; `budget_min_vnd` and `budget_max_vnd` are nullable non-negative integers no greater than `1_000_000_000`, supplied together with `budget_min_vnd <= budget_max_vnd`.
- `preference_tags` is a nullable JSONB array of at most `20` values selected only from `beach`, `culture`, `family_friendly`, `food`, `nature`, `quiet`, `road_trip`, and `scenic_route`. `avoid_items` is a nullable JSONB array of at most `20` objects, each exactly `{ category, label }`, where `category` is `place` or `activity` and `label` is trimmed, single-line text from `1` through `120` characters. It records only a place/activity to avoid, never a person, address, account, health, or identity detail.
- Use database checks for scalar ranges, paired budget/EV shapes, JSON array/object types, collection cardinalities where practical, and non-empty bounded labels. Use the internal Chat/Trips validator for exact JSON object keys, enum membership, duplicate tags/items, sensitive-data rejection, and all request-shape validation. Tests must cover both layers.

### Plan-Item Location Contract

- `transport_origin_label` and `transport_destination_label` are nullable text columns, each trimmed, single-line, and from `1` through `160` characters when present. They are permitted only when item `type = 'transport'`; all other kinds/types must store both as null.
- `accommodation_place_area_label` is a nullable text column, trimmed, single-line, and from `1` through `160` characters when present. It is permitted only when item `type = 'accommodation'`; all other kinds/types must store it as null.
- Null means the owner has not supplied that context. A confirmed transport item is a Trip Home gap when planned time, origin label, or destination label is null; a confirmed accommodation item is a gap when planned time or place/area label is null. No label/notes parsing is allowed to fill these fields.
- Enforce type-specific nullability and label bounds with database checks. The internal validator trims input and rejects unexpected location fields. Test valid typed contexts, invalid cross-type contexts, bounds, and null/missing contexts used by the later deterministic gap rule.

### Existing Code To Preserve

- `src/db/schema.ts` defines the existing `tripProjects` owner composite key and the `conversations` and `chatContext` composite owner/project foreign keys. Match this style with `pgTable`, typed string union values, `check`, `foreignKey`, `index`, and `uniqueIndex`.
- `src/features/chat-trips/trip-projects.ts` is the established authenticated, owner-scoped project command/read boundary. Its delete path locks the owned project, explicitly deletes linked conversations, then deletes the project and writes a non-content audit summary.
- Story 7.1 must not make this module a second public plan-authoring API. Any aggregate mutation helper remains internal/test-only until Story 7.5's `applyApprovedTripChange(...)` performs owner-confirmed proposal application.
- Direct DB deletion currently detaches a conversation's `trip_project_id` through `ON DELETE SET NULL`; application-level `deleteOwnedTripProject(...)` deliberately deletes linked conversations. New aggregate cleanup must preserve both established behaviors rather than weakening the application deletion graph.
- `src/features/chat-trips/context-extraction.ts` and `answer-context.ts` use contextual/legacy data. They are compatibility surfaces only and must not become structured-plan writers in this story.
- Keep existing UI/action/API behavior unchanged. No Story 7.1 UI, route, server action, or streaming change is required unless a constrained owner command is strictly necessary for aggregate safety.

### Migration Requirements

- Drizzle owns all persistence evolution. Generate migration artifacts from `src/db/schema.ts` using `pnpm db:generate`; retain the matching SQL file, `drizzle/migrations/meta/_journal.json` entry, and generated snapshot.
- The migration series is already long and its snapshot chain has required repair before. Verify generated metadata consistency and do not substitute an untracked SQL file.
- Test global setup runs `pnpm exec drizzle-kit migrate` against the test database before the suite, so normal tests exercise migration integrity.

### Testing Requirements

- Follow the existing Vitest pattern: real PostgreSQL/Drizzle inserts, `vi.doMock("@/server/auth", ...)`, and dynamic import of the server module after the auth mock.
- Tests run serially and reset all public tables with `TRUNCATE ... CASCADE`; test database migrations execute during global setup.
- Cover DB invariants directly and command behavior separately. A mocked database cannot prove the migration/FK/check/unique-index contract.
- Relevant commands: `pnpm vitest run tests/trip-projects.test.ts`, `pnpm test:run`, `pnpm lint`, `pnpm typecheck`, `pnpm db:generate`, and `pnpm db:migrate`.

### Library And Framework Requirements

- Use the repository-pinned Next.js 15.3.5, React 19.1.0, TypeScript 5.8.3 strict mode, Drizzle ORM 0.44.5, Drizzle Kit 0.31.4, PostgreSQL, pnpm 10.26.2, and Vitest 4.1.10 patterns. No additional library is needed for this persistence story.
- Use `server-only` on protected server modules, `@/*` imports under `src`, explicit types, and safe operational errors. Do not add `any`, generic cross-module table helpers, or a separate service/package.

### Project Structure Notes

- Update: `src/db/schema.ts` for aggregate schema and exported types.
- Update: `src/features/chat-trips/trip-projects.ts` only for aggregate command/deletion behavior that is required in this story.
- Update: `tests/trip-projects.test.ts` for the existing owner/deletion baseline and aggregate coverage; a focused `tests/trip-planning-aggregate.test.ts` is acceptable only if it makes the DB invariant coverage materially clearer.
- New generated files: one next-numbered migration under `drizzle/migrations/` and its corresponding metadata journal/snapshot files.
- Do not modify AI orchestration, retrieval, UI, route selection, primary-conversation, proposal, or history modules in this story.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7: Controlled Trip Project Planning]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.1: Establish the Versioned Structured Trip Project Aggregate]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.7 Trip Planning Foundation Contract]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.2 User Authentication, Chats, And Trips]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-3: Drizzle Owns Schema And Migrations]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-5: Feature Ownership Boundaries Are Explicit]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Mutations Are Server-Side And Audited]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13: Users Delete Their Own Chats And Trip Projects]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29: Trip Planning Is A Chat/Trips-Owned Structured Aggregate]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30: Primary Conversation And Change Proposals Are Explicit Commands]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-25.md#Epic 7: Controlled Trip Project Planning]
- [Source: _bmad-output/project-context.md#Technology Stack & Versions]
- [Source: src/db/schema.ts#tripProjects]
- [Source: src/features/chat-trips/trip-projects.ts#deleteOwnedTripProject]
- [Source: tests/trip-projects.test.ts#Trip project helpers]

## Dev Agent Record

### Agent Model Used

OpenCode gpt-5.6-terra-review

### Debug Log References

- BMad workflow customization resolved successfully; no prepend or append activation steps were configured.
- Exhaustive source analysis completed across active PRD, architecture, Epic 7, readiness assessment, project context, current schema, Chat/Trips service, test harness, and recent Git history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story scope is intentionally limited to the versioned structured aggregate and its deletion/validation foundations; primary conversation, UI, AI proposals, proposal actions, and history remain assigned to Stories 7.2 through 7.5.
- Story validation completed against the installed create-story checklist: the final artifact identifies existing ownership/deletion patterns, prevents duplicate authoring paths and premature schema, distinguishes DB-safe constraints from transactional validation, cites authoritative sources, and defines focused test coverage.
- Implemented the versioned, owner-scoped structured Trip Project aggregate with DB-enforced discriminator, version, ordinal, content-bound, and deletion constraints. Internal Chat/Trips-only primitives fence aggregate and row versions, reject unsafe inputs/references, atomically reorder scopes, and write content-free audit metadata.
- Generated and inspected `0060_damp_carlie_cooper` with matching journal/snapshot metadata. The generated SQL was applied successfully to a clean Story 7.1 test baseline; `pnpm db:migrate` against the configured non-test database remains blocked because that database has not applied pre-existing migration history through Story 7.1.
- Verification passed: `pnpm vitest run tests/trip-projects.test.ts` (14 tests), `pnpm test:run` (50 files, 751 tests), `pnpm lint` (0 errors; 3 pre-existing warnings in `tests/knowledge-search.test.ts`), `pnpm typecheck`, `pnpm db:generate`, and `git diff --check`.
- Recovery repair: reproduced the `7741622613bf8b35ed0f84405ef42c2597b8d09b` constraint-boundary defect where falsy malformed JSON reached the database. The validator now rejects malformed/sensitive constraint shapes and invalid scalar enums before the transaction; focused regression coverage proves rejected creates write no constraint row or audit and rejected updates preserve the existing row, aggregate version, and audit count.

### File List

- _bmad-output/implementation-artifacts/7-1-establish-the-versioned-structured-trip-project-aggregate.md
- src/db/schema.ts
- src/features/chat-trips/trip-projects.ts
- tests/trip-projects.test.ts
- _bmad-output/implementation-artifacts/sprint-status.yaml
- drizzle/migrations/0060_damp_carlie_cooper.sql
- drizzle/migrations/meta/0060_snapshot.json
- drizzle/migrations/meta/_journal.json

### Change Log

- 2026-07-25: Implemented the versioned structured Trip Project aggregate, generated its Drizzle migration, added database-backed regression coverage, and moved the story to review.
- 2026-07-25: Repaired the AC 3 constraint validation/persistence boundary; malformed or sensitive input now returns `invalid` before persistence, and focused tests prove no rejected-write audit or partial update.
