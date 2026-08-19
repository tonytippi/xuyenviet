---
title: 'Retrieve By Required Need And Remove Card Count'
type: 'feature'
created: '2026-08-17'
status: 'done'
baseline_revision: 'bcc062b79626b0ff4a02cb70a137cafc3c1367dd'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-epic-21/SPEC.md'
  - '_bmad-output/specs/spec-epic-21/story-contracts.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Retrieval currently decides broad planning fallback partly from whether fewer than three knowledge cards were selected. Card volume can hide a consequential uncovered need or trigger web work when one applicable fact is sufficient.

**Approach:** Replace that active branch with a small typed, code-owned required-need evaluator beside source-bundle retrieval. Evaluate only eligible, applicable facts that survive the exact prompt render, retain one bounded required-need snapshot in the existing retrieval decision, and use its outcomes for fallback and freshness behavior.

## Boundaries & Constraints

**Always:** Treat Story 21.5 in `story-contracts.md` as exact; Story 21.4 is complete. Required needs are selected by current planning mode/intent and map facts only to compatible need IDs and route scope. Outcomes are exactly `satisfied`, `missing`, `requires_verification`, or `requires_clarification`. Search only existing eligible owner rows and allowlisted fact/card relevance fields. Use the existing `assistant_retrieval_decisions.knowledgePolicySnapshot` column and existing AI Ask finalization transaction; bind the snapshot's arrays, strings, IDs, and serialized size before persistence.

**Block If:** The existing retrieval/finalization seams cannot persist a bounded required-need snapshot without changing schema, migrations, or the existing terminal transaction.

**Never:** Add compatibility/read mode, feature flag, shadow evaluation, run/selection/query-plan table, service, queue, Worker, cache, endpoint, schema change, or migration. Do not modify `drizzle/migrations/0077_clean_break_trip_aware_planning.sql` or `drizzle/migrations/0078_add_trip_plan_item_canonical_route_path_id.sql`. Existing candidate/selected/target count columns may remain inert telemetry, but no active branch, config, prompt assertion, test authority, or fallback decision may use card count for sufficiency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| One sufficient fact | One rendered eligible card maps to every required need | Each need is `satisfied`; no web search occurs solely because fewer than three cards rendered | No count fallback |
| Uncovered required need | Several rendered cards omit a compatible route/fact need | The need remains `missing` or `requires_verification`; fallback/guidance follows that explicit gap | Do not mask the gap with card volume |
| Scope or capacity exclusion | Evidence is off-route, source-metadata-only, stale, or omitted during compaction | It cannot satisfy the need; recompute final outcomes from rendered evidence IDs | Preserve an explicit gap or clarification outcome |
| Persisted decision | A completed answer finalizes with required-need coverage | Existing provenance persists one bounded `required-needs-v1` snapshot | Reject/clip oversized snapshot before write |

</intent-contract>

## Code Map

- `packages/database/src/source-bundle.ts:38-71,155-175,297-376` -- owns active count-based fallback (`knowledge.length < approvedKnowledgeTargetCount`), retrieval decision types, and web trigger seam; replace with typed required-need outcomes while preserving existing error/freshness triggers where applicable.
- `packages/database/src/source-bundle.ts:515-747` and `packages/database/src/approved-knowledge.ts:74-109` -- exact prompt render/compaction exposes rendered and omitted card IDs; coverage must be computed/recomputed from this final manifest, not pre-render search rows.
- `packages/database/src/approved-knowledge.ts:1-32` -- current fixed result limit is count-shaped retrieval policy; make capacity bounded by required-need selection rather than a three-card sufficiency target.
- `packages/database/src/knowledge-search.ts:145-255,293-453,529-553` -- existing eligible owner-row search and evidence policy input; searchable relevance must exclude source URL, label, publisher, and provenance metadata, retaining only allowlisted factual/card fields and deterministic bounded selection.
- `packages/database/src/provenance.ts:54-117` and `packages/database/src/schema.ts:2173-2227` -- reuse the existing `knowledgePolicySnapshot` persistence boundary; retain all schema/count columns untouched and replace only the bounded JSON payload content.
- `packages/database/src/answer-freshness.ts:3-95` -- derives fallback warning behavior from retrieval decision; replace count-coverage predicates with required-need outcomes while retaining safe verification guidance.
- `packages/database/src/ai-ask-stream-execution.ts:318-355` -- existing fenced finalization calls freshness logic and persists provenance in one transaction; no second finalization path is authorized.
- `tests/knowledge-search.test.ts` -- extend existing search tests with source/provenance metadata non-relevance and bounded deterministic candidate assertions.
- `tests/ai-ask-stream-execution.test.ts` and `tests/planning-mode.test.ts` -- update retrieval-decision/source-bundle fixtures only as required by the typed snapshot contract.

