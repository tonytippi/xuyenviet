---
stepsCompleted:
  - step-01-requirements-extraction
  - step-02-epic-design
  - step-03-story-generation
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/home-logged-out.html
  - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/home-logged-in-empty.html
  - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/mockups/three-panel-chat-map.html
  - _bmad-output/project-context.md
---

# xuyenviet - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for xuyenviet, decomposing the requirements from the PRD and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: The system shall provide a Vietnamese chat interface for authenticated users.

FR-2: The system shall allow users to ask broad, underspecified road-trip planning questions.

FR-3: The system shall respond in Vietnamese by default.

FR-4: The system shall provide useful initial guidance even when some trip details are missing.

FR-5: The system shall ask concise follow-up questions when important planning details are missing.

FR-6: The system shall support iterative refinement across a conversation.

FR-6A: The system shall stream AI Ask assistant responses when the selected Gateway model and orchestration path support streaming, but only after required context, source-bundle, and provenance inputs are assembled.

FR-6B: The system shall allow authenticated users to submit supported image inputs with AI Ask messages when using an image-capable Gateway model.

FR-6C: The system shall validate image inputs for size, type, ownership, and safety before any provider call, and invalid image submissions shall not create provider calls.

FR-7: The system shall format travel answers with suggested plan/options, rationale, practical tips, warnings, sources, uncertainty notes, and next steps.

FR-8: The system shall require Google Login before a user can ask AI.

FR-9: The system shall associate chat sessions and trip projects with the authenticated user.

FR-10: The system shall extract traveler and trip details from chat, including adults, children, children's ages when known, preferences, prior trips, budget, hotel style, driving tolerance, and constraints.

FR-11: The system shall reuse relevant context within the current chat session or selected trip project.

FR-12: The system shall distinguish chat-session context from trip-project context.

FR-13: The system shall allow users to correct trip details through normal chat messages.

FR-14: The system shall show users a clear notice that chat and trip details may be stored to support the current session or trip project.

FR-15: The system shall allow users to delete a chat session or trip project they own.

FR-16: The system shall not store sensitive personal data beyond what is needed for trip personalization.

FR-17: The system shall support operator-created knowledge cards.

FR-18: Each knowledge card shall include title, type, location or route segment, summary, source, collected date, confidence level, tags, and freshness-sensitive flag.

FR-19: Knowledge card types shall include place, food, hotel area, activity, service, route note, warning, cost note, parking, EV charging, kid-friendly tip, discount/promotion, and general travel tip.

FR-20: Operators shall be able to create, edit, approve, and archive knowledge cards.

FR-21: Only approved knowledge cards shall be used for normal AI retrieval.

FR-22: Knowledge cards shall preserve source provenance enough for users or operators to inspect where the information came from.

FR-23: Operators shall be able to submit raw source material as URL, raw text, copied post content, or image/screenshot.

FR-23A: The system shall support queued Facebook URLs whose visible post content can be captured later by an operator-run browser automation tool.

FR-23B: Facebook capture automation shall populate operator-only raw source material only after operator-visible content is extracted and confirmed; it shall not store browser credentials, cookies, tokens, local storage, full HTML dumps, or hidden page data.

FR-24: The system shall use AI to propose structured knowledge cards from submitted source material.

FR-25: The system shall require human approval before extracted cards become searchable by AI.

FR-26: The system shall support confidence labels such as unverified, community, curated, partner, or official.

FR-27: The system shall allow operators to mark facts as freshness-sensitive when they involve price, schedule, availability, road condition, opening hours, weather, or service status.

FR-28: The system shall support a minimum public-MVP seed set of 100 approved knowledge cards across the Hanoi-to-HCMC corridor.

FR-29: The system shall retrieve relevant approved knowledge cards for user questions.

FR-30: The system shall prioritize answer context in this order: selected trip project context, current chat session context, approved XuyenViet knowledge, web search fallback, and general AI knowledge.

FR-31: The system shall use web search fallback when approved knowledge is missing, sparse, or freshness-sensitive.

FR-32: The system shall identify when information came from chat/trip context, XuyenViet knowledge cards, web search, or general AI reasoning.

FR-33: The system shall warn users to verify changing details before acting or booking.

FR-34: The system shall avoid presenting unverified collected information as guaranteed fact.

FR-35: Web search results used in answers shall be shown as external/unverified unless reviewed into approved knowledge cards.

FR-36: The system shall prefer official/provider pages over reposted or unattributed sources when using web search fallback.

FR-37: Facebook-derived information shall not be treated as official unless it comes from an identifiable official/provider page.

FR-38: When children are part of the trip, the system shall consider shorter driving blocks, rest stops, child-friendly activities, learning opportunities, hotel convenience, and backup activities.

FR-39: The system shall identify places or activities that may be unsuitable or boring for children when relevant.

FR-40: The system shall suggest family-relevant tips such as child discounts when known from sources.

FR-41: The system shall balance parent goals with child comfort and experience.

FR-42: The system shall allow public sign-in without an email allowlist, but AI Ask shall require an authenticated Google user.

FR-43: The system shall provide an operator/admin area separate from traveler chat.

FR-44: The system shall support at least one admin/operator account for initial knowledge management.

FR-45: The system shall allow future expansion to multiple operators without redesigning the knowledge workflow.

FR-46: The system shall capture a simple usefulness rating for AI answers during the public MVP.

FR-47: The system shall record AI usage events for authenticated AI requests, including user, conversation or trip context when applicable, AI purpose, provider/model, timestamp, and available usage/cost metadata.

FR-48: The system shall capture referral attribution when a new user signs in or registers through a valid referral link, without calculating rewards, ranking, payout, or credit conversion in MVP.

FR-49: The system shall manage AI Gateway model records with gateway model name, intended purpose, supported input/output capabilities, active status, and input/output/cache pricing metadata.

FR-50: The system shall use configured model pricing metadata to estimate AI usage cost when provider usage token metadata is available, without creating credit balance or billing behavior in MVP.

### NonFunctional Requirements

NFR-1: User-facing chat responses should feel responsive enough for interactive planning.

NFR-2: The product shall preserve chat sessions and trip projects securely and only for authenticated users.

NFR-3: The system shall not expose operator-only raw source material or admin controls to normal travelers.

NFR-4: AI answers shall be auditable enough to identify which knowledge cards or source types influenced the response.

NFR-5: The system shall support Vietnamese content input, retrieval, and output.

NFR-6: The MVP shall tolerate sparse internal knowledge by using web search fallback and clearly labeling uncertainty.

NFR-7: The system shall be designed so Google Maps integration, public submissions, and booking/partner flows can be added later without becoming MVP dependencies.

NFR-8: Browser automation for Facebook capture shall run as an operator-controlled operations tool, not as public request-path app logic or unattended mass crawling.

### Additional Requirements

- Use a Next.js App Router modular monolith with TypeScript, React Server Components where useful, and route handlers/server actions for mutations.

- Keep feature ownership boundaries explicit across Auth, Chat/Trips, Knowledge, Retrieval, Search, AI Orchestration, Admin, Feedback/Eval, Usage, Referrals, and Audit.

- Use PostgreSQL as the owned data plane for users, roles, referral attribution, trip projects, conversations, messages, chat/trip context, knowledge cards, sources, embeddings, web results, AI usage events, feedback, and audits.

- Store retrieval embeddings in pgvector tables linked to first-class product rows; external vector stores must not become hidden source-of-truth.

- Use Drizzle for schema definitions, migrations, and typed data access; introduce all tables and indexes through migrations.

- Implement Auth.js Google OAuth with PostgreSQL-backed sessions/accounts and server-side role checks for protected personalization/admin capabilities.

- Public entry/sign-in routes may be reachable without an allowlist; AI Ask routes and actions require an authenticated session, and every admin/operator route/action validates session and role before reading or mutating protected data.

- Perform all protected mutations server-side and record audit context with actor, target, operation, timestamp, and relevant before/after summary where appropriate.

- Enforce one owning command module per mutable aggregate and prohibit generic cross-module upserts/deletes for another module's aggregate.

- Implement knowledge-card lifecycle as draft, approved, archived; only approved cards are retrievable for traveler answers.

- Normalize sources and link approved cards through knowledge_card_sources; retrieval source metadata must come from linked source rows, not free-text card fields.

- Support knowledge collection from URL, raw text, copied post content, and image/screenshot inputs, with operator-only raw material and preserved provenance.

- Prevent traveler answer source bundles from exposing raw source material or operator-only fields.

- Implement AI Ask through a fixed context priority pipeline: selected trip project context, current chat session context, approved knowledge, web search fallback, general reasoning.

- Assemble source bundle before generation and pass explicit provenance metadata into the prompt.

- Keep web search behind an adapter returning query, title, URL, snippet/content, score, checkedAt, sourceType, and confidence.

- Treat search-derived facts as unverified until approved into knowledge cards; prefer official/provider pages through query construction, domain controls, country bias, and post-filtering.

- Validate web search fallback quality across candidate providers or mechanisms before relying on it for public MVP: Vietnamese corridor queries, official/provider preference, URL/title/snippet/date availability, cost, rate limits, and failure behavior.

- Keep OpenAI-compatible AI Gateway access behind an adapter for chat generation, extraction, embeddings, and evaluation; do not call OpenAI directly.

- Every model call must declare purpose, model, prompt version, input source bundle, and output schema expectation where applicable.

- Persist AI usage events for authenticated AI requests with user/context references, purpose, provider/model, timestamp, latency, success/failure status, and available usage/cost metadata, without creating credit ledger behavior.

- Block public MVP launch until AI Gateway/provider data-processing settings and privacy notice text are verified so project data is not used for provider training where configurable.

- Persist answer provenance row-per-source-item in assistant_response_provenance and render UI source/confidence from stored provenance, not answer text parsing.

- Persist assistant message and provenance in the same transaction.

- Split context into chat-session context and trip-project context; context persistence must reject clearly disallowed sensitive data.

- Allow users to delete chat sessions and trip projects they own; deletion removes or disables associated messages/context/embeddings from normal UI and retrieval use.

- Retain only minimal non-content audit metadata after chat/trip deletion when needed for operational integrity.

- Capture first referral attribution during sign-in or registration when a valid referral link is present, without calculating rewards, ranking, payout, or credit conversion in MVP.

- Require deletion behavior before migration approval for new tables that can contain chat/project-derived retrievable content.

- Keep dev, staging, and production databases, secrets, OAuth config, and provider keys separate.

- Deploy to a serverless-friendly Next.js runtime with hosted PostgreSQL plus pgvector; keep provider-specific features behind config/adapters until provider choices are final.

- Start chat streaming only after retrieval/search context and provenance ledger inputs are assembled.

- Target first visible answer within 5 seconds without web search and within 10 seconds with web search.

- Store core entities: users, accounts, sessions, roles, referral_codes, referral_attributions, trip_projects, conversations, messages, chat_context, context_embeddings, assistant_response_provenance, sources, raw_source_material, knowledge_cards, knowledge_card_embeddings, web_search_results, ai_usage_events, feedback, eval_runs, and audit_events.

- Derive MVP confidence labels from source_type and verification_status; web search results remain verification_status unverified even when source_type is official.

- Retrieval must join embeddings back to current owner rows, filter current owner status, and disable/stale old embeddings when retrievable text or owner status changes.

- Persist retrieval_decision for every assistant answer, including candidate counts, selected counts, thresholds, freshness/conflict flags, web-search trigger and reason, and general-reasoning usage.

- Implement Feedback/Eval storage for versioned public-MVP prompts, rubric dimensions, evaluator prompt/model version, run outputs, linked assistant responses/provenance, usefulness scores, hallucination flags, missing-uncertainty flags, and generic-ChatGPT comparison flags.

- Production must include separate production DB/secrets, server-side auth/roles for protected capabilities, operator audit trail, model/search/latency/provenance logging, user-owned chat/trip deletion path, and backup/restore path before public user onboarding.

