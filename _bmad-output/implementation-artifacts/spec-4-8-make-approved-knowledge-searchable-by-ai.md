---
title: 'Story 4.8: Make Approved Knowledge Searchable By AI'
type: 'feature'
created: '2026-07-08'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'd228bf62d7c32ed76f72f19549baa8195bbfe976'
final_revision: 'd228bf62d7c32ed76f72f19549baa8195bbfe976-uncommitted'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-7-preserve-source-and-confidence-in-approved-knowledge.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Approved knowledge cards can now preserve safe provenance, but they still have no searchable representation for AI retrieval. Without a first-party searchable index, later AI Ask retrieval would either scan raw card tables ad hoc or risk using draft/raw/operator-only material.

**Approach:** Add a minimal approved-knowledge search index linked to current `knowledge_cards`, build a safe searchable text snapshot from approved card fields plus safe source metadata, and provide server-side indexing/search helpers that only return approved, reviewed, source-linked cards.

## Boundaries & Constraints

**Always:** Store searchable rows in PostgreSQL through Drizzle schema and migration. Index only cards with `status = "approved"`, `needsReview = false`, and at least one linked normalized source. Build search text from safe reviewed fields and safe source metadata only. Disable or stale active search rows when the card is no longer eligible or its searchable text changes. Keep returned search results bounded and safe for AI prompt assembly.

**Block If:** Implementation requires choosing a production vector-search provider, enabling pgvector in a live database, changing AI Ask traveler-answer behavior, persisting assistant answer provenance, or deciding whether operator-entered source labels/publishers need stronger validation than Story 4.7 established.

