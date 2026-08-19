---
title: 'Story 23.3: Run Confirmed Queries Immediately And Show Progress'
type: 'feature'
created: '2026-08-18'
status: 'done'
review_loop_iteration: 0
baseline_commit: '8637fb9'
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-23-context.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** A valid province suggestion or operator-created Discovery query can currently be saved but waits for scheduled cadence. Operators cannot safely tell whether an immediate search is queued, running, complete, failed, or ready for the existing video-review flow.

**Approach:** Add an operator-confirmed, idempotent immediate-run admission command and a query-scoped safe progress projection. Admission reuses the existing run and Worker execution path; the existing Mission query view surfaces the result and links reviewable videos to the shipped review flow.

## Boundaries & Constraints

**Always:** A browser creates one bounded idempotency key per explicit confirmation. Repeating that key returns the same immediate run; a later explicit confirmation may create another run after the prior run is terminal. Admission locks and requires both current globally enabled Discovery policy and enabled query, creates no provider work in API/admin, and does not alter `nextRunAt` or scheduled cadence. Immediate admission bypasses scheduled candidate-backlog admission only; existing Worker claim concurrency, leases, fences, cancellation, retries, candidate-job processing, canonical-candidate appearance handling, and terminal transitions remain authoritative. Project only run state `queued | running | completed | failed | cancelled`, bounded timestamps/retry count/candidate and job-state counts, enumerated safe error/retry context, and review availability. Preserve operator command attribution and system executor attribution for automated work.

**Ask First:** Replacing the per-confirmation idempotency identity; changing candidate-backlog policy beyond immediate admission; changing worker concurrency, retry/fence semantics, scheduled cadence, or retention; introducing a new review page or any new Knowledge/capture/publication behavior.

**Never:** Call YouTube or a provider from API/admin; create a second Worker path, service, queue, scheduler, run framework, raw diagnostic projection, raw prompt/response/provider payload, source/evidence/traveler content; start, schedule, or retry `youtube:capture`; create Knowledge records or authorize publication.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Immediate confirmation | Enabled policy and enabled query, new valid idempotency key | One queued immediate run is returned without waiting for `nextRunAt`; Worker later claims it through existing path | API performs no search; normal Worker concurrency controls when it starts |
| Duplicate delivery | Same operator, query, and idempotency key retried sequentially or concurrently | Returns the original run and records one admission/audit outcome | No duplicate run or candidate work |
| Revoked admission | Global Discovery disabled or query paused | No run is created | Safe Vietnamese recovery state; no provider call or unsafe audit payload |
| Progress and review | Immediate run/jobs are queued, active, retrying, terminal, or have reviewable candidates | Query view shows bounded safe progress; `Xem video` enters existing review flow only when candidates are reviewable | Raw errors/payloads never render; unavailable projection fails closed |

</frozen-after-approval>

## Code Map