### UX Design Requirements

UX-DR1: Public `/` must be a centered Vietnamese entry surface with the warm hero treatment, Google sign-in CTA, sign-in-gated compact ask box, icon-led starters, and no authenticated sidebar or user data.

UX-DR2: Authenticated AI Ask must implement three canonical shell states: logged-in empty state with a flat sidebar and centered greeting/composer, active edge-to-edge planning workspace, and a contextual detail inspector only after an answer descriptor is selected.

UX-DR3: The authenticated desktop shell must use a persistent pale-stone sidebar (276px), a readable central answer column capped at 760px, and a conditional right inspector around 380px; it must not be a floating rounded app card or a persistent graph-paper/map surface.

UX-DR4: Tablet may reduce the sidebar to a 74px rail and move details below or into a sheet. Mobile must use a top bar, navigation sheet, single-column chat, bottom-safe reachable composer, and detail/source sheets without alternate data loaders or state owners.

UX-DR5: Global UI foundations must use Inter for all display and functional text, semantic white/stone/green/amber/teal/source-color tokens, consistent radii/spacing, global focus treatment, and reduced-motion behavior. Vietnamese copy must preserve diacritic legibility at 200% zoom and common mobile widths.

UX-DR6: App-wide font loading, semantic tokens, base page surfaces, and reduced-motion styling must be root-owned; reusable presentational primitives must be data-free and cannot import feature data, server actions, or route state.

UX-DR7: Product icons must use one typed local SVG boundary. A migrated shell surface must not mix feature-local SVGs, emoji, text glyphs, or multiple icon systems.

UX-DR8: Icon-only controls for attachment, send, close, menu, delete, and collapse must have accessible names, visible focus treatment, hover/focus tooltips, and at least 44px touch targets on mobile. Destructive confirmations retain explicit text.

UX-DR9: The sidebar must contain brand, `Trò chuyện mới`, grouped user-owned conversation history, grouped user-owned trip projects, account/privacy access, and server-authorized admin entry only. Rows must be keyboard/touch usable, visibly active, and expose actions without hover-only behavior.

UX-DR10: Selecting a trip project must visibly scope the main chat through a header/composer context indicator; users must be able to distinguish ordinary chat from project-scoped chat.

UX-DR11: The idle chat composer must contain only prompt input, icon-only attachment trigger when supported, and icon-only send trigger. Attachment instructions, labels, keyboard guidance, validation details, and preview appear only contextually after focus, validation failure, pending work, or file selection.

UX-DR12: Attached images must render a compact thumbnail/file row with label, size/status, and icon-only accessible remove action, and must not resemble approved source chips.

UX-DR13: The logged-in empty state must provide a centered Vietnamese greeting, composer, four icon-led starter cards, and no blank inspector.

UX-DR14: Active answers must remain scannable through hierarchy and relevant plan/options, rationale, tips, warnings, sources, uncertainty, and next-step sections. Compact horizontally-scrollable section chips must navigate relevant sections without altering stored conversation data.

UX-DR15: The UI may render only persisted best-effort annotation descriptors of types `source`, `warning`, `trip_fact`, and `action`; it must not infer place, hotel, route, or cost entities from Vietnamese answer prose.

UX-DR16: Selecting/focusing a persisted descriptor must open one contextual detail presentation with category icon, title, summary, supported actions, quick facts, related details, and safe provenance chips. The inspector is not a second chat or map-first surface.

UX-DR17: Desktop inspector and mobile sheet are controlled views of the same transient selected-detail state. Exactly one is interactive at a time; inactive duplicates must be inert and excluded from assistive technology. Closing restores focus to the selection trigger.

UX-DR18: Source/confidence details must use stored provenance and traveler-safe snapshots, show labels rather than color alone, reveal title/type/URL/date/confidence/freshness when available, and never expose raw operator-only material.

UX-DR19: Streaming UI must begin only after context/source preparation, render subtle readable pending text, announce completion through `aria-live`, reconcile to persisted final content, and show recoverable failure without presenting partial content as saved.

UX-DR20: The storage notice must be a low-friction inline callout near first AI Ask use; delete confirmations must name the chat/project and explain normal UI/retrieval removal.

UX-DR21: Shell data and selection must be server-loaded and URL-owned for conversation/project selection. Client state is limited to draft, attachment preview, streaming, sheet visibility, and selected descriptor; terminal create/select/delete/project-switch/stream states must reconcile the canonical URL while retaining active trip context.

UX-DR22: Public, traveler, and admin surfaces must target WCAG 2.2 AA: keyboard reachability, logical focus order, `aria-current`, polite live announcements, color-independent status labels, focus-restoring sheets, one-level modal stacks, and mobile-safe interactions.

UX-DR23: Admin knowledge workflows remain visually and navigationally separate from traveler chat, use structured review/edit forms and explicit approval, and may defer dense bulk operations to desktop.

UX-DR24: Referral attribution must remain silent through sign-in; no reward, credit, ranking, payout, or points UI may be introduced.

### FR Coverage Map

FR-1: Epic 2 - Vietnamese chat interface

FR-2: Epic 2 - Broad road-trip planning questions

FR-3: Epic 2 - Vietnamese default responses

FR-4: Epic 2 - Useful initial guidance with missing details

FR-5: Epic 2 - Concise follow-up questions

FR-6: Epic 2 - Iterative refinement

FR-6A: Epic 2 - Streaming AI Ask responses

FR-6B: Epic 2 - AI Ask image input

FR-6C: Epic 2 - Image input validation before provider calls

FR-7: Epic 2 - Structured travel answer format

FR-8: Epic 1 - Google Login

FR-9: Epic 3 - User-owned chat sessions and trip projects

FR-10: Epic 3 - Traveler profile extraction

FR-11: Epic 3 - Chat/trip context reuse

FR-12: Epic 3 - Chat-session context vs trip-project context

FR-13: Epic 3 - Chat-based trip detail correction

FR-14: Epic 3 - Chat/trip storage notice

FR-15: Epic 3 - Delete chat session or trip project

FR-16: Epic 3 - Sensitive-data protection

FR-17: Epic 4 - Operator-created knowledge cards

FR-18: Epic 4 - Required knowledge-card fields

FR-19: Epic 4 - Knowledge-card type taxonomy

FR-20: Epic 4 - Create/edit/approve/archive cards

FR-21: Epic 4 - Approved-only retrieval eligibility

FR-22: Epic 4 - Source provenance preservation

FR-23: Epic 4 - Raw source submission formats

FR-23A: Epic 4 - Queued Facebook URL capture

FR-23B: Epic 4 - Operator-only confirmed Facebook raw material capture

FR-24: Epic 4 - AI-assisted card extraction

FR-25: Epic 4 - Human approval before retrieval

FR-26: Epic 4 - Confidence labels

FR-27: Epic 4 - Freshness-sensitive marking

FR-28: Epic 4 - 100-card public-MVP seed set

FR-29: Epic 5 - Approved-card retrieval

FR-30: Epic 5 - Context priority order

FR-31: Epic 5 - Web search fallback trigger

FR-32: Epic 5 - Source category identification

FR-33: Epic 5 - Verify changing details warning

FR-34: Epic 5 - Avoid guaranteed unverified claims

FR-35: Epic 5 - Web facts shown external/unverified

FR-36: Epic 5 - Prefer official/provider sources

FR-37: Epic 5 - Facebook-derived source handling

FR-38: Epic 6 - Child-aware planning constraints

FR-39: Epic 6 - Identify child-unsuitable activities

FR-40: Epic 6 - Family-relevant sourced tips

FR-41: Epic 6 - Balance parent goals and child comfort

FR-42: Epic 1 - Public sign-in and authenticated AI Ask access

FR-43: Epic 1 - Separate operator/admin area

FR-44: Epic 1 - Initial admin/operator account

FR-45: Epic 1 - Future multi-operator expansion

FR-46: Epic 6 - Answer usefulness rating

FR-47: Epic 5 - AI usage event recording

FR-48: Epic 1 - Referral attribution capture

FR-49: Epic 5 - AI Gateway model catalog and pricing

FR-50: Epic 5 - Usage cost estimation from model pricing

## Epic List

### Epic 1: Public Sign-In And App Foundation

Travelers can access the public Vietnamese entry point, see the sign-in-gated ask experience, sign in with Google, and reach protected AI Ask only after authentication. Operators have server-role-gated admin entry, and referral attribution can be captured silently without reward UI.

**FRs covered:** FR-8, FR-42, FR-43, FR-44, FR-45, FR-48

### Epic 2: Traveler AI Planning Shell And Conversation Experience

Authenticated travelers can use the canonical AI planning shell: logged-in empty start, sidebar, centered composer, Vietnamese AI Ask, structured answers, streaming states, image input, and active chat with selectable answer entities that can open a contextual right detail panel.

**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-6A, FR-6B, FR-6C, FR-7

### Epic 3: Chat Sessions And Trip Projects

Travelers can organize planning through user-owned conversations and trip projects, revisit history from the sidebar, make the active trip context visible, reuse context, correct trip details through chat, and delete owned chats or projects.

**FRs covered:** FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16

### Epic 4: AI-Assisted Knowledge Intake And Approval

Operators can submit travel sources, including URLs, copied posts, raw text, screenshots, and queued Facebook URLs; AI prepares knowledge drafts; operators review, edit, approve, archive, and seed the Hanoi-to-HCMC corridor with approved cards.

**FRs covered:** FR-17, FR-18, FR-19, FR-20, FR-21, FR-22, FR-23, FR-23A, FR-23B, FR-24, FR-25, FR-26, FR-27, FR-28

### Epic 5: Grounded Retrieval, Web Search, Provenance, And Usage

Traveler answers use the required context priority pipeline, retrieve approved knowledge, use web search fallback when needed, persist provenance, show source/confidence details, manage AI Gateway model capabilities/pricing, and record authenticated AI usage events.

**FRs covered:** FR-29, FR-30, FR-31, FR-32, FR-33, FR-34, FR-35, FR-36, FR-37, FR-47, FR-49, FR-50

### Epic 6: Family-Aware Planning And Public MVP Quality Loop

When children are part of a trip, answers adapt recommendations for family travel, and the product captures usefulness feedback and evaluation data to measure whether XuyenViet is more useful than generic ChatGPT.

**FRs covered:** FR-38, FR-39, FR-40, FR-41, FR-46

### Epic 7: Traveler Workspace UX Convergence

Travelers can enter and use a calm, trustworthy, responsive AI planning workspace: a focused public entry, a centered logged-in empty state, and an active white/stone conversation workspace with history/projects, compact icon-first composition, readable answers, and a contextual inspector. The shell preserves existing authenticated ownership, URL selection, streaming, provenance, and deletion behavior while making those capabilities understandable across desktop and mobile.

**FRs supported:** FR-1, FR-6A, FR-6B, FR-7, FR-8, FR-9, FR-12, FR-14, FR-15, FR-32, FR-33, FR-42, FR-43, FR-46, FR-48

**UX-DRs covered:** UX-DR1 through UX-DR24

**Implementation notes:** This is a brownfield convergence epic. It depends on the feature behavior in Epics 1–5, but consolidates the cross-cutting traveler-shell redesign because its stories deliberately share `src/app/layout.tsx`, `src/app/globals.css`, `/`, `/ai-ask`, and AI Ask feature surfaces. It does not introduce map integration, free-text entity parsing, alternate persistence/data loaders, or new backend aggregates.

## Epic 1: Public Sign-In And App Foundation

Travelers can access the public Vietnamese entry point, see the sign-in-gated ask experience, sign in with Google, and reach protected AI Ask only after authentication. Operators have server-role-gated admin entry, and referral attribution can be captured silently without reward UI.

### Story 1.1: Initialize Public MVP Web App Foundation

As a product team,
I want a Next.js TypeScript app foundation with database/migration wiring,
So that authenticated AI Ask and future protected features can be implemented consistently inside the modular monolith.

