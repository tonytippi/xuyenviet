---
title: XuyenViet AI Travel Information MVP PRD
status: final
created: 2026-07-04
updated: 2026-08-09
---

# XuyenViet AI Travel Information MVP PRD

## 1. Summary

XuyenViet will launch a public-access MVP for Vietnamese-speaking road-trip travelers planning journeys across Vietnam, starting with the Hanoi-to-HCMC corridor. The MVP's primary product surface is **AI Ask**: an authenticated Vietnamese AI chat assistant that helps users plan trips faster by combining chat/trip context, curated travel knowledge cards, and web search fallback when the internal knowledge base is sparse or freshness-sensitive.

The MVP is not a complete travel marketplace, booking product, Google Maps replacement, or AI travel encyclopedia. It is a focused test of whether XuyenViet can give more useful Vietnam road-trip guidance than generic AI by remembering the user, grounding answers in collected sources, and being honest about uncertainty.

## 2. Goals

- Help Vietnamese travelers get useful Vietnam road-trip answers in Vietnamese.
- Reduce the time users spend searching across websites, Facebook posts, service listings, and generic search results.
- Prove that AI Chat with memory and personalization is the right initial product surface.
- Turn an approved trip direction into a user-controlled, structured road-trip plan rather than leaving important decisions only in chat history.
- Build an AI-first knowledge collection workflow that turns raw travel information into evidence-grounded provisional knowledge, while routing only risky or uncertain claims to operators.
- Make AI answers source-aware, confidence-aware, and explicit when information may be outdated or incomplete.

## 3. Non-Goals

- Nationwide public launch with complete coverage.
- Mobile app.
- Booking, payments, credit wallets, reward balances, referral payouts, ranking-based rewards, or partner transaction flows.
- Affiliate automation or commission-based answer ranking.
- Google Maps integration for the first cut.
- Fully automated scraping at scale or bypassing third-party access controls.
- Public user submissions as a dependency for first release.
- Complete nationwide coverage.
- Polished standalone UIs for every information category.
- Weather, current-location sharing, Google Maps/Places/Routes, booking, OTA enrichment, budget tracking, packing/checklists, travel vault, and collaboration in the Trip Planning Foundation tranche.

## 4. Target Users

### 4.1 Public Traveler

Vietnamese-speaking traveler planning a road trip, often with family members or children, who wants practical help finding routes, stops, places, services, risks, and tips without searching many separate sources.

Initial magic-moment example:

> Toi muon len ke hoach di choi 2 tuan tu ngay nay, di cung 2 con, diem den co the la TP.HCM. Hay tu van giup toi.

### 4.2 Operator

Internal owner or future small operations team member who collects travel information from raw sources, reviews AI-flagged claims, edits knowledge cards, and can approve, suppress, or verify knowledge after it is active.

## 5. Product Principles

- Chat and trip context first: answers should prioritize what the user has told XuyenViet inside the current chat session or selected trip project.
- XuyenViet knowledge second: answers should use active evidence-grounded knowledge cards when relevant, and communicate each card's source, state, and uncertainty.
- Fresh search third: answers may use web search fallback when curated data is missing, sparse, or likely outdated.
- Never fake certainty: collected web/Facebook information may be incomplete or wrong, so answers must expose uncertainty and recommend verification for changing details.
- Practical over generic: useful local tips matter more than polished itinerary prose.
- Family-aware by default when children are part of the trip.
- Chat is the command surface; a Trip Project is the confirmed state surface. AI may suggest persistent changes but never applies them without user confirmation.

## 6. MVP Scope

### 6.1 Must Have

