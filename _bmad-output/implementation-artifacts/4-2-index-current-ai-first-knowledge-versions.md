---
baseline_commit: 1be68130079ae2903d457ea0231ecb7a144445ab
---

# Story 4.2: Index Current AI-First Knowledge Versions

Status: done

## Story

As a product owner,
I want search documents to follow current AI-first card versions,
so that the lexical index is a safe projection rather than a source of truth.

## Acceptance Criteria

1. Given a Knowledge mutation creates a dirty active card version, when the indexing worker claims it, it rebuilds or disables the document idempotently by `(knowledge_card_id, content_version)`, and outdated work cannot overwrite a later version.
2. Given a card is suppressed, archived, superseded, withdrawn, or otherwise fails eligibility, when its mutation commits or indexing backfill runs, its projection is disabled and no previously indexed document remains eligible.
3. Given legacy cards are migrated to the AI-first model, when indexing backfill runs, only current state-policy eligible cards receive projections. Worker health, retries, and bounded batches remain compatible with the separately supervised runtime.
4. Given projection work throws or a worker dies after claiming it, when the lease expires or retry becomes due, a supervised worker can reclaim the work with a new fence; an old worker cannot commit, and one failed item cannot terminate unrelated batch items.

## Tasks / Subtasks

### Review Findings

- [x] [Review][Patch] Use a fresh lease timestamp for every claimed-work projection completion and retry [src/features/knowledge/indexing-worker.ts:44] — A batch reuses its start time when committing later claims, so a worker can commit after that claim's real lease expiry and deny the new fence required by AC 4.
- [x] [Review][Patch] Backfill existing documents into current-version work during migration or worker orchestration [drizzle/migrations/0048_deep_red_shift.sql:3] — Existing documents are stamped `content_version = 1`, while retrieval now requires equality with the card; no production path invokes the new backfill, making legacy cards at later versions invisible indefinitely.
- [x] [Review][Patch] Make backfill prove eligibility and disable current-version ineligible projections atomically [src/features/knowledge/indexing-worker.ts:83] — It queues every card and disables only version-mismatched active documents, contrary to the required eligible-only and immediate-disable backfill behavior.
- [x] [Review][Patch] Remove or fence the legacy direct indexing API [src/features/knowledge/search.ts:69] — `indexApprovedKnowledgeCard` remains an exported unfenced upsert without an expected content version or marker claim, bypassing the forward-only projection protocol.
- [x] [Review][Patch] Version and enqueue cards when indexed source metadata changes [src/features/knowledge/youtube-capture.ts:124] — Updating a source label used in `searchable_text` does not increment linked cards' `content_version`, disable their prior projection, or enqueue current work.
- [x] [Review][Patch] Use a consistent source/card lock order for projection and source removal [src/features/knowledge/search.ts:50] — Projection locks its card then source locks, while source removal locks source then cards, permitting a circular database lock wait.
- [x] [Review][Patch] Use one clock authority when selecting and claiming due work [src/features/knowledge/indexing-worker.ts:32] — Due selection uses PostgreSQL `now()` but the guarded claim uses application time, so clock skew can select a marker then repeatedly fail its update guard.

- [x] Define forward-only versioned projection and work-claim persistence (AC: 1-3)
  - [x] Update Drizzle schema and generate the next migration/snapshot/journal entry; never edit historical migrations.
  - [x] Keep one search-document row per card, but add non-null `content_version` and an accepted claim fence (or equivalent monotonic projection fence) to `knowledge_card_search_documents`. Every activation, disablement, and completion must be conditional on the claimed card/version/fence; a document whose version differs from `knowledge_cards.content_version` is not a retrieval candidate.
  - [x] Evolve the existing `knowledge_index_dirty_markers` table into the only durable indexing-work queue. Persist pending/claimed/completed/failed state, `claimed_by`, `claimed_at`, `lease_expires_at`, an opaque monotonically changing fencing token, attempt count, bounded retry scheduling, completion metadata, and bounded safe failure code/reason. Add a due-work index for pending or expired claims ordered by retry time and creation time.
  - [x] Define deterministic duplicate-reason handling for one `(knowledge_card_id, content_version)`: coalesce or claim/acknowledge all applicable markers without performing multiple projections. A superseded claim may complete only as superseded after proving a newer card version or marker exists; it must never acknowledge, delete, or overwrite newer work.
  - [x] Establish `content_version` as the sole projection identity. Every mutation that changes indexed text, eligibility, active support/source set, serialized source metadata, conditions, state, confidence, freshness, display policy, capture validity, or source removal increments `knowledge_cards.content_version` and writes its marker in the same atomic mutation. Keep `evidence_set_revision` only for recommendation compare-and-swap/audit; it must not distinguish index work.
  - [x] Update known evidence-only producer gaps: `attachEvidence` in `ingestion-pipeline.ts` and the remaining-eligible path in `source-removal.ts` must increment `content_version` whenever their change affects a projection, not only `evidence_set_revision` or a material suppression/downgrade.
  - [x] Use a resumable, bounded backfill through the same marker/claim path, not a direct unfenced projection upsert. Scan deterministic primary-key/cursor batches; create or coalesce current-version work only for cards whose current policy eligibility is provable; immediately disable existing active documents whose eligibility is not provable. Backfill must be restart-safe, idempotent, and never run in a request-serving route.
