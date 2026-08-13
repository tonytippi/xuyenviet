# Story 21.11: Prove V6 Retrieval In Shadow And Cut Over Safely

Status: ready-for-dev

## Story

As a product owner, I want comparable evidence before required-need retrieval becomes authoritative, so that planning coverage does not weaken safety, privacy, provenance, or operations.

## Acceptance Criteria

1. A closed numeric, versioned qualification profile rejects missing/weak/malformed/prose-only thresholds and cannot start an invalid evidence window.
2. Each run pins the complete comparable dependency tuple; any changed member restarts the window.
3. `v6_shadow` creates exactly one legacy-authoritative run and at most one bounded shadow would-render run with no web/model/traveler/prompt/provenance/usage side effect.
4. Only CAS cutover with exact passing evidence, Product Owner approval, and runnable rollback target activates `v6_active`; rollback accepts authorized incident/failing evidence and known-safe target. `GATE-01` through `05` and `COMP-03` through `05` pass.

## Tasks / Subtasks

- [ ] Add Feedback/Eval-owned gate profile, corpus/cohort/evaluation report persistence and Retrieval-owned policy/execution/cutover persistence. G0 explicitly records mandatory fixtures, metric-definition versions, legacy baseline, source-metadata leakage cases, reviewed Trip proposal/schema design, and current PostgreSQL Vietnamese lexical/deployability spike as a fulfilled prerequisite or a fail-closed blocker (AC: 1-4).
- [ ] Add database-authoritative paired shadow execution to source-bundle/retrieval flow, preserving legacy answer authority (AC: 2-3).
- [ ] Implement `activateRetrievalReadPolicy(...)` as the sole CAS cutover/rollback writer. Cutover references a persisted report ID containing exact dependency tuple, cohorts/failures, metric thresholds, exclusions, deletion evidence, rollback target/procedure, Feedback/Eval sign-off, and Product Owner decision (AC: 4).
- [ ] Add DB-free gate validators and serial side-effect, tuple, `COMP-07` paired retry/deletion, CAS, deletion, and rollback tests. Rollback validates authorized actor, expected current policy, and an already recorded qualified/approved/runnable target (AC: 1-4).

## Dev Notes

- AD-37/AD-38/RTA-8/RTA-9 govern ownership. Deployment configuration cannot override the PostgreSQL read-policy row.
- Shadow records bounded evaluation material only. It must never make a provider or web call, select a response, mutate traveler state, or write prompt/provenance/provider usage.
- **Completion gate:** code and local tests are insufficient. Record the exact evidence window and obtain Product Owner approval of the exact report before marking this story done.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.11]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-37-and-AD-38]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#G0-G2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Compatibility-And-Cutover]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-13-epic-21.md#Required-Execution-Gates]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created. Completion additionally requires external evidence-window and Product Owner gates.

### File List
