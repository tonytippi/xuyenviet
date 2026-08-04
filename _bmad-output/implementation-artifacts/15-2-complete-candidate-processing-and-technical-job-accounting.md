---
baseline_commit: e909c8610679b88429ba5cdd436606287d99a6c3
---

# Story 15.2: Complete Candidate Processing and Technical Job Accounting

Status: done

## Story

As an operator,
I want ingestion jobs to report technical progress and candidate outcomes accurately,
so that mixed candidate outcomes do not misrepresent a source's processing state.

## Acceptance Criteria

1. Given a Worker discovers candidates from an immutable capture, when candidate processing reaches a terminal outcome, then completed candidates persist immutable non-null `apply`, `needs_operator`, or `discard` disposition and reason, and failed candidates persist neither business field.
2. Given discovery has not terminalized or any persisted candidate remains `queued` or `processing`, when a job attempts to become `completed`, then the transition is rejected and its technical status remains non-terminal.
3. Given discovery is terminal and every candidate is `completed` or `failed`, when the Worker completes the job under the existing lease/fence protocol, then it writes only technical `completed` status and the four counters exactly match transactional, idempotent candidate-row projections.
4. Given retry, duplicate delivery, expired lease, stale fence, or a newer capture, when obsolete work attempts a candidate or job mutation, then existing lease, fencing, and version checks reject it and no active card or immutable candidate outcome changes.

## Tasks / Subtasks

- [x] Replace procedural candidate counter increments with one Database-owned, transaction-scoped technical-accounting helper that projects all four counters from persisted candidate rows in the same transaction. (AC: 3)
  - [x] `candidateCount` is every candidate for the job.
  - [x] `completedCandidateCount` and `failedCandidateCount` are candidate processing-state counts.
  - [x] `needsOperatorCandidateCount` is only completed candidates with `aiDisposition = needs_operator`.
  - [x] Do not use counters to decide lifecycle, retrieval, or terminality; terminality must inspect persisted candidate states.
- [x] Make successful lifecycle-owned candidate completion reuse that accounting/finalization path without adding a second card, recommendation, audit, or index writer. (AC: 1, 3, 4)
  - [x] Keep `transitionKnowledgeCard` as the sole writer for candidate-to-card association and lifecycle-caused effects.
  - [x] Preserve its final candidate lease CAS commit point: losing it must roll back earlier lifecycle effects.
- [x] Make discovery an AI-first durable pipeline stage before setting `discoveryTerminal`. Under the claimed parent lease and current capture/source/payload checks, extract candidate facts from the immutable capture, validate their code-point spans, and persist them idempotently by `(ingestionJobId, fingerprint)`. A no-candidate result is valid only after that discovery attempt terminalizes successfully. (AC: 1-4)
- [x] Define and implement both terminal candidate paths. (AC: 1, 3, 4)
  - [x] Relational `apply` and `needs_operator` completions must use `transitionKnowledgeCard`.
  - [x] A valid AI `discard` completes the candidate with an immutable permitted reason, then performs technical accounting/finalization only. It must not write a card, evidence, work, audit, or index marker.
  - [x] Provider, schema, capture, target-validation, and other technical failures set `processingStatus = failed` with both business fields null; they are not `discard`.
- [x] Make technical candidate failure clear its business outcome, project counters, and conditionally finalize the parent in the same transaction. (AC: 1-3)
- [x] Add expired processing-candidate lease recovery before claims. Requeue a current expired candidate with attempts remaining; terminalize an exhausted candidate as `failed` with both business fields null; project counters and attempt parent finalization transactionally. (AC: 1-4)
  - [x] Recovery must never alter a completed candidate disposition/reason.
  - [x] A prior claimant's stale fencing token must be unable to alter the recovered candidate, its job, or any card.
