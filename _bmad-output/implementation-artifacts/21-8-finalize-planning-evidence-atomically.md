# Story 21.8: Finalize Planning Evidence Atomically

Status: backlog

## Story

As a traveler, I want completed answers internally consistent, so that retries and failures leave no partial or competing terminal state.

## Acceptance Criteria

1. `prepareAiAnswerRun(...)` commits prepared run, selection, bounded inputs, identities, and idempotency fence before provider work.
2. `finalizeAiAnswer(...)` uses one transaction for Chat/Trips, Retrieval, Usage, and AI Orchestration owner ports; failure writes no completed message and retry has one terminal outcome.
3. A changed finalization fence or duplicate retry discards stale output or returns the existing terminal outcome with no partial writes.
4. Prepared/finalized state remains unavailable as traveler content until the owning terminal transaction commits.

## Tasks / Subtasks

- [ ] Add prepared/finalized run state and transaction-aware owner-port orchestration on existing AI Ask command boundary; revalidate clarification/content/profile/scope/assumption/Trip/proposal fences and require every claimed bounded assumption in the prompt-render manifest before finalization (AC: 1-2).
- [ ] Add unit state tests and serial retry/fence/rollback coverage; call local `resetTestDatabase()` in clean-table PostgreSQL setup (AC: 1-4).

## Dev Notes

- Reuse `finalizeAiAskCommand(...)`, but stop making stream execution a cross-owner direct-write hub. The coordinator does not import or write other owners' tables.
- Ordinary conversation deletion must leave unrelated Trips unchanged. Primary conversation deletion replaces it or deletes its Trip; no orphan. Keep only approved non-content audit/aggregate fields.
- Story 21.13 owns deletion invalidation after Story 21.10 creates conversion artifacts. Do not implement conversation or Trip deletion here.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.8]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13-and-AD-36]
- [Source: packages/database/src/ai-ask-commands.ts]
- [Source: packages/database/src/ai-ask-stream-execution.ts]
- [Source: packages/database/src/index.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Replay-Identity-And-Manifests]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.8` is normative. Guide AC 1-2 map to prepared/finalized persistence and owner-port finalization; guide AC 3-4 map to stale-fence and no-partial-write behavior. Deletion requirements moved to Story 21.13.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
