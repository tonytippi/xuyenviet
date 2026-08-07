---
story_id: 18-2
status: ready-for-dev
created: 2026-08-07
epic: 18
---

# Story 18.2: Execute Fenced Scheduled Discovery Runs

## Story

As an operator,
I want Discovery runs to execute and recover safely in the Worker,
so that scheduled search work cannot overlap, outlive a kill switch, or silently fail.

## Acceptance Criteria

1. **Given** the Worker runtime starts, **when** Discovery is registered as a finite `youtube-discovery` adapter, **then** its readiness and safe telemetry participate in the existing Worker runtime contracts.
   - It must not create a continuous request-serving loop or schedule, invoke, enqueue, or retry `youtube:capture`.

2. **Given** a pre-existing planning or due-query run is eligible, **when** the Worker claims it, **then** it uses PostgreSQL lease, fencing, immutable policy-version snapshot, and the closed states `queued | running | retrying | completed | failed | cancelled`.
   - Stale or duplicate workers cannot write a later stage result, terminal state, or terminal audit.
   - Only the Worker advances nonterminal states; terminal runs never reopen. Expired nonterminal leases return to `queued`, unless the snapshotted retry limit is exhausted and the run becomes terminal `failed`.

3. **Given** an operator disables Discovery while a run is claimed, **when** the Worker reaches a provider-call, Discovery-write, or retry/requeue-write boundary, **then** it reads current global enablement under the matching active lease and transitions revoked work to `cancelled`.
   - The cancellation and its one safe terminal audit/telemetry outcome occur atomically behind the lease/fence. No further Discovery work follows.
   - Global disable affects Discovery only. Do not alter Knowledge intake, queued Knowledge sources, or manual capture.

4. **Given** a documented provider/API stage fails transiently, **when** the run remains retryable, **then** it persists a bounded exponential-backoff retry using the run's snapshotted retry settings and a closed safe error code.
   - Exhausted work becomes terminal `failed` with exactly one safe audit/telemetry outcome; later eligible scheduled runs remain independent.
   - This story provides only the execution/fence shell. A normally claimed pre-existing run completes after its final active-lease/current-enable fence succeeds and no stage work is registered; it must emit the corresponding safe completed outcome without provider or Discovery candidate writes.
   - For fence and retry tests only, use a narrowly named injectable internal execution-stage seam. It may return a closed test-safe transient outcome but must not create a provider client, credential, request, response parser, candidate write, public export, or generic workflow framework. Real provider-stage behavior belongs to Story 18.4.

## Tasks / Subtasks

- [ ] Extend the Discovery run persistence contract for safe leasing and scheduling (AC: 2-4)
  - [ ] Add only the run fields, database checks, and indexes needed for due/retry eligibility (`nextRunAt`), claim owner/time/expiry, fencing token, attempt count, immutable non-null policy snapshots (`maxRetryAttempts`, `retryDelayMinutes`, and `maxConcurrentRuns`), and terminal time/outcome/safe error code in `packages/database/src/schema.ts`.
  - [ ] Create migration `0046_<discovery-run-execution>` unless the append-only journal has advanced before implementation; then use the next sequential number. Preserve 0044/0045 history; Drizzle remains the sole migration authority.
  - [ ] Keep the policy-version reference and all execution snapshots immutable. Use PostgreSQL time for claim/recovery eligibility, range-check snapshot values against the policy limits, and enforce the following state shapes in the database where practical:
    - `queued`: no lease/fence; eligible at `nextRunAt`.
    - `running`: worker ID, fence token, claim time, and unexpired lease are all present; no terminal fields.
    - `retrying`: no active lease/fence; future `nextRunAt`; closed retry error code present; no terminal fields.
    - `completed | failed | cancelled`: no active lease/fence; immutable terminal timestamp and closed outcome present; `failed` requires a closed safe error code.

