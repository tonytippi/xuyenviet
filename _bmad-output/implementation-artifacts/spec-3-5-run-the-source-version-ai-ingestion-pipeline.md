---
title: 'Story 3.5: Run the Source-Version AI Ingestion Pipeline'
type: 'feature'
created: '2026-07-22'
status: 'done'
baseline_revision: '6b1dc1a'
final_revision: '6b1dc1a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/3-4-establish-source-version-ingestion-job-claiming.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 3.4 creates and fences one canonical ingestion job for every readable immutable source capture, but no canonical worker advances a claim through the source-version AI pipeline.

**Approach:** Add a Knowledge-owned worker that transitions a valid fenced claim through triage, extraction, judging, and relation work to exactly one auditable terminal outcome while preserving the submitter provenance and recording automated work as `system-knowledge-pipeline`.

## Boundaries & Constraints

**Always:** Preserve exact capture-version provenance, require job ID, expected stage, stage version, and fencing token for every stage commit, and keep raw capture text, provider payloads, prompts, evidence spans, and fencing tokens out of job status projections, logs, traveler reads, and durable unbounded storage. Keep the legacy extraction queue compatible and preserve the current evidence-backed fail-closed traveler eligibility boundary.

**Block If:** A database migration cannot safely establish the durable system actor required by existing audit/card foreign keys, or the existing source/capture data cannot satisfy the immutable evidence invariant.

**Never:** Do not reuse the legacy source-scoped extraction workflow as the canonical source-version pipeline. Do not create a persistent candidate aggregate, publish a card without validated bounded evidence and independent judgment, introduce stale-lease recovery/requeue behavior, or make a queued/job-only source traveler-eligible.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Claimed source-version job | Valid queued claim with current capture | Advances through triaging, extracting, judging, and relating to one terminal state | Every transition uses stage/version/fence CAS |
| Duplicate or stale worker | Mismatched stage, version, fence, or expired lease | Cannot overwrite completed work, attach evidence, or change terminal outcome | Safe operational failure reason only |
| Extracted candidate | Candidate potentially suitable for publication | Requires deterministic validation, independent judge, evidence, and relation decisions before card mutation | Fail closed; no traveler-visible card from unresolved policy |

</intent-contract>

## Code Map

- `src/features/knowledge/ingestion-jobs.ts` -- canonical job creation and `queued` fenced claim contract; lacks stage-commit APIs.
- `src/features/knowledge/source-captures.ts` -- immutable exact-version input and retention boundary for nonterminal ingestion jobs.
- `src/features/knowledge/extraction-jobs.ts` and `src/features/knowledge/extraction.ts` -- legacy compatibility flow only; may inform provider integration but cannot be used for canonical mutations.
- `src/db/schema.ts` -- canonical stage/fence fields and evidence/card constraints; does not define a durable candidate or system actor identity.
- `src/features/knowledge/state.ts` -- evidence-backed traveler eligibility that a pipeline job must not relax.
- `src/features/ai/gateway.ts` and `src/features/ai/prompts.ts` -- existing transport and draft-only extraction prompt, neither of which defines independent canonical judging policy.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and a generated forward-only migration -- establish a stable `system-knowledge-pipeline` actor and any narrowly bounded operational state required for canonical processing -- automated mutations must be auditable without impersonating the source submitter.
- [x] `src/features/knowledge/ingestion-jobs.ts` -- add narrow claimed-job CAS transitions that require the expected stage, version, fence, and valid lease; stage changes increment the version and terminal commits clear every claim field -- duplicate or stale workers cannot commit effects.
- [x] `src/features/knowledge/ingestion-pipeline.ts` -- implement source-version triage, extraction, deterministic candidate/evidence validation, independent judgment, scoped relation, card/evidence mutation, and terminal selection -- qualification is evidence-grounded and fail closed.
- [x] `src/features/knowledge/ingestion-worker.ts` and `scripts/knowledge-ingestion-worker.ts` -- claim and process canonical jobs using the dedicated pipeline without legacy queue recovery -- operational logs and return types remain safe.
- [x] `src/features/ai/prompts.ts` and `src/features/usage/constants.ts` -- add bounded machine contracts for independent extraction and judgment calls -- provider output remains transient and no raw payload is persisted.
- [x] `tests/knowledge-ingestion-pipeline.test.ts` and focused existing Knowledge tests -- cover successful low-risk publication, verify-first/review/suppression outcomes, exact evidence spans, independent model calls, stale-fence rejection, raw-data privacy, and legacy queue compatibility -- prove every pipeline outcome is safe.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and `_bmad-output/planning-artifacts/epics.md` -- record Story 3.5 as the owner of the complete policy contract and remove it as an implementation dependency from Stories 3.7-3.8 -- prevent later artifacts from claiming duplicate ownership.

**Acceptance Criteria:**
- Given a worker owns a valid queued claim, when it processes an immutable readable capture, then it advances through `triaging`, `extracting`, `judging`, and `relating` and commits exactly one terminal outcome while audit/card mutations identify `system-knowledge-pipeline` and the job/source preserve the submitter provenance.
- Given an extracted candidate fails span, privacy, context, opinion, spam, high-risk conflict, or independent-judge requirements, when the pipeline evaluates it, then it creates no active traveler-eligible card and ends in a safe suppressed, review-recommended, verify-first, or failed outcome.
- Given a low-risk candidate has exact active evidence and satisfies the independent judge, when relation work finds no conflicting equivalent card, then the pipeline creates the canonical evidence-backed card with source-version provenance and a current state appropriate for traveler eligibility.
- Given a stage result is stale, duplicated, fenced by another worker, or its lease has expired, when it attempts to advance or mutate knowledge, then its compare-and-swap fails without changing cards, evidence, audit state, or terminal outcome.

## Design Notes

Story 3.5 owns the complete first vertical ingestion slice by explicit product decision. Story 3.6 remains responsible only for recovery/retry after this worker's stage and fence semantics exist. Stories 3.7 and 3.8 are superseded as standalone implementation work; their former acceptance contract is preserved here so validation and relation policy cannot drift.
