---
title: 'Establish the Target Lifecycle Schema'
type: 'feature'
created: '2026-08-04'
status: 'done'
baseline_revision: '855cafa'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: 'NO_COMMIT_REQUESTED'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-15-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Knowledge persistence uses overlapping legacy card, candidate, job, recommendation, and sampling states. The resulting contradictory combinations and mutable AI decisions prevent an auditable lifecycle cutover.

**Approach:** On a confirmed disposable local target, replace the legacy representation in one forward-only Drizzle migration and update every production contract, fixture, seed, and test to the target-only lifecycle schema and database invariants.

## Boundaries & Constraints

**Always:** Preserve the existing direct API/Worker ownership split, PostgreSQL/Drizzle ownership, migration-plan admission checks, and exact disposable-target reset safeguards. Use target-only names and enum values. Keep integration tests serial and call `resetTestDatabase()` locally. Treat job counters as observability only; use a declared checkpoint predicate, never the removed `discovery_complete` column.

**Block If:** The exact reset target cannot be identity-preflighted as an intentionally disposable local database, or is durable/shared. Halt for an approved expand-migrate-contract design before applying or resetting anything.

**Never:** Backfill, rename legacy fields, dual-write, add aliases/fallback reads, retain old fixtures, add a release matrix for reset authorization, reintroduce legacy lifecycle fields, or implement Story 15.3 cross-table transition guarantees as schema triggers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Target lifecycle card | `active` card | It persists only with `verification_requirement = none`; target classification is stored separately | Database rejects invalid row-local combinations |
| Candidate completion | Candidate changes to `completed` | Nonblank reason and `apply`, `needs_operator`, or `discard` are required and become immutable | Check or trigger rejects incomplete/changed decision data |
| Non-completed candidate | `queued`, `processing`, or `failed` candidate | Both AI disposition and reason remain null | Database rejects business outcome values |
| Fenced work | Two open primary or two open sampling rows for one card/content/evidence fence | At most one row in each independent category persists | Partial unique index rejects duplicate |
| Clean reset | Confirmed exact disposable local identity | Migration, release record, and target-only seeds run | Existing reset guard refuses unsafe target before destructive work |

</intent-contract>

## Code Map