- [x] Retain the target discovery-terminal and all-candidates-terminal completion gate. A parent may become `completed` only after `discoveryTerminal = true` and no candidate is `queued` or `processing`; clear parent claim fields when terminalizing. (AC: 2-3)
- [x] Preserve existing `FOR UPDATE SKIP LOCKED`, lease, fencing-token, parent status/CAS, current-capture, source-eligibility, and capture-payload checks. (AC: 4)
- [x] Run candidate recovery from the Worker polling path and emit safe recovery observations consistently with existing parent-job recovery telemetry. Candidate recovery has no candidate-owned technical-reason column in the target schema: use the safe Worker observation/result code and existing parent technical fields only where a parent-level failure is actually being recorded. Do not add API/admin ingestion ownership or UI/serialization work. (AC: 4)
- [x] Add serial PostgreSQL coverage for completion gating, mixed outcomes/counters, duplicate delivery, stale fences, supersession, and candidate lease recovery. (AC: 1-4)

### Review Findings

- [x] [Review][Patch] Duplicate delivery can rediscover and add candidates after terminal discovery [packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts:29]
- [x] [Review][Patch] Parent lease recovery requeues or fails a discovery-terminal job while its candidates are still being processed [packages/worker-domain/src/features/knowledge/ingestion-jobs.ts:85]
- [x] [Review][Patch] An expired or obsolete discovery claimant can terminally fail its job [packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts:24]
- [x] [Review][Patch] Production relation evaluation cannot produce the required discard outcome [packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts:87]
- [x] [Review][Patch] Invalid discovered candidates escape the technical discovery-failure path [packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts:32]
- [x] [Review][Patch] Concurrent candidate terminalization can overwrite an accurate counter projection with a stale one [packages/database/src/knowledge-ingestion-accounting.ts:14]

## Dev Notes

### Current Baseline and Required Changes

- Stories 15.1 and 15.3 are complete. The Story 15.2 dependency block in `bmad-dev-auto-result-15-2-blocked-dependency.md` is stale and must not govern this work.
- `packages/worker-domain/src/features/knowledge/ingestion-jobs.ts` already claims parent jobs and candidates with `FOR UPDATE SKIP LOCKED`, leases, and fencing tokens. Keep these claim predicates and the `queued -> running -> completed | failed` parent status vocabulary.
- `finalizeKnowledgeIngestionJob` already prevents completion until discovery is terminal and no candidate is `queued` or `processing`. Extend it or a colocated helper so counter projection and conditional finalization use the same transaction and are safely repeatable.
- `failKnowledgeIngestionCandidate` currently increments `failedCandidateCount` procedurally. Replace this with row-derived projections for all counters, then conditionally finalize the parent.
- `packages/database/src/knowledge-lifecycle.ts` currently increments successful-candidate counters in `transitionCandidateRelation`. Replace those increments with the same shared technical accounting path, inside the existing lifecycle transaction. Do not move lifecycle effects into Worker accounting helpers.
- `recoverKnowledgeIngestionJobs` recovers only expired parent leases. Story 15.2 owns the missing expired `processing` candidate recovery documented in `deferred-work.md`; otherwise such a candidate permanently prevents job completion.
- `packages/worker-domain/src/features/knowledge/ingestion-worker.ts` polls candidates before discovery jobs. Preserve that priority and run candidate recovery before claims. Extend existing safe Worker observations rather than inventing a second worker loop or telemetry contract.
- `runKnowledgeIngestionPipeline` must perform durable AI-first candidate discovery before terminalization: invoke the configured extraction/discovery step, validate candidate facts and Unicode code-point spans against the immutable capture, and persist candidates idempotently by `(ingestionJobId, fingerprint)` before it sets `discoveryTerminal = true`. A no-candidate result may terminalize discovery only after a successful discovery attempt persists zero candidates. Counters do not substitute for this check.
- `runKnowledgeIngestionCandidatePipeline` must remain thin: it validates current capture/source/payload eligibility, gets bounded system-owned relation context, invokes and validates the AI relation decider, and delegates relational persistence to `transitionKnowledgeCard`. The observed shortlist is AI context, not an authority or fence. A current-capture/source/payload failure or invalid relation may technically fail only a still-current candidate. A lifecycle `stale` result or lost final candidate CAS changes no candidate, job, card, work, audit, or index state.

### Mandatory Invariants

