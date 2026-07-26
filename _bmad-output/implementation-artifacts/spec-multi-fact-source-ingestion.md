---
title: 'Multi-Fact Source Ingestion'
type: 'feature'
created: '2026-07-26'
status: 'done'
baseline_commit: '92a3d9f0ee874c8df7fa91ae11c21a9454e9b0e1'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-5-run-the-source-version-ai-ingestion-pipeline.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Canonical ingestion accepts only one atomic candidate from each immutable capture. Long, useful community trip reports therefore either discard all but one fact or suppress the entire capture when extraction cannot choose a single representative fact.

**Approach:** Evolve canonical ingestion so one capture is discovered in bounded deterministic source windows and produces every independently useful, evidence-grounded atomic candidate. Each candidate is quality-gated, judged, related, and terminalized independently; source completion reports their aggregate rather than treating candidate count as a product quota.

## Boundaries & Constraints

**Always:** Keep `knowledge_card` as the only persistent canonical fact aggregate. Preserve exact source-version evidence, operator-only Facebook raw-material policy, independent judgment, source-current checks, leases/fencing, and existing publication/verification policy for every candidate. Persist only safe candidate summaries, metadata, spans, scores, outcomes, and card links; never provider payloads, raw capture text, quotes outside evidence storage, checkpoint internals, or fencing tokens in UI projections. Bound provider work by deterministic source windows and retries, never by a maximum number of accepted facts.

**Ask First:** Halt if this requires changing traveler retrieval eligibility, widening Facebook capture access, retaining raw provider output, or migrating a live v1 checkpoint into v2 semantics.

**Never:** Do not turn lists of place names into cards without an independently useful actionable claim. Do not silently drop candidates because a response is large, reuse completed candidate work after retry, or permit stale discovery/candidate workers to mutate cards or parent counters. Do not reinterpret historical v1 job outcomes as candidate-level results.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Multi-fact report | One capture contains many eligible trip claims | Every valid atomic claim from each finite source window is independently persisted and processed; no accepted-fact quota applies | Invalid candidates are recorded with their own safe outcome without stopping valid siblings |
| Mixed quality | One capture has publishable, high-risk, weak, and invalid claims | Candidate outcomes independently become published, verify-first, review-recommended, or suppressed; parent aggregates them | Parent completes only after discovery and all candidate work terminalize |
| Worker interruption | Lease expires during discovery or candidate processing | A later worker resumes from fenced cursor/state; completed candidates are not duplicated or replayed | Stale fence cannot create/attach/conflict evidence or alter counts |
| Recapture | A newer capture becomes current before old candidate mutation | Old candidate cannot mutate a card or evidence | Terminalize old work safely with stale/deleted outcome |
| Legacy job | Existing protocol-v1 job/checkpoint | Existing v1 pipeline behavior and historical display remain intact | No checkpoint conversion or fabricated candidate history |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts` -- parent ingestion schema and new per-candidate work records.
- `drizzle/migrations/` -- forward-only protocol-v2 schema migration and metadata.
- `src/features/knowledge/ingestion-jobs.ts` -- fenced parent discovery and candidate work claiming/recovery.
- `src/features/knowledge/ingestion-pipeline.ts` -- v1 compatibility plus v2 discovery and candidate lifecycle.
- `src/features/knowledge/ingestion-worker.ts` -- one bounded discovery or candidate work unit per iteration.
- `src/features/knowledge/source-captures.ts` -- new captures select protocol v2.
- `src/features/ai/prompts.ts` -- immutable multi-fact window extraction contract.
- `src/features/knowledge/facebook-capture-review-admin.ts` -- safe aggregate and candidate projections.
- `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` -- candidate-level operational visibility.
- `tests/knowledge-ingestion-*.test.ts` -- lifecycle, fencing, compatibility, and quality tests.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts`, `drizzle/migrations/`, and migration metadata -- added protocol-v2 orchestration fields, source-version-bound candidate work records, counters, fencing, and forward-only hardening migration.
- [x] `src/features/ai/prompts.ts` and usage constants -- added a versioned multi-fact extraction contract with absolute Unicode spans and empty-array behavior.
- [x] `src/features/knowledge/ingestion-jobs.ts` and `ingestion-worker.ts` -- added fenced discovery/candidate claiming, retry/recovery, and aggregate parent finalization.
- [x] `src/features/knowledge/ingestion-pipeline.ts` -- preserved v1 behavior and implemented bounded v2 discovery, candidate validation/deduplication, independent judgment/relation, publication policy, and stale-capture protection.
- [x] `src/features/knowledge/source-captures.ts` -- new captures select v2 through the existing job-creation entry point.
- [x] `src/features/knowledge/facebook-capture-review-admin.ts` and `src/app/admin/knowledge/facebook-captures/[reviewId]/page.tsx` -- added bounded safe aggregate/candidate visibility and explicit v1 historical treatment.
- [x] `tests/knowledge-ingestion-jobs.test.ts`, `tests/knowledge-ingestion-pipeline.test.ts`, and focused new tests -- covered v1 compatibility, multi-candidate discovery/deduplication, mixed outcomes, and job lifecycle safety.

