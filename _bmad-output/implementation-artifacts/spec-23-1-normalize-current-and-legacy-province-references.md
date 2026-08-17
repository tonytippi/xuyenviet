---
title: 'Story 23.1: Normalize Current And Legacy Province References'
type: 'feature'
created: '2026-08-17'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'ad63a5778fa9bb56010cd0f4018aba8d2c86c595'
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-23-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Knowledge currently retains only an unconstrained `locationName`, so records using legacy province-level labels cannot be grouped under Vietnam's current administrative units without losing the source label or relying on unsafe inference. Operators need deterministic, official-source-backed normalization before later coverage work can be trusted.

**Approach:** Install a small versioned province/city reference and normalize exact current or governed legacy labels at existing Knowledge write points and for bounded eligible cards. Retain the original label, persist only an unambiguous current-unit reference, and include both labels in the existing internal search projection.

## Boundaries & Constraints

**Always:** Use official-source-backed, versioned fixture data with stable IDs, display names, effective dates, and deterministic current-unit mappings. Preserve `locationName` and store normalization separately. Normalize only exact, unambiguous province/city labels through a pure deterministic helper; leave granular, ambiguous, multiple-place, and unknown labels unresolved. Propagate normalized values through both candidate-to-card and direct-extraction card creation, and keep aliases searchable through the existing projection. Verify new and eligible existing records without changing Knowledge lifecycle, evidence, source, retrieval eligibility, publication, or Discovery state.

**Ask First:** Adding an admin/API display or filter, changing the accepted label grammar beyond governed exact aliases, importing a different official dataset/version, or expanding the bounded backfill to records whose source label cannot be directly identified.

**Never:** Use AI, raw Knowledge text scanning, free-text geographic inference, GIS, route/season normalization, nationwide fallback, a new service/worker/schedule/environment variable, coverage UI/counts, query suggestions, immediate Discovery runs, manual capture, or publication behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Current unit | Exact governed current province/city label | Retain original label; resolve its own stable current-unit ID | N/A |
| Legacy alias | Exact governed legacy province-level label | Retain legacy label; resolve mapped current-unit ID; search includes both labels | N/A |
| Unsafe label | Ambiguous, granular, multi-place, or unknown label | Original source label remains available; canonical unit stays null | No AI guess, broad fallback, or state change |
| Existing card | Eligible card has an exact governed `locationName` and no normalized fields | Bounded backfill updates only geography fields and refreshes searchable text | Skip cards not exactly eligible |

</frozen-after-approval>

## Code Map

