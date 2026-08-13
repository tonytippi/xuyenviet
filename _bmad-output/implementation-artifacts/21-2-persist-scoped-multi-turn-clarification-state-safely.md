# Story 21.2: Persist Scoped Multi-Turn Clarification State Safely

Status: backlog

## Story

As a traveler, I want valid answers to accumulate across clarification turns, so that XuyenViet asks only for missing details without losing, mixing, or silently replacing prior answers.

## Acceptance Criteria

**Given** a new profiled intent has a validated clarification plan
**When** Chat/Trips initializes or evolves its clarification session
**Then** it atomically persists the owner-bound immutable graph revision, typed deliverable instances, current field states, exact conversation content revision, and pinned profile/policy identities
**And** retries are idempotent by plan attempt while stale, terminal, deleted, cyclic, partial, or unvalidated plans change nothing.

**Given** the server asks for trip direction, vehicle, and party composition
**When** the traveler replies naturally with only vehicle and party information
**Then** `reduceClarificationMessage(...)` preserves both validated values with exact UTF-16 message-evidence spans and recomputes only affected instances
**And** the next state still identifies direction as missing without clearing prior values or inventing a default.

**Given** later replies contradict an equal-scope value, refine a narrower scope, arrive out of order, or are delivered more than once
**When** the reducer validates owner, message order, expected session/content revisions, extraction identity, and scope rules
**Then** ambiguity is retained for clarification, valid narrow overrides remain local, and exactly one legal compare-and-swap reduction commits
**And** stale or duplicate work cannot overwrite newer, ready, claimed, completed, abandoned, superseded, or deleted state.

**Given** one mixed session contains lodging, food, and activity instances
**When** only some instances become ready or complete
**Then** readiness and answer claims remain per instance, independently ready work excludes blocked siblings, and the parent stays active until every instance is completed or abandoned
**And** `CLAR-02`, `CLAR-03`, `CLAR-09`, `CLAR-11`, `CLAR-14`, `CLAR-24`, `CLAR-25`, and `CLAR-26` pass in unit and serial integration coverage for FR-5, RTA-11, and RTA-12.

## Tasks / Subtasks

- [ ] Extend `packages/database/src/schema.ts` and add forward migration `drizzle/migrations/0067_add_planning_clarification_state.sql` with two separately owned groups: AI Orchestration-owned immutable plan/extraction-attempt rows keyed by AI Ask command, source message, expected session revision, and prompt version; and Chat/Trips-owned graph revision, session, deliverable-instance, field-state, scoped-value, evidence, assumption, and answer-claim rows. Add owner FKs, deletion cascades, legal-state checks, attempt uniqueness, claim overlap fences, and the partial unique one-active-session-per-conversation index (AC: 1-4).
- [ ] Add monotonic `contentRevision` to `conversations` and stable owner-scoped message `ordinal` to `messages` in `packages/database/src/schema.ts` and the same migration; implement the only allocation/increment helper in new `packages/database/src/conversation-content-revisions.ts`, and route the user/assistant message writers in `packages/database/src/ai-ask-commands.ts` and `packages/database/src/ai-ask-stream-execution.ts` through it. Do not use timestamps or message counts as fences (AC: 1-3).
- [ ] Implement AI Orchestration-owned attempt creation/read/idempotency in new `packages/database/src/planning-clarification-attempts.ts` and export it from `packages/database/src/index.ts`; this story persists attempts for validated test inputs but makes no model call, which remains Story 21.3 (AC: 1, 3).
- [ ] Implement Chat/Trips-owned `initializeClarificationSession`, `evolveClarificationPlan`, `reduceClarificationMessage`, and exact-instance claim ports in new `packages/database/src/planning-clarification-state.ts`; consume Story 21.1's Retrieval evaluator and the attempt IDs from `planning-clarification-attempts.ts`, and reuse `aiAskCommands.id` as the command fence without adding another command ledger (AC: 1-4).
- [ ] Add canonical `CLAR-02`, `CLAR-03`, `CLAR-09`, `CLAR-11`, `CLAR-14`, and `CLAR-24`-`CLAR-26` data to `tests/fixtures/planning-context-v6.ts`; add reducer/transition/evidence-span tests in new `tests/planning-clarification-state.test.ts` and serial owner/CAS/attempt-idempotency/concurrent-disjoint-claim/terminal-immutability tests in new `tests/planning-clarification-state.integration.test.ts`, calling `resetTestDatabase()` in that file's setup (AC: 1-4).
- [ ] Verify with `pnpm test:unit -- tests/planning-clarification-state.test.ts`, `pnpm test:integration -- tests/planning-clarification-state.integration.test.ts`, `pnpm db:generate`, and `pnpm typecheck`; record any environmental database blocker exactly (AC: 1-4).

## Dev Notes

- Depends on Story 21.1's validated profile, comparator, scope graph, and pinned identities. Retrieval supplies the validated plan/evaluator; Chat/Trips is the sole writer of conversation-bound state. AI Orchestration owns the separate immutable plan/extraction attempt rows and their identities; those rows are created here so no later story depends on nonexistent persistence.
- Closed states: session `active|superseded|completed`; instance `collecting|ready|claimed|completed|abandoned`. Enforce the legal transition matrix and a partial unique one-active-session-per-conversation constraint. Validate owner, `sourceMessageOrdinal`, expected session/content revision, plan/extraction attempt identity, field/evidence digest, profile/scope, and Trip/proposal fences.
- Values use zero-based UTF-16 exclusive-end evidence spans. Do not mutate a Trip aggregate from clarification state.
- `contentRevision` advances in the same transaction as every relevant message insert. `ordinal` is allocated from that locked conversation and remains stable; deletion invalidates dependent evidence rather than renumbering retained messages.
- Design FKs/invalidation so Story 21.13 can synchronously remove reconstructable sessions, claims, values, and evidence on conversation/Trip deletion after finalization and conversion artifacts exist.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-39]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Multi-Turn-Clarification-And-Scoped-Context]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Multi-Turn-Clarification-And-Scoped-Preferences]
- [Source: tests/trip-recommendations.integration.test.ts]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.2` is normative. Guide AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
