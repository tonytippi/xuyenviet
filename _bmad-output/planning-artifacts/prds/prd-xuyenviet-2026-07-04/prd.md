---
title: XuyenViet AI Travel Information MVP PRD
status: final
created: 2026-07-04
updated: 2026-07-07
---

# XuyenViet AI Travel Information MVP PRD

## 1. Summary

XuyenViet will launch a public-access MVP for Vietnamese-speaking road-trip travelers planning journeys across Vietnam, starting with the Hanoi-to-HCMC corridor. The MVP's primary product surface is **AI Ask**: an authenticated Vietnamese AI chat assistant that helps users plan trips faster by combining chat/trip context, curated travel knowledge cards, and web search fallback when the internal knowledge base is sparse or freshness-sensitive.

The MVP is not a complete travel marketplace, booking product, Google Maps replacement, or AI travel encyclopedia. It is a focused test of whether XuyenViet can give more useful Vietnam road-trip guidance than generic AI by remembering the user, grounding answers in collected sources, and being honest about uncertainty.

## 2. Goals

- Help Vietnamese travelers get useful Vietnam road-trip answers in Vietnamese.
- Reduce the time users spend searching across websites, Facebook posts, service listings, and generic search results.
- Prove that AI Chat with memory and personalization is the right initial product surface.
- Build an operator-controlled knowledge collection workflow that turns raw travel information into approved knowledge cards.
- Make AI answers source-aware, confidence-aware, and explicit when information may be outdated or incomplete.

## 3. Non-Goals

- Nationwide public launch with complete coverage.
- Mobile app.
- Booking, payments, credit wallets, reward balances, referral payouts, ranking-based rewards, or partner transaction flows.
- Affiliate automation or commission-based answer ranking.
- Google Maps integration for the first cut.
- Fully automated scraping at scale.
- Public user submissions as a dependency for first release.
- Complete nationwide coverage.
- Polished standalone UIs for every information category.

## 4. Target Users

### 4.1 Public Traveler

Vietnamese-speaking traveler planning a road trip, often with family members or children, who wants practical help finding routes, stops, places, services, risks, and tips without searching many separate sources.

Initial magic-moment example:

> Toi muon len ke hoach di choi 2 tuan tu ngay nay, di cung 2 con, diem den co the la TP.HCM. Hay tu van giup toi.

### 4.2 Operator

Internal owner or future small operations team member who collects travel information from raw sources, reviews AI extraction, edits knowledge cards, and approves them for AI retrieval.

## 5. Product Principles

- Chat and trip context first: answers should prioritize what the user has told XuyenViet inside the current chat session or selected trip project.
- Curated knowledge second: answers should use approved XuyenViet knowledge cards when relevant.
- Fresh search third: answers may use web search fallback when curated data is missing, sparse, or likely outdated.
- Never fake certainty: collected web/Facebook information may be incomplete or wrong, so answers must expose uncertainty and recommend verification for changing details.
- Practical over generic: useful local tips matter more than polished itinerary prose.
- Family-aware by default when children are part of the trip.

## 6. MVP Scope

### 6.1 Must Have

