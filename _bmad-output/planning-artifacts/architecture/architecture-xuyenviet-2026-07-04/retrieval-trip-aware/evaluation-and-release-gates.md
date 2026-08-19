---
title: Epic 21 Clean-Break Verification
status: final
updated: 2026-08-16
source_spine: ../ARCHITECTURE-SPINE.md
---

# Epic 21 Clean-Break Verification

## Boundary

Epic 21 is implemented before production traveler data exists. Its deployment target is disposable and may be reset/reseeded under NFR-16 and the safeguards in `scripts/db-reset.ts`. This document defines executable verification only; it does not define a shadow system, runtime read mode, gate-profile database, evidence window, approval workflow, cutover record, cleanup report, or legacy rollback target.

If the target cannot be proven disposable, runtime processes overlap the reset, or durable shared/customer data exists, stop. Replace this plan with an approved expand-migrate-contract design before changing schema or data.

## Required Verification

### Contract fixtures

The canonical fixtures remain code-owned and executable:

- `CLAR-*`: flat scoped values, partial replies, contradiction, retry, and readiness.
- `PM-*`: current-plan, hypothetical, proposal-review, and unscoped authority.
- `RP-*`: canonical path, partial/ambiguous/unsupported coverage, and stale path handling.
- `RN-*`: required-need coverage, capacity, unrelated evidence, and final packing.
- `WS-*`: minimized web queries, exact scope, recent warnings, and provider failure.
- `TC-*`: four-state recommendation, current-context conversion, no transcript copy, and pre-Apply safety.
- `DEL-*`: conversation/Trip deletion and stale-work fencing.
- `COMP-01`: one exact sufficient contribution does not trigger web work because its count is below three.
- `COMP-02`: three or more irrelevant contributions do not suppress an uncovered required need.

Every critical fixture expects zero hard-off-route contribution, unrelated-need satisfaction, private Trip leakage, hypothetical/pending-as-committed output, silent required-gap omission, unsafe provider-failure recovery, transcript copy, duplicate conversion, and pre-Apply mutation.

### Data shape

- Migration `0077_clean_break_trip_aware_planning.sql` is the only initial Epic 21 migration.
- At most one new table exists: `planning_context_sessions`, with one bounded JSON document per active conversation session.
- `assistant_retrieval_decisions` stores one bounded JSON snapshot for required needs, outcomes, selected evidence handles, excluded counts/reasons, web scope decisions, and rendered handles.
- Existing conversation/message, Trip, proposal, recommendation, AI Ask command, Usage, provenance, feedback, and audit tables are reused.
- Planning profiles, required-need definitions, and route registry/coverage are typed code constants with explicit versions, not database tables.
- No table or active type named for shadow runs, retrieval read policy, cutover, qualification/gate profile, approval, compatibility cleanup, or legacy rollback is added.

### Disposable reset

Before reset:

1. Confirm the exact database target identity.
2. Confirm the target is disposable and contains no required shared/customer data.
3. Confirm no application or Worker runtime overlaps the reset.
4. Use the existing guarded `pnpm db:reset` entrypoint; never run ad-hoc destructive SQL against an unresolved target.
5. Reseed and verify the target schema after reset.

### Commands

Run the focused story commands first, then the final clean-break suite:

```bash
pnpm test:unit
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
```

Integration tests remain serial and each test requiring clean tables calls `resetTestDatabase()` in its own setup.

### Active-reference check

The final story runs a scoped repository check over executable code, active tests, configuration, package scripts, and runbooks. It must find zero active authority for:

- a branch that compares selected knowledge count with `approvedKnowledgeTargetCount`
- `knowledge.length < 3`
- `insufficient_active_knowledge` as an automatic count-based web trigger
- `legacy`, `v6_shadow`, or `v6_active` retrieval modes
- retrieval read-policy, shadow-comparison, gate-profile, cutover, or compatibility-cleanup runtime records

Historical migrations, roadmaps, archived proposals, and Git history may retain old terminology as history; they are not executable authority.

## Activation And Recovery

Required-need retrieval becomes the only runtime path when the target migration/reset/reseed, canonical fixtures, focused tests, serial integration suite, typecheck, and build pass. There is no separate activation command.

Before real shared/customer data exists, recovery is code rollback followed by the same guarded reset/reseed. After durable data exists, destructive recovery is prohibited and a new architecture decision must define forward migration and rollback handling.

## Definition Of Done

- The eight Epic 21 stories are complete in dependency order.
- All critical fixtures pass with zero prohibited outcomes.
- The guarded disposable reset and reseed succeed for the named target.
- The active-reference check finds no executable card-count or dual-read authority.
- `sprint-status.yaml` and each generated story spec record the actual verification result without invented approvals or evidence windows.
