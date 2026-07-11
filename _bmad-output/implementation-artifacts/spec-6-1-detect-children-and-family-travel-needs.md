---
title: '6.1 Detect Children And Family Travel Needs'
type: 'feature'
created: '2026-07-11'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '30ac8c25f72a00fd5765d0af28640fdb12be0a4e'
final_revision: 'commit containing this artifact'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** AI Ask can store basic child counts and ages, but the assistant is not explicitly instructed to detect broader family travel needs or adapt planning only when family context exists. Story 6.1 must make children and family constraints first-class travel context without storing sensitive child data.

**Approach:** Use existing chat/trip context fields instead of adding schema: `children`, `children_ages`, `driving_tolerance`, `activity_preferences`, `itinerary_constraints`, `hotel_style`, `food_preferences`, and `notes`. Strengthen extraction and answer/source-bundle prompts so family details are captured, used for family-aware planning, and ignored when absent.

## Boundaries & Constraints

**Always:** Keep family context travel-relevant only; child counts, age ranges, comfort needs, pacing constraints, food/activity preferences, hotel convenience, rest-stop needs, and backup activity needs are allowed. Preserve source/provenance boundaries, Vietnamese-first answer copy, fail-closed retrieval, and post-answer extraction timing unless a small prompt/source-bundle change suffices.

**Block If:** Implementation requires new chat context fields or a database migration; same-turn extraction before answer streaming becomes necessary; sensitive child data must be stored to satisfy an acceptance criterion; existing provenance or retrieval persistence cannot represent used family context.

**Never:** Do not store children's full names, identity documents, exact home address, payment data, medical details, or unrelated personal facts. Do not force child-focused advice when no family context exists. Do not render source/confidence from parsed answer text or treat web/community data as approved knowledge.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Family context extraction | User says they travel with children, gives ages, and mentions needing short drives or easy stops | Extraction can persist `children`, `children_ages`, and the relevant existing preference/constraint fields with safe scopes | Reject unknown fields and unsafe values as today |
| Sensitive child detail | User or model output includes a child full name or medical/identity/payment detail | Sensitive value is not persisted | Continue extraction for other safe facts in the same response |
| Family-aware answering | Stored chat/trip context includes children or child ages | Source-bundle prompt tells answer generation to account for shorter driving blocks, rest breaks, child-friendly activities, suitability warnings, backup options, and concise follow-up questions when details matter | If only freshness-sensitive family details are involved, require verification warning through existing source-bundle rules |
| Non-family answering | No child/family context exists in stored facts or current question | Answer prompt must not force irrelevant child advice | No error expected |

</intent-contract>

## Code Map

