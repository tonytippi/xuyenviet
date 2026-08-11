---
story_id: 20-4
status: ready-for-dev
created: 2026-08-11
epic: 20
---

# Story 20.4: Control Discovery Enablement Safely

## Story

As an operator,
I want to immediately pause or resume Discovery safely,
so that I can stop new Discovery work during an operational issue without affecting Knowledge capture.

## Acceptance Criteria

1. **Given** an authorized operator changes the global Discovery switch, **when** the server command succeeds, **then** the UI immediately reflects `Đang bật` or `Đang tắt` with persistent text status and an accessible completed-result announcement.
   - Disabling controls Discovery planning, YouTube search, enrichment, triage, candidate writes, and new due-run admission only.
   - It never changes queued Knowledge sources, capture state, a Knowledge claim, or manual `youtube:capture`.
2. **Given** Discovery is disabled while runs are in progress, **when** Health projects safe recent run context, **then** it distinguishes `Đang dừng tác vụ` (a nonterminal run still fenced by the disabled policy), `Đã hủy` (terminal `cancelled` with `policy_revoked`), and `Đã hoàn tất trước khi dừng` (terminal `completed` before the current disabled policy version was created).
   - The switch must reject/disable repeated commands until the prior command has a confirmed server result.
    - Show only bounded, deterministic recent run context while the current policy is disabled; never claim a historical cancellation belongs to the current pause, and never expose provider payloads, source/capture data, prompts, or traveler data.
3. **Given** Discovery is disabled or later re-enabled, **when** schedule state is displayed, **then** disabled state shows no next run and an explicit paused explanation.
   - While disabled, every future-admission Health schedule projection, including planning and enabled-query schedules, returns `nextRunAt: null`; historical run context is never rendered as a future run or retry opportunity.
   - Re-enable projects only newly eligible planning/query work from existing schedule anchors and never reopens terminal cancelled runs.

## Tasks / Subtasks

- [ ] Define closed enablement contracts and safe Health projection (AC: 1-3)
   - [ ] Extend `packages/contracts/src/youtube-discovery/index.ts` with exact-key parsers/types for the global enablement command `{ enabled: boolean }`, a bounded confirmed result `{ enabled, policyVersion, changedAt, changed }`, and safe recent-paused-run context. Reject an absent body, extra keys, malformed types, raw policy values, provider fields, or opaque run internals.
   - [ ] Extend the Health overview with a closed enablement-result/paused-run-context projection. Keep the existing policy, planning, query schedule, and Health fields intact and strictly parsed.
   - [ ] When the current policy is disabled, override future planning and enabled-query schedule projections to `nextRunAt: null` with an explicit paused state/explanation. Preserve safe historical timestamps without presenting them as a scheduled retry.
   - [ ] Define safe paused-run context without a new persistence association or migration. Return at most 20 runs pinned to an earlier policy version: `fencing_requested` applies only to `running` runs with an unexpired lease; `cancelled` applies to terminal `cancelled` runs with `safeErrorCode = policy_revoked`; `completed_before_cancellation` applies only to terminal `completed` runs with `terminalAt < currentDisabledPolicy.createdAt`. Exclude queued/retrying runs, unrelated failures, and items with unavailable required timestamps. This is context around a pause, not evidence that a historical cancellation was caused by the current disabled policy version.
   - [ ] Order paused-run context by closed display group (`fencing_requested`, `cancelled`, `completed_before_cancellation`), then by `claimedAt DESC`, `terminalAt DESC`, or `createdAt DESC` as applicable, then stable run ID ascending. Do not return totals, cursors, raw history, or more than the fixed bound. Do not invent a new persistent run state.
  - [ ] Keep all timestamps canonical UTC ISO milliseconds. Omit any unknown/unavailable item rather than substituting a healthy or successful state.

