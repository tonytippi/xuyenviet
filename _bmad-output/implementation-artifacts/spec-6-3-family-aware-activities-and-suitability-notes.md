---
title: '6.3 Family-Aware Activities And Suitability Notes'
type: 'feature'
created: '2026-07-11'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'f98a1fe0b62c37ddb423d3d4586e4c0b51327e76'
final_revision: 'uncommitted working tree based on f98a1fe0b62c37ddb423d3d4586e4c0b51327e76'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-family-aware-driving-and-stop-recommendations.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Family-aware answers now cover driving and stop pacing, but activity recommendations still need explicit child suitability guidance. When children are present, the assistant must identify activities that are child-friendly, boring, difficult, tiring, risky, or better replaced with backups, without forcing child advice into adult-only trips.

**Approach:** Extend the existing family-aware prompt/source-bundle path, without schema changes, so positive family context triggers activity suitability guidance and freshness/source warnings for changing family facts such as child discounts, prices, schedules, service availability, and promotions.

## Boundaries & Constraints

**Always:** Keep behavior conditional on positive family context and suppress it for explicit no-child context. Preserve Vietnamese-first answer guidance, existing context fields, source-bundle length caps, provenance/source boundaries, and freshness warnings for current prices, schedules, opening hours, availability, services, discounts, and promotions.

**Block If:** Implementation requires a new database field or migration; satisfying an acceptance criterion requires presenting unverified current child discounts, activity schedules, prices, or availability as guaranteed fact; sourced family details cannot be represented by existing provenance/retrieval flows.

**Never:** Do not force child suitability notes when no family context exists. Do not store or ask for children's sensitive personal data. Do not add booking, payments, Google Maps, live inventory, live schedule providers, or new external data providers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Family activity planning | Source bundle has `children_ages`, positive `children`, or family activity needs and the user asks for places/activities | Prompt tells the assistant to include child suitability notes, low-effort alternatives, backup activities, and warnings for activities that may be boring, difficult, tiring, risky, or age-inappropriate | If age, mobility, timing, or preference details matter, ask 1-3 concise follow-up questions while still giving general guidance |
| Non-family activity planning | No child/family context exists | Prompt does not add family activity/suitability instructions | No error expected |
| Explicit no-child context | Context includes stale child facts but latest facts say no children | Family activity guidance is suppressed | No error expected |
| Changing activity facts | Recommendation includes child discounts, prices, promotions, schedules, opening hours, service availability, or similar changing facts | Existing freshness/source rules require verification warnings and sourced/unverified labeling | Do not present changing facts as guaranteed |

</intent-contract>

## Code Map

- `src/features/retrieval/source-bundle.ts` -- Owns prioritized answer context and conditional family guidance inserted into AI Ask prompts.
- `src/features/ai/prompts.ts` -- Owns AI Ask system prompt and broad answer-generation behavior.
- `src/features/usage/events.ts` -- Owns prompt version constants when answer prompt behavior changes.
- `tests/answer-context.test.ts` -- Covers source-bundle family guidance, suppression, prompt caps, and answer-context behavior.
- `tests/ai-usage-events.test.ts` -- Covers expected prompt version metadata.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/retrieval/source-bundle.ts` -- Expand conditional family guidance to activity suitability, unsuitable/boring/difficult/tiring activity warnings, backups, and freshness/source handling for discounts/prices/schedules/availability -- ensures Story 6.3 behavior reaches the existing answer pipeline.
- [x] `src/features/ai/prompts.ts` -- Sharpen AI Ask answer guidance for family activity recommendations only when family context is present -- keeps generated answers aligned even when source-bundle phrasing is compacted.
- [x] `src/features/usage/events.ts` -- Bump the AI Ask initial answer prompt version if answer prompt behavior changes -- keeps usage telemetry traceable.
- [x] `tests/answer-context.test.ts` -- Add regression coverage for family-activity guidance inclusion, no-family omission, no-child suppression, freshness wording, and prompt length cap preservation -- verifies core edge cases.
- [x] `tests/ai-usage-events.test.ts` -- Update prompt version expectation if bumped -- keeps metadata tests aligned.

**Acceptance Criteria:**
- Given positive family context exists, when `buildSourceBundlePromptSection` runs, then the prompt includes family-aware activity guidance covering child suitability, activity difficulty/tiring/boring or age-fit warnings, parent-child balance, backup options, and concise follow-up questions when child age or preferences matter.
- Given no family context exists, when `buildSourceBundlePromptSection` runs, then the prompt does not add family activity or suitability instructions.
- Given explicit no-child context exists alongside stale child facts, when `buildSourceBundlePromptSection` runs, then family activity guidance is suppressed.
- Given the source bundle is large enough to trigger compact/minimal prompt handling, when family context exists, then essential family activity guidance remains inside the prompt length cap.
- Given the answer or source-bundle prompt mentions child discounts, prices, promotions, schedules, opening hours, service availability, or similar changing activity facts, when the model answers, then the prompt requires source/confidence handling and verification warnings instead of guaranteed claims.
- Given answer prompt behavior changes are implemented, when usage events are recorded, then the AI Ask prompt version identifies the changed behavior.

## Spec Change Log

- 2026-07-11: Implemented Story 6.3 family-aware activity suitability guidance. Status moved to review.

## Review Triage Log

### 2026-07-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

## Verification

**Commands:**
- `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- expected: targeted regression tests pass.
- `pnpm typecheck` -- expected: TypeScript passes.
- `pnpm lint` -- expected: ESLint passes.

