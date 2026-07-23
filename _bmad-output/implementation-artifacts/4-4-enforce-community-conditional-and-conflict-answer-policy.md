# Story 4.4: Enforce Community, Conditional, and Conflict Answer Policy

Status: ready-for-dev

## Story

As a traveler,
I want uncertainty wording to match the evidence state,
so that community reports guide planning without becoming false guarantees.

## Acceptance Criteria

1. Given a `community_observation`, `community_pattern`, or `conditional` card has `contextual_use`, when an answer is generated, it describes observations as community-reported, calls a pattern multiple independent reports only when the state/evidence supports it, and includes every material condition for conditional use.
2. Given selected material is uncertain or verification-required, when used, it is caveat-only, cannot drive an itinerary decision as settled fact, and tells the traveler what changing detail to confirm.
3. Given a card is conflicted, superseded, verification-failed, or non-active, when an answer is prepared, it is excluded as a factual itinerary premise. The assistant may state uncertainty, ask, search, recommend verification, or choose a safer option.

## Tasks / Subtasks

- [ ] Encode state-policy instructions in the source-bundle prompt contract (AC: 1-3)
  - [ ] Update `src/features/ai/prompts.ts` and bundle formatting to give explicit per-item instructions derived from the server policy, never from source text.
  - [ ] Require Vietnamese wording for observation, independent pattern, conditions, caveat-only verification, and conflict exclusion.
  - [ ] Preserve the no-fake-citations rule and prohibit source text from changing prompt policy.
- [ ] Add deterministic answer safeguards where model compliance alone is insufficient (AC: 1-3)
  - [ ] Extend the existing freshness warning pattern to ensure selected caveat-only/freshness-sensitive facts receive a concrete verify-before-action instruction.
  - [ ] Do not parse answer prose to create provenance, but it is acceptable to validate final policy-required warning presence and append a bounded safe warning.
  - [ ] Ensure `exclude` data never reaches answer-generation context as factual evidence.
- [ ] Add policy-specific answer tests and evaluations (AC: 1-3)
  - [ ] Cover observation, independent pattern, conditional material conditions, uncertainty, verification-required, conflict, superseded, and failed verification cases.
  - [ ] Prove caveat-only material cannot become a settled itinerary recommendation and excluded material cannot become a factual premise.

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

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
