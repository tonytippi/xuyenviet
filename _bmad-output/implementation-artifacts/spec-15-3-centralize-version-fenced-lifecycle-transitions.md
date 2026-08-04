---
title: 'Centralize version-fenced knowledge lifecycle transitions'
type: 'feature'
created: '2026-08-04'
status: 'in-review'
baseline_revision: 'ee2a4cf'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Knowledge cards, operator work, candidate-to-card association, lifecycle audit, and search invalidation are currently mutated by independent Worker and review paths. A stale or partial path can therefore leave a card, recommendation, audit trail, and traveler search projection inconsistent.

**Approach:** Restore the prior AI-driven extract -> judge -> relate flow in the target model: a system-bounded shortlist lets AI return `attach`, `create`, `conflict`, or `ambiguous`; validated relation facts then enter one typed, transactional `transitionKnowledgeCard` command. The command owns every lifecycle-caused mutation while technical job, evidence-capture, source-withdrawal, and index-projection mechanics remain independent.

## Boundaries & Constraints

**Always:** Require a named trigger, validated `AuditActor`, expected card/content and evidence fences, and relevant recommendation or candidate lease fences. For candidate relation, retrieve a bounded system-owned shortlist and accept an AI `targetCardId` only when it belongs to that shortlist; validate structured `attach`, `create`, `conflict`, or `ambiguous` facts before persistence. Preserve established source -> evidence -> card advisory lock ordering when called from source removal; stale and invalid outcomes must have no partial card, evidence, work, audit, dirty-marker, or projection effects. Use target-only lifecycle fields and the existing typed audit writer. Keep the Worker as the sole continuous job/index-loop owner and `apps/admin` presentation-only.

**Block If:** The target lifecycle schema cannot be verified against the merged Story 15.1 migration because obsolete Drizzle declarations remain, a required matrix decision is absent from the lifecycle proposal, or preserving a caller would require a direct lifecycle/work writer outside the central boundary.

**Never:** Add legacy lifecycle compatibility, a second lifecycle convenience writer, API job claiming/ingestion loops, direct database imports to browser applications, candidate recovery behavior reserved for Story 15.2, or retrieval-policy/ranking changes. Do not let AI select arbitrary card IDs, write the database directly, or force operators to search the complete card corpus.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Low-risk completion | Worker `apply` candidate, validated AI `attach` or `create` relation, eligible active support, matching fences | `resolved`; candidate/card association completes; the selected or newly created card becomes `active` with `none`; lifecycle audit and dirty index marker commit together | A target outside the shortlist, missing eligible support, or unsupported source state returns `invalid` without writes |
| Verify-first, conflict, or ambiguity | `needs_operator` candidate plus validated AI `attach`, `create`, `conflict`, or `ambiguous` relation | `resolved`; the selected or newly created card becomes `pending_operator`; exactly one same-fence primary verification/relation/risk/missing-context item opens; immutable sampling obligation is retained | Duplicate/concurrent resolver resolves one valid transition and makes the other `stale` |
| Operator decision | Open primary recommendation with matching card/evidence/recommendation fence | Publish activates and resolves work; suppress disables card/projection and resolves work; edit/requeue supersedes then opens newly fenced work | Stale/superseded work returns `stale` and changes nothing |
| Support loss or sampling containment | Source withdrawal removes final eligible support, or sampling fails | Projection is disabled atomically; card is suppressed or pending with one fenced risk item per matrix | Rollback leaves every card/work/audit/index row unchanged |
</intent-contract>

## Code Map

