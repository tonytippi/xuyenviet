# Story 21.12: Retire The Legacy Card-Count Trigger Without Losing Rollback

Status: ready-for-dev

## Story

As a traveler, I want web verification to respond to missing or changing planning needs rather than arbitrary card count, so that one exact answer is not over-searched and irrelevant cards cannot hide a gap.

## Acceptance Criteria

1. In `v6_active`, card count neither triggers web work nor suppresses a required gap; only uncovered/freshness-sensitive need, conflict, or explicit verification permits it.
2. The fewer-than-three rule remains only legacy/shadow compatibility behavior and is not treated as permanent v6 authority anywhere executable.
3. Behavioral retirement records the retired policy, exact qualified shadow evidence window, broad-query and missing-need compatibility cohorts, evaluation report, rollback mode, required evidence, and Product approval.
4. Physical cleanup waits for rollback window, `COMP-06`, approved Feedback/Eval cleanup report, no unresolved rollback incident, approval, and a changed qualified known-safe `v6_active` rollback target; failure keeps compatibility runnable.

## Tasks / Subtasks

- [ ] Make `buildRetrievalDecision` in `source-bundle.ts` branch on persisted read policy and explicit required-need outcomes (AC: 1-2).
- [ ] Add/read behavioral-retirement evidence through Story 21.11 policy/cutover records: exact evidence window, `COMP-01`-`COMP-05`, retiring policy/target-count fields, report ID, rollback mode, and Product approval (AC: 2-3).
- [ ] Add DB-free explicit legacy/shadow/v6-active unit cases and serial PostgreSQL integration cases for `COMP-01`-`COMP-06`; physical cleanup is a Feedback/Eval-owned report plus Retrieval-owned read-policy CAS only after the rollback target changes (AC: 1-4).
- [ ] Perform physical cleanup only after all external gates have evidence and the Feedback/Eval cleanup report explicitly confirms no unresolved rollback incident; remove every executable legacy reference through a repository-wide check, otherwise preserve runnable compatibility behavior (AC: 4).
- [ ] Produce executable closure evidence for RTA-1-13, PCR-01-10, FR-61-65, SC-8-12, AC-28-33, and PJ-01-06 mappings; run focused unit and serial integration suites, immutable fixture/evaluation checks, `pnpm lint`, `pnpm typecheck`, and `pnpm build` (AC: 1-4).

## Dev Notes

- AD-38/RTA-10: current `approvedKnowledgeTargetCount = 3` branch is a compatibility baseline, not v6 authority. Do not add environment flags or runtime-policy overrides.
- This story does not alter Story 4.5 independently. It consumes required-need behavior and the persisted read-policy authority from 21.6/21.11.
- **Completion gate:** do not schedule or mark physical deletion complete from code/test results alone. It is blocked pending qualified rollback evidence, full compatibility cohorts, rollback-window expiry, cleanup report, and Product Owner approval.
- Before physical cleanup, emergency rollback can name retained legacy compatibility. After cleanup, only the retained qualified `v6_active` target is runnable.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.12]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-38]
- [Source: packages/database/src/source-bundle.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#G3]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-13-epic-21.md#Required-Execution-Gates]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created. Physical cleanup remains conditional on external release gates.

### File List