- `packages/database/src/schema.ts` -- `knowledgeIngestionCandidates` and `knowledgeCards` retain the source label and gain nullable normalized-current-unit fields; add the versioned official reference relation without changing lifecycle state columns.
- `drizzle/migrations/` -- next forward migration creates the reference data and geography columns, installs validated official-source-backed rows, and only backfills eligible card/candidate geography values.
- `packages/database/src/knowledge-geography.ts` -- new Knowledge-owned pure loader/validator and exact-match normalizer; centralizes no-inference normalization and bounded backfill inputs.
- `packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts` -- normalize a candidate's supplied `locationName` before persistence, preserving its original value.
- `packages/database/src/knowledge-lifecycle.ts` -- propagate persisted candidate geography fields when creating the canonical card; retain all existing transition policy.
- `packages/worker-domain/src/features/knowledge/extraction.ts` -- apply the same deterministic helper before direct `knowledgeCards` inserts; do not alter `inferLocationFallback` or introduce new inference.
- `packages/database/src/knowledge-search.ts` -- include original and canonical governed names in `buildSearchableText()` so normal search can match either label.
- `vitest.config.ts` -- register any new infrastructure-free geography unit suite in the explicit unit-test list.
- `tests/helpers/db.ts` and adjacent Knowledge integration suites -- follow local `resetTestDatabase()` setup and the serial integration project; do not restore a global reset hook.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/knowledge-geography.ts` -- define and validate the official, versioned current/legacy reference fixture plus pure exact normalizer and bounded backfill selection -- makes normalization deterministic and independently testable.
- [x] `packages/database/src/schema.ts` and `drizzle/migrations/0073_normalize_knowledge_province_references.sql` -- persist versioned reference rows and nullable original/canonical geography values on relevant Knowledge records -- preserves source labels while making current-unit grouping durable.
- [x] `packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts`, `packages/database/src/knowledge-lifecycle.ts`, and `packages/worker-domain/src/features/knowledge/extraction.ts` -- normalize supplied location labels and carry the result to canonical cards on both existing write paths -- avoids a path-dependent result without changing any lifecycle decision.
- [x] `packages/database/src/knowledge-search.ts` -- add retained source and resolved canonical labels to existing searchable-text construction -- allows a current or governed legacy name to find the card.
- [x] `tests/knowledge-geography-normalization.test.ts`, `tests/knowledge-geography-normalization.integration.test.ts`, and `vitest.config.ts` -- cover reference provenance/validation, deterministic matches, unsafe unresolved inputs, both write paths, bounded backfill, alias search, and unchanged lifecycle state -- proves the behavioral boundary.

**Acceptance Criteria:**
- Given the official reference is installed, when current units and legacy aliases load, then every row has a stable ID, display name, effective version/date, deterministic current-unit mapping, and traceable official fixture provenance.
- Given a new or eligible existing Knowledge record has an exact unambiguous current or legacy province-level label, when normalization runs, then its original label remains available, its canonical current province/city is resolved deterministically, and search can match either name.
- Given a label is ambiguous, granular, multi-place, or unmapped, when normalization runs, then no canonical geography is set and no AI, nationwide fallback, or unrelated Knowledge/evidence/publication/retrieval/source-lifecycle state changes occur.

## Design Notes

Use the canonical card as the durable grouping target and retain `locationName` unchanged because it may be a place below province scope. The new fields record only a separately retained source label and nullable current-unit reference. This intentionally supports exact governed data today without treating free-form location metadata as authoritative geography.

## Verification

**Commands:**
- `pnpm test:unit` -- expected: geography reference and normalizer tests pass without database configuration.
- `pnpm test:integration` -- expected: serial PostgreSQL coverage verifies migration/persistence, both write paths, bounded backfill, alias search, and unchanged state.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: production build succeeds.

## Suggested Review Order

**Governed geography model**

- Define the official fixture and exact-only normalization contract.
  [`knowledge-geography.ts:16`](../../packages/database/src/knowledge-geography.ts#L16)

- Persist versioned references, safe backfill, and database-enforced pairs.
  [`0073_normalize_knowledge_province_references.sql:1`](../../drizzle/migrations/0073_normalize_knowledge_province_references.sql#L1)

- Bind cards and candidates to valid canonical ID/name pairs.
  [`schema.ts:898`](../../packages/database/src/schema.ts#L898)

**Existing write and search paths**

- Normalize candidate locations before the existing pipeline persists them.
  [`ingestion-pipeline.ts:46`](../../packages/worker-domain/src/features/knowledge/ingestion-pipeline.ts#L46)

- Preserve normalized geography through card creation and direct extraction.
  [`knowledge-lifecycle.ts:96`](../../packages/database/src/knowledge-lifecycle.ts#L96)

- Include canonical names without disturbing original-label search semantics.
  [`knowledge-search.ts:529`](../../packages/database/src/knowledge-search.ts#L529)

**Evidence**

- Exercise official mappings, unsafe inputs, and fixture invariants without a database.
  [`knowledge-geography-normalization.test.ts:5`](../../tests/knowledge-geography-normalization.test.ts#L5)

- Prove persistence, migration backfill, extraction, and search behavior serially.
  [`knowledge-geography-normalization.integration.test.ts:13`](../../tests/knowledge-geography-normalization.integration.test.ts#L13)
