---
baseline_commit: 6f9a3a4
---

# Story 8.3: Attribute Knowledge, Capture, and AI Work to System Executors

Status: review

## Story

As an operator,
I want automated knowledge and AI workflows to preserve their human provenance while naming the actual executor,
so that a worker never impersonates the person who submitted or requested work.

## Acceptance Criteria

1. **Knowledge-worker attribution**
   - Given an operator submits a source and a knowledge worker later triages, extracts, judges, relates, indexes, or recovers it,
   - When the worker records side effects, transitions, recommendations, cards, or usage,
   - Then those automated records use `system-knowledge-pipeline` as executor while source/job submitter and human requester fields retain the real person.
   - And retries and worker-only work never write new side effects as the submitting operator.

2. **Executor-bearing knowledge and capture artifacts**
   - Given a knowledge card, knowledge source suggestion, automated knowledge recommendation resolution/supersession, source/capture artifact, or indexing record needs execution attribution,
   - When its persistence and writer are migrated,
    - Then every automated write stores required, nonblank, cataloged `executor_system` with an index beginning on that column; human-only writes retain their existing real-user provenance and never invent a system executor.
   - And `created_by_user_id`, `resolved_by_user_id`, `submitted_by_user_id`, and every other semantically human field remain real-user provenance and are nullable only where an automated historical record requires it.

3. **Synchronous authenticated orchestration**
   - Given synchronous authenticated model orchestration records usage or an automated artifact,
   - When it writes through the typed boundary,
   - Then it records `system-ai-orchestration` as executor and retains the authenticated person as `initiated_by_user_id` where applicable.
   - And autonomous retries and worker-only work do not appear in person metrics.

4. **Facebook and YouTube capture provenance**
   - Given Facebook or approved YouTube capture creates source material or discovered sources,
   - When capture provenance is stored,
   - Then Facebook uses `system-facebook-capture` and YouTube uses `system-youtube-capture`, while `sources.submitted_by_user_id` remains the originating real person and source lineage is retained.
   - And capture neither creates a system user nor accepts a session-shaped system identity or authorization privilege.

## Tasks / Subtasks

- [x] Define executor persistence shapes and migration (AC: 1, 2, 3, 4)
  - [x] Update `src/db/schema.ts` and add the next ordered Drizzle migration plus journal entry. Add nullable system-only `executor_system` columns where a table also has valid human writes; require a nonblank cataloged value for each automated shape and add executor-leading indexes. Apply this to automated knowledge cards, knowledge source suggestions, automated recommendation creation/resolution/supersession, automated source-capture versions, and actual indexing execution/projection records. Preserve the existing real-user provenance shape for manually submitted capture versions and human-triggered queue writes; do not invent a system executor for them. `knowledge_index_dirty_markers` is the durable queue and execution-transition record: human enqueue writes receive no false executor, while fenced worker claim/retry/complete transitions persist `system-knowledge-pipeline`; the search document records the successful projection executor.
  - [x] Preserve human-only FKs: `sources.submitted_by_user_id`, ingestion/extraction job submitter/requester fields, card human creator fields, and recommendation human resolver fields. Do not make these polymorphic or write a system ID into them.
  - [x] Make the recommendation shapes explicit: human-created open recommendations have no system executor; pipeline-created recommendations, including automatic sampling, persist `executor_system = system-knowledge-pipeline`; an operator resolution retains its real `resolved_by_user_id` and never substitutes a system user; automated supersession has null human resolver and `executor_system = system-knowledge-pipeline`. Preserve creation attribution through later human resolution rather than overloading `resolved_by_user_id`. Make automated cards/suggestions nullable in their existing human-creator fields, while preserving human-created rows. Reject mixed, missing, blank, and unknown automated-executor shapes with explicit `IS NOT NULL` guards.
  - [x] Apply the AD-31 disposable-development-data condition. If the target database has durable customer/operational data, stop implementation and obtain an expand-migrate-contract design; do not silently backfill fake-user history.

