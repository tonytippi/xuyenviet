---
title: 'Ingestion Practical Details Parity'
type: 'feature'
created: '2026-07-29'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'e25d14a2722e53194439e2d2bfd325403ee23f61'
context:
  - '{project-root}/_bmad-output/specs/spec-ingestion-practical-details-parity/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-ingestion-practical-details-parity/contract-gaps.md'
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The protocol-v2 knowledge ingestion worker creates evidence-grounded cards without `practical_details` or `tags`, despite retrieval, search, and route planning already consuming those fields. This removes usable road-trip guidance and ordered itineraries that the legacy extraction flow retains.

**Approach:** Preserve the canonical ingestion lifecycle and implement parity for practical details, tags, and itinerary stop lists in protocol v2. Use one shared normalization and safety contract between legacy extraction and v2 ingestion so their bounded-data behavior cannot drift.

## Boundaries & Constraints

**Always:** Keep evidence grounding, independent judgment, relation judgment, source-version fencing, and v2 candidate lifecycle unchanged. Validate all practical details and tags before candidate persistence; give the batch judge the full candidate payload. Preserve exact source order and intentional repeated labels on a newly-created route card. A route card represents the itinerary but must not absorb independently useful, scoped facts about a named place, venue, or route option; discovery emits those as sibling candidates while never turning bare stop labels into candidates. For attach, merge normalized details and tags under the existing target lock; retain target values first, append new values within legacy ceilings, and bump content version only when card content changes. For `ordered_stops` attach merging, retain the target sequence and append only normalized stop labels not already present, so an existing route remains stable. Conflict outcomes must never merge candidate details or tags into the target.

**Ask First:** Do not widen this work to confidence-ceiling changes, location-fallback heuristics, backfilling existing cards, or a change to the canonical ingestion-versus-extraction operating model.

**Never:** Do not modify protocol v1 behavior or checkpoint serialization. Do not restore draft-first extraction as the canonical pipeline. Do not expose raw source text, contacts, or provider payloads. Do not add a semantic practical-detail key allowlist beyond the legacy bounded-object policy; traveler retrieval remains responsible for its existing allowlist.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rich practical fact | v2 candidate has bounded tips, parking/kid/cost notes, and tags | Candidate and final published, verify-first, or review-recommended card retain normalized values | Invalid detail shape or unsafe value suppresses the candidate before persistence |
| Route-only itinerary | One capture principally describes an ordered route with repeated stops and no independently useful scoped observations | One `route_note` carries `ordered_stops` in source order; no stop-label sibling candidates | Numbering and permitted annotations are removed; prose, instructions, sensitive text, and over-limit stops are rejected |
| Rich itinerary | An ordered route also gives a named place, venue, or route option a distinct practical observation | The route note retains the itinerary and each independently useful scoped observation is a sibling candidate | Do not hide scoped facts inside route practical details or create candidates for bare stop labels |
| Equivalent attach | Candidate attaches to a locked matching card | Evidence attaches and target details/tags gain a bounded stable union, then final version is indexed | Lost/stale fence makes no content mutation; overflow retains prior values and only fitting novel values |
| Conflict | Candidate conflicts with a matching card | Existing conflict lifecycle and evidence behavior occur; target details/tags remain unchanged | No partial content merge |

</frozen-after-approval>

## Code Map

- `src/features/knowledge/practical-details.ts` -- shared legacy-equivalent practical-detail, ordered-stop, tag, and safe-field normalization contract.
- `src/features/knowledge/extraction.ts` -- legacy draft extraction becomes a consumer of the shared contract.
- `src/features/knowledge/ingestion-pipeline.ts` -- v2 discovery, candidate persistence, relation payload, terminal creation, and attach merge.
- `src/features/ai/prompts.ts` -- v2 multi-fact extraction contract and example payload.
- `src/db/schema.ts` -- additive v2 candidate columns and JSON container checks.
- `drizzle/migrations/0005_ingestion_candidate_practical_details.sql` -- additive migration and metadata journal entry.
- `tests/knowledge-ingestion-pipeline.test.ts` -- DB-backed v2 parity, safety, merge, and final-index-version coverage.
- `tests/knowledge-draft-extraction.test.ts` -- regression coverage for extraction after shared normalizer adoption.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/practical-details.ts`, `src/features/knowledge/extraction.ts` -- extracted the legacy normalization rules into a shared server-only contract, preserving bounded strings/arrays, ordered-stop cleanup, stable tag dedupe, PII rejection, and raw-overlap protections.
- [x] `src/db/schema.ts`, `drizzle/migrations/0005_ingestion_candidate_practical_details.sql`, `drizzle/migrations/meta/_journal.json` -- added non-null `practical_details` object and `tags` array defaults/checks to ingestion candidates without changing in-flight rows or existing cards.
- [x] `src/features/ai/prompts.ts`, `src/features/knowledge/ingestion-pipeline.ts` -- required and validated v2 practical payloads; preserved them through batch judgment, candidate rows, terminal card creation, and attach enrichment.
- [x] `src/features/knowledge/ingestion-pipeline.ts` -- merged attach payloads transactionally before final version/index/sampling reads; conflict and v1 behavior remain unchanged.
- [x] `tests/knowledge-ingestion-pipeline.test.ts`, `tests/knowledge-draft-extraction.test.ts` -- covered propagation, itinerary singularity/order/repeats, legacy extraction regression, attach final-index-version, and conflict non-mutation.

**Acceptance Criteria:**
- Given a valid v2 candidate with practical details and tags, when it reaches any v2 card-creation terminal outcome, then the normalized values are present on its candidate row and created card.
- Given a route-only itinerary capture, when discovery runs, then exactly one route-note candidate persists its normalized ordered stops in source order, including intentional repeats, and no stop-label candidate is created.
- Given an itinerary containing independently useful scoped place, venue, or route-option observations, when discovery runs, then it persists the route-note candidate plus a sibling candidate for each materially distinct observation.
- Given a candidate containing contact data, unsafe raw overlap, malformed detail values, prose-like stops, or values above legacy ceilings, when discovery parses it, then it is rejected/suppressed and cannot create a card.
- Given an attach relation, when its fence succeeds, then the target receives the deterministic bounded merge and indexing work references the final content version; when the fence is stale, neither target field changes.
- Given a conflict relation, when it completes, then practical details and tags of the target remain exactly as before.

## Design Notes

The v2 candidate row is durable because discovery and relation processing are separate worker claims. The practical payload must therefore be stored on `knowledge_ingestion_candidates`, not reconstructed from a later model response. The batch judge receives the payload but retains its existing grounding thresholds and outcomes.

New-route example:

```json
{
  "type": "route_note",
  "practical_details": { "ordered_stops": ["Hà Nội", "Huế", "Đà Nẵng", "Huế"] },
  "tags": ["road-trip", "coastal"]
}
```

## Verification

**Commands:**
- `pnpm test:run -- tests/knowledge-ingestion-pipeline.test.ts tests/knowledge-draft-extraction.test.ts` -- expected: protocol-v2 parity and legacy extraction regressions pass against `DATABASE_URL_TEST`.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm build` -- expected: production build succeeds.
- `git diff --check` -- expected: no whitespace errors.

**Manual checks:**
- After implementation, the operator runs one supervised worker capture containing many ordered stops and confirms the resulting route card plus AI-answer/search context render the sequence.
