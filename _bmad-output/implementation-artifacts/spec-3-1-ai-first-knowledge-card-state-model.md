---
title: 'Add the AI-First Knowledge Card State Model'
type: 'feature'
created: '2026-07-21'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: 'dd487f1d9e34f2d3db14e75e490d40bc127e8f2b'
final_revision: 'dd487f1d9e34f2d3db14e75e490d40bc127e8f2b'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Knowledge cards use a single legacy approval lifecycle (`status` and `needs_review`). It cannot express publication, factual knowledge, operator review, and verification independently, and historical approval must not make unsupported material available to travelers.

**Approach:** Add an independently versioned, fail-closed state model to canonical knowledge cards. Migrate every legacy record to a non-escalating state with durable fallback reporting, preserve compatible operator workflows, and move search/index/seed eligibility to the new safety boundary without implementing later capture or evidence work.

## Boundaries & Constraints

**Always:** Keep PostgreSQL/Drizzle authoritative; retain legacy lifecycle fields while existing flows consume them; use the exact state vocabularies in the Epic 3 context; initialize `content_version` and evidence-set revision monotonically; map ambiguous, draft, rejected, duplicate, and no-action records to suppressed or otherwise ineligible states; default unproven factual semantics to `uncertain`; recheck state-model eligibility in traveler search; prevent migrated active-but-evidence-less cards from search, indexing, or seed progress; preserve raw source/operator-only boundaries.

**Block If:** Existing migrations or schema cannot add the state model and safe legacy backfill transactionally, or implementing the required compatibility changes would require creating the Story 3.2 immutable-capture model or Story 3.3 bounded-evidence model.