- [x] Migrate canonical knowledge pipeline and recommendation writers (AC: 1, 2)
  - [x] In `src/features/knowledge/ingestion-pipeline.ts`, remove `systemActorId`, `systemActorEmail`, and the fake `systemRecommendationActor`. Use `createSystemAuditActor("system-knowledge-pipeline")` and `recordAuditEvent(..., tx)` for every pipeline audit write, retaining the supplied transaction.
  - [x] Persist `executorSystem: "system-knowledge-pipeline"` on worker-created/updated cards, recommendations, and indexing artifacts. Retain existing fencing, advisory-lock order, compare-and-swap conditions, candidate terminalization, evidence policy, and best-effort telemetry behavior.
  - [x] In `src/features/knowledge/recommendations.ts`, replace `RecommendationActor` where it models automated execution. Automatic sampling/supersession must use the cataloged pipeline executor; real operator resolution and sampling-cohort escalation must keep their real user actor and `resolved_by_user_id`.
  - [x] Do not reintroduce direct `auditEvents` inserts. The Audit-owned writer is the only allowed path for pipeline audit rows.

- [x] Attribute extraction, synchronous AI artifacts, and indexing correctly (AC: 1, 2, 3)
  - [x] In `src/features/knowledge/extraction-jobs.ts` and `src/features/knowledge/extraction.ts`, separate job requester provenance from worker execution. A queued extraction job keeps its real `createdByUserId`/email. `processKnowledgeExtractionJob`, retries, draft creation, audit, and worker usage execute as `system-knowledge-pipeline`; each worker transition is attributed through its paired Audit-owned event, not by adding a polymorphic executor to requester fields.
  - [x] Keep direct authenticated extraction in `extraction.ts` and source suggestion generation in `suggestions.ts` associated with the real requester/initiator while persisting `executorSystem: "system-ai-orchestration"` on generated cards/suggestions. Retain the already-correct explicit `writeAiUsageEvent` contract.
  - [x] In `src/features/knowledge/source-captures.ts`, make the shared `appendSourceCaptureVersion` boundary accept validated automated executor attribution when applicable, alongside existing real-user provenance; it must reject user-like executor metadata identifiers.
  - [x] In `src/features/knowledge/indexing-queue.ts`, `src/features/knowledge/indexing-worker.ts`, `scripts/knowledge-indexing-worker.ts`, and `src/features/knowledge/search.ts`, distinguish human enqueue from system claim/projection/retry/complete execution. Persist `system-knowledge-pipeline` only on actual execution/projection artifacts and conflict updates without weakening marker claims, fencing tokens, or stale-version disablement.
  - [x] Update worker paths that currently require an `AuthenticatedSession` solely for automated review/approval transitions, including `src/features/knowledge/facebook-capture-review.ts` and `src/features/knowledge/review-approval-core.ts`. Model a system-executed terminal shape with nullable human reviewer/approver provenance and a separate validated executor, while retaining real-user-only shapes for operator review and approval; do not fabricate a session or user ID.

- [x] Migrate Facebook and YouTube capture executor contracts (AC: 2, 4)
  - [x] Replace `FacebookCaptureActor` and `YoutubeCaptureActor` session-shaped/fake-user contracts with typed cataloged system execution plus separate real human source provenance.
  - [x] Update `src/features/knowledge/facebook-capture.ts` and `scripts/facebook-capture.ts` to eliminate the fake `FACEBOOK_CAPTURE_SYSTEM_ACTOR` user identity and `users` lookup. Audit and capture-version writes use `system-facebook-capture`; capture metadata must not present the executor as a user ID.
  - [x] Fix `queueDiscoveredFacebookPostsInTransaction`: derive the real submitter from the originating source and write that person to each discovered source's `submittedByUserId`; retain `discoveredFromSourceId` lineage. Never use the capture executor as submitter.
  - [x] Update `src/features/knowledge/youtube-capture.ts` and `scripts/youtube-capture.ts` to use `system-youtube-capture`, remove fake user lookup and `--actor-user-id`/`--actor-email` execution identity behavior, and stop persisting `importActorId` as person provenance. A direct capture must use an existing originating `sources` row with a real submitter, or an explicit validated real-person submitter input used only as source provenance; reject it when neither exists. The executor never fills source submitter provenance, and discovered sources inherit the originating submitter plus `discoveredFromSourceId` lineage.
  - [x] Remove user-like executor fields (`captureActorId`, `importActorId`, and equivalents) from capture metadata types, allowlists, sanitizers, and write paths. If legacy metadata must remain readable, keep it read-compatible but write-forbidden; never reinterpret it as executor or person provenance.
  - [x] Preserve capture safety: operator-controlled Facebook browser flow, no stored credentials/cookies/tokens/full HTML, bounded YouTube evidence only, raw material privacy, and current cache/lock/idempotency behavior.