### Review Findings

- [x] [Review][Patch] Successful discovery windows exhaust the parent retry budget [src/features/knowledge/ingestion-jobs.ts:113]
- [x] [Review][Patch] V2 discovery sends sensitive capture text to the extraction provider [src/features/knowledge/ingestion-pipeline.ts:99]
- [x] [Review][Patch] Expired discovery fences can still insert candidates and advance counters [src/features/knowledge/ingestion-pipeline.ts:121]
- [x] [Review][Patch] Oversized discovery responses are retried unchanged instead of subdivided [src/features/knowledge/ingestion-pipeline.ts:117]
- [x] [Review][Patch] Recaptured parents terminalize before existing candidates reach safe terminal outcomes [src/features/knowledge/ingestion-pipeline.ts:101]
- [x] [Review][Patch] Invalid extracted entries have no independent safe candidate outcome [src/features/knowledge/ingestion-pipeline.ts:437]
- [x] [Review][Patch] Model title variations bypass candidate and canonical-fact deduplication [src/features/knowledge/ingestion-pipeline.ts:466]

**Acceptance Criteria:**
- Given a long eligible capture, when source windows are processed, then every candidate that passes structural and quality gates is independently processed regardless of how many sibling candidates qualify.
- Given candidates from one capture have different risk and quality, when their lifecycle completes, then each has its correct independent terminal outcome and the parent accurately summarizes all outcomes.
- Given a provider failure, retry, lease expiry, or recapture, when stale or duplicate work resumes, then previously fenced discovery/candidate work neither duplicates candidates nor mutates knowledge.
- Given a Facebook operator opens a v2 capture review, when canonical ingestion has run, then the page presents aggregate and candidate-level safe outcomes sufficient for diagnosis; no sensitive internal/provider material is shown.

## Design Notes

The parent job orchestrates finite source traversal, not individual fact judgment. Its cursor advances through fixed source windows and safely commits validated candidate rows. Candidate rows own their own retryable, fenced lifecycle, allowing mixed outcomes and avoiding a long parent lease.

Window/request size is an operational safety bound, not a knowledge quota: each request asks for all eligible facts whose evidence starts in its core range. Core-range ownership plus deterministic fingerprints prevent overlap and retry duplicates. A response overflow must be retried or subdivided deterministically rather than discard otherwise valid facts.

Protocol versioning preserves live and historical v1 jobs without unsafe checkpoint conversion. A v2 parent may complete successfully even when every candidate is suppressed; only infrastructure/protocol exhaustion is a parent failure.

## Verification

**Commands:**
- `pnpm test:run -- tests/knowledge-ingestion-jobs.test.ts tests/knowledge-ingestion-pipeline.test.ts` -- expected: all ingestion lifecycle tests pass.
- `pnpm test:run -- tests/facebook-capture-review-admin.test.ts` -- expected: safe aggregate/candidate projection tests pass.
- `pnpm typecheck` -- expected: no TypeScript errors.
- `pnpm lint` -- expected: no lint errors.
- `pnpm build` -- expected: production build succeeds.

**Results:** `knowledge-ingestion-jobs` passed 16/16, `knowledge-ingestion-pipeline` passed 40/40, and `facebook-capture-review-admin` passed 19/19. `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm lint` completed with no errors and four pre-existing warnings outside this change.
