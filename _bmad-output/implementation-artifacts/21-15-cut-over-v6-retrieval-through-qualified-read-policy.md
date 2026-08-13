# Story 21.15: Cut Over V6 Retrieval Through Qualified Read Policy

Status: backlog

## Story

As a product owner, I want required-need retrieval activated only through a qualified read-policy decision, so that a failed gate or incident can safely retain or restore a known-safe authority.

## Acceptance Criteria

The Given/When/Then acceptance criteria in `epics.md#Story-21.15` are normative. This guide maps every canonical criterion one-to-one; implementation, tests, and completion review must satisfy both this guide and the canonical criteria.

1. Only a passing Product Owner-approved Story 21.14 report with a runnable qualified rollback target can activate `v6_active`.
2. `activateRetrievalReadPolicy(...)` is the sole Retrieval-owned CAS authority and production runs pin the PostgreSQL policy row.
3. Deployment configuration cannot override the committed read policy.
4. Authorized rollback uses incident/failing evidence and a known-safe qualified target without shadow output becoming traveler-authoritative.

## Tasks / Subtasks

- [ ] Invoke the Story 21.11 CAS contract only after validating the Story 21.14 report and expected policy revision (AC: 1-3).
- [ ] Add serial policy CAS, report-approval, runnable-target, authorization, incident rollback, and no-shadow-authority coverage (AC: 1-4).
- [ ] Produce the cutover record and preserve its exact report/rollback references (AC: 1-4).

## Dev Notes

- Depends on Story 21.14. A failed or incomplete report blocks this story; no deployment configuration or feature flag can bypass the database policy.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.15]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-37-and-AD-38]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
