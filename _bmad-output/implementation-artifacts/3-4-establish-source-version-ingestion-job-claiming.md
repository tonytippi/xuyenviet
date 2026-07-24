---
title: "Story 3.4: Establish Source-Version Ingestion Job Claiming"
type: feature
created: "2026-07-22"
status: done
epic: 3
story: 3.4
baseline_revision: 7fbc1e1
baseline_commit: 7fbc1e1
context:
  - "{project-root}/_bmad-output/project-context.md"
  - "{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md"
  - "{project-root}/_bmad-output/planning-artifacts/epics.md"
  - "{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md"
  - "{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md"
warnings:
  - "Do not repurpose the legacy knowledge_extraction_jobs queue as the AI-first ingestion aggregate. Its source-scoped duplicate policy, extract/approve modes, draft result fields, and running lock semantics are a compatibility path that later stories must retire deliberately."
  - "Do not run AI triage/extraction/judging/relation work, attach evidence, create/update cards, or publish outcomes. Story 3.4 creates and claims durable source-version work only."
  - "Do not implement stale-lease recovery, retries, requeue policy, or stage-result commits. Persist the required state for Story 3.6, but leave recovery behavior to that story."
  - "A queued or claimed job never makes a card, evidence record, source, or search document traveler-eligible. Preserve Story 3.3's evidence-backed fail-closed retrieval boundary."
---

# Story 3.4: Establish Source-Version Ingestion Job Claiming

Status: done

## Story

As a product owner,
I want one durable ingestion job per source capture version,
so that workers can identify and safely claim the current pipeline work.

## Acceptance Criteria

1. **Durable source-version job creation**
   - Given a readable capture version is ready,
   - When Knowledge creates an ingestion job,
   - Then exactly one canonical ingestion job is created at `queued` for that exact capture version, with source identity, immutable submitter provenance, initial stage version, and safe retry metadata,
   - And a database uniqueness constraint prevents a second canonical job for the same capture version.

2. **Recapture preserves provenance**
   - Given a source is recaptured,
   - When a new immutable readable capture version is appended,
   - Then a distinct queued ingestion job is created for the new version,
   - And the prior version/job, its submitter provenance, and its future terminal outcome are never overwritten or reassigned.

3. **Transactional, fenced stage claim**
   - Given a worker claims a `queued` job stage,
   - When it performs stage work,
   - Then the claim is selected transactionally with `FOR UPDATE SKIP LOCKED` and is conditioned on the expected stage/version,
   - And the successful claim records a unique fencing token, worker identity, claimed time, finite lease expiration, and expected stage/version for later compare-and-swap commits.

4. **Safe observable expiry boundary**
   - Given a worker does not complete its claim,
   - When its lease expiry passes,
    - Then the expired claim remains observable as expired work while retaining its prior claim and fencing fields for later stale-worker rejection, without a silent publication, state advance, ownership transfer, or requeue,
   - And Story 3.6 will own the explicit retry/recovery transition and reject stale-worker results.

## Scope And Decisions

### Canonical aggregate and lifecycle

- Add a new Knowledge-owned canonical `knowledge_ingestion_jobs` table. Do not mutate the legacy `knowledge_extraction_jobs` table into the new aggregate in this story. Existing legacy extraction/admin paths must remain operational until Story 3.5 performs an intentional cutover.
- A canonical job is uniquely identified by `capture_version_id`. It must also store `source_id` and use a composite `(capture_version_id, source_id)` foreign key to `source_capture_versions(id, source_id)`, preventing cross-source linkage.
- A newly created job has `stage = queued`, `stage_version = 1`, no active claim, zero attempts, a bounded max-attempt/retry configuration, and safe nullable failure/requeue fields. The new job must reference a readable, non-tombstoned immutable capture version; it never stores raw capture text, metadata, prompts, provider payloads, or extraction output.
- Define the full canonical state vocabulary now: `queued`, `triaging`, `extracting`, `judging`, `relating`, `published`, `suppressed`, `review_recommended`, `verify_first`, and `failed`. Story 3.4 may claim only `queued`; Stories 3.5-3.8 own normal stage advancement and terminal outcomes.
- `stage_version` is a positive integer and increments only when a future successful stage transition changes the stage. Claiming a stage does not advance it. A future stage result must compare the job ID, expected stage, stage version, and fencing token before it changes cards, evidence, or outcome.
- Preserve submitter provenance on job creation as the source submitter identity. The future automated actor is `system-knowledge-pipeline`; never attribute pipeline mutations to the submitter merely because they created the source/job.

