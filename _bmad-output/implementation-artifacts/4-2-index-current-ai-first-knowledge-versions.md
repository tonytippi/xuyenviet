# Story 4.2: Index Current AI-First Knowledge Versions

Status: ready-for-dev

## Story

As a product owner,
I want search documents to follow current AI-first card versions,
so that the lexical index is a safe projection rather than a source of truth.

## Acceptance Criteria

1. Given a Knowledge mutation creates a dirty active card version, when the indexing worker claims it, it rebuilds or disables the document idempotently by `(knowledge_card_id, content_version)`, and outdated work cannot overwrite a later version.
2. Given a card is suppressed, archived, superseded, withdrawn, or otherwise fails eligibility, when its mutation commits or indexing backfill runs, its projection is disabled and no previously indexed document remains eligible.
3. Given legacy cards are migrated to the AI-first model, when indexing backfill runs, only current state-policy eligible cards receive projections. Worker health, retries, and bounded batches remain compatible with the separately supervised runtime.

## Tasks / Subtasks

- [ ] Define forward-only versioned projection and work-claim persistence (AC: 1-3)
  - [ ] Update Drizzle schema and generate the next migration/snapshot/journal entry; never edit historical migrations.
   - [ ] Make projection version identity and dirty-marker claim/acknowledgement state representable by `(knowledge_card_id, content_version)`, including safe retry/failure observability and indexes for bounded due-work selection.
   - [ ] Ensure every evidence/source change that affects a projection also increments `content_version` in its owning atomic mutation; keep `evidence_set_revision` for recommendation compare-and-swap and observability, not as a competing projection identity.
  - [ ] Backfill conservatively: disable or leave unindexed any legacy card whose current policy eligibility cannot be proven.
- [ ] Convert the Knowledge indexing worker to consume versioned dirty work (AC: 1-3)
  - [ ] Refactor `src/features/knowledge/indexing-worker.ts` and `src/features/knowledge/search.ts` from timestamp-derived approved indexing to state-aware versioned rebuilding/disabling.
   - [ ] Claim work in a short transaction with `FOR UPDATE SKIP LOCKED`, expected content version, finite lease/fencing semantics, and compare-and-swap completion. Recheck card/evidence/source state at mutation time.
   - [ ] Preserve immediate disablement in ingestion, recommendation, source-removal, review, and review-approval transactions; route each state-mutating legacy review seam through the canonical mutation path or retire it. A worker must never reactivate a suppressed or withdrawn version.
  - [ ] Preserve the separately supervised script entry point and bounded polling behavior. Do not perform indexing in request-serving routes.
- [ ] Add migration, worker, stale-work, and backfill coverage (AC: 1-3)
   - [ ] Prove a stale earlier claim cannot overwrite a later content version, suppression, or source removal.
   - [ ] Prove retries/outdated markers are idempotent, unsafe documents disable, and current eligible documents rebuild exactly once per card content version, including an evidence-only mutation that atomically increments `content_version`.
   - [ ] Prove review and review-approval state mutations disable projections atomically and cannot be reactivated by worker work claimed before the mutation.
  - [ ] Verify worker logs/status reasons are implementation-visible but contain no raw sources, evidence quotes, provider payloads, or fencing tokens.

## Dev Notes

- Story 4.1's policy evaluator is the single eligibility authority. The index only projects its output; retrieval still rechecks owner rows on every source-bundle inclusion.
- Existing `knowledgeIndexDirtyMarkers` already records `(knowledgeCardId, contentVersion, evidenceSetRevision, reason)` but the current worker polls timestamps instead of consuming markers. Reuse this durable signal and its card content version rather than create a parallel queue.
- Any state/evidence/source mutation must keep its existing atomic card/audit/dirty-marker contract. Suppression, archival, superseding, high-risk conflict, and source withdrawal disable active projections in the same transaction.
- Keep naming and compatibility changes deliberate. A temporary legacy-named exported wrapper is acceptable only if all callers move to the state-aware policy and no second eligibility model remains.

### Project Structure Notes

- Schema and migrations: `src/db/schema.ts`, `drizzle/migrations/`, `drizzle/migrations/meta/`.
- Index projection and worker: `src/features/knowledge/search.ts`, `src/features/knowledge/indexing-worker.ts`, `scripts/knowledge-indexing-worker.ts`.
- Preserve mutation producers: `src/features/knowledge/ingestion-pipeline.ts`, `recommendations.ts`, `source-removal.ts`, `review.ts`, and `review-approval-core.ts`.
- Add focused DB-backed coverage around worker claims/version races; extend existing `knowledge-search` and source-removal tests rather than creating an unbounded worker abstraction.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-26]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-17, AD-26]
- [Source: src/features/knowledge/indexing-worker.ts]
- [Source: src/db/schema.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Implement after Story 4.1. Existing dirty markers are authoritative work signals; do not duplicate them with a new unrelated queue.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
