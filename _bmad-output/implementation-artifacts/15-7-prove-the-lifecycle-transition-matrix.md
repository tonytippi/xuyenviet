---
baseline_commit: 17a904f5c4303a5cdaf2865c6660450c3f4b9096
---

# Story 15.7: Prove the Lifecycle Transition Matrix

Status: review

## Story

As a product owner, I want executable evidence that the lifecycle contract rejects invalid states and races, so that the clean-break migration remains safe as the pipeline evolves.

## Acceptance Criteria

1. Unit and serial integration suites cover every allowed and forbidden matrix transition; card/work cardinality, candidate immutability, technical completion, active-evidence eligibility, and target-only fixture validity.
2. Stale, concurrent, duplicate, superseded, source-withdrawal, and sampling-containment tests prove only valid same-fence transitions persist and all card/evidence/audit/recommendation/index effects are atomic or absent together.
3. Protected API and direct-admin tests prove only authorized principals resolve work and API requests cannot execute Worker-only ingestion/job claims.
4. Focused suites, unit, integration, lint, typecheck, build, and Drizzle check run; exact environmental blockers are recorded if any cannot run.

## Tasks / Subtasks

- [x] Begin only from the completed target-only Stories 15.1-15.6 baseline. This is an evidence story: do not add compatibility fields, legacy fixtures, a second lifecycle writer, an API ingestion/index loop, or an approval-queue interpretation in order to make a test pass. (AC: 1-4)
- [x] Turn `tests/knowledge-lifecycle-transition-matrix.test.ts` into the authoritative executable matrix. Use named case IDs and table-driven cases that identify trigger, runtime owner, allowed from/to states, required current fence, work effect, evidence/projection effect, and expected `resolved`, `stale`, or `invalid` result. The inventory is every public `KnowledgeLifecycleTrigger`: `candidate_relation`, `operator_resolution`, `sampling_containment`, `draft_publish`, `open_work`, `content_refresh`, `support_loss`, `archive`, and `restore`. A trigger may delegate scenario-specific setup to another named suite below, but the matrix must link to that suite and state why it is not duplicated. (AC: 1-2)
  - [x] Cover every approved transition: Worker low-risk completion `draft -> active`; Worker verify-first completion `draft|suppressed -> pending_operator`; API primary publish and suppress from `pending_operator`; edit/requeue to a new fence; Worker conflict/invalidating evidence `active -> pending_operator`; Worker new evidence for suppressed card; source-removal final-support loss `active -> suppressed`; API archive; API/Worker restore/re-evaluate from `archived`; normal sampling pass/failure with no lifecycle change; and high-severity cohort containment to fenced `risk` work or suppression. (AC: 1-2)
  - [x] Cover forbidden pairs and wrong owners: active with primary work, pending with sampling work, open work on suppressed/archived/rejected cards, sampling as publish/restore authority, primary resolutions on sampling work, sampling resolutions on primary work, unsupported publish/restore, rejected-version revival, stale content/evidence/recommendation/candidate fences, stale Worker lease/CAS, and API claim/run attempts. (AC: 1-3)
- [x] Add or extend target-schema invariant tests. Verify database constraints, candidate immutability trigger, and partial unique indexes reject contradictory target rows rather than relying solely on command behavior. (AC: 1)
  - [x] Prove `active` requires `verification_requirement = none` and eligible current supporting evidence; `pending_operator` cannot be retrievable; suppressed/archived/rejected cards cannot be retrievable or retain open work; active cards retain at most one same-fence sampling item and never primary work; pending cards retain exactly the permitted same-fence primary item and no sampling item.
  - [x] Prove completed candidates retain immutable nonblank AI `apply`, `needs_operator`, or `discard` disposition/reason; queued, processing, and failed candidates retain neither business field; an operator outcome never rewrites the original AI outcome.
  - [x] Prove job terminality is technical only: `completed` requires terminal discovery and all candidates terminal; mixed `apply`, `needs_operator`, `discard`, and failed candidates produce exact row-derived counters without producing a rolled-up publication label.
  - [x] Prove reset/reseed and every test factory use only target vocabulary. Reject legacy card/work/job/candidate fields and enums in fixtures, contracts, and static boundary checks; do not count a fixture that inserts retired shapes as migration evidence.
