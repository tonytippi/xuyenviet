---
title: XuyenViet AI Travel Information MVP PRD
status: final
created: 2026-07-04
updated: 2026-08-17
---

# XuyenViet AI Travel Information MVP PRD

## 1. Summary

XuyenViet will launch a public-access MVP primarily for Vietnamese people planning domestic road trips, with supported route-planning coverage initially focused on the Hanoi-to-HCMC corridor. The MVP's primary product surface is **AI Ask**: an authenticated Vietnamese AI chat assistant that helps users plan trips faster by combining the current conversation or explicitly selected Trip Project, active travel knowledge, and scoped web verification when a required planning need is missing or freshness-sensitive.

The MVP is not a complete travel marketplace, booking product, Google Maps replacement, or AI travel encyclopedia. It is a focused test of whether XuyenViet can give more useful Vietnam road-trip guidance than generic AI by remembering the user, grounding answers in collected sources, and being honest about uncertainty.

## 2. Goals

- Help Vietnamese travelers get useful Vietnam road-trip answers in Vietnamese.
- Reduce the time users spend searching across websites, Facebook posts, service listings, and generic search results.
- Prove that AI Chat with memory and personalization is the right initial product surface.
- Turn an approved trip direction into a user-controlled, structured road-trip plan rather than leaving important decisions only in chat history.
- Build an AI-first knowledge collection workflow that turns raw travel information into evidence-grounded provisional knowledge, while routing only risky or uncertain claims to operators.
- Reduce operator effort spent finding useful Vietnam road-trip video sources without creating an automatic capture or publication pipeline.
- Make AI answers evidence-aware and explicit, in practical traveler language, when information may be outdated, incomplete, outside supported coverage, or unable to be verified.
- Keep answers aligned with the exact owner-confirmed Trip plan while allowing travelers to explore changes safely before deciding whether to apply them.

## 3. Non-Goals

- Nationwide route-planning coverage.
- Mobile app.
- Booking, payments, credit wallets, reward balances, referral payouts, ranking-based rewards, or partner transaction flows.
- Affiliate automation or commission-based answer ranking.
- Google Maps integration for the first cut.
- Fully automated scraping at scale or bypassing third-party access controls.
- YouTube browser or transcript scraping, video download or storage, automatic Knowledge source creation, automatic Gemini capture, or a second knowledge-publication lifecycle.
- Public user submissions as a dependency for first release.
- Polished standalone UIs for every information category.
- Weather, current-location sharing, Google Maps/Places/Routes, booking, OTA enrichment, budget tracking, packing/checklists, travel vault, and collaboration in the Trip Planning Foundation tranche.

## 4. Target Users

### 4.1 Public Traveler

Vietnamese person planning a domestic road trip, often with family members or children, who wants practical Vietnamese-language help grounded in the context of driving and traveling within Vietnam without searching many separate sources. This is the actual primary MVP audience; content merely being about Vietnam does not make it suitable for this user.

Initial magic-moment example:

> Toi muon len ke hoach di choi 2 tuan tu ngay nay, di cung 2 con, diem den co the la TP.HCM. Hay tu van giup toi.

### 4.2 Operator

Internal owner or future small operations team member who collects travel information from raw sources, manages bounded source Discovery, reviews AI-flagged candidates and claims, edits knowledge cards, and can approve, suppress, or verify knowledge after it is active.

## 5. Product Principles