- AI Ask chat in Vietnamese, with streaming assistant responses after required context/provenance inputs are assembled.
- AI Ask image input for authenticated users, so travelers can ask about relevant road-trip screenshots or photos when supported by the selected Gateway model.
- Google Login required before a user can ask AI.
- Chat sessions and trip projects tied to the logged-in user.
- Chat-level and trip-level context extraction.
- Operator knowledge-card creation, AI-recommended review, and knowledge lifecycle controls.
- Retrieval from active knowledge cards, including AI-extracted provisional community knowledge that passes publication guardrails.
- Web search fallback for missing or freshness-sensitive information.
- Source and confidence display in AI answers.
- Initial content focus on Hanoi-to-HCMC road-trip planning.
- OpenAI-compatible AI Gateway-backed AI behavior. [ASSUMPTION: Gateway-routed model processing is acceptable for public MVP data processing under the project's privacy expectations; direct OpenAI API calls are not used.]
- AI Gateway model management for MVP model records, including gateway model name, supported capabilities, and input/output/cache pricing metadata used for usage cost estimation.
- Basic data controls: users can delete a chat session or trip project, which removes the associated messages and trip context from normal use.
- AI usage tracking for authenticated AI requests, so future credit-based pricing can be introduced without changing the AI orchestration flow.
- Trip Planning Foundation: structured trip anchors, dated legs and activities, traveler constraints, and item states `idea`, `planned`, `confirmed`, or `backup`.
- One primary conversation per Trip Project after a safe migration from existing linked conversations.
- A basic Trip Home that presents the next planning focus and primary conversation without hiding prior chat history.
- Structured, expiring Trip Change Proposals that a user can apply, dismiss, or leave pending; every applied change has actor and timestamp history.

### 6.2 Should Have

- AI-assisted extraction of every independently useful, evidence-grounded claim from pasted URLs, text, copied Facebook post content, or images/screenshots.
- Operator-assisted Facebook capture automation for queued Facebook URLs, using a controlled browser session to populate operator-only raw source text before AI extraction.
- Family-aware planning rules for travelers with children.
- Answer quality checks that push responses toward practical tips, risks, and next steps.
- Basic operator roles prepared for future multi-operator workflows. [ASSUMPTION: first release can start with one admin/operator role and expand later.]
- In-answer feedback capture for public MVP quality measurement.
- Referral attribution capture when a new user registers through a referral link, without MVP rewards or payout behavior.

### 6.3 Could Have

- Shareable AI answer or itinerary summary.
- Basic feedback buttons on answer usefulness.
- Destination/route summary page generated from knowledge cards.
- AI-generated image output for travel planning, only if a concrete MVP workflow and Gateway model capability are approved later.

## 7. User Journeys

### UJ-1: Traveler Asks For A Family Trip Plan

1. User signs in with Google.
2. User opens AI Ask.
3. User asks a broad Vietnamese trip-planning question.
4. AI extracts or updates chat/trip context: travelers, children, dates, duration, destination, preferences, past trips, budget, and driving tolerance.
5. AI asks a small number of clarifying questions when needed, but still gives a useful initial answer.
6. AI retrieves relevant knowledge cards for the Hanoi-to-HCMC corridor.
7. AI uses web search fallback for missing or freshness-sensitive information.
8. AI returns a structured Vietnamese answer with plan options, child-aware tips, warnings, sources, confidence notes, and next steps.
9. User continues refining the plan in chat.

### UJ-2: AI Ingests Community Travel Knowledge

1. Operator opens the admin knowledge area.
2. Operator pastes a source URL, raw text, copied post content, or image/screenshot.
3. If the source is a Facebook URL without readable text, the source remains queued for operator-assisted capture.
4. Operator runs the controlled capture tool against queued Facebook URLs and confirms the extracted visible text before it is stored as operator-only raw source material.
5. AI triages the source and discovers every independently useful scoped atomic candidate without treating the number of candidates as a quota. Discovery is optimized for recall; an independent grounding-and-judgment step selects exact source evidence before any candidate can become knowledge.
6. Each candidate is independently grounded, validated, evaluated for quality, freshness, risk, duplicates, and conflicts, then completes with an immutable AI disposition of `apply`, `needs_operator`, or `discard`.
7. A low-risk `apply` candidate activates its card for AI retrieval as provisional community knowledge with conditions and uncertainty wording. A `needs_operator` candidate leaves its card non-retrievable in `pending_operator` with one version-bound operator work item.
8. AI creates a prioritized operator work item only for claims needing verification, relation/conflict resolution, risk handling, missing context, or quality sampling.
9. Operator may resolve the work by publishing, revising and requeuing, suppressing, resolving a relation, or recording a sampling result. An operator resolution records the human decision without changing the candidate's original AI disposition.

### UJ-3: Traveler Turns A Direction Into A Confirmed Trip Plan

1. A signed-in traveler creates or opens an owned Trip Project and sees its Trip Home.
2. The traveler describes a route, dates, family/vehicle constraints, and desired stops in the primary conversation.
3. AI returns useful guidance and, when a persistent plan change is appropriate, a structured proposal rather than silently modifying the trip.
4. The traveler reviews the proposal's changed items, rationale, and impact, then applies it, dismisses it, or leaves it pending.
5. The confirmed Trip Project displays anchors, legs, activities, constraints, and alternatives with clear `idea`, `planned`, `confirmed`, or `backup` states.
6. The traveler can reopen chat history and change history to understand why the current plan has its state.

## 8. Functional Requirements

### 8.1 AI Ask

- FR-1: The system shall provide a Vietnamese chat interface for authenticated users.
- FR-2: The system shall allow users to ask broad, underspecified road-trip planning questions.
- FR-3: The system shall respond in Vietnamese by default.
- FR-4: The system shall provide useful initial guidance even when some trip details are missing.
- FR-5: The system shall ask concise follow-up questions when important planning details are missing.
- FR-6: The system shall support iterative refinement across a conversation.
- FR-6A: The system shall stream AI Ask assistant responses when the selected Gateway model and orchestration path support streaming, but only after required context, source-bundle, and provenance inputs are assembled.
- FR-6B: The system shall allow authenticated users to submit supported image inputs with AI Ask messages when using an image-capable Gateway model.
- FR-6C: The system shall validate image inputs for size, type, ownership, and safety before any provider call, and invalid image submissions shall not create provider calls.
- FR-6D: Once an AI Ask request is admitted and its user message is persisted, browser reloads, chat switches, or HTTP stream disconnects shall not cancel answer generation while the API process remains alive; the browser stream is a best-effort relay and the persisted terminal answer is authoritative when the traveler returns to the conversation.
- FR-7: The system shall format travel answers as a calm Vietnamese conversation with suggested plan/options, rationale, practical tips, concise verification guidance when relevant, and next steps. Technical source/provenance, reasoning, audit, processing, and provider information shall not occupy the default traveler reading path.

### 8.2 User Authentication, Chats, And Trips

- FR-8: The system shall require Google Login before a user can ask AI.
- FR-9: The system shall associate chat sessions and trip projects with the authenticated user.
- FR-10: The system shall extract traveler and trip details from chat, including adults, children, children's ages when known, preferences, prior trips, budget, hotel style, driving tolerance, and constraints.
- FR-11: The system shall reuse relevant context within the current chat session or selected trip project.
- FR-12: The system shall distinguish chat-session context from trip-project context.
- FR-13: The system shall allow users to correct trip details through normal chat messages.
- FR-14: The system shall show users a clear notice that chat and trip details may be stored to support the current session or trip project.
- FR-15: The system shall allow users to delete a chat session or trip project they own.
- FR-16: The system shall not store sensitive personal data beyond what is needed for trip personalization. [ASSUMPTION: child data is limited to travel-relevant facts such as age range, comfort needs, and preferences; no full names required.]
- FR-16A: The system shall let an owner request changes to structured Trip Project anchors, including origin, destination, regions, required stops, and accommodations, through the primary conversation; accepted changes shall be applied only through an explicit Trip Change Proposal confirmation.
- FR-16B: The system shall let an owner request dated trip legs and activities of type `transport`, `visit`, `food`, `rest`, or `accommodation` through the primary conversation; accepted changes shall be applied only through an explicit Trip Change Proposal confirmation.
- FR-16C: The system shall give each structured trip item an explicit state of `idea`, `planned`, `confirmed`, or `backup`; an open or `idea` item shall not be treated as an error solely because it is unconfirmed.
- FR-16D: The system shall let an owner request travel-relevant trip-constraint changes, including travelers, children, vehicle/EV needs, driving tolerance, budget range, preferences, and places or activities to avoid, through the primary conversation; accepted changes shall be applied only through an explicit Trip Change Proposal confirmation.
- FR-16E: The system shall establish one primary conversation for each Trip Project while preserving owner access to currently linked historic conversations during migration.
- FR-16F: The system shall show an owned Trip Project a basic Trip Home that prioritizes an unresolved planning decision when one exists, otherwise the next planned leg or preparation focus, and presents the primary conversation as the central action.
- FR-16G: The system shall let AI create a typed Trip Change Proposal containing rationale, affected trip items, alternatives when available, and expiry when its supporting information is time-sensitive.
- FR-16H: The system shall require the Trip Project owner to explicitly apply a Trip Change Proposal before it changes persistent trip state; AI, provider output, and ordinary answer generation shall not directly mutate itinerary, constraints, or item state.
- FR-16I: The system shall preserve an owner-visible history for applied, dismissed, and expired Trip Change Proposals with actor and timestamp.
- FR-16J: The logged-in empty chat shall accept a natural-language travel request without requiring a traveler to select ordinary chat or a Trip Project first. The assistant may recommend, but never automatically create, a Trip Project when durable planning context makes saving useful; declining the recommendation is remembered until the context materially changes or the traveler asks to save.
- FR-16K: For an unscoped question, the system may recommend one or more owned Trip Projects or ask a clarifying question using a server-owned decision. It shall never attach project context without explicit traveler selection; a private answer shall not use or persist the selected project's constraints for that turn.
- FR-16L: A project-scoped composer shall state the active trip in traveler language and provide an explicit way to ask outside it or switch projects. Switching selects the existing primary conversation and shall not merge or copy an ordinary conversation into the project.

### 8.3 Knowledge Cards

- FR-17: The system shall support operator-created knowledge cards.
- FR-18: Each knowledge card shall include title, type, location or route segment, summary, source, collected date, confidence level, tags, and freshness-sensitive flag.
- FR-18A: Each AI-extracted community claim shall preserve a short evidence quote, validated source-text span, source link when available, capture date, observed date when known, and identified conditions before it can be active for retrieval.
- FR-18B: The system shall not retain or expose personally identifying or sensitive content in traveler-visible facts or evidence quotes.
- FR-18C: Knowledge cards shall preserve validated, bounded practical details needed for traveler guidance. A `route_note` may preserve `ordered_stops` in source order, including intentional repeated stops.
- FR-19: Knowledge card types shall include place, food, hotel area, activity, service, route note, warning, cost note, parking, EV charging, kid-friendly tip, discount/promotion, and general travel tip.
- FR-20: Operators shall be able to create, edit, approve, and archive knowledge cards.
- FR-21: Knowledge cards in `active` lifecycle state shall be used for normal AI retrieval when their current evidence remains eligible. Operator approval is optional and must not be a prerequisite when an AI-extracted community claim meets the active-publication policy.
- FR-22: Knowledge cards shall preserve source provenance enough for users or operators to inspect where the information came from.
- FR-22A: Every knowledge card shall have exactly one lifecycle state: `draft`, `pending_operator`, `active`, `suppressed`, `archived`, or `rejected`.
- FR-22B: The system shall track domain classification separately from workflow as `community_observation`, `community_pattern`, `conditional`, or `conflicted`; it shall not use workflow terms such as `uncertain`, `confirmed`, or `superseded` as a card classification.
- FR-22C: The system shall track verification requirement separately as `none`, `operator_required`, or `failed`. Independent corroboration is derived from eligible evidence with distinct independence keys; an operator decision is recorded in operator-work resolution and audit history.
- FR-22D: The system shall exclude every card other than an evidence-eligible `active` card from normal retrieval. A `pending_operator` card is never traveler-retrievable.

### 8.4 Knowledge Collection

- FR-23: Operators shall be able to submit raw source material as URL, raw text, copied post content, or image/screenshot.
- FR-23A: The system shall support queued Facebook URLs whose visible post content can be captured later by an operator-run browser automation tool.
- FR-23B: Facebook capture automation shall populate operator-only raw source material only after operator-visible content is extracted and confirmed; it shall not store browser credentials, cookies, tokens, local storage, full HTML dumps, or hidden page data.
- FR-23C: For each immutable Facebook capture version, the operator capture queue shall use canonical ingestion-job technical status as its primary status, filter, count, and ordering signal. A completed job shall show aggregate candidate counts, including candidates that need operator action, rather than a rolled-up publication outcome. Recapture status and legacy extraction records shall remain secondary operational or historical signals and shall not override canonical job status.
- FR-24: The system shall use AI to triage submitted source material, discover structured scoped candidates, and use an independent grounding judge to validate each publishable claim against an exact source-text evidence span. AI may propose a contiguous evidence quote but shall never be authoritative for its character offsets; the system shall derive the persisted raw quote/span from the immutable capture after unique Unicode-normalized matching.
- FR-24A: The system shall classify AI-triaged source material as rejected, context-only, or candidate-bearing, and shall retain candidate AI disposition and decision reasons for audit and quality evaluation.
- FR-24B: The system shall use an independent AI evaluation step to decide whether an extracted candidate receives `apply`, `needs_operator`, or `discard`; the extractor shall not be the sole publication decision-maker.
- FR-24C: The system shall discover and process every independently useful atomic claim supported by a submitted immutable source version; it shall not discard otherwise qualifying claims merely because a source contains many claims or a prior sibling claim was accepted.
- FR-24D: The system shall give each discovered candidate an independent, auditable processing result and immutable non-null AI disposition and reason when completed; failed candidates shall have no business disposition. It shall complete a source ingestion only after discovery is terminal and every candidate has completed or failed. `candidateCount`, `completedCandidateCount`, `failedCandidateCount`, and `needsOperatorCandidateCount` shall be transactional, idempotent observability projections and never lifecycle authority. A source may complete successfully with mixed candidate dispositions or when no candidate is applied.
- FR-24E: When a newer source capture supersedes an earlier immutable version, work from the earlier version shall not create, attach, conflict with, or otherwise mutate active knowledge. Historical ingestion behavior shall remain intelligible when newer ingestion capabilities are introduced.
- FR-24F: For a source describing an itinerary, the system shall preserve a route note's source-order stop sequence, including intentional repeats, and shall extract each independently useful scoped observation about a named place, venue, or route option as a sibling candidate. Bare stop labels alone shall not become knowledge-card candidates.
- FR-25: The system shall make a claim searchable without human approval only when it has validated evidence, sufficient travel specificity and actionability, no sensitive content, no high commercial/spam risk, and no unresolved high-risk conflict.
- FR-25A: The system shall create risk-prioritized operator work, not a mandatory approval gate, for verification, relation, risk, missing-context, or sampling work. Every work item shall have `open`, `resolved`, or `superseded` status and bind to the card's exact content and evidence-set versions. A `verification` resolution gives an authorized operator the final right to publish, revise and requeue, or suppress a card with available validated evidence; it retains audit history and a version fence without changing the candidate AI disposition. A stale or superseded work item shall make no card, evidence, audit, dirty-marker, or search-projection mutation. An active card shall have no open primary operator work.
- FR-25B: The system shall support random quality sampling of active claims so operators can measure false-positive publication without delaying the normal ingestion flow. The initial sampling rate shall be 15% for the first four weeks, and every `needs_operator` outcome shall create one immutable sampling obligation distinct from actionable operator work. Sampling is quality monitoring rather than publication approval and may be open only for an active card version. Before high-severity containment, the system shall persist the exact cohort definition and affected card/version membership; it shall either open one version-fenced `risk` item for each remediable card transitioned to `pending_operator`, or suppress/de-index unsafe cards without successor work. Unrelated cohorts shall remain unchanged.
- FR-26: The system shall support confidence labels such as unverified, community, curated, partner, or official. [ASSUMPTION: exact label names can be refined during UX/architecture.]
- FR-27: The system shall allow operators to mark facts as freshness-sensitive when they involve price, schedule, availability, road condition, opening hours, weather, or service status.
- FR-28: The system shall support a minimum public-MVP seed set of 100 active knowledge cards across the Hanoi-to-HCMC corridor. [ASSUMPTION: 100 is enough to test retrieval quality while remaining feasible for initial public launch.]
- FR-28A: Authorized operators shall have an aggregate-only seed-coverage report that counts only active Hanoi-to-HCMC cards with complete retrieval metadata and valid bounded evidence from eligible retained sources. It shall show taxonomy and route/location gaps, including zero-count buckets; distinguish countable community observations or patterns from caveat-only material; and surface current review, verification, source, and recommendation work without exposing raw capture content, URLs, quotes, provider payloads, or removal internals.

### 8.5 Retrieval, Web Search, And Answer Grounding

- FR-29: The system shall retrieve relevant cards only when `lifecycle_state = active`, current evidence is eligible, and domain classification and verification requirement permit the requested use.
- FR-30: The system shall prioritize answer context in this order: selected trip project context, current chat session context, active XuyenViet knowledge, web search fallback, and general AI knowledge.
- FR-31: The system shall use web search fallback when active knowledge is missing, sparse, freshness-sensitive, unavailable because it is pending operator work, or conflicted.
- FR-32: The system shall persist and make auditable whether answer information came from chat/trip context, XuyenViet knowledge cards, web search, or general AI reasoning. This classification is not default traveler-facing copy.
- FR-32A: The system may ask the answer-generation model, in the same server-side request, to report which rendered knowledge or web source handles materially informed the answer. The server shall validate those handles against the same-turn source bundle and persist only validated attribution as `citedInAnswer`; missing or malformed attribution shall not fail a valid answer.
- FR-32B: `citedInAnswer` is not the same as source availability or prompt use. The system shall preserve `usedInPrompt` for sources rendered into the answer prompt and `citedInAnswer` only for sources explicitly reported by the model through the validated internal attribution tool.
- FR-33: The system shall warn users to verify changing details before acting or booking.
- FR-34: The system shall avoid presenting unverified collected information as guaranteed fact.
- FR-35: Web search results used in answers shall be shown as external/unverified unless ingested into an active knowledge card that meets the applicable publication policy.
- FR-36: The system shall prefer official/provider pages over reposted or unattributed sources when using web search fallback.
- FR-37: Facebook-derived information shall not be treated as official unless it comes from an identifiable official/provider page. [ASSUMPTION: operators may use Facebook content as leads or community tips, but provenance must be retained.]
- FR-37A: The system shall present a community observation, pattern, or conditional claim with its appropriate uncertainty wording and shall not represent it as an official fact.
- FR-37B: The system shall only describe a claim as a community pattern when multiple independent supporting evidence records exist.
- FR-37C: The system shall not use `conflicted` knowledge as a factual premise for itinerary recommendations; it may use it to surface uncertainty, ask a clarifying question, recommend verification, or choose a safer alternative.

### 8.6 Family-Aware Planning

- FR-38: When children are part of the trip, the system shall consider shorter driving blocks, rest stops, child-friendly activities, learning opportunities, hotel convenience, and backup activities.
- FR-39: The system shall identify places or activities that may be unsuitable or boring for children when relevant.
- FR-40: The system shall suggest family-relevant tips such as child discounts when known from sources.
- FR-41: The system shall balance parent goals with child comfort and experience.

### 8.7 Public MVP Operations

- FR-42: The system shall allow public sign-in without an email allowlist, but AI Ask shall require an authenticated Google user.
- FR-43: The system shall provide an operator/admin area separate from traveler chat.
- FR-44: The system shall support at least one admin/operator account for initial knowledge management.
- FR-45: The system shall allow future expansion to multiple operators without redesigning the knowledge workflow.
- FR-45A: The operator capture-review surface shall show safe aggregate and candidate-level ingestion outcomes sufficient to diagnose a source without exposing raw provider output, raw captured text, quotes outside approved evidence storage, or internal execution secrets.
- FR-45B: Exact administrators shall be able to view a paginated user roster limited to name, email, avatar, verification state, and roles; grant or revoke only `operator` and `admin` roles; and receive an audit record for each role delta. Operators shall not access the roster or role mutations, and the system shall prevent removal of the final administrator or an administrator's own final admin role.
- FR-45C: The exact-admin user roster shall show each displayed user's lifetime persisted AI-event count and prompt and completion token totals. It shall include successful and failed events, treat null token values as zero, aggregate only the paginated roster user IDs, and expose neither prompts nor provider payloads; it shall not introduce quotas, credits, billing, or traveler/operator access.
- FR-46: The system shall capture a simple usefulness rating for AI answers during the public MVP through lightweight answer-footer controls. Optional reasons or comments appear only after negative feedback and never block the composer or displace planning.
- FR-46A: Traveler-facing UI shall express loading, unavailable, verification, and failure states in plain Vietnamese with the practical effect and recovery action. It shall not display internal status names, provider/model names, technical error codes, request IDs, source/provenance taxonomy, retrieval policy, audit terminology, or implementation diagnostics.
- FR-47: The system shall record AI usage events for authenticated AI requests, including user, conversation or trip context when applicable, AI purpose, provider/model, timestamp, and available usage/cost metadata.
- FR-48: The system shall capture referral attribution when a new user signs in or registers through a valid referral link, without calculating rewards, ranking, payout, or credit conversion in MVP.
- FR-49: The system shall manage AI Gateway model records with gateway model name, intended purpose, supported input/output capabilities, active status, and input/output/cache pricing metadata.
- FR-49A: Exact administrators shall be able to create, update, set one eligible active default per purpose, and archive AI Gateway model records without deletion. Each pricing snapshot shall store currency, version, effective timestamp, and non-negative input, output, and cache prices per fixed 1,000,000 tokens using exact integer micros. Archived records shall not be defaults, and credentials and provider payloads shall not be exposed.
- FR-50: The system shall use configured model pricing metadata to estimate AI usage cost when provider usage token metadata is available, without creating credit balance or billing behavior in MVP.
- FR-51: The system shall expose versioned domain API contracts for traveler web, operator app, and future mobile clients without client dependence on Next.js internals or Auth.js session serialization.
- FR-52: Traveler and operator browser clients shall call documented versioned NestJS APIs directly using only NestJS-managed secure session cookies; they shall receive neither database credentials nor internal service credentials.
- FR-53: The system shall provide a separately deployed operator/admin application with its own origin and release lifecycle that uses the protected API without database credentials or direct domain imports.
- FR-54: NestJS shall authorize every protected API read and command with a domain-neutral request principal resolved from a live opaque server-side session and current authorization state.
- FR-55: The system shall provide a stable API error contract with machine-readable code, safe message, request/correlation ID, and applicable safe field violations without sensitive internals.
- FR-56: The system shall document versioned health/version and protected-capability API contracts, including validation, authorization, ownership, pagination/stable ordering, streaming semantics where applicable, and browser-session/CSRF admission requirements.
- FR-57: The system shall run continuous background work in a dedicated worker runtime and bounded sweeps as scheduled one-shot commands using existing PostgreSQL job, claim, lease, fencing, and idempotency protocols.
- FR-57A: Post-answer enrichment such as chat/trip context extraction, answer text-range annotations, and Trip Change Proposal drafting shall remain worker-owned outbox consumers. These consumers may add context, `messages.answer_annotations`, or user-confirmable proposal actions, but they shall not change the completed answer content, terminal command result, initial provenance, or successful-answer usage.
- FR-58: The system shall preserve one writer per aggregate command during migration; route each request to exactly one transport owner and never dual-write product state.
- FR-59: The system shall move AI Ask streaming to the versioned API while preserving `preparing`, `delta`, `done`, and `error` NDJSON events, abort behavior, and atomic terminal persistence.
- FR-59A: OpenAI-compatible streamed providers that return answer content and then close the stream without `[DONE]` or `finish_reason` may be treated as successful only when the stream is otherwise well-formed, non-empty, and contains no provider-declared error or parse failure.
- FR-60: The system shall retire Auth.js, legacy Next.js domain route handlers, server-action writers, BFF transport, and the legacy `/admin` operational surface before public launch.

## 9. Non-Functional Requirements

- NFR-1: User-facing chat responses should feel responsive enough for interactive planning. [ASSUMPTION: exact latency target to be defined after architecture spikes.]
- NFR-2: The product shall preserve chat sessions and trip projects securely and only for authenticated users.
- NFR-3: The system shall not expose operator-only raw source material or admin controls to normal travelers.
- NFR-4: AI answers shall be auditable enough to identify which knowledge cards or source types influenced the response.
- NFR-5: The system shall support Vietnamese content input, retrieval, and output.
- NFR-6: The MVP shall tolerate sparse internal knowledge by using web search fallback and clearly labeling uncertainty.
- NFR-7: The system shall be designed so Google Maps integration, public submissions, and booking/partner flows can be added later without becoming MVP dependencies.
- NFR-8: Browser automation for Facebook capture shall run as an operator-controlled operations tool, not as public request-path app logic or unattended mass crawling.
- NFR-9: Active AI-extracted claims shall remain auditable through their immutable AI disposition, later operator-work resolution where applicable, evidence, source, lifecycle state, and audit history.
- NFR-9A: Source ingestion shall make bounded progress through large source material without imposing a maximum accepted-fact quota. Retry, interruption, duplicate delivery, and supersession shall not duplicate candidates or permit obsolete work to change canonical knowledge. Technical job status shall not be used to represent mixed candidate business outcomes.
- NFR-9B: When a source is withdrawn, inaccessible, or removed, the system shall atomically retire its traveler-eligible evidence, re-evaluate every dependent card against remaining eligible support, and disable any now-ineligible search projection before completion. Retrieval shall recheck current card, evidence, source, and capture eligibility and fail closed while indexing catches up.
- NFR-10: Trip Project reads and mutations, including primary-conversation access, structured plan data, proposals, and history, shall remain owner-scoped until a separately approved collaboration model exists.
- NFR-12: API, worker, traveler web, operator app, and migration workloads deploy independently to staging with least-privilege configuration and health contracts; migrations run before dependent traffic.
- NFR-13: Liveness verifies process operation; readiness verifies assigned configuration, database, and critical dependencies. Worker shutdown stops claims and safely completes or releases leased work.
- NFR-14: Correlation IDs and safe structured telemetry cover browser session admission, API, worker, and provider operations, including capability, principal class, result, latency, and safe operational identifiers.
- NFR-15: Browser-to-API and database traffic remain private and origin-controlled; staging and production use isolated credentials, databases, OAuth configuration, and observability projects.
- NFR-16: The current lifecycle normalization uses a clean-break migration, reset, and reseed only under repository safeguards because all current targets are disposable. If durable shared or customer data exists before it ships, implementation shall use an approved forward-only migration with explicit, tested handling for affected old data; it must not use a down migration or destructive schema rollback.
- NFR-17: Before retiring a legacy worker loop, its replacement dashboard and runbook demonstrate stable lag, retry, lease recovery, duplicate-poller, and restart behavior.
- NFR-18: Before public launch, approve Railway ownership, domains/DNS/CSP/OAuth callbacks, secrets, backup/restore, monitoring, alerting, and on-call; pass connection-pool, AI-stream concurrency, and backup-restore tests.
- NFR-11: Applying a Trip Change Proposal shall validate the proposal belongs to the selected Trip Project, is still applicable, and is authorized for the owner before writing an auditable change.

## 10. MVP Product Contracts

### 10.1 Chat, Trip, And Data Control Contract

- The MVP may store chat and trip context only for travel planning: start city, traveler count, child age range, travel preferences, prior trips, avoided/repeated places, budget range, hotel style, driving tolerance, vehicle/EV needs, food/activity preferences, and current trip details.
- The MVP shall not require or intentionally store children's full names, identity documents, payment data, medical details, exact home address, or other sensitive personal data.
- Context is extracted automatically from chat, and the assistant may refer to chat/trip details when they are relevant.
- Users can correct trip details through chat, for example: "Hay nho rang con toi 8 tuoi, khong phai 6 tuoi."
- Users can delete a chat session or trip project they own. MVP deletion removes the associated messages, trip context, and derived embeddings from normal user-facing and retrieval use.
- Conversation transcripts may be retained only as part of existing chat sessions or trip projects, with access limited to the owning user and authorized operators/admins for operations/debugging.
- OpenAI processing is allowed for public MVP chat, extraction, and response generation only under a configuration that does not train provider models on project data where such setting is available.

### 10.2 Traveler Trust And Source Detail Contract

- Every assistant answer retains persisted, inspectable provenance, but a default answer shall not render a generic source/confidence/provenance block, model-reasoning label, raw source category, or audit/processing status.
- When a recommendation depends on changing, consequential, safety-sensitive, route, access, booking, price, opening-hours, or availability information, the answer shall show a concise, nearby, action-oriented verification note in plain Vietnamese and may offer a disclosure control.
- A traveler who opens source detail may see only a safe source title or label, safe HTTP link when available, checked/collected date when useful, and a plain-language explanation of relevance or verification need. Internal source types, confidence codes, provenance IDs, retrieval decisions, provider/model metadata, and raw evidence remain hidden.
- Source classification, confidence, verification state, and web-search status remain persisted machine/audit data. They inform safe wording and disclosure selection but are not traveler-facing labels by default.
- Web-search information is never represented as confirmed merely because it is displayed. Traveler copy explains what to verify and why; it does not use internal labels such as `unverified`.

### 10.3 Community Knowledge Publication And Conflict Contract

- Community sources are observations with time, conditions, and personal bias; active publication means a claim is evidence-grounded and safe to express within its state, not that it is operator-verified or permanently true.
- A claim may be active immediately only if an independent AI judge validates the evidence span, travel relevance, specificity, actionability, safety/PII policy, absence of unresolved high-risk conflict, and at least one eligible active supporting evidence record with required retrieval metadata.
- Initial active-publication thresholds shall require travel relevance >= 0.75, extractability >= 0.70, evidence grounding >= 0.90, specificity >= 0.65, actionability >= 0.65, first-hand likelihood >= 0.55, and spam/commercial risk <= 0.25, in addition to the hard gates. The numeric scores inform the decision but shall not override failed code validation of the evidence span or privacy policy.
- `community_pattern` may be used when multiple independent community evidence records support a materially consistent observation. `conditional` may be used only when the answer includes its material condition. `conflicted` may not support a factual recommendation.
- Claims about road closures or conditions, safety, EV charging status, prices, opening hours, availability, booking policy, and promotions are freshness-sensitive. Automation must assign grounded claims in these categories `needs_operator` with `verification_requirement = operator_required`, not auto-publish or discard them solely for missing the normal auto-publication score threshold. They remain non-retrievable in `pending_operator`. An authorized operator may publish, revise and requeue, or suppress the card; this records an operator-authorized resolution with available evidence and does not imply multi-source corroboration or a `community_pattern` state.
- A high-risk conflict shall immediately transition an active card to `pending_operator`, set its domain classification to `conflicted`, open one version-bound primary work item, and de-index it; this transition shall not wait for operator review.
- A source quote and direct link are evidence for operator audit by default. Facebook-derived evidence shall default to `operator_only`; traveler-visible display is permitted only when the source is accessible, the quote is short and relevant, and it contains no personally identifying or sensitive material.
- Raw captured Facebook text shall be operator-only. A source with no active or reviewable claim shall be deleted after 180 days; a source supporting an active claim shall be re-evaluated and its traveler-visible evidence removed if the source is withdrawn, inaccessible, or subject to a removal request.
- Operators may resolve any open work through the authenticated API, while normal ingestion and indexing remain Worker-owned continuous loops. The system shall prioritize work by likely traveler impact and evidence/risk signals. Each primary or sampling work item is bound to exact card content and evidence-set versions; resolving stale work must have no mutation side effects. A high-severity sampling failure triggers the cohort-scoped containment defined in FR-25B. Source removal completes only after every dependent card is re-evaluated and no removed evidence remains traveler eligible.
- A text-source ingestion is a source-level traversal, not a single-claim decision: one bounded request covers the complete immutable text capture and seeks every independently useful scoped candidate. Request-size limits protect operations only; they do not limit the number of qualifying claims.
- Each candidate from the same source has its own exact evidence validation, independent batch grounding/judgment result, relation decision, publication/review/verification/suppression outcome, and safe audit summary. The parent source reports aggregate outcomes and may succeed even when all candidates are suppressed or invalid.
- AI evidence output is a quote proposal, not a source-coordinate authority. The system may use Unicode-normalized matching that removes only formatting/decorative characters to locate that quote, but accepts it only when it maps uniquely to the immutable capture. It then persists the exact original capture substring and its system-derived code-point span. Missing or ambiguous matches fail closed; normalized text is never persisted as evidence or used to relax later raw quote/span validation.
- A newer immutable capture version invalidates older in-flight work before it can change canonical facts or evidence. Existing historical ingestion records remain interpretable when the ingestion protocol evolves; the system shall not fabricate candidate-level history or reinterpret legacy outcomes.
- The operator review surface may expose bounded aggregate and candidate-level safe outcomes for diagnosis. It shall never expose raw provider payloads, captured raw text, unapproved quotes, checkpoint internals, or execution-fencing data. As a narrowly scoped diagnostic exception, an exact administrator may inspect the latest successful canonical-ingestion discovery completion, capped at 1 MiB, alongside deterministic candidate rejection reasons. This exception never permits storage or display of provider HTTP envelopes, errors, prompts, credentials, raw captured text, unapproved quotes, checkpoints, or fencing data; it is never traveler-facing or emitted in worker logs.

### 10.4 Web Search Fallback Contract

- Provider selection is an architecture decision, but the provider/mechanism must return URL, title, snippet or summary, and enough metadata to show source provenance.
- The selected mechanism must support Vietnamese queries and Vietnamese sources.
- The selected mechanism must allow official/provider-source preference in ranking or post-filtering.
- Web search is triggered when no relevant active cards are retrieved, fewer than three relevant active cards are retrieved for a broad planning question, the user asks about freshness-sensitive facts, or relevant cards are pending operator work or conflicted.
- If web search fails or confidence is low, AI shall say it cannot verify updated information and recommend user confirmation rather than inventing facts.
- Search-derived information may be used in answers but remains external/unverified until it is ingested as a knowledge claim that meets the applicable publication policy.

### 10.5 AI Answer Quality Rubric

Public MVP answer evaluation uses a 1-10 score across these dimensions:

- User-context use: answer reflects travelers, children, dates, preferences, prior trips, and constraints.
- Practical specificity: answer includes concrete stops, pacing, services, warnings, or next actions.
- Source grounding: persisted answer provenance correctly identifies which parts came from XuyenViet knowledge, web search, chat/trip context, or general AI reasoning; traveler copy communicates only the practical verification guidance needed for a decision.
- Uncertainty handling: answer flags outdated, changing, sparse, or unverified information.
- Family-awareness: when children are included, answer adapts driving time, activities, rest, hotel area, and risk notes.
- Vietnamese clarity: answer is understandable, natural, and locally appropriate for Vietnamese users.

The first public-MVP evaluation prompt set shall include: the magic-moment family trip question, a sparse-data question, a freshness-sensitive question, a service/activity question, and a route logistics question.

Counter-metrics: track hallucinated unsupported claims, claims whose evidence span does not support their wording, missing uncertainty labels on community/freshness-sensitive facts, unsafe use of conflicted claims, and answers that users rate as no better than generic ChatGPT.

### 10.6 Usage And Referral Readiness Contract

- AI usage tracking is for cost visibility, abuse investigation, and future pricing design; MVP shall not show or enforce credit balances.
- Usage events shall not become the source of truth for chat content or answer provenance.
- AI model pricing metadata is used for internal cost estimation only; MVP shall not expose credit balances, charge users, or block requests for insufficient funds.
- Usage cost estimates must identify the model pricing record or pricing version used when available.
- Cache pricing, if supported by the Gateway/provider, must be tracked separately from ordinary input and output pricing.
- AI Gateway pricing snapshots use one fixed unit of 1,000,000 tokens and exact integer micros, with currency, version, and effective timestamp, so a cost estimate can identify the applicable price record without floating-point ambiguity.
- Referral attribution capture stores who referred a new user and the referral code or campaign used when available.
- MVP referral attribution does not create reward liability, payout entitlement, ranking status, or credit conversion.

### 10.7 Trip Planning Foundation Contract

- A Trip Project owns its structured plan: anchors, legs, activities, constraints, item states, confirmed alternatives, proposals, and change history. The primary conversation is the only plan-authoring surface: chat requests create typed proposals, while chat transcripts do not themselves become the confirmed trip state.
- The first tranche is single-owner. All reads and mutations are scoped to the authenticated owner; no collaboration, shared editing, public sharing, or location sharing is implied.
- A migration may choose one linked conversation as the primary conversation for an existing Trip Project, but must preserve access to prior owner-linked conversations and must not discard their history.
- AI can draft plans and create structured change proposals. Only a user-confirmed server command may apply a proposal to persistent state after checking ownership, trip membership, proposal validity/expiry, and the affected-item version or equivalent conflict guard.
- A proposal may create, update, remove, reorder, or change the state of explicitly identified structured trip items. It must show the user its intended effect before confirmation and must not create hidden side effects; there is no separate manual form or timeline editor for these mutations in this tranche.
- A `confirmed` plan item means its owner has confirmed the choice or supplied a real constraint. It does not imply a booking, provider availability, live route check, weather check, or other external validation. If the owner has not confirmed a choice, it remains `planned` or `idea`.
- Trip Home is a focused state surface, not a widget dashboard. It selects one focus deterministically: a pending unexpired proposal with an expiry, then any other pending unexpired proposal, then a confirmed-item gap, then the next future `planned` or `confirmed` leg by planned time, then preparation. Ties use earliest expiry, then earliest planned time, then stable item creation time or ID. A confirmed-item gap exists only when a confirmed `transport` item lacks planned date/time or origin/destination context, or a confirmed `accommodation` item lacks date/time or place/area; open `idea` items and incomplete `planned` items are not gaps by themselves. An empty plan or a plan without a dated future leg shows preparation with the primary composer. Historic chat and change history remain available on demand.
- Explicit Trip Project lifecycle phases, owner phase overrides, and on-trip `today` focus are deferred from the Trip Planning Foundation. They require later approved dynamic-data and lifecycle rules.
- Weather, dynamic route/ETA, current location, Maps/Places, provider snapshots, booking/availability, budget, checklist, travel vault, notifications, and collaboration are excluded from this tranche. A proposal must not imply that any of those unavailable data sources were checked.

## 11. Initial Data Scope

The public MVP should focus on the Hanoi-to-HCMC road-trip corridor. Initial knowledge should prioritize information that makes AI answers practically useful:

- major route segments and suggested pacing
- rest stops and family-friendly stops
- sightseeing and historical places
- hotel areas with parking/convenience notes
- food stops
- road condition or safety notes
- EV charging where available
- parking notes
- kid-friendly activities
- costs or discount notes
- travel services and activities such as diving where relevant to destinations

[ASSUMPTION: The first public MVP does not need complete coverage for every province along the route, but it should have enough active, evidence-grounded examples to prove the retrieval and answer-quality loop.]

## 12. Success Criteria

- SC-1: At least 7 of 10 sampled public MVP users or test users rate the magic-moment answer as useful, with a score of 7/10 or higher.
- SC-2: At least 7 of 10 test answers include user-context references, practical local tips, and plain-language verification guidance when the recommendation needs it, without technical source/confidence labels in the default reading path.
- SC-3: The magic-moment answer includes at least one child-aware planning recommendation, one practical route/logistics tip, one uncertainty or freshness warning, and one suggested next step.
- SC-4: The AI-first ingestion workflow can create at least 100 active, evidence-grounded knowledge cards for the Hanoi-to-HCMC corridor before first public-MVP evaluation.
- SC-5: Active knowledge cards influence AI answers and remain visible in persisted response provenance; traveler UI uses appropriate plain-language uncertainty and verification wording without exposing internal provenance taxonomy.
- SC-6: No more than 2 of 10 test users say the answer feels no better than generic ChatGPT.
- SC-7: In representative quality samples, every active AI-extracted claim has a validated evidence span and no high-severity publication-policy failure.

## 13. MVP Acceptance Criteria

- AC-1: A Vietnamese user can access the public app entry point, sign in with Google, and then access AI Ask.
- AC-2: The user can ask the magic-moment trip-planning question and receive a Vietnamese answer without first completing a long form.
- AC-3: The answer includes clarifying questions while still providing an initial useful plan.
- AC-4: The system persists applicable provenance categories for chat/trip context, XuyenViet knowledge, web search/external source, or general AI reasoning; the default traveler answer does not expose these technical categories.
- AC-5: The answer clearly labels freshness-sensitive or uncertain information.
- AC-6: The answer incorporates family-aware recommendations when children are mentioned.
- AC-7: The system stores and reuses non-sensitive context within chat sessions and trip projects owned by the authenticated user.
- AC-8: The user can correct trip details through chat and delete chat sessions or trip projects they own.
- AC-9: The system can triage raw source material, extract claims with validated evidence spans, and make qualifying claims active for AI retrieval without operator approval.
- AC-9A: An operator can queue Facebook URLs, run operator-assisted capture to add readable raw text, and then use the AI-first triage, claim extraction, and publication workflow without changing Facebook-derived trust defaults.
- AC-9B: The system routes risky, weakly evidenced, freshness-sensitive, duplicate, or conflicting claims to an AI-recommended, impact-prioritized operator review queue without blocking qualifying low-risk claims.
- AC-9C: AI Ask excludes every non-active card; applies conditional and community wording to active community claims; and does not make factual itinerary recommendations from conflicted claims.
- AC-9F: A completed ingestion job can contain mixed candidate dispositions without its technical status misrepresenting those outcomes. It completes only after terminal discovery and completed-or-failed candidate processing, with defined idempotent counters. An operator resolution does not change a completed candidate's AI disposition or reason; failed candidates have no business disposition.
- AC-9G: No active card has open primary operator work; each card version has at most one open primary work item and one open sampling item; a stale or superseded work item cannot mutate a card, evidence, audit, or search projection. An active card has eligible supporting evidence, and source removal completes only after dependent cards are re-evaluated and removed evidence is no longer traveler eligible.
- AC-9D: For a long eligible source containing multiple useful claims, the system independently processes every structurally valid, quality-gated claim across the complete source without an accepted-fact quota; mixed candidate outcomes are accurately reflected in the source aggregate.
- AC-9E: Retries, interrupted work, duplicate delivery, or a newer capture cannot duplicate candidate work or let obsolete source work mutate a knowledge card or its evidence; the operator can inspect bounded, safe aggregate and candidate outcomes for a newer-protocol capture.
- AC-10: At least 100 active, evidence-grounded knowledge cards exist for the Hanoi-to-HCMC corridor before first public-MVP evaluation.
- AC-11: Web search fallback is used only when curated knowledge is missing, sparse, or freshness-sensitive, and search-derived facts are labeled as external/unverified.
- AC-12: Public MVP answer feedback is captured for usefulness evaluation.
- AC-13: When a traveler opens a relevant verification disclosure, source detail shows only traveler-safe title/label, safe URL when available, useful date, and plain-language verification context. Internal source type, confidence label, provenance ID, retrieval policy, and provider metadata are not rendered.
- AC-14: AI quality evaluation can be run against the five-prompt public-MVP evaluation set using the rubric in this PRD.
- AC-15: Authenticated AI requests create AI usage records with enough metadata to support future cost analysis.
- AC-16: A valid referral link can be captured during sign-in or registration and associated with the new user without exposing referral reward UI.
- AC-17: AI Ask can stream an assistant response after context/provenance preparation without treating partial streamed text as final persisted answer content.
- AC-18: An authenticated user can submit a supported image input with an AI Ask message, and unsupported or invalid images are rejected before provider calls.
- AC-19: Active AI Gateway models can be configured with model name, capability flags, and input/output/cache pricing metadata used by usage tracking.
- AC-20: An authenticated owner can create and maintain a structured Trip Project with anchors, dated legs/activities, travel constraints, and explicit item states without relying on a chat transcript as the confirmed plan.
- AC-21: Existing linked conversations remain available after a Trip Project gains exactly one primary conversation.
- AC-22: When AI suggests a persistent trip change, the owner sees a structured proposal and no persistent plan mutation occurs until that owner explicitly applies it.
- AC-23: Applying, dismissing, or expiring a proposal produces an owner-visible, actor/timestamped history and cannot affect another owner's trip.
- AC-24: Trip Home deterministically shows a pending unexpired proposal, then a defined confirmed-item gap, then the next dated `planned` or `confirmed` leg, or preparation when no such leg exists; it provides access to the primary conversation and never represents `confirmed` as a booking/provider validation.
- AC-25: A traveler can begin an unscoped natural-language conversation, explicitly accept or decline a server-owned recommendation to save it as a Trip Project, and is not prompted again until planning context materially changes or they ask to save.
- AC-26: A traveler can explicitly continue an unscoped question in one owned Trip Project or keep it private. No project context is attached by default, and private-answer turns do not use that project's constraints.
- AC-27: Traveler-visible loading, unavailable, verification, and failure states use plain Vietnamese and a recovery action without technical status, provider/model, request ID, error-code, source-taxonomy, provenance, retrieval, or audit terminology.

## 14. Risks

- R-1: AI gives fluent but generic answers that do not save users time.
- R-2: Collected internet/Facebook information is incomplete, outdated, or wrong.
- R-3: Web search fallback may produce inconsistent source quality.
- R-4: Sparse initial knowledge may make XuyenViet feel no better than generic AI.
- R-5: Chat/project data retention may create user expectations that need clear product wording.
- R-6: Vietnamese language quality and local nuance may be insufficient if prompts, data, or evaluation are weak.
- R-7: Facebook browser automation may be fragile because page structure, login state, access permissions, and third-party terms can change.
- R-8: AI-first publication can amplify poor extraction or evaluation decisions if retrieval guardrails, quality sampling, and suppression workflows are weak.
- R-9: AI-generated itinerary changes could create false commitments or erase user intent if proposal confirmation, ownership, and version/conflict checks are incomplete.
- R-10: Migrating existing linked conversations to one primary conversation could hide or detach historic context if migration and fallback access are not verified.

## 15. Open Questions

- OQ-1: What web search provider or mechanism will be used?
- OQ-2: Resolved: source detail uses a safe source label and optional safe URL only after a relevant traveler action; internal source/confidence taxonomy never appears in default traveler UI.
- OQ-3: What exact privacy-policy wording is required for AI Gateway-backed chat and trip-project processing?
- OQ-4: What detailed Facebook content reuse policy should govern captured post text retention, operator review, quoting, and deletion beyond provenance and non-official labeling?
- OQ-5: Should AI-generated image output become an MVP workflow, or remain deferred until after text/image-input planning is validated?
- OQ-6: What legal/content-reuse policy permits retention and traveler-visible display of short Facebook-derived evidence quotes and source links?
- OQ-8: Resolved in the architecture: a proposal created from an earlier chat request fails safely when the owner has applied a newer conflicting proposal, and the user can request a refreshed proposal in chat.
