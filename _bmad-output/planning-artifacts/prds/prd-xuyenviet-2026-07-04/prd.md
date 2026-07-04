---
title: XuyenViet AI Travel Information MVP PRD
status: final
created: 2026-07-04
updated: 2026-07-04
---

# XuyenViet AI Travel Information MVP PRD

## 1. Summary

XuyenViet will launch a private beta MVP for Vietnamese-speaking road-trip travelers planning journeys across Vietnam, starting with the Hanoi-to-HCMC corridor. The MVP's single public product surface is **AI Ask**: a Vietnamese AI chat assistant that helps users plan trips faster by combining user memory, curated travel knowledge cards, and web search fallback when the internal knowledge base is sparse or freshness-sensitive.

The MVP is not a complete travel marketplace, booking product, Google Maps replacement, or AI travel encyclopedia. It is a focused test of whether XuyenViet can give more useful Vietnam road-trip guidance than generic AI by remembering the user, grounding answers in collected sources, and being honest about uncertainty.

## 2. Goals

- Help private beta users get useful Vietnam road-trip answers in Vietnamese.
- Reduce the time users spend searching across websites, Facebook posts, service listings, and generic search results.
- Prove that AI Chat with memory and personalization is the right initial product surface.
- Build an operator-controlled knowledge collection workflow that turns raw travel information into approved knowledge cards.
- Make AI answers source-aware, confidence-aware, and explicit when information may be outdated or incomplete.

## 3. Non-Goals

- Full public launch.
- Mobile app.
- Booking, payments, or partner transaction flows.
- Google Maps integration for the first cut.
- Fully automated scraping at scale.
- Public user submissions as a dependency for first release.
- Complete nationwide coverage.
- Polished standalone UIs for every information category.

## 4. Target Users

### 4.1 Private Beta Traveler

Vietnamese-speaking traveler planning a road trip, often with family members or children, who wants practical help finding routes, stops, places, services, risks, and tips without searching many separate sources.

Initial magic-moment example:

> Toi muon len ke hoach di choi 2 tuan tu ngay nay, di cung 2 con, diem den co the la TP.HCM. Hay tu van giup toi.

### 4.2 Operator

Internal owner or future small operations team member who collects travel information from raw sources, reviews AI extraction, edits knowledge cards, and approves them for AI retrieval.

## 5. Product Principles

- User memory first: answers should prioritize what the user has told XuyenViet about travelers, children, preferences, prior trips, constraints, and trip context.
- Curated knowledge second: answers should use approved XuyenViet knowledge cards when relevant.
- Fresh search third: answers may use web search fallback when curated data is missing, sparse, or likely outdated.
- Never fake certainty: collected web/Facebook information may be incomplete or wrong, so answers must expose uncertainty and recommend verification for changing details.
- Practical over generic: useful local tips matter more than polished itinerary prose.
- Family-aware by default when children are part of the trip.

## 6. MVP Scope

### 6.1 Must Have

