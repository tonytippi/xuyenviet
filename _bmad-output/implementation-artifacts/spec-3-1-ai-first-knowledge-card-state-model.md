---
title: 'Story 3.1: Add the AI-First Knowledge Card State Model'
type: 'feature'
created: '2026-07-21'
status: 'done'
baseline_revision: 'dd487f1'
final_revision: '658af34'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
warnings:
  - 'Story 3.3 must add bounded evidence and complete traveler-eligibility metadata before any card can be retrieved.'
---

## Intent

Replace the approval-only knowledge lifecycle with independent publication, knowledge, review, and verification state. Migrate existing cards conservatively, retain a concise mapping report, and ensure evidence-less legacy cards cannot remain in traveler search or retrieval.

## Tasks & Acceptance

- [x] Add independent state, version, conditions, and current-judgment fields with strict schema constraints and indexes.
- [x] Create a Drizzle migration that maps legacy records to safe, non-escalating states and records mapping counts by reason.
- [x] Disable active legacy search projections during migration and make index/search/read models fail closed until bounded evidence exists.
- [x] Synchronize the legacy operator approval flow to the new state model without granting traveler eligibility.
- [x] Cover state migration, state-aware search/index behavior, approved-card presentation, and seed-progress exclusions.
- [x] Apply code-review fix: bound indexing-worker candidates in SQL before in-memory eligibility filtering.

**Acceptance Criteria:**

- Given legacy knowledge cards exist, when the state-model migration runs, then every card receives `publication_state`, `knowledge_state`, `review_state`, `verification_state`, monotonic `content_version`, evidence-set revision, conditions, and current judge summary; approved, archived, rejected, duplicate, and no-action records map without escalation.
- Given a legacy record has no unambiguous mapping, when the migration completes, then it is suppressed or otherwise ineligible by default and the migration report records the fallback reason and count.
- Given a migrated legacy card has no bounded evidence, when indexing or traveler search/read paths evaluate it, then it remains ineligible and any active projection is disabled.

## Implementation Notes

- Added independent state enums and constrained `knowledge_cards` fields, plus `knowledge_card_state_migration_reports`.
- Added migration `0038_ai_first_knowledge_card_state_model.sql`, which safely maps legacy lifecycle state, records counts, and disables active projections.
- Added `isKnowledgeCardTravelerEligible`; it deliberately returns false until Story 3.3 supplies bounded evidence and retrieval metadata.
- Updated approval, review, seed-progress, search, and indexing paths to use the state model and preserve fail-closed retrieval.
- The indexing worker bounds candidates with SQL `LIMIT` before eligibility filtering, preventing an unbounded projection-table scan on each poll.

## Review Findings

- [x] [Review][Patch] Bound indexing-worker candidate selection at the database boundary [`src/features/knowledge/indexing-worker.ts:105`] -- fixed by applying `LIMIT batchSize` before fail-closed eligibility filtering.

## Verification

- `pnpm exec vitest run tests/knowledge-search.test.ts` -- passed, 4 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

## File List

- `_bmad-output/implementation-artifacts/spec-3-1-ai-first-knowledge-card-state-model.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0038_ai_first_knowledge_card_state_model.sql`
- `drizzle/migrations/meta/0038_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/db/schema.ts`
- `src/features/knowledge/state.ts`
- `src/features/knowledge/search.ts`
- `src/features/knowledge/indexing-worker.ts`
- `src/features/knowledge/review.ts`
- `src/features/knowledge/batch-intake.ts`
- `tests/knowledge-state-migration.test.ts`
- `tests/knowledge-search.test.ts`
- `tests/knowledge-approved-cards.test.ts`
- `tests/knowledge-batch-source-intake.test.ts`
- `tests/knowledge-draft-review.test.ts`
