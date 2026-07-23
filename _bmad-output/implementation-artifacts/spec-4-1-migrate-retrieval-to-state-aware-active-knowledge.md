---
title: 'Migrate Retrieval to State-Aware Active Knowledge'
type: 'feature'
created: '2026-07-23'
status: 'done'
baseline_revision: '6ac5657'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/4-1-migrate-retrieval-to-state-aware-active-knowledge.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Lexical retrieval rechecks several current Knowledge records, but its boolean eligibility rule still treats legacy approval fields as authority, cannot express safe caveat-only use, and permits operator-only evidence to establish eligibility. A stale active projection can therefore be assessed against an obsolete approval model rather than the current AI-first card state.

**Approach:** Establish a Knowledge-owned typed policy evaluator and use it to re-evaluate every lexical candidate against current card, source, capture, and traveler-safe evidence state. Return only policy-evaluated, bounded safe snapshots; retain stale-projection disabling strictly as best-effort cleanup.

## Boundaries & Constraints

**Always:** Fail closed for any missing, invalid, stale, non-active, suppressed, archived, superseded, conflicted, verification-failed, source-missing, raw, tombstoned, or operator-only dependency. Eligibility must derive from current canonical card/evidence/source/capture rows, never a projection or legacy `status`/`needsReview`. Preserve exact capture-version quote/span validation, source-link checks, Facebook URL redaction, and no raw/provider/operator data in results. A returned candidate carries exactly one of `contextual_use`, `caveat_only`, or `exclude`; search results expose only non-excluded cards and their safe policy snapshots.

**Block If:** The existing state types, evidence schema, or tests establish a required traveler policy that conflicts with the Story 4.1 mapping; no safe fail-closed interpretation can be derived from the story and current architecture.

**Never:** Do not migrate schema or add versioned projection ownership (Story 4.2), alter source-bundle/prompt wording or query-condition application (Stories 4.3/4.4), mutate card aggregates during retrieval, revive approval-queue semantics, or expose `currentJudgeSummary`, raw capture/material, quote spans, provider payloads, audit data, Facebook URLs, or operator-only evidence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Active community observation | Active card, valid traveler-safe supporting evidence/source/capture, complete safe metadata | Return `contextual_use` with conditions, current state, and revisions | No error expected |
| Uncertain evidence-backed card | Otherwise-valid card with `knowledgeState = uncertain` or `verificationState = required` | Return `caveat_only`, never promote to contextual use | No error expected |
| Community pattern support loss | Pattern with fewer than two active traveler-safe evidence rows having distinct independence keys | Evaluate as `exclude`; lexical retrieval omits it and may disable its stale active projection | Best-effort document cleanup only |
| Stale projection | Active lexical row whose owner, source, evidence, or capture becomes ineligible | Current recheck excludes regardless of score and disables projection where practical | Do not mutate card state or throw user-facing error |
| Legacy mutation only | Change only `status` or `needsReview` on a current valid/invalid state-aware card | Policy is unchanged | No error expected |
| Operator-only evidence | Card has only `operator_only` qualifying evidence | Evaluate as `exclude`; never serialize sensitive evidence/source fields | Best-effort document cleanup only |

</intent-contract>

## Code Map

