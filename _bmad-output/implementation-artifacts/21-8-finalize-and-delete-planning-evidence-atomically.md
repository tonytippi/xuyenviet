# Story 21.8: Finalize And Delete Planning Evidence Atomically

Status: ready-for-dev

## Story

As a traveler, I want completed answers internally consistent and deleted planning data unable to influence the system, so that retries, failures, and deletion leave no partial or reconstructable state.

## Acceptance Criteria

1. `prepareAiAnswerRun(...)` commits prepared run, selection, bounded inputs, identities, and idempotency fence before provider work.
2. `finalizeAiAnswer(...)` uses one transaction for Chat/Trips, Retrieval, Usage, and AI Orchestration owner ports; failure writes no completed message and retry has one terminal outcome.
3. Conversation/Trip deletion invalidates every reconstructable clarification, path, retrieval, web, manifest, derived-context, embedding, and evaluation-membership artifact in the same transaction.
4. Retained audit/evaluation data cannot reconstruct content. `DEL-01` through `DEL-04`, `CLAR-10`, and `CLAR-27` pass serially.

## Tasks / Subtasks

- [ ] Add prepared/finalized run state and transaction-aware owner-port orchestration on existing AI Ask command boundary; revalidate clarification/content/profile/scope/assumption/Trip/proposal fences and require every claimed bounded assumption in the prompt-render manifest before finalization (AC: 1-2).
- [ ] Extend delete conversation/Trip commands and all owner invalidators in the existing transaction (AC: 3-4).
- [ ] Invalidate the full reconstructable deletion matrix: message-derived intent, graph revisions, plan/extract attempts and payloads, task digests, sessions/claims/assumptions, conversion opportunities/manifests/nonterminal replay state, query payloads, runs/manifests, web decisions, production-evaluation membership, derived context, embeddings, diagnostics, and, on Trip Project deletion, Trip snapshots, canonical route choices, and Trip proposals (AC: 3).
- [ ] Add unit state/redaction tests and serial rollback, retry, primary-replacement, isolation, and mapped `DEL-01`-`DEL-04`, `CLAR-10`, `CLAR-27` coverage; call local `resetTestDatabase()` in clean-table PostgreSQL setup (AC: 1-4).

## Dev Notes

- Reuse `finalizeAiAskCommand(...)`, but stop making stream execution a cross-owner direct-write hub. The coordinator does not import or write other owners' tables.
- Ordinary conversation deletion must leave unrelated Trips unchanged. Primary conversation deletion replaces it or deletes its Trip; no orphan. Keep only approved non-content audit/aggregate fields.
- Do not implement conversion CTA lifecycle here; call its owner invalidator when available.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.8]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13-and-AD-36]
- [Source: packages/database/src/ai-ask-commands.ts]
- [Source: packages/database/src/ai-ask-stream-execution.ts]
- [Source: packages/database/src/index.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Finalization-And-Deletion]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Deletion]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
