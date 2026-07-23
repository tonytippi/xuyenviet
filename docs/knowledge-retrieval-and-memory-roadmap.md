# Knowledge Retrieval and Traveler Memory Roadmap

## Status

Agreed direction recorded on 2026-07-16 and aligned to the AI-first knowledge policy on 2026-07-23. This is a future implementation roadmap, not an approved build plan.

**Implementation baseline (2026-07-23):** State-aware lexical retrieval is implemented through Epic 4 Story 4.1. Versioned indexing, source-bundle assembly, community/conflict answer policy, search fallback/provenance, traveler trust details, and retrieval safety verification are ready for development. Full-text search, embeddings, hybrid retrieval, RRF, reranking, topic briefs, and profile-memory consolidation remain proposed.

## Decision

XuyenViet will use a retrieval-augmented generation (RAG) harness for curated knowledge cards and a separate traveler-memory system for user-specific context.

- `knowledge_cards` remain the authoritative, source-linked, evidence-grounded travel knowledge store. Their current publication, knowledge, review, verification, source, and evidence states determine eligibility; operator review is risk- and sampling-driven, not a general prerequisite.
- `chat_context` and trip-project context remain the authoritative traveler-memory store.
- Search indexes and embeddings are derived retrieval indexes, never an independent source of truth.
- Every answer must preserve provenance to its selected knowledge cards, sources, relevant traveler-memory facts, and any web-search data.

## Target RAG Harness

The target knowledge-card RAG harness processes each AI Ask request through these stages after the proposed search-evolution work is complete:

```text
Traveler question
  -> query understanding and metadata filters
  -> broad hybrid candidate retrieval
  -> rank fusion and deterministic quality filters
  -> reranking and diversity selection
  -> bounded evidence bundle for the answer model
  -> answer and persisted provenance
```

### Retrieval Rules

- Search only policy-eligible active, source-linked, evidence-grounded knowledge cards. Current state-aware policy may return contextual-use or caveat-only material; conflicted, failed-verification, stale/invalid, raw, and otherwise ineligible material is excluded.
- Include traveler-safe card fact/type, route/location, conditions, confidence, freshness, policy state, and safe source/evidence metadata in retrieval.
- Retrieve a larger candidate set before constructing the model prompt. Initial target: 20-50 candidates.
- Select the final evidence set by relevance, card type, route/location, confidence, freshness, and diversity rather than a fixed count alone.
- Fit the final set to a strict prompt budget. A narrow question may need 3 cards; a broad planning question may need 5-8.
- Include warnings and freshness-sensitive facts when directly relevant, even if they are not the highest lexical match.
- Do not retrieve or pass raw source material, provider payloads, or operator-only data to traveler-facing AI Ask prompts.
- Gemini-derived YouTube evidence is operator-only raw source material, not a traveler-facing transcript or direct retrieval input. Only policy-eligible, source-linked knowledge cards may enter the evidence bundle.

### Search Evolution

1. Complete versioned, dirty-marker-driven indexing for current policy-eligible knowledge (Epic 4 Story 4.2); do not rely on legacy approved-card terminology or timestamp polling.
2. Add PostgreSQL full-text search for better Vietnamese keyword/entity matching after state-aware source bundles and safety checks are complete.
3. Add embeddings only for policy-eligible cards, with lifecycle-safe reindexing when a card changes, is archived, suppressed, conflicted, or otherwise loses eligibility.
4. Combine lexical and vector candidate rankings with Reciprocal Rank Fusion (RRF).
5. Add a reranker only after evaluation shows hybrid retrieval is insufficient. It should rerank the candidate pool, not receive the full corpus.
6. Evaluate retrieval using representative Vietnam road-trip questions, including exact places, paraphrased needs, family travel, parking, EV charging, route warnings, and freshness-sensitive requests.

## Topic Briefs and Hierarchy

Parent-child retrieval is a later optimization for broad recurring questions.

- Child cards remain atomic, source-linked evidence.
- A parent must be a safe, policy-eligible route or topic brief, never a raw Facebook post or full raw source.
- A child-card match may add a related route/topic brief when it improves context for broad planning answers.
- Parent briefs must retain supporting card IDs and become stale whenever supporting cards change, are archived, or lose policy eligibility.

Examples:

- `Huế -> Đà Nẵng: family driving and stops`
- `Central coast road trip: rainy-season practical planning`
- `Cross-Vietnam trip: vehicle and family preparation`

## Traveler Memory

Traveler memory contains personal, user-owned facts and must not be mixed with curated travel knowledge.

### Memory Scopes

- Profile: durable preferences that can apply across trips, such as vehicle needs or food constraints.
- Trip project: facts and constraints for the selected trip, such as dates, route, budget, and party composition.
- Conversation: temporary turn-specific context.

### Memory Rules

- Extract only relevant planning facts from user messages or explicit trip edits.
- Preserve the origin message and scope of every fact.
- Supersede corrections instead of retaining conflicting active facts.
- Do not invent a fact from an ambiguous correction.
- Retrieve only memory relevant to the current question.
- Maintain explicit deletion and user-control behavior.
- Do not store sensitive or unrelated personal data.

Existing `chat_context` and trip-project context should be improved before adopting external memory frameworks such as Mem0, Zep, or LangMem.

## Deferred Decisions

### GraphRAG

Do not build GraphRAG now. Simple relationships should remain relational metadata and links, such as route segment, location, type, tags, source links, and future related-card links.

Reconsider GraphRAG only if a large corpus produces important multi-hop questions that hybrid retrieval and policy-eligible topic briefs cannot answer well.

### Automatic Decay and Consolidation

Do not automatically depreciate or merge policy-eligible knowledge based only on age or vector similarity.

- Use `freshness_sensitive` and explicit verification policies for changing facts.
- Treat source date as a ranking signal, not automatic removal of a fact.
- Merge duplicate or overlapping cards only through the existing evidence-grounded, relation/conflict, reviewable, auditable Knowledge workflow.

### External Memory Frameworks

Do not add Mem0, Zep, or LangMem until the current traveler-memory implementation shows persistent problems with extraction, correction/supersession, relevance selection, or long-term personalization.

Any future adoption must retain XuyenViet as the source of truth and satisfy current deletion, provenance, authorization, and scope requirements.

## Implementation Order

1. Complete Epic 4 state-aware indexing, source bundles, answer policy, fallback/provenance, trust details, and retrieval safety checks.
2. Add full-text lexical search and retrieval evaluation coverage.
3. Add lifecycle-safe embeddings for policy-eligible cards.
4. Implement hybrid retrieval and RRF candidate fusion.
5. Add deterministic filtering, reranking, and diversity selection.
6. Add policy-eligible, source-linked topic/route briefs if broad-question evaluation supports them.
7. Improve traveler-memory consolidation and relevance behavior.
8. Reassess external memory frameworks and GraphRAG only when evidence justifies the added complexity.
