---
title: 'Simplify Text Source Discovery'
type: 'bugfix'
created: '2026-07-27'
status: 'in-review'
baseline_commit: 'dd0bec5'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-multi-fact-source-ingestion.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A useful 20,000-character Facebook trip report was terminally suppressed during windowed discovery. Text captures in this product are bounded human-readable posts or articles, while the selected extraction model has ample context capacity; source windows add multiple requests, cursor/overlap state, and ambiguous evidence offsets without a demonstrated product benefit.

**Approach:** Discover all atomic facts from each complete immutable text capture in one bounded extraction request. Keep exact absolute evidence-span validation and candidate-level independent judgment intact, and remove window-specific prompt inputs, orchestration behavior, and schema fields. YouTube remains outside this change because it uses its separate Gemini video pipeline.

## Boundaries & Constraints

**Always:** Validate `quote_text` as an exact contiguous substring of the complete redacted capture. The provider returns quote text only; the server derives Unicode code-point internal spans from the first exact occurrence for evidence indexing. Preserve redaction length, candidate deduplication, source-current checks, candidate-level terminal outcomes, and the Facebook operator-only evidence display policy. One extraction request must receive the complete capture and ask for every independently useful atomic fact.

**Ask First:** Halt if a capture length limit is required, if retrying a complete capture proves operationally unsafe, changing traveler retrieval eligibility, changing canonical publication policy, or manually creating cards from the capture. The product owner explicitly approved retaining the raw discovery completion for admin-only debugging.

**Never:** Do not preserve compatibility for obsolete window state or reintroduce source windows, overlap, or relative-offset normalization for text discovery. Do not relax exact-contiguous-quote validation or reinterpret an invalid candidate as a publishable fact. Do not persist the provider HTTP envelope, error body, credentials, or prompt; retain only the raw successful discovery completion on the canonical ingestion job for admin-only inspection.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Long Facebook post | A 20,000-character capture | One extraction request receives the complete redacted post and emits all eligible candidates with absolute spans | Provider failure uses the existing retry policy for the complete capture |
| Exact evidence | Candidate quote/span references the complete capture | Candidate is queued only when the absolute span exactly matches the quote | Invalid quote/span is independently suppressed; no card or evidence is created |
| Mixed response | One valid and one malformed candidate in one extraction response | Valid candidate is queued; invalid candidate is independently suppressed | Parent counts both terminal paths correctly |
| Existing terminal job | The affected Facebook capture was suppressed by windowed discovery | Retry reprocesses the same immutable capture as one request | No Facebook recapture or manual card creation |

</frozen-after-approval>

## Code Map

