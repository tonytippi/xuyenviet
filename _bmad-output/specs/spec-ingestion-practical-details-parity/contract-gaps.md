# Contract Gaps: Legacy Extraction vs Canonical Ingestion

File-and-line inventory behind SPEC-ingestion-practical-details-parity. Implementers use this to locate every touch point; the kernel stays lean.

## Gap 1 — `ordered_stops` (in scope, CAP-2/CAP-3)

| Layer | Legacy extraction | Canonical ingestion |
|---|---|---|
| Prompt | `src/features/ai/prompts.ts:69` — legacy draft rule keeps an ordered itinerary in one `route_note` with `practical_details.ordered_stops` | `prompts.ts:95-104` (`knowledgePipelineMultiFactExtractionSystemPrompt`) now preserves the route note while emitting siblings for independently useful scoped observations; bare stop labels are not split into candidates |
| Parse | `src/features/knowledge/extraction.ts:467-508` — `normalizeDetailValue` special-cases `ordered_stops` (max 40), `normalizeOrderedStop`, `stripOrderedStopFormatting` | `src/features/knowledge/ingestion-pipeline.ts:455-480` (`parseCandidate`/`parseCandidates`) — no such field |
| Intermediate schema | n/a (drafts insert straight to `knowledge_cards`) | `src/db/schema.ts:602-637` (`knowledge_ingestion_candidates`) — no column |
| Card persistence | `extraction.ts:368-392` — `practicalDetails` included in draft insert | `ingestion-pipeline.ts` — `publish` (:328), `publishVerifyFirst` (:381), `persistCandidateForReview` (:408), `persistV2CandidateCard` (:223) never set `practicalDetails` |

## Gap 2 — practical-details buckets (in scope, CAP-1/CAP-3)

Keys: `tips`, `warnings`, `cost_notes`, `parking_notes`, `kid_notes`.

- Extraction: `extraction.ts:440-465` (`normalizePracticalDetails`) — up to 20 keys, bounded strings/arrays; prompt `prompts.ts:64` requires `practical_details` on every draft; expected-output example at `prompts.ts:244-250`.
- Ingestion: candidate type `ingestion-pipeline.ts:20` has no `practicalDetails`; every card insert defaults to `{}`.

## Gap 3 — `tags` (in scope, CAP-1/CAP-3)

- Extraction: `extraction.ts:510-516` (`normalizeTags`) — max 12, bounded 40 chars, deduped.
- Ingestion: candidate type has no `tags`; every card insert defaults to `[]`.

## Consumers already expecting these keys (no changes needed)

- `src/features/retrieval/approved-knowledge.ts:11` — allowlist `["tips", "warnings", "cost_notes", "parking_notes", "kid_notes", "ordered_stops"]` for AI-answer context assembly.
- `src/features/knowledge/search.ts:546-565` — `getPracticalDetailSearchValues` projects practical details (special-casing `ordered_stops`, max 40 × 160 chars) into searchable text; tags feed the same projection.
- Review/approval safety validators (`review.ts`, `review-approval-core.ts`) already validate `practicalDetails` shapes.
- UX route card design (`_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md:282`) expects practical stop lists.

## Excluded gaps (non-goals)

- **Gap 4 — confidence ceiling.** Extraction `clampConfidence` (`extraction.ts:413-425`) honors `official`/`partner`/`curated` per source metadata. Ingestion hardcodes `community`/`unverified` at every insert. Judged intentional canonical conservatism.
- **Gap 5 — location fallback.** Extraction `inferLocationFallback` (`extraction.ts:518-543`) rescues scope-less drafts for known Central-Vietnam corridors (Đà Nẵng – Hội An, Đèo Hải Vân, Huế – Đà Nẵng). Ingestion rejects scope-less candidates as `candidate_missing_required_fields`. Judged intentional evidence-grounding strictness.

## Implementation touch points (v2 only)

1. `src/features/ai/prompts.ts` — extend `knowledgePipelineMultiFactExtractionSystemPrompt` (buckets, tags, ordered-stop-list rule mirroring the legacy "never split per stop" semantics) and the v2 `expected_output` contract in `buildKnowledgePipelineMultiFactExtractionMessages`.
2. `src/features/knowledge/ingestion-pipeline.ts` — extend `Candidate` (:20), `parseCandidate`/`parseCandidates`, the v2 candidate insert in `runV2Discovery` (:132), the fact reconstruction in `runKnowledgeIngestionCandidatePipeline` (:169), and the card inserts in `persistV2CandidateCard` (:223) plus the v1-path inserts only if they remain reachable (see constraint: v1 untouched).
3. `src/db/schema.ts` + new Drizzle migration — add `practical_details` jsonb default `{}` and `tags` jsonb default `[]` to `knowledge_ingestion_candidates` with `jsonb_typeof` checks mirroring `knowledge_cards`.
4. `src/features/knowledge/ingestion-jobs.ts` — candidate checkpoint parser (`parseCheckpointCandidate`, :170) is v1-only; unchanged per the v2-only constraint. Verify no v2 code path serializes candidates through checkpoints.
5. Tests — extend `tests/knowledge-ingestion-pipeline.test.ts` (discovery parse, persistence, adversarial normalization) and port legacy stop-normalization cases from extraction tests.

## Design decision points for implementation

- Whether the batch grounding judgment payload (`ingestion-pipeline.ts:116`) should include buckets/tags so the judge sees the full candidate, or stay unchanged to keep the judge prompt stable.
- Attach merge policy: resolved — attach outcomes merge incoming buckets/tags/ordered_stops into the target card as a deduped union within ceilings (content-version bump + re-index); conflict outcomes stay evidence-only with suppression. Chosen because there is no pre-fix production data to remediate (development resets the DB frequently) and steady-state corroboration should enrich the card, not just its evidence set.
- Per-key ceilings: resolved — copy legacy limits verbatim for now (≤20 keys, ≤500-char strings, ≤10-item arrays, ≤40-char tags, ≤40 stops).