- [x] Add serial PostgreSQL race and rollback evidence at the established production seams. Each rejection must snapshot and assert card, supporting evidence eligibility, candidate outcome, work, Audit event, dirty marker, search projection, sampling obligation/cohort membership as applicable, then prove they remain unchanged together. Assign cases to the named suites below instead of building a second test harness. (AC: 2)
  - [x] Exercise concurrent primary resolvers and duplicate delivery so exactly one matching-fence transaction resolves; losing requests return `stale` or the documented idempotent result with no second audit/work/index effect.
  - [x] Exercise stale candidate lease/fencing token, stale parent/job claim, current-capture supersession, duplicate discovery, and final candidate CAS loss. Obsolete Worker work must not change candidate outcome, job counters/status, card, evidence, work, Audit, or index state.
  - [x] Exercise source withdrawal/final-support removal racing candidate relation, operator resolution, and a delayed indexing claim. Removed or no-longer-current evidence must be traveler-ineligible immediately; delayed index work cannot recreate a projection.
  - [x] Exercise high-severity sampling containment with exact sealed cohort definition/member fences. Any stale/missing member aborts the whole batch; duplicate containment is idempotent; remediable members become pending with one new `risk` item, unsafe members suppress without successor work, and unrelated cohorts/later card versions stay unchanged.
- [x] Prove the ownership and disclosure boundaries with direct Nest/API and admin contract coverage. Add `tests/admin-knowledge-review-api.integration.test.ts` for `POST /v1/admin/knowledge/recommendations/:id/resolve`; use the real Nest guards/middleware and a controlled `AdminKnowledgeReviewPort` to prove every rejected request makes no `resolveRecommendation` call or lifecycle mutation. (AC: 3)
  - [x] Test anonymous, traveler, missing capability, invalid/missing CSRF, malformed request, and unauthorized operator resolution paths. They must return existing safe API behavior and make no lifecycle, work, Audit, or index mutation.
  - [x] Test the authorized browser-session path only through direct `/v1/admin/knowledge/*` APIs with `credentials: "include"`, API-managed CSRF, request ID, exact-key parser, and safe errors. Browser/UI tests supplement, never replace, server-side authorization tests.
- [x] Inventory protected routes and static boundaries by extending `tests/knowledge-lifecycle-writer-boundary.test.ts`, `tests/admin-knowledge-views-ui-boundary.test.ts`, and `tests/admin-boundary.test.ts`. Scan `apps/api/src/admin/**` for Worker claim/run/loop imports or calls; scan `apps/admin/**` for database, lifecycle-command, Worker, BFF/proxy, and server-action imports. The Worker remains the only continuous ingestion, indexing, and sampling-selection owner; API may synchronously resolve an authorized operator decision only. Decide and record the disposition of `POST /v1/admin/knowledge/facebook-captures/:reviewId/ingestion-rerun`: remove it, or prove its retained fail-closed implementation cannot claim/run ingestion or enqueue a continuous loop.
- [x] Add `tests/knowledge-target-vocabulary-boundary.test.ts` as an infrastructure-free unit test. Lexically scan current runtime, seed, fixture, and test sources under `apps/api/src`, `apps/admin/app/knowledge`, `packages/contracts/src`, `scripts`, and `tests`; exclude `drizzle/migrations`, `docs`, `_bmad-output`, and explicitly named retirement tests. Reject target-invalid vocabulary in active shapes: `stage`, `publicationState`, `reviewState`, `needsReview`, `reviewStatus`, `operationState`, `verify_first`, and retired queue/status aliases such as `approved` when used as a lifecycle or job/candidate state. Keep intentional historical-retirement assertions narrowly excluded rather than weakening the vocabulary boundary. (AC: 1)
- [x] Extend existing narrow suites before adding new files. Add `knowledge-lifecycle-writer-boundary.test.ts`, `admin-knowledge-views-ui-boundary.test.ts`, and `knowledge-target-vocabulary-boundary.test.ts` to `unitTests` in `vitest.config.ts`, because they are parser/import/static tests and must run under `pnpm test:unit`. Keep PostgreSQL tests in `pnpm test:integration`, serially, using `DATABASE_URL_TEST`, with `resetTestDatabase()` in each clean-table suite. Do not add a global reset hook or integration parallelism. (AC: 1-4)
- [x] Run and record the required focused and full command sequence. Record the exact command, failure, and environmental blocker in this story if a check cannot run; do not declare a failed or skipped suite passing. (AC: 4)

