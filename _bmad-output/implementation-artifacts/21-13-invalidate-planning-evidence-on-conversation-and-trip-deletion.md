# Story 21.13: Invalidate Planning Evidence On Conversation And Trip Deletion

Status: backlog

## Story

As a traveler, I want deleted planning data to stop influencing the system, so that a deleted conversation or Trip cannot leave reconstructable state behind.

## Acceptance Criteria

The Given/When/Then acceptance criteria in `epics.md#Story-21.13` are normative. This guide maps every canonical criterion one-to-one; implementation, tests, and completion review must satisfy both this guide and the canonical criteria.

1. Conversation or Trip deletion invalidates the complete reconstructable planning-artifact matrix through owner invalidator ports in one transaction.
2. Ordinary-chat deletion preserves unrelated Trips; primary-conversation deletion replaces the primary conversation or deletes its Trip without orphaning it.
3. Retained audit/evaluation data is non-content and non-reconstructable.
4. Deletion races cannot restore invalidated state; `DEL-01` through `DEL-04`, `CLAR-10`, and `CLAR-27` pass in serial integration coverage.

## Tasks / Subtasks

- [ ] Define and invoke transaction-aware owner invalidator ports for the complete canonical deletion matrix after finalization and conversion artifacts exist (AC: 1-4).
- [ ] Extend existing conversation/Trip deletion commands without direct cross-owner table writes (AC: 1-3).
- [ ] Add unit redaction/invalidation tests and serial PostgreSQL deletion, primary-replacement, cross-owner isolation, finalization/conversion/evaluation race tests with local `resetTestDatabase()` where clean tables are required (AC: 1-4).

## Dev Notes

- Depends on Stories 21.8 and 21.10. Chat/Trips coordinates deletion; each owning module invalidates its own reconstructable state through a port.
- Keep only approved non-content audit and aggregate fields. Do not add a deletion worker or a deferred cleanup path.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.13]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13-and-AD-36]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Finalization-And-Deletion]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Deletion]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]
