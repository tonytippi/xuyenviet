---
title: 'Build the Action-Required Discovery Queue'
type: 'feature'
created: '2026-08-11'
baseline_revision: '626b634'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-20-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Discovery opens in a candidate-only review workspace, forcing operators to search routine work and unrelated history rather than showing the small set of safe work that requires attention.

**Approach:** Add one protected, server-owned, read-only action queue that merges eligible Discovery candidates, stalled Mission needs, persistent safe incidents, and high-impact Knowledge links; make it the Discovery landing surface while retaining owner boundaries and existing detailed workspaces.

## Boundaries & Constraints

**Always:** Persist the locked operational thresholds in the audited, versioned Discovery policy: priority `1..20`, candidate age `72h`, Mission stall `48h`, and non-rate-limit incident `2` terminal same-query/category failures in `24h`. Use immutable policy provenance appropriate to each item. Candidate inclusion remains exactly pending review + immutable `consider` recommendation + non-null query provenance, and an aged candidate appears once. Queue reads are deterministic, paginated, and have zero writes: no review reconciliation, audit, handoff, Knowledge/capture mutation, Worker execution, or retry. Keep the closed run incident vocabulary durable across retries; rate limits must be typed, never inferred from provider text. Publish Mission and Knowledge rows through narrow owner-safe ports, with bounded opaque IDs and closed labels/reasons only. Admin is a typed protected API client. Preserve Vietnamese-first, accessible, sequential responsive worklist behavior.

**Block If:** A stable Mission owner projection or a safe durable typed incident classification cannot be added without direct Discovery-to-Knowledge table access, raw diagnostic disclosure, or changing existing Knowledge/capture ownership.

**Never:** Build a dashboard/KPI wall, generic event history, policy-management UI, new service/dependency, generic cross-domain repository, direct Knowledge writer, source/capture/evidence path, provider call, raw provider/source/prompt/payload exposure, or client-side eligibility calculation. Do not change existing planning priority semantics, terminal candidate actions, Knowledge intake, or manual `youtube:capture`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Authorized queue read | Valid optional opaque cursor | Closed paginated worklist of only active candidate, stalled Mission, persistent incident, and eligible Knowledge-link rows in canonical order | No writes or unsafe fields |
| Candidate escalation | Active high-priority `consider` recommendation older than its versioned `72h` threshold | One candidate row with a closed escalation label and its recommendation destination | Never duplicate or change candidate eligibility |
| Incident escalation | Typed rate limit, or two terminal same query/category failures within `24h` | Safe Health row; a later successful same-query run clears a rate-limit row | Exclude retries, one-off failures, cancelled/completed/null-query runs |
| Invalid/stale queue input | Unknown query key, malformed/version-incompatible/stale cursor | No port admission or partial result | `400 validation_error` |
| Unsafe adapter response | Parser failure or adapter exception | No diagnostic fallback | `503 internal_error` |
| Empty/accessibility state | No queue work or keyboard page append | Calm Mission/Health links or exact polite range announcement with predictable focus | Visible labels/focus and 44px controls |

</intent-contract>

## Code Map

- `drizzle/migrations/`, `drizzle/meta/_journal.json`, `packages/database/src/schema.ts` -- forward policy and safe incident storage migration/schema.
- `packages/domain/src/youtube-discovery/policy.ts`, `packages/contracts/src/youtube-discovery/index.ts` -- versioned policy values, audit summary, exact closed action queue/cursor contracts.
- `packages/domain/src/youtube-discovery/admin.ts` -- admin queue port, cursor validation, narrow owner read ports.
- `packages/database/src/youtube-discovery/index.ts`, `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- durable typed safe incident classification.
- `packages/database/src/admin-youtube-discovery.ts` -- side-effect-free merged projection, ordering, stale-anchor validation.
- `packages/database/src/knowledge-discovery-signals.ts`, `packages/database/src/knowledge-recommendations.ts` -- owner-safe Mission and Knowledge action inputs.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts` -- protected transport and explicit composition.
- `apps/admin/app/admin-access-gate.tsx`, `apps/admin/app/knowledge/youtube-discovery/` -- default action queue route and worklist.
- `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` -- detail-admitted candidate deep link only.
- `tests/admin-youtube-discovery-contract.test.ts`, `tests/youtube-discovery-action-required.integration.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/admin-youtube-discovery-action-required-ui.test.ts` -- focused safety coverage.

## Tasks & Acceptance

**Execution:**
- [x] Policy/schema/Worker paths -- added forward-migrated, versioned thresholds and closed typed incident classifications that survive retry without storing raw provider data.
- [x] Knowledge owner paths -- published bounded stable Mission stall and high-impact Knowledge-link projections without Discovery table access.
- [x] Contracts/domain/database -- added exact action queue and versioned cursor parsers, then composed a bounded zero-write projection with canonical ordering, age/version semantics, grouped incident clearance, and stale anchor rejection.
- [x] API composition -- injected owner ports, exposed the protected strict `GET /v1/admin/knowledge/youtube-discovery/action-required`, and mapped validation/unsafe errors to closed envelopes.
- [x] Admin UI -- made `/knowledge/youtube-discovery` the navigation default; rendered a Vietnamese action-first list with safe destinations, paged focus/live feedback, calm empty state, and minimal validated Mission/Health shells; admitted candidate deep links through the existing server detail read.
- [x] Tests -- proved exact contracts, policy/audit/migration semantics, owner isolation, zero-write reads, queue eligibility/order/paging, incident transitions, auth/error mapping, and source-level UI transport/accessibility boundaries.

