---
title: 'Simplify knowledge recommendation operations'
type: 'feature'
created: '2026-07-30'
status: 'done'
route: 'plan-code-review'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The recommendation queue exposes several internal state machines together, making it unclear whether an operator must act and what a completed recommendation achieved. The filter repeats those technical states rather than supporting the operator's work.

**Approach:** Present one operator-facing work state per recommendation, move the technical states out of the list, and filter by the same work states. Preserve database values, URLs, mutations, and detail-page behavior.

## Boundaries & Constraints

**Always:** Keep all persisted recommendation status, reason, resolution, and card-state values unchanged. Preserve the reason filter, pagination, and existing default queue behavior. Use Vietnamese-first copy and make results understandable without schema knowledge.

**Ask First:** Introducing a new database column, migration, or changing recommendation resolution behavior.

**Never:** Alter recommendation processing, card publication, evidence validation, audit, or authorization logic.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Actionable work | `open` or `in_review` recommendation | Card says “Cần xử lý”; default filter returns it | N/A |
| Completed decision | `resolved` recommendation with a known resolution | Card says “Đã hoàn tất” and names the result, such as “Đã xác minh và xuất bản” | Use a safe generic completed result if resolution is absent or unknown |
| Replaced work | `superseded` recommendation | Card says “Không còn hiệu lực” and explains it was replaced by newer work | N/A |
| Work-state filtering | `workStatus` query parameter | Server query maps it to the correct persisted recommendation statuses while preserving reason and pagination | Invalid or missing value falls back to the actionable-work default |

</frozen-after-approval>

## Code Map

- `src/app/admin/knowledge/recommendations/page.tsx` -- queue filters, display labels, and card summaries.
- `src/features/knowledge/recommendations.ts` -- server-side query projection and status filtering.
- `tests/knowledge-recommendation-queue.test.ts` -- recommendation list query behavior.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/recommendations.ts` -- add an operator-facing work-status filter that maps to the existing persisted statuses and returns recommendation resolution for display.
- [x] `src/app/admin/knowledge/recommendations/page.tsx` -- replace the technical status filter and card state string with the simplified work-state, reason, and result presentation; retain a reason filter and pagination.
- [x] `tests/knowledge-recommendation-queue.test.ts` -- cover work-status filtering and the returned resolution projection.

**Acceptance Criteria:**
- Given an open or in-review recommendation, when an operator views the default queue, then it is shown as “Cần xử lý” with its reason and no internal state string.
- Given a resolved recommendation, when an operator filters completed work, then the card is shown as “Đã hoàn tất” with a Vietnamese result based on its resolution.
- Given a superseded recommendation, when an operator filters non-current work, then the card is shown as “Không còn hiệu lực” with its replacement explanation.
- Given an operator applies a work-state filter with a reason filter, when they change pages, then both filters remain active.

## Design Notes

The list distinguishes only the decisions an operator can make: act now, inspect completed history, or recognize work that no longer applies. The reason explains why the item entered the queue; the result explains what was done. Existing raw state and version detail remain available in the detail view rather than competing with the primary queue decision.

## Spec Change Log

- Review finding: superseded recommendations are not guaranteed to have a successor. The inactive-work explanation is intentionally neutral so it does not imply replacement work exists.

## Verification

**Commands:**
- `pnpm test:unit -- tests/knowledge-recommendation-queue.test.ts` -- expected: relevant unit coverage passes without database setup.
- `pnpm lint` -- expected: no errors.
- `pnpm typecheck` -- expected: TypeScript succeeds without errors.

**Results:**
- `pnpm exec vitest run tests/knowledge-recommendation-queue.test.ts --project integration` -- passed: 26 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed with four existing warnings outside this change in `coverage/block-navigation.js` and `tests/knowledge-search.test.ts`.
