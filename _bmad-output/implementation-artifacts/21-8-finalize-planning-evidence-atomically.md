# Story 21.8: Finalize Planning Evidence Atomically

Status: backlog

## Story

As a traveler, I want completed answers internally consistent, so that retries and failures leave no partial or competing terminal state.

## Acceptance Criteria

**Given** a required-need execution is ready for a provider call
**When** `prepareAiAnswerRun(...)` persists its prepared state
**Then** the run, selection, bounded prompt inputs, planning/clarification identities, and idempotency fence are committed before provider work
**And** retries cannot create competing authoritative executions.

**Given** provider work succeeds or fails
**When** `finalizeAiAnswer(...)` terminalizes the command
**Then** one PostgreSQL transaction coordinates Chat/Trips message writes, Retrieval run sealing, Usage append, and AI Orchestration prompt/provenance writes through owner ports
**And** failure records no completed message, while duplicate retry cannot create a second terminal outcome.

**Given** finalization fences change or a retry races an existing terminal command
**When** `finalizeAiAnswer(...)` attempts terminalization
**Then** it discards stale output or returns the existing terminal result without partial writes
**And** prepared/finalized state remains unavailable as traveler content until the owning finalization transaction commits.

## Tasks / Subtasks

- [ ] In `packages/database/src/schema.ts` and `drizzle/migrations/`, add the prepared/finalized/failed run state, immutable bounded-input identities, and idempotency/finalization fences required by `prepareAiAnswerRun(...)`; expose the new module from `packages/database/src/index.ts` (AC: 1).
- [ ] In new `packages/database/src/planning-answer-runs.ts`, implement idempotent `prepareAiAnswerRun(...)` before provider work and transaction-scoped `finalizeAiAnswer(...)`. Define explicit Chat/Trips, Retrieval, Usage, and AI Orchestration owner-port interfaces; the coordinator may call those ports but must not import another owner's tables (AC: 1-3).
- [ ] In `packages/database/src/ai-ask-commands.ts`, keep `finalizeAiAskCommand(...)` as the existing command-level lock, lifecycle/Trip fence, and one-transaction boundary; extend its callback context with content, clarification claim, profile, scope, assumption, Trip, and proposal fence identities and make duplicate terminal replay return the existing terminal result (AC: 2-3).
- [ ] In `packages/database/src/ai-ask-stream-execution.ts`, call `prepareAiAnswerRun(...)` after the final prompt-render manifest is assembled and before the provider call, then replace direct cross-owner final writes with `finalizeAiAskCommand(commandId, (transaction, command) => finalizeAiAnswer(transaction, command, preparedRun, providerResult))`; preserve streaming as a best-effort relay only (AC: 1-3).
- [ ] In `packages/database/src/source-bundle.ts`, `packages/database/src/provenance.ts`, and `packages/database/src/usage.ts`, implement the transaction-aware Retrieval, AI Orchestration, and Usage port adapters consumed by `finalizeAiAnswer(...)`; require each claimed bounded assumption to appear in the prompt-render manifest and fail the whole finalization when a disclosure or fence is missing (AC: 2-3).
- [ ] In `tests/planning-answer-finalization.test.ts`, add DB-free prepared/finalized/failed state and assumption-disclosure validation; in `tests/planning-answer-finalization.integration.test.ts`, `tests/ai-ask-commands.test.ts`, and `tests/ai-ask-stream-execution.test.ts`, add serial PostgreSQL prepare-before-provider, owner-port rollback, failure-Usage-with-no-completed-message, stale-fence discard, duplicate terminal replay, and traveler-invisibility coverage with local `resetTestDatabase()` setup (AC: 1-3).

### Verification

- `pnpm test:unit -- tests/planning-answer-finalization.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts`
- `pnpm test:integration -- tests/planning-answer-finalization.integration.test.ts`
- `pnpm typecheck`
- `pnpm exec drizzle-kit check`
- `git diff --check`

### Block If

- Stories 21.1 through 21.7 are not complete or do not expose the pinned planning, clarification, scope, selection, web-decision, and prompt-render identities required by preparation and finalization.

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