### Claim contract

- Expose a narrow, server-only Knowledge function for canonical job creation and a separate narrow claim function. Do not expose generic table CRUD or a traveler-facing route/action.
- Claim only a currently `queued` job whose `stage_version` equals the caller's selected expected value, whose scheduled-at/retry timestamp is due, and whose `attempt_count < max_attempts`. Use one short transaction: select the candidate with `FOR UPDATE SKIP LOCKED`, then update it with the same expected `queued` stage, stage-version, and remaining-attempt predicates.
- Generate a cryptographically strong opaque fencing token in application code. Store it only on the active claim. The returned claim includes the token, capture-version ID, source ID, stage, stage version, and lease expiry. Do not log the token or return raw capture data.
- Store `claimed_by`, `claimed_at`, `lease_expires_at`, and `fencing_token`. A claim lease must be finite and configured through a bounded server environment setting with a safe default; document the variable and bounds in code/tests. Do not reuse the legacy `locked_at`/`locked_by` fields.
- Claim observability may provide an operator-safe server read model with job ID, source/capture-version identifiers, stage, stage version, attempt count, worker ID, claimed/lease timestamps, and safe error/requeue codes. It must exclude raw capture content, raw metadata, quote/span, provider payloads, and secret/fencing values.
- Do not automatically steal, clear, or reassign an expired claim in Story 3.4. A claim function must not treat a stale active claim as claimable until Story 3.6 introduces an explicit fenced recovery/requeue command. Expiry is derived from `lease_expires_at <= now`, while the prior claim and fencing fields remain stored and observable.

### Job creation integration

- Make capture append plus canonical job creation atomic for all readable capture writers. The transaction that appends/selects a readable immutable capture version must create its canonical queued job before commit, so no committed readable version lacks durable pipeline work.
- Integrate through `appendSourceCaptureVersion` or a small same-feature orchestration helper that is called inside the existing source writer transaction. Preserve the source-local advisory lock and immutable version/current-pointer behavior.
- Cover generic source intake, batch readable intake, operator-confirmed Facebook capture, and YouTube readable capture. Queued/unreadable Facebook URLs and screenshot/file-only material without readable text create no capture-version job.
- If a database uniqueness conflict occurs after a retry/concurrent call, return the existing canonical job for that capture version rather than creating a duplicate or changing its provenance. This idempotency must not overwrite actor/source/version fields.
- Do not wire legacy manual "extract drafts" and "extract and approve all" forms to execute the canonical pipeline yet. Their existing `knowledge_extraction_jobs` behavior remains a separately tested compatibility boundary until Story 3.5 replaces it.

### Migration and integrity order

1. Run `pnpm db:generate` from the current journal and use the generated next migration/snapshot/journal entry. Do not edit historical migrations.
2. Add `knowledge_ingestion_jobs` with source/capture version identity, stage/stage-version, submitter provenance, safe retry/failure/requeue metadata, claim/lease/fencing fields, timestamps, constraints, and indexes.
3. Enforce `UNIQUE(capture_version_id)` and the composite same-source capture-version foreign key. Add queue-claim and lease-observability indexes that begin with current stage/due time or current lease expiry as appropriate.
4. Add database checks for the declared stage values, `stage_version >= 1`, non-negative attempts within bounded maximum, safe code lengths/formats, and claim shape: terminal rows have all claim fields null; a nonterminal row may be unclaimed with all `claimed_by`, `claimed_at`, `lease_expires_at`, and `fencing_token` null, or claimed with all four non-null and `lease_expires_at > claimed_at`. A claimed `queued` row is valid because claiming does not advance `stage` in Story 3.4.
5. Backfill exactly one canonical `queued` job for every readable, non-tombstoned existing capture version that has no canonical job. Preserve immutable source/version and source submitter provenance. Do not derive terminal states from legacy extraction jobs/cards, copy legacy draft IDs, or silently infer pipeline completion.
6. Record only concise migration/report reasons for any source version that cannot safely receive a job. A missing/tombstoned/unreadable capture remains without a job and is not eligible for work.
7. Move all new readable capture writers to atomic append-and-job creation. Do not remove the legacy queue/table or its existing foreign keys in this story.

