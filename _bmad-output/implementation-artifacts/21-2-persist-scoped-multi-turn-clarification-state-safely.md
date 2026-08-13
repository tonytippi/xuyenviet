# Story 21.2: Persist Scoped Multi-Turn Clarification State Safely

Status: ready-for-dev

## Story

As a traveler, I want valid answers to accumulate across clarification turns, so that XuyenViet asks only for missing details without losing, mixing, or silently replacing prior answers.

## Acceptance Criteria

1. Validated plans atomically persist owner-bound immutable graph revisions, typed instances, field state, content revision, and pinned identities; plan-attempt retries are idempotent and invalid input changes nothing.
2. `reduceClarificationMessage(...)` preserves valid partial replies with exact UTF-16 evidence spans and asks only for unresolved material fields.
3. CAS reduction rejects stale/duplicate/out-of-order work, retains equal-scope ambiguity, and confines valid narrower overrides to their subtree.
4. Instance readiness is independent; the parent remains active until each instance is completed or abandoned. `CLAR-02`, `03`, `09`, `11`, `14`, `24` through `26` pass.

## Tasks / Subtasks

- [ ] Add Chat/Trips-owned session, graph revision, instance, scoped-value, assumption, and claim tables with a forward migration; consume AI Orchestration-owned plan/extraction attempt identity and fences without duplicating its tables (AC: 1-4).
- [ ] Add explicit domain ports `initializeClarificationSession`, `evolveClarificationPlan`, and `reduceClarificationMessage` (AC: 1-3).
- [ ] Reuse `ai-ask-commands.ts` command/idempotency fences; never create another command ledger (AC: 1, 3).
- [ ] Add reducer unit tests and serial owner/CAS/idempotency integration tests for one active session, legal transitions, concurrent disjoint claims, terminal immutability, and all `CLAR-02`, `03`, `09`, `11`, `14`, `24`-`26` fixtures (AC: 1-4).

## Dev Notes

- Depends on Story 21.1's validated profile, comparator, scope graph, and pinned identities. Retrieval supplies the validated plan/evaluator; Chat/Trips is the sole writer of conversation-bound state. AI Orchestration owns only plan/extraction attempt identity.
- Closed states: session `active|superseded|completed`; instance `collecting|ready|claimed|completed|abandoned`. Enforce the legal transition matrix and a partial unique one-active-session-per-conversation constraint. Validate owner, `sourceMessageOrdinal`, expected session/content revision, plan/extraction attempt identity, field/evidence digest, profile/scope, and Trip/proposal fences.
- Values use zero-based UTF-16 exclusive-end evidence spans. Do not mutate a Trip aggregate from clarification state.
- Design FKs/invalidation so Story 21.8 can synchronously remove reconstructable sessions, claims, values, and evidence on conversation/Trip deletion.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-39]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Clarification-State]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Clarification]
- [Source: tests/trip-recommendations.integration.test.ts]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
