---
story_id: 20-6
status: done
created: 2026-08-13
epic: 20
---

# Story 20.6: Decouple Candidate Processing From Discovery Search Runs

## Story

As an operator,
I want each discovered URL to process and retry independently after search,
so that one failing URL cannot block a query run, unrelated URLs, or Discovery review work.

## Acceptance Criteria

1. **Given** an eligible due-query run returns documented YouTube search results, **when** canonical candidates and immutable appearances persist behind the active query-run lease, **then** the same fenced transaction idempotently creates one candidate-processing job per appearance and the query run completes after enqueue.
   - The query run does not invoke enrichment, AI triage, eligibility, or recommendation after its search/enqueue boundary.
   - A duplicate/replayed candidate, appearance, or enqueue cannot create duplicate jobs, ranking history, triage, recommendation, or review work.
2. **Given** a candidate job is eligible, **when** the Worker claims, recovers, retries, cancels, or terminalizes it, **then** it has its own PostgreSQL lease, random fencing token, immutable policy/retry snapshots, closed `queued | running | retrying | completed | failed | cancelled` state, bounded safe error code, and exactly one terminal audit.
   - Every downstream write is guarded by the candidate-job lease/fence and immutable `candidateId`, `appearanceId`, `runId`, and `policyVersionId` provenance tuple.
   - Stale/duplicate claimants cannot write enrichment, triage, Usage, ranking history, recommendation, retry, cancellation, completion, or another terminal audit.
3. **Given** one candidate job fails transiently or terminally, **when** other candidate jobs are eligible, **then** they proceed independently without re-searching, retrying, or reopening the completed query run.
   - A cancelled global policy fences candidate jobs before every provider call and derived write; re-enabling does not revive terminal jobs.
   - Discovery stays URL-only: no job creates Knowledge sources, capture versions, ingestion jobs, evidence, cards, or publication state; no job schedules/invokes/retries `youtube:capture` or Gemini video analysis.
4. **Given** queued/retrying candidate-job backlog reaches the policy-bounded threshold, **when** the scheduler considers a due query, **then** it records a safe backpressure/deferred outcome and does not call YouTube search.
   - It does not cancel, delete, reprioritize, or mutate existing candidate jobs, and it leaves Knowledge/manual capture unchanged.
   - Health exposes only bounded safe job backlog/state/retry/terminal-error data; it never exposes raw provider errors, comments, prompts, responses, payloads, secrets, or capture internals.
5. **Given** appearances exist before the candidate-job migration, **when** the migration is applied, **then** exactly one queued job is backfilled for each appearance without a job, preserving original candidate/run/policy provenance and leaving existing ranking/recommendation/review data unchanged.
   - Reapplying migration/backfill behavior is idempotent and never replays search.

## Tasks / Subtasks

- [ ] Define candidate-job persistence and migration (AC: 1, 2, 5)
  - [ ] Add closed candidate-job state/safe-error enums and `youtube_discovery_candidate_jobs` to `packages/database/src/schema.ts`. Reference candidate, appearance, originating run, and policy version; unique-index `appearance_id`; persist queue/retry timing, lease/fencing fields, attempt/retry/concurrency snapshots, terminal outcome/time, and safe error/last safe stage only.
  - [ ] Add the next forward Drizzle migration and journal entry. Backfill one queued job for each existing appearance lacking one using original appearance/run/policy provenance. Do not modify appearance, candidate, ranking-history, triage, recommendation, review, Knowledge, or capture records.
  - [ ] Add only a policy-owned bounded candidate backlog threshold required for admission. Preserve it through defaults, validation, immutable policy-version creation, enable/disable policy cloning, safe policy audit projection, and the job snapshot; validate the threshold at the policy boundary.
  - [ ] Keep existing query-run safe-error rows and their closed historical/search-stage vocabulary unchanged. Candidate jobs use a separate closed safe-error/stage vocabulary; no migration or Health projection reclassifies a run diagnostic as a candidate-job outcome.
- [ ] Make query runs search-and-enqueue only (AC: 1, 3, 4)
  - [ ] Update `persistYoutubeDiscoveryCandidates` (or its focused successor) so candidate, appearance, discovered ranking history, and job enqueue are atomic behind the active query-run guard.
  - [ ] Update `runYoutubeDiscoveryPoll` so the query-run branch ends after search/persist/enqueue and fences/completes the run. Remove its sequential per-result enrichment/triage/recommendation loop rather than retaining a hidden compatibility path.
  - [ ] Before claiming/admitting a due query run, enforce the bounded queued/retrying candidate-job backlog. Return only a safe backpressure/deferred observation/result and make no YouTube request at or above the threshold.
  - [ ] Preserve one finite `discovery --once` poll and its existing adapter. Define and test a bounded poll contract: it may claim at most one eligible candidate job and at most one due query run, processes candidate work before admitting new search work, and emits a safe observation for candidate execution, backpressure deferral, or query search/enqueue completion. Do not add a second or unbounded Worker loop.