**Never:** Do not remove `status` or `needs_review`; do not introduce source-capture versions, evidence tables, ingestion jobs, AI judging, admin queue UI, or search-index dirty-marker infrastructure; do not infer `confirmed`, `community_pattern`, `conditional`, `conflicted`, or `corroborated` from legacy data; do not make historical approval alone traveler-eligible; do not expose raw material, provider payloads, or operator-only metadata.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Safe legacy migration | Legacy approved card with `needs_review=false` | Becomes `active`, `uncertain`, `reviewed`, `not_required`, starts at version/revision 1, but remains retrieval-ineligible without bounded evidence | No error expected |
| Terminal legacy records | Archived, rejected, duplicate, or no-action card | Maps to archived or suppressed non-escalating publication state and cannot be retrieved or indexed | No error expected |
| Ambiguous legacy record | Draft, review-needed approved, malformed, or unknown combination | Maps to suppressed/ineligible state with a reason counted in the migration report | Safe fallback; never promote |
| Existing search projection | A card becomes non-active or otherwise ineligible | Search/index selection excludes it and an existing projection is disabled where the migration can do so | Retrieval owner-row recheck fails closed |
| Existing review action | Legacy draft approval or rejection action | Synchronizes the new state fields while keeping legacy compatibility, and cannot bypass evidence eligibility | Safe operational error/transaction rollback on failed write |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- defines `knowledgeCards`, legacy lifecycle enums, source joins, and search projection schema; add the new typed state model and fields here.
- `drizzle/migrations/meta/_journal.json` -- migration journal currently ends at 0037; record the generated 0038 migration metadata.
- `drizzle/migrations/0038_ai_first_knowledge_card_state_model.sql` -- add/backfill the state model, report safe-fallback counts/reasons, and disable unsafe projections.
- `src/features/knowledge/search.ts` -- the traveler-safe owner-row eligibility recheck currently uses legacy approval fields.
- `src/features/knowledge/indexing-worker.ts` -- indexes legacy approved cards and must use the new fail-closed eligibility boundary.
- `src/features/knowledge/review.ts` -- operator draft approval/rejection commands mutate the legacy lifecycle.
- `src/features/knowledge/review-approval-core.ts` -- shared approval mutation mechanics for review commands.
- `src/features/knowledge/batch-intake.ts` -- reports seed/progress status from legacy lifecycle values.
- `tests/knowledge-search.test.ts` -- coverage for index and owner-row eligibility behavior.
- `tests/knowledge-draft-review.test.ts` -- coverage for draft review/approval behavior.
- `tests/knowledge-batch-source-intake.test.ts` -- coverage for seed progress/legacy approved-card behavior.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` -- added explicit state types, state-model fields, versions, conditions, judge summary, and database checks while retaining legacy lifecycle fields.
- [x] `drizzle/migrations/0038_ai_first_knowledge_card_state_model.sql` and `drizzle/migrations/meta/*` -- added safe legacy backfill, fallback reporting, and unsafe projection disablement.
- [x] `src/features/knowledge/state.ts` -- added a shared server-safe predicate that fails closed until Story 3.3 supplies bounded evidence/retrieval metadata.
- [x] `src/features/knowledge/search.ts` and `src/features/knowledge/indexing-worker.ts` -- use state-aware eligibility and disable stale/ineligible active projections.
- [x] `src/features/knowledge/review.ts` and `src/features/knowledge/review-approval-core.ts` -- synchronize AI-first states and content versions for legacy-compatible review actions.
- [x] `src/features/knowledge/batch-intake.ts` -- excludes evidence-less legacy approved cards from seed progress and marks them review-needed.
- [x] `tests/knowledge-search.test.ts`, `tests/knowledge-draft-review.test.ts`, `tests/knowledge-batch-source-intake.test.ts`, and `tests/knowledge-state-migration.test.ts` -- cover migration, projection cleanup, review, and seed-state safety.

**Acceptance Criteria:**
- Given legacy knowledge cards exist, when the state-model migration runs, then every card has `publication_state`, `knowledge_state`, `review_state`, `verification_state`, monotonic `content_version`, evidence-set revision, conditions, and a current judge summary.
- Given legacy approved, archived, rejected, duplicate, and no-action records, when migration completes, then they map to documented non-escalating state combinations and only legacy-approved records without a review requirement may be marked publication-active; none are traveler-eligible without later bounded evidence.
- Given a legacy record has no unambiguous mapping, when migration completes, then it is suppressed or otherwise ineligible and the migration report identifies its fallback reason and count.
- Given a card is suppressed, archived, superseded, evidence-less, or otherwise state-model-ineligible, when search, indexing, or seed progress evaluates it, then it is excluded even if its legacy `status` is approved or an old projection exists.
- Given a legacy-compatible operator approval or rejection action, when it commits, then legacy and new state fields remain synchronized and no action can make a card retrievable without the later evidence requirements.

## Spec Change Log

Empty - no bad_spec loopback occurred.

## Design Notes

The migration separates translation of old operational status from traveler eligibility. `active` is a publication dimension, not proof of evidence sufficiency. Until Story 3.3 introduces bounded, source-versioned evidence and required retrieval metadata, the shared predicate must return false for all migrated cards. This prevents a direct legacy `approved` to traveler-use escalation while preserving enough state for operators to continue safely.

## Verification

**Commands:**
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no TypeScript errors.
- `pnpm test:run tests/knowledge-search.test.ts tests/knowledge-draft-review.test.ts tests/knowledge-batch-source-intake.test.ts` -- expected: all state-model regressions pass.
- `pnpm build` -- expected: successful production build.

## Review Triage Log

### 2026-07-21 - Review pass 1
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 3, low 2)
- defer: 1: (high 0, medium 1, low 0)
- reject: 1
- addressed_findings:
  - `[medium] [patch]` Corrected indexing-worker selection for missing, disabled, stale, and changed projections.
  - `[medium] [patch]` Marked legacy approved cards evidence-pending in the operator surface.
  - `[medium] [patch]` Mapped evidence-less legacy approved seed items to `needs_review`.
  - `[low] [patch]` Replaced the legacy-only judge summary default with neutral pending text.
  - `[low] [patch]` Added migration, reporting, projection, and worker regression coverage.

### 2026-07-21 - Review pass 2
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 2, low 0)
- defer: 1: (high 0, medium 1, low 0)
- reject: 1
- addressed_findings:
  - `[medium] [patch]` Disabled superseded active projections through the worker.
  - `[medium] [patch]` Reconciled every active projection against fail-closed eligibility so evidence-less projections are disabled in the background.

## Auto Run Result

**Summary:** Added the independent AI-first card state model, safe legacy mappings/reporting, and a fail-closed retrieval boundary until Story 3.3 bounded evidence is available.

**Verification:** `git diff --check`, focused knowledge tests (5 files, 43 tests), `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. `pnpm test:run` has 526 passing and 5 failing tests: three downstream legacy knowledge-retrieval assertions in `tests/answer-context.test.ts`, plus unrelated existing prompt-version and redirect-format failures.

**Residual risk:** Story 3.3 must define bounded evidence eligibility and update the deferred AI Ask integration fixtures. No commit was created because none was requested.
