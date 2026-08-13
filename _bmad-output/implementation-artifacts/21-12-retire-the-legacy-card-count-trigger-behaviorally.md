# Story 21.12: Retire The Legacy Card-Count Trigger Behaviorally

Status: backlog

## Story

As a traveler, I want web verification to respond to missing or changing planning needs rather than arbitrary card count, so that one exact answer is not over-searched and irrelevant cards cannot hide a gap.

## Acceptance Criteria

1. In `v6_active`, card count neither triggers web work nor suppresses a required gap; only uncovered/freshness-sensitive need, conflict, or explicit verification permits it.
2. The fewer-than-three rule remains only legacy/shadow compatibility behavior and is not treated as permanent v6 authority anywhere executable.
3. Behavioral retirement records the retired policy, exact qualified shadow evidence window, broad-query and missing-need compatibility cohorts, evaluation report, rollback mode, required evidence, and Product approval.
4. Physical cleanup remains blocked for Story 21.16 pending its rollback window, `COMP-06`, approved Feedback/Eval cleanup report, no unresolved rollback incident, approval, and changed qualified known-safe `v6_active` rollback target; behavioral retirement keeps compatibility runnable.

## Tasks / Subtasks

- [ ] Make `buildRetrievalDecision` in `source-bundle.ts` branch on persisted read policy and explicit required-need outcomes (AC: 1-2).
- [ ] Add/read behavioral-retirement evidence through Story 21.11 policy/cutover records: exact evidence window, `COMP-01`-`COMP-05`, retiring policy/target-count fields, report ID, rollback mode, and Product approval (AC: 2-3).
- [ ] Add DB-free explicit legacy/shadow/v6-active unit cases and serial PostgreSQL integration cases for behavioral `COMP-01`-`COMP-05` evidence (AC: 1-3).
- [ ] Produce executable closure evidence for RTA-1-13, PCR-01-10, FR-61-65, SC-8-12, AC-28-33, and PJ-01-06 mappings; run focused unit and serial integration suites, immutable fixture/evaluation checks, `pnpm lint`, `pnpm typecheck`, and `pnpm build` (AC: 1-4).

## Dev Notes

- Depends on Story 21.15's Product Owner-approved cutover. This story records behavioral retirement; it does not independently collect the shadow window or activate `v6_active`.
- AD-38/RTA-10: current `approvedKnowledgeTargetCount = 3` branch is a compatibility baseline, not v6 authority. Do not add environment flags or runtime-policy overrides.
- This story does not alter Story 4.5 independently. It consumes required-need behavior and the persisted read-policy authority from 21.6/21.11.
- Story 21.16 owns physical cleanup. This story completes after behavioral retirement and its Product approval while retaining runnable compatibility behavior.
- Before physical cleanup, emergency rollback can name retained legacy compatibility. After cleanup, only the retained qualified `v6_active` target is runnable.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.12]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-38]
- [Source: packages/database/src/source-bundle.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.12` is normative. Guide AC 1-3 map to behavioral retirement. Guide AC 4 maps to current executable proof that physical cleanup remains blocked and compatibility remains runnable; Story 21.16 owns the later cleanup execution and is not a prerequisite for completing Story 21.12.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created. Physical cleanup remains conditional on external release gates.

### File List
