---
title: '6.5 Run Public MVP Answer Evaluation Prompt Set'
type: 'feature'
created: '2026-07-11'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '0b0d23dd2b8e82a5518c828ee72046d14620ea61'
final_revision: 'uncommitted working tree based on 0b0d23dd2b8e82a5518c828ee72046d14620ea61'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-4-capture-answer-usefulness-feedback.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** XuyenViet has answer provenance, retrieval decisions, usage events, and traveler usefulness feedback, but no standard public-MVP evaluation prompt set or stored scoring loop. Product changes cannot be compared consistently against the Epic 6 quality rubric.

**Approach:** Add a Feedback/Eval owned evaluation runner that configures the five required public-MVP prompts, records evaluation runs and per-prompt outputs, links outputs to persisted assistant answers/provenance where available, and stores rubric scores plus counter-metric flags.

## Boundaries & Constraints

**Always:** Keep evaluation data in PostgreSQL with Drizzle schema and migrations. Require admin/operator access for starting evaluation runs. Store prompt-set version, prompt type, model version, run metadata, and one result per configured prompt. Score the six rubric dimensions from 1 to 10: user-context use, practical specificity, source grounding, uncertainty handling, family-awareness when relevant, and Vietnamese clarity. Record unsupported-claim, missing-uncertainty, and no-better-than-generic-ChatGPT flags. Use existing model catalog, usage-event, message, retrieval-decision, and provenance patterns instead of raw provider payload storage.

**Block If:** A real provider call is required for normal tests, an evaluation run cannot be associated with an admin/operator actor, or implementation would need to expose raw source material, provider payloads, secrets, or operator-only notes in evaluation data.

