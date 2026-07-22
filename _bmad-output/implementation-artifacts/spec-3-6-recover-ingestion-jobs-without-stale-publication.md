---
title: 'Story 3.6: Recover Ingestion Jobs Without Stale Publication'
type: 'feature'
created: '2026-07-22'
status: 'done'
baseline_revision: '49eee21'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-5-run-the-source-version-ai-ingestion-pipeline.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Expired or transiently failed canonical ingestion claims cannot recover. The current worker only claims `queued` jobs and always begins at stage version 1, while completed stage results are transient.

**Approach:** Add a narrowly fenced recovery and resumed-stage execution contract that preserves safe completed-stage operational outputs, schedules retryable work, and prevents old workers from changing cards, evidence, or terminal outcomes.

## Boundaries & Constraints

**Always:** Preserve exact capture-version and submitter provenance; invalidate an old fence before recovery can make work claimable; keep raw capture text, provider payloads, prompts, evidence spans, and fencing tokens out of status, logs, traveler reads, and unbounded durable storage; retain nonterminal capture payloads; leave terminal outcomes immutable.

**Block If:** A bounded checkpoint cannot be stored, schema-validated, and atomically cleared on every terminal transition without retaining protected raw material.

**Never:** Do not reset a canonical job to `queued` and replay the full pipeline; do not repurpose the legacy extraction queue or its stale recovery; do not restore a terminal decision; do not weaken publication fencing or traveler eligibility.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Expired claim | Nonterminal job with expired lease | Recovery invalidates the old fence and makes only the failed stage eligible for a bounded retry | Old commit/publish attempts fail with no mutation |
| Transient stage failure | Retryable provider failure at current stage | Retry is scheduled with a safe code and backoff without replaying prior completed stages | Exhaustion becomes terminal `failed` |
| Terminal job | Published, suppressed, review, verify, or failed job | No recovery or requeue is allowed | Return no claim or safe operational result |

</intent-contract>

## Code Map

- `src/features/knowledge/ingestion-jobs.ts` -- owns source-version claims, versioned checkpoint validation, fenced stage commits, recovery, retry scheduling, and safe status projections.
- `src/features/knowledge/ingestion-pipeline.ts` -- resumes from the claimed stage using bounded checkpoints and clears them in every terminal path.
- `src/features/knowledge/ingestion-worker.ts` -- recovers expired canonical claims before claiming one due nonterminal stage.
- `src/db/schema.ts` and `drizzle/migrations/0045_recover_knowledge_ingestion_jobs.sql` -- define bounded internal checkpoint persistence and reconcile old unrecoverable staged jobs safely.
- `tests/knowledge-ingestion-jobs.test.ts` and `tests/knowledge-ingestion-pipeline.test.ts` -- establish claim/fence and publication safety baselines that recovery must preserve.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and a generated forward-only Drizzle migration -- add a nullable, internal `checkpoint` JSONB object to canonical ingestion jobs with object-only and 8 KiB constraints -- provide bounded durable stage state without exposing it in job status projections; terminal and migration-reconciled jobs clear it.
- [x] `src/features/knowledge/ingestion-jobs.ts` -- define and validate the internal versioned checkpoint contract, write it atomically with fenced nonterminal stage transitions, clear it with terminal transitions, and add recovery/retry plus generalized nonterminal-stage claiming -- completed work resumes at its current stage with a new fence while old workers lose compare-and-swap authority.
- [x] `src/features/knowledge/ingestion-pipeline.ts` -- resume from the claimed stage using revalidated checkpoint data; persist triage, validated extraction metadata and span offsets, independent judgment, then relation decision after each successful stage -- provider calls before the current stage are never repeated; the terminal publish/suppress/review/verify/failed transaction deletes the checkpoint.
- [x] `src/features/knowledge/ingestion-worker.ts` and `scripts/knowledge-ingestion-worker.ts` -- recover expired canonical claims before selecting one due nonterminal job and process its actual stage/version -- worker output remains safe and does not serialize checkpoints.
- [x] `tests/knowledge-ingestion-jobs.test.ts`, `tests/knowledge-ingestion-pipeline.test.ts`, and `tests/knowledge-source-capture-retention.test.ts` -- cover recovery fencing, retry exhaustion, terminal immutability, no-repeat stage/provider behavior, terminal checkpoint deletion, checkpoint privacy/validation, migration behavior, and capture retention -- prove recovery cannot create stale publication.