- [ ] Implement independent candidate-job execution (AC: 2, 3)
  - [ ] Add focused Discovery-owned claim/recover/cancel/retry/finish operations in `packages/database/src/youtube-discovery/`; use PostgreSQL time, `FOR UPDATE SKIP LOCKED`, lease/fence compare-and-swap, and transaction-coupled terminal Audit writes. Do not add a generic job framework or a second Worker loop.
  - [ ] Move enrichment, triage, eligibility, and recommendation execution into the candidate-job branch. Adapt persistence APIs so each uses the active candidate-job provenance and fence, while AI Usage remains linked to the originating query run and records candidate-job identity only where the established safe model permits it.
  - [ ] Protect shared canonical-candidate data from cross-appearance clobbering. One candidate can have several appearance jobs: a job may not delete or overwrite sibling appearance's derived signals, triage, ranking, or fenced provenance records.
  - [ ] Preserve bounded diagnostics with safe code/stage only. Do not log query text, canonical URL, provider errors, request IDs, raw response/body, prompts, comments, or secrets.
  - [ ] Make safe Worker diagnostics execution-kind-aware with a closed `query_run | candidate_job` discriminator, a matching safe durable identifier label, and the applicable closed stage/error vocabulary. Do not label a candidate-job result as `runId`.
- [ ] Extend safe operational projections (AC: 4)
  - [ ] Update existing Health/mission projections and contracts only as needed to distinguish query-run backlog from candidate-job backlog and expose closed job state/retry/terminal-safe-error context. Preserve strict parse-before-render and all prohibited-field rejection.
  - [ ] Define job-aware safe incident behavior without changing completed query-run meaning: group candidate-job retry/failure incidents by an opaque job-aware identity and existing policy threshold/window semantics; a later successful candidate job clears only its own applicable job incident. Do not use a completed query run to clear or represent downstream job failure.
  - [ ] Preserve side-effect-free read projections. Health, Mission, and Action Queue reads must not reconcile review, claim/schedule/retry job or run work, call a provider, or write policy, audit, or Discovery state.
  - [ ] Do not add an admin mutation, raw event stream, dashboard, provider endpoint, or UI workflow. Existing views remain projections.
- [ ] Verify migration, isolation, fencing, and safety (AC: 1-5)
  - [ ] Extend DB-free execution tests for stage routing, execution-kind-aware safe diagnostics, policy threshold validation/cloning, backpressure admission, bounded poll ordering/observations, and no-query-retry behavior.
  - [ ] Add serial PostgreSQL integration coverage with local `resetTestDatabase()` for atomic enqueue/idempotency, concurrent claims, stale claimant fencing, lease recovery, one terminal audit, independent job progress after sibling failure, global-disable fencing, threshold backpressure with no search, and migration backfill idempotency.
  - [ ] Extend AI triage/Usage and admin contract/Health tests for immutable provenance, shared-candidate cross-appearance isolation, strict safe projections, job incident grouping/clearing, historical run-diagnostic preservation, side-effect-free reads, and no raw/prohibited fields.
  - [ ] Update fixtures and helpers that currently complete the entire downstream pipeline under a query-run claim. Search fixtures enqueue under the query-run lease; downstream setup claims and completes candidate jobs. Cover the Mission, review, Accept, triage, and Story 20.5 fixture paths.
  - [ ] Run focused `pnpm test:unit` and serial `pnpm test:integration`, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact blockers; unit tests must remain database-free and integration files remain serial.

## Dev Notes

### Scope and sequencing

- This is an approved correction to completed Epic 20 execution foundations, not a new Discovery product feature. It preserves FR-57 and FR-66..78, URL-only Discovery, the manual capture boundary, and all existing candidate-review behavior.
- Query run lifecycle remains useful for schedule/search/provenance/Health. Do not delete it or make candidate jobs mutable replacements for appearances.
- One appearance is the exact job dedupe key. A canonical candidate may have many appearances and therefore many provenance-preserving jobs; deterministic review uniqueness remains candidate-owned.
- Backpressure is admission control for new searches, not cancellation, prioritization, quota reservation, or a new scheduler. Do not add hard cost budgets, blocking/exclusion policy, provider dependencies, environment variables, or a new service.

### Execution ownership and finite polling

