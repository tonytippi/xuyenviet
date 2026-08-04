---
baseline_commit: 17a904f5c4303a5cdaf2865c6660450c3f4b9096
---

# Story 15.7: Prove the Lifecycle Transition Matrix

Status: ready-for-dev

## Story

As a product owner, I want executable evidence that the lifecycle contract rejects invalid states and races, so that the clean-break migration remains safe as the pipeline evolves.

## Acceptance Criteria

1. Unit and serial integration suites cover every allowed and forbidden matrix transition; card/work cardinality, candidate immutability, technical completion, active-evidence eligibility, and target-only fixture validity.
2. Stale, concurrent, duplicate, superseded, source-withdrawal, and sampling-containment tests prove only valid same-fence transitions persist and all card/evidence/audit/recommendation/index effects are atomic or absent together.
3. Protected API and direct-admin tests prove only authorized principals resolve work and API requests cannot execute Worker-only ingestion/job claims.
4. Focused suites, unit, integration, lint, typecheck, build, and Drizzle check run; exact environmental blockers are recorded if any cannot run.

## Tasks / Subtasks

- [ ] Begin only from the completed target-only Stories 15.1-15.6 baseline. This is an evidence story: do not add compatibility fields, legacy fixtures, a second lifecycle writer, an API ingestion/index loop, or an approval-queue interpretation in order to make a test pass. (AC: 1-4)
- [ ] Turn `tests/knowledge-lifecycle-transition-matrix.test.ts` into the authoritative executable matrix. Use named case IDs and table-driven cases that identify trigger, runtime owner, allowed from/to states, required current fence, work effect, evidence/projection effect, and expected `resolved`, `stale`, or `invalid` result. (AC: 1-2)
  - [ ] Cover every approved transition: Worker low-risk completion `draft -> active`; Worker verify-first completion `draft|suppressed -> pending_operator`; API primary publish and suppress from `pending_operator`; edit/requeue to a new fence; Worker conflict/invalidating evidence `active -> pending_operator`; Worker new evidence for suppressed card; source-removal final-support loss `active -> suppressed`; API archive; API/Worker restore/re-evaluate from `archived`; normal sampling pass/failure with no lifecycle change; and high-severity cohort containment to fenced `risk` work or suppression. (AC: 1-2)
  - [ ] Cover forbidden pairs and wrong owners: active with primary work, pending with sampling work, open work on suppressed/archived/rejected cards, sampling as publish/restore authority, primary resolutions on sampling work, sampling resolutions on primary work, unsupported publish/restore, rejected-version revival, stale content/evidence/recommendation/candidate fences, stale Worker lease/CAS, and API claim/run attempts. (AC: 1-3)
- [ ] Add or extend target-schema invariant tests. Verify database constraints, candidate immutability trigger, and partial unique indexes reject contradictory target rows rather than relying solely on command behavior. (AC: 1)
  - [ ] Prove `active` requires `verification_requirement = none` and eligible current supporting evidence; `pending_operator` cannot be retrievable; suppressed/archived/rejected cards cannot be retrievable or retain open work; active cards retain at most one same-fence sampling item and never primary work; pending cards retain exactly the permitted same-fence primary item and no sampling item.
  - [ ] Prove completed candidates retain immutable nonblank AI `apply`, `needs_operator`, or `discard` disposition/reason; queued, processing, and failed candidates retain neither business field; an operator outcome never rewrites the original AI outcome.
  - [ ] Prove job terminality is technical only: `completed` requires terminal discovery and all candidates terminal; mixed `apply`, `needs_operator`, `discard`, and failed candidates produce exact row-derived counters without producing a rolled-up publication label.
  - [ ] Prove reset/reseed and every test factory use only target vocabulary. Reject legacy card/work/job/candidate fields and enums in fixtures, contracts, and static boundary checks; do not count a fixture that inserts retired shapes as migration evidence.