- [ ] Add one audited versioned global-policy command (AC: 1, 3)
  - [ ] Add one `AdminYoutubeDiscoveryPort` enablement method in `packages/domain/src/youtube-discovery/admin.ts`; do not create a second admin port, generic repository, or client-owned policy state.
   - [ ] Add an authoritative helper in `packages/database/src/youtube-discovery/index.ts` that locks the current policy, maps only its policy-input fields into canonical values, creates exactly one immutable next version with only `enabled` changed, and records the user actor audit in the same transaction. Do not spread a persistence row into a policy parser or insert payload.
   - [ ] Allocate `current.version + 1` only after the current-policy lock is held. If the requested value already equals the locked current policy, return the current confirmed result as an idempotent no-op with no successor, schedule transition, or audit. Never accept a version or use client-local state to decide idempotency.
  - [ ] Never call `createYoutubeDiscoveryPolicyVersion({ policy: { enabled } })` for this command because its parser fills omitted values from defaults. The command must preserve tuned score, cadence, retention, concurrency, retry, and action-queue settings exactly.
  - [ ] Reuse the existing version transition behavior: disabling clears only enabled Discovery proposal `nextDueAt` values, cancels the planning singleton, and records its safe planning audit; re-enabling projects future planning/query boundaries from current schedule anchors without backfill.
   - [ ] Implement the port mutation in `packages/database/src/admin-youtube-discovery.ts`, deriving a real user audit actor from the admitted principal. Expand its injected database/transaction capability only as needed to call the authoritative helper; do not call `getDb()` independently. Do not grant this mutation to system actors or bypass the API capability boundary.

- [ ] Expose the protected strict command (AC: 1)
   - [ ] Add `POST /v1/admin/knowledge/youtube-discovery/enablement` under `AdminYoutubeDiscoveryController`. Preserve controller-level `@RequiresAdminCapability("admin.knowledge.write")`, `@AllowsAdminBrowserSession()`, the existing CSRF/origin enforcement, request principal handling, and safe error envelopes.
  - [ ] Validate body shape before port admission. Anonymous callers remain `401`, non-operator travelers remain `403`, malformed/extra-key requests are `400 { code: "validation_error" }`, and unavailable/unsafe port results are `503 { code: "internal_error" }`.
   - [ ] Parse the port result before returning it. Do not use the generic `call()` helper: invalid/unavailable port results or adapter errors are `503 { code: "internal_error" }`, while only invalid request input is `400 { code: "validation_error" }`. Do not expose a policy row, actor email, query text, provider response, run lease token, or database error.

- [ ] Add the immediate Health switch and durable Vietnamese feedback (AC: 1-3)
  - [ ] Update `apps/admin/app/knowledge/youtube-discovery/health/health.tsx`; replace the read-only `Chính sách Discovery` card with the sole global switch/control. Do not create a settings page, policy editor, modal workflow, or second Health client.
   - [ ] Use the established credentialed `no-store` direct API fetch, `x-request-id`, strict parse-before-render, `AbortController`/sequence fencing, sign-in recovery, and polite live region patterns already in this component and the Queue/Mission surfaces. For the POST command, reuse Mission transport: acquire `/auth/csrf`, then send `content-type`, `x-xuyenviet-csrf`, `x-request-id`, and `Origin`.
   - [ ] Send exactly the closed enablement command, disable the control while pending, retain the last confirmed state if the request fails, immediately render the parsed confirmed command result, then reload/reconcile Health from the server after success. A click must not optimistically claim cancellation before the server confirms the new policy version.
   - [ ] On command, invalid-result, or reconciliation failure, persist and announce Vietnamese-safe retry feedback in the existing status region without claiming Discovery was paused/resumed or work was cancelled. Keep an explicit labelled retry path that resends only the closed command.
  - [ ] Persist visible Vietnamese boundary copy: `Discovery đang tắt. Hệ thống sẽ không tìm hoặc triage video mới.` and `Nguồn Knowledge đang chờ xử lý và YouTube Capture thủ công không bị ảnh hưởng.` Use `Đang bật`, `Đang tắt`, `Đang dừng tác vụ`, `Đã hủy`, and `Đã hoàn tất trước khi dừng` as text plus non-color cues.
   - [ ] Keep map-paper/green/amber styling, border-first layout, visible focus, `aria-live`, `min-h-11`/44px controls, and `min-w-0` sequential narrow/mobile reflow. This bounded switch is immediate and does not use a confirmation dialog, modal, or multi-step ritual. A toast may confirm the command but cannot replace persistent inline status.