## Tasks / Subtasks

- [x] Define canonical ingestion job types, schema, and forward-only migration (AC: 1, 2, 3, 4)
  - [x] Add `KnowledgeIngestionStage` and a Drizzle `knowledgeIngestionJobs` table in `src/db/schema.ts`; keep legacy extraction-job types/table unchanged.
  - [x] Add source/capture-version identity, immutable submitter provenance, `stage`, `stageVersion`, attempts/max attempts, due/retry metadata, safe failure/requeue reason fields, claim worker/time/lease/fencing fields, and timestamps.
  - [x] Add unique capture-version ownership, composite source-version FK, claim/due/lease indexes, and restrictive checks described above.
  - [x] Generate the next migration/snapshot/journal entry and add reviewed forward-only SQL to backfill only readable non-tombstoned historical capture versions as queued canonical jobs. Preserve legacy jobs unchanged.

- [x] Add Knowledge-owned canonical job creation and safe operator read models (AC: 1, 2)
  - [x] Create a server-only module such as `src/features/knowledge/ingestion-jobs.ts`; keep creation, claim, and safe status projection in this owning module.
  - [x] Implement idempotent `ensureIngestionJobForCaptureVersion` using the exact immutable capture version, source identity, and source submitter provenance. It must reject unreadable/tombstoned/mismatched versions before insert.
  - [x] Handle expected unique conflicts by loading and returning the already-created canonical job without modifying its immutable provenance.
  - [x] Expose only a safe operational status projection. It must not read or serialize raw capture text/metadata, provider data, evidence quote/span, audit payloads, or a fencing token.

- [x] Atomically enqueue canonical work when readable capture versions are committed (AC: 1, 2)
  - [x] Update `appendSourceCaptureVersion` or an equivalent same-feature transaction helper to create the canonical queued job before returning the new version.
  - [x] Update all append callers: `src/features/knowledge/actions.ts`, `batch-intake.ts`, `facebook-capture.ts`, and `youtube-capture.ts`. Preserve their source locking, input limits, exact-version links, capture privacy, and current-pointer behavior.
  - [x] Confirm recapture creates a new capture version and new canonical job while a prior version/job remains immutable and queryable.
  - [x] Keep unreadable Facebook queue entries and file-only/non-readable sources out of canonical job creation.

- [x] Implement transactional fenced claiming without stage execution (AC: 3, 4)
  - [x] Add a server-only `claimNextKnowledgeIngestionJob` (or similarly explicit) function that selects one due `queued` canonical job with `FOR UPDATE SKIP LOCKED` in a short database transaction.
  - [x] Require/update the expected `stage = queued`, `stageVersion`, and `attemptCount < maxAttempts` in the mutation predicate; atomically allocate a unique fencing token, worker ID, claimed timestamp, finite lease expiry, and incremented claim attempt count.
  - [x] Return `null` when no eligible job is available or when the compare-and-swap predicate loses. Return a typed claim only after the mutation succeeds.
  - [x] Do not call the provider, read raw text, advance stage, create evidence/cards, publish a result, retry, or requeue any job from this function.
  - [x] Add a safe expired-claim/status read that reports expiry without changing it. Defer explicit recovery, retry scheduling, and stale-token result rejection implementation to Story 3.6.

- [x] Preserve legacy behavior and public safety boundaries (AC: 1-4)
  - [x] Keep `src/features/knowledge/extraction-jobs.ts`, legacy worker scripts, Facebook review extraction flows, and legacy draft approval behavior functioning until Story 3.5 migration work explicitly changes them.
  - [x] Do not alter `isKnowledgeCardTravelerEligible`, evidence validation, search/indexing eligibility, source bundles, or traveler UI.
  - [x] Keep all canonical ingestion APIs server-only and operator/worker scoped. No public routes, client imports, or traveler payloads may expose source-version job internals.
  - [x] Update `retainExpiredFacebookCaptureVersions` and its tests so a canonical ingestion job in any nonterminal stage (`queued`, `triaging`, `extracting`, `judging`, or `relating`), including an expired unrecovered claim, blocks tombstoning its capture version. A terminal canonical job may follow the existing no-active/no-reviewable-card retention policy. Preserve the legacy extraction-job blocker unchanged.