- `packages/database/src/schema.ts` -- `youtubeDiscoveryRuns` currently has uniqueness only for non-null scheduled intervals; add the smallest durable immediate confirmation identity and conflict rule needed for same-confirmation idempotency.
- `drizzle/migrations/0075_*.sql` -- forward migration for the immediate-run identity/index only; preserve existing scheduled rows and interval uniqueness.
- `packages/database/src/youtube-discovery/index.ts` -- reuse `createYoutubeDiscoveryRun()`, policy/query row locks, run snapshots, audits, and claim/fence lifecycle; add one transactional immediate admission primitive without changing scheduled admission.
- `packages/database/src/admin-youtube-discovery.ts` -- implement operator-owned admission and query-scoped safe run/job progress projection, using existing admin-port transaction and audit patterns.
- `packages/domain/src/youtube-discovery/admin.ts` -- extend `AdminYoutubeDiscoveryPort` with typed immediate admission and safe progress reads.
- `packages/contracts/src/youtube-discovery/index.ts` -- exact-key, bounded parsers/types for idempotency command/result and safe query progress; reject unsafe states, counts, timestamps, and diagnostic fields.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- capability-protected, CSRF-protected POST admission and query progress endpoint; parse before invoking the domain port and reject invalid projections.
- `apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx` -- replace Story 23.2 scheduled-only handoff copy with `Chạy ngay`, retain drafts/focus/live-region patterns, render Vietnamese safe status/progress, and route `Xem video` to existing review.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- read-only reuse evidence: `runYoutubeDiscoveryPoll()` remains the only execution entrypoint.
- `tests/admin-youtube-discovery-contract.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/youtube-discovery-execution.integration.test.ts`, `tests/youtube-discovery-mission.integration.test.ts`, `tests/admin-youtube-discovery-mission-ui.test.ts` -- existing strict-contract, serial reset, Worker, Mission, API, and accessibility test homes.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/schema.ts` and `drizzle/migrations/0076_add_youtube_discovery_immediate_confirmations.sql` -- persist a bounded operator/query confirmation identity on immediate runs with a conflict-safe uniqueness rule -- proves retry idempotency without collapsing later intentional runs or scheduled cadence.
- [x] `packages/contracts/src/youtube-discovery/index.ts` and `packages/domain/src/youtube-discovery/admin.ts` -- define strict immediate-admission and safe query-progress contracts/port methods -- keeps browser/API/domain boundaries fail-closed.
- [x] `packages/database/src/youtube-discovery/index.ts` and `packages/database/src/admin-youtube-discovery.ts` -- admit or return the same immediate run under existing policy/query locks; project only bounded run/job/review data -- reuses the canonical Worker lifecycle and preserves attribution.
- [x] `apps/api/src/admin/admin-youtube-discovery.controller.ts` and API composition -- expose protected admission/progress endpoints -- keeps authorization, CSRF, origin, validation, and safe-response handling at the existing Nest boundary.
- [x] `apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx` -- provide accessible Vietnamese `Chạy ngay`, status/progress, retry recovery, and existing-review link behavior -- keeps operator drafts and all controls usable on narrow layouts.
- [x] Focused contract, integration, execution, API, and Mission UI tests -- cover matrix cases, Worker-path reuse, no-capture/no-Knowledge invariant, and accessibility -- prove cross-layer behavior without a new execution path.

**Acceptance Criteria:**
- Given a valid new confirmation for an enabled query, when immediate admission commits, then exactly one queued run has an immediate identity and the scheduled `nextRunAt` remains unchanged.
- Given the Worker polls after immediate admission, when capacity permits, then it claims and processes that run through the existing search, appearance, candidate-job, retry, cancellation, and terminal lifecycle.
- Given a malformed, foreign, duplicate-unsafe, paused, or globally disabled request, when API/domain validation runs, then no run/provider/candidate/Knowledge/capture work is created and only a safe failure response is returned.
- Given the query view receives a safe immediate-progress projection, when status changes or reviewable candidates exist, then it announces practical Vietnamese status and exposes `Xem video` only to the existing review flow.

## Design Notes

The durable confirmation identity is scoped to the operator and query, so a network retry cannot create duplicate work. It is intentionally distinct from a scheduled interval, allowing immediate and scheduled runs to coexist while preserving the existing scheduled uniqueness rule. Immediate admission does not wait for `nextRunAt` or scheduled candidate backlog, but it never grants execution priority or bypasses Worker claim capacity.

## Verification

**Commands:**
- `pnpm test:unit -- tests/admin-youtube-discovery-contract.test.ts tests/admin-youtube-discovery-mission-ui.test.ts` -- expected: strict safe contracts and accessible immediate-run UI pass without database configuration.
- `pnpm test:integration -- tests/admin-youtube-discovery-api.integration.test.ts tests/youtube-discovery-execution.integration.test.ts tests/youtube-discovery-mission.integration.test.ts` -- expected: serial PostgreSQL admission, idempotency, authorization, Worker reuse, safe projection, and no-capture/Knowledge side effects pass.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: API and admin production builds succeed.

## Implementation Evidence

- Immediate confirmation identity is nullable for scheduled/legacy runs and uniquely scoped to query, operator, and one browser confirmation key.
- Immediate admission locks current policy and query, preserves `nextDueAt`, uses the existing run writer/audit/Worker claim path, and returns the original run on retry.
- The Mission keeps a confirmation key until admission and safe progress both succeed; `Làm mới tiến độ` reads existing immediate-run progress without admitting new work.
- Focused unit verification passed: 43 files, 376 tests. Focused serial integration verification passed: 2 files, 5 tests. `pnpm typecheck`, `pnpm lint` (existing warnings only), `pnpm build`, and `git diff --check` passed.
- Full `pnpm test:integration` exceeded 900 seconds after unrelated existing failures in `tests/admin-facebook-capture-rerun.test.ts`, `tests/ai-ask-stream-execution.test.ts`, and `tests/browser-identity.integration.test.ts`.

## Suggested Review Order

**Admission And Durable Identity**

- Start with transactional query/policy locks and active-run/idempotency handling.
  [`admin-youtube-discovery.ts:256`](../../packages/database/src/admin-youtube-discovery.ts#L256)

- Verify the nullable identity pair and operator-scoped unique key at the database boundary.
  [`0076_add_youtube_discovery_immediate_confirmations.sql:1`](../../drizzle/migrations/0076_add_youtube_discovery_immediate_confirmations.sql#L1)

- Confirm the strict safe browser/API projection permits only five public states.
  [`youtube-discovery/index.ts:66`](../../packages/contracts/src/youtube-discovery/index.ts#L66)

**Execution And Operator Flow**

- Confirm the existing Worker order and lifecycle remain the sole execution path.
  [`execution.ts:27`](../../packages/worker-domain/src/features/youtube-discovery/execution.ts#L27)

- Review explicit suggestion/query immediate admission, retry-safe drafts, and safe progress rendering.
  [`mission.tsx:340`](../../apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx#L340)

- Check Nest protects admission and safe run inspection before invoking the domain port.
  [`admin-youtube-discovery.controller.ts:34`](../../apps/api/src/admin/admin-youtube-discovery.controller.ts#L34)

**Proof**

- Follow idempotency, actor attribution, Worker lifecycle, progress, and no-Knowledge side-effect regressions.
  [`story-23-3-immediate-runs.integration.test.ts:14`](../../tests/story-23-3-immediate-runs.integration.test.ts#L14)

- Check protected API admission/progress response validation and browser-session enforcement.
  [`admin-youtube-discovery-api.integration.test.ts:119`](../../tests/admin-youtube-discovery-api.integration.test.ts#L119)