**Acceptance Criteria:**

**Given** the repository has no application foundation
**When** the app foundation is created
**Then** the project uses Next.js App Router with TypeScript and a clear feature/module folder structure
**And** Drizzle is configured for PostgreSQL migrations without creating unrelated domain tables.

**Given** the app runs locally
**When** a user opens the root route
**Then** a public entry page loads successfully
**And** required environment variables are documented with safe placeholders.

**Given** future features need server-side mutations
**When** shared server utilities are added
**Then** they support authenticated server-side entrypoints without exposing client-side write paths.

### Story 1.2: Public Sign-In Entry And AI Ask Gate

As a traveler,
I want to open the public app entry point and sign in before asking AI,
So that XuyenViet is publicly reachable while AI usage remains tied to an authenticated user.

**Acceptance Criteria:**

**Given** a user is not signed in
**When** they open the public app entry route
**Then** the route is accessible without email allowlist validation
**And** the app presents a Vietnamese logged-out homepage with value proposition, Google sign-in CTA, starter chips, and a sign-in-gated ask box.

**Given** a user is not signed in
**When** they view the public homepage
**Then** the page does not render the authenticated app sidebar, conversation history, trip projects, admin navigation, or user-owned data
**And** visible traveler copy remains Vietnamese-first with readable diacritics.

**Given** a user is not signed in
**When** they attempt to open AI Ask or submit an AI question
**Then** access is blocked or redirected to sign-in
**And** no conversation, chat/trip context, retrieval, usage event, or AI provider call is created for that request.

**Given** a public visitor arrives with a referral parameter
**When** they view the logged-out homepage and choose sign-in
**Then** referral attribution data is preserved silently through the auth flow when possible
**And** the page does not show reward, credit, payout, points, or ranking UI.

**Given** a user is signed in with Google
**When** they open AI Ask
**Then** the AI Ask route is accessible
**And** server-side checks can resolve the authenticated user for future conversation and chat/trip ownership.

### Story 1.3: Google Login With Auth.js

As a traveler,
I want to sign in with Google,
So that XuyenViet can identify me before I ask AI.

**Acceptance Criteria:**

**Given** Google OAuth credentials are configured
**When** a user selects Google sign-in
**Then** Auth.js completes the OAuth flow and creates or reuses a PostgreSQL-backed user/session/account record
**And** no email allowlist check is required for normal traveler sign-in.

**Given** an authenticated user has an active session
**When** they revisit the app
**Then** the server can resolve their session for AI Ask route and action checks
**And** sign-out clears the active session.

**Given** OAuth or provider configuration fails
**When** a user attempts sign-in
**Then** the app shows a safe failure state without exposing secrets.

### Story 1.4: Roles And Separate Admin Area

As an operator,
I want a role-protected admin area separate from traveler chat,
So that knowledge management can be restricted to authorized users.

**Acceptance Criteria:**

**Given** a signed-in user has a normal traveler role only
**When** they attempt to open admin routes
**Then** access is denied server-side
**And** admin navigation is not shown to them.

**Given** a signed-in user has an admin or operator role
**When** they open the admin area
**Then** they can access a placeholder admin shell
**And** the route clearly separates admin workflows from traveler chat.

**Given** roles are stored in PostgreSQL
**When** authorization checks run
**Then** route handlers/server actions validate session and role before reading or mutating admin data.

### Story 1.5: Audit Trail For Protected Mutations

As an operator/admin,
I want protected mutations to write audit events,
So that public MVP operations can be traced and reviewed.

**Acceptance Criteria:**

**Given** a protected server-side mutation is executed
**When** the mutation changes protected state
**Then** an audit event records actor, target, operation, timestamp, and relevant before/after summary where appropriate
**And** audit writes occur server-side only.

**Given** a mutation fails authorization
**When** the request is rejected
**Then** no protected state is changed
**And** the failure does not expose sensitive data.

**Given** future modules need audited writes
**When** they implement command modules
**Then** they can use a shared audit helper without bypassing aggregate ownership rules.

### Story 1.6: Environment And Public Launch Safety Baseline

As a product owner,
I want environment separation and public launch safety checks,
So that user data, provider keys, and admin access are not mixed across environments.

**Acceptance Criteria:**

**Given** the app is configured for local development
**When** environment variables are loaded
**Then** dev, staging, and production settings are represented separately
**And** local bypasses are not deployable production defaults.

**Given** production deployment is prepared
**When** required secrets or database URLs are missing
**Then** the app fails safely or blocks startup for protected functionality
**And** no placeholder provider secrets are accepted in production.

**Given** public user onboarding is planned
**When** production readiness is checked
**Then** the documented checklist includes separate database/secrets, OAuth config, admin roles, provider privacy settings, and backup/restore expectation.

### Story 1.7: Capture Referral Attribution At Sign-Up

As a product owner,
I want referral links to be captured when a new user signs in,
So that future referral programs can attribute registrations without adding reward behavior to MVP.

**Acceptance Criteria:**

**Given** the MVP needs valid referral links for attribution testing
**When** referral support is configured
**Then** the system supports a minimal referral-code source through seeded database records, admin-created records, or config-backed campaign records
**And** validation is performed server-side against that source of truth.

**Given** a public visitor opens XuyenViet with a valid referral code in the URL
**When** they complete Google sign-in as a new user
**Then** the system stores referral attribution linking the new user to the referral code and referrer when resolvable
**And** the attribution is created server-side.

**Given** a referral code is invalid or missing
**When** the user signs in
**Then** sign-in still works normally
**And** no reward, credit, payout, or ranking state is created.

**Given** a user already has referral attribution
**When** they open a different referral link later
**Then** the first attribution is preserved unless an explicit admin correction feature is implemented later.

## Epic 2: Traveler AI Planning Shell And Conversation Experience

Authenticated travelers can use the canonical AI planning shell: logged-in empty start, sidebar, centered composer, Vietnamese AI Ask, structured answers, streaming states, image input, and active chat with selectable answer entities that can open a contextual right detail panel.

### Story 2.0: Introduce Test Framework And Retroactive Coverage For Epic 1 Protected Paths

As a product team,
I want a server-side test framework with retroactive coverage for Epic 1 protected paths,
So that Epic 2 features building on auth gates, roles, audit, and env guards rest on verified foundations.

**Acceptance Criteria:**

**Given** the repository has no test framework
**When** Story 2.0 is implemented
**Then** Vitest (or equivalent) is configured with a test database separate from dev/production
**And** Drizzle migrations run against the test database
**And** `pnpm test` runs the suite without requiring real OAuth credentials or external providers.

**Given** Story 1.2/1.3 auth gate fail-closed behavior
**When** server-side integration tests exercise unauthenticated AI Ask route and submission
**Then** tests verify redirect to `/sign-in?next=/ai-ask` and no side effects on blocked paths.

**Given** Story 1.4 role-protected admin area
**When** tests exercise `/admin` with traveler, operator, and admin roles
**Then** traveler access is denied server-side and operator/admin access renders.

**Given** Story 1.5 audit trail for protected mutations
**When** tests exercise the audited mutation wrapper
**Then** protected changes and audit rows commit together or not at all.

**Given** Story 1.6 environment and public launch safety baseline
**When** tests exercise env guards with missing, placeholder, and production database URLs
**Then** guards fail closed on placeholder/localhost/missing secrets and allow valid dev/staging config.

**Given** the deferred-work.md 1.6 entry
**When** Story 2.0 ships
**Then** the env-guard test debt entry is closed.

_Dependencies: Must complete before Story 2.2. May run in parallel with Story 2.1._

### Story 2.1: Authenticated AI Ask Chat Shell

As an authenticated traveler,
I want to open the empty Vietnamese AI planning shell,
So that I can start a road-trip planning conversation from a familiar, focused workspace.

**Acceptance Criteria:**

**Given** a user is signed in with Google
**When** they open AI Ask
**Then** they see the logged-in empty AI Ask state with left sidebar, centered Vietnamese greeting, centered composer, and starter cards
**And** the interface is Vietnamese-first.

**Given** a user is not signed in
**When** they try to open AI Ask
**Then** they are redirected or blocked by the authenticated route gate from Epic 1
**And** no chat data is loaded.

**Given** the chat screen loads
**When** no conversation has started
**Then** the UI provides a clear prompt or empty state that invites the user to ask a Vietnam road-trip question
**And** it does not render an empty right detail panel before an answer or selected entity exists.

**Given** the authenticated AI Ask shell renders on desktop
**When** sidebar data is available
**Then** the shell shows the `Cuộc trò chuyện mới` action, conversation area, trip project area, account/privacy access, and admin entry only when server-authorized
**And** normal traveler payloads do not include admin-only navigation.

**Given** the authenticated AI Ask shell renders on mobile
**When** the user opens navigation
**Then** conversation history and trip projects are available through a mobile sheet or equivalent responsive navigation
**And** the centered composer remains reachable without showing a persistent desktop sidebar.

### Story 2.2: Create Conversation And Send First Message

As an authenticated traveler,
I want to send my first trip-planning message,
So that XuyenViet can start a conversation with me.

**Acceptance Criteria:**

**Given** an authenticated user is on AI Ask
**When** they submit a Vietnamese planning question
**Then** the system creates a conversation owned by that user
**And** the user message is persisted with timestamp and conversation ID.

**Given** the user message is empty or invalid
**When** the user submits it
**Then** the system rejects it with a clear validation message
**And** no conversation or AI call is created.

**Given** a conversation belongs to one user
**When** another authenticated user attempts to access it
**Then** access is denied server-side.

### Story 2.3: Generate Vietnamese Initial AI Answer

As an authenticated traveler,
I want to receive an initial Vietnamese AI answer,
So that I get useful guidance even before all trip details are known.

**Acceptance Criteria:**

**Given** an authenticated user submits a broad road-trip planning question
**When** the AI answer is generated
**Then** the response is in Vietnamese by default
**And** it gives useful initial guidance without requiring a long form first.

**Given** important trip details are missing
**When** the answer is generated
**Then** the answer includes concise follow-up questions
**And** still provides an initial plan or direction.

**Given** the AI provider call fails
**When** the user is waiting for an answer
**Then** the app shows a safe error state
**And** the failed request does not create a misleading assistant message.

**Given** an authenticated AI answer generation attempt starts
**When** the system calls an AI provider in this story before full usage instrumentation is complete
**Then** it records at least a minimal usage event or durable usage placeholder with user ID, conversation/message context when available, purpose, provider/model when known, timestamp, and success/failure status
**And** later Story 5.9 can enrich or standardize usage metadata without retrofitting missing historical AI calls.

### Story 2.4: Structured Road-Trip Answer Format

As a traveler,
I want AI answers organized into practical sections,
So that I can quickly understand options, warnings, and next steps.

**Acceptance Criteria:**

**Given** the user asks a trip-planning question
**When** the assistant responds
**Then** the answer includes suggested plan/options, rationale, practical tips, warnings, sources, uncertainty, and next steps when relevant
**And** the format remains readable on desktop and mobile.

**Given** the assistant answer contains multiple planning topics
**When** the answer is displayed
**Then** section chips or equivalent navigation can represent sections such as `Ăn gì?`, `Đi đâu?`, `Ở đâu?`, `Về chuyến đi`, `Cần biết`, and `Chi phí và mẹo` when relevant
**And** the answer remains scannable instead of rendering every section with equal visual weight.

**Given** source/provenance features are not yet implemented in this epic
**When** the assistant formats the answer
**Then** it reserves or supports a source/confidence section contract for later Epic 5 integration
**And** it does not invent fake citations or source labels.

**Given** answer copy is rendered to travelers
**When** Vietnamese text includes place names, warnings, or follow-up questions
**Then** diacritics remain readable across common desktop/mobile widths
**And** labels do not rely on color alone.

**Given** the question is outside the Hanoi-to-HCMC focus
**When** the assistant responds
**Then** it can still give general guidance
**And** it clearly avoids overclaiming local curated coverage.

