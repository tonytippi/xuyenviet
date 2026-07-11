---
title: '6.2 Family-Aware Driving And Stop Recommendations'
type: 'feature'
created: '2026-07-11'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'fdb884db54563b35c1a0d9e2819d9f73bdfc3e05'
final_revision: 'uncommitted working tree based on fdb884db54563b35c1a0d9e2819d9f73bdfc3e05'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-detect-children-and-family-travel-needs.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Family context now reaches answer generation, but route and logistics answers do not yet make family driving constraints explicit enough. When children are present, the assistant must avoid unrealistic long-drive plans and recommend practical rest, bathroom, and food stop pacing.

**Approach:** Extend the existing family-aware prompt/source-bundle path, without schema changes, so family context triggers driving-specific guidance for shorter driving blocks, planned stop cadence, tiring segment warnings, and concise follow-up questions when age or tolerance details matter.

## Boundaries & Constraints

**Always:** Keep behavior conditional on positive family context and suppress it for explicit no-child context. Preserve Vietnamese-first answer guidance, existing context fields, provenance/source boundaries, source-bundle length caps, and freshness warnings for current service facts such as prices, schedules, road conditions, opening hours, and availability.

**Block If:** Implementation requires a new database field or migration; sourced stop details cannot be represented by existing provenance/retrieval flows; satisfying an acceptance criterion requires presenting unverified current stop/service data as guaranteed fact.

**Never:** Do not force family driving advice when no family context exists. Do not hard-code exact universal child-driving hour limits as medical or safety guarantees. Do not add Google Maps, booking, payments, live traffic, or new external data providers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Family route planning | Source bundle has `children_ages` or other positive family facts and the user asks about route/stops | Prompt tells the assistant to plan shorter driving blocks, rest/bathroom/food breaks, realistic pacing, and warnings for long or tiring segments | If details such as child age or driving tolerance are missing, ask 1-3 concise follow-up questions while still giving general guidance |
| Non-family route planning | No child/family context exists | Prompt does not add family-driving instructions | No error expected |
| Explicit no-child context | Context includes stale child facts but latest facts say `children=0` or no children | Family-driving guidance is suppressed | No error expected |
| Freshness-sensitive stop facts | Recommendation would rely on current opening hours, prices, road status, or availability | Existing freshness/source rules require verification warnings and sourced/unverified labeling | Do not present changing facts as guaranteed |

</intent-contract>

## Code Map

- `src/features/retrieval/source-bundle.ts` -- Owns prioritized answer context and conditional family guidance inserted into AI Ask prompts.
- `src/features/ai/prompts.ts` -- Owns AI Ask system prompt and broad answer-generation behavior.
- `src/features/usage/events.ts` -- Owns prompt version constants when answer prompt behavior changes.
- `tests/answer-context.test.ts` -- Covers source-bundle family guidance, suppression, prompt caps, and answer-context behavior.
- `tests/ai-usage-events.test.ts` -- Covers expected prompt version metadata.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/retrieval/source-bundle.ts` -- Make family guidance explicitly route/logistics-aware for shorter driving blocks, rest/bathroom/food breaks, realistic pacing, and long/tiring segment warnings -- ensures Story 6.2 behavior reaches the existing answer pipeline.
- [x] `src/features/ai/prompts.ts` -- Sharpen AI Ask answer guidance for family route planning only when family context is present -- keeps generated answers aligned even when source-bundle phrasing is compacted.
- [x] `src/features/usage/events.ts` -- Bump the AI Ask initial answer prompt version if answer prompt behavior changes -- keeps usage telemetry traceable.
- [x] `tests/answer-context.test.ts` -- Add regression coverage for family-driving guidance inclusion, no-family omission, no-child suppression, and prompt length cap preservation -- verifies core edge cases.
- [x] `tests/ai-usage-events.test.ts` -- Update prompt version expectation if bumped -- keeps metadata tests aligned.

**Acceptance Criteria:**
- Given positive family context exists, when `buildSourceBundlePromptSection` runs, then the prompt includes family-aware driving guidance covering shorter driving blocks, rest stops, bathroom breaks, food breaks, realistic pacing, and warnings for long or tiring route segments.
- Given no family context exists, when `buildSourceBundlePromptSection` runs, then the prompt does not add family-driving instructions.
- Given explicit no-child context exists alongside stale child facts, when `buildSourceBundlePromptSection` runs, then family-driving guidance is suppressed.
- Given the source bundle is large enough to trigger compact/minimal prompt handling, when family context exists, then essential family-driving guidance remains inside the prompt length cap.
- Given answer prompt behavior changes are implemented, when usage events are recorded, then the AI Ask prompt version identifies the changed behavior.

## Spec Change Log

- 2026-07-11: Implemented Story 6.2 family-aware driving and stop recommendation guidance. Status moved to review.

## Review Triage Log

### 2026-07-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 3, low 0)
- defer: 0
- reject: 11
- addressed_findings:
  - `[medium]` `[patch]` Explicit no-child context could suppress `children_ages` but still allow stale positive `children` counts to trigger family-driving guidance; fixed by making any explicit no-child fact suppress the family guidance block and by adding stale child-count regression coverage.
  - `[medium]` `[patch]` The minimal source-bundle cap could clip the closing context marker after adding family guidance; fixed minimal fallback budgeting so the general-reasoning line and `END_CONTEXT_PRIORITY_SOURCE_BUNDLE` survive clipping, with regression coverage.
  - `[medium]` `[patch]` Numeric `0` inside ordinary family notes was treated as no-child context, which could incorrectly remove family guidance from long capped prompts; fixed negative-family detection so numeric zero is only handled by the `children` field path.

## Verification

**Commands:**
- `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- expected: targeted regression tests pass.
- `pnpm typecheck` -- expected: TypeScript passes.
- `pnpm lint` -- expected: ESLint passes.

