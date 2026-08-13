# Story 21.14: Collect And Approve V6 Shadow Qualification Evidence

Status: backlog

## Story

As a product owner, I want a reviewed comparable shadow-evidence report, so that activation is based on one exact qualified window rather than local test success.

## Acceptance Criteria

The Given/When/Then acceptance criteria in `epics.md#Story-21.14` are normative. This guide maps every canonical criterion one-to-one; implementation, tests, and completion review must satisfy both this guide and the canonical criteria.

1. One persisted shadow-evidence report records the exact dependency tuple, cohorts, metric/threshold versions, failures, exclusions, deletion evidence, and qualified runnable rollback target/procedure.
2. A changed tuple member restarts the evidence window.
3. Feedback/Eval and Product Owner sign-off is persisted against the exact passing report.
4. Evidence approval has no direct cutover authority.

## Tasks / Subtasks

- [ ] Run the Story 21.11-qualified shadow cohort through the persisted evaluation/report contract (AC: 1-2).
- [ ] Record Feedback/Eval review and Product Owner decision against the exact report ID (AC: 3-4).
- [ ] Add report-integrity and tuple-restart tests; record any unavailable external evidence as a blocker rather than fabricating completion (AC: 1-4).

## Dev Notes

- Depends on Story 21.11. This is an external evidence and approval gate, not a code-only completion.
- It cannot mutate the Retrieval read policy. Story 21.15 owns activation and rollback.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.14]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Compatibility-And-Cutover]
