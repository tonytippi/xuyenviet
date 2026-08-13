---
title: 'Decouple Candidate Processing From Discovery Search Runs'
type: 'feature'
created: '2026-08-13'
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

**Problem:** A Discovery query run currently owns search and all downstream per-URL enrichment, triage, eligibility, and recommendation work. One failing URL can therefore delay or retry a completed search and interfere with unrelated discovered appearances.

**Approach:** Persist one independently leased, fenced candidate job per immutable appearance during the query-run search transaction. Make the finite Worker poll process at most one candidate job before admitting at most one query run, while preserving query-run history and exposing only safe, job-aware operational state.

## Boundaries & Constraints

**Always:** Keep Discovery URL-only and preserve Knowledge/manual capture ownership. Use PostgreSQL time, `FOR UPDATE SKIP LOCKED`, active lease/fence compare-and-swap, immutable candidate/appearance/run/policy provenance, closed execution states, bounded safe errors, and transaction-coupled single terminal audits. Query-run diagnostics remain search/run diagnostics. Candidate-job processing may not overwrite or delete sibling-appearance-derived data. Health, Mission, and Action Queue projections stay select-only and strict exact-key parsing remains in place.

**Block If:** Existing persistence cannot retain job-level provenance without an unresolved conflict with the established AI Usage model, or required serial integration infrastructure is unavailable after focused investigation.

**Never:** Reopen terminal jobs/runs; re-search to retry a candidate; add a generic job framework, second/unbounded Worker loop, route/UI mutation, raw diagnostic/content field, provider payload logging, Knowledge writer, capture scheduler, or Gemini video-analysis invocation. Do not cancel, delete, reprioritize, or mutate queued/retrying jobs to apply search backpressure.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Search enqueue | Active due run with search results | One atomic, idempotent job per immutable appearance; run completes after enqueue | Stale lease rolls back all derived search/enqueue writes |
| Candidate execution | Claimed queued/retrying job | Enrichment, triage, eligibility, and recommendation use its provenance/fence; one terminal audit | Retry or terminalize only that job with a bounded safe code/stage |
| Sibling failure | One appearance job fails, another is eligible | Eligible sibling proceeds without reopening or re-searching its completed run | Failed sibling does not clobber shared candidate or sibling-derived rows |
| Disabled policy | Job reaches provider/write/retry boundary after disable | Job is fenced and terminally cancelled; no provider/derived write | Re-enable admits new work only, never terminal job revival |
| Backpressure | Queued/retrying jobs meet policy threshold | Poll emits safe backpressure observation and makes no search request | Existing jobs remain unchanged |
| Migration | Existing appearance has no job | One queued provenance-preserving job is backfilled | Reapply is idempotent and does not replay search |

</intent-contract>

## Code Map