### Story 2.5: Continue Conversation With Context

As an authenticated traveler,
I want to refine my trip plan across messages,
So that I do not need to repeat the same conversation details.

**Acceptance Criteria:**

**Given** an authenticated user has an existing conversation
**When** they send a follow-up message
**Then** the system loads prior messages for that conversation
**And** the assistant answer considers recent conversation context.

**Given** a conversation has multiple messages
**When** the chat screen is reopened
**Then** the message history is displayed in chronological order
**And** the user can continue the thread.

**Given** a user attempts to continue another user's conversation
**When** the request is made
**Then** access is denied server-side
**And** no messages are exposed.

### Story 2.6: Basic Chat Responsiveness And Failure States

As a traveler,
I want clear loading and failure states while AI responds,
So that the chat feels usable during public MVP testing.

**Acceptance Criteria:**

**Given** a user submits a message
**When** the system is generating an answer
**Then** the UI shows a pending state
**And** duplicate submission is prevented or safely handled.

**Given** response generation takes longer than expected
**When** the user is waiting
**Then** the UI continues to communicate progress without implying completion
**And** the user can recover from a failed request.

**Given** the assistant answer is saved
**When** the UI renders the response
**Then** the displayed message matches the persisted assistant message
**And** no client-only answer state becomes the source of truth.

### Story 2.7: Stream AI Ask Responses And Accept Traveler Image Input

As an authenticated traveler,
I want AI Ask to stream responses and accept relevant image inputs,
So that planning feels responsive and I can ask about screenshots or photos without leaving chat.

**Acceptance Criteria:**

**Given** an authenticated user submits a text-only AI Ask message
**When** the source/context preparation is complete and the selected Gateway model supports streaming
**Then** the assistant response streams progressively in the UI
**And** the final persisted assistant message remains the source of truth after completion.

**Given** streaming fails before completion
**When** the user is viewing the partial response
**Then** the app shows a recoverable failure state
**And** it does not create a misleading completed assistant message.

**Given** an authenticated user attaches a supported image to an AI Ask message
**When** the message is submitted
**Then** the system validates file type, size, ownership, and model image-input capability before any provider call
**And** the Gateway request includes the image only through the approved adapter path.

**Given** an image is unsupported, too large, unauthenticated, or attached to invalid text
**When** submission is attempted
**Then** the request is rejected before provider calls
**And** no message, usage event, or provider call is created unless the implementation explicitly supports text-only fallback and the user confirms it.

**Given** an image was accepted into a conversation
**When** the owning chat/session is deleted in later deletion stories
**Then** image metadata/files and image-derived retrievable content are removed or disabled from normal UI and retrieval according to the deletion contract.

_Dependency: Story 5.0 should provide the model capability catalog before Story 2.7 implementation unless a temporary hard-coded capability gate is explicitly approved for the story._

### Story 2.8: Selectable Answer Entities And Contextual Detail Panel

As an authenticated traveler,
I want to select places, routes, sources, and trip facts inside an answer,
So that I can inspect useful details without leaving the conversation.

**Acceptance Criteria:**

**Given** an active assistant answer contains selectable places, hotel areas, route segments, source chips, warnings, costs, or trip facts
**When** the answer is rendered
**Then** selectable items are represented through structured render descriptors derived from assistant message structure and stored source/provenance snapshots
**And** the UI does not parse Vietnamese free text to invent links, details, or source claims.

**Given** a traveler selects or keyboard-focuses a selectable answer entity
**When** detail data is available
**Then** the right contextual detail panel opens on desktop with selected title, Vietnamese summary, contextual actions, quick facts, related details, and provenance area
**And** the panel content is a read model, not a separately persisted mutable product aggregate.

**Given** the active chat has no selected answer entity
**When** the conversation is displayed
**Then** the UI does not force a blank right detail panel
**And** the logged-in empty state remains free of the right detail panel.

**Given** the traveler is on mobile
**When** they select an answer entity or source chip
**Then** the selected detail opens as a sheet or drawer
**And** closing it returns focus to the selected entity or opening control.

**Given** the detail panel exposes actions such as `Dùng trong kế hoạch`, `Xem tuyến đường`, or `Lưu`
**When** the user activates an action
**Then** the action calls the owning server-side command module when implemented
**And** the detail panel does not directly mutate another feature's aggregate.

**Given** the selected entity relates to location or route guidance
**When** its detail panel is shown
**Then** the detail is not map-first and does not require Google Maps integration
**And** route/place guidance remains text, card, or detail-panel based until a later map story is approved.

## Epic 3: Chat Sessions And Trip Projects

Travelers can organize planning through user-owned conversations and trip projects, revisit history from the sidebar, make the active trip context visible, reuse context, correct trip details through chat, and delete owned chats or projects.

### Story 3.1: Manage Chat Sessions

As an authenticated traveler,
I want to create and revisit separate chat sessions,
So that I can plan different travel questions without mixing every conversation together.

**Acceptance Criteria:**

**Given** an authenticated user opens AI Ask
**When** they start a new conversation
**Then** the system creates a chat session owned by that user
**And** messages in that session are scoped to that session.

**Given** a user has multiple chat sessions
**When** they view their chat history
**Then** they can see and reopen their own sessions
**And** sessions from other users are never visible.

**Given** conversation history is shown in the AI planning shell sidebar or mobile sheet
**When** rows are rendered
**Then** each conversation row shows a user-owned title or preview, active state when selected, and a row action entry for delete or future rename
**And** row actions are keyboard-accessible and not hover-only.

**Given** a user continues an existing chat session
**When** they send a follow-up message
**Then** the assistant can use relevant previous messages from that session
**And** unrelated chat sessions are not included by default.

**Given** the sidebar read model is loaded
**When** conversation rows are returned to the client
**Then** the data is scoped server-side to the authenticated user
**And** the client does not filter out other users' conversations because they are never included in the payload.

### Story 3.2: Create Trip Projects

As an authenticated traveler,
I want to create a trip project,
So that I can keep planning for one trip focused in one place.

**Acceptance Criteria:**

**Given** an authenticated user wants to plan a trip
**When** they create a trip project
**Then** the project is stored with an owner, title, and basic trip fields
**And** only the owner can access it.

**Given** a trip project exists
**When** the user opens it
**Then** they can see the project context and related chat sessions
**And** they can continue planning within that trip scope.

**Given** trip projects are shown in the AI planning shell sidebar or mobile sheet
**When** the user selects a trip project
**Then** the selected project row shows active state
**And** the main chat header or composer clearly indicates that the conversation is scoped to the selected trip project.

**Given** a user attempts to open another user's trip project
**When** the request reaches the server
**Then** access is denied
**And** no project data is exposed.

**Given** the trip project sidebar read model is loaded
**When** trip rows are returned to the client
**Then** the data is scoped server-side to the authenticated user
**And** row actions for project settings/delete are keyboard-accessible and not hover-only.

### Story 3.3: Extract Chat And Trip Context

As an authenticated traveler,
I want the app to understand trip details from my messages,
So that I do not have to fill out a long form.

**Acceptance Criteria:**

**Given** a user mentions travel details in chat
**When** context extraction runs
**Then** the system can identify details such as travelers, children, dates, duration, destination, preferences, prior trips, budget, hotel style, driving tolerance, and constraints
**And** extracted details are stored in the relevant chat session or selected trip project.

**Given** no trip project is selected
**When** context is extracted
**Then** details are scoped to the current chat session
**And** they do not automatically become project-level context.

**Given** a trip project is selected
**When** context is extracted
**Then** durable trip-planning details can update the trip project context
**And** temporary chat details can remain chat-scoped.

### Story 3.4: Use Chat Or Trip Context In Answers

As an authenticated traveler,
I want the assistant to use the current chat or trip project context,
So that answers are relevant to what I am planning.

**Acceptance Criteria:**

**Given** a user asks a question inside a chat session
**When** the assistant prepares an answer
**Then** it can use relevant context from that chat session
**And** it does not use unrelated sessions by default.

**Given** a user asks inside a selected trip project
**When** the assistant prepares an answer
**Then** selected trip project context has priority over ordinary chat-session context
**And** the assistant can use both when relevant.

**Given** chat context and trip project context conflict
**When** the assistant answers
**Then** it prefers the selected trip project context or asks a concise clarification if the conflict matters.

### Story 3.5: Correct Trip Details Through Chat

As an authenticated traveler,
I want to correct trip details naturally in chat,
So that the current chat or trip project stays accurate.

**Acceptance Criteria:**

**Given** a user corrects a trip detail, for example `con toi 8 tuoi, khong phai 6 tuoi`
**When** correction handling runs
**Then** the relevant chat or trip context is updated
**And** future answers use the corrected value.

**Given** the correction is ambiguous
**When** the assistant responds
**Then** it asks a concise clarification question
**And** it does not overwrite context with uncertain facts.

**Given** a correction applies only to the current chat session
**When** the context is updated
**Then** the trip project is not changed unless the user is working inside that project or clearly asks to update it.

### Story 3.6: Delete Chat Sessions

As an authenticated traveler,
I want to delete a chat session,
So that I can remove conversations I no longer want to keep.

**Acceptance Criteria:**

**Given** a user owns a chat session
**When** they delete it
**Then** the chat session, messages, extracted chat context, and derived chat-context embeddings are removed or disabled from normal UI and retrieval use
**And** the session no longer appears in their chat history.

**Given** a user attempts to delete another user's chat session
**When** the request reaches the server
**Then** the request is denied
**And** no data is changed.

**Given** minimal audit metadata is retained
**When** a chat session is deleted
**Then** retained metadata does not expose deleted message content in normal user-facing or retrieval paths.

### Story 3.7: Delete Trip Projects

As an authenticated traveler,
I want to delete a trip project,
So that I can remove a focused planning workspace and its stored trip context.

**Acceptance Criteria:**

**Given** a user owns a trip project
**When** they delete it
**Then** the project context and derived project-context embeddings are removed or disabled from normal UI and retrieval use
**And** the project no longer appears in their project list.

**Given** the trip project has linked chat sessions
**When** deletion runs
**Then** the product either deletes linked project chats or detaches them according to the chosen project behavior
**And** the behavior is clear to the user before deletion.

**Given** a user attempts to delete another user's trip project
**When** the request reaches the server
**Then** the request is denied
**And** no project data is changed.

## Epic 4: AI-Assisted Knowledge Intake And Approval

Operators can submit travel sources, including URLs, copied posts, raw text, screenshots, and queued Facebook URLs; AI prepares knowledge drafts; operators review, edit, approve, archive, and seed the Hanoi-to-HCMC corridor with approved cards.

### Story 4.1: Submit Travel Source For AI Reading

As an operator,
I want to submit a web page, Facebook post link, copied post content, or screenshot,
So that AI can read travel information and prepare it for review.

**Acceptance Criteria:**

**Given** an operator opens the knowledge intake area
**When** they submit a URL, Facebook post link, pasted text, or screenshot
**Then** the system stores a normalized source record with source kind, URL or canonical URL when available, label, publisher when available, collected or checked date, source type, verification status, and official/partner flags when applicable
**And** the raw submitted material or file metadata is stored separately as operator-only raw source material.

**Given** submitted raw material includes copied text, a screenshot, or provider-specific metadata
**When** the source is stored
**Then** traveler-facing source bundles can reference only safe source metadata
**And** raw text, image-derived notes, and operator-only fields are not exposed to normal travelers.

**Given** the submitted source is a Facebook post or copied community content
**When** it is stored
**Then** the source is labeled as community/unverified by default
**And** it is not treated as official unless the operator later marks it as an identifiable official/provider source.

**Given** source submission fails or the link cannot be read
**When** the operator submits it
**Then** the system shows a recoverable error
**And** no approved knowledge is created automatically.

### Story 4.1A: Capture Queued Facebook Source Text With Operator Browser Automation

