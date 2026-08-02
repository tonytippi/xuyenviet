---
title: 'Vietnamese admin operator guide'
type: 'feature'
created: '2026-07-30'
status: 'done'
review_loop_iteration: 0
baseline_commit: '2d91e90eaf0d3fa554904f1cddee218ac128df5b'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Operators currently need to infer the knowledge pipeline, data states, and required follow-up work from individual administration screens. This creates a risk of treating incomplete, unverified, or unindexed data as ready for traveler-facing AI retrieval.

**Approach:** Add a Vietnamese-first “Hướng dẫn” area to the protected admin console. It will offer an overview, a data-flow guide, and a state/action reference, with links to the relevant operational screens.

## Boundaries & Constraints

**Always:** Keep the guide inside the existing server-protected `/admin` layout, use Vietnamese throughout, preserve the current visual language and responsive behavior, and present only behavior confirmed by the codebase. Explain the distinction between approval, verification, publication, evidence eligibility, and AI indexing. Cover current source intake, Facebook and YouTube review, AI drafts, approved knowledge/indexing, operator recommendations, and coverage signals. Provide direct links to the applicable admin page wherever an operator can act.

**Ask First:** Adding editable guide content, a CMS/database schema, user roles beyond the existing admin guard, analytics, or guidance for workflows not exposed by the current UI.

**Never:** Expose source secrets, internal raw capture material, hidden operational details, or claim that approval alone makes a card verified or retrievable by AI. Do not describe an unavailable retry, archive, restore, or direct-edit action as operator-accessible.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Guide entry | Admin opens the admin console | Navigation exposes “Hướng dẫn”; its landing page introduces the guide and links to its three topic pages. | Existing layout access guard handles unauthenticated and non-admin visitors. |
| State lookup | Operator opens the data-state guide | Each documented state states its operational meaning, safe next action, and relevant admin link when one exists. | States without an exposed UI action explicitly say not to take a manual shortcut. |
| Indexing distinction | A card is approved but not indexed or lacks eligible evidence | Guide says it is not yet reliably retrievable by the AI assistant and directs the operator to inspect the relevant status. | Does not imply an indexing retry button exists. |
| Mobile navigation | Narrow viewport | Guide navigation and page cards remain readable and usable without horizontal content clipping. | Uses existing responsive layout patterns. |

</frozen-after-approval>

## Code Map