- `packages/database/src/schema.ts` and `drizzle/migrations/0066_discovery_candidate_jobs.sql` -- candidate-job schema, policy threshold, forward migration, and idempotent appearance backfill.
- `packages/domain/src/youtube-discovery/policy.ts` -- bounded backlog policy default and validation.
- `packages/database/src/youtube-discovery/index.ts` -- atomic job enqueue; job lease/fence lifecycle; job-scoped downstream persistence; admission/backpressure and retention.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- finite candidate-first then query search/enqueue Worker execution.
- `packages/contracts/src/{index.ts,youtube-discovery/index.ts}` and `apps/worker/src/adapters.ts` -- execution-kind-aware safe diagnostics and exact safe Health contracts.
- `packages/database/src/admin-youtube-discovery.ts` -- job backlog/status and job-aware incident projection without query-run reinterpretation.
- `tests/youtube-discovery-*.{test,integration.test}.ts` and `tests/admin-youtube-discovery-*.test.ts` -- DB-free routing/contracts plus serial persistence, fence, backpressure, and projection coverage.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/schema.ts`, `drizzle/migrations/`, and journal -- add a closed candidate-job queue keyed uniquely to immutable appearance, immutable policy/retry snapshots, safe lifecycle fields, policy threshold, and idempotent provenance-preserving backfill.
- [x] `packages/domain/src/youtube-discovery/policy.ts`, `packages/database/src/youtube-discovery/index.ts`, and `packages/database/src/admin-youtube-discovery.ts` -- validate/clone/snapshot the threshold; atomically enqueue jobs; implement job claim/recovery/retry/cancel/finish, job-scoped guarded derived writes, non-destructive sibling isolation, admission backpressure, retention, audits, and safe job-aware projections/incidents.
- [x] `packages/worker-domain/src/features/youtube-discovery/execution.ts`, `packages/contracts/src/index.ts`, `packages/contracts/src/youtube-discovery/index.ts`, and `apps/worker/src/adapters.ts` -- split search from downstream job work and expose a closed execution discriminator with correctly labeled opaque durable identity.
- [x] Focused unit and serial integration suites -- update query-run pipeline fixtures to enqueue then independently claim jobs; cover atomic dedupe, stale fencing, lease recovery, terminal audit uniqueness, sibling isolation, disable fencing, threshold no-search, job incidents, safe projection rejection, and migration backfill idempotency.
- [x] Story artifact and sprint status -- record implementation, exact verification results/blockers, changed files, and completed story state.

**Acceptance Criteria:**
- Given a due query search persists candidates and appearances under its valid fence, when it commits, then exactly one job per appearance is atomically available and the query run completes without downstream processing.
- Given a candidate job is claimed, recovered, retried, cancelled, or completed, when any derived action occurs, then its lease/fence and immutable provenance permit only its active claimant and exactly one terminal audit.
- Given a candidate job fails, when another is eligible, then the other makes progress independently and no completed query run reopens or retries.
- Given queued/retrying job backlog is at threshold, when a due query is considered, then no YouTube search occurs and the safe deferral does not mutate existing jobs.
- Given an old appearance without a job, when the migration applies repeatedly, then exactly one queued provenance-preserving job exists and historical discovery/review data is unchanged.

## Design Notes

The immutable appearance, not canonical candidate, is the job dedupe and downstream provenance boundary. Canonical candidate identity may remain shared, but comments, triage, ranking, recommendations, and derived write guards must retain the active appearance-job tuple so sibling work cannot be erased or overwritten. A poll remains finite: candidate work first, then at most one search admission; its safe observation reports `candidate_job` or `query_run` rather than naming every durable item `runId`.

## Verification

**Commands:**
- `pnpm test:unit -- tests/youtube-discovery-worker.test.ts tests/youtube-discovery-planning.test.ts tests/youtube-discovery-triage.test.ts tests/youtube-discovery-recommendations.test.ts tests/admin-youtube-discovery-contract.test.ts` -- expected: DB-free policy, routing, diagnostics, and strict safe-contract evidence passes.
- `pnpm test:integration -- tests/youtube-discovery-candidates.integration.test.ts` -- expected: serial atomic enqueue, provenance, and migration behavior passes.
- `pnpm test:integration -- tests/youtube-discovery-execution.integration.test.ts` -- expected: serial independent lifecycle, poll ordering, fence, and backpressure behavior passes.
- `pnpm test:integration -- tests/youtube-discovery-enrichment.integration.test.ts tests/youtube-discovery-triage.integration.test.ts tests/youtube-discovery-health.integration.test.ts` -- expected: serial sibling isolation, usage provenance, and safe job-health behavior passes.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` -- expected: baseline quality and whitespace checks pass.

## Review Triage Log

### 2026-08-13 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 10 (high 4, medium 6)
- defer: 0
- reject: 0
- addressed_findings:
  - [high] [patch] Fenced candidate enrichment to its immutable appearance and made derived metadata appearance-scoped.
  - [high] [patch] Added job-aware Health and Action Queue incident projection and opaque job identity handling.
  - [medium] [patch] Preserved queued/retrying jobs through enabled policy-version transitions and applied backpressure only to queued/retrying jobs.
  - [medium] [patch] Added lifecycle-shape constraints, terminal audits, safe execution-kind telemetry, retry-safe signals, and migration-safe UUID-shaped backfill IDs.
  - [medium] [patch] Allowed expired lease exhaustion without a downstream stage while preserving stage requirements for execution failures.

## Auto Run Result

Status: done

Implemented independent, appearance-scoped Discovery candidate jobs. Query runs now only search, persist immutable appearances, enqueue idempotent jobs, and finish. Candidate jobs own fenced enrichment, triage, eligibility, recommendation, retries, terminal audit, safe diagnostics, and job-aware Health/Action Queue incidents. Candidate metadata and enrichment are appearance-scoped so sibling jobs cannot overwrite one another.

Verification passed:

- Focused unit suite: 41 files, 341 tests.
- Serial Discovery integrations: candidates 14, execution 37, enrichment 8, triage 8, Health 19, Action Queue 10 tests.
- `pnpm lint` passed with 56 pre-existing warnings and no errors.
- `pnpm typecheck`, `pnpm build`, and `git diff --check` passed.

Residual risk: the broader integration suite was not run because it shares one physical database and its project invocation does not reliably restrict named files; all Story 20.6 affected Discovery suites were run sequentially.