- `src/features/knowledge/state.ts` -- owns the current boolean traveler-eligibility contract that must become a typed state-aware policy evaluator with safe reason codes.
- `src/features/knowledge/search.ts` -- ranks lexical projections, reloads current card/evidence/source/capture data, constructs safe search results, and performs stale-document cleanup.
- `src/features/retrieval/approved-knowledge.ts` -- consumes Knowledge results for AI Ask; must preserve the revised typed result without expanding the Story 4.3 prompt/source-bundle scope.
- `src/features/retrieval/source-bundle.ts` -- downstream typed consumer to type-check; no broad bundle redesign in this story.
- `tests/knowledge-search.test.ts` -- sequential DB-backed retrieval safety and stale-projection regressions.
- `tests/knowledge-source-removal.test.ts` -- source withdrawal and pattern-support lifecycle regression coverage to preserve.
- `tests/answer-context.test.ts` -- prompt boundary tests ensuring safe bounded values stay protected.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/state.ts` -- replace the boolean-only retrieval authority with exhaustive typed policy/reason-code evaluation based on canonical current state and a traveler-safe evidence summary; map valid `community_observation`, valid independently supported `community_pattern`, and valid `conditional` to `contextual_use`, valid `uncertain` or verification-required cards to `caveat_only`, and all unrecognized/incomplete states including `confirmed` to `exclude` -- legacy fields and unapproved assumptions cannot authorize traveler use.
- [x] `src/features/knowledge/search.ts` -- load policy-relevant card fields, conditions, content/evidence revisions, and valid traveler-safe active evidence; calculate distinct independence keys; apply the policy before returning a bounded result, preserving existing source/capture/link/span validation and stale projection cleanup -- lexical ranking remains ordering only, not authority.
- [x] `src/features/retrieval/approved-knowledge.ts` -- adapt retrieval consumption to the revised `KnowledgeSearchResult` while retaining policy/state/conditions data and all existing safe prompt boundaries -- downstream callers remain type-safe without prematurely redesigning source bundles.
- [x] `src/features/knowledge/batch-intake.ts` -- update any indexing/readiness call site affected by removal of the boolean evaluator to use the typed policy only for include/exclude decisions -- ingestion cannot reintroduce legacy-field authorization.
- [x] `src/features/knowledge/review.ts` -- update any lifecycle/indexing call site affected by removal of the boolean evaluator to use typed policy semantics without making `reviewed` a universal prerequisite -- Knowledge-owned mutation flows compile and preserve their aggregate ownership.
- [x] `tests/knowledge-search.test.ts` -- add DB-backed policy, legacy-field, operator-only, current-recheck, stale-projection, safe-result, and pattern-independence regressions -- prove every matrix scenario and retain existing coverage.
- [x] `tests/knowledge-source-removal.test.ts` and `tests/answer-context.test.ts` -- adjust only assertions/type expectations necessary for the new policy result and preserve source-withdrawal and prompt safety behavior -- no regression in established lifecycle/privacy boundaries.

**Acceptance Criteria:**
- Given a lexical projection candidate, when retrieval selects source-bundle input, then it rechecks current canonical card publication/knowledge/review/verification states, conditions, complete required metadata, active traveler-safe evidence, source linkage, source eligibility, and exact retained capture span; legacy `status` and `needsReview` do not affect the outcome.
- Given a candidate with valid current dependencies, when the policy is evaluated, then it has exactly one machine-readable policy: `contextual_use`, `caveat_only`, or `exclude`.
- Given a stale active projection, when the current owner or its eligible evidence/source/capture state is withdrawn or invalid, then it is excluded regardless of lexical score and its projection is disabled when cleanup succeeds without mutating the card.
- Given unknown, incomplete, stale, disabled, suppressed, archived, superseded, conflicted, verification-failed, source-missing, tombstoned-capture, raw, or operator-only input, when policy is evaluated, then the result is `exclude` and no sensitive data is returned.
- Given `community_pattern`, when fewer than two active traveler-safe supporting records with distinct independence keys remain, then it cannot be returned as a contextual pattern; a later support withdrawal downshifts it to exclusion under this story's fail-closed mapping.
- Given only legacy approval fields change, when an otherwise valid or invalid state-aware candidate is evaluated, then its policy does not change.

## Design Notes

The policy evaluator is deliberately the sole compatibility boundary: callers that only need a boolean may test `policy !== "exclude"`, but must not recreate field-level eligibility checks. `reviewState` is evaluated only as a complete known state, not as an implicit requirement for `reviewed`; records not explicitly mapped by this story fail closed. Conditions are validated and returned as a safe snapshot, while matching conditions to a traveler question remains deferred to the answer-policy stories.

The existing `operator_only` display redaction is insufficient because it still permits the evidence to establish eligibility. Separate qualifying traveler-safe support from display filtering, so a card with mixed evidence can be returned only when the traveler-safe subset independently supports its policy.

## Verification

**Commands:**
- `pnpm test:run -- tests/knowledge-search.test.ts tests/knowledge-source-removal.test.ts tests/knowledge-state-migration.test.ts` -- expected: sequential DB-backed state, evidence, capture, source-removal, and migration safety checks pass.
- `pnpm test:run -- tests/answer-context.test.ts` -- expected: AI Ask prompt boundary tests pass without sensitive knowledge leakage.
- `pnpm typecheck` -- expected: strict TypeScript passes across policy consumers.
- `pnpm lint` -- expected: ESLint passes.
- `pnpm build` -- expected: production build succeeds.

## Review Triage Log

### 2026-07-23 - Review pass 1
- intent_gap: 0
- bad_spec: 0
- patch: 5 (high 3, medium 2)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Removed legacy field authority from batch/index-status consumers and added canonical-state coverage.
  - `[high] [patch]` Disabled stale pattern projections after independent support loss and excluded raw source dependencies from all policy consumers.
  - `[medium] [patch]` Bounded conditions and preserved them in full and compact prompt representations.

### 2026-07-23 - Review pass 2
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 2, medium 2)
- defer: 0
- reject: 1 (medium 1)
- addressed_findings:
  - `[high] [patch]` Added an explicit reason for unsupported known knowledge states and rejected conditionless conditional cards.
  - `[high] [patch]` Excluded copied, pasted, screenshot, and mismatched source/capture provenance from traveler-safe evidence.
  - `[medium] [patch]` Preserved conditions for contextual compact prompt output and aligned URL indexing fixtures with their declared provenance.

## Auto Run Result

Status: done

Summary: Replaced legacy approval-gated retrieval eligibility with state-aware policy evaluation and current evidence/source/capture rechecks. Search results now expose bounded safe state snapshots and use policy, while stale projections are disabled only as cleanup.

Files changed:
- `src/features/knowledge/state.ts` - typed fail-closed policy and reason codes.
- `src/features/knowledge/search.ts` - policy-evaluated current-row retrieval and traveler-safe evidence filtering.
- `src/features/knowledge/indexing-worker.ts` - state-aware stale projection cleanup.
- `src/features/knowledge/batch-intake.ts` and `src/features/knowledge/review.ts` - policy-aware derived operational status.
- `src/features/retrieval/approved-knowledge.ts` - bounded policy and conditions prompt representation.
- `tests/knowledge-state.test.ts`, `tests/knowledge-search.test.ts`, `tests/knowledge-batch-source-intake.test.ts`, `tests/knowledge-approved-cards.test.ts`, and `tests/answer-context.test.ts` - regression coverage.

Review findings: 9 patches applied across two passes; no deferred items; one source-removal observation rejected because its canonical state transition intentionally changes a pattern into an observation.

Follow-up review recommendation: false. Final independent review found no unresolved findings after localized safety fixes.

Verification: `pnpm test:run tests/knowledge-state.test.ts tests/knowledge-search.test.ts tests/knowledge-source-removal.test.ts tests/knowledge-state-migration.test.ts tests/knowledge-batch-source-intake.test.ts tests/knowledge-approved-cards.test.ts tests/answer-context.test.ts` passed with 112 tests. `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` passed.

Residual risks: Story 4.2 owns durable projection versioning; this story's stale cleanup remains best effort by design.
