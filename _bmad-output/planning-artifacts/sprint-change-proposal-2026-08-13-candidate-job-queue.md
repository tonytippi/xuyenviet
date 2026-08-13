# Sprint Change Proposal: Durable Candidate Jobs for YouTube Discovery

**Date:** 2026-08-13
**Project:** xuyenviet
**Change scope:** Moderate, approved direct adjustment to Epic 20
**Status:** Approved 2026-08-13

## 1. Issue Summary

The completed Discovery execution path treats a due-query run as the retry unit for search, enrichment, metadata triage, deterministic eligibility, and recommendation. A transient failure for one persisted URL therefore retries the whole query run and prevents other persisted appearances from advancing. This creates query-level head-of-line blocking, repeats search work, and prevents safe investigation of the actual failing URL stage.

Evidence from operational smoke tests is concrete: documented YouTube search has persisted candidates and appearances, the triage model is configured and eligible, but all available query runs exhausted retry as `retry_exhausted` before any triage Usage record was written. Safe worker diagnostics identify only the query-run retry and last stage; they cannot make one URL independently recoverable while the retry unit remains the query run.

## 2. Impact Analysis

### Checklist

- [x] 1.1 Triggering delivery: completed Discovery execution from Epic 18/19, observed through Epic 20 Health.
- [x] 1.2 Problem: failed approach requiring a different technical retry unit.
- [x] 1.3 Evidence: persisted candidates/appearances, configured triage model, query-run retry exhaustion, and no triage Usage.
- [x] 2.1 Epic 20 can continue only with one follow-up execution story.
- [x] 2.2 Add Story 20.6; reopen Epic 20 aggregate status.
- [x] 2.3 Future epics are unaffected; no dependency order changes.
- [x] 2.4 No new epic is required.
- [x] 2.5 Story 20.6 precedes any further Discovery production activation.
- [x] 3.1 PRD conflict: none. FR-57 and FR-66..78 still require bounded Worker-owned background work and safe Discovery processing.
- [x] 3.2 Architecture change: amend Discovery execution lifecycle and add candidate-job invariant.
- [N/A] 3.3 UX change: no new surface or flow; existing Health safely projects the new technical backlog.
- [x] 3.4 Update migration/test/runbook-facing implementation artifacts.
- [x] 4.1 Direct adjustment: viable; medium effort and medium risk.
- [N/A] 4.2 Rollback: not viable; reverting completed persistence/control-tower work does not solve retry granularity.
- [N/A] 4.3 PRD MVP review: not required; product scope remains unchanged.
- [x] 4.4 Selected direct adjustment.

### Artifact Impact

- **Epic 20:** Adds Story 20.6 and returns the aggregate to `in-progress`.
- **Architecture:** Query runs end after search/persist/enqueue. Candidate jobs own downstream processing, leases, retries, and terminal outcomes.
- **Sprint status:** Adds Story 20.6 as `ready-for-dev`.
- **PRD and UX:** No edits. The change preserves URL-only Discovery, manual capture, and existing operator surfaces.

## 3. Recommended Approach

Implement one Discovery-owned `youtube_discovery_candidate_jobs` table keyed uniquely by immutable appearance. The existing query-run lease fences canonical candidate, appearance, and job enqueue persistence. Each candidate job has its own lease, fencing token, retry snapshot, terminal state, safe error code, and terminal audit. It processes only one URL through enrichment, triage, eligibility, and recommendation.

The scheduler must apply a bounded policy-owned queued/retrying candidate-job backlog threshold before a new due query run is admitted. At the threshold it records only a safe deferred/backpressure result and makes no YouTube call. A forward migration backfills one job for every historical appearance that lacks one.

**Effort:** Medium. **Risk:** Medium, localized to Discovery persistence and Worker orchestration. **Timeline:** One follow-up story before Discovery activation is trusted.

## 4. Detailed Change Proposals

### 4.1 Epic 20

**Old:** Epic 20 ended with Story 20.5 and was marked complete.

**New:** Add Story 20.6, `Decouple Candidate Processing From Discovery Search Runs`, and set Epic 20 to `in-progress`.

**Rationale:** The control tower correctly surfaces run-level health but cannot correct the execution unit that produces the blocked work.

### 4.2 Architecture

**Old:** One due-query run owns search and all per-URL downstream stages/retries.

**New:** Query runs own search, candidate/appearance persistence, and idempotent job enqueue only. Candidate jobs own one appearance's downstream stages and retry lifecycle, with separate lease/fencing and immutable provenance. Policy-backed backlog limits admission of new searches.

**Rationale:** An individual URL becomes the durable retry/failure unit without re-searching completed queries or modifying immutable appearance provenance.

### 4.3 Historical Work

**Old:** Existing appearances have no independent downstream execution record.

**New:** Migration backfill creates exactly one queued candidate job per appearance lacking one, without replaying search or changing previous review/recommendation records.

**Rationale:** Existing discovered URLs are processed under the corrected lifecycle rather than stranded behind terminal query runs.

## 5. Implementation Handoff

### Scope Classification

**Moderate.** Product requirements and UX remain stable; backlog, architecture, migration, and Worker execution require coordinated implementation.

### Responsibilities

- **Product Owner / planning owner:** Treat this proposal, Epic 20 Story 20.6, and AD-9 as the active Discovery execution baseline.
- **Developer agent:** Implement and validate Story 20.6 with the existing PostgreSQL/Drizzle, Worker, Audit, Usage, Health, and test boundaries.
- **Code review:** Verify per-job fencing, terminal-audit cardinality, no duplicate/provider replay, backpressure, and migration backfill before status completion.

### Success Criteria

1. A query run completes after fenced search/persist/enqueue and never waits for one URL's downstream failure.
2. Each appearance has at most one independently leased/retried candidate job.
3. A failed job does not retry the query, re-search YouTube, or block other jobs.
4. Backpressure prevents new search admission at the policy backlog threshold without changing existing jobs or Knowledge/manual capture.
5. Existing appearances are backfilled idempotently and safely.
6. No raw provider data, comments, prompts, URLs beyond existing canonical safe metadata, or secrets enter safe diagnostics/projections.

## 6. Approval and Handoff

- [x] Impact analysis completed across PRD, architecture, epics, UX, and sprint status.
- [x] User approved the course correction on 2026-08-13 by requesting execution of the agreed correction.
- [x] Proposal, architecture, Epic 20, context, and sprint status updated.
- [x] Story 20.6 created as the implementation handoff.
