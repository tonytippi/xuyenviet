---
title: 'Story 3.9: Operate the AI-Recommended Review and Sampling Queue'
type: 'feature'
created: '2026-07-22'
status: 'done'
baseline_revision: '901a337'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: '901a337'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-6-recover-ingestion-jobs-without-stale-publication.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Knowledge has card-level review flags but no durable, prioritized, version-bound operational recommendation queue. Automatic and `verify_first` ingestion outcomes cannot yet schedule auditable sampling or safe operator resolution.

**Approach:** Add a Knowledge-owned recommendation, sampling-policy, and dirty-marker contract; schedule it within fenced pipeline mutations; provide protected operator queue/detail flows that resolve only the exact card/evidence version reviewed.

## Boundaries & Constraints

**Always:** Bind each actionable recommendation to exact `content_version` and `evidence_set_revision`; use a deterministic persisted 15% four-week sampling policy and sample every `verify_first` card; keep active low-risk sampling distinct from publication approval; atomically CAS, audit, and mark dirty on every resolution; show only bounded safe evidence and metadata; immediately disable a projection when a resolution makes the card ineligible.

**Block If:** The existing canonical ingestion transaction cannot persist a safe suppressed card/evidence for `verify_first` before its terminal checkpoint is cleared, or no atomic transaction can include the card mutation, recommendation state, audit, and dirty marker.

**Never:** Do not store raw capture text, provider payloads, checkpoints, prompts, browser data, or fences in recommendations/audits/UI; do not retrofit the legacy draft approval queue; do not make `in_review` card state a lock for active sampled cards; do not alter recovery/fencing semantics or implement the Story 4.2 dirty-marker worker.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Auto-active sample | Auto-published current card version selected by policy | Exactly one open sampling recommendation binds the final version pair and labels it quality sampling | Idempotent retries create no duplicate |
| Verify-first | Validated high-risk outcome needs verification | A suppressed canonical card with bounded evidence and required verification gets a version-bound recommendation | Stale fenced worker cannot create either card or recommendation |
| Stale resolution | Card content/evidence changed after recommendation | No resolution or related mutation occurs; recommendation is surfaced as stale/superseded | Return a safe conflict result and require current recommendation |
| High-severity sample failure | Current sampling recommendation resolved failed at high severity | Persist pass/fail reason, raise cohort sampling or safely suppress the affected cohort with per-card audit/dirty work | Unrelated cohorts remain unchanged |

</intent-contract>

## Code Map

- `src/db/schema.ts` and generated `drizzle/migrations/0046_*.sql` -- add version-bound recommendation, sampling policy/cohort, and dirty-marker persistence with safe constraints and queue indexes.
- `src/features/knowledge/recommendations.ts` -- own recommendation scheduling, safe queue projections, deterministic sampling, version-pair CAS resolutions, audit, and dirty-marker writes.
- `src/features/knowledge/ingestion-pipeline.ts` -- schedule recommendations in the existing fenced terminal/current-card transaction and retain safe canonical `verify_first` review inputs.
- `src/features/knowledge/actions.ts` -- expose authenticated, redirecting recommendation-resolution form actions without embedding domain mutations.
- `src/app/admin/layout.tsx` -- link the distinct recommendation queue from protected admin navigation.
- `src/app/admin/knowledge/recommendations/page.tsx` and `[recommendationId]/page.tsx` -- render Vietnamese-first prioritized queue, safe detail, filters/pagination, and version-bound resolution controls.
- `tests/knowledge-recommendation-queue.test.ts`, `tests/knowledge-ingestion-pipeline.test.ts`, and `tests/knowledge-search.test.ts` -- cover scheduling, concurrency, privacy, resolution, and traveler-safety regressions.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and generated forward-only migration -- define recommendation lifecycle/reason/action/resolution types, exact card version bindings, bounded policy cohort/sampling fields, and idempotent index dirty markers; enforce FKs and indexes for prioritized open queue reads.
- [x] `src/features/knowledge/recommendations.ts` -- create the canonical server-only queue service: safe bounded list/detail projections, deterministic policy-window sampling, recommendation upsert/supersession, exact-version transactional resolution, lean audits, dirty markers, and high-severity cohort escalation/suppression.
- [x] `src/features/knowledge/ingestion-pipeline.ts` -- create recommendations only from the successful fenced mutation's final card/evidence version; schedule sampled auto-active versions, conflict/risk recommendations, and canonical suppressed `verify_first` cards without repeating provider work or exposing checkpoint data.
- [x] `src/features/knowledge/actions.ts`, `src/app/admin/layout.tsx`, and new recommendation routes -- provide independently server-authorized operator/admin actions and a Vietnamese operator UI with filterable priority queue, version/status/reason text, bounded evidence, pagination, and explicit non-approval sampling wording.
- [x] `tests/knowledge-recommendation-queue.test.ts`, `tests/knowledge-ingestion-pipeline.test.ts`, and `tests/knowledge-search.test.ts` -- prove deterministic/idempotent selection, 100% verify-first coverage, stale CAS rejection without side effects, evidence-validated edits, audit/marker atomicity, high-severity cohort isolation, no raw-data leakage, and immediate search disablement on ineligibility.
- [x] `drizzle/migrations/meta/_journal.json` and generated migration snapshot -- register only the generated 0046 migration artifacts.

