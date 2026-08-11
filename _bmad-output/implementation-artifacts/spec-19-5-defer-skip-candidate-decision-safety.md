---
title: 'Defer, Skip, and Verify Candidate Decision Safety'
type: 'feature'
created: '2026-08-10'
baseline_revision: '82cc8fb'
status: 'done'
final_revision: 'b1e11d5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-19-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Operators can accept a ranked Discovery candidate but cannot safely defer or skip it. Those terminal Discovery-only decisions must remain race-safe, auditable, and isolated from Knowledge intake and manual capture.

**Approach:** Add narrow closed Defer and Skip commands across the existing contracts, port, database, Nest API, and review workbench. Reuse the server-owned active-review lock, operation fencing, and full-refresh selection behavior already proven for Accept.

## Boundaries & Constraints

**Always:** Validate and lock the exact active association at command time: `pending` review, same-candidate immutable `consider` recommendation, and query-provenanced run. Transition only `pending -> deferred` or `pending -> skipped` with one bounded Discovery audit event. Exact `{}` requests and route-specific closed results are required. Any missing, inactive, stale, non-reviewable, concurrent, or unresolved-handoff association returns non-disclosing `404` with no state or audit write. After any terminal decision, re-fetch server-ranked active reviews and select the first remaining row or preserve the calm completion state and predictable focus.

**Block If:** Existing active-association locking, compare-and-swap, or the read-only unresolved-handoff guard cannot be reused without changing Knowledge handoff ownership or behavior.

**Never:** Accept browser URL/candidate/state/reason/audit/Knowledge data; create, update, delete, submit, or reconcile a Knowledge handoff; create sources or other Knowledge state; invoke Gemini or `youtube:capture`; alter ranking/recommendations, schema, blocking/exclusion policy, or broader action-queue UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|---------------------------|----------------|
| Defer | Authorized active pending `consider` review, exact `{}` | State becomes `deferred`, one bounded audit, returns `{ outcome: "deferred" }`, and queue refreshes | No Knowledge or capture side effect |
| Skip | Authorized active pending `consider` review, exact `{}` | State becomes `skipped`, one bounded audit, returns `{ outcome: "skipped" }`, and queue refreshes | No Knowledge or capture side effect |
| Invalid or stale decision | Invalid ID/body, inactive/non-reviewable state, race loser, or unresolved handoff marker | No state/audit write and no historic-state disclosure | `400 validation_error` for syntax, `404 not_found` for unavailable association, `503 internal_error` only for unsafe adapter/parser failure |
| Concurrent UI action | A decision is pending, selection changes, or Accept is reconciling | All actions disabled; stale completion cannot mutate current selection; detail remains until successful Defer/Skip refresh | Polite Vietnamese status, no dialog or focus-stealing toast |

</intent-contract>

## Code Map

- `packages/contracts/src/youtube-discovery/index.ts` -- strict empty-command and closed route-result parsers.
- `packages/domain/src/youtube-discovery/admin.ts` -- narrow Discovery admin port methods.
- `packages/database/src/admin-youtube-discovery.ts` -- authoritative locked active association, terminal transition, audit, and read-only handoff guard.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- protected exact-body transport and safe status mapping.
- `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` -- action fencing, CSRF transport, server refresh, selection, and focus behavior.
- `apps/admin/app/knowledge/youtube-discovery-review/review-copy.ts` -- closed Vietnamese operational feedback.
- `tests/admin-youtube-discovery-contract.test.ts`, `tests/youtube-discovery-review.integration.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/admin-youtube-discovery-review-ui.test.ts` -- focused contract, persistence, transport, and accessibility safety coverage.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/youtube-discovery/index.ts` and `packages/domain/src/youtube-discovery/admin.ts` -- added exact-empty Defer/Skip command parsers, exact route-specific result parsers, and explicit port methods without a generic command abstraction.
- [x] `packages/database/src/admin-youtube-discovery.ts` -- added one private helper restricted to `deferred | skipped`; it lock/revalidates the active association, rejects persisted handoff markers read-only, CASes the state, and audits the one winning transition.
- [x] `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- added guarded Defer/Skip routes with matching validation, principal forwarding, closed response parsing, and 400/404/503 mapping.
- [x] `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` and `review-copy.ts` -- replaced inert previews with credentialed CSRF actions, terminal recovery fencing, accessible queue/detail focus, and Vietnamese feedback.
- [x] Focused unit, serial integration, API, and UI tests -- proved exact contracts, transition/audit atomicity, stale and concurrent non-disclosure, unresolved-handoff isolation, no Knowledge/capture side effects, endpoint-only client transport, Vietnamese live feedback, and narrow focus recovery.

