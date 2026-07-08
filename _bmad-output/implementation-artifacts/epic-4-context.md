# Epic 4 Context: AI-Assisted Knowledge Intake And Approval

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 4 builds the operator-controlled knowledge workflow that turns travel URLs, copied content, Facebook/community material, raw text, and screenshots into structured knowledge cards. Its purpose is to let AI accelerate intake while preserving human review, source provenance, confidence labeling, freshness handling, and approved-only retrieval eligibility, so XuyenViet can seed enough trustworthy Hanoi-to-HCMC corridor knowledge to improve traveler answers without leaking raw or unreviewed material.

## Stories

- Story 4.1: Submit Travel Source For AI Reading
- Story 4.2: AI Extracts Knowledge Drafts From Source
- Story 4.3: Review And Edit AI-Prepared Drafts
- Story 4.4: AI Suggests Create Or Update From Source URL
- Story 4.5: Batch Seed Source URL Intake
- Story 4.6: Approve Knowledge For Retrieval
- Story 4.7: Preserve Source And Confidence In Approved Knowledge
- Story 4.8: Make Approved Knowledge Searchable By AI
- Story 4.9: Track 100 Approved Corridor Items

## Requirements & Constraints

The knowledge workflow is operator/admin-only. Normal travelers must never see admin controls, raw submitted text, screenshot-derived notes, provider-specific raw metadata, or operator-only fields. Source submission must support URL, Facebook post link, copied post content, pasted raw text, and image/screenshot inputs, while storing normalized safe source metadata separately from operator-only raw source material.

Knowledge cards must include title, type, location or route segment, summary, source linkage, collected or checked date when available, confidence label, tags, freshness-sensitive flag, and lifecycle status. Fixed MVP card types are place, food, hotel area, activity, service, route note, warning, cost note, parking, EV charging, kid-friendly tip, discount/promotion, and general travel tip. Fixed MVP displayed confidence labels are `unverified`, `community`, `curated`, `partner`, and `official`.

AI extraction may propose one or more drafts, create/update/no-action decisions, duplicates, conflicts, or low-value markers, but it must never approve cards automatically or mutate an existing approved card without operator approval. Uncertain or incomplete facts remain unverified or needing review. Facebook and copied community content defaults to community/unverified and cannot be treated as official unless an operator marks it as an identifiable official/provider source.

Freshness-sensitive facts include price, schedule, availability, road condition, opening hours, weather, service status, promotions, and similar changing information. Operators must be able to mark drafts/cards as freshness-sensitive, and source dates must remain visible where available.

Only approved knowledge cards are eligible for normal traveler retrieval. Draft, rejected, duplicate/no-action, and archived items must be excluded. The public-MVP seed target is at least 100 approved Hanoi-to-HCMC corridor items; progress counts only approved corridor items and should expose gaps by type and route/location.

## Technical Decisions

The app remains a Next.js App Router modular monolith with server-side feature boundaries. Knowledge owns cards, card-source linkage, raw source material, and card embeddings. Admin UI must call Knowledge/Admin server entrypoints rather than mutating tables directly. Protected knowledge mutations require authenticated session plus operator/admin role checks and should record audit context with actor, target, operation, timestamp, and relevant before/after summary where appropriate.

PostgreSQL is the source of truth for sources, raw source material, knowledge cards, card-source linkage, embeddings, audit events, and related status. Drizzle owns schema and migrations. All persistent tables and indexes must be introduced through migrations.

Normalized source linkage is required. `sources` hold safe source metadata such as source kind, URL or canonical URL, label, publisher, collected/checked date, source type, verification status, and official/partner flags. `raw_source_material` holds raw text or file metadata, raw metadata JSON, and operator-only material. Approved cards must link to at least one source through `knowledge_card_sources` with support level such as primary, supporting, or conflicting. Traveler-facing provenance later reads from linked source rows, not free-text card fields.

Knowledge lifecycle is `draft -> approved -> archived`, with rejected/duplicate/no-action intake outcomes as non-retrievable workflow states where needed. Retrieval must join embeddings back to current owner rows and filter current owner status. Draft or archived cards must have no active retrievable embeddings. When retrievable text changes, previous embeddings become stale or disabled in the same transaction before new active embeddings are available.

AI calls for extraction, image/screenshot reading, and embeddings go through the OpenAI-compatible AI Gateway adapter, not direct OpenAI calls. Every model call declares purpose, model, prompt version, input source bundle, and output schema expectation where applicable. Image/screenshot extraction requires an active Gateway model with image-input and extraction capability; if none is configured, extraction fails safely. Provider usage metadata should be emitted when available for Usage persistence without turning usage events into billing or credit behavior.

## UX & Interaction Patterns

Admin knowledge work lives in a role-protected admin shell separated from traveler chat. The main surfaces are knowledge intake, draft review queue, knowledge card detail, approved list where applicable, and seed progress. Admin mobile usability is desirable, but dense batch review may be optimized for tablet/desktop as long as core edit/reject/approve remains functional where feasible.

The intake submitter supports URL, raw text, copied post content, and screenshot/file metadata. Failed extraction is recoverable, shows a safe operator-facing error, and creates no approved card. Batch intake tracks each URL independently with statuses such as pending, reading, extracted, needs review, approved, failed, duplicate, or rejected.

Draft review should show structured fields: title, type, route/location, summary, source, collected date, confidence label, freshness-sensitive flag, tags, status, and extraction/create-update/conflict status where relevant. Operators edit through forms, not unstructured AI prose. Save draft, reject, approve, and archive are distinct actions; approval must not be accidental.

Seed progress shows the count of approved Hanoi-to-HCMC corridor items, remaining gap to 100, and distribution by type and route/location. Source/confidence labels must always include text, not color alone. Use compact source/confidence chips and freshness warnings consistent with the design spine, while keeping raw source details inside operator-only views.

## Cross-Story Dependencies

Stories 4.1 and 4.2 establish source/raw-material storage and AI extraction foundations needed by later review, update, batch, approval, and indexing stories. Stories 4.3 through 4.7 depend on normalized source metadata and card-source linkage being available before approval can produce retrieval-ready, provenance-ready cards. Story 4.8 depends on approved card lifecycle and retrievable text being stable enough to create, stale, disable, or refresh embeddings safely. Story 4.9 depends on approved cards carrying corridor route/location and type metadata.

Epic 4 depends on Epic 1 admin role protection and audited protected mutations. It feeds Epic 5 retrieval and provenance: approved cards, source metadata, confidence labels, freshness flags, and embeddings become the curated knowledge input for traveler answer grounding.