As an operator,
I want a Playwright-based operations tool to capture readable text from queued Facebook URLs,
So that Facebook sources can enter the existing AI extraction workflow without manual copy/paste for every post.

**Acceptance Criteria:**

**Given** Facebook sources exist with `kind=facebook` and no readable raw text
**When** the operator runs the capture tool with a limit or source ID
**Then** the tool lists or selects only queued Facebook sources that still need raw text
**And** it does not process non-Facebook sources or sources that already have raw text unless an explicit safe override is later approved.

**Given** the capture tool opens a Facebook URL
**When** the operator's persistent browser profile has access to the post
**Then** the tool extracts visible post text and safe metadata such as capture method, captured timestamp, source URL, final URL, author text when visible, and timestamp text when visible
**And** it does not persist cookies, access tokens, local storage, passwords, full HTML dumps, hidden page data, or browser profile data.

**Given** visible text is extracted
**When** the tool prepares to write to PostgreSQL
**Then** it can save the captured text without an interactive confirmation because Admin UI review is the required confirmation gate before extraction
**And** it still supports an explicit preview/confirm or dry-run mode for debugging selector changes before writing.

**Given** the operator confirms the captured text
**When** the update is saved
**Then** the existing `raw_source_material` row is updated with the captured raw text and safe `rawMetadata`
**And** the linked `sources` row remains Facebook/community/unverified with `official=false` and `partner=false` unless separately changed by an approved operator workflow.

**Given** the Facebook URL is inaccessible, blocked, expired, requires permissions the operator does not have, or selectors fail
**When** capture runs
**Then** the tool records or displays a non-sensitive failure reason
**And** no raw text is fabricated or written.

**Given** captured raw text exists for the source
**When** the operator returns to the admin knowledge workflow
**Then** the captured source appears in a Facebook capture review queue before AI extraction
**And** no draft is extracted, approved, or made retrievable without an authenticated admin/operator action.

**Given** capture writes to source material
**When** audit support is available from the operations context
**Then** an audit event records source ID, operation identity or actor, capture method, timestamp, and before/after raw-text presence without storing captured post text in the audit summary.

### Story 4.1B: Create Facebook Capture Review State

As an operator,
I want captured Facebook source material to have explicit review workflow state,
So that admin review, extraction, approval, rejection, and retry behavior are consistent.

**Acceptance Criteria:**

**Given** a Facebook source has captured raw text
**When** capture review state is created
**Then** the system stores a `facebook_capture_reviews` row linked to the source and raw source material
**And** the initial status is `needs_review`.

**Given** Facebook capture review state exists
**When** the system queries reviewable captures
**Then** it can filter by status: `needs_review`, `rejected`, `extracted`, `extracted_approved`, or `extraction_failed`
**And** review queue filtering does not depend on parsing `raw_source_material.rawMetadata` JSON.

**Given** capture review state changes
**When** an admin/operator extracts, approves all, rejects, or encounters extraction failure
**Then** the review row records the current status, reviewer user ID when applicable, review timestamp when applicable, safe rejection reason or extraction error when applicable, and updated timestamp
**And** raw captured text remains in `raw_source_material` as operator-only material.

**Given** a Facebook source has already been extracted through the AI extraction workflow
**When** review state is displayed or updated
**Then** duplicate extraction is blocked
**And** the UI can link to existing draft or approved cards instead of creating another extraction set.

**Given** the review table is added
**When** migrations run
**Then** database constraints preserve one active review state per captured Facebook source
**And** non-Facebook sources are not accidentally added to the Facebook capture review queue.

### Story 4.1C: Review Captured Facebook Sources In Admin Queue

As an operator,
I want to see captured Facebook source material in an admin review queue,
So that I can inspect captured content before using AI extraction.

**Acceptance Criteria:**

**Given** one or more Facebook captures have `needs_review` status
**When** an admin opens the Facebook capture review queue
**Then** they see captured sources with source label, source URL, final URL when available, captured timestamp, safe author/timestamp metadata when available, and review status
**And** raw captured post text is visible only inside authenticated admin/operator routes.

**Given** a captured source is already extracted, extracted-and-approved, rejected, or failed
**When** the queue is displayed
**Then** actionable review queues show only sources that still need operator action
**And** non-actionable statuses remain accessible through filters or status links where useful.

**Given** an admin opens a capture detail page
**When** the page loads
**Then** it shows the captured raw text, source metadata, capture metadata, trust defaults, existing extraction status, and available actions
**And** it never displays cookies, local storage, full HTML dumps, hidden page data, provider payloads, or browser profile data.

**Given** a normal traveler or unauthenticated user requests the Facebook capture review pages
**When** authorization runs
**Then** access is denied before raw source material is read
**And** no raw captured Facebook text is exposed.

**Given** a Facebook source remains community/unverified
**When** the review UI displays it
**Then** the UI clearly labels the content as Facebook/community-derived and not official by default
**And** copy does not imply captured content is verified or traveler-ready.

### Story 4.1D: Extract Draft Knowledge From Reviewed Facebook Capture

As an operator,
I want to click `Extract` from a reviewed Facebook capture,
So that AI creates draft cards without me copying source IDs manually.

**Acceptance Criteria:**

**Given** an admin is viewing a captured Facebook source with readable raw text and `needs_review` status
**When** they click `Extract`
**Then** the existing AI extraction workflow creates one or more draft knowledge cards linked to that source
**And** the generated cards remain `draft` and `needsReview=true`.

**Given** extraction succeeds
**When** the action completes
**Then** the capture review status becomes `extracted`
**And** the admin is shown links to the generated draft cards or the draft review queue.

**Given** extraction fails because no capable model is active, provider output is invalid, or the provider call fails
**When** the action completes
**Then** the review status becomes `extraction_failed`
**And** a safe, non-provider-payload error is shown to the admin.

**Given** the source was already extracted
**When** an admin attempts extraction again
**Then** the action is blocked before any provider call
**And** the admin sees links to existing linked cards where available.

**Given** AI extraction creates cards from Facebook/community content
**When** drafts are saved
**Then** confidence and source trust defaults remain community or unverified unless separately changed under an approved operator workflow
**And** no draft is approved or made retrievable by the `Extract` action.

### Story 4.1E: Extract And Approve All Captured Facebook Drafts With Guardrails

As an operator,
I want an `Extract & Approve All` action for trusted reviewed captures,
So that low-risk captured source material can move faster into approved knowledge while preserving safeguards.

**Acceptance Criteria:**

**Given** an admin is viewing a captured Facebook source with readable raw text and `needs_review` status
**When** they select `Extract & Approve All`
**Then** the UI requires explicit confirmation that they reviewed the captured text, source trust, confidence, and freshness before proceeding
**And** the action is available to authenticated admin and operator roles, but cannot run without confirmation.

**Given** confirmation is provided
**When** extraction produces valid draft cards
**Then** the system approves all generated cards in the same operator-initiated workflow
**And** the capture review status becomes `extracted_approved`.

**Given** extraction produces zero valid drafts or invalid output
**When** `Extract & Approve All` runs
**Then** no cards are approved
**And** the review status becomes `extraction_failed` with a safe error.

**Given** generated cards come from a Facebook/community source
**When** they are approved through this action
**Then** they remain community or unverified unless source metadata already identifies an official/provider-backed source
**And** traveler answers cannot present them as guaranteed or official facts.

**Given** an approved card includes freshness-sensitive facts such as price, schedule, availability, road condition, opening hours, weather, service status, or promotions
**When** approve-all runs
**Then** freshness-sensitive flags from extraction are preserved
**And** cards remain eligible for later freshness warnings in retrieval/provenance flows.

**Given** any card approval fails during the action
**When** the workflow completes
**Then** the system does not leave a partially approved set without a safe status and audit trail
**And** the admin can see whether retry or manual review is required.

### Story 4.1F: Reject Captured Facebook Source Material

As an operator,
I want to reject captured Facebook source material,
So that unusable, private, irrelevant, or low-quality captures do not continue through extraction.

**Acceptance Criteria:**

**Given** an admin is viewing a captured Facebook source with `needs_review` or `extraction_failed` status
**When** they click `Reject Capture`
**Then** the system requires or accepts a safe rejection reason
**And** the review status becomes `rejected`.

**Given** a capture is rejected
**When** the actionable review queue is displayed
**Then** the rejected capture no longer appears as needing action
**And** it remains available to admins through status filtering or audit trail where appropriate.

**Given** a rejected capture has raw source material
**When** rejection is saved
**Then** raw captured text remains operator-only and is not exposed to travelers
**And** no knowledge draft or approved card is created by the rejection action.

**Given** a capture was rejected because the capture script selected wrong or incomplete text
**When** the operator wants to update the script and rerun capture
**Then** the UI provides an explicit audited reopen-for-recapture action
**And** the source can return to a recapture-ready state without losing source provenance or prior audit history.

**Given** a rejected capture is reopened for recapture
**When** the capture tool is rerun successfully for the same source
**Then** the new captured raw text replaces the prior rejected raw text only through the controlled capture workflow
**And** the review status returns to `needs_review` for operator inspection before extraction.

**Given** rejection is audited
**When** the audit event is recorded
**Then** it includes source ID, actor, operation, status transition, timestamp, and safe rejection reason
**And** it does not include the full captured post text.

### Story 4.1G: Integrate Facebook Capture Review Into Admin Knowledge Workflow

As an operator,
I want the admin knowledge area to route me from Facebook capture to review, extraction, drafts, and approved cards,
So that I do not need to remember source IDs or CLI-only next steps.

**Acceptance Criteria:**

**Given** an admin opens the knowledge admin area
**When** Facebook captures exist that need review
**Then** navigation or dashboard copy exposes a clear entry point to the Facebook capture review queue
**And** the operator can reach review without manually copying a source ID.

**Given** an operator submits or queues a Facebook source in intake
**When** the source is saved or shown in intake status
**Then** the UI explains that Playwright capture must run before review if raw text is missing
**And** it links to the review queue once captured text exists.

**Given** `Extract` succeeds from a capture detail page
**When** the result is shown
**Then** the admin sees next-step links to generated draft cards or the draft queue
**And** already-extracted captures show status and links instead of active duplicate extraction buttons.

**Given** `Extract & Approve All` succeeds
**When** the result is shown
**Then** the admin sees links to approved cards or the approved knowledge list
**And** the UI confirms that Facebook/community confidence guardrails were preserved.

**Given** a capture is rejected
**When** the admin returns to the workflow
**Then** rejected captures are absent from the default actionable queue
**And** status filters or safe messages make it clear why the item no longer appears.

**Given** the admin UI displays Facebook capture workflow states
**When** statuses, buttons, or empty states are shown
**Then** copy uses Vietnamese-first operator-facing language consistent with existing admin knowledge pages
**And** it does not imply Facebook content is official, verified, or traveler-visible before approval.

### Story 4.2: AI Extracts Knowledge Drafts From Source

As an operator,
I want AI to extract useful travel knowledge from a submitted source,
So that I do not need to manually rewrite every post or review.

**Acceptance Criteria:**

**Given** an operator has submitted a readable source
**When** AI extraction runs
**Then** AI proposes one or more knowledge drafts from the source
**And** every draft remains unapproved until human review.

**Given** a source describes one place review
**When** AI extraction runs
**Then** the draft can capture place name, location/route segment, summary, practical tips, warnings, costs, parking, kid-friendliness, and source reference when present.

**Given** a source describes one person's completed trip
**When** AI extraction runs
**Then** the drafts can capture trip plan, route segments, places visited, activities, timing, lodging areas, food stops, lessons learned, warnings, and source reference when present.

**Given** extraction returns uncertain or incomplete facts
**When** drafts are created
**Then** those facts are marked as unverified or needing operator review
**And** AI does not approve them automatically.

**Given** the submitted source includes an image or screenshot
**When** AI extraction runs
**Then** the system uses a Gateway model configured for image input and extraction purpose
**And** extraction fails safely if no active capable model is configured.