**Never:** Do not call embeddings providers, introduce external vector stores, use raw source material, expose operator-only fields, index draft/rejected/duplicate/no-action/archived cards, or wire retrieved knowledge into traveler AI Ask responses in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Index eligible approved card | Approved, reviewed card with at least one linked safe source | Active search row is upserted with card ID, safe text snapshot, text hash, source count, confidence, freshness flag, and timestamps | No error expected |
| Skip ineligible card | Draft, rejected, duplicate, no-action, archived, `needsReview = true`, or source-orphaned card | No active searchable row exists for that card | Existing active row is disabled/staled safely |
| Search approved knowledge | Query terms match safe text on active index rows | Returns bounded safe results with card summary fields, confidence, freshness, score, and linked safe source metadata | Empty query returns empty result without DB mutation |
| Raw material present | Linked source has `raw_source_material` rows or file metadata | Search text and result DTO do not include raw text, raw metadata, storage keys, file names, or provider payloads | Raw tables are not selected |
| Card text changes | Approved card searchable fields or source links change | Reindex replaces stale text/hash and disables conflicting old active row state | No duplicate active row for the same card |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- add `knowledge_card_search_documents` table/types linked to approved cards and embedding model records without vector/provider dependency.
- `drizzle/migrations/*.sql` -- create the search table, constraints, indexes, and active-row uniqueness through a migration.
- `src/features/knowledge/search.ts` -- new server-only knowledge search/indexing module; builds safe search text, upserts/disables documents, and searches active approved documents.
- `src/features/knowledge/review.ts` -- current approval and approved-card DTO contract; reuse safe field/source boundaries and optionally disable stale search docs on archive/status changes if touched.
- `tests/knowledge-search.test.ts` -- focused coverage for eligibility, raw privacy, stale/update behavior, bounded search, and source metadata returned safely.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- move Story 4.8 through implementation statuses.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/*.sql` -- add a PostgreSQL search document table for approved knowledge with safe text, text hash, status, source count, confidence/freshness snapshots, and indexes -- provide durable first-party searchable state without adding pgvector/provider coupling.
- [x] `src/features/knowledge/search.ts` -- implement safe text construction, eligibility lookup, `indexApprovedKnowledgeCard`, `disableKnowledgeSearchDocument`, and `searchApprovedKnowledge` -- centralize approved-only indexing/search behavior for Epic 5 retrieval.
- [x] `tests/knowledge-search.test.ts` -- cover the I/O matrix with database-backed tests and exact DTO/key/raw-privacy assertions -- prevent raw-source leaks and lifecycle regressions.
- [x] `_bmad-output/implementation-artifacts/spec-4-8-make-approved-knowledge-searchable-by-ai.md` and `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update checkboxes, status, verification, notes, and file list -- keep BMad artifacts aligned.

**Acceptance Criteria:**
- Given an approved reviewed knowledge card with linked source metadata, when indexing runs for that card, then exactly one active search document exists for that card with safe searchable text and no raw-source fields.
- Given a card is draft, rejected, duplicate, no-action, archived, needs review, or has no linked source, when indexing runs, then it is absent from active knowledge search results and any prior active document is disabled.
- Given a traveler-planning query matches an active approved search document, when `searchApprovedKnowledge` runs, then it returns a bounded list of safe result DTOs including card title, type, location or route, summary, tags, confidence, freshness flag, score, and linked safe source metadata.
- Given raw source material exists for linked sources, when indexing or searching runs, then raw text, raw metadata, storage keys, file names, provider payloads, and operator-only fields are absent from stored search text and returned DTOs.
- Given an approved card's searchable text changes, when reindexing runs, then the active document text/hash updates without creating duplicate active documents for that card.

## Spec Change Log

## Review Triage Log

### 2026-07-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 1, low 1)
- defer: 0
- reject: 18
- addressed_findings:
  - `[medium]` `[patch]` Search could under-fill bounded results if active documents became ineligible between document matching and safe card reload; fixed by fetching additional bounded batches until the requested safe result limit is filled or no more matches remain.
  - `[low]` `[patch]` Non-string runtime query values could throw before returning the safe empty-result behavior; fixed by accepting `null`/`undefined` queries and returning an empty result.

## Design Notes

This story deliberately uses a PostgreSQL text-search document rather than a vector column or provider embedding call. The architecture calls for pgvector eventually, but the current repository has no pgvector dependency, embedding adapter, or production DB extension decision. Story 4.8 can still make approved knowledge searchable by AI by creating the safe, approved-only document boundary that later Epic 5 vector retrieval can replace or augment.

## Verification

**Commands:**
- `pnpm test:run tests/knowledge-search.test.ts` -- expected: focused search/indexing coverage passes.
- `pnpm test:run tests/knowledge-approved-cards.test.ts` -- expected: existing approved-card provenance/privacy coverage still passes.
- `pnpm typecheck` -- expected: TypeScript strict checks pass.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm build` -- expected: production build succeeds.

**Results:**
 - `pnpm test:run tests/knowledge-search.test.ts` -- passed; 5 tests passed after review fixes.
- `pnpm test:run tests/knowledge-approved-cards.test.ts` -- passed; 4 tests passed.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `pnpm build` -- passed; Next.js production build completed successfully.

## Implementation Notes

- Added `knowledge_card_search_documents` as the PostgreSQL-owned searchable document table for approved knowledge, with one durable row per card, active-row uniqueness, safe text/hash snapshots, source count, confidence/freshness snapshots, status, and indexes.
- Added `src/features/knowledge/search.ts` as a server-only indexing/search boundary. It indexes only approved, `needsReview = false`, source-linked cards; disables active documents for ineligible cards; and searches bounded active documents without provider calls.
- Searchable text and result DTOs are built only from reviewed card fields and safe normalized source metadata. Raw source material, file metadata, provider payloads, practical details, creator IDs, and AI model fields are not selected or serialized.
- Added database-backed tests for eligible indexing, ineligible disable behavior, bounded safe search results, exact DTO/source keys, raw privacy, empty-query behavior, and reindex updates without duplicate active documents.
- Review hardening added runtime null/undefined query safety and continued bounded result filling when stale active documents are skipped during safe card reload.
- No embeddings providers, pgvector, external vector store, AI Ask wiring, traveler-answer behavior, URL fetching, or assistant provenance persistence was added.

## Auto Run Result

Status: done

Summary: Implemented Story 4.8 approved knowledge search documents with PostgreSQL schema/migration, server-only indexing/search helpers, focused tests, review fixes, and BMad status updates.

Review findings breakdown: 2 patch findings fixed (1 medium, 1 low), 0 deferred, 18 rejected as out of scope/noise against this story's manual approved-search boundary.

Follow-up review recommended: false. Review-driven changes were localized to query input safety and bounded result filling, with focused regression coverage.

Verification performed: `pnpm test:run tests/knowledge-search.test.ts`, `pnpm test:run tests/knowledge-approved-cards.test.ts`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` all passed after review fixes.

Residual risks: Search population remains a server helper/manual boundary for Epic 4; automatic AI Ask retrieval, vector embeddings, provenance persistence, and backfill orchestration remain later Epic 5 work by design.

## File List

- `_bmad-output/implementation-artifacts/spec-4-8-make-approved-knowledge-searchable-by-ai.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0024_add_knowledge_search_documents.sql`
- `drizzle/migrations/meta/_journal.json`
- `src/db/schema.ts`
- `src/features/knowledge/search.ts`
- `tests/knowledge-search.test.ts`