- `packages/domain/src/knowledge-lifecycle.ts` -- new narrow trigger/input/outcome port, exported through the domain barrel.
- `packages/database/src/knowledge-lifecycle.ts` -- sole transactional card lifecycle, work, candidate association, lifecycle audit, and lifecycle-index implementation.
- `packages/database/src/{knowledge-draft-review,knowledge-recommendations,admin-knowledge-intake,admin-knowledge-review}.ts` -- direct API-facing adapters currently unavailable pending this command.
- `packages/worker-domain/src/features/knowledge/{ingestion-jobs,ingestion-pipeline,recommendations,review-approval-core,source-removal,youtube-capture}.ts` -- AI extract/judge/relation, current direct writers, and command callers to migrate.
- `packages/database/src/{knowledge-indexing-queue,audit-writers,assistant-provenance-withdrawal}.ts` -- existing index/audit/lock helpers the command must compose rather than duplicate.
- `tests/{knowledge-lifecycle-transition-matrix,knowledge-recommendation-queue,knowledge-ingestion-pipeline,knowledge-source-removal,knowledge-indexing-worker}.test.ts` -- matrix and regression coverage.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/knowledge-lifecycle.ts` and `packages/domain/src/index.ts` -- define/export discriminated triggers, fences, and `resolved | stale | invalid` results without leaking Drizzle types.
- [x] `packages/database/src/knowledge-lifecycle.ts` and database exports -- implement the transaction-aware command, acquire/observe established locks, validate the published matrix, and atomically update card state, verification, work, candidate association, sampling obligation, audit, and lifecycle-caused index invalidation.
- [x] `packages/worker-domain/src/features/knowledge/{recommendations,ingestion-jobs,ingestion-pipeline,review-approval-core,source-removal,youtube-capture}.ts` -- restore AI extract/judge/relation with a bounded system-generated shortlist; validate `attach`, `create`, `conflict`, and `ambiguous` relation facts, then replace direct lifecycle/work writes one path at a time; leave only documented technical/evidence/capture/index-worker writes outside the command.
- [x] `packages/database/src/{knowledge-draft-review,knowledge-recommendations,admin-knowledge-intake,admin-knowledge-review}.ts` and dependent API adapters -- restore operator actions by mapping validated commands to central triggers, with no independent writer.
- [x] `tests/knowledge-lifecycle-transition-matrix.test.ts` and focused existing suites -- cover matrix transitions, candidate lease/CAS, stale work, source loss, sampling containment, and lifecycle effects.
- [x] `tests/knowledge-lifecycle-writer-boundary.test.ts` -- add source-level static enforcement for target lifecycle/work/candidate-association/audit/index writes with a documented production-boundary allowlist.
- [x] `packages/database/src/schema.ts` and Story 15.1 migration assertions -- verify the target-only schema/migration declarations without reintroducing compatibility state.

**Acceptance Criteria:**
- Given any Worker, API operator, source-removal, or sampling-containment lifecycle action, when it changes card lifecycle/work or lifecycle-caused audit/index state, then it calls `transitionKnowledgeCard` with trigger, actor, transaction, and applicable fences; no production direct writer remains.
- Given an eligible low-risk candidate and a validated AI relation target from the system-generated shortlist, when its matching Worker completion runs, then the command atomically associates the candidate with the selected or newly created card, activates it with `verification_requirement = none`, records its lifecycle audit, and invalidates/indexes the current fence.
- Given verify-first, conflict, ambiguity, or new suppressed-card evidence and validated AI relation facts, when its transition resolves, then the selected or newly created card is pending operator with exactly one appropriate primary same-fence work item and immutable sampling obligation where required.
- Given publish, suppress, edit/requeue, archive, restore, source support loss, or sampling failure, when a matching transition runs, then the matrix target and work/projection effects commit together; stale/superseded inputs commit none of them.

## Design Notes

The command is the cross-table authority, not a generic repository helper. AI relation is a prior Worker step, not command behavior: it receives a bounded shortlist generated by the system, returns a schema-validated `attach`, `create`, `conflict`, or `ambiguous` result, and cannot select a card outside that list. Trigger-specific input variants encode only those validated facts; the command derives permitted lifecycle/work effects from the matrix and evidence predicate. Technical candidate/job failure and index lease/projection execution remain outside it because they do not change lifecycle authority.

Existing source-removal callers already hold source/evidence/card anchors. The command must accept the supplied transaction and avoid lock-order reversal rather than starting an independent transaction. A lifecycle transition may use existing queue/audit helpers, but those helpers must no longer be invoked directly by feature paths for lifecycle effects.

## Verification

**Commands:**
- `pnpm test:integration -- tests/knowledge-lifecycle-transition-matrix.test.ts` -- expected: all matrix, stale, concurrency, and atomicity cases pass serially.
- `pnpm test:integration -- tests/knowledge-recommendation-queue.test.ts` -- expected: target work cardinality and resolution semantics pass.
- `pnpm test:integration -- tests/knowledge-ingestion-pipeline.test.ts` -- expected: candidate-triggered lifecycle effects and lease fences pass.
- `pnpm test:integration -- tests/knowledge-source-removal.test.ts` -- expected: final-support removal atomically removes traveler eligibility.
- `pnpm test:integration -- tests/knowledge-indexing-worker.test.ts` -- expected: lifecycle invalidation and operational index CAS remain safe.
- `pnpm typecheck` -- expected: strict workspace typecheck passes.
- `pnpm exec drizzle-kit check` -- expected: target schema and migration metadata agree.
- `rg 'lifecycle_state|verification_requirement|knowledge_recommendations' packages apps` -- expected: every production mutation is within the documented command/helper allowlist.

## Auto Run Result

Status: resolved

Blocking condition resolved: Story 15.1's target schema is now consistent. The legacy Drizzle declarations for `knowledge_card_state_migration_reports` and `knowledge_evidence_backfill_reports` were removed to match migration `0038_target_knowledge_lifecycle.sql`.

Evidence gathered:

- The Story 15.1 record is `done` and states that both legacy report declarations were removed.
- Migration `0038_target_knowledge_lifecycle.sql` lines 3-4 drops both tables.
- No runtime, seed, or test references remained outside the obsolete Drizzle declarations.
- The planned Story 15.3 implementation has a complete code map, trigger/fence contract, writer migration inventory, matrix coverage, and static-boundary enforcement task.

### 2026-08-04 — Planning block

Status: blocked

Blocking condition: The required low-risk candidate-completion transition cannot be implemented without inventing a card selection or creation policy.

Evidence gathered:

- The transition matrix requires low-risk candidate completion to atomically complete and associate the candidate with an active card, with matching card and evidence fences.
- `packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts` currently records only candidate AI disposition/reason and has no card identity, matching rule, or new-card construction facts.
- `packages/worker-domain/src/features/knowledge/ingestion-jobs.ts` can persist `knowledgeCardId` but receives no documented decision for selecting or creating that card.
- The lifecycle proposal and Story 15.3 acceptance criteria assign the central command ownership of the association, but do not define how a candidate identifies an existing card or when it creates a new card.

Unanswered decision:

- For a completed candidate with `apply` or `needs_operator`, what validated caller-owned policy selects an existing knowledge card or supplies the target card creation facts before `transitionKnowledgeCard` runs?

### 2026-08-04 — Block resolved

The product decision restores the prior AI-first relation stage rather than introducing manual corpus-wide operator selection or a new generic matching service. The Worker provides a system-generated bounded shortlist to AI and validates one of `attach`, `create`, `conflict`, or `ambiguous`; only a shortlist member may be selected. `transitionKnowledgeCard` receives those validated relation facts and remains the sole lifecycle writer. `ambiguous` creates targeted operator work with the AI shortlist and rationale, so operator review handles exceptions rather than manually searching all cards.

### 2026-08-04 — Implementation and review

Implemented the target lifecycle command and migrated candidate processing, operator review, draft approval, source removal, recommendation, and capture-triggered lifecycle effects. The Worker now invokes the existing AI gateway with a system-generated bounded shortlist and validates the structured relation decision before the command persists it. The command owns fenced card/work/candidate/audit/index effects, preserves technical Worker leases outside the boundary, and rejects stale, unsupported, archived, suppressed, rejected, or forged-target transitions.

Independent adversarial and edge-case passes drove repairs for evidence/source persistence, candidate job finalization, sampling obligations, action-to-resolution mapping, stale restore fencing, raw-source validation, direct-writer enforcement, and primary/sampling work independence.

## Review Triage Log

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 18: (high 6, medium 12, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Added durable evidence/source links, candidate lease/CAS checks, atomic job finalization, and target-only shortlist validation before lifecycle resolution.
  - `[high]` `[patch]` Restored the production AI relation decision path and prevented invalid outcomes from leaving candidates leased indefinitely.
  - `[high]` `[patch]` Fenced restore by its originating recommendation and both card versions so stale or sampling work cannot reactivate a card.
  - `[medium]` `[patch]` Completed operator action mapping, sampling-obligation disposition updates, matrix-compatible work supersession, and shared draft raw-source validation.
  - `[medium]` `[patch]` Strengthened static writer enforcement and added lifecycle matrix regressions for stale, invalid, sampling, support-loss, and work-independence cases.

## Final Verification

- `pnpm typecheck` -- passed.
- `pnpm exec vitest run --project integration tests/knowledge-ingestion-pipeline.test.ts tests/knowledge-recommendation-queue.test.ts tests/knowledge-lifecycle-transition-matrix.test.ts tests/knowledge-lifecycle-writer-boundary.test.ts --maxWorkers=1 --no-file-parallelism` -- passed: 4 files, 17 tests.
- `pnpm exec drizzle-kit check` -- passed.
- `git diff --check` -- passed.

Residual risk: broader source-removal, indexing-worker, and full integration suites were not run in this cycle; focused lifecycle coverage is serial because integration tests share one physical database. No commit was created.