### Story 4.3: Review And Edit AI-Prepared Drafts

As an operator,
I want to review and edit AI-prepared drafts,
So that only useful and understandable knowledge enters XuyenViet.

**Acceptance Criteria:**

**Given** AI has prepared knowledge drafts
**When** the operator opens the review screen
**Then** they can see each draft with title, type, route/location, summary, tags, source, confidence label, and freshness-sensitive flag
**And** the review UI is a structured admin workflow separate from traveler chat.

**Given** a draft contains wrong, duplicated, or low-value information
**When** the operator reviews it
**Then** they can edit it, reject it, or keep it as draft
**And** rejected drafts are not retrievable.

**Given** operators edit draft/card fields
**When** the edit form is displayed
**Then** operators use structured fields rather than editing raw AI prose in-place without field structure
**And** approval remains a distinct action that cannot happen accidentally.

**Given** a draft includes changing information such as price, schedule, opening hours, availability, road condition, or service status
**When** the operator reviews it
**Then** they can mark it freshness-sensitive
**And** the source date remains visible.

### Story 4.4: AI Suggests Create Or Update From Source URL

As an operator,
I want to provide a source URL and let AI decide whether it should create new knowledge cards or update existing ones,
So that seed data and ongoing knowledge updates are faster to maintain.

**Acceptance Criteria:**

**Given** an operator submits a source URL
**When** AI reads and analyzes the source
**Then** the system compares extracted facts against existing draft and approved knowledge cards
**And** AI proposes one or more actions: create new card, update existing card, mark possible duplicate, or no useful knowledge found.

**Given** AI finds information about a place, route segment, service, warning, cost, activity, hotel area, parking, EV charging, kid-friendly tip, promotion, or general travel tip not already covered
**When** drafts are prepared
**Then** AI proposes new card drafts linked to the submitted source
**And** the drafts require operator approval before retrieval.

**Given** AI finds newer or richer information about an existing card
**When** drafts are prepared
**Then** AI proposes an update to the existing card with a before/after summary
**And** the current approved card is not changed until the operator approves the update.

**Given** AI finds conflicting information against an existing card
**When** drafts are prepared
**Then** AI flags the conflict for operator review
**And** it preserves both the existing source and the new source for comparison.

**Given** AI finds duplicate or low-value content
**When** drafts are prepared
**Then** the system can mark the source as duplicate, rejected, or no-action
**And** no traveler-facing knowledge changes are made.

**Given** a source URL cannot be read or extraction fails
**When** intake runs
**Then** the operator sees a recoverable error
**And** no existing card is modified.

### Story 4.5: Batch Seed Source URL Intake

As an operator,
I want to submit a list of seed source URLs,
So that AI can prepare an initial knowledge base from curated source lists.

**Acceptance Criteria:**

**Given** an operator submits a list of source URLs
**When** batch intake starts
**Then** each URL is tracked as a separate intake item with status: pending, reading, extracted, needs review, approved, failed, duplicate, or rejected.

**Given** batch extraction runs
**When** AI processes each URL
**Then** it proposes create/update/no-action decisions for each source
**And** all proposed card changes remain unapproved until operator review.

**Given** some URLs fail
**When** batch intake completes
**Then** successful URLs still produce reviewable drafts
**And** failed URLs show error reasons without blocking the whole batch.

**Given** batch intake creates many drafts
**When** the operator opens the review queue
**Then** drafts can be filtered by source, card type, route/location, create/update/conflict status, and extraction status.

### Story 4.6: Approve Knowledge For Retrieval

As an operator,
I want to approve reviewed knowledge drafts,
So that traveler answers can use them.

**Acceptance Criteria:**

**Given** a draft has enough useful information and source provenance
**When** the operator approves it
**Then** it becomes an approved knowledge card
**And** it becomes eligible for traveler-answer retrieval.

**Given** a draft is still unreviewed or rejected
**When** traveler retrieval runs
**Then** it is not used in traveler answers.

**Given** an approved card later becomes outdated or unsuitable
**When** the operator archives it
**Then** it is no longer eligible for traveler retrieval
**And** previous source/provenance remains available to operators.

### Story 4.7: Preserve Source And Confidence In Approved Knowledge

As an operator,
I want approved knowledge to keep its source and confidence,
So that AI answers can explain where information came from.

**Acceptance Criteria:**

**Given** a knowledge card is approved
**When** it is saved
**Then** it links to at least one normalized source record through card-source linkage
**And** traveler-facing source metadata comes from linked source rows rather than free-text card fields.

**Given** a linked source has metadata available
**When** the approved card is saved or rendered later
**Then** source type, URL or source label, publisher when available, collected or checked date when available, verification status, displayed confidence label, and freshness-sensitive flag remain available for provenance and source display.

**Given** the source is community/Facebook-derived
**When** the card is approved
**Then** the card remains community or unverified unless the operator marks it as official/provider-backed
**And** traveler answers cannot present it as guaranteed fact.

**Given** the approved card is later used in an answer
**When** provenance is rendered in Epic 5
**Then** the answer can show source label/title, URL when available, date when available, confidence label, and freshness warning when applicable.

### Story 4.8: Make Approved Knowledge Searchable By AI

As an operator,
I want approved knowledge to become searchable by the assistant,
So that submitted sources improve future traveler answers.

**Acceptance Criteria:**

**Given** a knowledge draft is approved
**When** it has retrievable text
**Then** the system creates or queues retrieval indexing/embedding for that approved item
**And** only approved items are available to normal traveler retrieval.

**Given** an approved item is edited
**When** retrievable text changes
**Then** the search/index representation is updated
**And** stale text is not treated as current truth.

**Given** an approved item is archived
**When** retrieval runs
**Then** that item is excluded from traveler answers.

### Story 4.9: Track 100 Approved Corridor Items

As an operator,
I want to track progress toward 100 approved Hanoi-to-HCMC knowledge items,
So that the public MVP has enough curated examples before evaluation.

**Acceptance Criteria:**

**Given** approved knowledge items exist
**When** the operator views seed progress
**Then** the admin area shows the count of approved Hanoi-to-HCMC corridor items
**And** draft, rejected, or archived items do not count.

**Given** approved items have type and route/location fields
**When** progress is displayed
**Then** the operator can see distribution by type and route/location
**And** obvious coverage gaps are visible.

**Given** fewer than 100 approved corridor items exist
**When** public MVP readiness is checked
**Then** the system reports the seed set as incomplete
**And** it shows how many more approved items are needed.

### Story 4.10: Capture YouTube Video Sources For Knowledge Extraction

As an operator,
I want to capture usable public text from a submitted YouTube video,
So that the existing AI extraction and human-approval workflow can prepare travel knowledge cards from the video.

**Acceptance Criteria:**

**Given** an operator submits a canonical YouTube video URL, including `youtube.com/watch`, `youtu.be`, `youtube.com/shorts`, or `youtube.com/live`
**When** the source is saved
**Then** it is classified as a queued YouTube video source with normalized safe URL metadata
**And** it remains unverified and is not AI-readable until the capture step stores usable operator-only raw text.

**Given** a queued public YouTube video has an available permitted transcript or captions
**When** the operator-run YouTube capture adapter runs
**Then** it stores a bounded transcript or captions as `raw_source_material.raw_text` together with safe metadata such as canonical video URL, title, channel name, published date when available, capture timestamp, and capture method
**And** it does not persist account credentials, cookies, OAuth tokens, full page HTML, hidden provider payloads, or video/audio binary content.

**Given** a queued YouTube video lacks a usable transcript or captions, is private, is age/region restricted, is unavailable, or cannot be read through the approved adapter
**When** capture runs
**Then** the source remains unextracted and the operator receives a safe failure reason such as `no_transcript_available`
**And** no raw text, knowledge draft, or knowledge card is fabricated.

**Given** capture stores usable YouTube video text
**When** the operator invokes the existing knowledge extraction workflow
**Then** the system can create draft, review-needed knowledge cards linked to the YouTube source
**And** the existing human review and approval lifecycle remains required before retrieval.

**Given** extracted video content includes changing travel facts such as price, schedules, road conditions, opening hours, service availability, or promotions
**When** drafts are prepared
**Then** those facts remain unverified by default and can be marked freshness-sensitive
**And** traveler-facing provenance retains the video URL, channel/title metadata when safe, and capture or publication date when available without exposing the transcript.

**Given** an operator submits a YouTube channel URL, including `/@handle`, `/channel/<id>`, `/c/<name>`, or `/user/<name>`
**When** intake or capture evaluates the source
**Then** it is identified as a channel, not as a video
**And** the system does not automatically enumerate, scrape, or capture the channel's videos in this story.

**Given** a submitted YouTube URL is ambiguous, malformed, or resolves from a short URL to a channel rather than a video
**When** the capture adapter resolves it
**Then** it records a safe `youtube_channel_not_supported` or validation outcome
**And** the operator can submit a specific video URL or use a future explicit channel-ingestion workflow.

**Given** YouTube capture writes source material or changes capture state
**When** the mutation succeeds or fails
**Then** the operation is auditable with actor, source ID, capture method, timestamp, and safe outcome summary
**And** no raw transcript text, provider payload, or credential data appears in audit summaries.

_Dependencies: Story 4.1 source/raw boundary, Story 4.2 draft extraction, Story 4.3 review/edit, Story 4.6 approval, and Story 4.7 provenance. Requires a product/legal and technical decision on the permitted YouTube metadata/transcript provider before implementation._

## Epic 5: Grounded Retrieval, Web Search, Provenance, And Usage

Traveler answers use the required context priority pipeline: selected trip project context, current chat session context, approved knowledge, web search fallback, and general reasoning, with stored provenance, source/confidence display, uncertainty handling, freshness warnings, AI Gateway model management, pricing metadata, and AI usage event recording.

### Story 5.0: Manage AI Gateway Models And Pricing

As a product owner/operator,
I want XuyenViet to manage callable AI Gateway models and pricing metadata,
So that AI orchestration can select capable models and estimate usage cost consistently.

**Acceptance Criteria:**

**Given** the app has AI Gateway access configured
**When** model records are seeded or managed
**Then** each active model has gateway model name, display label, intended purposes, capability flags, active status, pricing currency, input unit price, output unit price, cache pricing fields when supported, pricing unit, and effective timestamp or version.

**Given** AI orchestration prepares a model call
**When** it selects a model for chat, extraction, embeddings, evaluation, or image input
**Then** selection is constrained by configured purpose and capability flags
**And** direct hard-coded model strings are not scattered across feature code.

**Given** provider usage metadata is available
**When** a usage event is recorded
**Then** the Usage module can estimate cost from the selected model pricing record
**And** records missing pricing safely when a model has no configured price.

**Given** future billing is not part of MVP
**When** model pricing exists
**Then** the system does not show balances, charge users, enforce credits, or create payment obligations.

### Story 5.1: Retrieve Approved Knowledge For AI Ask

As an authenticated traveler,
I want AI Ask to use approved XuyenViet knowledge,
So that answers include curated travel information instead of only generic AI reasoning.

**Acceptance Criteria:**

**Given** approved knowledge cards exist with searchable/indexed text
**When** a user asks a relevant road-trip question
**Then** retrieval returns matching approved cards
**And** draft, rejected, or archived cards are excluded.

**Given** retrieved cards include source and confidence metadata
**When** the source bundle is assembled
**Then** the assistant receives card IDs, summaries, source labels/URLs when available, confidence labels, freshness flags, and retrieval scores.

**Given** no approved card is relevant
**When** retrieval completes
**Then** the retrieval result explicitly records zero relevant approved cards
**And** downstream logic can consider web search fallback.

### Story 5.2: Assemble Context Priority Source Bundle

As an authenticated traveler,
I want the assistant to use my trip/chat context before external information,
So that answers stay relevant to what I am planning.

**Acceptance Criteria:**

