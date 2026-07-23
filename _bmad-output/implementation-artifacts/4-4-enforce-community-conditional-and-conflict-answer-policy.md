---
baseline_commit: c93cfdc95316838acdfd069ef22494f2d1fa1224
---

# Story 4.4: Enforce Community, Conditional, and Conflict Answer Policy

Status: review

## Story

As a traveler,
I want uncertainty wording to match the evidence state,
so that community reports guide planning without becoming false guarantees.

## Acceptance Criteria

1. Given a `community_observation`, `community_pattern`, or `conditional` card has `contextual_use`, when an answer is generated, it describes observations as community-reported, calls a pattern multiple independent reports only when the state/evidence supports it, and includes every material condition for conditional use.
2. Given selected material is uncertain or verification-required, when used, it is caveat-only, cannot drive an itinerary decision as settled fact, and tells the traveler what changing detail to confirm.
3. Given a card is conflicted, superseded, verification-failed, or non-active, when an answer is prepared, it is excluded as a factual itinerary premise. The assistant may state uncertainty, ask, search, recommend verification, or choose a safer option.

## Tasks / Subtasks

- [x] Encode state-policy instructions in the source-bundle prompt contract (AC: 1-3)
  - [x] Update `src/features/ai/prompts.ts` and bundle formatting to give explicit per-item instructions derived from the server policy, never from source text.
  - [x] Require Vietnamese wording for observation, independent pattern, conditions, caveat-only verification, and conflict exclusion.
  - [x] Preserve the no-fake-citations rule and prohibit source text from changing prompt policy.
- [x] Add deterministic answer safeguards where model compliance alone is insufficient (AC: 1-3)
  - [x] Extend the existing freshness warning pattern to ensure selected caveat-only/freshness-sensitive facts receive a concrete verify-before-action instruction.
  - [x] Do not parse answer prose to create provenance, but it is acceptable to validate final policy-required warning presence and append a bounded safe warning.
  - [x] Ensure `exclude` data never reaches answer-generation context as factual evidence.
- [x] Add policy-specific answer tests and evaluations (AC: 1-3)
  - [x] Cover observation, independent pattern, conditional material conditions, uncertainty, verification-required, conflict, superseded, and failed verification cases.
  - [x] Prove caveat-only material cannot become a settled itinerary recommendation and excluded material cannot become a factual premise.

### Review Findings

- [x] [Review][Patch] Conditional cards can omit material conditions [src/features/retrieval/approved-knowledge.ts:36] — Preserved all validated conditions as a structured prompt array; no combined 280-character truncation can omit a material condition.
- [x] [Review][Patch] Caveat-only evidence can still drive a settled itinerary recommendation [src/features/ai/answer-freshness.ts:29] — Replaced settled-decision responses with a fail-closed caveat-only fallback and buffered caveat-only stream deltas until the guard completes.
- [x] [Review][Patch] Caveat-only fallback lacks a card-specific verification target [src/features/ai/answer-freshness.ts:30] — Fallback now names each selected card and its first material condition when present, otherwise its current status, as the detail to confirm.

### Review Findings (Re-review 2026-07-23)

- [x] [Review][Patch] Caveat-only settled-decision guard misses ordinary recommendation wording [src/features/ai/answer-freshness.ts:47] — Broadened deterministic detection to cover declarative recommendations and explicit traveler action, replacing unsafe content before streaming or persistence.
- [x] [Review][Patch] Caveat-only fallback omits later material conditions [src/features/ai/answer-freshness.ts:55] — Verification fallback now lists every normalized material condition for each selected card.
- [x] [Review][Patch] Contextual conditional answers lack a deterministic condition-completeness safeguard [src/features/ai/answer-freshness.ts:14] — Final-answer validation replaces incomplete conditional output with a bounded fallback containing every material condition; the route buffers policy-constrained deltas until this guard completes.
- [x] [Review][Patch] Caveat-only settled-decision guard misses accented declarative Vietnamese wording [src/features/ai/answer-freshness.ts:48] — Normalized Unicode-aware matching now fails closed for declarative settled choices such as `Tuyến này là lựa chọn tốt nhất` before streaming or persistence.

