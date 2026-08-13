# Story 21.4: Preserve Applied Trip Authority Across Planning Modes

Status: ready-for-dev

## Story

As a traveler, I want XuyenViet to distinguish my current plan from ideas and pending changes, so that exploratory advice cannot be mistaken for saved Trip state.

## Acceptance Criteria

1. Each authenticated, URL-scoped request resolves exactly one pinned mode: `current_plan`, `explore_change`, `validate_proposal`, or `unscoped_answer`.
2. Only the exact applied Trip snapshot is current-plan authority; hypothetical, pending, dismissed, expired, stale, foreign, and chat-only values are excluded.
3. Explorations and proposal review keep applied state as baseline and visibly label effects hypothetical or pending; only proposal Apply changes authority.
4. Material mode ambiguity gets safe invariant guidance plus one clarification; concurrent fence changes discard/refresh stale output. `PM-01` through `PM-07` pass without private leakage.

## Tasks / Subtasks

- [ ] Resolve/pin typed `PlanningExecutionRef` before retrieval assembly in `ai-ask-stream-execution.ts`; validate canonical URL scope, bounded current-turn intent digest, current owner-scoped pending proposal, and explicit absence for unscoped mode (AC: 1-4).
- [ ] Make `source-bundle.ts` consume only `PlanningExecutionRef` and make `answer-context.ts` read its pinned applied snapshot; neither may infer mode from `tripProjectId`, conversation state, or transcript (AC: 2-3).
- [ ] Reuse existing proposal Apply boundary; presentation receives only server projection and never derives mode from local state (AC: 3).
- [ ] Add unit resolver plus serial `PM-01`-`PM-07` scope/fence/privacy integration coverage, and desktop/mobile accessible server-projection tests proving hypothetical/pending effects cannot render as applied state (AC: 1-4).

## Dev Notes

- `unscoped_answer` loads no Trip snapshot, path, proposal, constraints, or project metadata, even for an owner with Trips.
- Depends on Story 21.3's authoritative clarification claim and existing Trip/proposal Apply boundaries. Mode resolution rejects stale/foreign URL scope and proposal references; `unscoped_answer` has null Trip/proposal references.
- Pin applied aggregate/item/path or proposal revisions, or explicit absence. Apply/dismiss/expiry/deletion during generation invalidates output.
- Do not implement route registry, required-need retrieval, web verification, or conversion here.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-8]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29-and-AD-30]
- [Source: tests/private-turn-answer-context.integration.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Planning-Mode-Authority]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Planning-Modes]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