**Acceptance Criteria:**
- Given an authorized operator chooses `Để sau` or `Bỏ qua` for an active candidate, when the matching command succeeds, then only that review association moves from `pending` to `deferred` or `skipped`, it is audited once, and it leaves active review.
- Given any Accept, Defer, or Skip action completes, when the workbench updates, then it selects only the first candidate returned by a fresh server-ranked active queue or renders the existing accessible completion state.
- Given authorization, malformed commands, stale/concurrent decisions, unresolved handoffs, Accept regressions, and accessible interaction are tested, when they run, then invalid transitions produce no Discovery/Knowledge/capture side effect and valid terminal transitions alone persist.

## Spec Change Log

## Review Triage Log

### 2026-08-11 - Final review passes
- intent_gap: 0
- bad_spec: 0
- patch: 5 (high 0, medium 5, low 0)
- defer: 0
- reject: 2
- addressed_findings:
  - [medium] [patch] Preserved a terminal decision's recovery state after a lost response or failed refresh, with an explicit safe refresh control.
  - [medium] [patch] Restored deterministic focus to a visible queue row or queue heading after terminal decisions across desktop and mobile layouts.
  - [medium] [patch] Restored queue publication date and duration metadata while retaining decision-action fencing.

## Design Notes

The existing persistent Knowledge handoff marker is an ownership boundary. Defer/Skip inspect it only to fail closed; they never resolve or mutate it. This keeps Knowledge-specific recovery exclusive to the existing queue/detail reconciliation and Accept paths.

## Verification

**Commands:**
- `pnpm test:unit -- <affected DB-free test files>` -- strict command/result, UI transport, copy, and accessibility assertions pass without PostgreSQL.
- `pnpm test:integration -- <affected integration test files>` -- serial transition, audit, boundary, API, and reconciliation regression checks pass with local resets.
- `pnpm lint` -- no new lint errors.
- `pnpm typecheck` -- strict TypeScript passes.
- `pnpm build` -- production builds pass.
- `git diff --check` -- no whitespace errors.

## Auto Run Result

Status: done

Summary: Added audited, Discovery-only Defer and Skip decisions with strict closed transport contracts and protected admin routes. The review workbench now supports all three terminal actions, refreshes from the server-owned active ranking, and retains safe recovery and accessible focus behavior through interrupted requests.

Files changed:
- Contracts, domain port, database adapter, and Nest controller -- strict route-specific commands, locked terminal state transitions, one audit event, and safe status mapping.
- Admin review workbench and copy -- Vietnamese Defer/Skip feedback, CSRF transport, reconciliation recovery, server refresh, and keyboard focus behavior.
- Focused contract, database, API, and UI tests -- transition, handoff, authorization, response-shape, transport, and accessibility coverage.

Review findings: Five medium-severity UI recovery/focus findings were patched. Two duplicate reviewer reports of a missing retry control were rejected after confirming the rendered control invokes `retryDecisionRefresh`.

Verification:
- Passed `pnpm exec vitest run --project unit tests/admin-youtube-discovery-contract.test.ts tests/admin-youtube-discovery-review-ui.test.ts` (2 files, 7 tests).
- Passed `pnpm exec vitest run --project integration tests/youtube-discovery-review.integration.test.ts tests/admin-youtube-discovery-api.integration.test.ts` (2 files, 14 tests).
- Passed `pnpm lint` with 0 errors and 46 existing warnings, `pnpm typecheck`, `pnpm build`, and `git diff --check`.

Residual risks: The UI boundary test is source-oriented rather than browser-rendered. Full unfiltered suites retain unrelated existing failures, so verification used the focused serial suites above.