- [ ] Preserve Worker-owned fence and terminal semantics (AC: 2-3)
  - [ ] Do not add an API/admin cancellation loop. Preserve `packages/worker-domain/src/features/youtube-discovery/execution.ts` as the sole scheduled execution owner and retain its pre-provider/pre-write/retry/current-policy fence calls.
  - [ ] Preserve `cancelYoutubeDiscoveryRunIfDisabled`, `finishYoutubeDiscoveryRun`, fenced candidate writes, and retry behavior in `packages/database/src/youtube-discovery/index.ts`. A revoked active run becomes terminal `cancelled` with safe error `policy_revoked` and exactly one terminal audit.
   - [ ] Do not reopen a terminal cancelled run on re-enable. Existing old-policy queued/retrying work may be claimed only to reach the canonical fence; it must not execute provider work, candidate writes, enrichment, triage, retry requeue, or terminal revival. Re-enable schedules only newly eligible planning/query work under the new policy version.

- [ ] Verify authorization, policy preservation, fencing, and UI safety (AC: 1-3)
   - [ ] Extend `tests/admin-youtube-discovery-contract.test.ts` for strict closed command/result and paused-run context parsing, exact timestamps/version/list bounds, closed status rejection, and forbidden-field rejection. Extend `tests/youtube-discovery-policy.test.ts` only for DB-free policy-copy/normalization behavior.
   - [ ] Extend `tests/youtube-discovery-foundation.integration.test.ts` with serial PostgreSQL evidence that the command creates an immutable successor, preserves every non-enable policy value, retains one current version, records the user audit, clears only Discovery schedules on disable, and projects future boundaries on re-enable without backfill. Use two physical connections to prove monotonic unique version allocation, same-state idempotency, and serialized opposite commands.
  - [ ] Extend `tests/youtube-discovery-execution.integration.test.ts` to drive the operator command through active/provider/write/retry fence races; assert no later Discovery graph/provider work, exactly one terminal cancellation audit, and no revival of cancelled runs after enablement returns.
   - [ ] Extend `tests/youtube-discovery-health.integration.test.ts` for disabled `nextRunAt: null` on both planning and query schedules, bounded deterministic paused-run context, unavailable-safe behavior, and zero Knowledge/capture side effects. Separate select-only Health-read snapshots from enablement-command allowed-write assertions; prove neither path invokes Knowledge handoff, capture eligibility, manual `youtube:capture`, provider, or Gateway/triage ports.
   - [ ] Extend `tests/admin-youtube-discovery-api.integration.test.ts` for operator success/principal forwarding, all port doubles implementing the new method, anonymous `401`, traveler `403`, CSRF/origin denial, strict body rejection before port admission, and invalid/unavailable result failure mapping.
   - [ ] Extend `tests/admin-youtube-discovery-health-ui.test.ts` for typed command/result parsing, pending duplicate-command guard, persistent Vietnamese state/boundary and safe retry text, `aria-live`, focus/44px controls, server reconciliation, failure retaining the confirmed state, and absence of direct Knowledge/capture/Gemini requests.
  - [ ] Run `pnpm test:unit` for DB-free tests and `pnpm test:integration` for serial PostgreSQL/API suites. Then run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Every clean-table integration case calls `resetTestDatabase()` locally; do not add a global reset hook or enable parallel integration workers.

## Dev Notes

### Scope and sequencing

- Story 18.1 established the versioned policy; Story 18.2 established scheduling and Worker revocation fences. Reuse them. Story 20.4 owns the authorized global command, switch UI, and safe paused-run-context projection; it is not a policy-editor or Worker rewrite.
- Story 20.3 provides Health reads. Extend its typed Health contract/UI rather than adding a parallel route or raw operational stream. Story 20.5 owns final cross-control-tower accessibility and end-to-end boundary evidence.
- Discovery is URL-only. It cannot create Knowledge sources, capture versions, ingestion jobs, evidence, cards, source links, publication state, or invoke/schedule/retry manual `youtube:capture`.

