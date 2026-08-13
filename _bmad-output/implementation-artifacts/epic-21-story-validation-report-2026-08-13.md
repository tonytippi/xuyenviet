# Epic 21 Story Guide And Dev-Auto Preflight Validation Report

**Date:** 2026-08-13
**Scope:** Stories 21.1-21.16, Context-Complete, Trip-Aware Planning And Conversion
**Method:** Independent parallel BMad story-guide validation against the authoritative Epic 21 inventory, current PRD/addendum, v6.2 Architecture package, canonical fixtures/release gates, traveler UX addendum, current code seams, project test boundaries, and the `bmad-dev-auto` Ready for Development and routing preconditions.

## Final Verdict

**PASS AS SEQUENTIAL `bmad-dev-auto` INPUT AFTER THIS REVIEW IS COMMITTED.**

All 16 guides now carry their canonical Given/When/Then criteria directly, dependency-ordered tasks with exact repository paths and actions, named tests and verification commands, current-code handoff seams, and explicit fail-closed conditions. The cached `_bmad-output/implementation-artifacts/epic-21-context.md` satisfies `bmad-dev-auto` epic-context routing and keeps the authoritative dependency/ownership model available without recompiling raw planning documents.

This review does not make all stories runnable concurrently and does not weaken real gates. `sprint-status.yaml` correctly keeps every story in `backlog`; run one story at a time in the authoritative sequence. A clean worktree is a hard `bmad-dev-auto` precondition, so this documentation review must be committed before invoking the first story.

The first permitted handoff is Story 21.1. Later stories must follow this sequence:

`21.1 -> 21.2 -> 21.3 -> 21.4 -> 21.5 -> 21.6 -> 21.7 -> 21.8 -> 21.9 -> 21.10 -> 21.13 -> 21.11 -> 21.14 -> 21.15 -> 21.12 -> 21.16`

Story identifiers 21.13 through 21.16 were appended during course correction. Numeric order and file position do not override the dependency chain.

## Validation Results

| Story | Guide result | Direct prerequisite / completion boundary |
| --- | --- | --- |
| 21.1 | Pass | Foundation; first permitted `bmad-dev-auto` input after a clean review commit. |
| 21.2 | Pass | Requires 21.1; Chat/Trips owns clarification state while AI Orchestration owns attempt identity. |
| 21.3 | Pass | Requires 21.1-21.2; blocked turns preserve permitted invariant guidance and create no main-answer artifacts. |
| 21.4 | Pass | Requires 21.3; typed planning authority cannot be inferred from conversation or Trip IDs. |
| 21.5 | Pass | Requires 21.4; canonical paths mutate only through owner-confirmed proposals. |
| 21.6 | Pass with sizing caution | Requires 21.1/21.4/21.5 outputs; owns scope-first allowlist, lexical isolation/fallback, required needs, capacity, and final-manifest coverage. |
| 21.7 | Pass | Requires 21.5-21.6; web facts remain scope-specific, replayable, and non-live authority. |
| 21.8 | Pass | Requires prepared outputs from 21.1-21.7; owns finalization only, not deletion. |
| 21.9 | Pass with sizing caution | Requires 21.8; refreshes one server-owned conversion opportunity through the existing terminalization path. |
| 21.10 | Pass | Requires 21.9 including TC-13; conversion creates a separate Trip, primary conversation, and pending proposal without transcript copy or pre-Apply mutation. |
| 21.13 | Pass | Requires 21.8 and 21.10; owns the complete deletion/invalidation matrix. |
| 21.11 | Pass | Requires 21.13; establishes qualification infrastructure but does not collect approval or activate cutover. |
| 21.14 | Pass as a gated run | Requires 21.11; `bmad-dev-auto` must HALT when the real comparable window or Feedback/Eval/Product Owner decisions are unavailable. |
| 21.15 | Pass as an authorized release run | Requires 21.14 and an explicitly named target/actor authorization; implementation assignment alone grants no production mutation authority. |
| 21.12 | Pass as a gated run | Requires 21.15 and Product retirement approval; its closure precondition no longer falsely requires Story 21.16 to be complete. |
| 21.16 | Pass as a time-gated cleanup run | Requires 21.12 and all G3 prerequisites; cleanup CAS changes the rollback target before executable compatibility removal. |

## Remediation Closure

The following pre-remediation findings are closed in the current artifacts:

- Story 21.2 no longer assigns deletion invalidation to Story 21.8; Story 21.13 owns it.
- Story 21.6 separates Story 21.12 behavioral retirement from Story 21.16 physical cleanup.
- Story 21.12 can complete by proving physical cleanup remains blocked; Story 21.16 is later execution, not a forward prerequisite.
- Epic 21 and the dependent guides carry one authoritative sequence, including 21.8→21.9, 21.10→21.13→21.11, and 21.15→21.12.
- Architecture and fixture references use current companion headings rather than obsolete aliases.
- UX states that conversion persistence belongs to server opportunity state, not a sticky visual banner.

The 2026-08-13 dev-auto preflight additionally closed these blockers:

- Replaced summarized numbered acceptance criteria with the full canonical Given/When/Then blocks in all 16 story guides.
- Replaced pathless tasks with exact UPDATE/NEW paths, test files, commands, and dependency order.
- Corrected current-code seams for conditional outbox admission, clarification terminalization, planning-mode intent, route publishing, finalization, recommendation conversion, deletion invalidation, retrieval qualification, cutover, and cleanup.
- Assigned AI Orchestration attempt persistence before Story 21.3 consumes it and defined monotonic conversation content revisions plus stable message ordinals.
- Added an explicit shared proposal-contract extraction so database conversion cannot reverse-import Worker internals or duplicate proposal validation.
- Corrected Story 21.5's asymmetric null rule: non-transport items are all-null; transport legs are all-null or all-present.
- Corrected Story 21.12's forward completion precondition and Story 21.16's cleanup ordering/reference-check scope.
- Added real Block If conditions for dependency, database, evidence-window, authorization, approval, rollback-window, and target-environment gates without fabricating completion.

## Required Next Gate

1. Commit this review so `git status --short` is empty; otherwise `bmad-dev-auto` will HALT by design.
2. Invoke `bmad-dev-auto` with `_bmad-output/implementation-artifacts/21-1-define-versioned-planning-context-profiles-and-scope-rules.md` as intent.
3. Continue only in the authoritative sequence. Each later guide contains its predecessor checks and reconciles NEW paths against completed upstream File Lists.
4. Treat missing `DATABASE_URL_TEST`, real evidence, elapsed windows, designated human decisions, and target-specific release authorization as legitimate terminal blockers. Never bypass or simulate them merely to keep an unattended run moving.

## Sources

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/addendum.md`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md`
- `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-13.md`
- `_bmad-output/planning-artifacts/implementation-readiness-report-2026-08-13-epic-21-recheck.md`
- `_bmad-output/project-context.md`
