# Epic 4 Context: Source-Grounded AI Answers And Trust Signals

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make AI Ask answers trustworthy and inspectable by combining the selected trip and current-chat context with only currently eligible community knowledge, using external search only when internal knowledge cannot safely answer the question. Responses must be Vietnamese, responsive, explicit about uncertainty and verification, and backed by persisted provenance so travelers can understand the origin and limits of advice without operator-only material leaking into the experience.

## Stories

- Story 4.1: Migrate Retrieval to State-Aware Active Knowledge
- Story 4.2: Index Current AI-First Knowledge Versions
- Story 4.3: Assemble State-Aware Knowledge Source Bundles
- Story 4.4: Enforce Community, Conditional, and Conflict Answer Policy
- Story 4.5: Update Search Fallback and Provenance for AI-First States
- Story 4.6: Render State-Aware Traveler Trust Details
- Story 4.7: Verify AI-First Retrieval and Answer Safety

## Requirements & Constraints

- Preserve answer-context priority: selected trip project, current chat, active XuyenViet knowledge, web fallback, then general reasoning.
- Retrieve only cards whose current publication, knowledge, review, verification, evidence, source-safety, and required metadata permit traveler use. Historical approval fields and index status alone cannot authorize a card.
- Every selected knowledge item receives exactly one policy: `contextual_use`, `caveat_only`, or `exclude`. Unknown, incomplete, stale, disabled, suppressed, archived, superseded, verification-failed, source-missing, raw, private, and operator-only records fail closed.
- Use community observations as community-reported information, call a pattern a pattern only when independently supported, and retain all material conditions for conditional information. Uncertain or verification-required information is caveat-only; conflicted knowledge must never become a factual itinerary premise.
- Treat road, safety, EV, price, hours, availability, booking, and promotion information as changing details requiring explicit verification guidance. Never express collected or unverified information as guaranteed fact.
- Trigger provider-adapted web fallback when relevant active knowledge is absent, sparse for a broad question, freshness-sensitive, uncertain, or conflicted. Prefer official/provider pages; all external results remain unverified unless later published through the knowledge workflow. Search failure or low confidence must produce explicit confirmation guidance rather than unsupported current facts.
- Stream only after chat/trip context, source bundle, and provenance inputs are prepared. Partial stream content is transient; a failed stream must not imply a saved completed response.
- Persist final assistant content, retrieval decision, row-per-source provenance, and usage data atomically. Usage captures authenticated context where applicable, purpose, provider/model, timestamp, available provider metadata, and configured cost estimate without introducing billing or credits.
- Answer trust UI must reveal safe source label/title, type, URL when available, date, confidence, freshness, community/conditional state, and verification caveats. Labels, not color alone, convey source meaning.

## Technical Decisions

- Keep the MVP as a Next.js TypeScript modular monolith with PostgreSQL as the source of truth. Feature ownership remains explicit: Retrieval reads eligible Knowledge projections, Search owns web results, AI Orchestration owns response provenance, and Usage owns append-only usage events.
- Search lexical `knowledge_card_search_documents` for candidates, then load current owner rows and current evidence before source-bundle inclusion. Ranking score may order eligible results but cannot override eligibility.
- Index documents are rebuildable projections. Knowledge state mutations atomically update the card, audit record, and dirty marker; ineligible transitions disable the projection immediately. The indexing worker is idempotent by `(knowledge_card_id, content_version)`, and retrieval rechecks current state to prevent index lag from restoring unsafe content.
- Knowledge source-bundle entries contain card identity, fact, type, location/route, conditions, confidence, freshness, knowledge and verification states, use policy, and bounded traveler-safe source/evidence metadata. Never include raw source text, copied post bodies, OCR/media notes, private data, operator-only evidence, provider payloads, or audit metadata.
- Use a provider adapter for web search and the OpenAI-compatible AI Gateway. Each model call declares its purpose, managed model record, prompt version, source bundle, and applicable output schema. Model records supply active capabilities and versioned input/output/cache pricing; unavailable pricing must not block safe generation.
- Store provenance row-per-source-item with category, one applicable source reference, rank/score, source and verification metadata, prompt/citation flags, and a safe snapshot. Renderers, evaluations, and audits consume stored provenance rather than parsing answer text.
- Persist answer annotation descriptors only after validating their ranges against final message content and binding their safe detail to provenance rows belonging to the same message, conversation, and user. Never infer annotations, citations, or source state from free-form Vietnamese response text at render time.

## UX & Interaction Patterns

- Keep answers scannable with relevant plan, rationale, tips, warnings, sources, uncertainty, and next-step sections. Use compact source and confidence summaries with progressive disclosure rather than long inline provenance blocks.
- A selected persisted source, warning, place, route, cost, or trip-fact descriptor opens one contextual detail view: desktop inspector or mobile sheet. It shows a Vietnamese summary, safe quick facts, supported actions, and provenance chips; an unselected or unavailable item must not create a blank inspector.
- Source details and selectable entities must be keyboard accessible. The active detail view closes with `Esc` and restores focus to its trigger. Streaming and completion use polite live announcements, offer recoverable failure, and respect reduced-motion preferences.
- Keep traveler trust details separate from operator workflows. Facebook-derived raw posts, quotes, and links remain hidden unless explicit traveler display policy permits the specific bounded evidence.

## Cross-Story Dependencies

- Builds on Epic 2's authenticated, owner-scoped conversation, trip context, streaming, image, and deletion behavior; change the generation and retrieval contract without recreating those capabilities.
- Requires Epic 3's canonical card state model, current bounded evidence, source-safe links, transactional dirty markers, source-removal propagation, and supervised indexing/ingestion foundations.
- Implement retrieval eligibility and index versioning before depending on their source bundles; source bundles and answer policy precede final fallback/provenance integration and traveler trust details. Safety tests cover all completed paths, including concurrent or stale index work.