- AI Ask chat in Vietnamese, with streaming assistant responses after required context/provenance inputs are assembled.
- AI Ask image input for authenticated users, so travelers can ask about relevant road-trip screenshots or photos when supported by the selected Gateway model.
- Google Login required before a user can ask AI.
- Chat sessions and trip projects tied to the logged-in user.
- Chat-level and trip-level context extraction.
- Operator knowledge-card creation and approval flow.
- Retrieval from approved knowledge cards.
- Web search fallback for missing or freshness-sensitive information.
- Source and confidence display in AI answers.
- Initial content focus on Hanoi-to-HCMC road-trip planning.
- OpenAI-compatible AI Gateway-backed AI behavior. [ASSUMPTION: Gateway-routed model processing is acceptable for public MVP data processing under the project's privacy expectations; direct OpenAI API calls are not used.]
- AI Gateway model management for MVP model records, including gateway model name, supported capabilities, and input/output/cache pricing metadata used for usage cost estimation.
- Basic data controls: users can delete a chat session or trip project, which removes the associated messages and trip context from normal use.
- AI usage tracking for authenticated AI requests, so future credit-based pricing can be introduced without changing the AI orchestration flow.

### 6.2 Should Have

- AI-assisted extraction from pasted URLs, text, copied Facebook post content, or images/screenshots.
- Family-aware planning rules for travelers with children.
- Answer quality checks that push responses toward practical tips, risks, and next steps.
- Basic operator roles prepared for future multi-operator workflows. [ASSUMPTION: first release can start with one admin/operator role and expand later.]
- In-answer feedback capture for public MVP quality measurement.
- Referral attribution capture when a new user registers through a referral link, without MVP rewards or payout behavior.

### 6.3 Could Have

- Saved trip threads or named trip plans.
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

### UJ-2: Operator Adds Travel Knowledge

1. Operator opens the admin knowledge area.
2. Operator pastes a source URL, raw text, copied post content, or image/screenshot.
3. AI proposes one or more structured knowledge cards.
4. Operator reviews, edits, tags, and sets confidence/freshness flags.
5. Operator approves the cards.
6. Approved cards become available for AI retrieval.

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
- FR-7: The system shall format travel answers with suggested plan/options, rationale, practical tips, warnings, sources, uncertainty notes, and next steps.

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

### 8.3 Knowledge Cards

- FR-17: The system shall support operator-created knowledge cards.
- FR-18: Each knowledge card shall include title, type, location or route segment, summary, source, collected date, confidence level, tags, and freshness-sensitive flag.
- FR-19: Knowledge card types shall include place, food, hotel area, activity, service, route note, warning, cost note, parking, EV charging, kid-friendly tip, discount/promotion, and general travel tip.
- FR-20: Operators shall be able to create, edit, approve, and archive knowledge cards.
- FR-21: Only approved knowledge cards shall be used for normal AI retrieval.
- FR-22: Knowledge cards shall preserve source provenance enough for users or operators to inspect where the information came from.

### 8.4 Knowledge Collection

- FR-23: Operators shall be able to submit raw source material as URL, raw text, copied post content, or image/screenshot.
- FR-24: The system shall use AI to propose structured knowledge cards from submitted source material.
- FR-25: The system shall require human approval before extracted cards become searchable by AI.
- FR-26: The system shall support confidence labels such as unverified, community, curated, partner, or official. [ASSUMPTION: exact label names can be refined during UX/architecture.]
- FR-27: The system shall allow operators to mark facts as freshness-sensitive when they involve price, schedule, availability, road condition, opening hours, weather, or service status.
- FR-28: The system shall support a minimum public-MVP seed set of 100 approved knowledge cards across the Hanoi-to-HCMC corridor. [ASSUMPTION: 100 is enough to test retrieval quality while remaining feasible for initial public launch.]

### 8.5 Retrieval, Web Search, And Answer Grounding

- FR-29: The system shall retrieve relevant approved knowledge cards for user questions.
- FR-30: The system shall prioritize answer context in this order: selected trip project context, current chat session context, approved XuyenViet knowledge, web search fallback, and general AI knowledge.
- FR-31: The system shall use web search fallback when approved knowledge is missing, sparse, or freshness-sensitive.
- FR-32: The system shall identify when information came from chat/trip context, XuyenViet knowledge cards, web search, or general AI reasoning.
- FR-33: The system shall warn users to verify changing details before acting or booking.
- FR-34: The system shall avoid presenting unverified collected information as guaranteed fact.
- FR-35: Web search results used in answers shall be shown as external/unverified unless reviewed into approved knowledge cards.
- FR-36: The system shall prefer official/provider pages over reposted or unattributed sources when using web search fallback.
- FR-37: Facebook-derived information shall not be treated as official unless it comes from an identifiable official/provider page. [ASSUMPTION: operators may use Facebook content as leads or community tips, but provenance must be retained.]

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
- FR-46: The system shall capture a simple usefulness rating for AI answers during the public MVP.
- FR-47: The system shall record AI usage events for authenticated AI requests, including user, conversation or trip context when applicable, AI purpose, provider/model, timestamp, and available usage/cost metadata.
- FR-48: The system shall capture referral attribution when a new user signs in or registers through a valid referral link, without calculating rewards, ranking, payout, or credit conversion in MVP.
- FR-49: The system shall manage AI Gateway model records with gateway model name, intended purpose, supported input/output capabilities, active status, and input/output/cache pricing metadata.
- FR-50: The system shall use configured model pricing metadata to estimate AI usage cost when provider usage token metadata is available, without creating credit balance or billing behavior in MVP.

## 9. Non-Functional Requirements

- NFR-1: User-facing chat responses should feel responsive enough for interactive planning. [ASSUMPTION: exact latency target to be defined after architecture spikes.]
- NFR-2: The product shall preserve chat sessions and trip projects securely and only for authenticated users.
- NFR-3: The system shall not expose operator-only raw source material or admin controls to normal travelers.
- NFR-4: AI answers shall be auditable enough to identify which knowledge cards or source types influenced the response.
- NFR-5: The system shall support Vietnamese content input, retrieval, and output.
- NFR-6: The MVP shall tolerate sparse internal knowledge by using web search fallback and clearly labeling uncertainty.
- NFR-7: The system shall be designed so Google Maps integration, public submissions, and booking/partner flows can be added later without becoming MVP dependencies.

## 10. MVP Product Contracts

### 10.1 Chat, Trip, And Data Control Contract

- The MVP may store chat and trip context only for travel planning: start city, traveler count, child age range, travel preferences, prior trips, avoided/repeated places, budget range, hotel style, driving tolerance, vehicle/EV needs, food/activity preferences, and current trip details.
- The MVP shall not require or intentionally store children's full names, identity documents, payment data, medical details, exact home address, or other sensitive personal data.
- Context is extracted automatically from chat, and the assistant may refer to chat/trip details when they are relevant.
- Users can correct trip details through chat, for example: "Hay nho rang con toi 8 tuoi, khong phai 6 tuoi."
- Users can delete a chat session or trip project they own. MVP deletion removes the associated messages, trip context, and derived embeddings from normal user-facing and retrieval use.
- Conversation transcripts may be retained only as part of existing chat sessions or trip projects, with access limited to the owning user and authorized operators/admins for operations/debugging.
- OpenAI processing is allowed for public MVP chat, extraction, and response generation only under a configuration that does not train provider models on project data where such setting is available.

### 10.2 Source And Confidence Display Contract

- Answers shall include a compact "Nguon va do tin cay" section when sources or retrieved cards are used.
- MVP source display shall show source title or label, source type, direct URL when available, collected or checked date when available, confidence label, and freshness-sensitive warning when applicable.
- Confidence applies to the source/card, not to every individual claim in MVP.
- Initial confidence labels are fixed for MVP: `unverified`, `community`, `curated`, `partner`, and `official`.
- Web search facts are labeled `unverified` unless later approved into a knowledge card.
- Source details may appear at the end of the answer; inline citation is not required for MVP.

### 10.3 Web Search Fallback Contract

- Provider selection is an architecture decision, but the provider/mechanism must return URL, title, snippet or summary, and enough metadata to show source provenance.
- The selected mechanism must support Vietnamese queries and Vietnamese sources.
- The selected mechanism must allow official/provider-source preference in ranking or post-filtering.
- Web search is triggered when no relevant approved cards are retrieved, fewer than three relevant approved cards are retrieved for a broad planning question, the user asks about freshness-sensitive facts, or retrieved cards conflict.
- If web search fails or confidence is low, AI shall say it cannot verify updated information and recommend user confirmation rather than inventing facts.
- Search-derived information may be used in answers but remains external/unverified until an operator approves it into knowledge cards.

### 10.4 AI Answer Quality Rubric

Public MVP answer evaluation uses a 1-10 score across these dimensions:

- User-context use: answer reflects travelers, children, dates, preferences, prior trips, and constraints.
- Practical specificity: answer includes concrete stops, pacing, services, warnings, or next actions.
- Source grounding: answer identifies which parts came from XuyenViet knowledge, web search, chat/trip context, or general AI reasoning.
- Uncertainty handling: answer flags outdated, changing, sparse, or unverified information.
- Family-awareness: when children are included, answer adapts driving time, activities, rest, hotel area, and risk notes.
- Vietnamese clarity: answer is understandable, natural, and locally appropriate for Vietnamese users.

The first public-MVP evaluation prompt set shall include: the magic-moment family trip question, a sparse-data question, a freshness-sensitive question, a service/activity question, and a route logistics question.

Counter-metrics: track hallucinated unsupported claims, missing uncertainty labels on freshness-sensitive facts, and answers that users rate as no better than generic ChatGPT.

### 10.5 Usage And Referral Readiness Contract

- AI usage tracking is for cost visibility, abuse investigation, and future pricing design; MVP shall not show or enforce credit balances.
- Usage events shall not become the source of truth for chat content or answer provenance.
- AI model pricing metadata is used for internal cost estimation only; MVP shall not expose credit balances, charge users, or block requests for insufficient funds.
- Usage cost estimates must identify the model pricing record or pricing version used when available.
- Cache pricing, if supported by the Gateway/provider, must be tracked separately from ordinary input and output pricing.
- Referral attribution capture stores who referred a new user and the referral code or campaign used when available.
- MVP referral attribution does not create reward liability, payout entitlement, ranking status, or credit conversion.

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

[ASSUMPTION: The first public MVP does not need complete coverage for every province along the route, but it should have enough curated examples to prove the retrieval and answer-quality loop.]

## 12. Success Criteria

- SC-1: At least 7 of 10 sampled public MVP users or test users rate the magic-moment answer as useful, with a score of 7/10 or higher.
- SC-2: At least 7 of 10 test answers include user-context references, practical local tips, and source/confidence notes.
- SC-3: The magic-moment answer includes at least one child-aware planning recommendation, one practical route/logistics tip, one uncertainty or freshness warning, and one suggested next step.
- SC-4: An operator can create or approve at least 100 knowledge cards for the Hanoi-to-HCMC corridor before first public-MVP evaluation.
- SC-5: Approved knowledge cards influence AI answers and are visible in the response provenance.
- SC-6: No more than 2 of 10 test users say the answer feels no better than generic ChatGPT.

## 13. MVP Acceptance Criteria

- AC-1: A Vietnamese user can access the public app entry point, sign in with Google, and then access AI Ask.
- AC-2: The user can ask the magic-moment trip-planning question and receive a Vietnamese answer without first completing a long form.
- AC-3: The answer includes clarifying questions while still providing an initial useful plan.
- AC-4: The answer shows at least three provenance categories when applicable: chat/trip context, XuyenViet knowledge, web search/external source, or general AI reasoning.
- AC-5: The answer clearly labels freshness-sensitive or uncertain information.
- AC-6: The answer incorporates family-aware recommendations when children are mentioned.
- AC-7: The system stores and reuses non-sensitive context within chat sessions and trip projects owned by the authenticated user.
- AC-8: The user can correct trip details through chat and delete chat sessions or trip projects they own.
- AC-9: An operator can submit raw source material, review AI-extracted card drafts, approve cards, and make approved cards retrievable by AI.
- AC-10: At least 100 approved knowledge cards exist for the Hanoi-to-HCMC corridor before first public-MVP evaluation.
- AC-11: Web search fallback is used only when curated knowledge is missing, sparse, or freshness-sensitive, and search-derived facts are labeled as external/unverified.
- AC-12: Public MVP answer feedback is captured for usefulness evaluation.
- AC-13: Source display shows source label/title, source type, URL when available, date when available, confidence label, and freshness warning when applicable.
- AC-14: AI quality evaluation can be run against the five-prompt public-MVP evaluation set using the rubric in this PRD.
- AC-15: Authenticated AI requests create AI usage records with enough metadata to support future cost analysis.
- AC-16: A valid referral link can be captured during sign-in or registration and associated with the new user without exposing referral reward UI.
- AC-17: AI Ask can stream an assistant response after context/provenance preparation without treating partial streamed text as final persisted answer content.
- AC-18: An authenticated user can submit a supported image input with an AI Ask message, and unsupported or invalid images are rejected before provider calls.
- AC-19: Active AI Gateway models can be configured with model name, capability flags, and input/output/cache pricing metadata used by usage tracking.

## 14. Risks

- R-1: AI gives fluent but generic answers that do not save users time.
- R-2: Collected internet/Facebook information is incomplete, outdated, or wrong.
- R-3: Web search fallback may produce inconsistent source quality.
- R-4: Sparse initial knowledge may make XuyenViet feel no better than generic AI.
- R-5: Chat/project data retention may create user expectations that need clear product wording.
- R-6: Vietnamese language quality and local nuance may be insufficient if prompts, data, or evaluation are weak.

## 15. Open Questions

- OQ-1: What web search provider or mechanism will be used?
- OQ-2: Should users see full source URLs directly, summarized source labels, or both?
- OQ-3: What exact privacy-policy wording is required for AI Gateway-backed chat and trip-project processing?
- OQ-4: How should operators handle Facebook content reuse constraints beyond retaining provenance?
- OQ-5: Should AI-generated image output become an MVP workflow, or remain deferred until after text/image-input planning is validated?