- Current conversation or selected Trip Project first: an unscoped answer uses only its conversation context; a Trip-scoped answer uses the exact owner-confirmed Trip state as planning authority. Chat text may request or explore a change but does not silently override that state.
- XuyenViet knowledge second: answers should use active evidence-grounded knowledge cards when relevant, and communicate each card's source, state, and uncertainty.
- Scoped fresh search third: answers may use web search when a required planning need lacks applicable evidence, when a relevant detail is freshness-sensitive, or when current evidence cannot support a safe factual premise.
- Never fake certainty: collected web/Facebook information may be incomplete or wrong, so answers must expose uncertainty and recommend verification for changing details.
- Practical over generic: useful local tips matter more than polished itinerary prose.
- Vietnamese users first: discovery and guidance optimize for usefulness to Vietnamese people, Vietnamese-language content, and Vietnamese/local road-user context. Foreign-language sources are a bounded fallback for unique value, not the default content pool.
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
- Persisted, inspectable provenance with traveler-safe verification guidance and progressive source disclosure when useful.
- Initial content focus on Hanoi-to-HCMC road-trip planning.
- OpenAI-compatible AI Gateway-backed AI behavior. [ASSUMPTION: Gateway-routed model processing is acceptable for public MVP data processing under the project's privacy expectations; direct OpenAI API calls are not used.]
- AI Gateway model management for MVP model records, including gateway model name, supported capabilities, and input/output/cache pricing metadata used for usage cost estimation.
- Owner-controlled deletion for chats and Trip Projects, including invalidation of derived context that could otherwise reconstruct deleted traveler content.
- AI usage tracking for authenticated AI requests, so future credit-based pricing can be introduced without changing the AI orchestration flow.
- Trip Planning Foundation: structured trip anchors, dated legs and activities, traveler constraints, and item states `idea`, `planned`, `confirmed`, or `backup`.
- One primary conversation per Trip Project after a safe migration from existing linked conversations.
- A basic Trip Home that presents the next planning focus and primary conversation without hiding prior chat history.
- Structured, expiring Trip Change Proposals that a user can apply, dismiss, or leave pending; every applied change has actor and timestamp history.
- Bounded YouTube URL Discovery for operators: managed query proposals, scheduled documented-API discovery, safe metadata triage, deterministic candidate recommendations, audited review decisions, and an action-first operations control tower that hands accepted URLs to the existing Knowledge intake workflow without starting capture.

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
4. AI extracts or updates context for the current conversation or explicitly selected Trip Project: travelers, children, dates, duration, destination, preferences, budget, and driving tolerance. Context from another trip is used only after the traveler explicitly selects or links it.
5. AI asks a small number of clarifying questions when needed, but still gives a useful initial answer.
6. AI retrieves relevant knowledge cards for the Hanoi-to-HCMC corridor.
7. AI uses scoped web search for required planning needs that lack applicable evidence or require fresh verification.
8. AI returns a structured Vietnamese answer with plan options, child-aware tips, practical verification guidance, progressive source detail when useful, and next steps.
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

### UJ-4: Traveler Explores A Route Change Without Changing The Current Plan

1. A traveler opens an owned Trip Project whose current plan and route choices have already been confirmed.
2. The traveler asks a hypothetical question such as whether adding a detour would improve the trip.
3. XuyenViet keeps the current confirmed plan as the baseline and clearly presents the detour as an exploration rather than the current route.
4. Retrieval and fresh verification use the proposed scope only for the comparison and expose any unsupported, freshness-sensitive, or outside-coverage parts.
5. The traveler may ask XuyenViet to draft a structured change proposal; closing, dismissing, or leaving that proposal pending does not change later current-plan answers.
6. Only an explicit owner Apply action changes the Trip Project and the planning context used in subsequent answers.

### UJ-5: Traveler Asks About A Partial, Ambiguous, Or Unsupported Route

1. A traveler asks about a route that has incomplete supported coverage or materially different route alternatives.
2. XuyenViet returns any safe place-level, endpoint, or general guidance that remains applicable.
3. It identifies the unsupported or ambiguous part in traveler language and does not claim end-to-end route applicability.
4. When the material answer depends on a route choice, XuyenViet presents bounded alternatives or asks one concise clarification while still providing invariant useful guidance.
5. Unresolved external results remain verification leads and do not become factual premises for the route.

### UJ-6: Operator Discovers And Reviews A Useful YouTube URL

1. An authorized operator opens Knowledge Mission and sees bounded coverage summaries grouped by current province or centrally governed city, with legacy province names retained as searchable references.
2. The system combines safe Knowledge coverage by geography and topic with safe aggregated traveler demand when available. Bounded AI proposes a knowledge need, concise reason, and natural Vietnamese YouTube query without receiving raw Knowledge, source, or traveler content.
3. The operator accepts, edits, dismisses, or replaces the suggestion with an operator-authored query. No AI suggestion starts Discovery without this operator decision.
4. While Discovery is enabled, an accepted or operator-authored query is queued immediately rather than waiting for its next scheduled cadence. The operator can inspect safe run and candidate-processing status until results are ready.
5. Documented YouTube metadata APIs find canonical individual-video URLs, and bounded AI metadata triage plus deterministic policy produce ranked `skip`, `defer`, or `consider` recommendations without treating video metadata or comments as evidence.
6. The operator reviews one candidate with its safe context and chooses Accept, Defer, or Skip through an audited command.
7. Accept submits the canonical URL to the existing Knowledge intake API. Discovery neither creates nor owns the resulting Knowledge source and does not start `youtube:capture` or Gemini video analysis.

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
- FR-10: The system shall extract travel-relevant details from the current conversation or explicitly selected Trip Project, including adults, children, children's ages when known, preferences, budget, hotel style, driving tolerance, and constraints. It shall not automatically use another trip's details unless the traveler explicitly selects or links that trip.
- FR-11: The system shall reuse relevant context within the current conversation or exact owner-confirmed state of the explicitly selected Trip Project.
- FR-12: The system shall distinguish transient conversation intent from the Trip Project's confirmed structured state; conversation text, an AI answer, and a pending, dismissed, or expired proposal shall not become a competing itinerary source of truth.
- FR-13: The system shall allow users to correct trip details through normal chat messages.
- FR-14: The system shall show users a clear notice that chat and trip details may be stored to support the current session or trip project.
- FR-15: The system shall allow owners to delete an ordinary chat or Trip Project. Ordinary-chat deletion shall not mutate an unrelated Trip plan; Trip deletion shall remove its structured state from normal use and invalidate derived retrieval or planning context that could reconstruct it. Deleting a primary conversation shall follow an explicit replacement-or-Trip-deletion flow and shall not implicitly orphan or erase a live confirmed plan.
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
- FR-16M: For each Trip-scoped answer, the system shall distinguish whether the traveler is asking about the current plan, exploring a hypothetical change, reviewing or validating a pending proposal, or asking outside the Trip. If ambiguity would materially change the answer, it shall ask one concise clarification while still providing any invariant useful guidance.
- FR-16N: In a current-plan answer, only applied Trip Project state shall be planning authority. A hypothetical request or pending, dismissed, expired, stale, or foreign proposal shall not be represented as the current plan.
- FR-16O: A Trip Project shall be able to preserve an owner-selected canonical route or path for a relevant leg with an explicit item state. Free-text route descriptions may be resolved for exploration or proposal drafting but become durable route authority only after an owner-confirmed proposal is applied.
- FR-16P: Exploring an alternate route, stop, or constraint shall preserve the confirmed plan as the comparison baseline. The system may draft a typed proposal, but only a successful owner Apply action may change the route or constraints used by subsequent current-plan answers.
- FR-16Q: If a stored route reference can no longer be interpreted with the same material meaning, the system shall fail safely and ask the owner to review or refresh it; it shall not silently select a different route.

### 8.3 Knowledge Cards

- FR-17: The system shall support operator-created knowledge cards.
- FR-18: Each knowledge card shall include title, type, location or route segment, summary, source, collected date, confidence level, tags, and freshness-sensitive flag.
- FR-18A: Each AI-extracted community claim shall preserve a short evidence quote, validated source-text span, source link when available, capture date, observed date when known, and identified conditions before it can be active for retrieval.
- FR-18B: The system shall not retain or expose personally identifying or sensitive content in traveler-visible facts or evidence quotes. Direct Facebook-derived quotes and captured text remain operator-only in the public MVP; traveler surfaces may use a XuyenViet-authored paraphrase and practical verification guidance. A canonical Facebook source link may appear only when the source is publicly accessible without authentication or group membership, passes URL-safety policy, and is not subject to a validated removal request.
- FR-18C: Knowledge cards shall preserve validated, bounded practical details needed for traveler guidance. A `route_note` may preserve `ordered_stops` in source order, including intentional repeated stops.
- FR-18D: The public product shall publish a content-removal contact channel. A credible Facebook source, rights-holder, privacy, or safety request shall hide the affected traveler source link while an authorized operator validates it; a validated request shall invoke the existing source-removal and dependent-knowledge re-evaluation contract.
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
- FR-23C: For each immutable Facebook capture version, the operator capture queue shall distinguish technical processing progress from candidate publication outcomes. A completed source may contain mixed candidate results, including candidates that need operator action, without misrepresenting the source as wholly published or rejected.
- FR-24: The system shall use AI to triage submitted source material, discover structured scoped candidates, and independently validate each publishable claim against an exact evidence span from the immutable source. AI-proposed evidence locations shall not be accepted when they cannot be matched uniquely and safely to that source.
- FR-24A: The system shall classify AI-triaged source material as rejected, context-only, or candidate-bearing, and shall retain candidate AI disposition and decision reasons for audit and quality evaluation.
- FR-24B: The system shall use an independent AI evaluation step to decide whether an extracted candidate receives `apply`, `needs_operator`, or `discard`; the extractor shall not be the sole publication decision-maker.
- FR-24C: The system shall discover and process every independently useful atomic claim supported by a submitted immutable source version; it shall not discard otherwise qualifying claims merely because a source contains many claims or a prior sibling claim was accepted.
- FR-24D: The system shall give each discovered candidate an independent, auditable processing result and immutable AI disposition and reason when completed; failed candidates shall have no business disposition. A source completes only after discovery is terminal and every candidate has completed or failed, and may complete successfully with mixed dispositions or when no candidate is applied.
- FR-24E: When a newer source capture supersedes an earlier immutable version, work from the earlier version shall not create, attach, conflict with, or otherwise mutate active knowledge. Historical ingestion behavior shall remain intelligible when newer ingestion capabilities are introduced.
- FR-24F: For a source describing an itinerary, the system shall preserve a route note's source-order stop sequence, including intentional repeats, and shall extract each independently useful scoped observation about a named place, venue, or route option as a sibling candidate. Bare stop labels alone shall not become knowledge-card candidates.
- FR-25: The system shall make a claim searchable without human approval only when it has validated evidence, sufficient travel specificity and actionability, no sensitive content, no high commercial/spam risk, and no unresolved high-risk conflict.
- FR-25A: The system shall create risk-prioritized operator work, not a mandatory approval gate, for verification, relation, risk, or missing-context decisions. An authorized operator may publish, revise and requeue, or suppress a card with available validated evidence without changing the candidate's original AI disposition. Stale or superseded work shall have no mutation effect, and an active card shall have no unresolved primary operator work.
- FR-25B: The system shall support quality sampling of active claims so operators can measure false-positive publication without delaying normal ingestion. Sampling is quality monitoring rather than publication approval and remains separate from actionable operator work. A high-severity sampling failure shall contain the affected cohort without changing unrelated knowledge.
- FR-26: The system shall preserve machine-readable source classification, verification state, evidence support, freshness, and provenance for policy, audit, and traveler-safe wording. These internal fields shall not be exposed as default traveler confidence labels.
- FR-27: The system shall allow operators to mark facts as freshness-sensitive when they involve price, schedule, availability, road condition, opening hours, weather, or service status.
- FR-28: The system shall support a minimum public-MVP seed set of 100 active knowledge cards across the Hanoi-to-HCMC corridor. [ASSUMPTION: 100 is enough to test retrieval quality while remaining feasible for initial public launch.]
- FR-28A: Authorized operators shall have an aggregate-only seed-coverage report that counts only active Hanoi-to-HCMC cards with complete retrieval metadata and valid bounded evidence from eligible retained sources. It shall show taxonomy and route/location gaps, including zero-count buckets; distinguish countable community observations or patterns from caveat-only material; and surface current review, verification, source, and recommendation work without exposing raw capture content, URLs, quotes, provider payloads, or removal internals.

### 8.5 Retrieval, Web Search, And Answer Grounding

- FR-29: The system shall retrieve relevant cards only when `lifecycle_state = active`, current evidence is eligible, and domain classification and verification requirement permit the requested use.
- FR-30: The system shall first determine whether the turn is unscoped, about the applied current Trip plan, exploring a change, or reviewing a proposal. It shall then assemble only the context authorized for that mode before using applicable active XuyenViet knowledge, scoped web verification, and general AI knowledge. It shall not resolve conflicts through a precedence rule between Trip state and chat text.
- FR-31: The system shall use web search when a required planning need has no applicable active evidence, when a relevant fact requires fresh verification, or when pending, conflicted, or otherwise ineligible knowledge leaves a material evidence gap. Card count alone shall not determine whether evidence is sufficient.
- FR-32: The system shall persist and make auditable whether answer information came from chat/trip context, XuyenViet knowledge cards, web search, or general AI reasoning. This classification is not default traveler-facing copy.
- FR-32A: Persisted provenance shall distinguish evidence made available to answer generation from evidence materially attributed to the completed answer. Attribution shall resolve only to evidence available for that same answer and shall never invent a source.
- FR-32B: Missing or malformed material-attribution output shall not invalidate an otherwise safe answer, but it shall not create material attribution or traveler source detail that the system cannot validate.
- FR-33: The system shall warn users to verify changing details before acting or booking.
- FR-34: The system shall avoid presenting unverified collected information as guaranteed fact.
- FR-35: Web information used in an answer shall retain external provenance and practical verification guidance and shall never be implied to be confirmed merely because it is displayed. A route- or place-specific web fact may be used as a factual premise only when its applicable geography and time resolve consistently with the current planning need; an unresolved or mismatched result remains a verification lead and does not satisfy that need.
- FR-61: Retrieval shall evaluate applicable evidence against explicit required planning needs. Multiple items covering the same need shall not conceal a missing route, safety, family, vehicle, stop, or other required need, and unrelated evidence shall not be used to make an answer appear complete.
- FR-62: When available evidence or response capacity cannot cover every required planning need, the system shall prioritize consequential route, safety, and traveler constraints; provide any safe useful partial guidance; identify the uncovered need concisely; and offer a permitted clarification or verification action instead of silently omitting it.
- FR-63: The product shall communicate its supported route-planning coverage in traveler language. Outside supported coverage, it may provide clearly scoped endpoint, place, general, or external-reference guidance, but shall not claim end-to-end route applicability.
- FR-64: For routes with no supported path, partial supported coverage, or materially ambiguous alternatives, the system shall provide bounded useful behavior appropriate to that condition and shall not use incomplete coverage, nationwide advice, source prestige, or text similarity to manufacture route authority.
- FR-65: A recent warning may be presented with its source, applicable place/time, and practical verification action, but shall not be stated as live closure, traffic, navigation, or guaranteed route-safety authority unless an approved live-data capability supports that claim.
- FR-36: The system shall prefer official/provider pages over reposted or unattributed sources when using web search fallback.
- FR-37: Facebook-derived information shall not be treated as official unless it comes from an identifiable official/provider page. In the public MVP, direct Facebook evidence quotes and captured text are operator-only; traveler answers may use a safe XuyenViet-authored paraphrase with provenance-aware verification guidance and a canonical source link only under the public-access, URL-safety, and removal conditions in FR-18B.
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
- FR-49A: Exact administrators shall be able to create, update, set one eligible active default per purpose, and archive AI Gateway model records without deletion. Each pricing record shall be versioned, effective-dated, currency-specific, deterministic, and non-negative; archived records shall not be defaults, and credentials and provider payloads shall not be exposed.
- FR-50: The system shall use configured model pricing metadata to estimate AI usage cost when provider usage token metadata is available, without creating credit balance or billing behavior in MVP.
- FR-51: The system shall expose versioned domain API contracts for traveler, operator, and future client surfaces without dependence on one presentation framework's internal transport or session representation.
- FR-52: Traveler and operator clients shall use the protected versioned API without receiving database credentials or internal service credentials.
- FR-53: The system shall provide a separately deployed operator/admin application with its own origin and release lifecycle that uses the protected API without database credentials or direct domain imports.
- FR-54: The system shall authorize every protected API read and command against the current authenticated principal and current authorization state.
- FR-55: The system shall provide a stable API error contract with machine-readable code, safe message, request/correlation ID, and applicable safe field violations without sensitive internals.
- FR-56: The system shall document versioned health/version and protected-capability API contracts, including validation, authorization, ownership, pagination/stable ordering, streaming semantics where applicable, and browser-session/CSRF admission requirements.
- FR-57: The system shall run continuous and scheduled background work independently from traveler request handling, with bounded execution, safe recovery, and idempotent outcomes.
- FR-57A: Post-answer enrichment may add derived context, answer annotations, or user-confirmable proposal actions, but shall not change completed answer text, terminal command outcome, initial provenance, or successful-answer usage.
- FR-58: The system shall preserve one writer per aggregate command during migration and never dual-write product state.
- FR-59: AI Ask streaming through the versioned API shall preserve preparation, incremental delivery, explicit completion or failure, disconnect tolerance, and atomic terminal persistence.
- FR-59A: Provider-specific stream completion variations may be accepted only when the response is well-formed, contains usable answer content, and contains no provider-declared or parsing failure; an ambiguous or malformed completion fails safely.
- FR-60: Before public launch, the system shall retire superseded authentication, domain-transport, writer, and operator surfaces so every protected capability has one current owner and no legacy mutation path remains active.

### 8.8 YouTube Discovery

- FR-66: The system shall generate and refresh scoped YouTube Discovery query proposals from knowledge coverage gaps, freshness risk, unresolved conflicts, and safe aggregated traveler-demand signals, and shall support operator-created queries in the same governed workflow. It shall also provide operator-guided proposals from bounded Knowledge coverage summaries grouped by current province or centrally governed city and topic. Bounded AI may propose a knowledge need, concise reason, and natural Vietnamese query from those summaries, but shall not receive raw Knowledge, source, or traveler content and shall not start Discovery without operator confirmation. System-generated provider queries shall translate geography, taxonomy, and planning need into natural Vietnamese; raw internal English taxonomy labels shall never be sent unchanged to the provider.
- FR-67: Authorized operators shall be able to inspect a query's origin, reason, priority, text, current or latest safe run status, candidate-processing progress, schedule context, and enabled or paused state; accept, edit, or dismiss an AI proposal; and create, edit, reprioritize, pause, or resume operator-managed queries.
- FR-68: An authorized operator shall be able to enable or disable Discovery globally. Disabling stops new Discovery planning, search, enrichment, triage, provider calls, and writes safely; it shall not alter queued Knowledge sources, completed knowledge, or manual `youtube:capture` work.
- FR-69: While permitted by global and query policy, the system shall run bounded Vietnamese-first discovery through documented YouTube Data API capabilities and deduplicate eligible individual public videos into canonical URL candidates without downloading or storing video media. Operator-confirmed or operator-authored queries shall enqueue an immediate run without waiting for the next scheduled cadence; scheduled recurrence remains a separate governed option. Provider region and language parameters are ranking hints, not proof of Vietnamese-language or Vietnamese-user fit.
- FR-70: Candidate enrichment shall retain only bounded safe video/channel metadata, exact duration, default metadata/audio language where available, a versioned language-fit result, and closed derived comment signals needed for triage. Comments shall never become evidence, capture material, knowledge cards, retrieval input, or traveler content.
- FR-71: The system shall apply deterministic language/audience-fit and minimum-useful-duration eligibility before downstream AI metadata triage and primary review, then validate bounded AI triage and combine it with deterministic ranking policy to produce `skip`, `defer`, or `consider` recommendations. A score, popularity signal, or model output shall not override a failed hard gate and shall not establish factual correctness, credibility, evidence, or publication eligibility.
- FR-72: Authorized operators shall receive a ranked, one-at-a-time Vietnamese-first candidate review experience with safe metadata including channel, duration, view count, publish time, language fit, originating query, and decision reason; a plain-language recommendation; concise factors and penalties; bounded derived signals; and prior safe capture outcome when available. Foreign-language fallback shall be bounded and visibly separated from the primary review pool, while too-short and primary-language-ineligible candidates shall not enter Action Required or primary review.
- FR-73: Authorized operators shall be able to Accept, Defer, or Skip a candidate through role-protected, audited commands. A failed or unknown result remains recoverable and shall not claim that a Knowledge source or capture exists.
- FR-74: Accept shall submit only the canonical URL to the existing Knowledge intake API and shall record success only after a submitted or duplicate intake result. Discovery shall not create or own a Knowledge source, capture version, ingestion job, evidence, card, or publication state and shall never invoke, schedule, or retry manual `youtube:capture` or Gemini video analysis.
- FR-75: The Discovery control tower shall prioritize Action Required rather than a KPI dashboard and shall provide Knowledge Mission views for coverage needs, queries, candidates, and funnel progress plus Automation Health views for enablement, schedule, backlog, persistent incidents, telemetry freshness, and safe affected-record detail.
- FR-76: Discovery may route high-impact verification or conflict work to the existing Knowledge operator surface but shall not verify, publish, suppress, or otherwise change Knowledge claims.
- FR-77: Discovery shall retain only safe candidate, audit, and deduplication metadata under policy-controlled retention with 180 days as the initial default and shall retain derived comment signals for a shorter policy-controlled period. Retention changes shall not turn those signals into evidence or traveler content.
- FR-78: Discovery shall use only documented YouTube APIs and bounded metadata processing. It shall not introduce browser scraping, undocumented APIs, transcript scraping, video downloads, media persistence, raw comment retention, or an automatic video-analysis path.

## 9. Non-Functional Requirements

- NFR-1: User-facing chat responses should feel responsive enough for interactive planning. [ASSUMPTION: exact latency target to be defined after architecture spikes.]
- NFR-2: The product shall preserve chat sessions and trip projects securely and only for authenticated users.
- NFR-3: The system shall not expose operator-only raw source material or admin controls to normal travelers.
- NFR-4: AI answers shall be auditable enough to identify which knowledge cards or source types influenced the response.
- NFR-5: The system shall support Vietnamese content input, retrieval, and output.
- NFR-6: The MVP shall tolerate incomplete internal knowledge through required-need-aware web verification, useful partial answers, and concise practical limitation wording without substituting unrelated evidence.
- NFR-7: The system shall be designed so Google Maps integration, public submissions, and booking/partner flows can be added later without becoming MVP dependencies.
- NFR-8: Browser automation for Facebook capture shall run as an operator-controlled operations tool, not as public request-path app logic or unattended mass crawling.
- NFR-9: Active AI-extracted claims shall remain auditable through their immutable AI disposition, later operator-work resolution where applicable, evidence, source, lifecycle state, and audit history.
- NFR-9A: Source ingestion shall make bounded progress through large source material without imposing a maximum accepted-fact quota. Retry, interruption, duplicate delivery, and supersession shall not duplicate candidate outcomes or permit obsolete work to change current knowledge, and processing progress shall not misrepresent mixed candidate business outcomes.
- NFR-9B: Source removal completes only after removed evidence is no longer traveler-eligible and every dependent card has been safely re-evaluated against remaining support. Retrieval shall fail closed rather than use withdrawn or stale evidence while derived search state catches up.
- NFR-10: Trip Project reads and mutations, including primary-conversation access, structured plan data, proposals, and history, shall remain owner-scoped until a separately approved collaboration model exists.
- NFR-11: Applying a Trip Change Proposal shall validate the proposal belongs to the selected Trip Project, is still applicable, and is authorized for the owner before writing an auditable change.
- NFR-12: Public-facing, operator, API, background, and migration workloads shall support staged release with least-privilege configuration, explicit health contracts, and schema changes applied before dependent traffic.
- NFR-13: Operational health shall distinguish a running process from one ready to serve its assigned capability; shutdown shall stop new work and safely complete or release work already claimed.
- NFR-14: Safe structured telemetry shall correlate authenticated admission, API, background, and provider operations without exposing traveler content, credentials, or provider payloads.
- NFR-15: Client-to-API and database traffic shall remain private and origin-controlled; environments shall use isolated credentials, data, authentication configuration, and observability.
- NFR-16: Destructive reset or reseed is permitted only for explicitly disposable targets under repository safeguards. Once durable shared or customer data exists, every schema change shall use an approved forward migration with tested handling for affected persisted data and no destructive rollback.
- NFR-17: Before retiring a legacy background execution path, its replacement operations evidence shall demonstrate acceptable progress, retry, recovery, concurrency, and restart behavior.
- NFR-18: Before public launch, the project shall approve deployment ownership, domains and authentication callbacks, secrets, backup/restore, monitoring, alerting, and on-call responsibility and shall pass the corresponding launch-capacity and recovery checks.
- NFR-19: Discovery commands, read models, automated execution, AI usage, and retention shall be attributable and role-protected while exposing only bounded safe operational information. Raw comments, prompts/responses, provider payloads, credentials, source material, evidence, and traveler content shall not appear in Discovery records, logs, or operator projections.
- NFR-20: The Discovery control tower shall meet the project's operator accessibility and responsive-use standards, including keyboard operation, visible focus, color-independent status, screen-reader announcements, and retention of authorized functions on narrow layouts.

## 10. MVP Product Contracts

### 10.1 Chat, Trip, And Data Control Contract

- The MVP may store chat and Trip Project context only for travel planning: start city, traveler count, child age range, travel preferences, explicitly linked prior-trip references, avoided/repeated places, budget range, hotel style, driving tolerance, vehicle/EV needs, food/activity preferences, and current trip details. An unscoped or private answer shall not automatically load another Trip Project's constraints.
- The MVP shall not require or intentionally store children's full names, identity documents, payment data, medical details, exact home address, or other sensitive personal data.
- Context is extracted automatically from chat, and the assistant may refer to chat/trip details when they are relevant.
- Users can correct trip details through chat, for example: "Hay nho rang con toi 8 tuoi, khong phai 6 tuoi."
- Owners can delete a chat session or Trip Project. Deletion removes associated owner content from normal user-facing and retrieval use and invalidates derived planning or retrieval context that could reconstruct it. Retained non-content audit data shall not be sufficient to reconstruct the deleted question or plan. Primary-conversation deletion follows the replacement-or-Trip-deletion behavior in FR-15.
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
- Active-publication policy shall require sufficient travel relevance, extractability, evidence grounding, specificity, actionability, first-hand likelihood, and low commercial/spam risk in addition to the hard evidence, privacy, safety, and conflict gates. Numeric policy thresholds are versioned in the Architecture/Evaluation contract and shall never override a failed hard gate.
- `community_pattern` may be used when multiple independent community evidence records support a materially consistent observation. `conditional` may be used only when the answer includes its material condition. `conflicted` may not support a factual recommendation.
- Claims about road closures or conditions, safety, EV charging status, prices, opening hours, availability, booking policy, and promotions are freshness-sensitive. Automation must assign grounded claims in these categories `needs_operator` with `verification_requirement = operator_required`, not auto-publish or discard them solely for missing the normal auto-publication score threshold. They remain non-retrievable in `pending_operator`. An authorized operator may publish, revise and requeue, or suppress the card; this records an operator-authorized resolution with available evidence and does not imply multi-source corroboration or a `community_pattern` state.
- A high-risk conflict shall immediately transition an active card to `pending_operator`, set its domain classification to `conflicted`, open one version-bound primary work item, and de-index it; this transition shall not wait for operator review.
- A source quote and direct link are evidence for operator audit by default. Facebook-derived evidence and captured text remain `operator_only` in the public MVP. Traveler surfaces may show only a XuyenViet-authored paraphrase and practical verification guidance. A canonical source link is permitted only when the source is publicly accessible without authentication or group membership, passes URL-safety policy, and is not subject to a validated removal request. Direct Facebook quotes require a separately approved rights and display policy.
- Raw captured Facebook text shall be operator-only. A source with no active or reviewable claim shall be deleted after 180 days; a source supporting an active claim shall be re-evaluated and its traveler-visible evidence removed if the source is withdrawn, inaccessible, or subject to a removal request.
- Authorized operators may resolve open work, while normal ingestion and indexing continue independently. The system shall prioritize work by likely traveler impact and evidence/risk signals. Resolving stale work must have no mutation side effects, a high-severity sampling failure triggers the containment outcome in FR-25B, and source removal completes only after every dependent card is re-evaluated and removed evidence is no longer traveler eligible.
- A text-source ingestion is a source-level traversal, not a single-claim decision: one bounded request covers the complete immutable text capture and seeks every independently useful scoped candidate. Request-size limits protect operations only; they do not limit the number of qualifying claims.
- Each candidate from the same source has its own exact evidence validation, independent batch grounding/judgment result, relation decision, publication/review/verification/suppression outcome, and safe audit summary. The parent source reports aggregate outcomes and may succeed even when all candidates are suppressed or invalid.
- AI evidence output is a quote proposal, not source-coordinate authority. The system accepts evidence only when it maps uniquely to the immutable capture, persists the exact supported source text, and fails closed on a missing or ambiguous match.
- A newer immutable capture version invalidates older in-flight work before it can change canonical facts or evidence. Existing historical ingestion records remain interpretable when the ingestion protocol evolves; the system shall not fabricate candidate-level history or reinterpret legacy outcomes.
- The operator review surface may expose bounded aggregate and candidate-level safe outcomes for diagnosis. It shall never expose raw provider payloads, captured raw text, unapproved quotes, internal execution state, credentials, or prompts, and no diagnostic exception is traveler-facing.

### 10.4 Web Search Fallback Contract

- Provider selection is an architecture decision, but the provider/mechanism must return URL, title, snippet or summary, and enough metadata to show source provenance.
- The selected mechanism must support Vietnamese queries and Vietnamese sources.
- The selected mechanism must allow official/provider-source preference in ranking or post-filtering.
- Web search is triggered when an explicit required planning need has no applicable active evidence, when a relevant fact is freshness-sensitive and needs current verification, or when pending, conflicted, or otherwise ineligible knowledge leaves a material gap. Card count is not the product definition of sufficient evidence.
- If web search fails or confidence is low, AI shall say it cannot verify updated information and recommend user confirmation rather than inventing facts.
- Search-derived information may be used in answers with external provenance and traveler-safe verification wording, but it does not become reusable XuyenViet knowledge until ingested as a claim that meets the applicable publication policy.
- A search result whose route, place, direction, or applicable time is unresolved or mismatched shall not be used as a factual premise or satisfy the affected planning need. It may be shown only as a bounded lead for the traveler to verify.
- Search queries shall minimize private Trip constraints and send only the details necessary to investigate the specific evidence gap.

### 10.5 AI Answer Quality Rubric

Public MVP answer evaluation uses a 1-10 score across these dimensions:

- User-context use: answer reflects travelers, children, dates, preferences, explicitly selected Trip context, and constraints without leaking context from another trip.
- Practical specificity: answer includes concrete stops, pacing, services, warnings, or next actions.
- Source grounding: persisted answer provenance correctly identifies which parts came from XuyenViet knowledge, web search, chat/trip context, or general AI reasoning; traveler copy communicates only the practical verification guidance needed for a decision.
- Uncertainty handling: answer flags outdated, changing, sparse, or unverified information.
- Family-awareness: when children are included, answer adapts driving time, activities, rest, hotel area, and risk notes.
- Vietnamese clarity: answer is understandable, natural, and locally appropriate for Vietnamese users.

The first public-MVP evaluation prompt set shall include: the magic-moment family trip question, a sparse-data question, a freshness-sensitive question, a service/activity question, and a route logistics question.

Counter-metrics: track hallucinated unsupported claims, claims whose evidence span does not support their wording, missing verification guidance on changing or consequential facts, unsafe use of conflicted claims, hard-off-route factual contributions, unrelated evidence used to satisfy a planning need, hypothetical or pending changes presented as committed state, private-answer Trip-context leakage, silent required-need omissions, and answers that users rate as no better than generic ChatGPT.

### 10.6 Usage And Referral Readiness Contract

- AI usage tracking is for cost visibility, abuse investigation, and future pricing design; MVP shall not show or enforce credit balances.
- Usage events shall not become the source of truth for chat content or answer provenance.
- AI model pricing metadata is used for internal cost estimation only; MVP shall not expose credit balances, charge users, or block requests for insufficient funds.
- Usage cost estimates must identify the model pricing record or pricing version used when available.
- Cache pricing, if supported by the Gateway/provider, must be tracked separately from ordinary input and output pricing.
- AI Gateway pricing records shall use one documented calculation basis with currency, version, and effective timestamp so every cost estimate identifies the applicable pricing record and remains deterministic.
- Referral attribution capture stores who referred a new user and the referral code or campaign used when available.
- MVP referral attribution does not create reward liability, payout entitlement, ranking status, or credit conversion.

### 10.7 Trip Planning Foundation Contract

- A Trip Project owns its structured plan: anchors, legs, activities, constraints, item states, confirmed alternatives, proposals, and change history. The primary conversation is the only plan-authoring surface: chat requests create typed proposals, while chat transcripts do not themselves become the confirmed trip state.
- A durable selected route or path for a relevant leg is part of the Trip Project's structured plan. Free-text route intent and hypothetical paths can inform exploration or proposal drafting but are not durable route authority before owner confirmation.
- The first tranche is single-owner. All reads and mutations are scoped to the authenticated owner; no collaboration, shared editing, public sharing, or location sharing is implied.
- A migration may choose one linked conversation as the primary conversation for an existing Trip Project, but must preserve access to prior owner-linked conversations and must not discard their history.
- AI can draft plans and create structured change proposals. Only a user-confirmed server command may apply a proposal to persistent state after checking ownership, trip membership, proposal validity/expiry, and the affected-item version or equivalent conflict guard.
- A proposal may create, update, remove, reorder, or change the state of explicitly identified structured trip items. It must show the user its intended effect before confirmation and must not create hidden side effects; there is no separate manual form or timeline editor for these mutations in this tranche.
- Current-plan answers use applied Trip state. Explore-change answers preserve that state as a baseline and clearly distinguish proposed effects; proposal-review answers re-check the pending proposal and its affected state; unscoped answers do not load Trip constraints without explicit traveler selection.
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

The supported route-planning boundary shall be communicated to travelers. Knowledge outside that boundary may still support clearly scoped place-level or general guidance, but it shall not be presented as proof that XuyenViet supports an end-to-end route.

## 12. Success Criteria

- SC-1: At least 7 of 10 sampled public MVP users or test users rate the magic-moment answer as useful, with a score of 7/10 or higher.
- SC-2: At least 7 of 10 test answers include user-context references, practical local tips, and plain-language verification guidance when the recommendation needs it, without technical source/confidence labels in the default reading path.
- SC-3: The magic-moment answer includes at least one child-aware planning recommendation, one practical route/logistics tip, one uncertainty or freshness warning, and one suggested next step.
- SC-4: The AI-first ingestion workflow can create at least 100 active, evidence-grounded knowledge cards for the Hanoi-to-HCMC corridor before first public-MVP evaluation.
- SC-5: Active knowledge cards influence AI answers and remain visible in persisted response provenance; traveler UI uses appropriate plain-language uncertainty and verification wording without exposing internal provenance taxonomy.
- SC-6: No more than 2 of 10 test users say the answer feels no better than generic ChatGPT.
- SC-7: In representative quality samples, every active AI-extracted claim has a validated evidence span and no high-severity publication-policy failure.
- SC-8: Authoritative release cases contain zero known hard-off-route factual contributions and zero unrelated evidence used to satisfy a required planning need.
- SC-9: Authoritative Trip-planning cases contain zero hypothetical, pending, dismissed, expired, or stale proposal effects presented as committed Trip state, and zero unscoped/private answers that load another Trip Project's constraints without explicit selection.
- SC-10: Every uncovered required planning need in the release evaluation is either stated as a concise limitation, routed to appropriate fresh verification, or converted into a bounded clarification; it is never silently omitted or filled with unrelated evidence.
- SC-11: When current web or live-data verification is unavailable, every affected answer avoids false certainty and provides a practical permitted recovery action.
- SC-12: A traveler correction changes durable Trip planning context only after an explicit owner-confirmed proposal application; subsequent answers use the resulting current Trip version rather than the earlier request or proposal text.
- SC-13: An authorized operator can move from a documented knowledge need to a reviewed and accepted canonical YouTube URL without Discovery creating Knowledge, starting capture, or bypassing evidence/publication policy.
- SC-14: Discovery can be disabled without changing completed knowledge or queued/manual capture work, and its action-first control tower exposes only safe, attributable operational information needed to act on coverage, review, or persistent automation problems.
- SC-15: At least 80% of `consider` recommendations produced by the Vietnamese-first policy are classified `vi` or `likely_vi`; `unknown` does not count toward the target and foreign fallback is reported separately.
- SC-16: Zero `defer` or `consider` recommendations produced by the Vietnamese-first policy are shorter than its configured minimum useful duration.

## 13. MVP Acceptance Criteria

- AC-1: A Vietnamese user can access the public app entry point, sign in with Google, and then access AI Ask.
- AC-2: The user can ask the magic-moment trip-planning question and receive a Vietnamese answer without first completing a long form.
- AC-3: The answer includes clarifying questions while still providing an initial useful plan.
- AC-4: The system persists applicable provenance categories for chat/trip context, XuyenViet knowledge, web search/external source, or general AI reasoning; the default traveler answer does not expose these technical categories.
- AC-5: The answer gives concise, practical verification guidance for changing, freshness-sensitive, consequential, or uncertain information without exposing internal confidence labels.
- AC-6: The answer incorporates family-aware recommendations when children are mentioned.
- AC-7: The system stores and reuses non-sensitive context within chat sessions and trip projects owned by the authenticated user.
- AC-8: The user can request trip corrections through chat and delete chats or Trip Projects they own; correction changes durable state only after proposal confirmation, and deletion follows the non-orphaning and derived-context invalidation contract.
- AC-9: The system can triage raw source material, extract claims with validated evidence spans, and make qualifying claims active for AI retrieval without operator approval.
- AC-9A: An operator can queue Facebook URLs, run operator-assisted capture to add readable raw text, and then use the AI-first triage, claim extraction, and publication workflow without changing Facebook-derived trust defaults.
- AC-9B: The system routes risky, weakly evidenced, freshness-sensitive, duplicate, or conflicting claims to an AI-recommended, impact-prioritized operator review queue without blocking qualifying low-risk claims.
- AC-9C: AI Ask excludes every non-active card; applies conditional and community wording to active community claims; and does not make factual itinerary recommendations from conflicted claims.
- AC-9F: A completed ingestion job can contain mixed candidate dispositions without its technical status misrepresenting those outcomes. It completes only after terminal discovery and completed-or-failed candidate processing, with defined idempotent counters. An operator resolution does not change a completed candidate's AI disposition or reason; failed candidates have no business disposition.
- AC-9G: No active card has unresolved primary operator work; a stale or superseded work item has no mutation effect. An active card has eligible supporting evidence, and source removal completes only after dependent cards are re-evaluated and removed evidence is no longer traveler eligible.
- AC-9H: Public-MVP traveler surfaces render no direct Facebook quote or captured text. A Facebook source link appears only for a public, URL-safe, non-removed source; a credible removal request hides the link during review, and a validated request removes affected traveler eligibility through the source-removal workflow.
- AC-9D: For a long eligible source containing multiple useful claims, the system independently processes every structurally valid, quality-gated claim across the complete source without an accepted-fact quota; mixed candidate outcomes are accurately reflected in the source aggregate.
- AC-9E: Retries, interrupted work, duplicate delivery, or a newer capture cannot duplicate candidate work or let obsolete source work mutate a knowledge card or its evidence; the operator can inspect bounded, safe aggregate and candidate outcomes for a newer-protocol capture.
- AC-10: At least 100 active, evidence-grounded knowledge cards exist for the Hanoi-to-HCMC corridor before first public-MVP evaluation.
- AC-11: Web search is used for uncovered required planning needs or current verification, retains external provenance, and presents traveler-safe verification guidance. An unresolved or geographically mismatched result does not become a factual premise or satisfy the need.
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
- AC-28: A current-plan question, hypothetical route change, pending-proposal review, and unscoped/private question produce distinct, correct context behavior; only applied Trip state is represented as the current plan.
- AC-29: A saved canonical route or path is owned by the relevant Trip leg and changes only through an owner-confirmed proposal. Reopening the Trip preserves that route meaning or produces a safe review/refresh flow rather than silently selecting another path.
- AC-30: For no-path, partial-coverage, ambiguous-route, and outside-coverage cases, the traveler receives any safe useful guidance plus a clear bounded limitation and next action; no unsupported end-to-end route claim is made.
- AC-31: Under evidence or response-capacity pressure, consequential required needs are prioritized, every uncovered required need is surfaced, and unrelated evidence is never used to make the answer appear complete.
- AC-32: Recent route or safety warnings are distinguished from live closure, traffic, navigation, or guaranteed-safety authority, including when fresh verification fails.
- AC-33: Ordinary-chat deletion does not mutate an unrelated Trip plan; primary-conversation deletion cannot orphan a live Trip; Trip deletion invalidates reconstructable derived planning and retrieval context; retained non-content audit cannot reconstruct deleted traveler content.
- AC-34: From a bounded Knowledge coverage summary grouped by current province or centrally governed city, the system can produce an AI-assisted proposal with a concise reason and natural Vietnamese query. An authorized operator can accept, edit, dismiss, or replace it with an operator-authored query; while Discovery is enabled, confirmation queues an immediate run, exposes safe run and candidate-processing status, and produces deduplicated canonical individual-video candidates using documented YouTube metadata APIs only.
- AC-35: Disabling Discovery safely prevents new Discovery provider calls and writes without changing completed knowledge, queued Knowledge sources, or manual `youtube:capture` work; re-enabling resumes only newly eligible Discovery work.
- AC-36: Candidate enrichment and triage persist only bounded safe metadata and derived signal codes; raw comments, transcripts, media, prompts/responses, provider payloads, source material, evidence, and traveler content do not become Discovery input/output records or traveler knowledge.
- AC-37: A candidate receives a validated deterministic recommendation, and an authorized operator can review it and Accept, Defer, or Skip it with attributable audit history and safe recovery for failed or unknown outcomes.
- AC-38: Accept submits only the canonical URL to Knowledge intake and reports submitted or duplicate accurately; Discovery creates no Knowledge-owned record and does not invoke or schedule video capture or Gemini analysis.
- AC-39: The Discovery control tower opens on Action Required and provides bounded Knowledge Mission and Automation Health views sufficient to trace coverage needs, queries, candidates, review backlog, enablement, persistent incidents, and safe affected records.
- AC-40: Discovery can link an operator to existing high-impact Knowledge work without gaining authority to verify, publish, suppress, or otherwise mutate a Knowledge claim.
- AC-41: Discovery controls and views are role-protected, Vietnamese-first, keyboard accessible, screen-reader understandable, color independent, and usable on narrow layouts without losing an authorized action.
- AC-42: System-generated Discovery requests use natural Vietnamese provider queries, and automated tests prove that raw internal English taxonomy labels never reach the provider adapter.
- AC-43: Mixed Vietnamese, foreign-language, short, medium, long, missing-duration, and unknown-language fixtures prove that deterministic language and duration gates dominate AI score bands; quality measurements include only new-policy recommendations, and no historical candidate, recommendation, or operator decision is backfilled, reclassified, or mutated by the Vietnamese-first policy.

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
- R-11: Text similarity or incomplete route coverage could select evidence from the wrong route, direction, leg, or planning need and produce a plausible but materially incorrect recommendation.
- R-12: A hypothetical request or pending proposal could be mistaken for committed Trip state, causing later answers to contradict the owner's confirmed plan.
- R-13: Web results or recent warnings could be overstated as geographically applicable or live route authority when their place, direction, time, or provider capability is unresolved.
- R-14: Derived retrieval or planning artifacts could retain reconstructable owner content after chat or Trip deletion if invalidation and retention boundaries are incomplete.
- R-15: Discovery could become a second intake or publication lifecycle, or create an unsupervised capture backlog, if its URL-only ownership and manual-capture boundary are weakened.
- R-16: YouTube metadata, popularity, comments, or AI triage could be mistaken for factual evidence or credibility if deterministic policy and operator-facing wording are unclear.
- R-17: Direct traveler display of Facebook-derived text could exceed the approved public-MVP content-reuse boundary if operator-only evidence is not enforced consistently.

## 15. Open Questions

- OQ-1: What web search provider or mechanism will be used?
- OQ-3: What exact privacy-policy wording is required for AI Gateway-backed chat and trip-project processing?
- OQ-5: Should AI-generated image output become an MVP workflow, or remain deferred until after text/image-input planning is validated?