**Acceptance Criteria:**
- Given an authorized operator opens Discovery, when the action queue loads, then only reviewable candidates, aged high-priority review work, stalled high-priority Mission needs, safely classified persistent incidents, and safe high-impact Knowledge links appear; routine history, deferrals, terminal candidates, successes, KPI cards, and unsafe details do not.
- Given a queue row is followed, when it is a candidate, Mission, Health, or Knowledge item, then it reaches only its matching owner surface; a candidate is selected only after current server detail admission, and Discovery does not mutate Knowledge.
- Given queue results are empty or paged through keyboard/assistive technology, when the worklist updates, then it has a calm linked completion state or announces its exact range with predictable focus, visible non-color status text, 44px targets, and narrow sequential reflow.

## Spec Change Log

## Review Triage Log

- 2026-08-11 - Review pass
  - intent_gap: 0
  - bad_spec: 0
  - patch: 11 (high 4, medium 7)
  - defer: 0
  - reject: 0
  - addressed_findings:
    - Repaired deterministic source selection, incident clearance/persistence, policy-aware grouping, owner-safe Mission links, strict closed contract parsing, opaque route validation, and removal of free-form labels.
- 2026-08-11: Verified follow-up repair: Mission queue status now combines a Knowledge-owned opaque missing-context need with Discovery-owned linked-query enablement and latest-success progress, without Discovery querying Knowledge tables or using Knowledge timestamps as progress. Added `mission_no_enabled_query` as a closed Mission reason.
- 2026-08-11: Verified follow-up repair: incident persistence eligibility now uses the latest failed run's persisted failure-count/window semantics and counts only failures sharing those semantics; priority is the most urgent grouped query priority. This prevents an older policy from escalating later failures under a stricter policy.
- 2026-08-11: Verified follow-up repair: action queue item parsing is a closed discriminated union, rejecting invalid kind/destination/reason combinations.
- 2026-08-11: Verified follow-up repair: removed 500-row fail-closed source limits from candidate, incident, Mission, and Knowledge projections. Complete deterministic results paginate through the canonical action tuple.
- 2026-08-11: Final review repair verified: action queue items have no free-form display label. Owner adapters cannot surface provider, source, or Knowledge text; contract parsing rejects label-bearing responses and the admin UI derives Vietnamese copy exclusively from closed kind/reason codes, including `mission_no_enabled_query`.

## Design Notes

`listReview` is deliberately not reusable because it reconciles Knowledge handoffs and writes state. The action queue must reproduce only the authoritative active-candidate predicate in a separate read-only projection. Destination IDs are opaque owner IDs; labels are closed Vietnamese-mappable codes rather than provider or Knowledge-derived free text.

## Verification

**Commands:**
- `pnpm test:unit -- tests/admin-youtube-discovery-contract.test.ts tests/admin-youtube-discovery-action-required-ui.test.ts` -- strict contracts and UI boundaries pass without a database.
- `pnpm test:integration -- tests/youtube-discovery-action-required.integration.test.ts tests/admin-youtube-discovery-api.integration.test.ts` -- serial persistence, ownership, and protected transport checks pass with local resets.
- `pnpm lint` -- no new lint errors.
- `pnpm typecheck` -- strict TypeScript passes.
- `pnpm build` -- production builds pass.
- `git diff --check` -- no whitespace errors.
- 2026-08-11 follow-up verification: `pnpm exec vitest run --project unit tests/admin-youtube-discovery-contract.test.ts` passed (5 tests); `pnpm exec vitest run --project integration tests/youtube-discovery-action-required.integration.test.ts` passed (6 tests); `pnpm typecheck` and `git diff --check` passed.
- 2026-08-11 final-review verification: `pnpm exec vitest run --project unit tests/admin-youtube-discovery-contract.test.ts tests/admin-youtube-discovery-review-ui.test.ts` passed (10 tests); `pnpm exec vitest run --project integration tests/youtube-discovery-action-required.integration.test.ts tests/admin-youtube-discovery-api.integration.test.ts` passed (22 tests); `pnpm typecheck` and `git diff --check` passed.

## Auto Run Result

Status: done

Summary: Discovery now opens on a protected, server-owned action queue for reviewable candidates, stalled Mission needs, persistent typed incidents, and high-impact Knowledge links. The projection is read-only, policy-version-aware, safely paginated, and renders only closed Vietnamese operational codes.

Review: Three independent review passes found and repaired 11 findings. The final repairs removed free-form labels from the transport, completed Mission copy, and added explicit API admission coverage. Follow-up review is not recommended because focused verification covered the repaired paths.

Verification: Focused unit tests passed (10 tests); focused serial action-queue/API integration tests passed (22 tests); `pnpm lint` passed with 46 pre-existing warnings, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. Full unit/integration wrapper commands retain unrelated existing failures recorded in the story notes.

Residual risk: UI boundary tests remain source-oriented; Story 20.5 owns full browser accessibility evidence.