## Tasks & Acceptance

**Execution:**
- `packages/database/src/source-bundle.ts` -- define minimal typed required-need definitions, compatible fact/route mapping, four outcomes, bounded `required-needs-v1` snapshot, and need-driven fallback; remove `approvedKnowledgeTargetCount`, the fewer-than-three branch, and count-based prompt sufficiency text -- make consequential coverage explicit.
- `packages/database/src/approved-knowledge.ts` -- select/render bounded eligible evidence so required contributions are retained within prompt capacity and expose the exact final rendered manifest -- prevent omitted evidence from satisfying a need.
- `packages/database/src/knowledge-search.ts` -- remove source URL, label, publisher, and provenance metadata from searchable relevance while preserving existing owner/eligibility policy and deterministic bounded ordering -- prevent metadata from boosting or authorizing an off-scope fact.
- `packages/database/src/provenance.ts` and `packages/database/src/answer-freshness.ts` -- persist and consume the same bounded required-need snapshot through existing ownership/finalization seams -- preserve missing/verification guidance without schema changes or count decisions.
- `tests/required-need-retrieval.test.ts` and `tests/required-need-retrieval.integration.test.ts` -- add RN-01 through RN-06, COMP-01, COMP-02, route isolation, prompt-capacity recomputation, and bounded persisted snapshot evidence; integration tests use approved `DATABASE_URL_TEST`, stay serial, and call `resetTestDatabase()` locally when clean tables are required.
- `tests/knowledge-search.test.ts`, `tests/ai-ask-stream-execution.test.ts`, and `tests/planning-mode.test.ts` -- update relevant fixtures and prove source metadata cannot influence relevance or required-need authority.

**Acceptance Criteria:**
- Given a ready planning turn enters retrieval, when eligible rendered facts are evaluated, then each applicable required need has exactly one of `satisfied`, `missing`, `requires_verification`, or `requires_clarification`, and unrelated facts, sources, metadata, or legs cannot satisfy it.
- Given one applicable card covers all required needs, when fallback is decided, then no web search occurs solely to reach three cards; given many cards omit a required need, then the explicit gap controls safe fallback or guidance.
- Given prompt capacity, stale evidence, or route scope removes a selected contribution, when the final source bundle is rendered, then need coverage is recomputed from the rendered evidence manifest before generation.
- Given a completed answer persists retrieval provenance, when the existing terminal transaction commits, then it stores one bounded `required-needs-v1` snapshot in the existing column without a schema or migration change.
- Given a knowledge search query contains source metadata terms only, when approved knowledge is searched, then URL, source label, publisher, and provenance metadata do not improve relevance or authorize a result.

## Spec Change Log

## Review Triage Log