### Existing implementation to preserve

- `createYoutubeDiscoveryPolicyVersion()` already serializes current-policy replacement and owns disable/re-enable schedule transitions. Its partial-input default behavior is unsuitable for an operator toggle unless the current policy is first copied. Preserve policy-first then planning-lease lock ordering to avoid a Worker deadlock.
- `packages/database/src/youtube-discovery/index.ts#cancelYoutubeDiscoveryRunIfDisabled` is the canonical current-policy/lease fence. `finishYoutubeDiscoveryRun`, candidate persistence, and retry/requeue use the same guard. Do not duplicate cancellation in a browser/API request.
- The policy table has immutable-version and one-current constraints; direct current policy updates are prohibited. This story deliberately has no durable per-disable-command association or migration: paused-run context is safe historical context, not an attribution claim for the current pause.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` is the only Discovery admin API namespace. Use its strict parse, authentication, and safe-envelope conventions.
- `apps/admin/app/knowledge/youtube-discovery/health/health.tsx` already owns the Health fetch, status live region, abort/sequence fencing, and safe display. Extend it in place.

### Project Structure Notes

- Expected production paths: `packages/contracts/src/youtube-discovery/index.ts`, `packages/domain/src/youtube-discovery/admin.ts`, `packages/database/src/youtube-discovery/index.ts`, `packages/database/src/admin-youtube-discovery.ts`, `apps/api/src/admin/admin-youtube-discovery.controller.ts`, and `apps/admin/app/knowledge/youtube-discovery/health/health.tsx`.
- Expected tests: `tests/youtube-discovery-policy.test.ts`, `tests/youtube-discovery-foundation.integration.test.ts`, `tests/youtube-discovery-execution.integration.test.ts`, `tests/youtube-discovery-health.integration.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, and `tests/admin-youtube-discovery-health-ui.test.ts`.
- No new dependency, migration, policy editor, Worker loop, admin-owned persistence seam, Knowledge writer, source/capture handoff, raw telemetry/event store, chart/dashboard library, or manual-capture scheduler is permitted.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 20.4]
- [Source: _bmad-output/implementation-artifacts/epic-20-context.md#Requirements & Constraints]
- [Source: _bmad-output/implementation-artifacts/20-3-deliver-automation-health-and-safe-incident-detail.md#Scope and sequencing]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1 through AD-8]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/EXPERIENCE.md#Global Discovery switch and State Patterns]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/DESIGN.md#Global Discovery switch]
- [Source: packages/database/src/youtube-discovery/index.ts#createYoutubeDiscoveryPolicyVersion]
- [Source: packages/database/src/youtube-discovery/index.ts#cancelYoutubeDiscoveryRunIfDisabled]
- [Source: packages/worker-domain/src/features/youtube-discovery/execution.ts#runYoutubeDiscoveryPoll]
- [Source: packages/domain/src/youtube-discovery/admin.ts#AdminYoutubeDiscoveryPort]
- [Source: apps/api/src/admin/admin-youtube-discovery.controller.ts]
- [Source: apps/admin/app/knowledge/youtube-discovery/health/health.tsx]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story analysis completed 2026-08-11 using full sprint status, Epic 20 context, Story 20.3 guide, Discovery architecture/UX, current contracts/domain/database/API/admin/Worker code, focused integration tests, and recent Git history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story status is ready-for-dev. No implementation, migration, database reset, test execution, or commit was performed while creating this story.
- The guide requires immutable copy-on-toggle policy versions, preserving all existing tuning; it reuses current Worker fencing and does not add request-path cancellation.
- The guide resolves paused-run display through a bounded server projection derived from durable policy/run facts, avoiding a migration or a fake persistent `fencing_requested` state.
- Story validation applied 2026-08-11: the no-migration approach intentionally renders only bounded paused-run context, not causal attribution to the current pause; command idempotency, version allocation, closed transport, schedule nulling, Worker-fence semantics, safe retry UX, and focused contract/integration coverage are explicit.

### File List

- _bmad-output/implementation-artifacts/20-4-control-discovery-enablement-safely.md
