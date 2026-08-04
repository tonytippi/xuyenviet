# Story 15.1: Establish the Target Lifecycle Schema

Status: ready-for-dev

## Story

As a knowledge operator, I want all persisted Knowledge records to use one target lifecycle contract, so that contradictory legacy state combinations cannot exist.

## Acceptance Criteria

1. With a confirmed disposable development target, a forward-only migration and reset/reseed replace legacy lifecycle fields with target-only card lifecycle, classification, verification, job, candidate, recommendation, and sampling-obligation fields. No backfill, dual write, compatibility runtime path, or legacy fixture remains.
2. Database checks enforce lifecycle/retrieval rules and candidate disposition/reason nullability. Partial unique indexes allow at most one open primary item and one open sampling item per card content/evidence fence.
3. A database trigger rejects changes to AI disposition or reason after candidate completion. Failed candidates cannot retain either business field.
4. Contracts, seeds, fixtures, Drizzle schema validation, and migration checks use only target shapes.

## Tasks / Subtasks

- [ ] Confirm the exact database target is disposable before schema work; stop for an approved expand-migrate-contract design if it is durable/shared. (AC: 1)
- [ ] Replace legacy schema surfaces in `packages/database/src/schema.ts`. (AC: 1-3)
  - [ ] Cards: `lifecycle_state` (`draft|pending_operator|active|suppressed|archived|rejected`), domain-only `knowledge_state` (`community_observation|community_pattern|conditional|conflicted`), and `verification_requirement` (`none|operator_required|failed`).
  - [ ] Jobs: technical `status` only (`queued|running|completed|failed`), one explicit discovery-terminal checkpoint predicate, retained lease/fence fields, and the four defined aggregate counters.
  - [ ] Candidates: `processing_status`, `ai_disposition`, `outcome_reason_code`, and retained source/card/fence identity. Only completed candidates may use `apply|needs_operator|discard` and a nonblank reason. Use `applied`, `verification_required`, `weak_evidence`, `relation_ambiguous`, `missing_context`, `conflict`, `stale_capture`, and `policy_rejected` as the target reason-code vocabulary.
  - [ ] Recommendations: target work type/status/resolution, one open-primary and one open-sampling index per card/content/evidence fence, and a new immutable sampling-obligation table keyed uniquely by candidate completion fence.
  - [ ] Drop rather than rename legacy card `status`, `publicationState`, `reviewState`, `verificationState`, and `needsReview`; job/candidate business stages and stage versions; recommendation `in_review` and `required_for_sampling`; `knowledge_sampling_candidate_ledger`, `knowledge_verify_first_sampling_obligations`, and lifecycle-only migration/backfill/report surfaces. Remove their schema, contracts, seeds, fixtures, runtime queries, and indexes together.
- [ ] Create one reviewed forward-only Drizzle migration after `0037_browser_oauth_referral_first_touch.sql`; include checks, partial indexes, and the candidate immutability trigger in SQL. (AC: 2-3)
- [ ] Update the existing migration-plan admission manifest and clean-break/reset guard for this migration. Record the disposable-target identity preflight before reset; if it is durable or shared, stop without applying the migration. (AC: 1, 4)
- [ ] Replace legacy contract/domain types and direct inserts in seeds and test helpers. Do not retain aliases, legacy enum values, fallback reads, or compatibility fixtures. (AC: 1, 4)
- [ ] Reset/reseed only under existing disposable-target safeguards and prove all fixtures satisfy target constraints. (AC: 1, 4)
- [ ] Add PostgreSQL-backed tests for every check, both partial unique indexes, completed-candidate trigger immutability, failed-candidate nullability, migration-plan admission, and reset/reseed target-only fixtures. Rewrite or remove legacy assertions; do not treat their former state shapes as evidence. (AC: 2-4)

## Dev Notes

- This is a clean break. Do not preserve `status`, `publicationState`, `reviewState`, `verificationState`, `needsReview`, job business `stage`, candidate business-stage fields, recommendation `in_review`, `requiredForSampling`, or `knowledge_verify_first_sampling_obligations` under another name.
- `active` requires `verification_requirement = none`; non-active cards are not traveler retrievable. Cross-table eligibility and work-state rules belong to Story 15.3, not a trigger that duplicates the command boundary.
- Completed candidates require non-null disposition and reason; queued/processing/failed candidates require both null. The trigger protects completed values from later changes.
- Discovery-terminal must be represented by the selected target checkpoint predicate and declared in the Drizzle schema. Do not continue querying an undeclared `discovery_complete` field or infer completion from counters.
- Retain PostgreSQL/Drizzle ownership. Raw SQL is allowed only in the reviewed migration for constraints, partial indexes, and trigger functions.
- Expected broad compilation fallout is intentional. Update production contracts, seed data, and tests together rather than adding legacy fields or fallback reads.

### Project Structure Notes

- Schema/migrations: `packages/database/src/schema.ts`, `drizzle/migrations/`.
- Public contract types/parsers: `packages/contracts/src/`; ports: `packages/domain/src/`.
- Integration tests must use `DATABASE_URL_TEST` through existing helpers and explicitly reset needed tables. Do not introduce global reset hooks or integration parallelism.

### Verification

```bash
pnpm exec drizzle-kit check
pnpm test:integration -- tests/drizzle-migration-plan.test.ts
pnpm test:integration -- tests/schema-compatibility.test.ts
pnpm test:integration -- tests/knowledge-ingestion-jobs.test.ts
pnpm test:integration -- tests/knowledge-recommendation-queue.test.ts
pnpm typecheck
```

### References

- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Target Model]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Required Database Invariants]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.1]
- [Source: _bmad-output/project-context.md#Testing Rules]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- _bmad-output/implementation-artifacts/15-1-establish-the-target-lifecycle-schema.md