## Dev Notes

### AI-First Contract To Preserve

- A job is technical execution only: `queued | running | completed | failed`. Its counters are transactional, idempotent observability projections and never lifecycle, retrieval, or publication authority. A mixed-outcome completed job must never be labeled published, suppressed, verify-first, or approved.
- A completed candidate has an immutable AI decision: `apply`, `needs_operator`, or `discard` with a nonblank reason. Failed/queued/processing candidates have no business decision. A later operator publication, suppression, sampling outcome, or containment action changes card/work/Audit state only, never the candidate's AI disposition or reason.
- A card has one workflow lifecycle: `draft | pending_operator | active | suppressed | archived | rejected`. Its domain classification and verification requirement remain independent. Normal traveler retrieval admits only a current, evidence-supported `active` card with `verification_requirement = none`; search documents never override current owner-row eligibility.
- A recommendation is the only actionable operator work. It is `open | resolved | superseded`; primary work types are `verification | relation | risk | missing_context`, while `sampling` is separate. At a card content/evidence fence, permit at most one open primary item and at most one open sampling item. `active` can have sampling only; `pending_operator` can have primary work only; terminal/non-retrievable states retain no open work.
- A sampling obligation is an immutable per-`needs_operator` quality ledger, not a recommendation and not a publication gate. Sampling pass/failure normally records quality only. High-severity containment seals the exact cohort before mutation, never changes candidate AI facts, and atomically creates risk work only for remediable cards.

### Required Production Seams

- `packages/domain/src/knowledge-lifecycle.ts` owns the lifecycle trigger, input, fence, actor, and result contracts. The sole transactional implementations, `transitionKnowledgeCard` and `transitionKnowledgeCardInTransaction`, are in `packages/database/src/knowledge-lifecycle.ts`. They own lifecycle state, verification requirement, recommendation state, candidate-card association, lifecycle Audit, and lifecycle-driven search invalidation; they return `resolved`, `stale`, or `invalid`.
- Candidate discovery, claims, leases, CAS, technical accounting, recovery, and continuous execution stay in `packages/worker-domain/src/features/knowledge/ingestion-*.ts`. Use `packages/database/src/knowledge-ingestion-accounting.ts` to verify technical counter/finalization rules without introducing a second lifecycle writer.
- Evidence eligibility, source withdrawal, retrieval, and delayed projection safety are covered by `packages/database/src/{knowledge-state,knowledge-search,knowledge-indexing-queue}.ts` plus Worker source-removal/indexing features. Test the current owner rows, not only a cached search document.
- Sampling obligations, sealed cohort selection, recommendation associations, and containment use `packages/database/src/{knowledge-recommendations,knowledge-lifecycle}.ts` and Worker recommendation features. Do not infer an obligation's result from unrelated work at the same fence.
- Direct protected API is in `apps/api`; `apps/admin` is presentation-only. Preserve existing Nest `RequestPrincipal`, capabilities, session, origin, CSRF, request-ID, exact-key parser, and safe-error behavior. No BFF, Next proxy, server action, direct DB import, or Worker loop belongs in admin.