**Results:**
- `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- first run failed because the minimal source-bundle fallback clipped the family-driving guidance after repeated family facts; fixed by limiting repeated family facts in the minimal fallback.
- `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- passed, 51 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- Review rerun: `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- first run failed after a review hardening patch because numeric `0` in repeated note text was over-matched as no-child context; fixed by narrowing numeric zero detection to the `children` field.
- Review rerun: `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- passed, 53 tests.
- Review rerun: `pnpm typecheck` -- passed.
- Review rerun: `pnpm lint` -- passed.

## Dev Agent Record

### Completion Notes

- Made conditional family guidance explicitly driving/logistics-aware: shorter driving blocks, realistic pacing, rest stops, bathroom breaks, food breaks, and warnings for long or tiring route segments.
- Preserved no-family omission and explicit no-child suppression through the existing positive-family-context detection path.
- Preserved the source-bundle prompt cap by limiting repeated family facts in the minimal fallback so essential family-driving guidance remains inside the capped prompt.
- Review hardening now also preserves the capped bundle closing marker and freshness/web warning text when family guidance is present.
- Review hardening suppresses all stale positive family facts when explicit no-child context exists, including stale `children` counts.
- Bumped AI Ask initial answer prompt version to `ai_ask_initial_v7` because the answer prompt behavior changed.

### File List

- `src/features/retrieval/source-bundle.ts`
- `src/features/ai/prompts.ts`
- `src/features/usage/events.ts`
- `tests/answer-context.test.ts`
- `tests/ai-usage-events.test.ts`
- `_bmad-output/implementation-artifacts/spec-6-2-family-aware-driving-and-stop-recommendations.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Auto Run Result

Status: done

Summary: Implemented route/logistics-specific family driving guidance and regression coverage while preserving conditional behavior, explicit no-child suppression, and source-bundle length limits.

Files changed:
- `src/features/retrieval/source-bundle.ts` -- Added route/logistics-specific family guidance, no-child suppression hardening, and capped minimal-bundle footer preservation.
- `src/features/ai/prompts.ts` -- Sharpened AI Ask prompt guidance for family route/logistics answers only when family context is present.
- `src/features/usage/events.ts` -- Bumped AI Ask initial answer prompt version to `ai_ask_initial_v7`.
- `tests/answer-context.test.ts` -- Added family-driving guidance, no-child suppression, capped minimal-bundle, and freshness-marker regression coverage.
- `tests/ai-usage-events.test.ts` -- Updated prompt version expectation.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Epic 6 in progress and Story 6.2 done.
- `_bmad-output/implementation-artifacts/spec-6-2-family-aware-driving-and-stop-recommendations.md` -- Recorded spec, implementation, review, verification, and final status.

Review findings breakdown: 3 medium patch findings applied, 0 deferred, 11 rejected as either pre-existing policy questions, lower-priority overreach outside Story 6.2, or already covered by the final implementation.

Follow-up review recommendation: false.

Verification performed:
- `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- passed, 53 tests after review fixes.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.

Residual risks: Family detection for non-child fields remains keyword-based and conservative from Story 6.1; adult-only family wording can still trigger family guidance if it uses child/family keywords, but that broader policy was pre-existing and not changed by Story 6.2.
