# Story 4.1: Migrate Retrieval to State-Aware Active Knowledge

Status: ready-for-dev

## Story

As a traveler,
I want AI Ask to select only currently safe community knowledge,
so that old approval flags cannot make unsafe or withdrawn facts appear in answers.

## Acceptance Criteria

1. Given lexical knowledge search returns projection candidates, when retrieval selects source-bundle items, it rechecks the current card publication, knowledge, review, verification, active evidence, traveler-safe source linkage, conditions, and required metadata. Legacy `status` and `needsReview` fields do not determine eligibility.
2. Given a candidate has current valid owner/evidence/source state, when retrieval evaluates intended use, it returns exactly one machine-readable policy: `contextual_use`, `caveat_only`, or `exclude`.
3. Given a projection remains active after an index delay, when its owner row or evidence is no longer eligible, retrieval excludes it and disables the stale projection where practical. Lexical score never overrides eligibility.
4. Unknown, incomplete, stale, disabled, suppressed, archived, superseded, verification-failed, source-missing, tombstoned-capture, raw, and operator-only records fail closed.

## Tasks / Subtasks

- [ ] Define the state-aware retrieval policy in the Knowledge-owned server boundary (AC: 1, 2, 4)
  - [ ] Replace the boolean-only consumer contract in `src/features/knowledge/state.ts` with a typed policy evaluator and safe reason codes.
  - [ ] Preserve all current card/evidence/source/capture integrity checks; do not use a projection, `status`, or `needsReview` as authority.
   - [ ] Map active `community_observation`, `community_pattern`, and `conditional` cards with valid support to `contextual_use`; map `uncertain` or `verificationState = required` to `caveat_only`; map unsupported or incomplete knowledge states, conflicted, superseded, non-active, failed verification, or incomplete records to `exclude`.
   - [ ] Treat `community_pattern` as valid only with at least two active supporting evidence records whose `independence_key` values differ. A withdrawn or removed record, or duplicate independence keys, must downshift the card from pattern eligibility.
- [ ] Refactor lexical retrieval to return policy-evaluated, traveler-safe results (AC: 1-4)
  - [ ] Update `src/features/knowledge/search.ts` result types and current-row join/recheck to expose card states, conditions, content/evidence revisions, policy, and only safe source/evidence fields needed by later stories.
  - [ ] Keep exact capture-version quote/span validation, active supporting-evidence limits, source eligibility checks, and operator-only/Facebook URL redaction.
  - [ ] Disable a stale projection only as safe cleanup; Retrieval must not mutate card state or repair Knowledge-owned aggregates.
- [ ] Add focused state-policy and regression coverage (AC: 1-4)
   - [ ] Cover each policy outcome and every fail-closed condition, including unsupported knowledge states, source withdrawal, removed evidence, tombstoned capture, stale projection, and operator-only evidence.
   - [ ] Cover community-pattern eligibility with one supporting record, duplicate independence keys, and a pattern downshift after supporting-evidence withdrawal.
  - [ ] Prove modifying only legacy `status`/`needsReview` cannot promote an otherwise ineligible card or demote an otherwise valid state-aware candidate.
  - [ ] Preserve existing search and source-removal tests.

## Dev Notes

- `knowledge_cards` is the canonical fact aggregate. The four independent state dimensions, `contentVersion`, `evidenceSetRevision`, conditions, and current effective evidence govern retrieval. Do not revive an approval queue or make `reviewed` a universal publication prerequisite.
- Evidence must be active, supporting/primary, tied to a matching card-source link, source-eligible, capture-retained, and span-valid against its exact immutable capture. A later source recapture does not invalidate valid evidence against an older retained capture.
- Keep `currentJudgeSummary`, raw capture material, raw metadata, provider payloads, audit data, and operator-only evidence out of returned data. `fact_only` evidence may support a card without exposing quote/link; operator-only evidence exposes neither. Facebook URLs stay hidden.
- This story establishes the policy API only. Versioned dirty-marker worker claiming is Story 4.2; source-bundle/prompt changes are Story 4.3.

### Project Structure Notes

- Knowledge owns policy and lexical candidate evaluation: `src/features/knowledge/state.ts` and `src/features/knowledge/search.ts`.
- Retrieval may consume the typed result in `src/features/retrieval/approved-knowledge.ts`, but avoid a broad UI or prompt refactor until Story 4.3.
- Extend `tests/knowledge-search.test.ts` or add a focused retrieval-policy suite. DB-backed tests must run sequentially where shared database state is involved.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-17]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7, AD-17, Retrieval Contract]
- [Source: src/features/knowledge/state.ts]
- [Source: src/features/knowledge/search.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Story context created from the current revised Epic 4 contract. The historical `epic-4-context.md` intake workflow is superseded and must not guide implementation.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
