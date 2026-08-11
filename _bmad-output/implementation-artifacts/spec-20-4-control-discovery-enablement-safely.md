---
title: 'Control Discovery Enablement Safely'
type: 'feature'
created: '2026-08-11'
baseline_revision: 'd92a4cb'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-20-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Operators can read Discovery policy in Health but cannot immediately and safely stop or resume Discovery during an operational issue. Health also lacks bounded, truthful context for work affected by a disabled policy, and old-policy work can otherwise pass a fence after a later re-enable.

**Approach:** Add one audited immutable-policy enablement command through the existing protected Discovery admin boundary, extend the established Health projection with safe disabled-state context, and turn the existing policy card into the sole immediate Vietnamese-first control. Preserve Worker-owned cancellation and make its canonical fence reject stale-policy runs.

## Boundaries & Constraints

**Always:** Use exact-key request/result contracts and canonical UTC ISO-millisecond timestamps. A toggle locks the current policy, copies every existing policy input explicitly, changes only `enabled`, creates one immutable successor and user audit in the same transaction, and allocates the next version only while locked. The same-state command is an audited-free idempotent no-op. Disabling clears only enabled Discovery proposal scheduling and planning work; re-enabling projects only new work from existing anchors. While disabled, both planning and enabled-query `nextRunAt` values are null with explicit paused context. Project at most 20 safe paused-run records from durable facts, in a deterministic group/time/ID order; omit incomplete records. A stale policy version is revoked at the existing Worker fence and reaches the existing terminal-cancellation behavior without provider calls, writes, retries, or revival. The API validates before port admission and maps unsafe results or adapter failures to safe `503` responses. The UI keeps the last confirmed state, prevents duplicate commands while pending, parses every response, reconciles Health after success, and gives persistent Vietnamese status, boundary, error, retry, and polite live feedback.

**Block If:** The current policy cannot be copied through its authoritative parsed fields without changing a non-enable value, or the existing transactional/audit seam cannot create the required immutable successor and user audit atomically.

**Never:** Add a migration, policy editor, second port/client/Health surface, admin/API cancellation loop, direct UI database access, client-owned policy state, raw policy row/payload, unbounded run history, causal association for a particular pause, new run state, Knowledge/source/capture writer or scheduler, provider/Gateway/triage call, or manual `youtube:capture` change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Toggle disabled | Authorized operator posts exact `{ enabled: false }` with a different current state | Immutable successor preserves all tuning, audits the actor, clears only Discovery schedules, and returns parsed confirmed state/version/time | Adapter or result parse failure is safe `503`; no response leaks persistence/provider data |
| Repeated current state | Authorized operator requests current `enabled` value | Return the locked confirmed state with `changed: false`; create no successor, schedule transition, or audit | Never decide from client state/version |
| Disabled Health | Current policy disabled, schedules and historical runs available | Planning/query next runs are null with paused explanation; return at most 20 grouped safe records: leased running fence requested, `policy_revoked` cancellation, or completed before disabled-policy creation | Exclude queued/retrying, unrelated failures, unavailable timestamps, totals, cursors, and unsafe fields |
| Disable then re-enable race | A queued/retrying run retains an earlier policy version | It may reach the canonical fence only to become terminal cancelled; it performs no provider work, Discovery write, retry requeue, or terminal revival | Treat non-current policy as revoked even when the new current policy is enabled |
| Invalid command/UI failure | Missing/extra/malformed request, unavailable result, command/reconciliation failure | Request body is `400 validation_error`; UI retains last confirmed state, announces safe retry feedback, and explicit retry resends only the closed command | Anonymous/traveler/CSRF-or-origin protections retain existing `401`/`403` denial behavior |

</intent-contract>

## Code Map

- `packages/contracts/src/youtube-discovery/index.ts` -- existing exact parser boundary for new enablement command/result, paused-run records, and extended Health projection.
- `packages/domain/src/youtube-discovery/admin.ts` -- sole `AdminYoutubeDiscoveryPort` capability to extend with the enablement mutation.
- `packages/database/src/youtube-discovery/index.ts` -- immutable policy transition, schedule behavior, and canonical Worker cancellation fence.
- `packages/database/src/admin-youtube-discovery.ts` -- PostgreSQL port adapter, transactional actor-admitted toggle, and select-only Health projection.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- protected Discovery namespace and safe strict transport envelopes.
- `apps/admin/app/knowledge/youtube-discovery/health/health.tsx` -- existing typed Health request, reconciliation, status region, and policy card to replace in place.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- existing scheduled execution caller whose pre-provider/pre-write/retry fences must remain its only control owner.
- `tests/admin-youtube-discovery-contract.test.ts`, `tests/youtube-discovery-policy.test.ts`, `tests/youtube-discovery-*.integration.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/admin-youtube-discovery-health-ui.test.ts` -- focused contract, policy, serial safety, API, and UI evidence seams.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/youtube-discovery/index.ts` -- add closed enablement command/result and paused-run contracts; extend Health parsing with disabled schedule/context fields while rejecting raw/extra/unknown data.
- [x] `packages/domain/src/youtube-discovery/admin.ts`, `packages/database/src/youtube-discovery/index.ts`, `packages/database/src/admin-youtube-discovery.ts` -- add one principal-attributed copy-on-toggle port path, preserve all policy inputs and immutable schedule semantics, project bounded paused context, and revoke stale-policy runs at the existing fence.
- [x] `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- expose the guarded enablement POST route with dedicated pre-admission body parsing and safe response/error mapping.
- [x] `apps/admin/app/knowledge/youtube-discovery/health/health.tsx` -- replace the read-only policy card with one accessible immediate switch, confirmed/retry/reconciliation handling, disabled boundary copy, and safe paused-run presentation.
- [x] `tests/` -- prove strict contracts, policy copying/idempotency/serialization, schedule and Worker race fences, select-only Health safety, protected API mapping, and Health UI accessibility/failure behavior.