- [x] Add migration and behavior coverage (AC: 1-4)
  - [x] Add a migration backfill fixture that seeds readable, unreadable, and tombstoned versions, executes the generated `0043` backfill, and asserts actual backfill rows/provenance.
  - [x] Extend source-capture/intake/Facebook/YouTube tests to assert a readable committed capture receives exactly one canonical queued job and unreadable captures receive none.
  - [x] Assert a recapture produces two capture versions and two immutable canonical jobs with distinct capture references and preserved original submitter provenance.
  - [x] Assert a duplicate/concurrent ensure operation results in exactly one canonical job for a capture version.
  - [x] Assert concurrent workers claim the same due job at most once; the winner has a non-empty unique fence, expected stage/version, worker identity, and future lease expiry.
  - [x] Assert a stale expected stage/version cannot claim a changed job; an exhausted queued job returns `null` without modifying attempts, claim fields, stage, or retry metadata; an expired claim remains observable but cannot be silently reclaimed in Story 3.4.
  - [x] Assert Facebook retention cannot tombstone a capture version with a queued, claimed, or expired-unrecovered canonical ingestion job and can re-evaluate eligibility after the job reaches a terminal stage.
- [x] Assert job records/log projections contain no raw-capture marker, metadata, provider payload, evidence quote/span, or fencing token; existing traveler retrieval remains evidence-backed and fail-closed.

### Review Findings

- [x] [Review][Patch] Revalidate the capture inside the creation write boundary [src/features/knowledge/ingestion-jobs.ts:62] — Resolved with a locked `INSERT ... SELECT` that repeats readable/non-tombstoned capture and submitter checks.
- [x] [Review][Patch] Exclude invalid submitter emails from migration backfill [drizzle/migrations/0043_wealthy_glorian.sql:57] — Resolved by filtering to the table's required trimmed 1-320 character email range.
- [x] [Review][Patch] Use one explicit UTC time basis for queue due times [src/features/knowledge/ingestion-jobs.ts:106] — Resolved by storing new/backfilled due times with `timezone('UTC', now())` and comparing claims with the same UTC conversion.
- [x] [Review][Patch] Test 0043 against an actual pre-migration fixture [tests/knowledge-ingestion-jobs.test.ts:126] — Resolved with a transaction-isolated pre-0043 schema fixture that applies every migration statement.
- [x] [Review][Patch] Cover concurrent canonical job creation [tests/knowledge-ingestion-jobs.test.ts:44] — Resolved with parallel ensure calls against one readable unqueued capture version.
- [x] [Review][Patch] Cover all required retry, claim-shape, stale, and exhausted-job invariants [tests/knowledge-ingestion-jobs.test.ts:90] — Resolved with before/after exhausted-job assertions and direct retry/claim-shape database constraint coverage.

## Developer Guardrails

### Existing behavior to replace later, not adapt accidentally

- `knowledge_extraction_jobs` is a legacy source-scoped queue with `extract_only`/`extract_and_approve_all`, `queued/running/succeeded/failed/cancelled`, source-level duplicate prevention, result draft IDs, and `lockedAt/lockedBy`. It freezes the current capture version at enqueue time, but it cannot model one job per version, stage versions, leases, or fencing. [Source: `src/db/schema.ts:394-447`; `src/features/knowledge/extraction-jobs.ts:28-90`]
- The legacy worker already uses `FOR UPDATE SKIP LOCKED`, but its claim changes the whole job to `running` and has no stage/version or fence. Reuse the PostgreSQL locking pattern, not its aggregate semantics. [Source: `src/features/knowledge/extraction-jobs.ts:150-185`]
- Legacy worker recovery immediately requeues/fails stale running jobs. Do not invoke, copy, or expand that recovery behavior for canonical jobs in this story; Story 3.6 owns that contract. [Source: `src/features/knowledge/extraction-jobs.ts:317-347`]