- [ ] Add narrow Discovery-owned claim, recovery, fence, and terminal-transition operations (AC: 2-4)
  - [ ] Extend `packages/database/src/youtube-discovery/` rather than adding a generic job framework. Reuse the existing current-policy admission guard and `createSystemAuditActor("system-youtube-discovery")`.
  - [ ] Recover expired `running` claims before normal claiming. Recoverable rows return to `queued`; exhausted rows terminally fail. `retrying` rows have no lease and become eligible only at `nextRunAt`.
  - [ ] In one `--once` poll, recover bounded expired rows for maintenance/audit and claim exactly one eligible new run in a short transaction with `FOR UPDATE SKIP LOCKED`, a validated worker ID, a fresh random fence token, database-clock lease expiry, and the run's immutable execution snapshots. Respect snapshotted `maxConcurrentRuns` without starting extra child processes or adding a scheduler.
  - [ ] Fence completion, cancellation, retry/requeue, and every later Discovery-owned result write on run ID, `running` state, matching token, and unexpired lease. Treat a guarded update affecting no rows as contention, never success.
  - [ ] Read current policy enablement under the active lease before every injectable execution-stage boundary and Discovery mutation boundary. A newer enabled policy does not cancel a valid pinned run solely because its version differs; only current disable revokes it. The no-provider shell's final fence is its completion boundary.
  - [ ] Define and validate the only lifecycle safe codes: `stage_transient`, `retry_exhausted`, `lease_retry_exhausted`, and `policy_revoked`; use `completed`, `failed`, and `cancelled` as the only terminal outcomes. A zero-row guarded write returns `contended` and writes nothing.
  - [ ] Use `recordAuditEvent` inside the same guarded transaction as each terminal transition. Insert exactly one terminal-transition audit per run, separate from the existing run-creation audit. Persist only explicit bounded scalar fields such as policy version, state/outcome, attempt count, and safe error code. Never include query text, URLs, provider errors/payloads, prompts, source material, or arbitrary JSON.

- [ ] Implement the finite Worker adapter and safe telemetry integration (AC: 1-4)
  - [ ] Register `youtube-discovery` in `apps/worker/src/runtime.ts` as another independently compiled `--once` child adapter. Preserve the supervisor's serial admission, readiness, drain, and child-process lifecycle.
  - [ ] Add the compiled `discovery.mjs` artifact to `apps/worker/package.json` using the existing shared adapter-entrypoint pattern.
  - [ ] Extend `packages/worker-domain/src/adapters.ts` parsing, dispatch, and capability mapping for `discovery --once --worker-id=<safe-id>` only. A normal no-work poll must emit a valid observation and exit successfully.
  - [ ] Extend the allowlisted Worker telemetry contracts with the Discovery capability. Reuse existing safe result codes and observation fields; do not add arbitrary error/payload telemetry.
  - [ ] Implement one finite Discovery poll that recovers bounded expired claims, claims at most one new eligible run, executes the no-provider shell or narrowly injected test seam, observes no-work/contended/retry/success/failure/cancelled outcomes, and returns. Do not create a Discovery-owned infinite loop or HTTP/request handler.

- [ ] Verify fencing, revocation, recovery, observability, and Worker integration (AC: 1-4)
  - [ ] Add DB-free unit tests for adapter arguments, no-work/readiness-safe observations, bounded backoff/cap/exhaustion, terminal summary safety, and telemetry schema validation. Inject time/randomness where needed; do not sleep in tests.
  - [ ] Extend Worker runtime and compiled adapter boundary tests to prove Discovery registration, readiness participation, draining behavior, `discovery.mjs`, and safe `youtube.discovery` observations.
  - [ ] Add serial PostgreSQL integration coverage using local `resetTestDatabase()` setup for claim/recovery/transition behavior. Use separate physical connections to prove concurrent workers claim disjoint runs.
  - [ ] Prove a stale claimant after lease reclaim cannot complete, cancel, retry, write a later Discovery result, or create a second terminal audit.
  - [ ] Prove disable-before-injected-stage, disable-before-write, and disable-before-requeue cancel safely with no continuation; prove retry/backoff/exhaustion and later-run independence; prove exactly one system-attributed terminal-transition audit per terminal run in addition to its initial run-creation audit.
  - [ ] Run focused `pnpm test:unit` and `pnpm test:integration` selections, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact failures rather than claiming unrun verification.

## Dev Notes

### Scope and sequencing