- `src/features/ai/prompts.ts` -- Owns chat context extraction instructions and AI Ask system prompt.
- `src/features/chat-trips/context-extraction.ts` -- Parses, filters, scopes, audits, and persists extracted context facts.
- `src/features/retrieval/source-bundle.ts` -- Builds the prioritized context prompt that answer generation receives.
- `src/features/usage/events.ts` -- Owns prompt version strings when prompt behavior changes.
- `tests/chat-trip-context-extraction.test.ts` -- Covers extraction persistence, correction handling, and sensitive-data rejection.
- `tests/answer-context.test.ts` -- Covers source-bundle prompt content, context inclusion, freshness behavior, and provenance integration.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/prompts.ts` -- Strengthen extraction instructions for family travel needs using existing allowed fields, and add answer guidance to use family context only when present -- makes Story 6.1 behavior explicit without schema changes.
- [x] `src/features/retrieval/source-bundle.ts` -- Add a derived family-context instruction to source-bundle prompt sections when family facts exist -- ensures stored child/family context changes answer behavior through the existing pipeline.
- [x] `src/features/usage/events.ts` -- Bump prompt version constants for materially changed extraction/answer prompts -- keeps usage telemetry traceable.
- [x] `tests/chat-trip-context-extraction.test.ts` -- Add coverage for persisting safe child/family travel facts while rejecting sensitive child details -- verifies the family detection/privacy boundary.
- [x] `tests/answer-context.test.ts` -- Add coverage that source-bundle prompts include family-aware guidance only when family context exists -- verifies family context is neither ignored nor forced.

**Acceptance Criteria:**
- Given a valid conversation and extraction model output containing safe family facts, when `extractChatTripContext` runs, then it persists child count/age and relevant travel constraint facts using existing allowed fields and safe scopes.
- Given model output that includes a child full name or sensitive child detail plus safe family facts, when extraction runs, then unsafe facts are rejected and safe family facts still persist.
- Given answer context includes `children` or `children_ages`, when `buildSourceBundlePromptSection` runs, then the prompt includes Vietnamese family-aware planning guidance covering pacing, breaks, child-friendly activities, suitability warnings, and follow-up questions when needed.
- Given no stored family context, when `buildSourceBundlePromptSection` runs, then the prompt does not add family-specific instructions.
- Given prompt behavior changes are implemented, when usage events are recorded, then updated prompt version constants identify the changed extraction and answer behavior.

## Spec Change Log

## Review Triage Log

### 2026-07-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 3, low 0)
- defer: 0
- reject: 3: (high 0, medium 1, low 2)
- addressed_findings:
  - `[high]` `[patch]` `src/features/retrieval/source-bundle.ts` now avoids family guidance for explicit no-child context such as `0` or `không đi cùng trẻ em`.
  - `[medium]` `[patch]` `src/features/retrieval/source-bundle.ts` now repeats concrete family facts alongside the guidance so compact/minimal prompts do not hide the data that triggered family behavior.
  - `[medium]` `[patch]` `src/features/retrieval/source-bundle.ts` now detects family needs stored in allowed non-child fields such as `itinerary_constraints` and `activity_preferences` when their values mention family/children.
  - `[medium]` `[patch]` `tests/answer-context.test.ts` now covers positive non-child-field family detection and explicit no-child suppression.

## Verification

**Commands:**
- `pnpm test:run tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- expected: targeted regression tests pass.
- `pnpm typecheck` -- expected: TypeScript passes.
- `pnpm lint` -- expected: ESLint passes.

**Results:**
- `pnpm test:run tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- passed, 65 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- Review rerun: `pnpm test:run tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- passed, 67 tests.
- Review rerun: `pnpm typecheck` -- passed.
- Review rerun: `pnpm lint` -- passed.

## Auto Run Result

Status: done

Summary: Implemented Story 6.1 by making family/child travel needs explicit in extraction and answer prompts, deriving family-aware source-bundle guidance from stored safe context, avoiding irrelevant child advice when family context is absent or explicitly negative, and preserving concrete family facts in compact prompt paths.

Files changed:
- `src/features/ai/prompts.ts` -- Added family-aware extraction and answer-generation instructions.
- `src/features/retrieval/source-bundle.ts` -- Added family context detection, prompt guidance, concrete fact preservation, non-child-field family detection, and no-child suppression.
- `src/features/usage/events.ts` -- Bumped AI Ask initial answer and chat context extraction prompt versions.
- `tests/chat-trip-context-extraction.test.ts` -- Added safe family fact extraction and sensitive child detail rejection coverage.
- `tests/answer-context.test.ts` -- Added family guidance inclusion, omission, non-child-field trigger, and explicit no-child suppression coverage.
- `tests/ai-usage-events.test.ts` -- Updated prompt version expectation.
- `_bmad-output/implementation-artifacts/epic-6-context.md` -- Added compiled Epic 6 implementation context.

Review findings breakdown: 4 patch findings applied, 0 deferred, 3 rejected as either already addressed by the patch or not consequential after the final implementation.

Follow-up review recommendation: false.

Verification performed:
- `pnpm test:run tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts tests/ai-usage-events.test.ts` -- passed, 67 tests after review fixes.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.

Residual risks: Family detection for non-child fields is keyword-based and intentionally conservative; nuanced wording that omits family/child keywords may not trigger family guidance until a `children` or `children_ages` fact is present.