- AI Ask chat in Vietnamese.
- Google Login for private beta users.
- Persistent user memory tied to the logged-in user.
- Conversation-level trip profile extraction.
- Operator knowledge-card creation and approval flow.
- Retrieval from approved knowledge cards.
- Web search fallback for missing or freshness-sensitive information.
- Source and confidence display in AI answers.
- Initial content focus on Hanoi-to-HCMC road-trip planning.
- OpenAI-backed AI behavior. [ASSUMPTION: OpenAI is acceptable for private beta data processing under the project's privacy expectations.]
- Basic memory privacy controls: consent notice, chat-based correction, deletion request path, and clear labeling that trip preferences are stored for personalization.

### 6.2 Should Have

- AI-assisted extraction from pasted URLs, text, copied Facebook post content, or images/screenshots.
- Family-aware planning rules for travelers with children.
- Answer quality checks that push responses toward practical tips, risks, and next steps.
- Basic operator roles prepared for future multi-operator workflows. [ASSUMPTION: first release can start with one admin/operator role and expand later.]
- In-answer feedback capture for private beta quality measurement.

### 6.3 Could Have

- Saved trip threads or named trip plans.
- Shareable AI answer or itinerary summary.
- Basic feedback buttons on answer usefulness.
- Destination/route summary page generated from knowledge cards.

## 7. User Journeys

### UJ-1: Traveler Asks For A Family Trip Plan

1. User signs in with Google.
2. User opens AI Ask.
3. User asks a broad Vietnamese trip-planning question.
4. AI extracts or updates trip memory: travelers, children, dates, duration, destination, preferences, past trips, budget, and driving tolerance.
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

- FR-1: The system shall provide a Vietnamese chat interface for private beta users.
- FR-2: The system shall allow users to ask broad, underspecified road-trip planning questions.
- FR-3: The system shall respond in Vietnamese by default.
- FR-4: The system shall provide useful initial guidance even when some trip details are missing.
- FR-5: The system shall ask concise follow-up questions when important planning details are missing.
- FR-6: The system shall support iterative refinement across a conversation.
- FR-7: The system shall format travel answers with suggested plan/options, rationale, practical tips, warnings, sources, uncertainty notes, and next steps.

### 8.2 User Authentication And Memory

- FR-8: The system shall support Google Login for private beta users.
- FR-9: The system shall associate persistent memory with the authenticated user.
- FR-10: The system shall extract traveler profile details from chat, including adults, children, children's ages when known, preferences, prior trips, budget, hotel style, driving tolerance, and constraints.
- FR-11: The system shall reuse relevant memory in future answers.
- FR-12: The system shall distinguish current trip context from longer-term user preferences.
- FR-13: The system shall allow users to correct remembered details. [ASSUMPTION: memory correction can be chat-based in MVP rather than a dedicated settings UI.]
- FR-14: The system shall show users a clear notice that trip preferences and conversation-derived memory may be stored to personalize future answers.
- FR-15: The system shall provide a way for users to request deletion of stored memory. [ASSUMPTION: MVP can support this through a simple account/support request workflow rather than a full self-service privacy dashboard.]
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
- FR-28: The system shall support a minimum first-beta seed set of 100 approved knowledge cards across the Hanoi-to-HCMC corridor. [ASSUMPTION: 100 is enough to test retrieval quality while remaining feasible for private beta setup.]

### 8.5 Retrieval, Web Search, And Answer Grounding

- FR-29: The system shall retrieve relevant approved knowledge cards for user questions.
- FR-30: The system shall prioritize answer context in this order: user memory, current trip context, approved XuyenViet knowledge, web search fallback, and general AI knowledge.
- FR-31: The system shall use web search fallback when approved knowledge is missing, sparse, or freshness-sensitive.
- FR-32: The system shall identify when information came from memory, XuyenViet knowledge cards, web search, or general AI reasoning.
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

### 8.7 Private Beta Operations

- FR-42: The system shall restrict access to private beta users. [ASSUMPTION: MVP uses a simple email allowlist with Google Login.]
- FR-43: The system shall provide an operator/admin area separate from traveler chat.
- FR-44: The system shall support at least one admin/operator account for initial knowledge management.
- FR-45: The system shall allow future expansion to multiple operators without redesigning the knowledge workflow.
- FR-46: The system shall capture a simple usefulness rating for AI answers during private beta.

## 9. Non-Functional Requirements

- NFR-1: User-facing chat responses should feel responsive enough for interactive planning. [ASSUMPTION: exact latency target to be defined after architecture spikes.]
- NFR-2: The product shall preserve user memory securely and only for authenticated users.
- NFR-3: The system shall not expose operator-only raw source material or admin controls to normal travelers.
- NFR-4: AI answers shall be auditable enough to identify which knowledge cards or source types influenced the response.
- NFR-5: The system shall support Vietnamese content input, retrieval, and output.
- NFR-6: The MVP shall tolerate sparse internal knowledge by using web search fallback and clearly labeling uncertainty.
- NFR-7: The system shall be designed so Google Maps integration, public submissions, and booking/partner flows can be added later without becoming MVP dependencies.

## 10. MVP Product Contracts

### 10.1 Memory And Privacy Contract

- The MVP may store travel-personalization memory only: home/start city, traveler count, child age range, travel preferences, prior trips, avoided/repeated places, budget range, hotel style, driving tolerance, vehicle/EV needs, food/activity preferences, and current trip context.
- The MVP shall not require or intentionally store children's full names, identity documents, payment data, medical details, exact home address, or other sensitive personal data.
- Memory is extracted automatically from chat, but AI must make remembered facts visible in conversation when it uses or updates them.
- Users can correct memory through chat, for example: "Hay nho rang con toi 8 tuoi, khong phai 6 tuoi."
- Users can request memory deletion through chat or a simple support/account request path. MVP deletion means deleting stored profile memory and derived memory embeddings; full conversation transcript deletion may be handled as an admin request during private beta. [ASSUMPTION: final deletion propagation rules will be confirmed in architecture before implementation.]
- Conversation transcripts may be retained during private beta for product quality and debugging, with access limited to authorized operators/admins. [ASSUMPTION: retention period is 90 days unless changed by privacy review.]
- OpenAI processing is allowed for private beta chat, extraction, and response generation only under a configuration that does not train provider models on project data where such setting is available.

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

Private beta answer evaluation uses a 1-10 score across these dimensions:

- User-context use: answer reflects travelers, children, dates, preferences, prior trips, and constraints.
- Practical specificity: answer includes concrete stops, pacing, services, warnings, or next actions.
- Source grounding: answer identifies which parts came from XuyenViet knowledge, web search, memory, or general AI reasoning.
- Uncertainty handling: answer flags outdated, changing, sparse, or unverified information.
- Family-awareness: when children are included, answer adapts driving time, activities, rest, hotel area, and risk notes.
- Vietnamese clarity: answer is understandable, natural, and locally appropriate for Vietnamese users.

The first beta evaluation prompt set shall include: the magic-moment family trip question, a sparse-data question, a freshness-sensitive question, a service/activity question, and a route logistics question.

Counter-metrics: track hallucinated unsupported claims, missing uncertainty labels on freshness-sensitive facts, and answers that beta users rate as no better than generic ChatGPT.

## 11. Initial Data Scope

The private beta should focus on the Hanoi-to-HCMC road-trip corridor. Initial knowledge should prioritize information that makes AI answers practically useful:

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

[ASSUMPTION: The first beta does not need complete coverage for every province along the route, but it should have enough curated examples to prove the retrieval and answer-quality loop.]

## 12. Success Criteria

- SC-1: At least 7 of 10 private beta test users rate the magic-moment answer as useful, with a score of 7/10 or higher.
- SC-2: At least 7 of 10 test answers include user-context references, practical local tips, and source/confidence notes.
- SC-3: The magic-moment answer includes at least one child-aware planning recommendation, one practical route/logistics tip, one uncertainty or freshness warning, and one suggested next step.
- SC-4: An operator can create or approve at least 100 knowledge cards for the Hanoi-to-HCMC corridor before first beta evaluation.
- SC-5: Approved knowledge cards influence AI answers and are visible in the response provenance.
- SC-6: No more than 2 of 10 test users say the answer feels no better than generic ChatGPT.

## 13. MVP Acceptance Criteria

- AC-1: A Vietnamese private beta user can sign in with Google and access AI Ask.
- AC-2: The user can ask the magic-moment trip-planning question and receive a Vietnamese answer without first completing a long form.
- AC-3: The answer includes clarifying questions while still providing an initial useful plan.
- AC-4: The answer shows at least three provenance categories when applicable: user memory/current trip context, XuyenViet knowledge, web search/external source, or general AI reasoning.
- AC-5: The answer clearly labels freshness-sensitive or uncertain information.
- AC-6: The answer incorporates family-aware recommendations when children are mentioned.
- AC-7: The system stores and reuses non-sensitive trip preferences for the authenticated user.
- AC-8: The user can correct remembered information through chat and can request memory deletion.
- AC-9: An operator can submit raw source material, review AI-extracted card drafts, approve cards, and make approved cards retrievable by AI.
- AC-10: At least 100 approved knowledge cards exist for the Hanoi-to-HCMC corridor before first beta evaluation.
- AC-11: Web search fallback is used only when curated knowledge is missing, sparse, or freshness-sensitive, and search-derived facts are labeled as external/unverified.
- AC-12: Private beta answer feedback is captured for usefulness evaluation.
- AC-13: Source display shows source label/title, source type, URL when available, date when available, confidence label, and freshness warning when applicable.
- AC-14: AI quality evaluation can be run against the five-prompt beta evaluation set using the rubric in this PRD.

## 14. Risks

- R-1: AI gives fluent but generic answers that do not save users time.
- R-2: Collected internet/Facebook information is incomplete, outdated, or wrong.
- R-3: Web search fallback may produce inconsistent source quality.
- R-4: Sparse initial knowledge may make XuyenViet feel no better than generic AI.
- R-5: Memory and personalization may create privacy expectations that need clearer policy.
- R-6: Vietnamese language quality and local nuance may be insufficient if prompts, data, or evaluation are weak.

## 15. Open Questions

- OQ-1: What web search provider or mechanism will be used?
- OQ-2: Should users see full source URLs directly, summarized source labels, or both?
- OQ-3: What exact privacy-policy wording is required for OpenAI-backed memory and chat processing?
- OQ-4: How should operators handle Facebook content reuse constraints beyond retaining provenance?