- Story 18.1 is complete and supplies the Discovery policy, query-proposal and minimal run records, current-policy admission, system actor, Audit boundary, and initial migration history. Extend those ownership boundaries; do not replace them.
- "Planning or due-query run" here means a run already admitted to this generic execution substrate. Safe Knowledge/AI Ask signal ports and system query-proposal refresh belong to Story 18.3, not this story.
- Story 18.4 owns documented YouTube Data API search, the shared canonicalizer, candidate identity/appearances, and Knowledge-owned prior-capture lookup. Story 18.5 owns enrichment, derived comment signals, retention, and provider safety. Epic 19 owns AI triage; Epic 20 owns enable/disable commands and UI. Do not pre-build their tables, provider clients, ports, or surfaces.
- No hard quota/budget reservations or enforcement, blocking/exclusion policy, new service/package, compatibility layer, or additional scheduler is in scope.

### Required implementation patterns

- The run table currently cannot express leases, fencing, retry eligibility, attempts, terminal outcomes, or terminal timestamps. A focused sequential schema/migration change is required; in-memory coordination is insufficient.
- Follow the existing Worker runtime's finite child-adapter model. Every adapter must emit an observation for ordinary no-work so readiness reaches `ready`; a thrown no-work poll makes readiness report `loop_failed`.
- Model all correctness in PostgreSQL, not child-process termination: a process may be forcibly stopped during drain, and persisted lease recovery owns the next attempt.
- Use short transactions and database time for recovery/claim. Use `FOR UPDATE SKIP LOCKED` for concurrent claims, random fencing tokens, and guarded updates. Do not rely on process-local locks, caller clocks, or an unfenced read-then-write sequence.
- Run snapshots retain their original policy version and immutable `maxRetryAttempts`, `retryDelayMinutes`, and `maxConcurrentRuns`. Claim/recovery/retry use those run fields exclusively; read the current policy only for global enablement revocation. Re-enable permits new work but must not reopen a terminal cancelled run.
- Keep terminal transition plus Audit write in one matching-fence transaction. `recordAuditEvent` is the only allowed protected-audit writer; its truncation is not sanitization.
- Automated execution must use only `system-youtube-discovery`. No controller input, Worker argument, or persisted payload may supply a free-form executor identity.

### Non-negotiable boundaries

- Discovery remains URL-only and must never write Knowledge `sources`, capture versions, ingestion jobs, evidence, cards, lifecycle/publication state, source bundles, or traveler content.
- Never invoke, schedule, enqueue, retry, or add a dependency on `youtube:capture` or Gemini video analysis. Do not add a YouTube provider call, provider credential, scraping, transcript, download, media, candidate, or AI path in this story. The internal test seam is not a provider abstraction and must remain private to this Worker execution feature.
- Persist and expose only bounded safe run/audit fields. Never persist raw provider errors or payloads, query text in operational summaries, URLs with secrets, prompts/responses, raw source material, evidence, cookies, credentials, or traveler data.

### Files and patterns to inspect

- `apps/worker/src/runtime.ts`: extend the closed `adapterNames`, child adapter list, and runtime capability mapping only; preserve serial supervision, readiness, and drain semantics.
- `apps/worker/package.json`: add `discovery.mjs` through the established compiled adapter copy chain.
- `packages/worker-domain/src/adapters.ts`: extend the closed CLI union, `runPoll`, and `capabilityFor`; keep its requirement that each finite poll produces an observation.
- `packages/contracts/src/index.ts`: add the allowlisted `youtube.discovery` capability to existing telemetry validation, not a parallel telemetry type.
- `packages/database/src/schema.ts` and `packages/database/src/youtube-discovery/index.ts`: own Discovery schema, claim/recovery/transition operations, and transaction-coupled Audit writes. Preserve `createYoutubeDiscoveryRun()` admission checks for current enabled policy and enabled proposal.
- Reuse lease/fence mechanics from `packages/worker-domain/src/features/knowledge/indexing-worker.ts` and stale-claim coverage patterns in `tests/domain-outbox.test.ts`; adapt them to Discovery's closed states and policy snapshot rather than copying fixed indexing retry timing.

### Testing requirements

- Use `pnpm test:unit` only for infrastructure-free tests. Unit tests must not read database URLs, migrate Drizzle, or connect to PostgreSQL.
- Use `pnpm test:integration` for PostgreSQL lease/fence/audit behavior. Integration files remain serial and each test suite needing clean tables calls `resetTestDatabase()` locally; never restore a global reset hook or parallel workers.
- Preserve and extend `tests/youtube-discovery-foundation.integration.test.ts` where its foundation assertions remain relevant; create focused Story 18.2 coverage rather than weakening existing admission/ownership tests.
- Include exact tests for concurrent physical connections, stale claimant fencing, lease expiry recovery versus exhaustion, disable at all required boundaries, terminal audit cardinality/attribution/safety, and compiled adapter no-work behavior.