**Acceptance Criteria:**
- Given a risk, weak-evidence, freshness, conflict, duplicate-risk, missing-context, verification, relation, or sampling recommendation, when an operator views the queue, then it is ordered by traveler impact and risk and displays current fact, conditions, bounded safe evidence, reasons, all card states, and both version values without calling active low-risk cards pending approval.
- Given an operator accepts wording, performs an evidence-supported edit, suppresses/restores, changes verification, or resolves a relation/conflict, when the recommendation's exact content/evidence versions still match, then one transaction applies the command, updates applicable versions, resolves/supersedes the recommendation, writes a meaningful safe audit event, and creates a dirty marker; a material change creates a new version-bound recommendation where policy requires one.
- Given the recommendation version pair is stale, when an operator attempts a resolution, then the card, evidence, recommendation, audit log, dirty markers, and search projection remain unchanged.
- Given an auto-active version is in the persisted initial four-week policy window, when sampling is scheduled, then the deterministic 15% selection creates at most one sampling recommendation for that version; given a `verify_first` outcome, then it always creates a suppressed canonical card with a version-bound verification/sampling recommendation.
- Given a sampling resolution records a high-severity failure, when the affected policy cohort escalates, then the policy/cohort action is auditable, bounded to the cohort, creates required per-card versioned safety work, and leaves other cohorts unchanged.

## Design Notes

Recommendations are operational history and queue state, not another knowledge aggregate. Keep a recommendation's version pair and policy snapshot, but derive displayed fact and evidence from current authorized card/evidence rows; an old pair is stale, not reusable approval. Keep active sampled cards `reviewed` at the card state while the recommendation uses `open`/`in_review`, so sampling does not remove otherwise eligible low-risk knowledge from traveler retrieval.

`verify_first` must create a suppressed canonical card from already validated bounded candidate fields/evidence before the terminal job clears its checkpoint. This preserves one canonical aggregate and lets the recommendation bind exactly the same type of version pair as all other work. The new dirty-marker producer is deliberately limited to writing durable versioned work; Story 4.2 consumes it with the independently supervised indexing worker.

## Verification

**Commands:**
- `pnpm test:run tests/knowledge-recommendation-queue.test.ts tests/knowledge-ingestion-pipeline.test.ts tests/knowledge-search.test.ts` -- expected: version-bound scheduling/resolution, no stale side effects, and search safety pass.
- `pnpm lint` -- expected: success.
- `pnpm typecheck` -- expected: success.
- `pnpm build` -- expected: success.

### Review Findings

- [x] [Review][Patch] Preserve judge-issued review recommendations [src/features/knowledge/ingestion-pipeline.ts:70]
- [x] [Review][Patch] Supersede obsolete open recommendations after a card-version mutation [src/features/knowledge/recommendations.ts:94]
- [x] [Review][Patch] Use one sampling-policy/card lock order [src/features/knowledge/recommendations.ts:113]
- [x] [Review][Patch] Render every card state and usable queue pagination [src/app/admin/knowledge/recommendations/page.tsx:28]

## Review Triage Log

### 2026-07-22 - Review passes
- intent_gap: 0
- bad_spec: 0
- patch: 26 (high 15, medium 11)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Made every recommendation action reason-compatible, retained verification paths through edits and relation work, and required independent supporting evidence before high-risk activation.
  - `[high]` `[patch]` Added persisted sampling-cohort membership for all evaluated auto-active versions and made escalation suppress/deindex only current cohort members atomically.
  - `[high]` `[patch]` Fenced stale verify-first captures, preserved validated ambiguous/mismatched candidates as suppressed canonical review cards, and applied high-risk verification state to retained candidates.
  - `[high]` `[patch]` Disabled conflicting projections in the suppressing transaction, retired conflicting evidence before relation reactivation, and blocked all failed-verification reactivation paths.
  - `[medium]` `[patch]` Added durable dirty markers for every material pipeline mutation, exact supporting-evidence edit validation, deterministic policy locking, and bounded sampling disposition reason codes.

## Auto Run Result

Status: done

Implemented the AI-recommended Knowledge review and sampling queue. The new persisted queue binds actions to exact card/evidence versions, safely retains reviewable canonical cards for verify-first and relation-review outcomes, schedules deterministic four-week samples, records sampling dispositions, and contains unsafe cohorts atomically.

The protected Vietnamese admin queue is available at `/admin/knowledge/recommendations`, with bounded evidence detail and reason-compatible resolution actions. High-risk, conflicted, stale, failed-verification, and insufficient-support paths fail closed; all material queue and pipeline mutations audit and produce durable index-dirty work.

Verification passed: `pnpm test:run tests/knowledge-recommendation-queue.test.ts tests/knowledge-ingestion-pipeline.test.ts tests/knowledge-search.test.ts` (78 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Final adversarial and edge-case review found no remaining high- or medium-severity issues.

No commit was created because it was not requested.
