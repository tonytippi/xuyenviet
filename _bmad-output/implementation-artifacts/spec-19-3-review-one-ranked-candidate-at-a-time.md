---
title: 'Review One Ranked Candidate at a Time'
type: 'feature'
created: '2026-08-10'
status: 'done'
baseline_revision: '398abe4'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: '398abe4'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-19-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Operators have immutable Discovery recommendations but no authorized, safe workspace to review a single eligible `consider` candidate and understand why it ranks without seeing raw source material.

**Approach:** Add the smallest Discovery-owned pending-review association, typed keyset-paginated read projections, protected admin GET routes, and a responsive Vietnamese admin workbench with deliberately disabled future decision controls.

## Boundaries & Constraints

**Always:** Project only bounded Discovery metadata, recommendation codes, linked query provenance, and the opaque Knowledge prior-capture outcome. Active review is exactly a `pending` state bound to that candidate's immutable `consider` recommendation with query-proposal provenance. Preserve ordering by score descending, creation time ascending, and recommendation ID ascending through an opaque versioned tuple cursor. Keep UI selection local and all decision previews disabled.

**Block If:** The existing opaque `YoutubeCaptureEligibilityPort` cannot be injected at API composition without a Discovery adapter importing or querying Knowledge persistence, or the migration baseline cannot be determined from the journal before adding one forward migration.

**Never:** Add accept/defer/skip commands, state transitions, audit events, Knowledge writes or identifiers, capture scheduling, Worker/provider changes, recommendation recalculation/mutation, raw comments/model/provider/source/evidence/traveler content, generic repository abstractions, or offset/infinite-scroll pagination.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Active review page | Authorized operator; active pending consider rows | Fixed-size ordered queue with opaque `nextCursor`; client selects first item locally and then retrieves its safe detail | Empty first page makes no detail request and shows Vietnamese completion state |
| Tuple tie/page boundary | Several active rows share score | Pages remain in score/time/ID order with no duplicate or omitted rows | Malformed or incompatible cursor returns `400 validation_error` |
| Historic/non-active lookup | Missing ID, non-consider, absent query provenance, or state not pending | No historic state or metadata is disclosed | Detail route returns safe `404 not_found` |
| Safe-port unavailable | Valid active detail but prior-capture port returns `unavailable` | Detail remains visible and exposes only closed unavailable outcome | Adapter failure or unsafe projection is `503 internal_error` |
| Preview actions | Detail inspection before Stories 19.4/19.5 | Labelled disabled Accept, De sau, and Bo qua controls with polite explanation | No dialog, mutation, request, audit, intake, or capture side effect |

</intent-contract>

## Code Map

