# Story 21.3: Run Bounded Preflight Clarification Before Main Answers

Status: backlog

## Story

As a traveler, I want XuyenViet to ask follow-up questions until the relevant request is ready, so that detailed answers reflect my trip rather than a convenient wrong assumption.

## Acceptance Criteria

**Given** a traveler asks `Lịch trình 7 ngày Hà Nội - Đà Nẵng` without direction, party, or vehicle
**When** the profiled AI Ask command runs
**Then** AI Orchestration uses at most one versioned bounded `clarification_plan` attempt and one `clarification_extract` attempt under the existing synchronous extraction model purpose
**And** Retrieval validates the proposals while Chat/Trips alone persists state and deterministically decides readiness.

**Given** a dependent deliverable remains blocked after extraction
**When** the turn finalizes
**Then** one transaction persists the reduced clarification state, concise Vietnamese follow-up, extraction Usage, and replayable AI Ask success
**And** it returns any profile-permitted useful invariant guidance that does not depend on an unresolved material field
**And** it creates no Retrieval run, web call, selection manifest, prompt-render manifest, answer provenance, or main-answer model usage.

**Given** every hard-required field for an instance is resolved or an explicitly permitted bounded assumption is accepted
**When** main synthesis begins
**Then** the authoritative answer claim pins the exact ready instance IDs, session/content revisions, profiles, scope graph, Trip/proposal fences, and disclosed assumptions
**And** finalization rejects a stale or changed claim before any obsolete answer becomes visible.

**Given** the extraction model is missing, times out, returns invalid schema, or a retry races a persisted result
**When** preflight handles the failure
**Then** it preserves the user message/session, records failure Usage, returns safe retry guidance where possible, and never falls through to Retrieval, web, a streaming answer, or an unrecorded assumption
**And** profiled turns suppress `ai_ask.context_extraction.v1`, while unprofiled turns retain only its non-authoritative enrichment behavior.

**Given** the interaction is rendered on desktop or mobile
**When** clarification repeats across natural-language replies
**Then** resolved information remains visible through calm conversational acknowledgement, only unresolved material questions are asked, focus returns predictably to the composer, and pending/error states use practical Vietnamese
**And** `CLAR-01` through `CLAR-06`, `CLAR-15` through `CLAR-20`, and `CLAR-27` cover FR-5 and RTA-11 without exposing internal profile, model, command, or state names.

## Tasks / Subtasks

- [ ] Add versioned schema-constrained `clarification_plan` and `clarification_extract` builders/parsers to `packages/database/src/prompts.ts`, register their prompt versions in `packages/database/src/usage-constants.ts`, and invoke only `completeExtraction(...)` from `packages/database/src/gateway.ts` with the existing `extraction` model purpose (AC: 1, 4).
- [ ] Implement the bounded one-plan/one-extract coordinator in new `packages/database/src/planning-clarification-preflight.ts`; persist/replay attempts through `packages/database/src/planning-clarification-attempts.ts`, validate with `packages/database/src/planning-context-profiles.ts`, reduce through `packages/database/src/planning-clarification-state.ts`, and expose only `blocked | ready | unprofiled | retry` closed outcomes (AC: 1-4).
- [ ] Refactor `packages/database/src/ai-ask-commands.ts` so admission no longer unconditionally enqueues `ai_ask.context_extraction.v1`; add one idempotent helper there that enqueues the legacy event only after preflight returns `unprofiled`. Keep the existing event/dedupe contract in `packages/database/src/domain-outbox.ts` and create no event for profiled turns (AC: 4).
- [ ] Refactor the existing terminal transaction core in `packages/database/src/ai-ask-commands.ts` and add new owner composition `packages/database/src/planning-clarification-finalization.ts` implementing `finalizeClarificationTurn(...)`. A blocked/retry result must atomically reduce state, insert the bounded assistant clarification, append extraction Usage, and terminalize replayable success without enqueuing `ai_ask.context_extraction.v1`, `ai_ask.answer_annotation.v1`, or `ai_ask.trip_proposal_draft.v1`; the ready main-answer branch retains current annotation/proposal behavior (AC: 2-4).
- [ ] Integrate preflight before `assembleContextPrioritySourceBundle(...)` and before answer-model selection/streaming in `packages/database/src/ai-ask-stream-execution.ts`; pass the immutable ready claim into existing final fences and guarantee blocked/retry paths never call source-bundle, web, provenance, snapshot, or main-answer Usage writers (AC: 1-4).
- [ ] Render acknowledgement, unresolved questions, pending/error copy, and predictable composer refocus in `apps/web/src/features/ai/ai-ask-composer.tsx`; do not expose profile, attempt, command, model, or state names (AC: 5).
- [ ] Add `CLAR-01`-`CLAR-06`, `CLAR-15`-`CLAR-20`, and `CLAR-27` data to `tests/fixtures/planning-context-v6.ts`; extend `tests/ai-ask-commands.test.ts` and `tests/ai-ask-stream-execution.test.ts`, and add serial persistence/artifact-absence coverage in new `tests/planning-clarification-preflight.integration.test.ts` plus desktop/mobile focus/copy coverage in `tests/traveler-ui-foundation.test.ts` (AC: 1-5).
- [ ] Verify with `pnpm test:unit -- tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts tests/traveler-ui-foundation.test.ts`, `pnpm test:integration -- tests/planning-clarification-preflight.integration.test.ts`, `pnpm typecheck`, and `pnpm build`; record exact environmental blockers (AC: 1-5).

## Dev Notes

- Flow is fixed: AI Orchestration coordinates, Retrieval validates/evaluates, Chat/Trips persists. A blocked turn must not create a retrieval run, web request, selection or prompt-render manifest, answer provenance, or main-answer model usage.
- Depends on Stories 21.1 and 21.2. Attempt uniqueness is exactly `(AI Ask command, source message, expected session revision, prompt version)`; the blocked/retry outcome is terminally persisted and failure Usage goes through the Usage owner port.
- Preserve unprofiled legacy enrichment behavior. Reuse `ai-ask-commands.ts`, gateway model selection, and one refactored terminal transaction core; `finalizeClarificationTurn(...)` is an owner composition over that core, not a second command ledger or competing finalization authority.
- Browser language is concise Vietnamese, contains no internal profile/model/state names, acknowledges resolved context calmly, and returns focus predictably to the composer.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-39]
- [Source: packages/database/src/ai-ask-stream-execution.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Multi-Turn-Clarification-And-Scoped-Context]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Multi-Turn-Clarification-And-Scoped-Preferences]
- [Source: tests/ai-ask-stream-execution.test.ts]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.3` is normative. The five Given/When/Then blocks above map one-to-one to its five canonical criteria. Completion must satisfy both documents.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