### Test Strategy

- Keep the matrix test readable and exhaustive rather than duplicating production logic. Use helpers only for valid target setup and before/after snapshots; each case must assert the externally observable contract and forbidden effects.
- `tests/knowledge-lifecycle-transition-matrix.test.ts` owns table-driven trigger coverage, forbidden state/owner pairs, concurrent primary resolution, duplicate resolution, and card/work outcomes. `tests/knowledge-ingestion-jobs.test.ts` and `knowledge-ingestion-pipeline.test.ts` own stale candidate lease/token, parent/job claim, duplicate discovery, supersession, final candidate CAS, and technical counter assertions. `tests/knowledge-source-removal.test.ts`, `knowledge-source-removal-action.test.ts`, and `knowledge-search.test.ts` own source withdrawal/final-support removal and delayed-projection evidence. `tests/knowledge-indexing-worker.test.ts` owns stale index lease, dirty-marker, and duplicate-delivery behavior. `tests/knowledge-recommendation-queue.test.ts` owns sampling obligation, sealed cohort, stale/missing member rollback, containment idempotency, and unrelated-cohort isolation. `tests/admin-knowledge-review-api.integration.test.ts` owns protected resolution behavior. Static ownership and target-vocabulary checks belong in the three named unit boundary tests.
- Write unit tests only for policy, parser, and import/static-boundary behavior. Integration tests must remain serial, use `DATABASE_URL_TEST`, and call `resetTestDatabase()` in local setup when they need clean state. For each stale/invalid race, snapshot only applicable rows from card, evidence eligibility, candidate, recommendation, audit event, dirty marker/search projection, and sampling obligation/cohort membership before and after the attempted mutation.
- Do not weaken an assertion to accept legacy enum names, aliases, raw source/provider data, fences, leases, or generic status labels. Target-only fixture validity is part of this story's evidence.

### Verification