- [x] Convert the Knowledge indexing worker to consume versioned dirty work (AC: 1-3)
  - [x] Refactor `src/features/knowledge/indexing-worker.ts` and `src/features/knowledge/search.ts` from timestamp-derived approved indexing to state-aware versioned rebuilding/disabling. Remove `updated_at`/document timestamps as indexing work selection or correctness fences once marker consumption is enabled.
  - [x] Claim due marker work in a short transaction with `FOR UPDATE SKIP LOCKED`. The claim is valid only for its marker ID, expected `content_version`, non-expired lease, and fencing token; expired claims are reclaimed only with a new token. Worker ID, bounded lease, batch, retry/backoff, and maximum-attempt configuration must validate and default safely.
  - [x] Re-evaluate current card/evidence/source policy after claiming and lock/re-read the card before projection commit. Activate, disable, fail, or complete work only with compare-and-swap predicates for the marker ID/token and expected `content_version`; the projection write itself must not let version N update a document already owned by version N+1. If the version changed, old work must not activate or disable the document and must preserve recoverable newer work.
  - [x] Treat both `contextual_use` and `caveat_only` as projectable current policy outcomes; only `exclude` requires disabled/unindexed projection status. Do not reintroduce a boolean approved/indexable policy.
  - [x] Preserve immediate disablement in the same transaction for every transition to ineligible state. Migrate or retire direct legacy mutation seams: `updateKnowledgeDraft`, `rejectKnowledgeDraft`, and `approveKnowledgeDraftInTransaction` in `review.ts`, plus `approveKnowledgeDraftForActorInTransaction` in `review-approval-core.ts`. Every retained path must use the canonical card/version/audit/marker/disable mutation boundary. A worker must never reactivate a suppressed or withdrawn version.
  - [x] Retire `indexApprovedKnowledgeCard` as an unguarded production mutation API, or retain it only as a compatibility wrapper that requires expected content version and routes through the same policy and fenced compare-and-swap path. Do not invoke direct production indexing from routes.
  - [x] Preserve the separately supervised script entry point and bounded polling behavior. Do not perform indexing in request-serving routes.
- [x] Add migration, worker, stale-work, and backfill coverage (AC: 1-3)
  - [x] Prove a stale version-N claim cannot activate, update, disable, or acknowledge version N+1 after a later evidence mutation, suppression, or source removal. Prove search excludes an active document whose persisted version is stale before the worker completes version N+1.
  - [x] Prove retries, expired-lease recovery, new-fence rejection of old workers, and duplicate/outdated markers are idempotent; one failed marker must not block later batch items. Current eligible documents rebuild exactly once per card content version.
  - [x] Prove an evidence-only attach, replacement, removal, display-policy change, or source-eligibility change atomically increments `content_version`, creates work, disables the old projection, and produces exactly one current projection. Cover source removal that leaves other valid evidence and the card otherwise eligible.
  - [x] Prove `updateKnowledgeDraft`, rejection, and both retained review-approval paths write versioned marker work and atomically disable an active projection when transitioning to ineligible state; work claimed before that mutation cannot reactivate it.
  - [x] Prove duplicate reason markers for one version cause one deterministic projection attempt/acknowledgement, and interrupted multi-batch backfill converges only to provably eligible current versions without duplicate active documents or missed later work.
  - [x] Verify logs, status, safe errors, and persisted `searchable_text` contain no raw source text, copied body, evidence quote/span, provider payload/metadata, storage key, operator-only/Facebook URL, audit/current-judge material, private data, or fencing token.

## Dev Notes