**Acceptance Criteria:**
- Given a stage succeeds and advances a nonterminal job, when its fenced transition commits, then it atomically stores only the corresponding bounded, schema-validated checkpoint and increments stage version.
- Given a worker lease expires or a retryable stage failure is scheduled, when recovery runs, then the job remains at its failed executable stage with valid prior checkpoints, gets a new fence when claimed, and never re-executes a completed provider stage.
- Given recovery invalidates a stale claim, when the old worker attempts a stage commit or publish, then it is rejected without changing cards, evidence, or terminal outcome and a safe failure/requeue code remains observable.
- Given a job reaches `published`, `suppressed`, `review_recommended`, `verify_first`, or `failed`, when its terminal mutation commits, then all checkpoint data and claim fields are cleared atomically and the terminal job cannot be requeued.

## Design Notes

Each nonterminal checkpoint is one internal versioned JSON object, capped at 8 KiB. Triage stores only `passed`; extraction stores normalized validated card fields, model ID, prompt version, and evidence offsets, reconstructing the quote from the retained immutable capture on resume; judgment stores bounded decision scores and summary; relation stores only action and target-card ID. No raw source text, prompt, provider response, evidence quote, candidate list, or fence is retained. A malformed checkpoint fails closed. A terminal mutation clears `checkpoint` in the same fenced update that clears the claim.

## Verification

- `pnpm test:run tests/knowledge-ingestion-jobs.test.ts tests/knowledge-ingestion-pipeline.test.ts tests/knowledge-source-capture-retention.test.ts` -- expected: stage-specific recovery, old-fence rejection, terminal immutability, privacy, and retention coverage pass.
- `pnpm lint` -- expected: success.
- `pnpm typecheck` -- expected: success.
- `pnpm build` -- expected: success.

## Auto Run Result

Status: done

Checkpoint policy: after each completed nonterminal stage, atomically retain a bounded internal checkpoint; delete all checkpoint data atomically on terminal completion.

Implemented a versioned, 8 KiB-limited internal checkpoint with strict application and database validation. Expired claims invalidate their old fence before recovery; retryable provider failures preserve the current executable stage while exhausted attempts terminalize immediately. Resumed pipeline stages reconstruct bounded evidence from the immutable capture and never repeat completed provider calls. Every terminal outcome clears checkpoints and claims atomically.

Files changed: `drizzle/migrations/0045_recover_knowledge_ingestion_jobs.sql`, `drizzle/migrations/meta/_journal.json`, `src/db/schema.ts`, `src/features/knowledge/ingestion-jobs.ts`, `src/features/knowledge/ingestion-pipeline.ts`, `src/features/knowledge/ingestion-worker.ts`, `tests/knowledge-ingestion-jobs.test.ts`, and `tests/knowledge-ingestion-pipeline.test.ts`.

Verification passed: focused ingestion and retention tests (46 tests), `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

## Review Triage Log

### 2026-07-22 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 2, medium 2)
- defer: 0
- reject: 1 (medium 1)
- addressed_findings:
  - `[high]` `[patch]` Terminalized pre-checkpoint staged jobs in migration and recovery so old in-progress jobs cannot remain permanently unclaimable.
  - `[medium]` `[patch]` Made the final retry attempt transition to `failed` atomically instead of waiting for a later recovery run.
  - `[medium]` `[patch]` Preserved the extraction checkpoint's model identity when a resumed judgment stage succeeds.
  - `[high]` `[patch]` Skipped evaluation-model selection when resuming an already checkpointed relation stage directly to publication.