**Given** a user asks inside a selected trip project
**When** source context is assembled
**Then** selected trip project context is considered before current chat context
**And** both are considered before approved knowledge and web search.

**Given** a user asks inside a normal chat session without selected trip project
**When** source context is assembled
**Then** current chat-session context is considered before approved knowledge and web search
**And** unrelated sessions/projects are not included by default.

**Given** context, knowledge, and web sources are available
**When** the source bundle is created
**Then** the bundle preserves source category labels: chat/trip context, XuyenViet knowledge, web search, or general reasoning.

### Story 5.3: Web Search Fallback Trigger

As a traveler,
I want the assistant to search the web when curated knowledge is insufficient,
So that answers can still be useful while XuyenViet's knowledge base is growing.

**Acceptance Criteria:**

**Given** no relevant approved cards are retrieved
**When** the user asks a planning question
**Then** web search fallback is triggered.

**Given** fewer than three relevant approved cards are retrieved for a broad planning question
**When** the answer needs more coverage
**Then** web search fallback is triggered.

**Given** the user asks about freshness-sensitive facts such as price, schedule, opening hours, road condition, weather, availability, or service status
**When** the answer is prepared
**Then** web search fallback is triggered or the assistant clearly says it cannot verify current details.

**Given** approved cards conflict with each other or look stale
**When** the answer is prepared
**Then** web search fallback is triggered to help verify or contextualize the conflict.

### Story 5.4: Web Search Adapter And Source Capture

As a traveler,
I want web fallback results to include source details,
So that external information is not presented as unsupported fact.

**Acceptance Criteria:**

**Given** web search fallback is triggered
**When** the search adapter runs
**Then** it returns title, URL, snippet/content, provider score, checked date/time, and source type when available
**And** results are stored as web search result records.

**Given** the search adapter returns official/provider and reposted/community results
**When** results are ranked or filtered
**Then** official/provider pages are preferred where possible
**And** reposted or unattributed sources are not treated as official.

**Given** the provider fails or returns low-quality results
**When** the assistant prepares an answer
**Then** the system records the failure/low-confidence state
**And** the assistant does not invent current facts.

### Story 5.5: Persist Retrieval Decision And Answer Provenance

As an operator/admin,
I want each assistant answer to keep a retrieval and provenance record,
So that answers can be audited and improved.

**Acceptance Criteria:**

**Given** an assistant answer is generated
**When** retrieval/search/context assembly completes
**Then** the system persists a retrieval decision with candidate counts, selected counts, thresholds, freshness flag, conflict flag, web-search trigger flag, web-search reason, and general-reasoning-used flag.

**Given** an assistant answer uses chat/trip context, approved knowledge, web results, or general reasoning
**When** the assistant message is saved
**Then** provenance rows are stored for each source item where applicable
**And** the assistant message and provenance are persisted in the same transaction.

**Given** a source was included in the prompt but not cited in the answer
**When** provenance is saved
**Then** the record can distinguish `used_in_prompt` from `cited_in_answer`.

### Story 5.6: Render Source And Confidence Section

As a traveler,
I want answers to show source and confidence details,
So that I know what to trust and what to verify.

**Acceptance Criteria:**

**Given** an answer uses approved knowledge or web search
**When** the answer is displayed
**Then** it includes a compact `Nguon va do tin cay` section
**And** the section is rendered from stored provenance records, not by parsing answer text.

**Given** source metadata is available
**When** the source section is displayed
**Then** it shows source label/title, source type, URL when available, collected/checked date when available, confidence label, and freshness warning when applicable.

**Given** a traveler opens source detail from an answer source chip or contextual detail panel
**When** the detail is displayed
**Then** it uses stored provenance and traveler-safe source snapshots to show source title/label, type, URL when available, collected/checked date, confidence, and freshness warning
**And** it never exposes raw source material, copied post bodies, operator-only notes, or provider payloads.

**Given** an answer uses general reasoning without supporting source
**When** the source section is displayed
**Then** the answer clearly distinguishes that content from sourced knowledge
**And** it avoids fake citations.

**Given** source/confidence UI is rendered in the answer or right detail panel
**When** confidence categories are shown
**Then** labels are visible alongside any color treatment
**And** source/confidence claims are not derived by parsing answer prose.

### Story 5.7: Uncertainty And Freshness Warnings

As a traveler,
I want the assistant to warn me when details may be outdated or unverified,
So that I do not rely blindly on changing travel information.

**Acceptance Criteria:**

**Given** an answer includes price, schedule, availability, road condition, opening hours, weather, service status, or promotion details
**When** those details come from freshness-sensitive cards or web search
**Then** the answer warns the user to verify before acting or booking.

**Given** information comes from web search
**When** it appears in an answer
**Then** it is labeled external/unverified unless it has been approved into knowledge cards.

**Given** Facebook-derived or community content is used
**When** it appears in an answer
**Then** it is not presented as official unless source metadata identifies an official/provider page.

### Story 5.8: Validate Web Search Fallback Quality

As a product team,
I want to validate web search fallback quality across candidate providers or mechanisms,
So that XuyenViet does not depend on a weak source for freshness-sensitive travel answers.

**Acceptance Criteria:**

**Given** web search fallback is required for the MVP
**When** validation runs against Vietnamese corridor queries
**Then** the team tests one or more candidate providers or mechanisms
**And** the validation records whether results include usable Vietnamese sources, titles, URLs, snippets/content, dates when available, and relevance scores or ranking signals.

**Given** queries need official/provider-source preference
**When** validation runs
**Then** the validation records whether each candidate can prefer official/provider sources through query construction, country/language bias, include/exclude domains, ranking, or post-filtering
**And** reposted or unattributed sources are not treated as official.

**Given** provider limits, cost, or failures occur
**When** validation completes
**Then** the validation documents rate limits, pricing concerns, failure behavior, fallback behavior, and operational risks
**And** it recommends the MVP provider or fallback approach.

**Given** the chosen provider may change later
**When** implementation begins
**Then** web search remains behind a provider adapter
**And** answer grounding, source display, and unverified labels do not depend on a specific provider.

### Story 5.9: Record AI Usage Events

As a product owner,
I want authenticated AI requests to create usage records,
So that future credit pricing and cost controls can be designed from real usage data.

**Acceptance Criteria:**

**Given** earlier AI Ask stories may have recorded minimal usage events or placeholders
**When** full usage tracking is implemented
**Then** the Usage module standardizes provider usage capture across AI generation, extraction, embedding, evaluation, and search/provider calls where applicable
**And** existing minimal events remain compatible with the final `ai_usage_events` schema or migration path.

**Given** an authenticated user submits an AI Ask request
**When** the AI orchestration pipeline calls model, embedding, extraction, evaluation, or search providers where applicable
**Then** the system records AI usage events with user ID, conversation/message context when applicable, purpose, provider, model, timestamp, latency, success/failure status, and available provider usage metadata
**And** the usage record does not duplicate raw prompt or answer content beyond existing message/provenance storage.

**Given** provider usage metadata is unavailable
**When** the request completes
**Then** the usage event is still recorded with available metadata
**And** missing usage fields are represented safely without blocking the user answer.

**Given** a usage event has provider token metadata and a selected model pricing record
**When** the event is persisted
**Then** the Usage module records estimated input, output, cache, and total cost fields where calculable
**And** references the model/pricing record or version used for the calculation.

**Given** provider cache token metadata is unavailable or the selected model has no cache pricing
**When** cost is estimated
**Then** missing cache cost is represented safely
**And** it does not block the user answer.

**Given** future credit billing is not part of MVP
**When** usage events are stored
**Then** the system does not decrement credit, show balance, block requests for insufficient credit, calculate rewards, or create payment obligations.

## Epic 6: Family-Aware Planning And Public MVP Quality Loop

When children are part of a trip, answers adapt planning advice for family needs, and public MVP feedback/evaluation measures whether answers are useful, grounded, and better than generic ChatGPT.

### Story 6.1: Detect Children And Family Travel Needs

As an authenticated traveler,
I want the assistant to recognize when children are part of my trip,
So that planning advice can adapt to family needs.

**Acceptance Criteria:**

**Given** a user mentions children, child ages, family members, or family constraints in chat or trip context
**When** the assistant prepares an answer
**Then** the system identifies family-aware planning needs
**And** those needs can influence the answer.

**Given** child age or family details are unclear
**When** the answer depends on those details
**Then** the assistant asks concise clarification questions
**And** still gives useful general family-aware guidance.

**Given** no child or family context exists
**When** the assistant answers
**Then** it does not force irrelevant family recommendations.

### Story 6.2: Family-Aware Driving And Stop Recommendations

As a family traveler,
I want route guidance to account for child comfort,
So that the plan is realistic for a family road trip.

**Acceptance Criteria:**

**Given** children are part of the trip
**When** the assistant suggests route pacing
**Then** it considers shorter driving blocks, rest stops, bathroom/food breaks, and backup options
**And** it avoids unrealistic all-day driving advice for families.

**Given** a route segment may be long, tiring, or risky
**When** the assistant answers
**Then** it includes family-relevant warnings or pacing suggestions
**And** it suggests practical next steps when possible.

**Given** approved knowledge or web results include rest stops, parking, hotel convenience, food stops, or services
**When** the assistant uses them
**Then** family-relevant options are prioritized where appropriate.

### Story 6.3: Family-Aware Activities And Suitability Notes

As a family traveler,
I want the assistant to identify child-friendly or unsuitable activities,
So that the itinerary balances parent goals and child comfort.

**Acceptance Criteria:**

**Given** children are part of the trip
**When** the assistant suggests places or activities
**Then** it highlights child-friendly options when known
**And** it identifies places or activities that may be unsuitable, boring, difficult, or tiring for children when relevant.

**Given** source data includes child discounts or family-relevant details
**When** the assistant answers
**Then** it includes those details with source/confidence handling
**And** it warns users to verify changing price/promotion details.

**Given** parent goals conflict with child comfort
**When** the assistant proposes an itinerary
**Then** it balances both by suggesting alternatives, shorter visits, rest time, or backup activities.

### Story 6.4: Capture Answer Usefulness Feedback

As a product team,
I want users to rate answer usefulness,
So that we can measure whether XuyenViet is helping public MVP users.

**Acceptance Criteria:**

**Given** an assistant answer is displayed
**When** the user provides a usefulness rating
**Then** the rating is stored and linked to the assistant response
**And** the user can optionally leave short feedback text.

**Given** an assistant answer is displayed
**When** the usefulness rating control is available
**Then** the feedback action is lightweight and optional
**And** it never blocks reading the answer, continuing chat, opening sources, or using the detail panel.

**Given** a user has already rated an answer
**When** they change their rating
**Then** the stored feedback is updated or versioned consistently
**And** duplicate feedback does not corrupt quality reporting.

**Given** feedback is stored
**When** operators/admins review quality signals
**Then** they can see usefulness ratings linked to answer provenance and retrieval decisions.

### Story 6.5: Run Public MVP Answer Evaluation Prompt Set

As a product team,
I want to run a standard evaluation prompt set,
So that we can compare answer quality across product changes.

**Acceptance Criteria:**

**Given** the five public-MVP evaluation prompts are configured
**When** an evaluation run starts
**Then** the system runs the magic-moment family trip prompt, sparse-data prompt, freshness-sensitive prompt, service/activity prompt, and route logistics prompt
**And** each output is stored with prompt version, model version, and run metadata.

**Given** evaluation outputs are generated
**When** scoring runs
**Then** each answer can be scored across user-context use, practical specificity, source grounding, uncertainty handling, family-awareness, and Vietnamese clarity
**And** scores use the 1-10 rubric from the PRD.

**Given** evaluation detects unsupported claims, missing uncertainty labels, or generic-ChatGPT-level answers
**When** results are stored
**Then** those counter-metrics are flagged for review.

### Story 6.6: Public MVP Quality Dashboard