- Story 4.1's policy evaluator is the single eligibility authority. The index only projects its output; retrieval still rechecks owner rows on every source-bundle inclusion.
- Existing `knowledgeIndexDirtyMarkers` already records `(knowledgeCardId, contentVersion, evidenceSetRevision, reason)` but the current worker polls timestamps instead of consuming markers. Reuse this durable signal and its card content version rather than create a parallel queue.
- The current search-document row has no projected `content_version`, and `indexApprovedKnowledgeCard` conflict-upserts unconditionally after its policy recheck. This story replaces that race-prone behavior while preserving the one-document-per-card model.
- Any state/evidence/source mutation must keep its atomic card/audit/dirty-marker contract. Suppression, archival, superseding, high-risk conflict, and source withdrawal disable active projections in the same transaction. A transition to active only enqueues current-version work; it never indexes synchronously in the request path.
- Build searchable text only from traveler-safe policy-projected card fields. Never index raw capture material, copied bodies, evidence quotes/spans, raw metadata, provider payloads, audit/current-judge content, private data, operator-only evidence, or Facebook URL/canonical URL values. `fact_only` evidence can support a card without contributing its quote or hidden link.
- Keep naming and compatibility changes deliberate. A temporary legacy-named exported wrapper is acceptable only if it requires expected version and fence semantics, all callers move to the state-aware policy, and no second eligibility or direct indexing model remains.

### Project Structure Notes

- Schema and migrations: `src/db/schema.ts`, `drizzle/migrations/`, `drizzle/migrations/meta/`.
- Index projection and worker: `src/features/knowledge/search.ts`, `src/features/knowledge/indexing-worker.ts`, `scripts/knowledge-indexing-worker.ts`.
- Preserve mutation producers: `src/features/knowledge/ingestion-pipeline.ts`, `recommendations.ts`, `source-removal.ts`, `review.ts`, and `review-approval-core.ts`.
- Reuse ingestion-job claim/lease/fence and bounded retry patterns where appropriate; do not create a second generic queue framework.
- Add focused DB-backed coverage around worker claims/version races; extend `knowledge-search`, ingestion-pipeline, source-removal, recommendation-queue, and draft-review tests rather than creating an unbounded worker abstraction. Run shared-DB tests sequentially where required.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-26]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-17, AD-26]
- [Source: src/features/knowledge/indexing-worker.ts]
- [Source: src/features/knowledge/search.ts]
- [Source: src/db/schema.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Implement after Story 4.1. Existing dirty markers are authoritative work signals; do not duplicate them with a new unrelated queue.
- 2026-07-23: Added versioned search-document and dirty-marker queue schema, generated forward-only migration 0048, moved indexing work to marker claim/lease/fence handling, and updated evidence/source/review producers to enqueue current-version work.
- 2026-07-23: Updated affected pipeline expectations for evidence-driven content versions and coalesced marker work; reconciled the prompt-version assertion and clock-relative ingestion-job claim fixture. Full regression now passes.
- 2026-07-23: Resolved all actionable Story 4.2 review findings: database-clock marker claims, fresh completion/retry timing, worker-orchestrated policy-safe backfill, fenced compatibility indexing, source-label invalidation, and card-before-source lock ordering.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented versioned, fenced index work and current-version search projection. `content_version` advances on projection-affecting evidence/source/review mutations while `evidence_set_revision` remains recommendation/audit state.
- Verified marker claim/recovery and old-fence rejection, stale projection exclusion, policy-safe searchable text, worker batches, source removal, and review/ingestion producer coverage.
- Validation passed: `pnpm test:run` (49 files, 654 tests), `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Resolved review findings: PostgreSQL is the sole claim/completion/retry clock; the supervised worker runs resumable policy-aware backfill; ineligible current documents are disabled atomically; the compatibility API queues and claims work before projecting; source-title changes invalidate linked cards; and source removal follows card-before-source locks.
- Validation passed: `pnpm test:run` (49 files, 657 tests), `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

### File List

- drizzle/migrations/0048_deep_red_shift.sql
- drizzle/migrations/meta/0048_snapshot.json
- drizzle/migrations/meta/_journal.json
- src/db/schema.ts
- src/features/knowledge/indexing-queue.ts
- src/features/knowledge/indexing-worker.ts
- src/features/knowledge/search.ts
- src/features/knowledge/ingestion-pipeline.ts
- src/features/knowledge/source-removal.ts
- src/features/knowledge/youtube-capture.ts
- src/features/knowledge/recommendations.ts
- src/features/knowledge/review.ts
- src/features/knowledge/review-approval-core.ts
- tests/knowledge-search.test.ts
- tests/knowledge-indexing-worker.test.ts
- tests/knowledge-ingestion-pipeline.test.ts
- tests/knowledge-ingestion-jobs.test.ts
- tests/ai-usage-events.test.ts
- tests/youtube-capture.test.ts
- scripts/knowledge-indexing-worker.ts

## Change Log

- 2026-07-23: Implemented versioned, fenced knowledge indexing queue, projection worker, backfill path, producer mutation boundaries, migration, and regression coverage; marked ready for review.
- 2026-07-23: Addressed all seven actionable review findings; added worker/backfill and YouTube source-label invalidation coverage; marked review.
- 2026-07-23: Review accepted after the indexing review-fix commits; marked done.
