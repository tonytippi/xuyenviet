# Story 15.1: Establish the Target Lifecycle Schema

Status: done

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
- 2026-08-04: Started the target-only schema cutover. `knowledge_cards`, ingestion jobs, ingestion candidates, recommendations, and sampling obligations now have target declarations; the legacy sampling ledger, verify-first obligation table, card-state migration report, and evidence-backfill report declarations were removed.
- 2026-08-04: Added forward-only migration `0038_target_knowledge_lifecycle.sql` and its journal entry. It drops legacy lifecycle fields/tables, declares target row-local checks, creates both target partial unique indexes, and installs the completed-candidate AI-decision immutability trigger.
- 2026-08-04: `pnpm exec drizzle-kit check` passed and `git diff --check` passed.
- 2026-08-04: `pnpm typecheck` failed. The clean-break schema correctly exposes broad required follow-up work: existing production modules and integration tests still reference removed card lifecycle fields, job/candidate stages, recommendation reasons/legacy sampling fields, and legacy sampling tables. These consumers must be rewritten to target-only shapes before the Story can be completed; compatibility aliases were not added.
- 2026-08-04: No migration, reset, or reseed was run. The exact disposable-local preflight is not demonstrably satisfied: the active shell contains none of `APP_ENV`, `DATABASE_URL`, `DB_RESET_DISPOSABLE_CONFIRMATION`, `DB_RESET_NO_RUNTIME_OVERLAP`, or `DB_RESET_EXPECTED_TARGET_IDENTITY`, so the required resolved database identity and no-runtime-overlap confirmation cannot be verified. This is a fail-closed destructive-action blocker.
- 2026-08-04: The target schema declaration attempt was restored after the clean break exposed unconverted production, contract, seed, fixture, and integration-test consumers. The forward migration remains as a proposed artifact only; no aliases, fallback reads, reset, migration, or reseed were added. The story remains in progress pending one coordinated target-only rewrite and an explicitly authorized disposable-target preflight.
- 2026-08-04: Review repair: migration 0038 explicitly replaces the baseline job terminal-claim, recommendation resolution/resolved-shape constraints, and legacy open queue index with target definitions. PostgreSQL coverage now proves target recommendation resolution/resolved-row shapes, and the recommendation resolver rejects work-type-incompatible resolutions. The baseline report-table drops are correct because those tables are baseline-owned and absent from the target schema. Expired candidate recovery remains deferred to Story 15.2.
- 2026-08-04: Updated the digest-pinned migration admission test for the reviewed 0038 SQL revision. Pending verification includes clean reset/reseed of confirmed development and test targets, focused serial Story 15.1 suites, typecheck, and Drizzle metadata validation.
- 2026-08-04: Operator reconfirmed the exact disposable local target and required ignored `.env` safeguards. Reapplied the target Drizzle declarations for lifecycle cards, technical ingestion jobs, immutable candidate decisions, target recommendation work, and sampling obligations to match migration `0038_target_knowledge_lifecycle.sql`.
- 2026-08-04: `pnpm exec drizzle-kit check` and `git diff --check` pass. `pnpm typecheck` cannot pass yet: all retired lifecycle columns now correctly fail across active production consumers (`packages/database`, `packages/contracts`, and `packages/worker-domain`) and legacy integration fixtures. The ingestion pipeline/recommendation resolver still implements retired business stages and Story 15.3 cross-table transitions, so it cannot be converted mechanically without a coordinated rewrite. No aliases, fallbacks, reset, migration, or reseed were used. The required reset is deferred until target-only compilation succeeds.
- 2026-08-04: Completed coordinated target-only conversion across database, Worker, contracts, seeds, fixtures, and integration tests. The confirmed disposable development and test databases were recreated from the final migration and seeded. The final serial Story 15.1 suite passed 89 tests across 9 files; typecheck, Drizzle check, and diff check pass. Independent review repaired inherited legacy job/recommendation constraints and indexes in migration 0038, and added target resolution-shape coverage. Expired processing-candidate recovery is deferred to Story 15.2.

### File List

- _bmad-output/implementation-artifacts/15-1-establish-the-target-lifecycle-schema.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- drizzle/migrations/0038_target_knowledge_lifecycle.sql
- drizzle/migrations/meta/_journal.json
- packages/database/src/schema.ts
- packages/database/src/knowledge-*.ts
- packages/database/src/admin-*.ts
- packages/database/src/{answer-freshness,approved-knowledge,provenance,source-bundle}.ts
- packages/contracts/src/index.ts
- packages/worker-domain/src/features/knowledge/*.ts
- tests/*knowledge*.test.ts
- tests/{browser-identity.integration,contracts-browser-compatibility,drizzle-migration-plan,facebook-capture-review,facebook-capture,schema-compatibility,worker-adapter-boundary}.test.ts
- docs/proposals/knowledge-lifecycle-normalization.md
