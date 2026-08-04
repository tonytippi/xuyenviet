---
title: 'Centralize version-fenced knowledge lifecycle transitions'
type: 'feature'
created: '2026-08-04'
status: 'draft'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Knowledge cards, operator work, candidate-to-card association, lifecycle audit, and search invalidation are currently mutated by independent Worker and review paths. A stale or partial path can therefore leave a card, recommendation, audit trail, and traveler search projection inconsistent.

**Approach:** Introduce one typed, transactional `transitionKnowledgeCard` command in the domain/database boundary, then move every lifecycle-caused mutation to named command triggers while retaining independent technical job, evidence-capture, source-withdrawal, and index-projection mechanics.

## Boundaries & Constraints

**Always:** Require a named trigger, validated `AuditActor`, expected card/content and evidence fences, and relevant recommendation or candidate lease fences. Preserve established source -> evidence -> card advisory lock ordering when called from source removal; stale and invalid outcomes must have no partial card, evidence, work, audit, dirty-marker, or projection effects. Use target-only lifecycle fields and the existing typed audit writer. Keep the Worker as the sole continuous job/index-loop owner and `apps/admin` presentation-only.

**Block If:** The target lifecycle schema cannot be verified against the merged Story 15.1 migration because obsolete Drizzle declarations remain, a required matrix decision is absent from the lifecycle proposal, or preserving a caller would require a direct lifecycle/work writer outside the central boundary.

**Never:** Add legacy lifecycle compatibility, a second lifecycle convenience writer, API job claiming/ingestion loops, direct database imports to browser applications, candidate recovery behavior reserved for Story 15.2, or retrieval-policy/ranking changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Low-risk completion | Worker `apply` candidate, draft card, eligible active support, matching fences | `resolved`; candidate/card association completes; card becomes `active` with `none`; lifecycle audit and dirty index marker commit together | Missing eligible support or an unsupported source state returns `invalid` without writes |
| Verify-first or conflict | `needs_operator` candidate or conflict trigger, matching fence | `resolved`; card becomes `pending_operator`; exactly one same-fence primary verification/relation/risk item opens; immutable sampling obligation is retained | Duplicate/concurrent resolver resolves one valid transition and makes the other `stale` |
| Operator decision | Open primary recommendation with matching card/evidence/recommendation fence | Publish activates and resolves work; suppress disables card/projection and resolves work; edit/requeue supersedes then opens newly fenced work | Stale/superseded work returns `stale` and changes nothing |
| Support loss or sampling containment | Source withdrawal removes final eligible support, or sampling fails | Projection is disabled atomically; card is suppressed or pending with one fenced risk item per matrix | Rollback leaves every card/work/audit/index row unchanged |
</intent-contract>

## Code Map

- `packages/domain/src/knowledge-lifecycle.ts` -- new narrow trigger/input/outcome port, exported through the domain barrel.
- `packages/database/src/knowledge-lifecycle.ts` -- sole transactional card lifecycle, work, candidate association, lifecycle audit, and lifecycle-index implementation.
- `packages/database/src/{knowledge-draft-review,knowledge-recommendations,admin-knowledge-intake,admin-knowledge-review}.ts` -- direct API-facing adapters currently unavailable pending this command.
- `packages/worker-domain/src/features/knowledge/{ingestion-jobs,ingestion-pipeline,recommendations,review-approval-core,source-removal,youtube-capture}.ts` -- current direct writers and command callers to migrate.
- `packages/database/src/{knowledge-indexing-queue,audit-writers,assistant-provenance-withdrawal}.ts` -- existing index/audit/lock helpers the command must compose rather than duplicate.
- `tests/{knowledge-lifecycle-transition-matrix,knowledge-recommendation-queue,knowledge-ingestion-pipeline,knowledge-source-removal,knowledge-indexing-worker}.test.ts` -- matrix and regression coverage.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain/src/knowledge-lifecycle.ts` and `packages/domain/src/index.ts` -- define/export discriminated triggers, fences, and `resolved | stale | invalid` results without leaking Drizzle types.
- [ ] `packages/database/src/knowledge-lifecycle.ts` and database exports -- implement the transaction-aware command, acquire/observe established locks, validate the published matrix, and atomically update card state, verification, work, candidate association, sampling obligation, audit, and lifecycle-caused index invalidation.
- [ ] `packages/worker-domain/src/features/knowledge/{recommendations,ingestion-jobs,ingestion-pipeline,review-approval-core,source-removal,youtube-capture}.ts` -- replace direct lifecycle/work writes one path at a time; leave only documented technical/evidence/capture/index-worker writes outside the command.
- [ ] `packages/database/src/{knowledge-draft-review,knowledge-recommendations,admin-knowledge-intake,admin-knowledge-review}.ts` and dependent API adapters -- restore operator actions by mapping validated commands to central triggers, with no independent writer.
- [ ] `tests/knowledge-lifecycle-transition-matrix.test.ts` and focused existing suites -- cover all matrix transitions, candidate lease/CAS, stale work, concurrent resolution, source loss, sampling containment, and transaction rollback snapshots.
- [ ] `tests/knowledge-lifecycle-writer-boundary.test.ts` -- add source-level static enforcement for target lifecycle/work/candidate-association/audit/index writes, aliases, and raw SQL outside a documented production-boundary allowlist; allow explicit test fixtures and non-lifecycle technical writers only.
- [ ] `packages/database/src/schema.ts` and Story 15.1 migration assertions -- reconcile any retained obsolete lifecycle-report declarations with the target migration before schema verification, without reintroducing compatibility state.

**Acceptance Criteria:**
- Given any Worker, API operator, source-removal, or sampling-containment lifecycle action, when it changes card lifecycle/work or lifecycle-caused audit/index state, then it calls `transitionKnowledgeCard` with trigger, actor, transaction, and applicable fences; no production direct writer remains.
- Given an eligible low-risk candidate, when its matching Worker completion runs, then the command atomically activates the card with `verification_requirement = none`, records its lifecycle audit, and invalidates/indexes the current fence.
- Given verify-first, conflict, or new suppressed-card evidence, when its transition resolves, then the card is pending operator with exactly one appropriate primary same-fence work item and immutable sampling obligation where required.
- Given publish, suppress, edit/requeue, archive, restore, source support loss, or sampling failure, when a matching transition runs, then the matrix target and work/projection effects commit together; stale/superseded inputs commit none of them.

## Design Notes

The command is the cross-table authority, not a generic repository helper. Trigger-specific input variants should encode only facts already decided by the caller; the command derives permitted lifecycle/work effects from the matrix and evidence predicate. Technical candidate/job failure and index lease/projection execution remain outside it because they do not change lifecycle authority.

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