- `packages/database/src/schema.ts` -- Drizzle definitions for lifecycle tables, checks, enums, indexes, and relations.
- `drizzle/migrations/` and `drizzle/migrations/meta/` -- one forward-only post-0037 target migration, journal, and snapshot metadata.
- `scripts/drizzle-migration-plan.ts`, `scripts/db-reset.ts`, `scripts/db-seed.ts`, `scripts/db-seed-data.ts` -- existing admission and safe disposable reset/reseed surfaces.
- `packages/database/src/{knowledge-state,knowledge-search,approved-knowledge,knowledge-readiness-evidence,knowledge-recommendations,knowledge-draft-review,admin-overview,admin-knowledge-intake,admin-knowledge-review,admin-facebook-capture,admin-youtube-capture,answer-freshness,knowledge-indexing-queue}.ts` -- target-only database projections and removed lifecycle references.
- `packages/worker-domain/src/features/knowledge/{ingestion-jobs,ingestion-pipeline,recommendations,source-removal,source-captures,review-approval-core,facebook-capture-review,indexing-worker}.ts` -- legacy-shaped Worker reads/writes that must compile against target schema without preserving compatibility paths.
- `packages/contracts/src/index.ts`, `packages/domain/src/{knowledge-review,index}.ts` -- strict public/admin target shapes and port exports.
- `tests/{drizzle-migration-plan,schema-compatibility,knowledge-ingestion-jobs,knowledge-recommendation-queue}.test.ts` -- focused target migration, constraints, and admission verification.
- `tests/helpers/{db,source-captures}.ts` -- isolated PostgreSQL fixture patterns.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/schema.ts` -- replace legacy card, job, candidate, recommendation, sampling, report/backfill definitions with the target lifecycle schema, target check declarations, target reason vocabulary, target work fields, sampling obligation table, and target partial-index declarations -- make contradictory legacy representations unrepresentable.
- [x] `drizzle/migrations/0038_*.sql` and `drizzle/migrations/meta/{_journal.json,*.json}` -- add one reviewed forward-only clean-break migration after 0037 that drops legacy columns/tables/indexes, adds target constraints/indexes, and installs the completed-candidate immutability trigger -- make database enforcement match Drizzle declarations without a compatibility path.
- [x] `scripts/drizzle-migration-plan.ts`, `scripts/db-reset.ts`, `scripts/db-seed.ts`, `scripts/db-seed-data.ts` -- admit the exact ordered migration plan and retain exact-identity disposable reset/reseed checks; update seed imports/data to target-only shape -- prove safe reset/reseed without treating a matrix as authorization.
- [x] `packages/database/src/*.ts`, `packages/worker-domain/src/features/knowledge/*.ts`, `packages/contracts/src/index.ts`, and `packages/domain/src/*.ts` -- replace every production reference to removed lifecycle fields/types/direct fixture shapes with target-only equivalents; remove undeclared `discovery_complete` reads and choose one declared discovery-terminal checkpoint predicate -- permit intentional schema cutover compilation without aliases or fallback reads.
- [x] `tests/**/*.test.ts` and `tests/helpers/*.ts` -- rewrite/delete legacy lifecycle fixtures and assertions; add PostgreSQL-backed target checks for card/candidate constraints, trigger immutability, both partial indexes, sampling obligation shape, migration-plan admission, and target-only reset/reseed fixtures -- verify persistence behavior, not former legacy states.
- [x] `_bmad-output/implementation-artifacts/15-1-establish-the-target-lifecycle-schema.md` and `_bmad-output/implementation-artifacts/sprint-status.yaml` -- record implementation tasks, verification, file list, and status only after the code is validated -- maintain BMad delivery record.

**Acceptance Criteria:**
- Given a preflight-confirmed disposable development target, when the forward migration and reset/reseed run, then only target card lifecycle, classification, verification, job, candidate, recommendation, and sampling-obligation shapes remain with no legacy schema, contracts, runtime paths, or fixtures.
- Given invalid lifecycle/retrieval or candidate disposition/reason combinations, when they are inserted or updated, then database checks reject them; each card/version fence permits at most one open primary and one open sampling work item.
- Given a candidate completed with an AI disposition and reason, when either business value is subsequently changed, then the database trigger rejects the update; failed candidates retain neither field.
- Given contracts, seeds, migrations, and integration fixtures, when validation and focused tests run, then they use target-only shapes and the migration is admitted by the existing ordered digest plan.

## Design Notes

Row-local constraints, partial indexes, and candidate immutability are the Story 15.1 database boundary. Cross-table active-work/evidence/audit/index guarantees deliberately remain with the transactional lifecycle command in Story 15.3; do not approximate them with unscoped triggers. A sampling obligation is immutable quality-control evidence and is distinct from open sampling recommendation work.

## Verification

**Commands:**
- `pnpm exec drizzle-kit check` -- expected: journal and schema metadata validate without interactive unresolved renames.
- `pnpm test:integration -- tests/drizzle-migration-plan.test.ts` -- expected: ordered migration admission and digest mismatch rejection pass.
- `pnpm test:integration -- tests/schema-compatibility.test.ts` -- expected: target schema compatibility/admission coverage passes.
- `pnpm test:integration -- tests/knowledge-ingestion-jobs.test.ts` -- expected: target job/candidate constraints and checkpoint behavior pass.
- `pnpm test:integration -- tests/knowledge-recommendation-queue.test.ts` -- expected: target work uniqueness, target sampling, and legacy-fixture removal coverage pass.
- `pnpm typecheck` -- expected: no production consumer retains removed schema fields.

## Auto Run Result

The original preflight blocker was resolved on 2026-08-04 after the operator confirmed this local target is disposable, confirmed no runtime overlap, and the database identity was verified read-only as `database=xuyenviet;host=127.0.0.1;port=5432`. The target-only cutover is resumed.

Completed clean-break cutover: target-only schema, migration, database/Worker/contracts consumers, seeds, fixtures, and integration coverage now use lifecycle state, verification requirement, technical job status, immutable candidate decisions, target work types/resolutions, and sampling obligations. Both confirmed disposable development and test databases were reset/migrated/reseeded from the final migration.

### 2026-08-04 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 2, medium 2, low 0)
- defer: 1: (medium 1)
- reject: 1: (low 1)
- addressed_findings:
  - `[high]` `[patch]` Replaced inherited job and recommendation constraints that referred to removed lifecycle values with exact target-only definitions in migration 0038.
  - `[medium]` `[patch]` Replaced the inherited legacy recommendation queue index and added target resolution/resolved-shape coverage.
  - `[medium]` `[patch]` Enforced work-type-compatible recommendation resolutions at the row-local resolver boundary.

## Final Verification

- `pnpm db:reset` with confirmed disposable local preflight -- passed; target reset, migration, release record, and seed completed.
- Fresh `xuyenviet_test` recreation and `pnpm exec drizzle-kit migrate` -- passed with 39 migrations.
- `pnpm exec vitest run --project integration ... --maxWorkers=1 --no-file-parallelism` -- passed: 9 files, 89 tests.
- `pnpm typecheck` -- passed.
- `pnpm exec drizzle-kit check` -- passed.
- `git diff --check` -- passed.

Residual risk: expired processing-candidate lease recovery remains deferred to Story 15.2, which owns job/candidate technical recovery semantics.