- `src/app/admin/layout.tsx` -- protected shared admin navigation; add a Hướng dẫn entry.
- `src/app/admin/guides/page.tsx` -- new guide landing page with system overview and topic navigation.
- `src/app/admin/guides/data-flow/page.tsx` -- new guide explaining the source-to-traveler knowledge flow.
- `src/app/admin/guides/data-states/page.tsx` -- new state reference with meaning, safe operator actions, and admin links.
- `src/app/admin/guides/operating-routine/page.tsx` -- new daily operating checklist and escalation boundaries.
- `src/app/admin/knowledge/*.tsx` -- existing UI copy and routes that ground guide terminology and links; no behavior change.
- `src/features/knowledge/display-labels.ts` -- canonical Vietnamese labels for documented persisted statuses.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/admin/layout.tsx` -- added the Hướng dẫn navigation entry -- makes the operator documentation discoverable from every protected admin surface.
- [x] `src/app/admin/guides/page.tsx` -- created a Vietnamese guide hub -- orients operators to the system purpose, trust boundaries, and the three guide topics.
- [x] `src/app/admin/guides/data-flow/page.tsx` -- documented the actual knowledge flow from source intake through review, publication, evidence, and AI indexing -- gives operators a shared mental model before state-specific work.
- [x] `src/app/admin/guides/data-states/page.tsx` -- documented confirmed intake, ingestion, draft, recommendation, publication, and index states with safe actions and contextual links -- reduces unsafe status interpretation.
- [x] `src/app/admin/guides/operating-routine/page.tsx` -- added a Vietnamese routine for prioritizing queues, checking coverage, and recognizing when no UI action is available -- makes expected daily operation actionable.
- [x] `tests/admin-operator-guide.test.ts` -- verifies the protected navigation, critical status distinctions, and operator queue links -- prevents accidental guide removal or misleading copy regression.

**Acceptance Criteria:**
- Given an administrator, when they use the console navigation, then they can open “Hướng dẫn” and each of its overview, data-flow, data-state, and operating-routine pages.
- Given an operator unfamiliar with the system, when they read the guide, then they can identify the intended order of source intake, processing, review, recommendations, publication, and quality/coverage monitoring.
- Given a documented pending, failed, review-required, verification-required, suppressed, approved, or indexing state, when the operator views the state reference, then it explains the state and a safe next action without inventing UI capabilities.
- Given an approved card that is not index-ready, when the operator reads the guide, then they understand it may not be usable by the AI assistant until evidence and indexing conditions are met.
- Given a narrow viewport, when an operator opens any guide page, then text, links, and state tables/cards remain readable and accessible.

## Design Notes

Prefer clear card-based reference sections over a dense single table on mobile. Link operators to an action only where the existing UI confirms it. Use explicit callouts for the three distinctions most likely to cause operational mistakes: approval is not verification, publication is not AI retrieval, and a suppressed item is retained but not published.

## Verification

**Commands:**
- `pnpm typecheck` -- passed after build generated current Next route types.
- `pnpm lint` -- passed with four pre-existing warnings in `coverage/block-navigation.js` and `tests/knowledge-search.test.ts`; no guide-related warnings.
- `pnpm test:unit --run tests/admin-operator-guide.test.ts` -- passed: 4 tests.
- `pnpm test:unit` -- guide tests passed; suite remains blocked by two pre-existing `tests/traveler-ui-foundation.test.ts` assertions expecting removed Inter/font palette implementation (190 passed, 2 failed).
- `pnpm build` -- passed and includes `/admin/guides`, `/admin/guides/data-flow`, `/admin/guides/data-states`, and `/admin/guides/operating-routine`.

## Spec Change Log

- Review found that approval was incorrectly conflated with active publication and that the YouTube review queue had no direct guide link. The guide now separates approved from published/active cards and documents YouTube as its own workflow with its actual queue. This avoids presenting suppressed approved cards as traveler-ready or directing YouTube work to the Facebook queue. KEEP: retain explicit indexing/evidence gates and link only to confirmed operator actions.
- Added an operator-facing explanation of the source-to-fact-to-card-to-prompt path. It explicitly describes the current metadata/evidence search index and bounded prompt bundle, while avoiding a false claim that the database already persists vector embeddings for every card. KEEP: state the implementation boundary clearly until vector persistence is introduced.

## Suggested Review Order

**Operator entry and system model**

- Protected console navigation exposes the guide area to every authorized operator.
  [`layout.tsx:13`](../../../src/app/admin/layout.tsx#L13)

- Guide hub establishes the three trust boundaries before operators enter a workflow.
  [`page.tsx:24`](../../../src/app/admin/guides/page.tsx#L24)

- Data flow distinguishes Facebook processing, YouTube review, drafts, decisions, and indexing.
  [`data-flow/page.tsx:3`](../../../src/app/admin/guides/data-flow/page.tsx#L3)

**Status safety**

- State reference separates approval from active publication and AI index readiness.
  [`data-states/page.tsx:3`](../../../src/app/admin/guides/data-states/page.tsx#L3)

- Daily routine prioritizes quality queues and explicitly blocks unsafe manual shortcuts.
  [`operating-routine/page.tsx:3`](../../../src/app/admin/guides/operating-routine/page.tsx#L3)

**Regression coverage**

- Focused tests lock navigation, critical distinctions, and correct queue links.
  [`admin-operator-guide.test.ts:1`](../../../tests/admin-operator-guide.test.ts#L1)

- Unit project includes the new infrastructure-free guide test.
  [`vitest.config.ts:16`](../../../vitest.config.ts#L16)