**Acceptance Criteria:**
- Given an authorized operator changes the global Discovery switch, when the command succeeds, then Health immediately shows persistent `Đang bật` or `Đang tắt` state and an accessible confirmed-result announcement without altering Knowledge or manual capture.
- Given Discovery is disabled with active or historical runs, when Health loads, then it truthfully distinguishes fencing requested, policy-revoked cancellation, and completion before the disabling policy while exposing only bounded safe context.
- Given Discovery is disabled or re-enabled, when schedules and old runs are processed, then disabled projections contain no next run, re-enable creates only newly eligible work, and terminal or stale-policy runs never revive or execute.

## Design Notes

The enablement command must not call the partial-policy creation API with `{ enabled }`, because that parser supplies defaults for omitted tuning. The authoritative helper instead derives a complete canonical policy input from the locked current record, changes one field, and uses the existing transition path. Paused context is historical correlation rather than attribution: a `policy_revoked` cancellation may predate the current disable version, so it must not be labelled as caused by that current action.

## Verification

**Commands:**
- `pnpm test:unit -- tests/admin-youtube-discovery-contract.test.ts tests/youtube-discovery-policy.test.ts tests/admin-youtube-discovery-health-ui.test.ts` -- expected: strict contract/policy/UI suites pass without database configuration.
- `pnpm test:integration -- tests/youtube-discovery-foundation.integration.test.ts tests/youtube-discovery-execution.integration.test.ts tests/youtube-discovery-health.integration.test.ts tests/admin-youtube-discovery-api.integration.test.ts` -- expected: serial PostgreSQL safety/API evidence passes; clean-table cases reset locally.
- `pnpm test:unit` -- expected: all infrastructure-free tests pass.
- `pnpm test:integration` -- expected: serial database suite passes.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm build` -- expected: production build succeeds.
- `git diff --check` -- expected: no whitespace errors.

## Review Triage Log

### 2026-08-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6 (high 1, medium 5, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Added CSRF-token acquisition and origin headers before the enablement POST so protected browser admission permits the command.
  - `[medium]` `[patch]` Applied a confirmed enablement result to local Health state before reconciliation so a refresh failure cannot revert the visible confirmed state.
  - `[medium]` `[patch]` Read paused context from all Discovery runs rather than only proposal-backed Health runs, preserving the select-only safe projection.
  - `[medium]` `[patch]` Retained the persisted planning lease timestamp invariant and made disabled future scheduling null only in the Health projection, avoiding an out-of-scope migration.
  - `[medium]` `[patch]` Revoked expired runs from non-current or disabled policies with one `policy_revoked` terminal audit rather than requeueing or failing them.
  - `[medium]` `[patch]` Restored and verified the required Vietnamese paused-state and Knowledge/manual-capture boundary copy.

### 2026-08-11 — Final review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3 (medium 3)
- defer: 1 (medium 1)
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Ordered and bounded paused-run context after grouping, using claimed time for active fences and terminal time for historical records.
  - `[medium]` `[patch]` Excluded expired/unclaimed running records from paused context and retained only the closed safe public fields.
  - `[medium]` `[patch]` Added a labelled retry that resends the exact saved enablement command after a command or reconciliation failure.

## Auto Run Result

Status: done

Summary: Added the protected, audited global Discovery enablement command and immediate Health control. The command creates immutable copy-on-toggle policy versions, preserves all non-enable tuning, is idempotent for the current value, and reuses existing schedule transitions. Health now renders disabled schedule projections with no future run, bounded safe paused-run context, Vietnamese boundary/status feedback, and a resilient retry path. Worker-owned fences now terminally revoke stale-policy work after a disable/re-enable cycle.

Files changed: Discovery contracts, admin port and PostgreSQL adapter, policy/fence repository, protected API controller, Vietnamese Health UI, focused contract/UI/API/Health/execution integration tests, and Epic 20/Story 20.4 BMad artifacts.

Review: Two independent review passes repaired nine findings across CSRF transport, confirmation/retry behavior, paused-run source/order/timestamps, immutable planning storage, and stale-policy expiry fencing. A follow-up review is recommended because the final repairs span authorization transport, persistence projections, and execution safety.

Verification: Focused unit contracts/UI passed (341 tests). Serial integration execution passed (35 tests), Health passed (15 tests), and protected API passed (19 tests). `pnpm typecheck`, `pnpm lint` (0 errors, 53 existing warnings), `pnpm build`, and `git diff --check` passed. The focused foundation integration suite has one pre-existing compact policy-audit-summary expectation drift unrelated to this story; the test target otherwise passed 20 of 21 cases. Integration suites were run serially after an accidental concurrent invocation demonstrated the documented shared-database deadlocks.

Residual risk: The enablement UI has component-boundary coverage rather than browser E2E; Story 20.5 owns integrated control-tower accessibility proof. The repository-wide integration script ignores path selectors and includes unrelated existing failures.