- `src/features/knowledge/ingestion-pipeline.ts` -- performs one v2 discovery pass per text capture and validates candidates before persistence.
- `src/features/ai/prompts.ts` -- defines the full-capture multi-fact extraction contract.
- `src/features/ai/gateway.ts` -- omits the generic extraction output cap only for full-capture multi-fact discovery.
- `src/db/schema.ts` and `drizzle/migrations/` -- remove obsolete window cursor/size/completion fields from canonical ingestion jobs.
- `tests/knowledge-ingestion-pipeline.test.ts` -- verifies single-pass discovery, exact evidence, and invalid sibling handling.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/ingestion-pipeline.ts` -- replace window cursor/overlap discovery calls with one complete-capture extraction pass while retaining safe job fencing and aggregate completion.
- [x] `src/features/ai/prompts.ts` -- remove source-window fields and make complete-capture absolute spans explicit in the extraction request contract.
- [x] `src/features/ai/gateway.ts` -- omit `max_tokens` for full-capture multi-fact discovery so the selected model applies its native output allowance; preserve output caps for other gateway calls.
- [x] `src/db/schema.ts`, `drizzle/migrations/`, and affected job helpers/tests -- remove discovery cursor, window size, and completion state; simplify terminalization to use candidate counters after the single extraction pass.
- [x] `tests/knowledge-ingestion-pipeline.test.ts` -- cover a 20,000-character capture processed in one extraction request, exact Unicode/redacted evidence spans, and a mismatched quote beside a valid sibling.
- [x] production ingestion job -- retry the affected terminal job after verification and inspect aggregate/candidate outcomes without recapturing Facebook.
- [x] `knowledge_ingestion_jobs` and Facebook admin review -- retain the latest successful raw discovery completion for admin-only debugging and persist each invalid candidate's deterministic validation reason.
- [x] `src/features/ai/prompts.ts` and `src/features/knowledge/ingestion-pipeline.ts` -- remove provider span offsets; validate quote text exactness and derive internal Unicode code-point spans server-side in prompt v7.
- [x] `src/features/knowledge/ingestion-pipeline.ts` and Facebook admin review -- retain and display structurally safe candidates rejected only by deterministic policy gates, rather than replacing them with an opaque placeholder.
- [x] `src/features/knowledge/ingestion-jobs.ts`, admin action, and Facebook capture detail -- allow an admin to re-run any v2 job using the current pipeline and immutable capture, safely invalidating active worker fences while retaining canonical cards.

**Acceptance Criteria:**
- Given a 20,000-character text capture, when discovery processes it, then exactly one extraction request receives the complete redacted capture and candidates use absolute evidence spans.
- Given malformed evidence beside a valid candidate, when discovery completes, then the malformed candidate is invalid while the valid candidate remains eligible for independent judgment.
- Given the affected Facebook capture is retried after the fix, when the worker processes it, then it no longer terminally suppresses solely because of window-specific extraction behavior.
- Given an extraction response contains malformed candidates, when discovery completes, then admins can inspect the raw completion and the precise rejection reason without exposing either to traveler-facing paths or worker logs.
- Given a v2 job is queued or terminal after a pipeline change, when an admin selects re-run, then its operational candidates and lease are cleared atomically, discovery is requeued against the same capture, and existing canonical cards remain unchanged.

## Design Notes

V2 already persists the parent state needed for safe claims, retries, candidate work, and aggregate finalization. Because there is no production data that needs compatibility, remove the obsolete discovery cursor, window-size, and discovery-completion state rather than leaving dead schema behind. The parent transaction inserts valid/invalid candidate rows, marks discovery complete through the terminal counters, and finalizes immediately if no candidate work remains. Exact evidence validation remains unchanged and is the sole basis for accepting an extracted candidate.

The product owner approved retention of raw successful discovery completions after the incident could not be diagnosed from aggregate status alone. Store only the model's returned completion in the protected application database, at most 1 MiB, on the canonical job; do not store the provider HTTP envelope, errors, prompts, or credentials. The admin-only Facebook detail route may display it alongside per-candidate deterministic rejection codes. An operator retry clears the prior completion before it runs, so the record represents the latest attempt.

## Verification

**Commands:**
- `pnpm test:run -- tests/knowledge-ingestion-pipeline.test.ts` -- expected: all v2 discovery and regression tests pass.
- `pnpm typecheck` -- expected: no TypeScript errors.
- `pnpm lint` -- expected: no lint errors introduced by this change.

**Results:** The focused single-pass regression passed. `pnpm typecheck` and `git diff --check` passed. `pnpm lint` completed without errors and reported four existing warnings outside this change. The production migration was applied and the affected job was retried without recapturing Facebook. The first full-capture `gpt-5.6-luna` extraction used 7,013 prompt tokens and 895 completion tokens; the retry without `max_tokens` used the same 7,013 prompt tokens and 575 completion tokens. Both produced one `invalid_discovery_candidate`, so the former 1,500-token cap was not the cause; no evidence-grounded candidate was available to judge. This establishes that windowing and the generic output cap were removed, but the model response remains invalid under the exact evidence/schema gate.

## Spec Change Log

- Review finding: the generic 1,500-token extraction cap could truncate a complete-capture multi-fact JSON response. Amended the gateway invocation so this one discovery call omits `max_tokens` and uses the model/gateway native output allowance, while all other bounded gateway calls retain their caps. This avoids reintroducing text windows solely to fit a generic output budget.
- Product-owner decision: retain raw successful discovery completions and exact invalid-candidate reasons for protected admin diagnostics. This supersedes the earlier prohibition on provider-response persistence for this narrowly scoped canonical ingestion record.
- Diagnostic result: `gpt-5.6-luna` returned a structurally valid response whose only candidate used invented type `trip_overview` and omitted both scope fields. Prompt v4 explicitly enumerates the canonical types, requires exactly one non-null scope field, and requires the model to skip trip summaries/duration openings while continuing to scoped atomic facts.
- Diagnostic result after v4: the model returned `{ "candidates": [] }`, so the contract was understood but applied too conservatively. Prompt v5 explicitly admits scoped, concrete first-hand community observations and defers corroboration/confidence to the independent judge, with examples for fees, access effort, lodging/parking constraints, and named food/place observations.
- Product-owner direction: favor extraction recall because canonical candidate judgment remains downstream. Prompt v6 makes that division explicit and requires extraction of all evidence-grounded scoped observations from narrative reports, including route-leg time/distance/incidents, location fees/access/experience, and named venue observations; it still excludes only unscoped trip-wide summaries and unsafe data.
- Product-owner direction: the model must return exact quote text only, not calculated offsets. The server now derives the internal span from the first exact quote occurrence after validation; a quote absent from the immutable redacted capture remains fail-closed.
- Operator feedback: discovery must not suppress an evidence-grounded scoped candidate based on a deterministic travel-context or opinion heuristic. Discovery validates only structure, PII, canonical type normalization, and exact quote evidence; the independent judge owns quality and publication decisions. `weather` is normalized to canonical `warning`. Malformed or PII-bearing output uses the generic placeholder. A structurally safe candidate with a non-exact quote retains its title, scope, summary, and conditions for admin diagnosis, but has no usable evidence, cannot reach the judge, and cannot publish.
- Operator request: add a protected admin re-run control for code/prompt changes. The single canonical job per capture version is reset in place rather than duplicated: candidate rows, diagnostics, counters, and any lease are cleared; `stageVersion` advances so in-flight workers cannot commit; the immutable capture and already-created canonical cards are preserved. The action records an admin audit event.
- Product-owner direction: semantic discovery must not be blocked by an extraction-model quote. Discovery now produces scoped semantic candidates with an optional evidence hint. One independent batch grounding-and-judgment call receives the full immutable capture and all candidates, returns exactly one result per candidate, and must return one exact contiguous quote or `evidence:null`. The server validates the exact quote and derives span offsets. A candidate without grounded evidence is terminally suppressed as `judge_evidence_not_grounded`; only grounded candidates enter relation/persistence.
- Product-owner direction: an exact-grounded high-risk fact, including a price or fee, must enter `verify_first` before normal automated publication thresholds are applied. It is retained outside traveler retrieval for an operator decision rather than discarded because a score such as relevance falls below the auto-publication threshold. For a `verification` recommendation, an authorized operator is the final publisher and may revise the fact freely or publish it with one validated source; the action remains version-fenced, audited, and distinct from multi-source `community_pattern` corroboration.