- [ ] Add serial PostgreSQL race and rollback evidence at the established production seams. Each rejection must snapshot and assert card, supporting evidence eligibility, candidate outcome, work, Audit event, dirty marker, search projection, sampling obligation/cohort membership as applicable, then prove they remain unchanged together. (AC: 2)
  - [ ] Exercise concurrent primary resolvers and duplicate delivery so exactly one matching-fence transaction resolves; losing requests return `stale` or the documented idempotent result with no second audit/work/index effect.
  - [ ] Exercise stale candidate lease/fencing token, stale parent/job claim, current-capture supersession, duplicate discovery, and final candidate CAS loss. Obsolete Worker work must not change candidate outcome, job counters/status, card, evidence, work, Audit, or index state.
  - [ ] Exercise source withdrawal/final-support removal racing candidate relation, operator resolution, and a delayed indexing claim. Removed or no-longer-current evidence must be traveler-ineligible immediately; delayed index work cannot recreate a projection.
  - [ ] Exercise high-severity sampling containment with exact sealed cohort definition/member fences. Any stale/missing member aborts the whole batch; duplicate containment is idempotent; remediable members become pending with one new `risk` item, unsafe members suppress without successor work, and unrelated cohorts/later card versions stay unchanged.
- [ ] Prove the ownership and disclosure boundaries with direct Nest/API and admin contract coverage. (AC: 3)
  - [ ] Test anonymous, traveler, missing capability, invalid/missing CSRF, malformed request, and unauthorized operator resolution paths. They must return existing safe API behavior and make no lifecycle, work, Audit, or index mutation.
  - [ ] Test the authorized browser-session path only through direct `/v1/admin/knowledge/*` APIs with `credentials: "include"`, API-managed CSRF, request ID, exact-key parser, and safe errors. Browser/UI tests supplement, never replace, server-side authorization tests.
  - [ ] Inventory protected routes and static boundaries to prove API controllers and `apps/admin` do not import or invoke Worker claim/run APIs, lifecycle/database writers, BFF/proxy routes, or server-action writers. The Worker remains the only continuous ingestion, indexing, and sampling-selection owner; API may synchronously resolve an authorized operator decision only.
- [ ] Extend existing narrow suites before adding new files. Keep pure parser/policy/import checks in `pnpm test:unit`; keep PostgreSQL tests in `pnpm test:integration`, serially, using `DATABASE_URL_TEST`, with `resetTestDatabase()` in each clean-table suite. Do not add a global reset hook or integration parallelism. (AC: 1-4)
- [ ] Run and record the required focused and full command sequence. Record the exact command, failure, and environmental blocker in this story if a check cannot run; do not declare a failed or skipped suite passing. (AC: 4)

## Dev Notes

### AI-First Contract To Preserve

- A job is technical execution only: `queued | running | completed | failed`. Its counters are transactional, idempotent observability projections and never lifecycle, retrieval, or publication authority. A mixed-outcome completed job must never be labeled published, suppressed, verify-first, or approved.
- A completed candidate has an immutable AI decision: `apply`, `needs_operator`, or `discard` with a nonblank reason. Failed/queued/processing candidates have no business decision. A later operator publication, suppression, sampling outcome, or containment action changes card/work/Audit state only, never the candidate's AI disposition or reason.
- A card has one workflow lifecycle: `draft | pending_operator | active | suppressed | archived | rejected`. Its domain classification and verification requirement remain independent. Normal traveler retrieval admits only a current, evidence-supported `active` card with `verification_requirement = none`; search documents never override current owner-row eligibility.
- A recommendation is the only actionable operator work. It is `open | resolved | superseded`; primary work types are `verification | relation | risk | missing_context`, while `sampling` is separate. At a card content/evidence fence, permit at most one open primary item and at most one open sampling item. `active` can have sampling only; `pending_operator` can have primary work only; terminal/non-retrievable states retain no open work.
- A sampling obligation is an immutable per-`needs_operator` quality ledger, not a recommendation and not a publication gate. Sampling pass/failure normally records quality only. High-severity containment seals the exact cohort before mutation, never changes candidate AI facts, and atomically creates risk work only for remediable cards.

### Required Production Seams

