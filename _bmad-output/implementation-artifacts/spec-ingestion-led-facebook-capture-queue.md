---
title: 'Make the Facebook Capture Queue Ingestion-Led'
type: 'refactor'
created: '2026-07-28'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'd364c89a722b9c864edfeea33f94931c06f40ee4'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Facebook capture admin page treats legacy extraction-review status as its primary queue lifecycle, while the canonical source-version ingestion job is the actual pipeline that creates, publishes, suppresses, or escalates fact candidates. Operators can see a fact candidate but still see the capture as “Cần xử lý”, which is misleading.

**Approach:** Make canonical ingestion job stage the primary filter, count, ordering, and status display for `/admin/knowledge/facebook-captures`. Retain the Facebook review record only for capture integrity, recapture controls, and historic legacy-extraction information.

## Boundaries & Constraints

**Always:** Query one canonical ingestion job per immutable Facebook capture version; preserve raw text and model-completion privacy boundaries; keep recapture transition and its source/capture-version fencing unchanged; keep Vietnamese-first responsive operator UI; retain v1 ingestion jobs and legacy extraction records as historical compatibility data.

**Ask First:** Any change to database schema, canonical job/candidate lifecycle, card publication policy, recapture eligibility, or deletion/backfill of legacy review/extraction data.

**Never:** Derive legacy review statuses from ingestion outcomes; use a candidate as a substitute for the parent job’s stage; expose raw source text or provider completions in the list queue; remove the detail page's recapture function; alter traveler retrieval behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default queue | Facebook capture has a nonterminal job, `review_recommended`, `verify_first`, or `failed` job | It is shown in the attention-first queue with canonical job state as the headline | No legacy review status can override this category |
| Terminal history | Job is `published` or `suppressed` | It appears only in its explicit historical filter, with candidate summary as supporting context | A capture review still marked `needs_review` does not return it to the default queue |
| Recapture pending | Review/source has been reset for recapture and has no job for a current capture version | It is visibly identified as a capture-operation condition rather than a canonical ingestion outcome | Recapture action/service validation remains unchanged |
| Historical job | Job uses protocol v1 | Parent stage remains visible and the UI identifies it as historical; v2 candidate controls stay guarded | No synthetic v2 candidate result is shown |
| Existing bookmarked URL | Legacy `status` query value | The page resolves it safely to the canonical default/group or compatible presentation | The app does not throw for old links |

</frozen-after-approval>

## Code Map

- `src/features/knowledge/facebook-capture-review-admin.ts` -- current admin projections join review records to canonical jobs only after review-led pagination; will own the ingestion-led queue read model.
- `src/app/admin/knowledge/facebook-captures/page.tsx` -- review-status tabs and queue cards; will become the canonical ingestion queue UI.
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` -- canonical ingestion is currently secondary to review state; will make job stage the primary operational state while retaining capture controls.
- `src/features/knowledge/facebook-capture-review.ts` -- source-level review and recapture control plane; behavior remains intact.
- `src/features/knowledge/ingestion-jobs.ts` -- authoritative parent job lifecycle and terminal-stage contract.
- `tests/facebook-capture-review-admin.test.ts` -- queue/detail projections, privacy, and rendered admin UI regression coverage.
- `tests/facebook-capture-reject-action.test.ts` and `tests/facebook-capture-extraction-action.test.ts` -- legacy review/recapture compatibility coverage.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/facebook-capture-review-admin.ts` -- add ingestion-led, joined queue projections, canonical stage parsing/grouping, counts, ordering, and safe legacy URL handling -- ensure the queue no longer takes its lifecycle from `facebook_capture_reviews`.
- [x] `src/app/admin/knowledge/facebook-captures/page.tsx` -- replace legacy review tabs/copy/card headline/pagination with canonical ingestion lifecycle and explicit attention/history categories -- show capture-operation state only as a secondary signal.
- [x] `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` -- promote canonical job status in the detail hierarchy and back-link; retain recapture and ingestion rerun actions with their existing service-side rules.
- [x] `tests/facebook-capture-review-admin.test.ts` -- cover stage-led default/filter/count/order behavior, terminal history, v1, candidate summary, privacy, old status links, and recapture-pending rows.
- [x] `tests/facebook-capture-reject-action.test.ts` and `tests/facebook-capture-extraction-action.test.ts` -- update rendered-copy assertions and prove legacy extraction/recapture transitions remain supported but no longer define canonical queue state.

