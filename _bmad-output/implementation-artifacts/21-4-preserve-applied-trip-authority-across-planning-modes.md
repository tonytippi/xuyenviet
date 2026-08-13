# Story 21.4: Preserve Applied Trip Authority Across Planning Modes

Status: backlog

## Story

As a traveler, I want XuyenViet to distinguish my current plan from ideas and pending changes, so that exploratory advice cannot be mistaken for saved Trip state.

## Acceptance Criteria

**Given** an authenticated AI Ask has a validated URL scope and current-turn intent
**When** planning mode is resolved
**Then** it is exactly `current_plan`, `explore_change`, `validate_proposal`, or `unscoped_answer`
**And** the execution pins the relevant Trip aggregate, item, proposal, clarification-claim, and intent versions or explicitly records their absence.

**Given** the traveler asks about the current selected Trip
**When** context is assembled
**Then** only applied Trip state and the exact current snapshot are planning authority
**And** hypothetical, pending, dismissed, expired, stale, foreign, or chat-only values are not represented as the current plan.

**Given** the traveler explores a detour or reviews one pending proposal
**When** the answer is generated
**Then** the applied Trip remains the comparison baseline and proposed effects stay visibly hypothetical or pending
**And** only the existing owner-confirmed proposal Apply command may change subsequent current-plan authority.

**Given** mode ambiguity would materially change the answer or a pinned Trip/proposal changes during execution
**When** the final fence runs
**Then** safe invariant guidance plus one concise clarification is returned, or stale output is discarded/refreshed
**And** `PM-01` through `PM-07`, SC-9, SC-12, and AC-28 pass without private Trip-context leakage.

## Tasks / Subtasks

- [ ] Add browser-safe `PlanningTurnIntent`, `PlanningExecutionRef`, mode, proposal-ref, clarification-ref, and explicit-absence contracts/parsers to `packages/contracts/src/planning-context.ts`. The intent union is closed to `current_plan | explore_change | proposal_review | outside_trip | ambiguous` and pins its producer/prompt version plus canonical digest (AC: 1, 4).
- [ ] Extend the existing single `clarification_plan` prompt/result in `packages/database/src/prompts.ts` and `packages/database/src/planning-clarification-preflight.ts` to produce the bounded typed current-turn intent; validate it in new `packages/database/src/planning-intent.ts`. Do not add a model call or model purpose: Trip-scoped planning classification reuses the one Story 21.3 plan attempt, and missing/invalid intent becomes `ambiguous` rather than a guessed mode (AC: 1, 4).
- [ ] Implement deterministic owner/canonical-URL-scope/proposal/intent resolution in new `packages/database/src/planning-execution.ts`, then export it from `packages/database/src/index.ts`. Resolve `outside_trip` or absent URL Trip scope to `unscoped_answer`; require one current owner-scoped pending proposal for `validate_proposal`; pin the applied aggregate/items/path, clarification claim, and intent versions or explicit nulls (AC: 1-4).
- [ ] Resolve and pin `PlanningExecutionRef` before retrieval assembly in `packages/database/src/ai-ask-stream-execution.ts`; extend the existing final transaction fence in `packages/database/src/ai-ask-commands.ts` to revalidate intent, clarification, Trip, item, proposal status/revision/expiry, Apply/dismiss/delete, and explicit-absence fences before traveler-visible completion (AC: 1, 4).
- [ ] Change `packages/database/src/source-bundle.ts` to accept only `PlanningExecutionRef` for planning authority, and change `packages/database/src/answer-context.ts` to load the exact pinned applied snapshot. Remove mode inference from `tripProjectId`, transcript, `chat_context`, and conversation linkage; unscoped mode loads no Trip/path/proposal/constraint/project metadata (AC: 2-3).
- [ ] Add the server-owned mode/effect projection to `packages/contracts/src/planning-context.ts`, populate it from applied/pending/hypothetical state in `packages/database/src/index.ts`, and render its Vietnamese labels in `apps/web/src/features/ai/ai-ask-composer.tsx`. Keep the existing Apply command in `packages/database/src/traveler-proposal-commands.ts` as the sole durable authority change (AC: 3-4).
- [ ] Add `PM-01`-`PM-07` data to `tests/fixtures/planning-context-v6.ts`; add resolver tests in new `tests/planning-mode-resolver.test.ts`, serial scope/fence/privacy integration coverage in new `tests/planning-mode.integration.test.ts`, and desktop/mobile server-projection accessibility coverage in `tests/traveler-ui-foundation.test.ts` (AC: 1-4).
- [ ] Verify with `pnpm test:unit -- tests/planning-mode-resolver.test.ts tests/traveler-ui-foundation.test.ts`, `pnpm test:integration -- tests/planning-mode.integration.test.ts tests/private-turn-answer-context.integration.test.ts`, `pnpm typecheck`, and `pnpm build`; record exact environmental blockers (AC: 1-4).

## Dev Notes

- `unscoped_answer` loads no Trip snapshot, path, proposal, constraints, or project metadata, even for an owner with Trips.
- Depends on Story 21.3's authoritative clarification claim and existing Trip/proposal Apply boundaries. Mode resolution rejects stale/foreign URL scope and proposal references; `unscoped_answer` has null Trip/proposal references.
- The typed intent is proposal data from the existing bounded plan attempt, never authority by itself. `planning-execution.ts` deterministically resolves it against server-owned URL, owner, applied Trip, pending proposal, and clarification fences; an invalid or materially ambiguous proposal cannot silently fall back to `current_plan`.
- Pin applied aggregate/item/path or proposal revisions, or explicit absence. Apply/dismiss/expiry/deletion during generation invalidates output.
- Do not implement route registry, required-need retrieval, web verification, or conversion here.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-8]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29-and-AD-30]
- [Source: tests/private-turn-answer-context.integration.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Planning-Authority]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Planning-Modes]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.4` is normative. Guide AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
