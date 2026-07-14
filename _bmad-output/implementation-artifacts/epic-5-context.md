# Epic 5 Context: Grounded Retrieval, Web Search, And Provenance

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 5 makes AI Ask answers grounded, auditable, and cost-visible by enforcing the context priority pipeline: selected trip project context, current chat session context, approved XuyenViet knowledge, web search fallback, and general reasoning. It matters because the public MVP must be more trustworthy than generic AI: answers need stored provenance, source/confidence display, uncertainty and freshness handling, web fallback only when appropriate, managed AI Gateway model selection, and usage records that support later cost analysis without introducing billing.

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
- Story 5.10: Generate And Validate Answer Annotations

## Requirements & Constraints

Traveler answers must retrieve only approved XuyenViet knowledge cards and must exclude draft, rejected, archived, stale, disabled, source-missing, or operator-only/raw-source-backed records from traveler source bundles. Retrieval must explicitly record when no relevant approved cards are found so downstream orchestration can decide whether web fallback is needed.

Answer context must preserve source category labels for chat/trip context, XuyenViet knowledge, web search, and general reasoning. Selected trip project context outranks current chat-session context; both outrank approved knowledge and web search. Unrelated sessions or projects are not included by default.

Inline answer annotations, when present, must be generated or validated server-side and tied to the current assistant answer's safe provenance/context read models. The frontend must not parse Vietnamese answer text to invent highlights or source claims.

Web search fallback is required when no relevant approved cards are retrieved, fewer than three relevant approved cards exist for a broad planning question, freshness-sensitive facts are requested, approved cards conflict, or retrieved cards look stale. Search-derived facts remain external/unverified until approved into knowledge cards. Official/provider pages should be preferred where possible, while reposted, unattributed, Facebook-derived, or community sources must not be treated as official unless source metadata identifies an official/provider page.

Answers must warn users to verify changing information before acting or booking when prices, schedules, availability, road conditions, opening hours, weather, service status, or promotions are involved. The assistant must say when it cannot verify current details instead of inventing facts after low-quality or failed search.

Source display must use the compact Vietnamese section `Nguon va do tin cay` when approved knowledge or web search influenced an answer. It must show source title or label, source type, URL when available, collected or checked date when available, confidence label, and freshness warning when applicable. General reasoning without supporting source must be clearly distinguished from sourced knowledge, with no fake citations.

AI usage tracking is internal operational telemetry for authenticated AI requests and future cost analysis. It must not create credit balances, billing behavior, payment obligations, rewards, ranking, or request blocking for insufficient credits. Usage events must not duplicate raw prompts or answer content beyond existing message/provenance storage.

AI Gateway model records must centralize gateway model names, intended purposes, capability flags, active status, input/output/cache pricing metadata, pricing unit, and effective timestamp or version. Missing pricing or provider usage metadata must be represented safely and must not block answer generation.

## Technical Decisions

The app remains a Next.js App Router modular monolith with PostgreSQL and Drizzle-owned schema/migrations. Feature boundaries are explicit: Chat/Trips owns conversations, messages, trip projects, context, and user-owned deletion; Knowledge owns cards and source linkage; Retrieval owns approved-card candidate selection; Search owns web results; AI Orchestration owns source-bundle assembly, assistant response provenance, and retrieval decisions; Usage owns append-only usage events.

PostgreSQL owns both product state and retrieval state. Embeddings, when active, must be linked to first-class owner rows and filtered against current owner status. Epic 5 starts with deterministic metadata-filtered approved-card retrieval over current knowledge cards, linked sources, and reviewed summaries; Postgres full-text ranking and pgvector/hybrid retrieval are deferred until eligibility, provenance, and fail-closed behavior are stable.

Traveler source bundles may include selected trip context, current chat context, approved card summaries, linked traveler-safe source metadata, web snippets, and an explicit general-reasoning marker. They must not include raw source text, copied post bodies, image OCR/vision notes, operator-only fields, or admin-only metadata.

Web search stays behind an adapter returning query/result metadata such as title, URL, snippet or content, provider score, checked timestamp, source type, and confidence. Tavily is the provisional seed provider, but source display, grounding, unverified labels, and orchestration must not depend on provider-specific UI or data assumptions.

Every assistant answer stores a retrieval decision with candidate counts, selected counts, thresholds, freshness/conflict flags, web-search trigger and reason, and general-reasoning usage. Answer provenance is row-per-source-item in `assistant_response_provenance`, stores category and one source reference where applicable, records rank/score/type/verification status, distinguishes `used_in_prompt` from `cited_in_answer`, and includes a traveler-safe source snapshot.

Assistant message, retrieval decision, and provenance must be persisted through the orchestrator in a consistent finalization path. Streaming can begin only after context/source-bundle and provenance ledger inputs are assembled; partial streamed text is transient UI state and must reconcile to persisted final content after completion.

AI calls go through the OpenAI-compatible Gateway adapter, never direct OpenAI calls. Every model call declares purpose, selected model, prompt version, input source bundle, and output schema expectation where applicable. Model selection reads from the managed model catalog rather than scattered hard-coded strings.

## UX & Interaction Patterns

Traveler-facing surfaces are Vietnamese-first, responsive, source-aware, and accessible. Chat answers should remain scannable, with plan/options, rationale, practical tips, warnings, sources, uncertainty, and next steps appearing only when relevant. The source/confidence section should be compact by default and support progressive disclosure through source rows, chips, drawers, or sheets.

Source summary rows or chips open a source detail drawer. The drawer lists each source with title/label, source type, URL when available, collected/checked date, confidence, and freshness-sensitive flag. Missing URLs should be handled explicitly rather than hiding the source. Long source lists should collapse by default on mobile.

Trust indicators must not rely on color alone. Source chips use confidence labels such as curated, community, official, unverified, and partner, but labels must always be present and keyboard-accessible if interactive. Freshness warnings are compact and specific, using Vietnamese copy such as `Gia/gio mo cua co the thay doi. Kiem tra lai truoc khi di.`

The source section must not expose operator-only raw material. It must not imply that image-derived, Facebook-derived, community, or web-search facts are verified unless they pass the same approval and source metadata rules as knowledge cards.

## Cross-Story Dependencies

Story 5.6 depends on Story 5.5 because source/confidence rendering must come from stored provenance rows, not parsed answer text. It also depends on Story 5.1, Story 5.2, and Story 5.4 for populated knowledge, context, and web source metadata.

Story 5.7 depends on Story 5.4 and Story 5.5 for web result metadata, freshness flags, conflict/fallback reasons, and provenance rows. Story 5.8 should validate the web search provider or fallback mechanism without coupling UI/source display to that provider.

Story 5.9 depends on Story 5.0 for model pricing records and on the AI Gateway adapter path for provider usage metadata. Story 2.7 streaming and image input should use Story 5.0 model capabilities unless an explicit temporary capability gate is approved.

Story 5.10 depends on Story 5.5 and Story 5.6 because annotations must reference stored answer provenance and render through the existing source/detail-panel trust model. It also depends on UI 6 for the frontend renderer contract.
