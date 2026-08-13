# Story 21.11: Establish V6 Retrieval Qualification Infrastructure

Status: backlog

## Story

As a product owner, I want qualification and read-policy infrastructure before evidence collection, so that later evidence and activation cannot weaken safety, privacy, provenance, or operations.

## Acceptance Criteria

1. A closed numeric, versioned qualification profile rejects missing/weak/malformed/prose-only thresholds and cannot start an invalid evidence window.
2. Each run pins the complete comparable dependency tuple; any changed member restarts the window.
3. `v6_shadow` creates exactly one legacy-authoritative run and at most one bounded shadow would-render run with no web/model/traveler/prompt/provenance/usage side effect.
4. Invalid, incomplete, or targetless qualification material cannot activate `v6_active`; Story 21.14 owns evidence approval and Story 21.15 owns CAS cutover/rollback. `GATE-01` through `05` and `COMP-03` through `05` pass.

## Tasks / Subtasks

- [ ] Add Feedback/Eval-owned gate profile, corpus/cohort/evaluation report persistence and Retrieval-owned policy/execution/cutover persistence. G0 explicitly records mandatory fixtures, metric-definition versions, legacy baseline, source-metadata leakage cases, reviewed Trip proposal/schema design, and current PostgreSQL Vietnamese lexical/deployability spike as a fulfilled prerequisite or a fail-closed blocker (AC: 1-4).
- [ ] Add database-authoritative paired shadow execution to source-bundle/retrieval flow, preserving legacy answer authority (AC: 2-3).
- [ ] Define and test the Retrieval-owned `activateRetrievalReadPolicy(...)` CAS contract without invoking cutover; Story 21.15 owns the authorized activation/rollback command using Story 21.14's approved report (AC: 4).
- [ ] Add DB-free gate validators and serial side-effect, tuple, `COMP-07` paired retry/deletion, CAS, deletion, and rollback tests. Rollback validates authorized actor, expected current policy, and an already recorded qualified/approved/runnable target (AC: 1-4).

## Dev Notes

- AD-37/AD-38/RTA-8/RTA-9 govern ownership. Deployment configuration cannot override the PostgreSQL read-policy row.
- Shadow records bounded evaluation material only. It must never make a provider or web call, select a response, mutate traveler state, or write prompt/provenance/provider usage.
- Completion is local infrastructure readiness only. Story 21.14 owns evidence collection/Product Owner approval; Story 21.15 owns activation and incident rollback.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.11]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-37-and-AD-38]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#G0-G2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Compatibility-And-Cutover]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-13-epic-21.md#Required-Execution-Gates]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.11` is normative. Guide AC 1-3 map to gate profile, tuple, and shadow execution. Guide AC 4 maps to fail-closed activation prerequisites only; evidence approval and cutover moved to Stories 21.14 and 21.15.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created. Completion additionally requires external evidence-window and Product Owner gates.

### File List