**Results:**
- `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- first run failed because the regression assertion expected the old exact `phương án dự phòng` wording after the prompt had compressed it into `phương án ngắn hơn/dự phòng`; fixed by preserving explicit `phương án dự phòng` wording.
- `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- passed, 55 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.

## Dev Agent Record

### Completion Notes

- Expanded conditional family guidance to cover activity suitability, age/preference fit, boring/difficult/tiring/risky activity warnings, parent-child balance, shorter alternatives, and backup options.
- Preserved existing conditional behavior: no family guidance without positive family context and no-child facts suppress stale family facts.
- Preserved source-bundle prompt caps while keeping essential family activity guidance visible in minimal/compacted bundles.
- Added source/confidence and verification warning instructions for changing family activity facts such as child discounts, prices, promotions, schedules, opening hours, and service availability.
- Bumped AI Ask initial answer prompt version to `ai_ask_initial_v8` because answer prompt behavior changed.

### File List

- `src/features/retrieval/source-bundle.ts`
- `src/features/ai/prompts.ts`
- `src/features/usage/events.ts`
- `tests/answer-context.test.ts`
- `tests/ai-usage-events.test.ts`
- `_bmad-output/implementation-artifacts/spec-6-3-family-aware-activities-and-suitability-notes.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Auto Run Result

Status: done

Summary: Implemented family-aware activity suitability guidance and regression coverage while preserving conditional family behavior, explicit no-child suppression, source-bundle caps, and freshness/source verification requirements for changing activity facts.

Files changed:
- `src/features/retrieval/source-bundle.ts` -- Expanded conditional family guidance to activity suitability, warnings for unsuitable/tiring/boring/risky activities, parent-child balance, backups, and changing-fact verification.
- `src/features/ai/prompts.ts` -- Added family activity answer guidance to the AI Ask system prompt.
- `src/features/usage/events.ts` -- Bumped AI Ask initial answer prompt version to `ai_ask_initial_v8`.
- `tests/answer-context.test.ts` -- Added and updated regression coverage for family activity guidance, suppression, and capped bundles.
- `tests/ai-usage-events.test.ts` -- Updated prompt version expectation.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Story 6.3 done.
- `_bmad-output/implementation-artifacts/spec-6-3-family-aware-activities-and-suitability-notes.md` -- Recorded spec, implementation, review, verification, and final status.

Review findings breakdown: 0 patches applied, 0 deferred, 0 rejected; blind and edge-case review passes returned no findings.

Follow-up review recommendation: false.

Verification performed:
- `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- passed, 55 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.

Residual risks: This change strengthens prompt behavior but does not guarantee model output format for every provider response; downstream answer quality still depends on model adherence and available approved/provenance data.