## Dev Notes

- Story 4.1 controls selection policy and Story 4.3 controls structured source-bundle content. Do not implement a competing policy in the prompt layer.
- `community_pattern` requires two active supporting records with distinct independence keys; the answer may not infer a pattern from similarity, source labels, or model judgment.
- Conditions are material facts, not decorative metadata. A conditional road report such as rain-dependent access must retain that condition in the answer.
- Do not call community/Facebook material official unless safe source metadata independently supports that label. Verification required is caveat-only even if a card is active.

### Project Structure Notes

- Use `src/features/ai/prompts.ts` and `answer-freshness.ts`; keep the Gateway adapter unchanged.
- Keep policy selection in Knowledge/Retrieval server modules. The stream route remains the orchestration boundary.
- Extend `tests/answer-context.test.ts`; use existing answer evaluation support only if it can assert structured policy behavior without a new test framework.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.4]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7, AD-17]
- [Source: src/features/ai/prompts.ts]
- [Source: src/features/ai/answer-freshness.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Implement after source-bundle state/policy fields are authoritative. Avoid model-only enforcement for safety-critical caveats.
- Red-green verification: `pnpm vitest run tests/answer-context.test.ts` initially failed for the missing policy instructions, exclusion filter, and caveat-only warning; all 68 tests passed after implementation.
- Final verification: `pnpm test:run` (49 files, 673 tests), `pnpm typecheck`, and `pnpm build` passed. `pnpm lint` passed with three pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added server-controlled Vietnamese `policyInstruction` records for contextual community observations, independently supported community patterns, condition-preserving use, and caveat-only material; source text cannot override the policy.
- Added defense-in-depth filtering so conflicted, superseded, verification-failed, and non-active cards cannot enter answer-generation knowledge context as factual premises.
- Extended bounded final-answer warnings to require a concrete verify-before-action instruction when caveat-only material is selected, without deriving provenance from answer prose.
- Added answer-context coverage for all story policy states and safeguards.
- Resolved post-review policy findings: complete conditional arrays reach the prompt; caveat-only settled decisions are replaced before stream/persistence; verification fallbacks name the selected card-specific target.
- Verification after fixes: `pnpm vitest run tests/answer-context.test.ts` (70 tests), `pnpm typecheck`, and `pnpm build` passed. `pnpm lint` completed with the three pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`.
- Resolved final actionable findings: declarative caveat-only recommendations are fail-closed, caveat-only verification names every material condition, and contextual conditional answers are final-validated for every material condition before stream/persistence.
- Verification after final fixes: `pnpm vitest run tests/answer-context.test.ts` (74 tests) and `pnpm typecheck` passed. `pnpm lint` completed with the same three pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`.
- Resolved the remaining actionable caveat-only guard finding: accented declarative Vietnamese settled-decision wording now replaces unsafe output rather than receiving an appended warning.
- Verification after the remaining finding fix: `pnpm vitest run tests/answer-context.test.ts` (75 tests) and `pnpm typecheck` passed.

### File List

- `src/features/ai/prompts.ts`
- `src/features/ai/answer-freshness.ts`
- `src/app/api/ai-ask/stream/route.ts`
- `src/features/retrieval/approved-knowledge.ts`
- `src/features/retrieval/source-bundle.ts`
- `tests/answer-context.test.ts`
- `_bmad-output/implementation-artifacts/4-4-enforce-community-conditional-and-conflict-answer-policy.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-07-23: Enforced state-aware community, conditional, caveat-only, and conflict answer policy; added safeguards and policy-specific tests.
- 2026-07-23: Resolved three actionable review findings for conditional completeness and caveat-only answer safety.
- 2026-07-23: Resolved final actionable findings for declarative caveat-only recommendations and deterministic condition completeness.
- 2026-07-23: Resolved the accented Vietnamese declarative caveat-only settled-decision guard finding; Story 4.4 remains in review.
