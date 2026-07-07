# Epic 5 Context: Grounded Retrieval, Web Search, And Provenance

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 5 makes AI Ask answers grounded, auditable, and cost-observable. Traveler answers must follow the required context priority pipeline, use approved XuyenViet knowledge before web fallback, label uncertainty and freshness risk clearly, persist response provenance for later audit/evaluation, and record AI Gateway model/usage metadata without introducing billing or credit behavior.

## Stories

- Story 5.0: Manage AI Gateway Models And Pricing
- Story 5.1: Retrieve Approved Knowledge For AI Ask
- Story 5.2: Assemble Context Priority Source Bundle
- Story 5.3: Web Search Fallback Trigger
- Story 5.4: Web Search Adapter And Source Capture
- Story 5.5: Persist Retrieval Decision And Answer Provenance
- Story 5.6: Render Source And Confidence Section
- Story 5.7: Uncertainty And Freshness Warnings
- Story 5.8: Validate Web Search Fallback Quality
- Story 5.9: Record AI Usage Events

## Requirements & Constraints

- Retrieval must return relevant approved knowledge cards for traveler questions and must exclude draft, rejected, or archived cards.
- Answer context priority is fixed: selected trip project context, current chat session context, approved XuyenViet knowledge, web search fallback, then general AI reasoning.
- Source bundles must preserve source category labels for chat/trip context, XuyenViet knowledge, web search, and general reasoning.
- Web search fallback must trigger when no relevant approved cards are found, fewer than three relevant approved cards are found for a broad planning question, freshness-sensitive facts are requested, or approved cards conflict or look stale.
- Freshness-sensitive facts include price, schedule, opening hours, road condition, weather, availability, service status, and promotions. Answers using these facts must tell users to verify before acting or booking.
- Web search facts are external/unverified until approved into knowledge cards. Facebook-derived or community content must not be treated as official unless source metadata identifies an official/provider page.
- Web search should prefer official/provider pages through query construction, country/language bias, domain controls, ranking, or post-filtering, but official-looking web results still remain unverified unless approved.
- AI answers must avoid fake citations and must not present unverified collected information as guaranteed fact.
- Authenticated AI requests must create usage records with user/context references where applicable, purpose, provider/model, timestamp, latency, success/failure status, available provider usage metadata, and cost estimates when pricing metadata is available.
- Usage tracking is operational/accounting telemetry only. It must not store raw prompt/answer content beyond existing message/provenance storage, and must not create credit balances, rewards, charges, payment obligations, or request blocking for insufficient credits.
- AI Gateway model records must include gateway model name, display label, intended purposes, capability flags, active status, pricing currency, input/output/cache pricing fields where supported, pricing unit, and effective timestamp or version.
- Missing provider usage metadata or missing model pricing must be represented safely and must not block a user answer.

## Technical Decisions

- The product is a Next.js App Router modular monolith with explicit feature boundaries. Relevant owners are Chat/Trips, Knowledge, Retrieval, Search, AI Orchestration, Usage, Feedback/Eval, and Audit.
- PostgreSQL owns product and retrieval state. Embeddings live in pgvector tables linked to first-class product rows; external vector stores must not become hidden source-of-truth.
- Drizzle owns schema and migrations. All persistent tables and indexes, including retrieval/search/provenance/usage/model catalog tables, must be introduced through migrations.
- Retrieval uses approved-card hybrid search against current owner rows. Embedding rows must join back to current owner rows and filter owner status. Draft or archived cards must have no active retrievable embeddings; changed retrievable text marks previous embeddings stale or disabled before new embeddings become active.
- Normalized source bundles contain `chat_trip_context`, `knowledge`, `web`, and `general` sections. Knowledge items include IDs, titles, summaries, confidence, source metadata, freshness flags, and scores. Web items include URL, title, snippet/content, checkedAt, provider score, and unverified confidence.
- Web search is behind an adapter returning query/title/URL/snippet or content/score/checkedAt/source type/confidence. The seed provider is provisional until validation proves Vietnamese corridor query quality, official/provider preference, metadata availability, rate limits, pricing, and failure behavior.
- AI Gateway access is adapter-based. Every model call declares purpose, model, prompt version, input source bundle, and output schema expectation where applicable. Direct OpenAI API calls are not used.
- Model selection reads from the managed model catalog rather than scattered hard-coded model strings. Capability flags must cover at least text input, image input, image output, embeddings, extraction, evaluation, streaming, and cache-pricing support where applicable.
- Streaming can start only after context/source-bundle preparation and provenance ledger inputs are assembled. Partial streamed tokens are transient UI state; the final assistant message, retrieval decision, provenance rows, and usage events are persisted through the orchestrator.
- `assistant_response_provenance` is row-per-source-item, not just a JSON blob. Each row stores the assistant message reference, source category, exactly one nullable source reference where applicable, rank, retrieval score, source type, verification status, `used_in_prompt`, `cited_in_answer`, and a source snapshot.
- The assistant message and provenance rows must be persisted in the same transaction. UI, evaluation, and audits consume stored provenance rather than parsing answer text.
- Every assistant answer stores a retrieval decision containing candidate counts, selected counts, relevance threshold, freshness-required flag, conflict flag, web-search-trigger flag/reason, and general-reasoning-used flag.
- Usage owns append-only `ai_usage_events`. Usage events reference the model record or pricing version used for cost estimation when available and may retain the raw gateway model name for reconciliation.

## UX & Interaction Patterns

- Traveler-facing surfaces are Vietnamese-first and responsive. Source and confidence information must be visible but progressively disclosed so chat answers do not become overloaded.
- Assistant answers use structured sections such as plan/options, rationale, practical tips, warnings, sources, uncertainty, and next steps, with sections shown only when relevant.
- Answers using sources include a compact `Nguon va do tin cay` section rendered from stored provenance. It shows source label/title, source type, URL when available, collected/checked date when available, confidence label, and freshness warning when applicable.
- Source summary rows or chips open a source detail drawer/sheet. The drawer lists each source and must not expose operator-only raw source material.
- Source confidence labels are `curated`, `community`, `official`, `unverified`, and `partner`; color is never the only indicator. Web-search information should read as external/unverified unless approved into knowledge.
- Freshness warnings should be compact and specific, for example: `Gia/gio mo cua co the thay doi. Kiem tra lai truoc khi di.`
- No curated knowledge, conflicting sources, provider failure, and low-confidence web results need explicit user-facing states that say what is known, what is uncertain, and whether general reasoning was used.
- On mobile, source details and context panels use full-height sheets; long source lists collapse by default. Source chips and warning callouts must be keyboard-focusable when they open details.

## Cross-Story Dependencies

- Story 5.0 should precede Story 5.9 so usage cost estimation can reference model catalog pricing instead of inventing pricing metadata inside usage events.
- Story 5.0 also gates Story 2.7 image/streaming capability selection unless a temporary hard-coded capability gate is explicitly approved.
- Story 5.1 depends on Epic 4 approved knowledge cards, source linkage, and active retrieval embeddings.
- Story 5.2 depends on Epic 3 chat/session and trip-project context scopes and must preserve the selected-trip-before-chat priority.
- Stories 5.3 and 5.4 feed Story 5.5 because web-search triggers and persisted web result records become provenance inputs.
- Story 5.6 depends on Story 5.5 because the UI source/confidence section must render from stored provenance, not answer text.
- Story 5.8 should validate provider choice before relying on web fallback for public MVP quality, but the implementation must keep search provider details behind the adapter either way.