```bash
pnpm test:unit -- tests/knowledge-lifecycle-writer-boundary.test.ts
pnpm test:unit -- tests/admin-knowledge-views-ui-boundary.test.ts
pnpm test:unit -- tests/knowledge-target-vocabulary-boundary.test.ts
pnpm test:integration -- tests/knowledge-lifecycle-transition-matrix.test.ts
pnpm test:integration -- tests/knowledge-ingestion-jobs.test.ts
pnpm test:integration -- tests/knowledge-ingestion-pipeline.test.ts
pnpm test:integration -- tests/knowledge-source-removal.test.ts
pnpm test:integration -- tests/knowledge-source-removal-action.test.ts
pnpm test:integration -- tests/knowledge-indexing-worker.test.ts
pnpm test:integration -- tests/knowledge-recommendation-queue.test.ts
pnpm test:integration -- tests/knowledge-search.test.ts
pnpm test:integration -- tests/worker-adapter-boundary.test.ts
pnpm test:integration -- tests/admin-knowledge-review-api.integration.test.ts
pnpm test:unit
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
pnpm exec drizzle-kit check
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.7]
- [Source: _bmad-output/implementation-artifacts/epic-15-context.md#Requirements & Constraints]
- [Source: _bmad-output/implementation-artifacts/15-1-establish-the-target-lifecycle-schema.md#Acceptance Criteria]
- [Source: _bmad-output/implementation-artifacts/15-2-complete-candidate-processing-and-technical-job-accounting.md#Mandatory Invariants]
- [Source: _bmad-output/implementation-artifacts/15-3-centralize-version-fenced-lifecycle-transitions.md#Dev Notes]
- [Source: _bmad-output/implementation-artifacts/15-4-enforce-evidence-safe-retrieval-and-source-removal.md#Completed-Story Intelligence]
- [Source: _bmad-output/implementation-artifacts/15-5-separate-actionable-work-from-quality-sampling.md#AI-First Rule]
- [Source: _bmad-output/implementation-artifacts/15-6-deliver-target-shaped-operator-knowledge-views.md#AI-First Contract]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Transition Matrix]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Phase 4 Verification]
- [Source: _bmad-output/project-context.md#Testing Rules]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log

- 2026-08-05: Added executable coverage for draft publication, content-refresh fence replacement, protected direct Nest recommendation resolution, admin/Worker ownership boundaries, and target-vocabulary boundaries.
- 2026-08-05: Direct API coverage found that the global SafeValidationPipe rejected every otherwise-valid recommendation resolve request because the controller used an unknown body type. The controller now declares a parser-backed DTO type, preserving fail-closed validation while allowing an authorized request through the sole review port.
- 2026-08-05: Full unit validation exposed a fail-closed policy omission: an invalid knowledge classification did not also report unsupported_knowledge_state. The policy now reports both reasons as its declared contract requires.
- 2026-08-05: Completed the named trigger inventory and added LTM-10 through LTM-13: candidate lease no-effect rejection, atomic candidate relation effects, concurrent primary resolution, and stale sealed-cohort rollback. The retained Facebook ingestion-rerun route is a guarded port command only; static evidence rejects direct Worker claim/run/loop ownership.

### Completion Notes List

- 2026-08-05: Created the implementation-ready Story 15.7 verification guide after Stories 15.1-15.6 completed the target schema, AI-first candidate processing, sole lifecycle writer, evidence-safe retrieval/source removal, separate sampling ledger, and target-shaped operator views.
- The story treats job execution, immutable AI candidate decisions, card workflow lifecycle, actionable operator work, and sampling quality obligations as independent contracts. Its verification must not reintroduce the historical generic approval queue or use job/candidate labels as publication state.
- No implementation, database reset, migration, or test execution was performed while creating this story.
- 2026-08-05: Implemented the first bounded verification slice. All completed checks are green: unit 204 tests, integration 374 tests across 43 files, typecheck, build, Drizzle check, and diff check. Lint has 0 errors and 45 pre-existing warnings.
- Remaining unchecked matrix/race cases in this evidence story still require implementation before review status; this record intentionally remains in-progress.
- 2026-08-05: All Story 15.7 acceptance evidence is complete. `pnpm test:unit` passed 205 tests and `pnpm test:integration` passed 387 tests across 43 serial files. `pnpm typecheck`, `pnpm build`, `pnpm exec drizzle-kit check`, and `git diff --check` passed. `pnpm lint` completed with 0 errors and 45 pre-existing warnings.

### File List

- _bmad-output/implementation-artifacts/15-7-prove-the-lifecycle-transition-matrix.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- apps/api/src/admin/admin-knowledge-review.controller.ts
- packages/database/src/knowledge-state.ts
- tests/admin-knowledge-review-api.integration.test.ts
- tests/admin-knowledge-views-ui-boundary.test.ts
- tests/knowledge-lifecycle-transition-matrix.test.ts
- tests/knowledge-lifecycle-writer-boundary.test.ts
- tests/knowledge-target-vocabulary-boundary.test.ts
- vitest.config.ts

## Change Log

- 2026-08-05: Expanded Story 15.7 from a backlog outline into an AI-first, implementation-ready lifecycle transition-matrix verification guide.
- 2026-08-05: Validation repair bounded the complete public trigger inventory, assigned each race and ownership assertion to an executable suite, required direct Nest resolution coverage, and made target-vocabulary/static-boundary checks unit-project evidence.
- 2026-08-05: Added the first executable lifecycle evidence slice, repaired direct API DTO admission for recommendation resolution, and restored complete fail-closed invalid-classification reasons.
- 2026-08-05: Completed exhaustive lifecycle evidence with named trigger inventory, stale candidate and containment rollback assertions, concurrent primary resolution, and explicit retained-rerun Worker ownership boundary; status moved to review.