As an operator/admin,
I want to see public MVP answer quality signals,
So that I know whether the product is ready to improve or expand.

**Acceptance Criteria:**

**Given** user feedback and evaluation runs exist
**When** an admin opens the quality dashboard
**Then** they can see usefulness ratings, evaluation scores, and counter-metric flags
**And** results are filterable by prompt type or time range.

**Given** provenance and retrieval decisions exist for evaluated answers
**When** quality results are reviewed
**Then** the admin can inspect whether answers used chat/trip context, approved knowledge, web search, or general reasoning
**And** low-quality answers can be traced to likely retrieval/source issues.

**Given** public MVP success criteria are checked
**When** the dashboard calculates readiness
**Then** it can report progress against the PRD thresholds
**And** it identifies missing signals instead of claiming success without enough data.

## Epic 7: Traveler Workspace UX Convergence

Travelers can enter and use a calm, trustworthy, responsive AI planning workspace: a focused public entry, a centered logged-in empty state, and an active white/stone conversation workspace with history/projects, compact icon-first composition, readable answers, and a contextual inspector. The shell preserves existing authenticated ownership, URL selection, streaming, provenance, and deletion behavior while making those capabilities understandable across desktop and mobile.

### Story 7.1: Establish the Traveler UI Foundation

As a traveler,
I want XuyenViet to present a consistent, readable visual foundation,
So that every public and authenticated planning surface feels like one trustworthy product.

**Acceptance Criteria:**

**Given** the application root renders a public or authenticated route
**When** global UI styling is applied
**Then** `src/app/layout.tsx` loads Inter and sets Vietnamese document language
**And** `src/app/globals.css` owns semantic white/stone/green/amber/teal/source CSS tokens, base surfaces, visible focus treatment, and reduced-motion behavior.

**Given** a feature needs reusable presentational UI
**When** it uses shared primitives
**Then** those data-free primitives are placed under `src/components/ui`
**And** they do not import feature modules, database access, server actions, or route state.

**Given** a migrated traveler shell surface needs an icon
**When** it renders a product icon
**Then** it imports a named typed SVG icon from one local `src/components/ui` icon boundary
**And** the migrated surface does not mix feature-local SVG paths, emoji, text glyphs, or another icon library.

**Given** an icon-only control is rendered
**When** a keyboard or touch user reaches it
**Then** it has an accessible name, visible focus state, hover/focus tooltip, and a 44px minimum mobile target
**And** destructive decisions continue to use explicit text confirmation.

**Given** text is rendered at common mobile widths or 200% zoom
**When** it contains Vietnamese diacritics
**Then** it remains readable without clipped controls or color-only status meaning
**And** non-essential reveal, sheet, and toast motion respects reduced-motion preference.

### Story 7.2: Deliver the Focused Public Entry

As a public traveler,
I want a clear, calm landing experience before I sign in,
So that I understand XuyenViet and can begin my planning journey without seeing private workspace controls.

**Acceptance Criteria:**

**Given** a visitor is not authenticated
**When** they open `/`
**Then** they see a centered Vietnamese-first public hero with restrained warm paper treatment, XuyenViet brand mark, Google sign-in CTA, icon-led starter prompts, a compact sign-in-gated ask box, and a non-interactive compact detail-inspector preview
**And** the route does not render authenticated sidebar data, conversation history, trip projects, account controls, or admin navigation.

**Given** a public visitor interacts with the ask box
**When** they submit an ask or choose a starter prompt
**Then** the product directs them to the existing sign-in flow before any conversation, retrieval, usage event, persistence, or provider call is created
**And** valid referral attribution continues through the flow silently without rewards, credits, rankings, payouts, or points UI.

**Given** a visitor uses keyboard navigation or a small screen
**When** they move through the public entry
**Then** CTA, composer controls, and starter prompts are reachable with visible focus and readable Vietnamese copy
**And** the layout remains centered and usable without an authenticated sidebar.

### Story 7.3: Deliver the Authenticated Desktop Shell

As an authenticated traveler,
I want a familiar desktop workspace for starting, revisiting, and scoping my planning chats,
So that I can understand my current conversation and trip context without navigating a cluttered interface.

**Acceptance Criteria:**

**Given** an authenticated user opens `/ai-ask` without an active answer
**When** the server-loaded shell renders
**Then** it shows a flat pale-stone sidebar with brand, `Trò chuyện mới`, grouped user-owned conversations, grouped user-owned trip projects, account/privacy access, and server-authorized admin entry only
**And** the main area shows the centered Vietnamese greeting, centered composer, and four icon-led starter cards without a blank detail inspector.

**Given** an authenticated user has an active conversation
**When** the workspace renders on desktop
**Then** it is an edge-to-edge viewport-height shell with a 276px sidebar, central answer reading width capped near 760px, and no floating rounded application card
**And** conversation/project rows have visible active state, keyboard/touch-accessible actions, and no hover-only controls.

**Given** a trip project scopes the active chat
**When** the shell renders
**Then** the project is visibly identified in the sidebar and chat header or composer context indicator
**And** ordinary chat remains distinguishable from project-scoped chat.

**Given** a traveler first uses AI Ask or chooses to delete an owned chat or trip project
**When** the applicable UI is shown
**Then** a low-friction, non-blocking storage notice states: `Để hỗ trợ cuộc trò chuyện và kế hoạch chuyến đi, XuyenViet có thể lưu nội dung bạn cung cấp và gửi yêu cầu đến dịch vụ AI đã cấu hình để tạo câu trả lời. Bạn có thể xóa cuộc trò chuyện hoặc dự án chuyến đi bất cứ lúc nào.` and includes the link `Tìm hiểu thêm về quyền riêng tư`
**And** destructive confirmation explicitly names the chat/project and explains its removal from normal UI and retrieval use; trip-project confirmation states: `Dự án này, các cuộc trò chuyện liên kết và thông tin ngữ cảnh đã lưu sẽ bị xóa khỏi giao diện thông thường và không còn được dùng để gợi ý trong tương lai. Hành động này không thể hoàn tác.`

### Story 7.4: Keep Workspace Selection Canonical Across Devices

As an authenticated traveler,
I want my selected conversation and trip context to remain correct as I navigate or change devices,
So that the workspace always reflects the chat and project I intend to continue.

**Acceptance Criteria:**

**Given** the user selects a conversation, starts a new chat, selects/switches a trip project, or deletes a selected resource
**When** the terminal mutation completes
**Then** the URL canonically represents the active owned `conversationId` and/or `tripProjectId`
**And** stale, deleted, or unauthorized selection clears through the server-safe shell without exposing private existence details.

**Given** `/ai-ask` is rendered across desktop, tablet, and mobile
**When** the server-loaded shell and client workspace initialize
**Then** all breakpoints use the same user-scoped Chat/Trips shell read model and URL-owned selection
**And** client-only state is limited to draft, attachment preview, streaming, sheet visibility, and selected detail descriptor.

**Given** the viewport is tablet or mobile
**When** the authenticated shell adapts
**Then** tablet may use a 74px sidebar rail and mobile uses a focus-managed navigation sheet rather than a second data loader
**And** selecting a conversation/project from the mobile sheet closes it and moves focus to the chat heading or composer.

**Given** an authenticated traveler uses the workspace on mobile
**When** the shell renders an empty or active conversation
**Then** a top bar provides menu, active workspace title, and account access; chat is single-column; and the composer remains bottom-safe and reachable without covering the latest answer
**And** selected detail and source content open in the shared focus-managed sheet presentation.

**Given** an active conversation or trip project is rendered in sidebar, rail, or mobile navigation
**When** a keyboard or screen-reader user navigates the workspace
**Then** the active row exposes `aria-current` and visible focus in addition to its visual active state
**And** navigation, detail, source, and confirmation surfaces never create a dialog or sheet stack deeper than one level.

### Story 7.5: Refine the AI Ask Composer and Streaming Feedback

As an authenticated traveler,
I want a compact, accessible way to ask and refine travel questions,
So that the composer stays focused while still giving clear attachment, validation, and response feedback.

**Acceptance Criteria:**

**Given** the AI Ask composer is idle
**When** it renders in the empty or active workspace
**Then** it contains the prompt input, icon-only attachment trigger when image input is supported, and icon-only send trigger
**And** it does not reserve space for persistent attachment labels, file constraints, keyboard cheat sheets, verbose helper copy, or a large text send button.

**Given** an authenticated user selects an image or receives a validation failure
**When** the contextual state is shown
**Then** the composer reveals a compact thumbnail/file row with label, size/status, and accessible icon-only remove action, or a specific recovery message beside the error
**And** invalid image submission preserves the text draft and creates no provider call.

**Given** the user sends valid text or image-supported content
**When** the request is pending or streaming
**Then** duplicate submission is guarded, streaming uses subtle readable pending treatment, and progress copy does not imply completion
**And** completion is announced through a polite live region and reconciles to persisted message content and canonical URL state.

**Given** streaming finalization fails or persists a failed terminal answer state
**When** the user remains in the workspace
**Then** the UI presents recoverable retry guidance without claiming partial text is a completed saved answer
**And** the URL retains the created/selected conversation and active trip project context where one exists.

### Story 7.6: Present Scannable Answer Content

As a traveler reviewing an AI answer,
I want to navigate practical sections without scanning a dense wall of chat text,
So that I can quickly understand options, warnings, and next steps.

**Acceptance Criteria:**

**Given** an active assistant answer has relevant structured sections
**When** it is rendered
**Then** plan/options, rationale, tips, warnings, sources, uncertainty, and next steps are scannable through hierarchy and restrained surfaces
**And** a compact horizontally-scrollable row of relevant section chips navigates within the answer without altering persisted conversation data.

**Given** answer sources, warning states, or feedback controls are rendered
**When** a traveler uses color, keyboard, or screen reader navigation
**Then** labels accompany color, focus order follows reading order, feedback remains lightweight and optional, and no interaction relies on hover alone.

### Story 7.7: Inspect Persisted Answer Details Responsively

As a traveler reviewing an AI answer,
I want to inspect supported details without losing my conversation,
So that I can make better trip decisions while understanding source confidence and uncertainty.

**Acceptance Criteria:**

**Given** a persisted answer annotation descriptor of type `source`, `warning`, `trip_fact`, or `action` is present
**When** a traveler clicks, taps, or keyboard-focuses it
**Then** the selected descriptor opens a contextual inspector with semantic icon, Vietnamese title/summary, safe quick facts, related details, provenance chips, and only actions backed by owning server command modules
**And** the UI never parses Vietnamese answer prose to invent place, hotel, route, cost, source, or detail claims.

**Given** a selected descriptor is displayed on desktop
**When** the active workspace uses the three-panel layout
**Then** the inspector is a conditional right column around 380px wide beside the capped central answer column
**And** the inspector remains text/card-based and does not introduce Google Maps or a map-first dependency.

**Given** no descriptor is selected or an active answer has no descriptors
**When** the workspace renders
**Then** no blank right inspector is forced
**And** unavailable descriptor detail shows a compact recovery state without changing original answer text.

**Given** a descriptor is selected on desktop, tablet, or mobile
**When** responsive presentation changes
**Then** desktop inspector, tablet placement, and mobile sheet use the same transient selected-detail state and preserve the selection across breakpoint changes
**And** exactly one detail presentation is interactive while inactive duplicates are inert and excluded from assistive technology.

**Given** the traveler closes the inspector or detail sheet with close control or `Esc`
**When** it closes
**Then** focus returns to the descriptor/control that opened it
**And** source detail exposes only stored traveler-safe provenance fields such as label/title, type, URL/date when available, confidence, and freshness warning, never raw operator-only material.

**Given** answer sources, warning states, or feedback controls are rendered
**When** a traveler uses color, keyboard, or screen reader navigation
**Then** source detail exposes only stored traveler-safe provenance fields such as label/title, type, URL/date when available, confidence, and freshness warning
**And** it never exposes raw operator-only material.