- `drizzle/migrations/meta/_journal.json` and `drizzle/migrations/0056_add_discovery_recommendations.sql` -- determine next migration identity and established immutable recommendation constraints.
- `packages/database/src/schema.ts` -- Discovery candidate, recommendation, run, appearance, query-proposal, and new review-state schema types.
- `packages/contracts/src/youtube-discovery/index.ts` -- strict exact-key Discovery API parsers and closed vocabularies.
- `packages/domain/src/youtube-discovery/admin.ts` -- narrow admin Discovery port shared by API and PostgreSQL adapter.
- `packages/database/src/admin-youtube-discovery.ts` -- safe queue/detail read projection and injected opaque eligibility lookup.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` and `apps/api/src/main.ts` -- existing protected transport and request-serving composition root.
- `apps/admin/app/knowledge/intake/knowledge-intake.tsx` and `apps/admin/app/knowledge/facebook-captures/queue.tsx` -- direct API, session redirect, pagination, and admin accessibility patterns.
- `tests/admin-youtube-discovery-contract.test.ts` and `tests/admin-youtube-discovery-api.integration.test.ts` -- current contract/API test seams.

## Tasks & Acceptance

**Execution:**
- [x] `drizzle/migrations/0057_add_discovery_candidate_review_state.sql`, `drizzle/migrations/meta/_journal.json`, and `packages/database/src/schema.ts` -- add one forward, Discovery-only review-state table holding one candidate, its exact immutable recommendation, and closed `pending | accepted | deferred | skipped` state; enforce same-candidate association and uniqueness, then deterministically backfill one pending association per qualifying historic candidate from the newest `consider` recommendation with query provenance -- creates no command or mutable behavior beyond required durable foundation.
- [x] `packages/contracts/src/youtube-discovery/index.ts` -- add strict queue/detail request-response parsers, closed safe display values, a versioned opaque cursor encoding the full score/time/ID tuple, fixed bounded page size, and exact `{ items, nextCursor }` response shape -- rejects unknown/internal fields, duplicate or invalid codes, malformed UTC dates, unbounded text, and invalid numeric score/cursor data before transport/UI use.
- [x] `packages/domain/src/youtube-discovery/admin.ts` and `packages/database/src/admin-youtube-discovery.ts` -- extend the established admin port with typed queue/detail reads and PostgreSQL projection -- select only pending state bound to the exact consider recommendation with query provenance, keep tuple paging deterministic, bind all candidate/recommendation/appearance/run/query data to one provenance graph, return null for non-active detail, and use only an injected `YoutubeCaptureEligibilityPort` for safe prior outcome.
- [x] `apps/api/src/main.ts` and `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- compose the Knowledge-owned safe port once for the request-serving admin adapter and expose only protected GET `/v1/admin/knowledge/youtube-discovery/review` and `/:recommendationId` routes -- reuse existing admin capability/browser-session guards and safe envelopes (`400` malformed input, `404` unavailable projection, `503` adapter/projection failure); leave existing root list and all write transport unchanged.
- [x] `apps/admin/app/knowledge/youtube-discovery-review/page.tsx` and `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` plus the existing admin shell only if a matching navigation convention exists -- build credentialed, no-store, parsed GET queue/detail client with initial-first and explicit-row selection, load-more, desktop queue/persistent inspector and narrow sequential layout -- render only allowed Vietnamese mappings, opt-in score disclosure, visible selection/focus, polite status announcements, and inert accessible action previews.
- [x] `tests/admin-youtube-discovery-contract.test.ts`, `tests/youtube-discovery-review.integration.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, and `tests/admin-youtube-discovery-review-ui.test.ts` -- prove strict safety/cursor/tie handling/mappings, migration and active/provenance constraints, opaque safe-port use, API capability/error envelopes, client selection and load-more behavior, accessible read-only controls, and absence of any Discovery/Knowledge/capture write path -- keep unit tests database-free and call `resetTestDatabase()` locally in clean-state integration setup.

**Acceptance Criteria:**
- Given an authorized operator opens review with active rows, when it fetches pages and selects a row, then a deterministic keyset-paginated queue and one matching safe detail projection are available without persisted client selection or duplicate/omitted tie rows.
- Given a candidate inspector renders, when linked query/recommendation/candidate data is valid, then it shows only allowed metadata, Vietnamese ranking context, bounded explanations/signals, and opaque prior-capture outcome, never proof of truth, capture, or publication.
- Given actions are not implemented yet, when the inspector renders, then Accept, `Để sau`, and `Bỏ qua` are labelled disabled previews with a polite announcement and no mutation or external side effect.
- Given narrow, keyboard, or assistive-technology use, when review functions are used, then queue/detail read actions retain accessible names, visible focus, selected semantics, explicit load-more, concise live updates, and a sequential no-two-dimensional-scroll layout.

## Spec Change Log

## Review Triage Log

### 2026-08-10 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6 (high 0, medium 6, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - [medium] [patch] Created the pending review association atomically for qualifying persisted recommendations and deletes it before recommendation retention.
  - [medium] [patch] Prevented stale detail responses and concurrent duplicate load-more appends in the review client.
  - [medium] [patch] Added the discoverable admin-shell review link and protected API route coverage for the new queue/detail reads.

### 2026-08-10 - Follow-up review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5 (high 0, medium 5, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - [medium] [patch] Cleared obsolete inspector detail during a changed selection and retained stale-response fencing.
  - [medium] [patch] Restored the documented safe `404 not_found` envelope for inactive review details.
  - [medium] [patch] Made review cursors preserve UTC microsecond creation ordering and repaired canonical integration fixtures.
  - [medium] [patch] Made existing candidate review-state retention explicit so later Worker recommendations never silently overwrite a current decision.

### 2026-08-10 - Final review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 0, medium 4, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - [medium] [patch] Rejected impossible calendar dates in otherwise well-formed review cursors.
  - [medium] [patch] Isolated the forward-migration backfill exercise in a rolled-back transaction so it cannot corrupt the shared integration schema.
  - [medium] [patch] Rejected fabricated or no-longer-active cursor anchors rather than resuming from an ambiguous keyset boundary.
  - [medium] [patch] Proved the migration backfill selects the newest same-candidate historic recommendation, including the ID tie-breaker.

### 2026-08-10 - Closing review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (high 0, medium 1, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - [medium] [patch] Rejected unknown queue query keys before the read port receives a request.

### 2026-08-10 - Isolation repair pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (high 0, medium 1, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - [medium] [patch] Moved the actual 0057 forward-migration exercise into a disposable schema so repeated integration runs preserve the shared public baseline.

### 2026-08-10 - Migration boundary repair pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (high 0, medium 1, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - [medium] [patch] Removed the production pre-migration fallback so review-state writes and retention require the forward migration.

### 2026-08-10 - Provenance admission repair pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (high 0, medium 1, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - [medium] [patch] Created pending review state only for query-provenanced recommendations so historic runs cannot consume a candidate's active review slot.

## Design Notes

The review state is not a derived eligibility cache: it is a durable association to one historic immutable recommendation. The database projection must use that association as its admission predicate, then carry the same provenance graph to detail; selecting a candidate's newest recommendation at runtime would violate the story's historic-review and decision-safety boundary.

The prior-capture outcome is a live but opaque Knowledge boundary. It may be displayed as one closed outcome (`eligible`, `already_compatible`, or `unavailable`), but neither its implementation nor any source identity can cross into Discovery persistence or transport.

## Verification

**Commands:**
- `pnpm exec vitest run --project unit <affected Discovery contract/read-model/UI test files>` -- strict parser, cursor, mapping, UI state, accessibility, and no-write behavior pass without PostgreSQL.
- `pnpm exec vitest run --project integration <affected Discovery review/API integration test files>` -- serial migration-backed active projection, port boundary, authorization, and safe-envelope coverage passes.
- `pnpm lint` -- no lint errors.
- `pnpm typecheck` -- strict TypeScript passes.
- `pnpm build` -- production builds pass.
- `git diff --check` -- no whitespace errors.

## Auto Run Result

Status: done

Summary: Added the protected, read-only YouTube Discovery candidate-review workflow: durable pending-review admission, exact safe queue/detail contracts, stale-safe keyset pagination, direct admin API reads, and a responsive Vietnamese admin inspector with disabled future decision previews.

Files changed:
- `drizzle/migrations/0057_add_discovery_candidate_review_state.sql`, `drizzle/migrations/meta/_journal.json`, and `packages/database/src/schema.ts` -- durable Discovery-only review state, constraints, and deterministic backfill.
- `packages/contracts/src/index.ts` and `packages/contracts/src/youtube-discovery/index.ts` -- safe error code plus strict review projection and versioned microsecond cursor contracts.
- `packages/domain/src/youtube-discovery/admin.ts`, `packages/database/src/admin-youtube-discovery.ts`, and `packages/database/src/youtube-discovery/index.ts` -- authorized read port, active anchor validation, review-state admission, and retention ordering.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts`, `apps/api/src/main.ts`, and `apps/api/src/safe-api-exception.filter.ts` -- composed protected GET transport with strict query validation and safe error envelopes.
- `apps/admin/app/admin-access-gate.tsx` and `apps/admin/app/knowledge/youtube-discovery-review/` -- discoverable Vietnamese review workbench and UI-local safe mappings.
- `tests/admin-youtube-discovery-contract.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/admin-youtube-discovery-review-ui.test.ts`, `tests/youtube-discovery-review.integration.test.ts`, and `tests/youtube-discovery-recommendations.integration.test.ts` -- contract, API, UI-boundary, migration/read-model, and review-state regressions.

Review findings: All review findings were repaired across focused adversarial and edge-case passes. Final independent review: no actionable findings. No work was deferred.

Verification:
- Passed focused unit contract/UI/filter suites.
- Passed focused serial integration suites for recommendation state/retention, migration-backed queue projection and cursor traversal, and protected API reads (11 API tests).
- Passed `pnpm typecheck` and `git diff --check`.
- Prior implementation run also passed `pnpm lint` with existing repository warnings only and `pnpm build`.

Residual risks: Browser-measured 320px/400%-zoom overflow evidence remains outside the repository's current UI test harness; structural narrow-layout and accessibility boundary coverage is included. No commit was created because it was not requested.