**Never:** Do not build the Story 6.6 quality dashboard, traveler-facing evaluation UI, rewards/credits, public anonymous runs, browser automation, or a new test framework. Do not treat evaluation scoring as traveler feedback or overwrite existing answer usefulness ratings.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Start standard run | Admin/operator starts public-MVP evaluation | A run is created and exactly five required prompt results are produced for magic-moment family trip, sparse-data, freshness-sensitive, service/activity, and route logistics | No error expected |
| Non-admin run | Traveler or unauthenticated actor starts evaluation | No run or result rows are written | Return a typed unauthorized failure without leaking admin state |
| Missing evaluation model | No active default evaluation-capable model exists | No partial run results are created | Return a typed configuration failure |
| Scored output | Evaluator returns valid dimension scores and flags | Scores are stored with the result and all dimensions remain within 1-10 | No error expected |
| Invalid score payload | Evaluator returns missing, non-integer, or out-of-range scores | Result is marked failed or unscored with a safe error code | Do not store malformed scores or raw evaluator payload |
| Counter metrics | Unsupported claim, missing uncertainty, or generic-quality flag is detected | The result stores the corresponding review flag for later dashboard/reporting | No error expected |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- Owns evaluation prompt-set/run/result/score tables, enum-like values, FKs, checks, and exports.
- `drizzle/migrations/*` -- Adds evaluation tables and migration metadata.
- `src/features/feedback/evaluation.ts` -- New server-only evaluation prompt definitions, runner, validation, typed results, and persistence logic.
- `src/features/feedback/evaluation-actions.ts` -- Admin/operator protected server action wrapper if UI/server-action entry is needed.
- `src/features/ai/models.ts` -- Existing evaluation-capable model selection via `requiredCapabilities.evaluation`.
- `src/features/ai/gateway.ts` -- Existing non-streaming AI gateway call pattern to reuse or minimally generalize for evaluator scoring.
- `src/features/usage/events.ts` -- Existing usage event writer and prompt-version constants; add evaluation purpose/version constants.
- `src/app/api/ai-ask/stream/route.ts` -- Canonical answer-generation/provenance ordering to preserve when evaluation produces assistant answers.
- `src/features/retrieval/provenance.ts` -- Existing retrieval decision/provenance persistence and safe formatting patterns.
- `tests/public-mvp-evaluation.test.ts` -- New focused coverage for run creation, five prompt types, scoring bounds, flags, auth, and safe persistence.
- `tests/ai-models.test.ts` and `tests/ai-usage-events.test.ts` -- Existing tests to extend only if evaluation capability or usage constants need regression coverage.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Story status tracking.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/*` -- Add public-MVP evaluation prompt set/run/result/score storage with version fields, actor ownership, prompt type checks, status checks, score bounds, counter-metric flags, and optional links to assistant message, retrieval decision, provenance, and usage event rows -- preserves comparable quality data and dashboard traceability.
- [x] `src/features/feedback/evaluation.ts` -- Add the five required prompt definitions and a server-only run function that validates admin/operator actor, selects an active evaluation-capable model, creates a run, produces/stores one result per prompt, validates scoring output, records counter metrics, and returns safe run summaries -- implements the evaluation loop without exposing raw internals.
- [x] `src/features/ai/gateway.ts` and `src/features/usage/events.ts` -- Add or reuse a purpose-neutral non-streaming completion path and evaluation prompt/usage constants so generated answers and scorer calls can record model version, prompt version, status, latency, and token/cost metadata -- keeps evaluation observable and consistent with existing AI usage reporting.
- [x] `tests/public-mvp-evaluation.test.ts` -- Cover the edge-case matrix: five prompt configuration, successful run persistence, score bounds, counter-metric flags, unauthorized actor rejection, missing model failure, malformed score handling, and absence of raw provider/source payload persistence -- verifies the story behavior.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- Mark Story 6.5 in progress/review/done as implementation and review progress -- keeps BMad artifacts aligned.

**Acceptance Criteria:**
- Given the five public-MVP evaluation prompts are configured, when an evaluation run starts, then the system runs or records outputs for the magic-moment family trip prompt, sparse-data prompt, freshness-sensitive prompt, service/activity prompt, and route logistics prompt.
- Given an evaluation output is stored, when the record is inspected, then it includes prompt-set version, prompt type, prompt version, model version, actor, run metadata, status, and any assistant/provenance/usage links available for that output.
- Given evaluation outputs are generated, when scoring runs, then every scored answer has user-context use, practical specificity, source grounding, uncertainty handling, family-awareness, and Vietnamese clarity scores within the 1-10 rubric.
- Given evaluation detects unsupported claims, missing uncertainty labels, or no-better-than-generic-ChatGPT quality, when results are stored, then those counter-metric flags are persisted for review.
- Given a non-admin/non-operator or unauthenticated actor attempts to start a run, when the evaluation entrypoint is called, then no evaluation run or result rows are written.
- Given normal automated tests run, when evaluation behavior is verified, then no real AI provider, web-search provider, or live database outside the configured test database is required.

## Spec Change Log

- 2026-07-11 -- Implemented public MVP answer evaluation prompt set storage, runner, evaluation gateway support, usage constants, and focused tests. Status moved to review.

## Review Triage Log

### 2026-07-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 6, low 1)
- defer: 0
- reject: 4
- addressed_findings:
  - `[medium]` `[patch]` Stored evaluation result scores in the same transaction as the scored result so a score insert failure cannot leave a scored result without rubric scores.
  - `[medium]` `[patch]` Added an explicit `running` evaluation-run state and nullable `completed_at`, preventing fresh or interrupted runs from looking completed before finalization.
  - `[medium]` `[patch]` Preserved malformed boolean flags as invalid score payloads instead of silently converting missing or mistyped counter-metric flags to false.
  - `[medium]` `[patch]` Classified malformed scorer JSON and missing score/flag payloads as `invalid_score_payload` rather than generic evaluator failure.
  - `[medium]` `[patch]` Routed evaluation usage writes through the injected DB handle and generated usage IDs before insert so tests and future transaction-aware callers use the same database path.
  - `[medium]` `[patch]` Stored successful evaluation usage event IDs on evaluation results so cost/token/latency records are traceable from results.
  - `[low]` `[patch]` Normalized the redundant Drizzle-generated follow-up migration back into the uncommitted `0030_rare_peter_parker.sql` migration and confirmed no schema drift.

## Design Notes

For this story, a deterministic test scorer is acceptable behind dependency injection for automated tests, but production code must preserve the same persistence shape used by model-backed scoring. The dashboard is deliberately deferred to Story 6.6; this story only creates trustworthy stored signals and safe summaries.

## Verification

**Commands:**
- `pnpm test:run tests/public-mvp-evaluation.test.ts` -- expected: evaluation persistence and scoring tests pass.
- `pnpm typecheck` -- expected: TypeScript passes.
- `pnpm lint` -- expected: ESLint passes.
- `pnpm build` -- expected: production build passes.

**Results:**
- `pnpm db:generate` -- passed; generated `0030_rare_peter_parker.sql` and `meta/0030_snapshot.json` after normalizing Drizzle's initially duplicated `0029` prefix to the next migration entry.
- `pnpm test:run tests/public-mvp-evaluation.test.ts` -- first run failed because the test mocked `@/server/auth` by importing the real module, which pulled NextAuth's `next/server` ESM path in Vitest; fixed with a direct auth mock.
- `pnpm test:run tests/public-mvp-evaluation.test.ts` -- second run failed because the local test database migration ledger was polluted by the discarded duplicate `0029` migration generation; reset only the configured local test database `public` and `drizzle` schemas.
- `pnpm test:run tests/public-mvp-evaluation.test.ts` -- passed, 6 tests.
- `pnpm typecheck` -- first run failed on strict parsing of unknown scorer JSON; fixed by narrowing parsed score/flag payloads.
- `pnpm typecheck` -- passed.
- `pnpm test:run tests/public-mvp-evaluation.test.ts tests/ai-models.test.ts tests/ai-usage-events.test.ts` -- passed, 25 tests.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.
- `pnpm db:generate` -- passed with no schema changes, confirming `0030` migration metadata is consistent.
- Review patch: `pnpm typecheck` -- first run failed because the scorer output type lacked optional `usageEventId` and the usage-event test DB mock did not support a `.returning()` chain; fixed by adding optional `usageEventId` and using an app-generated usage event ID before insert.
- Review patch: `pnpm test:run tests/public-mvp-evaluation.test.ts tests/ai-usage-events.test.ts` -- first run failed for the same usage-event `.returning()` mock shape; fixed with app-generated IDs.
- Review patch: `pnpm typecheck` -- passed.
- Review patch: `pnpm test:run tests/public-mvp-evaluation.test.ts tests/ai-usage-events.test.ts` -- passed, 11 tests.
- Review patch: `pnpm db:generate` -- first run generated redundant `0030_young_marvex.sql` after the lifecycle schema fix; folded the change into the uncommitted `0030_rare_peter_parker.sql` migration and removed the redundant journal entry/file.
- Review patch: `pnpm db:generate` -- passed with no schema changes.
- Review patch: reset only the configured local `DATABASE_URL_TEST` database `public` and `drizzle` schemas after an earlier uncommitted `0030` migration shape had already been applied locally.
- Review patch: `pnpm test:run tests/public-mvp-evaluation.test.ts tests/ai-models.test.ts tests/ai-usage-events.test.ts` -- passed, 25 tests.
- Review patch: `pnpm typecheck` -- passed.
- Review patch: `pnpm lint` -- passed.
- Review patch: `pnpm build` -- passed.

## Dev Agent Record

### Completion Notes

- Added Drizzle schema and migration storage for public MVP evaluation prompt sets, runs, per-prompt results, and per-dimension scores.
- Added five required public MVP prompt definitions and a server-only Feedback/Eval runner with admin/operator authorization, evaluation model selection, safe result summaries, score validation, and counter-metric flags.
- Added a non-streaming `completeEvaluation` AI Gateway path by generalizing the existing completion helper while preserving the extraction entrypoint.
- Added evaluation usage purpose and prompt-version constants so model-backed evaluation calls can write normal usage events with pricing/token metadata.
- Added focused integration coverage for prompt configuration, authorization, missing model behavior, successful persistence, score bounds, counter metrics, malformed scorer payloads, DB constraints, and absence of raw provider/source payload persistence.
- Did not build Story 6.6 dashboard or any traveler-facing evaluation UI.

### File List

- `src/db/schema.ts`
- `drizzle/migrations/0030_rare_peter_parker.sql`
- `drizzle/migrations/meta/_journal.json`
- `drizzle/migrations/meta/0030_snapshot.json`
- `src/features/feedback/evaluation.ts`
- `src/features/feedback/evaluation-actions.ts`
- `src/features/ai/gateway.ts`
- `src/features/usage/events.ts`
- `tests/public-mvp-evaluation.test.ts`
- `_bmad-output/implementation-artifacts/spec-6-5-run-public-mvp-answer-evaluation-prompt-set.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Auto Run Result

Status: done

Summary: Implemented Story 6.5 by adding DB-backed public MVP evaluation prompt sets, runs, prompt results, rubric scores, counter-metric flags, model-backed scoring support, usage tracking, admin/operator entrypoint, and focused tests.

Files changed:
- `src/db/schema.ts` -- Added public MVP evaluation prompt-set, run, result, and score tables with checks, FKs, status values, and schema exports.
- `drizzle/migrations/0030_rare_peter_parker.sql` -- Added the evaluation tables and constraints.
- `drizzle/migrations/meta/_journal.json` and `drizzle/migrations/meta/0030_snapshot.json` -- Added Drizzle metadata for migration 0030.
- `src/features/feedback/evaluation.ts` -- Added the five standard prompts, admin/operator runner, score validation, persistence, usage linking, and safe summaries.
- `src/features/feedback/evaluation-actions.ts` -- Added protected server-action wrapper for evaluation runs.
- `src/features/ai/gateway.ts` -- Added non-streaming evaluation completion support while preserving extraction behavior.
- `src/features/usage/events.ts` -- Added evaluation usage constants and returned generated usage event IDs from usage writes.
- `tests/public-mvp-evaluation.test.ts` -- Added coverage for prompt configuration, auth, missing model, scoring bounds, counter metrics, DB constraints, malformed payload handling, and safe persistence.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Story 6.5 done.
- `_bmad-output/implementation-artifacts/spec-6-5-run-public-mvp-answer-evaluation-prompt-set.md` -- Recorded spec, implementation, review, verification, and final status.

Review findings breakdown: 7 patches applied, 0 deferred, 4 rejected. Follow-up review recommendation: false.

Verification performed:
- `pnpm test:run tests/public-mvp-evaluation.test.ts tests/ai-models.test.ts tests/ai-usage-events.test.ts` -- passed, 25 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `pnpm db:generate` -- passed with no schema changes after migration normalization.
- `pnpm build` -- passed.

Residual risks: Production scoring depends on the configured evaluation model returning strict JSON; malformed output is safely stored as a failed result. Story 6.6 still needs dashboard/reporting over these stored quality signals. Evaluation results support assistant/provenance/retrieval links, but this story only populates usage links for the model-backed scoring path.
