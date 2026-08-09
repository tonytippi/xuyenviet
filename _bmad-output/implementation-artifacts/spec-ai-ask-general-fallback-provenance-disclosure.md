---
title: 'Preserve General AI Answers and Meaningful Provenance Disclosures'
type: 'bugfix'
created: '2026-08-07'
baseline_commit: '740b0d156fd5a7f90eb13ee649f02cb4273c3536'
status: 'done'
review_loop_iteration: 0
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When approved knowledge is insufficient and the web fallback fails, AI Ask replaces a useful general planning answer with a verification-only fallback. Separately, the traveler UI displays a generic verification disclosure for internal provenance that has no safe reference or detail to show.

**Approach:** Preserve model-generated general planning guidance while attaching a bounded verification warning when the only missing material is external search coverage. Render a provenance disclosure only when the stored projection gives the traveler a safe, meaningful detail to inspect.

## Boundaries & Constraints

**Always:** Keep delayed finalization for web-fallback states; preserve replacement behavior for freshness-sensitive/current-detail, caveat-only, verification-required, and unmet conditional-knowledge states; retain safe provenance ownership and URL validation; use Vietnamese-first copy; ensure all behavior is covered by infrastructure-free regression tests.

**Ask First:** Any change that weakens safeguards for current prices, schedules, availability, road conditions, weather, or other dynamic facts; any contract/schema/API change.

**Never:** Introduce web search, knowledge records, UI taxonomy, raw-source exposure, browser persistence, a new dependency, or a database migration; infer trust state from answer prose.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| General planning fallback | No/sparse approved knowledge and failed/low-quality web fallback | Persist and return the useful model answer with one bounded statement that current external facts could not be verified | Keep finalization buffered; do not expose raw search/provider errors |
| Dynamic request | Freshness-sensitive request and failed/low-quality web fallback | Replace unsupported output with the existing bounded verification fallback | Do not retain potentially current unsupported claims |
| Internal-only provenance | Available non-general unverified/fresh item with no safe URL and no safe checked date | No disclosure or disclosure button is rendered | Answer-level warning remains responsible for needed guidance |
| Traveler-safe provenance | Relevant item with safe URL or checked date | Render one existing compact disclosure and allow the safe detail panel | Reject unsafe URLs as today |

</frozen-after-approval>

## Code Map

- `packages/database/src/answer-freshness.ts` -- decides whether final answer content is retained, augmented, or replaced after source retrieval.
- `packages/database/src/ai-ask-stream-execution.ts` -- keeps policy-required answers buffered until finalization and persists the final projection.
- `apps/web/src/features/ai/ai-ask-composer.tsx` -- renders compact traveler provenance disclosures and safe detail entry points.
- `tests/ai-ask-stream-execution.test.ts` -- existing AI Ask execution seam for finalized output behavior.
- `tests/traveler-ui-foundation.test.ts` -- infrastructure-free rendering/source regression coverage for traveler UI surfaces.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/answer-freshness.ts` -- distinguish no/sparse-knowledge general-planning web failures from dynamic-fact web failures; append the bounded verification warning to retained general guidance only in the former case -- preserves trained-model planning value without treating missing external confirmation as verified fact.
- [x] `apps/web/src/features/ai/ai-ask-composer.tsx` -- filter available provenance disclosures to records with a safe URL or usable checked date, while preserving the existing withdrawn state -- prevents a generic warning/button whose detail panel has no traveler-facing information.
- [x] `tests/ai-ask-stream-execution.test.ts` -- cover retained finalized general guidance for insufficient knowledge plus failed web fallback and the counterexample dynamic request fallback replacement -- fences the policy distinction.
- [x] `tests/traveler-ui-foundation.test.ts` -- cover the source-level eligibility contract for internal-only, URL-backed, date-backed, general, and withdrawn provenance -- verifies that UI follows persisted safe detail availability within the configured unit runner.

**Acceptance Criteria:**
- Given AI Ask has insufficient active knowledge and no usable web result for a broad planning question, when the model produces general guidance, then the persisted and returned answer retains that guidance and includes only bounded verification language for current external facts.
- Given a request relies on freshness-sensitive/current facts and web fallback is unavailable, when AI Ask finalizes the result, then it continues to replace unsupported model output with the existing safe fallback.
- Given stored provenance cannot produce a safe traveler detail, when the answer renders, then no generic verification disclosure or action is shown for that record.
- Given stored provenance has a safe URL or checked date, when the answer renders, then the existing compact disclosure remains available without exposing internal metadata or raw source material.

## Design Notes

The source bundle deliberately permits general reasoning as the final priority. Missing web coverage narrows what can be asserted as current; it does not invalidate high-level itinerary structure. The finalization barrier remains in place so the persisted answer includes the required warning before it reaches the traveler.

## Verification

**Commands:**
- `pnpm test:unit -- tests/ai-ask-stream-execution.test.ts tests/traveler-ui-foundation.test.ts` -- expected: focused regression suites pass without database configuration.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript checks pass.
- `pnpm build` -- expected: production build passes.

## Suggested Review Order

**Answer Policy**

- Preserve useful general guidance only for missing knowledge coverage, never dynamic facts.
  [`answer-freshness.ts:8`](../../packages/database/src/answer-freshness.ts#L8)

- Keep finalization buffering so persisted answers contain the bounded warning.
  [`ai-ask-stream-execution.ts:183`](../../packages/database/src/ai-ask-stream-execution.ts#L183)

**Traveler Disclosure**

- Show provenance only when a safe URL or strict checked timestamp provides usable detail.
  [`ai-ask-composer.tsx:545`](../../apps/web/src/features/ai/ai-ask-composer.tsx#L545)

- Reject malformed timestamps before they become traveler-visible detail.
  [`ai-ask-composer.tsx:2470`](../../apps/web/src/features/ai/ai-ask-composer.tsx#L2470)

**Regression Coverage**

- Exercise both missing-knowledge fallback variants and retain the dynamic-fact counterexample.
  [`ai-ask-stream-execution.test.ts:46`](../../tests/ai-ask-stream-execution.test.ts#L46)

- Guard the disclosure eligibility predicate in the runner-compatible UI test.
  [`traveler-ui-foundation.test.ts:84`](../../tests/traveler-ui-foundation.test.ts#L84)