### Must preserve

- Source capture versions are immutable, exact-version references with a source-local sequence and a current pointer. Capture appends are source-locked; raw material is operator-only. [Source: `src/features/knowledge/source-captures.ts:102-130`; `src/db/schema.ts:285-318`]
- Every readable new capture must be normalized, size-limited, safe-metadata validated, and selected as current atomically. A repeated confirmed recapture still gets a distinct version. [Source: `_bmad-output/implementation-artifacts/3-2-create-immutable-source-capture-versions-and-retention-boundaries.md:57-67`]
- Story 3.3 requires valid bounded active evidence plus all state/retrieval gates before traveler eligibility. A job is operational metadata only and cannot relax this predicate. [Source: `_bmad-output/implementation-artifacts/spec-3-3-backfill-bounded-evidence-and-verify-legacy-retrieval-safety.md:24-30`; `src/features/knowledge/state.ts`]
- Raw capture text, raw metadata, provider payloads, audit details, and operator-only evidence never enter traveler source bundles or UI. [Source: `ARCHITECTURE-SPINE.md:146-150`; `ARCHITECTURE-SPINE.md:552-565`]
- Knowledge owns capture/job/card/evidence mutations; use server-only, typed feature entrypoints and Drizzle-owned migrations. Do not export generic cross-module upserts/deletes. [Source: `_bmad-output/project-context.md:42-48`; `ARCHITECTURE-SPINE.md:116-130`]
- Facebook capture remains an operator-controlled visible-browser operation, never a traveler action, request-path scraper, or unattended crawler. [Source: `ARCHITECTURE-SPINE.md:152-166`; `docs/runbooks/facebook-capture.md`]

### Likely files

| File | Required change / preservation |
| --- | --- |
| `src/db/schema.ts` | Add the separate canonical ingestion-job types/table, strict constraints, unique capture version identity, and indexes. Preserve the legacy extraction table and all Story 3.1-3.3 tables. |
| `drizzle/migrations/0043_*.sql` and `drizzle/migrations/meta/*` | Generate forward-only schema/snapshot/journal changes, then review/add conservative readable-version backfill SQL. Do not edit prior migrations. |
| `src/features/knowledge/ingestion-jobs.ts` (new) | Server-only canonical ensure/create, safe operational projection, and fenced `SKIP LOCKED` claim functions. No AI stage execution. |
| `src/features/knowledge/source-captures.ts` | Orchestrate atomic creation of the canonical job after immutable readable version insertion; preserve validation and locking, and block retention tombstoning while a canonical nonterminal job needs the capture payload. |
| `src/features/knowledge/actions.ts` | Preserve source intake transaction behavior while receiving the new automatic job contract; do not cut manual extraction forms over to the canonical worker yet. |
| `src/features/knowledge/batch-intake.ts` | Ensure every readable batch-created version gets canonical work atomically without changing seed/retrieval eligibility. |
| `src/features/knowledge/facebook-capture.ts` | Confirmed visible-text capture creates the version and canonical job; queued/unreadable capture does not. Preserve browser/privacy safeguards. |
| `src/features/knowledge/youtube-capture.ts` | Readable, bounded operator-only capture versions create canonical jobs without exposing Gemini material or changing its capture limits. |
| `src/features/knowledge/extraction-jobs.ts` | Preserve as legacy compatibility implementation. Do not merge its lifecycle into the new aggregate in this story. |
| `tests/knowledge-ingestion-jobs.test.ts` (new) | Database-backed schema/creation/concurrency/lease/fence/privacy coverage, plus an isolated pre-`0043` migration fixture for actual backfill behavior. |
| `tests/knowledge-source-intake.test.ts`, `tests/knowledge-batch-source-intake.test.ts`, `tests/facebook-capture*.test.ts`, `tests/youtube-capture*.test.ts` | Assert readable capture-to-job atomicity and recapture provenance without weakening existing capture tests. |
| `tests/knowledge-extraction-worker.test.ts` | Preserve and adjust only as necessary to demonstrate legacy queue compatibility remains intact. |
| `tests/knowledge-source-capture-retention.test.ts` | Preserve capture payloads for queued, claimed, and expired-unrecovered canonical jobs; retain existing legacy blocker coverage. |