### 2026-08-17 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 14 (high 0, medium 14, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Required facts now map only to typed compatible needs, retain route-leg and location scope, and preserve all four outcomes through the rendered manifest.
  - `[medium]` `[patch]` Rendered evidence is revalidated before selection; oversized cards are skipped so later required contributors can fit, and final rendered coverage drives the existing web fallback before answer generation.
  - `[medium]` `[patch]` Existing indexed metadata can discover candidates but cannot authorize returned results; all returned cards are re-scored from current allowlisted factual fields.
  - `[medium]` `[patch]` Provenance now persists one bounded, deduplicated `required-needs-v1` snapshot and exact rendered-card telemetry through the existing transaction.
  - `[medium]` `[patch]` Added focused coverage for required outcomes, scope isolation, render capacity, stale revalidation, legacy metadata, older search matches, snapshot bounds, and direct serial PostgreSQL evidence.

## Design Notes

The evaluator is intentionally local and typed: a need is not inferred from rendered prose or metadata. Snapshot evaluation may run before web admission to choose a need-driven fallback, but final coverage must use the prompt's rendered card manifest so compaction cannot silently retain authority for omitted evidence.

## Verification

**Commands:**
- `pnpm test:unit -- tests/required-need-retrieval.test.ts tests/knowledge-search.test.ts` -- focused infrastructure-free required-need and relevance tests pass; preserve the direct focused command if the package wrapper expands beyond supplied tests.
- `pnpm exec vitest run --project integration tests/required-need-retrieval.integration.test.ts` -- focused serial PostgreSQL snapshot and isolation tests pass using approved `DATABASE_URL_TEST`.
- `pnpm lint` -- lint passes.
- `pnpm typecheck` -- strict TypeScript passes.

## Auto Run Result

Status: done

Summary: Replaced the active fewer-than-three-card fallback with typed required-need evaluation. The final, revalidated rendered evidence manifest determines bounded need outcomes and existing web fallback; the same immutable decision persists through the existing provenance transaction.

Files changed:
- `packages/database/src/source-bundle.ts` -- required-need types, typed fact/route compatibility, final rendered decision, revalidation, and need-driven fallback.
- `packages/database/src/approved-knowledge.ts` -- bounded contributor packing that skips oversized cards and preserves later fitting evidence.
- `packages/database/src/knowledge-search.ts` -- current factual-field reauthorization and deterministic complete-corpus candidate discovery without metadata authority.
- `packages/database/src/provenance.ts` and `packages/database/src/answer-freshness.ts` -- bounded snapshot persistence and verification guidance from required outcomes.
- `packages/database/src/ai-ask-stream-execution.ts` -- carries the exact rendered retrieval decision through existing finalization.
- `tests/required-need-retrieval.test.ts`, `tests/required-need-retrieval.integration.test.ts`, and `tests/knowledge-search.test.ts` -- required-need, route, capacity, stale, snapshot, metadata, and older-candidate evidence.
- `tests/ai-ask-stream-execution.test.ts` and `tests/planning-mode.test.ts` -- retrieval-decision fixture updates.

Review findings: 14 medium patches applied across iterative review; 0 deferred; final synchronous review found no high or medium correctness findings. Follow-up review recommendation: `true` (patched high: 0, medium: 14, low: 0; score: 42).

Verification:
- `pnpm test:unit -- tests/required-need-retrieval.test.ts tests/knowledge-search.test.ts` -- passed, 44 files and 369 tests; the configured unit wrapper expands beyond the supplied files.
- `pnpm exec vitest run --project integration tests/required-need-retrieval.integration.test.ts` -- passed, 1 file and 3 tests, using approved `DATABASE_URL_TEST`.
- `pnpm exec vitest run --project integration tests/knowledge-search.test.ts` -- passed, 1 file and 40 tests, using approved `DATABASE_URL_TEST`.
- `pnpm lint` -- passed with 0 errors; 63 pre-existing unrelated warnings remain.
- `pnpm typecheck` -- passed across all workspace packages.
- `git diff --check` -- passed.

Residual risks: Required-need applicability intentionally uses a small typed, lexical mapping and therefore may conservatively preserve a gap for paraphrased evidence. Search reauthorizes legacy indexed candidates from current factual fields; large active corpora require bounded paged candidate reads to preserve older factual-match discovery.