- Job state is technical execution only. Never add a rolled-up publication/business result to `knowledge_ingestion_jobs`.
- Candidate processing state is `queued | processing | completed | failed`. Only a completed candidate has immutable nonblank `aiDisposition` and `outcomeReasonCode`; failed, queued, and processing candidates have both fields null.
- Human/operator resolution changes card, work, and audit state only. It never rewrites an AI candidate disposition or reason.
- Candidate counters are observability projections. They are not authority for card lifecycle, retrieval, recommendation work, or parent completion.
- `transitionKnowledgeCard` remains the only production writer for card lifecycle, verification requirement, recommendation state, candidate-card association, lifecycle audit, and lifecycle-driven index invalidation. Do not add a direct card/recommendation write as an accounting shortcut.
- Worker is the only continuous ingestion claimer/processor. API requests and `apps/admin` must not claim jobs or execute ingestion/index loops. `apps/admin` remains presentation-only and must not import database or Worker code.
- Automated mutations retain the `system-knowledge-pipeline` Audit actor. Source submitter/requester provenance remains a real-user field and is not the automated executor.
- This is a target-only clean break. Do not restore legacy stages, business statuses, aliases, fallback reads, dual writes, legacy fixtures, or compatibility behavior.

### AI-First Discovery and Relation Semantics

- Candidate discovery and relation evaluation are Worker-owned AI steps. AI never writes database rows or selects an arbitrary card ID outside the bounded system context.
- The system supplies a deterministic bounded same-type shortlist of cards in `draft`, `pending_operator`, `active`, or `suppressed`. `archived` and `rejected` cards are excluded.
- Relation output has one canonical mapping: `attach -> apply/applied`, `create -> apply/applied`, `conflict -> needs_operator/conflict`, and `ambiguous -> needs_operator/relation_ambiguous`. Reject blank rationale, malformed output, unknown kinds, forged/missing targets, and non-canonical disposition/reason combinations as technical failure while the candidate lease remains current.
- At commit, `transitionKnowledgeCard` recomputes the authoritative eligible shortlist. An `attach` or `conflict` target must be in that current shortlist. A concurrent shortlist change alone must not invalidate `create` or `ambiguous`; a no-longer-eligible target is invalid without lifecycle side effects.
- New evidence associated with a `suppressed` card must reopen it only to `pending_operator` with `operator_required` and one appropriate fenced primary work item. It must never auto-reactivate the card.
- A valid `discard` is a completed immutable AI business outcome, using an allowed reason such as `weak_evidence` or `policy_rejected`. It has no card association or lifecycle effect. It is distinct from a technical `failed` candidate.

### Candidate Recovery Policy

- Operate only on candidates still `processing` whose lease has expired. Lock/restrict each mutation so an active claimant or completed candidate is unaffected.
- When `attemptCount < maxAttempts`, move the expired candidate back to `queued`, clear claim/lease/fence fields, set `nextRunAt` to the recovery time, and emit the safe recovery observation. Do not invent candidate reason persistence without an approved schema change.
- When `attemptCount >= maxAttempts`, move it to `failed`, clear claim/lease/fence fields and both business fields, emit a safe recovery/failure observation, project parent counters, and attempt parent finalization. Update parent `lastErrorCode` or `requeueReasonCode` only when recording a true parent-level technical failure, never as lossy per-candidate state.
- Recovery must be idempotent: a second recovery pass finds no changed candidate and must not change counters, attempts, job status, card state, work, audit, or index data.
- Preserve parent-job recovery semantics. Do not allow a parent to complete until discovery and every candidate are terminal, and do not let parent recovery create an alternate candidate completion path.

### File and Boundary Guidance

- Add/update: `packages/database/src/knowledge-ingestion-accounting.ts` (or another narrowly named Database-owned module)
  - Export the transaction-scoped candidate-row counter projection and conditional technical parent finalization primitive used by both lifecycle and Worker code.
  - It must accept the existing Database transaction rather than opening a nested transaction, and it must not write cards, recommendations, audits, or index state.
