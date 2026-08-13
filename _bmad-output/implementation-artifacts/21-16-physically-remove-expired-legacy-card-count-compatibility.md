# Story 21.16: Physically Remove Expired Legacy Card-Count Compatibility

Status: backlog

## Story

As a product owner, I want legacy card-count compatibility removed only after rollback safety expires, so that cleanup cannot strand the product without a known-safe recovery path.

## Acceptance Criteria

The Given/When/Then acceptance criteria in `epics.md#Story-21.16` are normative. This guide maps every canonical criterion one-to-one; implementation, tests, and completion review must satisfy both this guide and the canonical criteria.

1. Physical cleanup waits for rollback-window expiry, `COMP-06`, a passing cleanup report, no unresolved rollback incident, Product Owner approval, and a changed qualified known-safe v6 rollback target.
2. Failed gates preserve runnable compatibility behavior.
3. Retrieval performs the approved cleanup as a compare-and-swap operation.
4. A repository-wide executable-reference check proves no active legacy card-count path remains and only the retained qualified v6 target is runnable.

## Tasks / Subtasks

- [ ] Validate every external G3 cleanup prerequisite from retained release records before any code/schema/config removal (AC: 1-2).
- [ ] Execute the approved Retrieval CAS cleanup and remove executable legacy references only after prerequisites pass (AC: 3-4).
- [ ] Record the Feedback/Eval cleanup report, approval, command result, and repository-wide executable-reference verification (AC: 1-4).

## Dev Notes

- Depends on Story 21.12 and is intentionally time-gated. Do not start it merely because code and local tests pass.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.16]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#G3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-38]