- The sole lifecycle writer is `transitionKnowledgeCard` / `transitionKnowledgeCardInTransaction` in `packages/database/src/knowledge-lifecycle.ts`, exposed through `packages/domain/src/knowledge-lifecycle.ts`. It owns lifecycle state, verification requirement, recommendation state, candidate-card association, lifecycle Audit, and lifecycle-driven search invalidation; it returns `resolved`, `stale`, or `invalid`.
- Candidate discovery, claims, leases, CAS, technical accounting, recovery, and continuous execution stay in `packages/worker-domain/src/features/knowledge/ingestion-*.ts`. Use `packages/database/src/knowledge-ingestion-accounting.ts` to verify technical counter/finalization rules without introducing a second lifecycle writer.
- Evidence eligibility, source withdrawal, retrieval, and delayed projection safety are covered by `packages/database/src/{knowledge-state,knowledge-search,knowledge-indexing-queue}.ts` plus Worker source-removal/indexing features. Test the current owner rows, not only a cached search document.
- Sampling obligations, sealed cohort selection, recommendation associations, and containment use `packages/database/src/{knowledge-recommendations,knowledge-lifecycle}.ts` and Worker recommendation features. Do not infer an obligation's result from unrelated work at the same fence.
- Direct protected API is in `apps/api`; `apps/admin` is presentation-only. Preserve existing Nest `RequestPrincipal`, capabilities, session, origin, CSRF, request-ID, exact-key parser, and safe-error behavior. No BFF, Next proxy, server action, direct DB import, or Worker loop belongs in admin.

### Test Strategy

- Keep the matrix test readable and exhaustive rather than duplicating production logic. Use helpers only for valid target setup and before/after snapshots; each case must assert the externally observable contract and forbidden effects.
- Reuse and extend `tests/knowledge-lifecycle-transition-matrix.test.ts`, `knowledge-lifecycle-writer-boundary.test.ts`, `knowledge-ingestion-jobs.test.ts`, `knowledge-ingestion-pipeline.test.ts`, `knowledge-source-removal.test.ts`, `knowledge-source-removal-action.test.ts`, `knowledge-indexing-worker.test.ts`, `knowledge-recommendation-queue.test.ts`, `knowledge-search.test.ts`, `worker-adapter-boundary.test.ts`, and admin contract/controller tests.
- Write unit tests only for policy, parser, and import/static-boundary behavior. Integration tests must remain serial, use `DATABASE_URL_TEST`, and call `resetTestDatabase()` in local setup when they need clean state.
- Do not weaken an assertion to accept legacy enum names, aliases, raw source/provider data, fences, leases, or generic status labels. Target-only fixture validity is part of this story's evidence.

### Verification

```bash
pnpm test:unit -- tests/knowledge-lifecycle-writer-boundary.test.ts
pnpm test:unit -- tests/admin-knowledge-views-ui-boundary.test.ts
pnpm test:integration -- tests/knowledge-lifecycle-transition-matrix.test.ts
pnpm test:integration -- tests/knowledge-ingestion-jobs.test.ts
pnpm test:integration -- tests/knowledge-ingestion-pipeline.test.ts
pnpm test:integration -- tests/knowledge-source-removal.test.ts
pnpm test:integration -- tests/knowledge-source-removal-action.test.ts
pnpm test:integration -- tests/knowledge-indexing-worker.test.ts
pnpm test:integration -- tests/knowledge-recommendation-queue.test.ts
pnpm test:integration -- tests/knowledge-search.test.ts
pnpm test:integration -- tests/worker-adapter-boundary.test.ts
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

### Completion Notes List

- 2026-08-05: Created the implementation-ready Story 15.7 verification guide after Stories 15.1-15.6 completed the target schema, AI-first candidate processing, sole lifecycle writer, evidence-safe retrieval/source removal, separate sampling ledger, and target-shaped operator views.
- The story treats job execution, immutable AI candidate decisions, card workflow lifecycle, actionable operator work, and sampling quality obligations as independent contracts. Its verification must not reintroduce the historical generic approval queue or use job/candidate labels as publication state.
- No implementation, database reset, migration, or test execution was performed while creating this story.

### File List

- _bmad-output/implementation-artifacts/15-7-prove-the-lifecycle-transition-matrix.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-08-05: Expanded Story 15.7 from a backlog outline into an AI-first, implementation-ready lifecycle transition-matrix verification guide.