- Update: `packages/worker-domain/src/features/knowledge/ingestion-jobs.ts`
  - Keep claim locking and terminal parent claim cleanup.
  - Call the Database-owned accounting primitive after technical failure and from candidate lease recovery; retain Worker-domain ownership of claiming and continuous recovery orchestration.
- Update: `packages/database/src/knowledge-lifecycle.ts`
  - Call the Database-owned accounting/finalization primitive after the final candidate CAS succeeds, without making it a lifecycle writer.
  - Do not import `@xuyenviet/worker-domain`; Worker-domain already depends on Database.
- Update: `packages/worker-domain/src/features/knowledge/ingestion-worker.ts`
  - Invoke candidate recovery before claims and preserve candidate-first polling plus the current observation shape.
- Update: `packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts`
  - Implement the required durable AI-first discovery-before-terminal path while preserving current parent lease/fence and capture/source/current-version validation.
  - Keep relational persistence delegated to `transitionKnowledgeCard`; modify candidate processing only for the canonical AI-decision, discard, stale-result, and shared-accounting rules in this story.
- Tests: `tests/knowledge-ingestion-jobs.test.ts`, `tests/knowledge-ingestion-pipeline.test.ts`, and, only if observation/runtime behavior changes, `tests/worker-runtime.test.ts` or `tests/worker-adapter-boundary.test.ts`.
- Do not change schema/migrations for candidate recovery reasons: the target candidate shape intentionally has no technical-reason column, and safe Worker observations provide the operational signal. Story 15.1 intentionally assigns cross-row accounting and terminality to transactional commands, not triggers.

### Required Test Matrix

- A completed candidate persists each valid immutable outcome shape; every failed path leaves `aiDisposition` and `outcomeReasonCode` null.
- Parent completion is blocked when discovery is false, with a queued candidate, and with a processing candidate.
- Terminal discovery plus mixed completed (`apply` and `needs_operator`) and failed candidates produces exact values for all four counters and technical `completed` parent status.
- A no-candidate terminal discovery completes with zero counters.
- Discovery persists validated candidate facts idempotently before it sets `discoveryTerminal`; a no-candidate result is terminal only after a successful AI discovery attempt. Validate Unicode code-point spans against the immutable capture and reject stale parent/capture/source/payload work before durable persistence.
- Repeated finalization, retry, and duplicate candidate delivery cannot double-count or rewrite a completed candidate outcome.
- A stale/expired candidate fencing token cannot mutate the candidate, job counters/status, card, recommendation, audit, or index effects.
- Newer capture, ineligible source, or deleted payload causes stale candidate technical failure only and cannot mutate a card or immutable outcome from obsolete work.
- Candidate lease recovery requeues before exhaustion, terminalizes at exhaustion, clears fields correctly, projects counters exactly, and permits eventual parent completion only after discovery and all candidates are terminal.
- A valid `discard` stores immutable `discard` plus allowed reason, projects counters, can complete the technical parent, and creates no card, evidence, recommendation, audit, or index effect.
- Canonical AI relation mappings accept only `attach`, `create`, `conflict`, and `ambiguous` with their defined disposition/reason pairs. Provider failure, malformed output, forged target, and unsupported mappings technically fail only the still-current candidate with null business fields.
- A lifecycle `stale` result, expired/lost candidate lease, or final-CAS loss leaves candidate outcome, parent counters/status, card, evidence, recommendation, audit, and index data unchanged.
- A changed observed shortlist does not itself fail `create` or `ambiguous`; an `attach` or `conflict` target absent from the command's current shortlist is rejected without lifecycle effects. Cover suppressed-card attachment/reopening without auto-activation and archived/rejected exclusion.
- Tests are PostgreSQL integration tests: call `resetTestDatabase()` in each suite setup, use `DATABASE_URL_TEST` via existing helpers, and remain serial. Do not add a global reset hook or integration parallelism.

### Verification