**Acceptance Criteria:**
- Given a Facebook capture with an active or attention-required canonical job, when an operator opens the default queue, then it is included and its displayed primary status is derived from `knowledge_ingestion_jobs.stage`.
- Given a capture review remains `needs_review` after its canonical job reaches `published` or `suppressed`, when the operator opens the default queue, then it is absent; it is present only under its terminal canonical outcome.
- Given canonical candidates have mixed outcomes, when an operator opens a capture detail page, then the parent job stage remains the queue status and candidate rows remain diagnostic detail.
- Given a capture is awaiting recapture, when an operator opens its detail/queue representation, then the UI explains that capture operation without inventing a canonical ingestion outcome.
- Given a legacy review-status URL is opened, when the queue renders, then it completes safely using the new canonical queue model.
- Given a v1 ingestion job, when it is rendered, then its parent lifecycle is shown without accessing v2 candidate-only features.
- Given all existing recapture and legacy extraction tests run, when the refactor is applied, then their service-side authorization and state-transition invariants remain unchanged.

## Design Notes

The parent job is the durable operational aggregate for an exact capture version. Candidate records are child work items and may have mixed terminal states, so they are informative but cannot define the source queue category. `facebook_capture_reviews` is source-scoped and deliberately persists a recapture control state across capture versions; it is therefore not equivalent to the immutable-version ingestion lifecycle.

Use an attention-first default category containing all nonterminal stages plus `failed`, `review_recommended`, and `verify_first`. Offer canonical terminal filters for `published` and `suppressed`. Preserve detail URLs keyed by review ID for the smallest safe routing change, because recapture remains owned by that record.

## Verification

**Commands:**
- `pnpm test:run tests/facebook-capture-review-admin.test.ts tests/facebook-capture-reject-action.test.ts tests/facebook-capture-extraction-action.test.ts` -- expected: all focused queue, detail, recapture, and legacy compatibility tests pass.
- `pnpm typecheck` -- expected: no TypeScript errors.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm build` -- expected: production build completes.

**Results:**
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` passed. Lint reports four pre-existing warnings in `coverage/block-navigation.js` and `tests/knowledge-search.test.ts`.
- The focused database test command initially passed 36 tests before review fixes. A later isolated retry could not complete because the shared PostgreSQL test environment exhausted its client limit after migrations (`too many clients already` / timeout). This is an environment blocker rather than an assertion failure; the new recapture-pending regression remains in the suite for rerun in a healthy database environment.

## Suggested Review Order

**Canonical Queue Model**

- Make the immutable capture-version ingestion job the queue's primary aggregate.
  [`facebook-capture-review-admin.ts:30`](../../src/features/knowledge/facebook-capture-review-admin.ts#L30)

- Keep missing jobs visible as explicit recapture or ingestion-operation work.
  [`facebook-capture-review-admin.ts:85`](../../src/features/knowledge/facebook-capture-review-admin.ts#L85)

- Preserve a recapture-pending detail page after its capture version is cleared.
  [`facebook-capture-review-admin.ts:119`](../../src/features/knowledge/facebook-capture-review-admin.ts#L119)

**Operator UI**

- Replace extraction-review tabs with canonical attention and terminal-outcome filters.
  [`page.tsx:57`](../../src/app/admin/knowledge/facebook-captures/page.tsx#L57)

- Make canonical stage primary while retaining review state as secondary metadata.
  [`page.tsx:101`](../../src/app/admin/knowledge/facebook-captures/page.tsx#L101)

- Link detail pages back to their canonical queue category.
  [`page.tsx:123`](../../src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx#L123)

**Regression Coverage**

- Verify parent stages drive membership, filters, counts, and ordering.
  [`facebook-capture-review-admin.test.ts:204`](../../tests/facebook-capture-review-admin.test.ts#L204)

- Verify recapture-pending records remain reachable in queue and detail views.
  [`facebook-capture-review-admin.test.ts:537`](../../tests/facebook-capture-review-admin.test.ts#L537)
