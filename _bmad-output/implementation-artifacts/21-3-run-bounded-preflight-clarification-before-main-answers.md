# Story 21.3: Run Bounded Preflight Clarification Before Main Answers

Status: ready-for-dev

## Story

As a traveler, I want XuyenViet to ask follow-up questions until the relevant request is ready, so that detailed answers reflect my trip rather than a convenient wrong assumption.

## Acceptance Criteria

1. A profiled AI Ask makes at most one versioned `clarification_plan` and one `clarification_extract` attempt; Retrieval validates and Chat/Trips alone persists readiness.
2. A blocked turn atomically persists reduced state, concise Vietnamese follow-up, extraction Usage, and replayable success, with no retrieval/web/selection/prompt/provenance/main-answer usage artifacts.
3. A ready claim pins ready instances, session/content/profile/scope versions, Trip/proposal fences, and disclosed assumptions; stale claims never become visible answers.
4. Missing/timeout/invalid/racing extraction fails closed, records Usage and safe retry guidance, and never falls through. `CLAR-01` through `06`, `15` through `20`, and `27` pass.

## Tasks / Subtasks

- [ ] Insert profiled preflight before source-bundle assembly/model streaming in `packages/database/src/ai-ask-stream-execution.ts` (AC: 1-4).
- [ ] Add schema-constrained prompts in `packages/database/src/prompts.ts`; reuse the synchronous `extraction` model purpose, with no new model purpose or loop (AC: 1).
- [ ] Finalize blocked turns through the existing terminal transaction and suppress `ai_ask.context_extraction.v1` only for profiled turns (AC: 2, 4).
- [ ] Add focused command, stream, outbox, terminal-replay, artifact-absence, composer focus, plain-language desktop/mobile tests; run persistence cases serially with local `resetTestDatabase()` where clean tables are required (AC: 1-4).

## Dev Notes

- Flow is fixed: AI Orchestration coordinates, Retrieval validates/evaluates, Chat/Trips persists. A blocked turn must not create a retrieval run, web request, selection or prompt-render manifest, answer provenance, or main-answer model usage.
- Depends on Stories 21.1 and 21.2. Attempt uniqueness is exactly `(AI Ask command, source message, expected session revision, prompt version)`; the blocked/retry outcome is terminally persisted and failure Usage goes through the Usage owner port.
- Preserve unprofiled legacy enrichment behavior. Reuse `ai-ask-commands.ts`, gateway model selection, and transaction fencing; do not invent a second finalization path.
- Browser language is concise Vietnamese, contains no internal profile/model/state names, acknowledges resolved context calmly, and returns focus predictably to the composer.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-39]
- [Source: packages/database/src/ai-ask-stream-execution.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Clarification-State]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Clarification]
- [Source: tests/ai-ask-stream-execution.test.ts]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