```bash
pnpm test:integration -- tests/knowledge-ingestion-jobs.test.ts
pnpm test:integration -- tests/knowledge-ingestion-pipeline.test.ts
pnpm test:integration -- tests/worker-adapter-boundary.test.ts
pnpm test:integration -- tests/knowledge-lifecycle-transition-matrix.test.ts
pnpm typecheck
pnpm test:integration
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.2]
- [Source: _bmad-output/implementation-artifacts/epic-15-context.md#Requirements & Constraints]
- [Source: _bmad-output/implementation-artifacts/15-1-establish-the-target-lifecycle-schema.md#Completion Notes List]
- [Source: _bmad-output/implementation-artifacts/15-3-centralize-version-fenced-lifecycle-transitions.md#Dev Notes]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from spec-15-1-establish-target-lifecycle-schema]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-25]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-26]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Transition Ownership]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Acceptance Criteria]
- [Source: _bmad-output/project-context.md#Testing Rules]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- 2026-08-04: Resolved the integration fixture isolation, target schema default, stale seed-count, migration-plan, writer-inventory, projection, and validation-test blockers. Full serial integration suite now passes.
### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- 2026-08-04: Prepared after confirming Stories 15.1 and 15.3 are done. The guide specifies target-only accounting, lifecycle-boundary preservation, candidate lease recovery, and serial PostgreSQL regression coverage.
- 2026-08-04: Added a Database-owned transaction-scoped candidate counter projection and conditional parent finalization primitive. Lifecycle completion, technical candidate failure, discard completion, discovery, and expired candidate recovery use it without introducing a second lifecycle writer.
- 2026-08-04: Implemented durable AI-first candidate discovery with current parent/capture/source/payload fencing, validated Unicode code-point spans, and idempotent `(ingestionJobId, fingerprint)` persistence before discovery terminalization.
- 2026-08-04: Added discard completion and candidate lease recovery, including safe Worker failure/retry telemetry. Focused serial PostgreSQL coverage passed: 4 files, 27 tests.
- 2026-08-04: Restored repository validation by adding the forward migration for the target card-state default, test-local database resets, type-safe admin recommendation projection, and updated target-contract fixtures. Full serial integration passed: 42 files, 363 tests. `pnpm typecheck`, `pnpm lint` (0 errors), `pnpm build`, and `git diff --check` pass. Story is ready for review.

### File List

- _bmad-output/implementation-artifacts/15-2-complete-candidate-processing-and-technical-job-accounting.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- apps/api/src/common/safe-validation.pipe.ts
- drizzle/migrations/0039_fix_target_knowledge_card_default.sql
- drizzle/migrations/meta/_journal.json
- packages/contracts/src/index.ts
- packages/database/src/admin-knowledge-review.ts
- packages/database/src/index.ts
- packages/database/src/knowledge-ingestion-accounting.ts
- packages/database/src/knowledge-lifecycle.ts
- packages/database/src/knowledge-recommendations.ts
- packages/worker-domain/src/features/knowledge/ingestion-jobs.ts
- packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts
- packages/worker-domain/src/features/knowledge/ingestion-worker.ts
- packages/worker-domain/src/features/knowledge/review-approval-core.ts
- tests/ai-ask-commands.test.ts
- tests/ai-ask-stream-execution.test.ts
- tests/domain-outbox.test.ts
- tests/drizzle-migration-plan.test.ts
- tests/knowledge-ingestion-jobs.test.ts
- tests/knowledge-ingestion-pipeline.test.ts
- tests/knowledge-lifecycle-writer-boundary.test.ts
- tests/knowledge-search.test.ts
- tests/safe-validation.pipe.test.ts
- tests/story-8-5-clean-break.test.ts
- tests/story-8-6-actor-isolation.test.ts
- tests/worker-adapter-boundary.test.ts

## Change Log

- 2026-08-04: Implemented transactional candidate accounting, durable discovery, candidate terminal paths, lease recovery, and targeted integration coverage.
- 2026-08-04: Restored repository-wide validation, added target default migration and type-safe recommendation detail projection, and moved the story to review.
- 2026-08-04: Resolved six BMad code-review findings: fenced duplicate/stale discovery, excluded discovery-terminal parents from parent recovery, enabled production discard decisions, validated discovery output before persistence, and serialized candidate terminal accounting. Focused serial integration (367 tests), typecheck, and diff check passed.