### Out Of Scope

- Running triage, extraction, independent judging, relation matching, evidence attachment, card creation/update, publication, or terminal outcomes (Stories 3.5, 3.7, and 3.8).
- Retry scheduling, explicit requeue reasons, stale-lease recovery, stage resume behavior, or stale-worker mutation rejection (Story 3.6).
- Transactional card/audit/index dirty-marker state changes and source removal propagation (Stories 3.9 and 3.10).
- Any traveler-facing job status, raw source/capture display, retrieval/source-bundle change, or approval queue redesign.
- Rewriting historical legacy extraction-job records into assumed pipeline outcomes.

## Testing Requirements

Run focused database tests with safe separate `DATABASE_URL` and `DATABASE_URL_TEST`; Vitest migrates/resets `DATABASE_URL_TEST`. Do not run `db:reset` as routine verification or apply migrations to an unspecified environment.

```bash
pnpm db:generate
pnpm test:run tests/knowledge-ingestion-jobs.test.ts tests/knowledge-source-intake.test.ts tests/knowledge-batch-source-intake.test.ts tests/knowledge-source-capture-retention.test.ts tests/facebook-capture.test.ts tests/facebook-capture-review.test.ts tests/youtube-capture.test.ts tests/knowledge-extraction-worker.test.ts tests/knowledge-search.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Required assertions:

- Database constraints reject duplicate canonical jobs for one capture version, cross-source capture links, invalid stage values, invalid stage version, invalid retry values, and invalid claim shapes.
- An isolated pre-`0043` migration fixture proves the generated migration backfill creates one queued canonical job only for readable, non-tombstoned versions and preserves source submitter provenance without inferring stage completion from legacy cards/jobs.
- Each source writer atomically commits a readable version plus exactly one canonical job; no readable committed version is left without its job after successful mutation.
- Concurrent ensure/create and claim calls are idempotent: exactly one job exists and exactly one worker receives its claim. Jobs at their maximum attempt count are not selected or mutated by claims.
- Claim records a unique non-empty fence, expected stage/version, bounded finite lease, safe worker identity, and no stage/card/evidence/publication effects.
- Stale expected stage/version claim updates fail; expired claims retain their original worker/fencing fields, are visible, and are not implicitly recovered, cleared, or reclaimed.
- Facebook retention preserves capture payloads for all nonterminal canonical ingestion jobs, including expired unrecovered claims.
- No job table/read model/log contains raw source marker, raw metadata, provider payload, evidence quote/span, or fencing token. Existing evidence-backed search/retrieval tests remain passing.

## Previous Story Intelligence

- Story 3.2 made immutable capture versions the exact provenance target and deliberately left the replacement source-version job state machine to Story 3.4. Its legacy extraction compatibility path freezes a capture version before provider work, but its source-level duplicate policy cannot be reused for one-job-per-version ingestion. [Source: `_bmad-output/implementation-artifacts/3-2-create-immutable-source-capture-versions-and-retention-boundaries.md:65-67`; `:111-114`]
- Story 3.3 added capture-versioned bounded evidence and conservative fail-closed eligibility. Do not use a canonical job as evidence or create any path around current card/evidence/source/capture checks. [Source: `_bmad-output/implementation-artifacts/spec-3-3-backfill-bounded-evidence-and-verify-legacy-retrieval-safety.md:20-30`; `:115-120`]
- Story 3.3 review hardening requires database-side bounded candidate selection. Keep claim scans `LIMIT`ed in SQL and do not accumulate an unbounded in-memory queue. [Source: `_bmad-output/implementation-artifacts/spec-3-3-backfill-bounded-evidence-and-verify-legacy-retrieval-safety.md:70-75`]

## Git Intelligence

- `7fbc1e1 Fix: harden knowledge evidence retrieval` is the baseline. Preserve current evidence/source/capture fail-closed search behavior and the latest bounded candidate scans.
- `cc6d7a5 Feat: backfill bounded knowledge evidence` established the `knowledge_card_evidence` ownership and current retrieval boundary. Canonical job work must remain operational-only.
- The current migration journal ends at `0042_fix_source_touch_trigger`; generate the next migration from the journal rather than choosing a numeric filename manually. [Source: `drizzle/migrations/meta/_journal.json`]

## References

- Story and acceptance criteria: [_bmad-output/planning-artifacts/epics.md:354-370](../planning-artifacts/epics.md)
- Epic 3 contract and cross-story boundaries: [_bmad-output/implementation-artifacts/epic-3-context.md:39-50](epic-3-context.md)
- Canonical ingestion/claim architecture: [ARCHITECTURE-SPINE.md:423-433](../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md)
- Pipeline lifecycle and retention: [community-knowledge-solution-design.md:36-58](../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md)
- Immutable capture boundary: [_bmad-output/implementation-artifacts/3-2-create-immutable-source-capture-versions-and-retention-boundaries.md:53-88](3-2-create-immutable-source-capture-versions-and-retention-boundaries.md)
- Evidence/retrieval safety boundary: [_bmad-output/implementation-artifacts/spec-3-3-backfill-bounded-evidence-and-verify-legacy-retrieval-safety.md:20-30](spec-3-3-backfill-bounded-evidence-and-verify-legacy-retrieval-safety.md)
- Existing legacy queue implementation: [`src/features/knowledge/extraction-jobs.ts`](../../src/features/knowledge/extraction-jobs.ts)
- Project engineering constraints: [_bmad-output/project-context.md:25-104](../project-context.md)

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- Ultimate context engine analysis completed - comprehensive developer guide created.
- The current source-scoped legacy extraction queue already uses `FOR UPDATE SKIP LOCKED`, but cannot satisfy source-version uniqueness, stage versioning, leases, or fencing. Story 3.4 introduces a separate canonical aggregate and preserves that queue until the pipeline cutover.

### Completion Notes List

- Story context created from the revised AI-first Epic 3 contract, completed Story 3.2 immutable captures, completed Story 3.3 bounded evidence/retrieval safety, and implementation baseline `7fbc1e1`.
- Status set to `ready-for-dev`; implementation must validate this story before development.
- Implemented the separate `knowledge_ingestion_jobs` aggregate with immutable source-version provenance, constrained lifecycle/claim shape, queue and lease indexes, and a forward-only `0043` migration that backfills only readable, retained capture versions.
- Added server-only idempotent creation, safe status projection, and transactional `FOR UPDATE SKIP LOCKED` fenced claiming. Claims keep `stage = queued`, use a bounded `KNOWLEDGE_INGESTION_CLAIM_LEASE_MS` lease, and never recover, requeue, publish, or execute AI work.
- Readable capture appends now create their canonical job atomically for all existing intake paths. Facebook retention blocks nonterminal canonical jobs, including expired unrecovered claims. Legacy extraction jobs and traveler retrieval behavior remain unchanged.
- Verification passed: `pnpm test:run tests/knowledge-ingestion-jobs.test.ts tests/knowledge-source-intake.test.ts tests/knowledge-batch-source-intake.test.ts tests/knowledge-source-capture-retention.test.ts tests/facebook-capture.test.ts tests/facebook-capture-review.test.ts tests/youtube-capture.test.ts tests/knowledge-extraction-worker.test.ts tests/knowledge-search.test.ts` (115 tests), `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

### File List

- `_bmad-output/implementation-artifacts/3-4-establish-source-version-ingestion-job-claiming.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0043_wealthy_glorian.sql`
- `drizzle/migrations/meta/0043_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/db/schema.ts`
- `src/features/knowledge/ingestion-jobs.ts`
- `src/features/knowledge/source-captures.ts`
- `tests/knowledge-ingestion-jobs.test.ts`
- `tests/knowledge-source-capture-retention.test.ts`
- `tests/knowledge-source-intake.test.ts`
- `tests/youtube-capture.test.ts`

### Change Log

- 2026-07-22: Created comprehensive Story 3.4 implementation context and canonical source-version ingestion-job claiming contract.
- 2026-07-22: Implemented canonical source-version ingestion jobs, atomic capture enqueueing, fenced claiming, retention protection, migration/backfill, and database-backed coverage. Status set to review.
- 2026-07-22: Code review fixed atomic capture revalidation, backfill provenance validation, UTC due-time comparison, and required migration/concurrency/constraint coverage. Status set to done.