- **Query run boundary:** Under the active query-run lease, search, canonical candidate persistence, immutable appearance persistence, and idempotent appearance-job enqueue occur in one fenced transaction. The run then completes. It never performs, retries, or reports downstream enrichment, triage, eligibility, recommendation, or candidate-job terminal work.
- **Candidate-job boundary:** One job is uniquely keyed by one immutable appearance and carries its immutable candidate/appearance/originating-run/policy provenance tuple. Only its active lease/fence may perform downstream provider calls, derived writes, retry/requeue, cancellation, completion, or its one terminal audit. Terminal jobs never reopen.
- The existing finite `discovery --once` adapter remains the only Worker entry. One poll may process at most one candidate job followed by at most one due query run; after candidate backlog backpressure, it must not search. Its safe observation distinguishes `query_run` from `candidate_job` without emitting URLs, provider content, prompts, request IDs, or raw errors.
- Preserve existing query-run terminal diagnostics as historical search/run data. Candidate-job diagnostics, incidents, and Health state are separate and must never be backfilled into run state.

### Existing seams to preserve

- `packages/database/src/youtube-discovery/index.ts` owns Discovery persistence, current-policy fences, Audit coupling, run scheduling, and canonical candidate persistence.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` owns finite Worker execution. Keep the existing `discovery --once` adapter; a poll may claim bounded query and candidate work but must remain finite.
- `packages/contracts/src/index.ts` and `packages/contracts/src/youtube-discovery/index.ts` own closed Worker and admin projections. Add exact bounded fields only.
- `packages/database/src/admin-youtube-discovery.ts` owns safe Health/Mission projections. Never reuse a side-effecting review read as a generic operational read.
- Existing AI triage uses the valid `youtube_discovery_triage` model purpose and Usage boundary. Do not create a second AI/Gemini route.
- Reuse `youtubeDiscoveryAppearances` as the appearance-to-job dedupe anchor; extend `persistYoutubeDiscoveryCandidates` as the atomic fenced enqueue seam. Reuse existing PostgreSQL-time lease/fence compare-and-swap, `FOR UPDATE SKIP LOCKED`, retry delay, and transaction-coupled terminal Audit patterns. Do not add a generic job framework.
- Existing candidate-level enrichment writes are not safe as an unqualified shared write once multiple appearance jobs can run. Keep data that is derived from one job fenced and provenance-linked so a sibling appearance job cannot delete or overwrite it.
- Extend the exact-key parsers in `packages/contracts/src/youtube-discovery/index.ts` and canonical negative fixtures in `tests/admin-youtube-discovery-contract.test.ts`; do not introduce permissive operational DTOs. Health, Mission, and Action Queue projections remain read-only.

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-08-13-candidate-job-queue.md]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 20.6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-3, AD-8, AD-9]
- [Source: _bmad-output/implementation-artifacts/epic-20-context.md]
- [Source: _bmad-output/implementation-artifacts/18-2-execute-fenced-scheduled-discovery-runs.md]
- [Source: _bmad-output/implementation-artifacts/20-1-build-the-action-required-discovery-queue.md]
- [Source: _bmad-output/implementation-artifacts/20-3-deliver-automation-health-and-safe-incident-detail.md]
- [Source: _bmad-output/implementation-artifacts/20-5-verify-control-tower-accessibility-and-operational-boundaries.md]
- [Source: _bmad-output/project-context.md#Testing Rules]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Created and validated from the approved 2026-08-13 course correction. No implementation, migration, database reset, test execution, or commit was performed while creating this guide.
- The guide replaces query-level downstream retries with immutable-appearance candidate jobs, preserving query run history and all Discovery/Knowledge/manual-capture safety boundaries.
- Implemented the fenced candidate-job queue, forward migration/backfill, candidate-first finite polling, appearance-scoped enrichment, candidate-job retries/audits/incidents, backpressure, and strict safe operational projections.
- Verification passed: focused unit 341 tests; serial Discovery integrations candidates 14, execution 37, enrichment 8, triage 8, Health 19, and Action Queue 10; `pnpm typecheck`, `pnpm build`, and `git diff --check`. `pnpm lint` had 56 warnings and no errors.

### File List

- _bmad-output/implementation-artifacts/20-6-decouple-candidate-processing-from-discovery-search-runs.md
- apps/worker/src/adapters.ts
- drizzle/migrations/0066_discovery_candidate_jobs.sql
- drizzle/migrations/meta/_journal.json
- packages/contracts/src/index.ts
- packages/contracts/src/youtube-discovery/index.ts
- packages/database/src/admin-youtube-discovery.ts
- packages/database/src/schema.ts
- packages/database/src/youtube-discovery/index.ts
- packages/domain/src/youtube-discovery/policy.ts
- packages/worker-domain/src/adapters.ts
- packages/worker-domain/src/features/youtube-discovery/execution.ts
- tests/admin-youtube-discovery-api.integration.test.ts
- tests/admin-youtube-discovery-contract.test.ts
- tests/youtube-discovery-action-required.integration.test.ts
- tests/youtube-discovery-candidates.integration.test.ts
- tests/youtube-discovery-enrichment.integration.test.ts
- tests/youtube-discovery-execution.integration.test.ts
- tests/youtube-discovery-health.integration.test.ts
- tests/youtube-discovery-triage.integration.test.ts