- [x] Add focused migration and regression coverage (AC: 1, 2, 3, 4)
  - [x] Extend migration/schema tests to reject blank or invalid executors, missing executor attribution on automated shapes, mixed human/executor recommendation resolution, and SQL NULL-bypassable checks. Every executor-bearing feature writer must construct or validate its executor through the Audit-owned catalog boundary before persistence; SQL checks enforce nonblank/shape constraints rather than catalog membership. Assert every executor-bearing table has an index beginning with `executor_system`.
  - [x] Extend `tests/knowledge-ingestion-pipeline.test.ts`, indexing tests, and recommendation tests: system pipeline card/audit/index/recommendation attribution, including pipeline-created sampling recommendations and fenced indexing-marker claim/retry/complete transitions; null human fields for worker-only effects; worker transition Audit attribution with unchanged job requester; preserved source/job submitter; retry/lost-claim safety; no direct audit writer bypass.
  - [x] Extend extraction and suggestions tests: direct authenticated runs retain the real initiator while generated artifacts use `system-ai-orchestration`; worker extraction uses `system-knowledge-pipeline`, never the enqueueing operator.
  - [x] Extend Facebook/YouTube capture and script tests: no system-user lookup/fixture; correct catalog executor; original human submitter and discovered-source lineage retained; direct YouTube capture without real-user source provenance is rejected; no session-shaped executor accepted; legacy user-like executor metadata is not written.
  - [x] Retain `tests/ai-usage-events.test.ts` and admin-user aggregation coverage proving worker-only usage uses null `initiatedByUserId` and cannot enter person metrics.
  - [x] Inventory direct inserts and shared fixtures for every executor-bearing table before making a column non-null for an automated shape. Update `tests/helpers/source-captures.ts`, indexing-worker/search fixtures, and migrated-flow tests so human fixtures stay human-provenance-only and automated fixtures use catalog executors; remove fake-user setup/assertions from migrated-flow tests without deleting Story 8.5's historical migration/seed/helper artifacts.
  - [x] Run focused relevant `pnpm test:run` targets, `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Attempt `pnpm db:generate` for the schema change and record the known non-TTY Drizzle rename-disambiguation blocker exactly if it remains.

## Dev Notes

### Required Domain Contract

- Reuse Audit-owned `SystemAuditActorId`, `AuditActor`, `createSystemAuditActor`, `validateAuditActor`, `isSystemAuditActorId`, `recordAuditEvent`, and `writeAiUsageEvent`. Do not declare feature-local actor/executor unions or accept arbitrary strings.
- The only catalog IDs are `system-ai-orchestration`, `system-knowledge-pipeline`, `system-trip-planning`, `system-facebook-capture`, and `system-youtube-capture`. Labels are catalog metadata, never caller input.
- Executor columns are system-only. A user execution remains represented by a semantically named real-user field; an executor must never be a polymorphic user-or-system field.
- Worker entrypoints construct an Audit system actor directly. They never query `users`, fabricate `AuthenticatedSession`, provide OAuth/session/role data, or acquire authorization privileges.
- `sources.submitted_by_user_id` is always a real person. A captured/discovered source inherits its originating source's human submitter and preserves source lineage; the capture executor is separate.
- `executor_system` describes automated execution only. Tables shared by people and automation use nullable system-only executor storage plus explicit shape checks; a human write never receives a false system executor. Queue enqueue provenance and worker execution must remain distinct.
- Every executor-bearing feature persistence boundary validates a cataloged `SystemAuditActorId` through the Audit-owned constructor or validator before writing. SQL protects nullability and correlated shapes; it does not replace runtime catalog validation.
- `ai_usage_events` already uses the Story 8.2 explicit shape. Do not add a compatibility `userId` alias, re-export a lower-level writer, or change established usage normalization/cost behavior.

### Current State To Change

- `ingestion-pipeline.ts` currently uses `system-knowledge-pipeline` as `createdByUserId`, fake email, direct audit inserts, and recommendation resolver. Replace only those execution identity paths; retain its claim/fence, candidate and evidence behavior.
- `recommendations.ts` currently writes fake pipeline identity to `resolvedByUserId` when superseding stale recommendations. Automated supersession must be an executor shape; human `resolveKnowledgeRecommendation` remains user-scoped.
- `extraction-jobs.ts` currently turns `knowledgeExtractionJobs.createdByUserId/createdByEmail` into the later worker actor. Those fields are requester provenance, not worker identity.
- `facebook-capture.ts` currently supports fake session-shaped system input and writes discovered sources with `input.actor.userId`. This is the critical provenance defect: derive the original source's submitter under the existing transaction before queueing children.
- `youtube-capture.ts` and both capture scripts currently use fake system users and metadata `importActorId` values. Move execution identity to typed catalog attribution and first-class artifact fields.
- `source-captures.ts`, `indexing-queue.ts`, and `search.ts` are shared persistence boundaries. Extend them instead of introducing parallel writes. `knowledge_index_dirty_markers` preserves human enqueue provenance separately from the system worker's fenced execution transitions; the search document records projection execution.
- `facebook-capture-review.ts`, `review-approval-core.ts`, `indexing-worker.ts`, and the indexing worker script contain active worker transitions or execution and must migrate with their owning shared boundaries. `batch-intake.ts` and authenticated source actions remain human capture writers and must continue to work without a system executor.

### Architecture And Regression Guardrails

- Preserve all source eligibility, raw-content privacy, evidence validation, independent judge, retrieval, retention, queue/lease, advisory-lock, compare-and-swap, and index-fencing contracts. Attribution must not weaken any of them.
- Keep transactions intact. Audit, executor attribution, state updates, and indexing dirty marker writes that are currently atomic must use the supplied transaction, not a new global database handle.
- Preserve best-effort telemetry behavior where existing caller code catches usage failures. Do not let an attribution-only refactor turn an already completed model operation into a false user-facing failure.
- Do not expose raw source material, provider payloads, browser credentials, capture cache payloads, or executor diagnostics in traveler/admin UI. This is backend/domain work only.
- SQL checks must explicitly guard nullable values with `IS NOT NULL`; bare boolean predicates are vulnerable to three-valued NULL bypasses.

### Scope Boundaries

- **In scope:** knowledge pipeline and legacy extraction worker attribution; knowledge cards/suggestions/recommendations/capture/index artifacts; synchronous knowledge AI executor fields; Facebook/YouTube capture executor contracts; related migration and focused tests.
- **Not Story 8.4:** `src/features/chat-trips/trip-change-proposals.ts`, proposal-expiry worker, and trip-plan history expiry attribution. Do not change `system-trip-planning` behavior here.
- **Not Story 8.5:** removal of reserved-user migrations, seed fixtures, reset guards, and fake-user test helpers. Story 8.3 removes runtime reliance from its migrated flows but leaves physical clean-break deletion to Story 8.5.
- **Not Story 8.6:** repository-wide final verification/enforcement, clean reset/seed proof, or end-to-end direct-insert audit. Add focused Story 8.3 regression coverage only.
- Do not add new UI, operations reporting UI, dependencies, authentication mechanisms, roles, user ownership semantics, or a durable-data backfill path.

### Project Structure Notes

- Keep Audit contracts in `src/features/audit/`; feature modules import them through `@/*` aliases.
- Keep knowledge ownership in `src/features/knowledge/`; use shared persistence boundaries (`source-captures`, `indexing-queue`, `search`) instead of duplicate helpers.
- Keep database schema in `src/db/schema.ts`, migration files under `drizzle/migrations/`, and test files under `tests/` using existing database-backed test fixtures.
- Use TypeScript strict mode, `server-only` where the existing feature boundary uses it, Drizzle 0.44.5, PostgreSQL, Vitest, and pnpm. Add no dependency.

### Previous Story Intelligence

- Story 8.1 established the closed catalog and fail-closed actor validation. Use its constructors rather than lookalike objects; runtime validation remains required even when static typing appears sufficient.
- Story 8.2 established Audit's typed event/history/usage writers. Preserve injected transaction writers, Audit as the sole public usage writer, nullable worker initiators, and available trip-project usage attribution.
- Story 8.2 found that SQL XOR checks need explicit non-null predicates. Include equivalent executor/recommendation shape tests in this story.
- Known verification limitations from Story 8.2: `pnpm db:generate` is blocked non-interactively by Drizzle's rename-disambiguation prompt; the full suite has documented unrelated failures in an answer-usefulness fixture, two Facebook recovery-page assertions, and an exact-admin fixture. Re-evaluate and record actual results; do not claim they pass without evidence.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-8.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-31-Audit-And-Automated-Execution-Use-First-Class-Actors]
- [Source: _bmad-output/planning-artifacts/proposal-eliminate-fake-system-users-with-audit-actors.md#Separate-Provenance-From-Execution]
- [Source: _bmad-output/implementation-artifacts/8-1-establish-the-audit-actor-boundary-and-system-catalog.md#Known-Future-Consumers-Not-This-Storys-Migration-Scope]
- [Source: _bmad-output/implementation-artifacts/8-2-persist-valid-audit-history-and-usage-attribution.md#Transaction-And-Regression-Guardrails]
- [Source: _bmad-output/project-context.md#Critical-Implementation-Rules]
- [Source: src/features/audit/actors.ts]
- [Source: src/features/audit/events.ts]
- [Source: src/features/audit/usage.ts]
- [Source: src/features/knowledge/ingestion-pipeline.ts]
- [Source: src/features/knowledge/recommendations.ts]
- [Source: src/features/knowledge/extraction-jobs.ts]
- [Source: src/features/knowledge/extraction.ts]
- [Source: src/features/knowledge/suggestions.ts]
- [Source: src/features/knowledge/facebook-capture.ts]
- [Source: src/features/knowledge/youtube-capture.ts]
- [Source: src/features/knowledge/source-captures.ts]
- [Source: src/features/knowledge/indexing-queue.ts]
- [Source: src/features/knowledge/indexing-worker.ts]
- [Source: src/features/knowledge/facebook-capture-review.ts]
- [Source: src/features/knowledge/review-approval-core.ts]
- [Source: src/features/knowledge/batch-intake.ts]
- [Source: src/features/knowledge/search.ts]
- [Source: scripts/facebook-capture.ts]
- [Source: scripts/youtube-capture.ts]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- BMad activation resolved with no prepend/append steps. `_bmad-output/project-context.md` was loaded as the persistent project fact.
- Full Sprint 8 status, Epic 8 contract, AD-31, proposal rationale, completed Story 8.1/8.2 records, current source boundaries, current prior commits, and focused parallel code-path research were analyzed.
- Story context was validated non-interactively against the installed create-story checklist. The final guide makes executor shape, human provenance, migration safety, transaction coupling, direct-write replacement, capture lineage, tests, and later-story exclusions explicit.
- No application code, migration, test execution, commit, code review, or later story was started.
- 2026-07-27: BMad dev-story activation completed. The configured PostgreSQL target contains populated user, source, capture, knowledge, job, audit, AI usage, and operational tables. Under AD-31, its reset-only/disposable status cannot be safely inferred, so implementation halted before any migration or runtime change.
- 2026-07-27: User authorized the populated target as disposable development data. Applied the clean-break migration, reset development/test databases, and completed the in-scope implementation.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story status is `ready-for-dev`. This validation repairs only this Story 8.3 artifact; sprint status remains unchanged.
- Blocker for implementation: if the target database contains durable customer or operational data, stop and replace the clean-break plan with an expand-migrate-contract rollout before applying the migration.
- Known verification blockers to re-check during development: non-TTY Drizzle rename-disambiguation prompt for `pnpm db:generate`, plus the Story 8.2 documented unrelated full-suite failures.
- Blocked before implementation: confirm that the populated configured PostgreSQL database is disposable/reset-only, or provide an expand-migrate-contract design for durable data. No code, migration, or test was run.
- Completed Story 8.3 with first-class Audit-catalog executor attribution for knowledge pipeline, worker extraction, indexing, Facebook capture, and YouTube capture. Human provenance remains in real-user fields.
- Verification: `pnpm db:reset` passed; focused 12-file suite passed (189 tests); `pnpm lint` passed with 3 pre-existing warnings in `tests/knowledge-search.test.ts`; `pnpm typecheck` and `pnpm build` passed. `pnpm db:generate` remains blocked because Drizzle requires an interactive TTY rename prompt. Full-suite run was attempted but timed out after unrelated test-isolation failures.

### File List

- _bmad-output/implementation-artifacts/8-3-attribute-knowledge-capture-and-ai-work-to-system-executors.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- drizzle/migrations/0070_story_8_3_knowledge_executor_attribution.sql
- drizzle/migrations/meta/_journal.json
- src/db/schema.ts
- src/features/knowledge/ingestion-pipeline.ts
- src/features/knowledge/recommendations.ts
- src/features/knowledge/extraction.ts
- src/features/knowledge/extraction-jobs.ts
- src/features/knowledge/suggestions.ts
- src/features/knowledge/source-captures.ts
- src/features/knowledge/indexing-queue.ts
- src/features/knowledge/indexing-worker.ts
- src/features/knowledge/search.ts
- src/features/knowledge/facebook-capture.ts
- src/features/knowledge/facebook-capture-review.ts
- src/features/knowledge/review-approval-core.ts
- src/features/knowledge/youtube-capture.ts
- scripts/facebook-capture.ts
- scripts/youtube-capture.ts
- tests/knowledge-ingestion-pipeline.test.ts
- tests/knowledge-indexing-worker.test.ts
- tests/knowledge-extraction-worker.test.ts
- tests/knowledge-source-suggestions.test.ts
- tests/facebook-capture.test.ts
- tests/facebook-capture-review.test.ts
- tests/facebook-capture-script.test.ts
- tests/facebook-capture-extraction-action.test.ts
- tests/facebook-capture-approve-all-action.test.ts
- tests/youtube-capture.test.ts

## Change Log

- 2026-07-27: Created and non-interactively validated the Story 8.3 implementation guide; status set to `ready-for-dev`. No code, migration, test, commit, review, or later-story work was performed.
- 2026-07-27: Revalidated and repaired document-only attribution guidance for human versus automated artifact writes, worker transition boundaries, capture provenance, indexing execution, and fixture impact; status remains `ready-for-dev`. No code, migration, test, commit, review, or later-story work was performed.
- 2026-07-27: Revalidated again and made recommendation creation, durable indexing-marker execution, and per-writer Audit catalog validation binding requirements; status remains `ready-for-dev`. No code, migration, test, commit, review, or later-story work was performed.
- 2026-07-27: Began `bmad-dev-story` for Story 8.3 and set status to `in-progress`. Halted under AD-31 before implementation because the configured PostgreSQL target is populated and its disposable/reset-only status is not verifiable. No code, migration, test, commit, review, or later-story work was performed.
- 2026-07-27: Completed Story 8.3 under the user-authorized disposable development-data clean break. Added executor attribution schema/migration, migrated in-scope writers, removed runtime fake-user use in scope, and added focused regression coverage. Status set to `review`; no commit created.
