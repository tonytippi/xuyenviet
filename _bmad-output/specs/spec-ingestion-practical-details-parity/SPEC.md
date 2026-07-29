---
id: SPEC-ingestion-practical-details-parity
companions:
  - contract-gaps.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Ingestion Pipeline Practical-Details Parity

## Why

A pain to solve. The canonical AI-first ingestion pipeline (protocol v2 multi-fact discovery) persists every knowledge card with `practical_details = {}` and `tags = []`: the extraction prompt, the candidate type, the `knowledge_ingestion_candidates` schema, and all four card-insert paths never carry these fields. Downstream consumers built for the legacy extraction contract — the retrieval context assembly allowlist (`tips`, `warnings`, `cost_notes`, `parking_notes`, `kid_notes`, `ordered_stops`), the search text projection, and the UX route card — silently receive nothing from ingestion-created cards. Route itineraries lose their ordered stop lists entirely: a multi-stop Hanoi-to-HCMC source yields per-fact candidates but never the navigable stop sequence. As traffic shifts from legacy extraction to canonical ingestion, traveler-facing answers lose exactly the practical detail and route structure the product was designed around.

## Capabilities

- **CAP-1**
  - **intent:** The v2 discovery extraction contract lets the model attach practical-details buckets (`tips`, `warnings`, `cost_notes`, `parking_notes`, `kid_notes`) and tags to a candidate when the source supports them.
  - **success:** A capture describing a venue with parking, kid, or cost detail yields candidates whose buckets and tags survive parse, the candidate row, and the card row, proven by `DATABASE_URL_TEST`-backed tests.
- **CAP-2**
  - **intent:** A capture principally describing an ordered itinerary, route, or stop list yields exactly one `route_note` candidate carrying the complete ordered stop sequence in source order — including intentional repeats — never one candidate per stop.
  - **success:** A multi-stop itinerary capture produces one `route_note` candidate whose `ordered_stops` equals the source sequence, with no per-stop sibling candidates.
- **CAP-3**
  - **intent:** Ingestion normalizes and validates practical details, ordered stops, and tags with legacy-equivalent safety rules, persists them into `knowledge_cards` on every terminal publish path, and on attach relation outcomes merges them into the target card as a deduped union within the ceilings, with a content-version bump.
  - **success:** Adversarial outputs (numbered, annotated, prose, contact-laden, or over-limit stops, buckets, and tags) are rejected or normalized exactly per legacy rules; `published`, `verify_first`, and `review_recommended` cards carry the values; and an attach outcome enriches the target card's `practical_details`/`tags` while a conflict outcome leaves target content untouched — all in DB-backed tests.

## Constraints

- Canonical invariants keep their shape: evidence grounding, independent judgment, relation judgment, fencing, and stage lifecycle are unchanged. Buckets, stops, and tags annotate a candidate; they never become standalone candidates.
- Changes target protocol v2 only. The v1 single-fact path stays untouched — every new job is created with `protocol_version = 2`, and v1 remains only for legacy compatibility.
- The schema change is an additive, backward-compatible migration on `knowledge_ingestion_candidates` (`practical_details` default `{}`, `tags` default `[]`), safe for in-flight rows.
- Ceilings are copied verbatim from legacy extraction for now: `practical_details` ≤20 keys with ≤500-char strings and ≤10-item arrays; `ordered_stops` ≤40 labels after stripping numbering and annotations; tags ≤12, ≤40 chars each, normalized and deduped. Sensitive-pattern rejection and raw-overlap guards are preserved.
- Ungrounded candidates remain suppressed regardless of attached buckets or tags; judgment thresholds and grounding rules are untouched.

## Non-goals

- Confidence ceiling by source metadata (gap 4 — ingestion keeps the `community`/`unverified` hardcode).
- Location-fallback heuristics for scope-less candidates (gap 5 — scope-less candidates stay rejected).
- Backfilling `practical_details` or `tags` onto existing ingestion-created cards; operator rerun via `rerunKnowledgeIngestionJob` is the mechanism.
- Retrieval, search, or UX consumer changes — the allowlist already covers the six keys.
- Legacy extraction worker deprecation or removal.

## Success signal

A supervised ingestion worker run over an ordered-itinerary capture (for example a 20-stop Hanoi-to-HCMC post) produces one `route_note` card whose `practical_details.ordered_stops` preserves source order, and the AI-answer plus search context for that route renders the stop list — demonstrated by a `DATABASE_URL_TEST` pipeline test and a local worker run.

## Assumptions

- Assumed gap 4–5 exclusions are intentional canonical design (conservative confidence, strict scope grounding), per the user's scope decision; reviving either requires its own spec.
- Assumed pre-fix data is negligible — the user resets the development database frequently; no card-data migration accompanies the candidate-schema migration, and any stragglers can be enriched by operator rerun through the attach-merge path.