### Latest technical information

- No external research is needed. This story uses the repository's existing TypeScript 5.8.3, PostgreSQL/Drizzle 0.44.5, Worker, Audit, and telemetry contracts. It introduces no provider library, API integration, or dependency upgrade.

## Project Structure Notes

- Keep Discovery persistence in `packages/database/src/youtube-discovery/`, Worker feature execution in the existing `apps/worker` and `packages/worker-domain` boundaries, and safe shared telemetry types in `packages/contracts`.
- Put schema changes in `packages/database/src/schema.ts` with one next sequential migration and migration-journal update. Do not put domain writes in an app, UI, controller, or generic helper.
- This story should add only the minimal run-execution support needed by later Discovery stages. Candidate, query-planning, provider, AI, and UI structure belongs to their assigned stories.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 18.2: Execute Fenced Scheduled Discovery Runs]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1, AD-3, AD-6, AD-7, and AD-8]
- [Source: _bmad-output/implementation-artifacts/epic-18-context.md#Requirements & Constraints and Technical Decisions]
- [Source: _bmad-output/implementation-artifacts/18-1-establish-discovery-ownership-policy-and-audit-foundation.md#Scope and sequencing, Existing implementation patterns to preserve, and Testing requirements]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-08-07-youtube-discovery.md#Story Dependency Sequence]
- [Source: _bmad-output/project-context.md#Testing Rules and Code Quality & Style Rules]
- [Source: apps/worker/src/runtime.ts#createChildProcessAdapters and WorkerRuntime]
- [Source: packages/worker-domain/src/adapters.ts#parseWorkerArguments and runPoll]
- [Source: packages/database/src/youtube-discovery/index.ts#createYoutubeDiscoveryRun]
- [Source: packages/worker-domain/src/features/knowledge/indexing-worker.ts#lease claim and guarded completion]
- [Source: tests/youtube-discovery-foundation.integration.test.ts#YouTube Discovery foundation persistence]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story context analysis and non-interactive validation completed 2026-08-07.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story validation passed: requirements, architecture, previous Story 18.1 implementation, Worker/runtime patterns, ownership boundaries, and test requirements are reconciled. No code was implemented.
- 2026-08-07 independent review of `b45101d89e0f8a1b9ba6ed9c36e284f58a7b79ba..5e6d83bca956bddbd3e230bfeb069231db5b5652` completed synchronously with Blind Hunter, Edge Case Hunter, and Acceptance Auditor.
- Actionable [patch]: `tests/youtube-discovery-execution.integration.test.ts` lacks required proof that stale claimants cannot cancel or retry after lease reclaim, that disable-before-injected-stage/write/requeue cancels without continuation and records one terminal audit, and that bounded exponential-backoff/cap/exhaustion has DB-free unit coverage.
- Dismissed [Edge Case Hunter]: migration handling for pre-existing running/terminal Discovery runs is unreachable in the supported predecessor state. Before this range, `createYoutubeDiscoveryRun()` is the only constructor and always persists `queued`; no earlier lifecycle operation can create a running or terminal row.
- Blind Hunter: clean. Acceptance Auditor: blocked only by the required test-coverage patch above. No code changed during review.
- 2026-08-07 review repair completed: added stale-claim completion/cancel/retry fencing with terminal-audit cardinality, disable-before-stage/final-write/requeue cancellation with no continuation and one terminal audit, and DB-free capped exponential backoff/exhaustion coverage. Focused unit (2 tests) and serial integration (12 tests) verification plus `pnpm typecheck` passed. Story remains ready-for-dev pending follow-up review; it is not done.

### File List

- _bmad-output/implementation-artifacts/18-2-execute-fenced-scheduled-discovery-runs.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- packages/database/src/youtube-discovery/index.ts
- packages/database/src/youtube-discovery/retry-policy.ts
- tests/youtube-discovery-execution.integration.test.ts
- tests/youtube-discovery-execution.test.ts
- vitest.config.ts
