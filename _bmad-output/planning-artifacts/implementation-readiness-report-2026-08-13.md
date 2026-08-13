---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
includedFiles:
  prd:
    - _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md
    - _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/addendum.md
  roadmap:
    - docs/roadmaps/retrieval-va-tri-nho-traveler-v6.2.md
  architecture:
    - _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
    - _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware-solution-design.md
    - _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/*.md
  epics:
    - _bmad-output/planning-artifacts/epics.md
  ux:
    - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md
    - _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
  stories:
    - _bmad-output/implementation-artifacts/21-*.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-13
**Project:** xuyenviet

## Document Inventory

The assessment uses the current canonical PRD plus addendum, Retrieval and Traveler Memory Roadmap v6.2, the main architecture spine and trip-aware retrieval design set, the canonical epics document, the main traveler UX design, and all twelve Epic 21 implementation story files.

No conflicting whole-versus-sharded document representations were found. Scope-specific YouTube Discovery architecture and UX documents and superseded roadmap versions are excluded. Earlier readiness and story-validation reports are historical references only and are not treated as authoritative inputs.

## PRD Analysis

### Functional Requirements

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
- FR-38: When children are part of the trip, the system shall consider shorter driving blocks, rest stops, child-friendly activities, learning opportunities, hotel convenience, and backup activities.
- FR-39: The system shall identify places or activities that may be unsuitable or boring for children when relevant.
- FR-40: The system shall suggest family-relevant tips such as child discounts when known from sources.
- FR-41: The system shall balance parent goals with child comfort and experience.
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
- FR-66: The system shall generate and refresh scoped YouTube Discovery query proposals from knowledge coverage gaps, freshness risk, unresolved conflicts, and safe aggregated traveler-demand signals, and shall support operator-created queries in the same governed workflow.
- FR-67: Authorized operators shall be able to inspect a query's origin, reason, priority, text, schedule context, and enabled or paused state and to create, edit, reprioritize, pause, or resume operator-managed queries.
- FR-68: An authorized operator shall be able to enable or disable Discovery globally. Disabling stops new Discovery planning, search, enrichment, triage, provider calls, and writes safely; it shall not alter queued Knowledge sources, completed knowledge, or manual `youtube:capture` work.
- FR-69: While permitted by global and query policy, the system shall run bounded scheduled discovery through documented YouTube Data API capabilities and deduplicate eligible individual public videos into canonical URL candidates without downloading or storing video media.
- FR-70: Candidate enrichment shall retain only bounded safe video/channel metadata and closed derived comment signals needed for triage. Comments shall never become evidence, capture material, knowledge cards, retrieval input, or traveler content.
- FR-71: The system shall validate bounded AI metadata triage and combine it with deterministic eligibility and ranking policy to produce `skip`, `defer`, or `consider` recommendations. Neither model output nor popularity establishes factual correctness, credibility, evidence, or publication eligibility.
- FR-72: Authorized operators shall receive a ranked, one-at-a-time candidate review experience with safe metadata, a plain-language recommendation, concise factors and penalties, bounded derived signals, and prior safe capture outcome when available.
- FR-73: Authorized operators shall be able to Accept, Defer, or Skip a candidate through role-protected, audited commands. A failed or unknown result remains recoverable and shall not claim that a Knowledge source or capture exists.
- FR-74: Accept shall submit only the canonical URL to the existing Knowledge intake API and shall record success only after a submitted or duplicate intake result. Discovery shall not create or own a Knowledge source, capture version, ingestion job, evidence, card, or publication state and shall never invoke, schedule, or retry manual `youtube:capture` or Gemini video analysis.
- FR-75: The Discovery control tower shall prioritize Action Required rather than a KPI dashboard and shall provide Knowledge Mission views for coverage needs, queries, candidates, and funnel progress plus Automation Health views for enablement, schedule, backlog, persistent incidents, telemetry freshness, and safe affected-record detail.
- FR-76: Discovery may route high-impact verification or conflict work to the existing Knowledge operator surface but shall not verify, publish, suppress, or otherwise change Knowledge claims.
- FR-77: Discovery shall retain only safe candidate, audit, and deduplication metadata under policy-controlled retention with 180 days as the initial default and shall retain derived comment signals for a shorter policy-controlled period. Retention changes shall not turn those signals into evidence or traveler content.
- FR-78: Discovery shall use only documented YouTube APIs and bounded metadata processing. It shall not introduce browser scraping, undocumented APIs, transcript scraping, video downloads, media persistence, raw comment retention, or an automatic video-analysis path.

**Total FRs: 131**

### Non-Functional Requirements

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

**Total NFRs: 22**

### Additional Requirements

- All ten Roadmap v6.2 product change requests (PCR-01 through PCR-10) are approved at outcome level; no PCR is deferred.
- The six production journeys PJ-01 through PJ-06 are product-owned behavior and must be preserved without reconstructing confirmed Trip authority from chat text.
- Applied Trip state is the sole authority for current-plan answers. Hypothetical requests and pending, dismissed, expired, stale, or foreign proposals cannot become current-plan state.
- Web verification is required by an uncovered planning need or freshness sensitivity, not by card count. Search results with unresolved geography, direction, route, or time remain verification leads rather than factual premises.
- Canonical route/path meaning must be owner-confirmed, version-safe, and fail closed when it cannot be preserved. Google Maps, live routing, traffic, navigation, weather, booking, and provider availability remain out of scope.
- Ordinary-chat deletion cannot mutate an unrelated Trip; primary-conversation deletion cannot orphan a live Trip; Trip deletion must invalidate reconstructable derived context while retained non-content audit remains non-reconstructive.
- Consequential required needs must be prioritized under evidence or response pressure; every uncovered need must be surfaced, verified, or clarified and cannot be filled with unrelated evidence.
- The broad-query card-count trigger is temporary compatibility behavior only and may be retired after approved architecture, versioned evaluation coverage, shadow non-regression evidence, and Product Owner approval.
- Product behavior remains owned by the PRD and addendum. Architecture may change mechanisms but cannot weaken authorization, single-writer mutation, provenance, deletion, safety, or traveler-facing failure outcomes.
- The MVP remains Vietnamese-first, authenticated, single-owner, modular-monolith based, and excludes booking, payments, credits, rewards, Google Maps, collaboration, and other listed non-goals.

### PRD Completeness Assessment

The PRD is substantially complete and explicitly incorporates Roadmap v6.2 outcomes. It provides 131 functional requirements, 22 non-functional requirements, product contracts, success criteria, acceptance criteria, risks, and direct PCR and production-journey traceability. Numbering is intentionally non-linear because later requirements and lettered amendments were inserted without renumbering; identifiers remain unique.

Open product questions remain for the exact web-search mechanism, exact privacy-policy wording, and possible AI-generated image output. The addendum also records canonical Trip route/path representation as an architecture-owned open mechanism; this does not leave the product outcome undefined, but the implementation assessment must verify that the selected architecture and stories close that mechanism.

## Epic Coverage Validation

### Coverage Matrix

| FR Number | PRD Requirement | Epic Coverage | Status |
|---|---|---|---|
| FR-1 | The system shall provide a Vietnamese chat interface for authenticated users. | Epic 2 - Vietnamese AI Ask conversation. | Covered |
| FR-2 | The system shall allow users to ask broad, underspecified road-trip planning questions. | Epic 2 - Broad planning prompts. | Covered |
| FR-3 | The system shall respond in Vietnamese by default. | Epic 2 - Vietnamese-default answers. | Covered |
| FR-4 | The system shall provide useful initial guidance even when some trip details are missing. | Epic 2 - Useful initial guidance with incomplete trip details. | Covered |
| FR-5 | The system shall ask concise follow-up questions when important planning details are missing. | Epic 2 - Concise clarifying questions. | Covered |
| FR-6 | The system shall support iterative refinement across a conversation. | Epic 2 - Iterative conversation refinement. | Covered |
| FR-6A | The system shall stream AI Ask assistant responses when the selected Gateway model and orchestration path support streaming, but only after required context, source-bundle, and provenance inputs are assembled. | Epic 4 - Provenance-prepared streaming answers. | Covered |
| FR-6B | The system shall allow authenticated users to submit supported image inputs with AI Ask messages when using an image-capable Gateway model. | Epic 2 - Authenticated traveler image input. | Covered |
| FR-6C | The system shall validate image inputs for size, type, ownership, and safety before any provider call, and invalid image submissions shall not create provider calls. | Epic 2 - Pre-provider image validation. | Covered |
| FR-6D | Once an AI Ask request is admitted and its user message is persisted, browser reloads, chat switches, or HTTP stream disconnects shall not cancel answer generation while the API process remains alive; the browser stream is a best-effort relay and the persisted terminal answer is authoritative when the traveler returns to the conversation. | Epic 10 Stories 10.4-10.5 - API-owned generation survives disconnect and reconciles to persisted terminal state. | Covered |
| FR-7 | The system shall format travel answers as a calm Vietnamese conversation with suggested plan/options, rationale, practical tips, concise verification guidance when relevant, and next steps. Technical source/provenance, reasoning, audit, processing, and provider information shall not occupy the default traveler reading path. | Epic 2 - Structured and scannable travel answers. | Covered |
| FR-8 | The system shall require Google Login before a user can ask AI. | Epic 1 - Google-authenticated access. | Covered |
| FR-9 | The system shall associate chat sessions and trip projects with the authenticated user. | Epic 2 - Owned chats and trip projects. | Covered |
| FR-10 | The system shall extract travel-relevant details from the current conversation or explicitly selected Trip Project, including adults, children, children's ages when known, preferences, budget, hotel style, driving tolerance, and constraints. It shall not automatically use another trip's details unless the traveler explicitly selects or links that trip. | Epic 2 - Travel-context extraction. | Covered |
| FR-11 | The system shall reuse relevant context within the current conversation or exact owner-confirmed state of the explicitly selected Trip Project. | Epic 2 - Chat/trip context reuse. | Covered |
| FR-12 | The system shall distinguish transient conversation intent from the Trip Project's confirmed structured state; conversation text, an AI answer, and a pending, dismissed, or expired proposal shall not become a competing itinerary source of truth. | Epic 2 - Separate chat and trip context. | Covered |
| FR-13 | The system shall allow users to correct trip details through normal chat messages. | Epic 2 - Chat-based context correction. | Covered |
| FR-14 | The system shall show users a clear notice that chat and trip details may be stored to support the current session or trip project. | Epic 1 - First-use storage notice. | Covered |
| FR-15 | The system shall allow owners to delete an ordinary chat or Trip Project. Ordinary-chat deletion shall not mutate an unrelated Trip plan; Trip deletion shall remove its structured state from normal use and invalidate derived retrieval or planning context that could reconstruct it. Deleting a primary conversation shall follow an explicit replacement-or-Trip-deletion flow and shall not implicitly orphan or erase a live confirmed plan. | Epic 2 - Owned chat/project deletion. | Covered |
| FR-16 | The system shall not store sensitive personal data beyond what is needed for trip personalization. [ASSUMPTION: child data is limited to travel-relevant facts such as age range, comfort needs, and preferences; no full names required.] | Epic 2 - Sensitive context exclusion. | Covered |
| FR-16A | The system shall let an owner request changes to structured Trip Project anchors, including origin, destination, regions, required stops, and accommodations, through the primary conversation; accepted changes shall be applied only through an explicit Trip Change Proposal confirmation. | Epic 7 - Chat-requested structured Trip Project anchors. | Covered |
| FR-16B | The system shall let an owner request dated trip legs and activities of type `transport`, `visit`, `food`, `rest`, or `accommodation` through the primary conversation; accepted changes shall be applied only through an explicit Trip Change Proposal confirmation. | Epic 7 - Chat-requested dated legs and activities. | Covered |
| FR-16C | The system shall give each structured trip item an explicit state of `idea`, `planned`, `confirmed`, or `backup`; an open or `idea` item shall not be treated as an error solely because it is unconfirmed. | Epic 7 - Explicit plan-item states and scoped backups. | Covered |
| FR-16D | The system shall let an owner request travel-relevant trip-constraint changes, including travelers, children, vehicle/EV needs, driving tolerance, budget range, preferences, and places or activities to avoid, through the primary conversation; accepted changes shall be applied only through an explicit Trip Change Proposal confirmation. | Epic 7 - Chat-requested trip constraints. | Covered |
| FR-16E | The system shall establish one primary conversation for each Trip Project while preserving owner access to currently linked historic conversations during migration. | Epic 7 - Primary conversation migration and historic conversation preservation. | Covered |
| FR-16F | The system shall show an owned Trip Project a basic Trip Home that prioritizes an unresolved planning decision when one exists, otherwise the next planned leg or preparation focus, and presents the primary conversation as the central action. | Epic 7 - Deterministic Trip Home and primary conversation access. | Covered |
| FR-16G | The system shall let AI create a typed Trip Change Proposal containing rationale, affected trip items, alternatives when available, and expiry when its supporting information is time-sensitive. | Epic 7 - Typed, expiring AI Trip Change Proposals. | Covered |
| FR-16H | The system shall require the Trip Project owner to explicitly apply a Trip Change Proposal before it changes persistent trip state; AI, provider output, and ordinary answer generation shall not directly mutate itinerary, constraints, or item state. | Epic 7 - Owner-confirmed transactional proposal application. | Covered |
| FR-16I | The system shall preserve an owner-visible history for applied, dismissed, and expired Trip Change Proposals with actor and timestamp. | Epic 7 - Owner-visible proposal change history. | Covered |
| FR-16J | The logged-in empty chat shall accept a natural-language travel request without requiring a traveler to select ordinary chat or a Trip Project first. The assistant may recommend, but never automatically create, a Trip Project when durable planning context makes saving useful; declining the recommendation is remembered until the context materially changes or the traveler asks to save. | Epic 21 Story 21.9 - Persistent explicit chat-to-Trip opportunity; Epic 16 Story 16.1 is the completed decision-bound baseline. | Covered |
| FR-16K | For an unscoped question, the system may recommend one or more owned Trip Projects or ask a clarifying question using a server-owned decision. It shall never attach project context without explicit traveler selection; a private answer shall not use or persist the selected project's constraints for that turn. | Epic 21 Story 21.9 - Owner-bound explicit conversion or existing-Trip selection without automatic context attachment. | Covered |
| FR-16L | A project-scoped composer shall state the active trip in traveler language and provide an explicit way to ask outside it or switch projects. Switching selects the existing primary conversation and shall not merge or copy an ordinary conversation into the project. | Epic 21 Story 21.9 and Epic 16 Story 16.2 - Existing-Trip scope switching without copying or importing ordinary chat. | Covered |
| FR-16M | For each Trip-scoped answer, the system shall distinguish whether the traveler is asking about the current plan, exploring a hypothetical change, reviewing or validating a pending proposal, or asking outside the Trip. If ambiguity would materially change the answer, it shall ask one concise clarification while still providing any invariant useful guidance. | Epic 21 Story 21.4 - Explicit current, hypothetical, proposal-review, and unscoped planning modes. | Covered |
| FR-16N | In a current-plan answer, only applied Trip Project state shall be planning authority. A hypothetical request or pending, dismissed, expired, stale, or foreign proposal shall not be represented as the current plan. | Epic 21 Story 21.4 - Applied Trip state is the only current-plan authority. | Covered |
| FR-16O | A Trip Project shall be able to preserve an owner-selected canonical route or path for a relevant leg with an explicit item state. Free-text route descriptions may be resolved for exploration or proposal drafting but become durable route authority only after an owner-confirmed proposal is applied. | Epic 21 Story 21.5 - Owner-confirmed canonical leg-path persistence. | Covered |
| FR-16P | Exploring an alternate route, stop, or constraint shall preserve the confirmed plan as the comparison baseline. The system may draft a typed proposal, but only a successful owner Apply action may change the route or constraints used by subsequent current-plan answers. | Epic 21 Story 21.4 - Applied plan remains baseline until proposal Apply. | Covered |
| FR-16Q | If a stored route reference can no longer be interpreted with the same material meaning, the system shall fail safely and ask the owner to review or refresh it; it shall not silently select a different route. | Epic 21 Story 21.5 - Stale path references fail safely and require owner review. | Covered |
| FR-17 | The system shall support operator-created knowledge cards. | Epic 3 - Operator-managed knowledge cards. | Covered |
| FR-18 | Each knowledge card shall include title, type, location or route segment, summary, source, collected date, confidence level, tags, and freshness-sensitive flag. | Epic 3 - Structured card metadata. | Covered |
| FR-18A | Each AI-extracted community claim shall preserve a short evidence quote, validated source-text span, source link when available, capture date, observed date when known, and identified conditions before it can be active for retrieval. | Epic 3 - Validated evidence and capture provenance. | Covered |
| FR-18B | The system shall not retain or expose personally identifying or sensitive content in traveler-visible facts or evidence quotes. Direct Facebook-derived quotes and captured text remain operator-only in the public MVP; traveler surfaces may use a XuyenViet-authored paraphrase and practical verification guidance. A canonical Facebook source link may appear only when the source is publicly accessible without authentication or group membership, passes URL-safety policy, and is not subject to a validated removal request. | Epic 3 - Traveler-safe evidence policy. | Covered |
| FR-18C | Knowledge cards shall preserve validated, bounded practical details needed for traveler guidance. A `route_note` may preserve `ordered_stops` in source order, including intentional repeated stops. | Epic 15 Story 15.2 - Preserve validated bounded practical detail and ordered route observations in target candidate processing. | Covered |
| FR-18D | The public product shall publish a content-removal contact channel. A credible Facebook source, rights-holder, privacy, or safety request shall hide the affected traveler source link while an authorized operator validates it; a validated request shall invoke the existing source-removal and dependent-knowledge re-evaluation contract. | Epic 15 Story 15.4 - Immediate content-removal safety and dependent-knowledge re-evaluation. | Covered |
| FR-19 | Knowledge card types shall include place, food, hotel area, activity, service, route note, warning, cost note, parking, EV charging, kid-friendly tip, discount/promotion, and general travel tip. | Epic 3 - Knowledge taxonomy. | Covered |
| FR-20 | Operators shall be able to create, edit, approve, and archive knowledge cards. | Epic 3 - Explicit operator lifecycle actions. | Covered |
| FR-21 | Knowledge cards in `active` lifecycle state shall be used for normal AI retrieval when their current evidence remains eligible. Operator approval is optional and must not be a prerequisite when an AI-extracted community claim meets the active-publication policy. | Epic 3 - AI-first active publication without mandatory approval. | Covered |
| FR-22 | Knowledge cards shall preserve source provenance enough for users or operators to inspect where the information came from. | Epic 3 - Source provenance. | Covered |
| FR-22A | Every knowledge card shall have exactly one lifecycle state: `draft`, `pending_operator`, `active`, `suppressed`, `archived`, or `rejected`. | Epic 15 - One target card lifecycle state. | Covered |
| FR-22B | The system shall track domain classification separately from workflow as `community_observation`, `community_pattern`, `conditional`, or `conflicted`; it shall not use workflow terms such as `uncertain`, `confirmed`, or `superseded` as a card classification. | Epic 15 - Domain classification separated from workflow lifecycle. | Covered |
| FR-22C | The system shall track verification requirement separately as `none`, `operator_required`, or `failed`. Independent corroboration is derived from eligible evidence with distinct independence keys; an operator decision is recorded in operator-work resolution and audit history. | Epic 15 - Verification requirement separated from lifecycle and derived corroboration. | Covered |
| FR-22D | The system shall exclude every card other than an evidence-eligible `active` card from normal retrieval. A `pending_operator` card is never traveler-retrievable. | Epic 15 Story 15.4 - Active cards require eligible evidence and fail-closed retrieval projection. | Covered |
| FR-23 | Operators shall be able to submit raw source material as URL, raw text, copied post content, or image/screenshot. | Epic 3 - Operator source intake. | Covered |
| FR-23A | The system shall support queued Facebook URLs whose visible post content can be captured later by an operator-run browser automation tool. | Epic 3 - Queued Facebook capture. | Covered |
| FR-23B | Facebook capture automation shall populate operator-only raw source material only after operator-visible content is extracted and confirmed; it shall not store browser credentials, cookies, tokens, local storage, full HTML dumps, or hidden page data. | Epic 3 - Operator-only Facebook capture boundary. | Covered |
| FR-23C | For each immutable Facebook capture version, the operator capture queue shall distinguish technical processing progress from candidate publication outcomes. A completed source may contain mixed candidate results, including candidates that need operator action, without misrepresenting the source as wholly published or rejected. | Epic 15 Story 15.2 - Canonical technical ingestion-job status and idempotent candidate counters; Epic 14 Story 14.4 - Safe direct admin capture queue projections, canonical status, filters, counts, and ordering. | Covered |
| FR-24 | The system shall use AI to triage submitted source material, discover structured scoped candidates, and independently validate each publishable claim against an exact evidence span from the immutable source. AI-proposed evidence locations shall not be accepted when they cannot be matched uniquely and safely to that source. | Epic 3 - AI triage, extraction, and evidence validation. | Covered |
| FR-24A | The system shall classify AI-triaged source material as rejected, context-only, or candidate-bearing, and shall retain candidate AI disposition and decision reasons for audit and quality evaluation. | Epic 3 - Triage classifications and reasons. | Covered |
| FR-24B | The system shall use an independent AI evaluation step to decide whether an extracted candidate receives `apply`, `needs_operator`, or `discard`; the extractor shall not be the sole publication decision-maker. | Epic 3 - Independent publication judge. | Covered |
| FR-24C | The system shall discover and process every independently useful atomic claim supported by a submitted immutable source version; it shall not discard otherwise qualifying claims merely because a source contains many claims or a prior sibling claim was accepted. | Epic 3 - Complete immutable-source candidate discovery and processing. | Covered |
| FR-24D | The system shall give each discovered candidate an independent, auditable processing result and immutable AI disposition and reason when completed; failed candidates shall have no business disposition. A source completes only after discovery is terminal and every candidate has completed or failed, and may complete successfully with mixed dispositions or when no candidate is applied. | Epic 3 - Candidate-level terminal outcomes and source completion. | Covered |
| FR-24E | When a newer source capture supersedes an earlier immutable version, work from the earlier version shall not create, attach, conflict with, or otherwise mutate active knowledge. Historical ingestion behavior shall remain intelligible when newer ingestion capabilities are introduced. | Epic 3 - Supersession-safe source-version claiming, processing, and recovery. | Covered |
| FR-24F | For a source describing an itinerary, the system shall preserve a route note's source-order stop sequence, including intentional repeats, and shall extract each independently useful scoped observation about a named place, venue, or route option as a sibling candidate. Bare stop labels alone shall not become knowledge-card candidates. | Epic 15 Story 15.2 - Preserve ordered route observations and independent useful candidate outcomes. | Covered |
| FR-25 | The system shall make a claim searchable without human approval only when it has validated evidence, sufficient travel specificity and actionability, no sensitive content, no high commercial/spam risk, and no unresolved high-risk conflict. | Epic 3 - Evidence-grounded automatic publication policy. | Covered |
| FR-25A | The system shall create risk-prioritized operator work, not a mandatory approval gate, for verification, relation, risk, or missing-context decisions. An authorized operator may publish, revise and requeue, or suppress a card with available validated evidence without changing the candidate's original AI disposition. Stale or superseded work shall have no mutation effect, and an active card shall have no unresolved primary operator work. | Epic 3 - Risk-prioritized review recommendations. | Covered |
| FR-25B | The system shall support quality sampling of active claims so operators can measure false-positive publication without delaying normal ingestion. Sampling is quality monitoring rather than publication approval and remains separate from actionable operator work. A high-severity sampling failure shall contain the affected cohort without changing unrelated knowledge. | Epic 3 - Quality sampling. | Covered |
| FR-26 | The system shall preserve machine-readable source classification, verification state, evidence support, freshness, and provenance for policy, audit, and traveler-safe wording. These internal fields shall not be exposed as default traveler confidence labels. | Epic 3 - Internal source, verification, evidence, freshness, and provenance metadata. | Covered |
| FR-27 | The system shall allow operators to mark facts as freshness-sensitive when they involve price, schedule, availability, road condition, opening hours, weather, or service status. | Epic 3 - Freshness-sensitive facts. | Covered |
| FR-28 | The system shall support a minimum public-MVP seed set of 100 active knowledge cards across the Hanoi-to-HCMC corridor. [ASSUMPTION: 100 is enough to test retrieval quality while remaining feasible for initial public launch.] | Epic 3 - Active evidence-grounded seed progress. | Covered |
| FR-28A | Authorized operators shall have an aggregate-only seed-coverage report that counts only active Hanoi-to-HCMC cards with complete retrieval metadata and valid bounded evidence from eligible retained sources. It shall show taxonomy and route/location gaps, including zero-count buckets; distinguish countable community observations or patterns from caveat-only material; and surface current review, verification, source, and recommendation work without exposing raw capture content, URLs, quotes, provider payloads, or removal internals. | Epic 3 Story 3.11 - Aggregate-only active evidence-grounded seed coverage; Epic 14 Story 14.4 - Direct safe admin projection. | Covered |
| FR-29 | The system shall retrieve relevant cards only when `lifecycle_state = active`, current evidence is eligible, and domain classification and verification requirement permit the requested use. | Epic 4 - State-aware active knowledge retrieval. | Covered |
| FR-30 | The system shall first determine whether the turn is unscoped, about the applied current Trip plan, exploring a change, or reviewing a proposal. It shall then assemble only the context authorized for that mode before using applicable active XuyenViet knowledge, scoped web verification, and general AI knowledge. It shall not resolve conflicts through a precedence rule between Trip state and chat text. | Epic 4 - Context priority pipeline. | Covered |
| FR-31 | The system shall use web search when a required planning need has no applicable active evidence, when a relevant fact requires fresh verification, or when pending, conflicted, or otherwise ineligible knowledge leaves a material evidence gap. Card count alone shall not determine whether evidence is sufficient. | Epic 4 - Web fallback conditions. | Covered |
| FR-32 | The system shall persist and make auditable whether answer information came from chat/trip context, XuyenViet knowledge cards, web search, or general AI reasoning. This classification is not default traveler-facing copy. | Epic 4 - Persisted answer provenance categories. | Covered |
| FR-32A | Persisted provenance shall distinguish evidence made available to answer generation from evidence materially attributed to the completed answer. Attribution shall resolve only to evidence available for that same answer and shall never invent a source. | Epic 11 Story 11.3 - Material answer attribution resolves only to same-answer available evidence. | Covered |
| FR-32B | Missing or malformed material-attribution output shall not invalidate an otherwise safe answer, but it shall not create material attribution or traveler source detail that the system cannot validate. | Epic 11 Story 11.3 and Epic 10 Story 10.4 - Invalid attribution is omitted without inventing provenance or rewriting a safe completed answer. | Covered |
| FR-33 | The system shall warn users to verify changing details before acting or booking. | Epic 4 - Changing-detail verification warnings. | Covered |
| FR-34 | The system shall avoid presenting unverified collected information as guaranteed fact. | Epic 4 - Non-guaranteed unverified wording. | Covered |
| FR-35 | Web information used in an answer shall retain external provenance and practical verification guidance and shall never be implied to be confirmed merely because it is displayed. A route- or place-specific web fact may be used as a factual premise only when its applicable geography and time resolve consistently with the current planning need; an unresolved or mismatched result remains a verification lead and does not satisfy that need. | Epic 4 - External web provenance and practical verification guidance. | Covered |
| FR-61 | Retrieval shall evaluate applicable evidence against explicit required planning needs. Multiple items covering the same need shall not conceal a missing route, safety, family, vehicle, stop, or other required need, and unrelated evidence shall not be used to make an answer appear complete. | Epic 21 - Required-need coverage cannot be hidden by duplicate or unrelated evidence. | Covered |
| FR-62 | When available evidence or response capacity cannot cover every required planning need, the system shall prioritize consequential route, safety, and traveler constraints; provide any safe useful partial guidance; identify the uncovered need concisely; and offer a permitted clarification or verification action instead of silently omitting it. | Epic 21 - Capacity-safe prioritization, useful partial guidance, and explicit gaps. | Covered |
| FR-63 | The product shall communicate its supported route-planning coverage in traveler language. Outside supported coverage, it may provide clearly scoped endpoint, place, general, or external-reference guidance, but shall not claim end-to-end route applicability. | Epic 21 - Traveler-language supported route coverage. | Covered |
| FR-64 | For routes with no supported path, partial supported coverage, or materially ambiguous alternatives, the system shall provide bounded useful behavior appropriate to that condition and shall not use incomplete coverage, nationwide advice, source prestige, or text similarity to manufacture route authority. | Epic 21 - Safe bounded behavior for partial, ambiguous, and unsupported routes. | Covered |
| FR-65 | A recent warning may be presented with its source, applicable place/time, and practical verification action, but shall not be stated as live closure, traffic, navigation, or guaranteed route-safety authority unless an approved live-data capability supports that claim. | Epic 21 - Recent warnings remain distinct from live route authority. | Covered |
| FR-36 | The system shall prefer official/provider pages over reposted or unattributed sources when using web search fallback. | Epic 4 - Official/provider web preference. | Covered |
| FR-37 | Facebook-derived information shall not be treated as official unless it comes from an identifiable official/provider page. In the public MVP, direct Facebook evidence quotes and captured text are operator-only; traveler answers may use a safe XuyenViet-authored paraphrase with provenance-aware verification guidance and a canonical source link only under the public-access, URL-safety, and removal conditions in FR-18B. | Epic 3 - Facebook community-source trust policy. | Covered |
| FR-37A | The system shall present a community observation, pattern, or conditional claim with its appropriate uncertainty wording and shall not represent it as an official fact. | Epic 4 - State-appropriate community wording. | Covered |
| FR-37B | The system shall only describe a claim as a community pattern when multiple independent supporting evidence records exist. | Epic 3 - Independent evidence required for community pattern. | Covered |
| FR-37C | The system shall not use `conflicted` knowledge as a factual premise for itinerary recommendations; it may use it to surface uncertainty, ask a clarifying question, recommend verification, or choose a safer alternative. | Epic 4 - No factual itinerary premise from conflict. | Covered |
| FR-38 | When children are part of the trip, the system shall consider shorter driving blocks, rest stops, child-friendly activities, learning opportunities, hotel convenience, and backup activities. | Epic 5 - Family-aware pacing and alternatives. | Covered |
| FR-39 | The system shall identify places or activities that may be unsuitable or boring for children when relevant. | Epic 5 - Child suitability guidance. | Covered |
| FR-40 | The system shall suggest family-relevant tips such as child discounts when known from sources. | Epic 5 - Sourced family tips. | Covered |
| FR-41 | The system shall balance parent goals with child comfort and experience. | Epic 5 - Parent/child tradeoff balance. | Covered |
| FR-42 | The system shall allow public sign-in without an email allowlist, but AI Ask shall require an authenticated Google user. | Epic 1 - Public sign-in without allowlist. | Covered |
| FR-43 | The system shall provide an operator/admin area separate from traveler chat. | Epic 1 - Traveler-separate, role-gated admin access. | Covered |
| FR-44 | The system shall support at least one admin/operator account for initial knowledge management. | Epic 1 - Initial admin/operator capability. | Covered |
| FR-45 | The system shall allow future expansion to multiple operators without redesigning the knowledge workflow. | Epic 1 - Extensible operator roles. | Covered |
| FR-45A | The operator capture-review surface shall show safe aggregate and candidate-level ingestion outcomes sufficient to diagnose a source without exposing raw provider output, raw captured text, quotes outside approved evidence storage, or internal execution secrets. | Epic 3 - Safe operator ingestion outcome diagnostics. | Covered |
| FR-45B | Exact administrators shall be able to view a paginated user roster limited to name, email, avatar, verification state, and roles; grant or revoke only `operator` and `admin` roles; and receive an audit record for each role delta. Operators shall not access the roster or role mutations, and the system shall prevent removal of the final administrator or an administrator's own final admin role. | Epic 14 Story 14.4 - Direct exact-admin roster and audited role governance; historical Epic 13 Story 13.2 is completed extraction evidence only. | Covered |
| FR-45C | The exact-admin user roster shall show each displayed user's lifetime persisted AI-event count and prompt and completion token totals. It shall include successful and failed events, treat null token values as zero, aggregate only the paginated roster user IDs, and expose neither prompts nor provider payloads; it shall not introduce quotas, credits, billing, or traveler/operator access. | Epic 14 Story 14.4 - Direct exact-admin roster usage aggregates; historical Epic 13 Story 13.2 is completed extraction evidence only. | Covered |
| FR-46 | The system shall capture a simple usefulness rating for AI answers during the public MVP through lightweight answer-footer controls. Optional reasons or comments appear only after negative feedback and never block the composer or displace planning. | Epic 5 - Answer usefulness feedback. | Covered |
| FR-46A | Traveler-facing UI shall express loading, unavailable, verification, and failure states in plain Vietnamese with the practical effect and recovery action. It shall not display internal status names, provider/model names, technical error codes, request IDs, source/provenance taxonomy, retrieval policy, audit terminology, or implementation diagnostics. | Follow-on chat-first UX epic - Plain-language traveler state projections. | Covered |
| FR-47 | The system shall record AI usage events for authenticated AI requests, including user, conversation or trip context when applicable, AI purpose, provider/model, timestamp, and available usage/cost metadata. | Epic 4 - Authenticated AI usage events. | Covered |
| FR-48 | The system shall capture referral attribution when a new user signs in or registers through a valid referral link, without calculating rewards, ranking, payout, or credit conversion in MVP. | Epic 1 - Silent referral attribution. | Covered |
| FR-49 | The system shall manage AI Gateway model records with gateway model name, intended purpose, supported input/output capabilities, active status, and input/output/cache pricing metadata. | Epic 4 - Managed AI Gateway model records. | Covered |
| FR-49A | Exact administrators shall be able to create, update, set one eligible active default per purpose, and archive AI Gateway model records without deletion. Each pricing record shall be versioned, effective-dated, currency-specific, deterministic, and non-negative; archived records shall not be defaults, and credentials and provider payloads shall not be exposed. | Epic 14 Story 14.4 - Direct exact-admin AI Gateway model-catalog management. | Covered |
| FR-50 | The system shall use configured model pricing metadata to estimate AI usage cost when provider usage token metadata is available, without creating credit balance or billing behavior in MVP. | Epic 4 - Internal cost estimation. | Covered |
| FR-51 | The system shall expose versioned domain API contracts for traveler, operator, and future client surfaces without dependence on one presentation framework's internal transport or session representation. | Epic 14 Stories 14.1-14.4 - Direct versioned domain APIs for traveler and operator clients. | Covered |
| FR-52 | Traveler and operator clients shall use the protected versioned API without receiving database credentials or internal service credentials. | Epic 14 Stories 14.1 and 14.4 - Direct browser API access through NestJS-managed secure sessions. | Covered |
| FR-53 | The system shall provide a separately deployed operator/admin application with its own origin and release lifecycle that uses the protected API without database credentials or direct domain imports. | Epic 13 Stories 13.1-13.2 and Epic 14 Story 14.4 - Separately deployed operator application with protected API ownership. | Covered |
| FR-54 | The system shall authorize every protected API read and command against the current authenticated principal and current authorization state. | Epic 14 Story 14.1 - Live opaque-session principal and current authorization checks. | Covered |
| FR-55 | The system shall provide a stable API error contract with machine-readable code, safe message, request/correlation ID, and applicable safe field violations without sensitive internals. | Epic 14 Story 14.1 - Stable safe direct-API error contract. | Covered |
| FR-56 | The system shall document versioned health/version and protected-capability API contracts, including validation, authorization, ownership, pagination/stable ordering, streaming semantics where applicable, and browser-session/CSRF admission requirements. | Epic 14 Stories 14.1-14.4 - Documented health/version and protected capability contracts. | Covered |
| FR-57 | The system shall run continuous and scheduled background work independently from traveler request handling, with bounded execution, safe recovery, and idempotent outcomes. | Epic 12 Stories 12.1-12.2 - Dedicated Worker runtime and bounded scheduled sweeps using existing PostgreSQL protocols. | Covered |
| FR-57A | Post-answer enrichment may add derived context, answer annotations, or user-confirmable proposal actions, but shall not change completed answer text, terminal command outcome, initial provenance, or successful-answer usage. | Epic 10 Stories 10.3-10.4 - Post-answer consumers cannot rewrite completed answer, provenance, outcome, or usage. | Covered |
| FR-58 | The system shall preserve one writer per aggregate command during migration and never dual-write product state. | Epic 14 Stories 14.2-14.5 - One writer per aggregate during direct-API migration. | Covered |
| FR-59 | AI Ask streaming through the versioned API shall preserve preparation, incremental delivery, explicit completion or failure, disconnect tolerance, and atomic terminal persistence. | Epic 10 Story 10.5 and Epic 14 Story 14.2 - Versioned API streaming with preserved NDJSON and atomic terminal behavior. | Covered |
| FR-59A | Provider-specific stream completion variations may be accepted only when the response is well-formed, contains usable answer content, and contains no provider-declared or parsing failure; an ambiguous or malformed completion fails safely. | Epic 10 Stories 10.2 and 10.5 - Provider completion variations must validate or fail safely before terminal persistence. | Covered |
| FR-60 | Before public launch, the system shall retire superseded authentication, domain-transport, writer, and operator surfaces so every protected capability has one current owner and no legacy mutation path remains active. | Epic 14 Story 14.5 - Retire Auth.js, BFF runtime, legacy writers, and legacy admin surface. | Covered |
| FR-66 | The system shall generate and refresh scoped YouTube Discovery query proposals from knowledge coverage gaps, freshness risk, unresolved conflicts, and safe aggregated traveler-demand signals, and shall support operator-created queries in the same governed workflow. | Epic 18 Stories 18.2-18.3 - Governed system/operator Discovery query proposals. | Covered |
| FR-67 | Authorized operators shall be able to inspect a query's origin, reason, priority, text, schedule context, and enabled or paused state and to create, edit, reprioritize, pause, or resume operator-managed queries. | Epic 18 Story 18.3 - Authorized query inspection, management, and scheduling context. | Covered |
| FR-68 | An authorized operator shall be able to enable or disable Discovery globally. Disabling stops new Discovery planning, search, enrichment, triage, provider calls, and writes safely; it shall not alter queued Knowledge sources, completed knowledge, or manual `youtube:capture` work. | Epic 18 Story 18.2 and Epic 20 Story 20.4 - Global Discovery disablement without changing Knowledge/manual capture. | Covered |
| FR-69 | While permitted by global and query policy, the system shall run bounded scheduled discovery through documented YouTube Data API capabilities and deduplicate eligible individual public videos into canonical URL candidates without downloading or storing video media. | Epic 18 Story 18.4 - Bounded documented YouTube API discovery and canonical URL deduplication. | Covered |
| FR-70 | Candidate enrichment shall retain only bounded safe video/channel metadata and closed derived comment signals needed for triage. Comments shall never become evidence, capture material, knowledge cards, retrieval input, or traveler content. | Epic 18 Story 18.5 - Bounded safe metadata and non-evidence derived comment signals. | Covered |
| FR-71 | The system shall validate bounded AI metadata triage and combine it with deterministic eligibility and ranking policy to produce `skip`, `defer`, or `consider` recommendations. Neither model output nor popularity establishes factual correctness, credibility, evidence, or publication eligibility. | Epic 19 Stories 19.1-19.2 - Validated AI metadata triage plus deterministic eligibility/ranking. | Covered |
| FR-72 | Authorized operators shall receive a ranked, one-at-a-time candidate review experience with safe metadata, a plain-language recommendation, concise factors and penalties, bounded derived signals, and prior safe capture outcome when available. | Epic 19 Story 19.3 - Ranked explainable one-at-a-time candidate review. | Covered |
| FR-73 | Authorized operators shall be able to Accept, Defer, or Skip a candidate through role-protected, audited commands. A failed or unknown result remains recoverable and shall not claim that a Knowledge source or capture exists. | Epic 19 Story 19.5 - Protected audited Accept/Defer/Skip and recoverable unknown outcomes. | Covered |
| FR-74 | Accept shall submit only the canonical URL to the existing Knowledge intake API and shall record success only after a submitted or duplicate intake result. Discovery shall not create or own a Knowledge source, capture version, ingestion job, evidence, card, or publication state and shall never invoke, schedule, or retry manual `youtube:capture` or Gemini video analysis. | Epic 19 Story 19.4 - Canonical URL handoff to Knowledge intake without capture ownership. | Covered |
| FR-75 | The Discovery control tower shall prioritize Action Required rather than a KPI dashboard and shall provide Knowledge Mission views for coverage needs, queries, candidates, and funnel progress plus Automation Health views for enablement, schedule, backlog, persistent incidents, telemetry freshness, and safe affected-record detail. | Epic 20 Stories 20.1-20.3 - Action Required, Knowledge Mission, and Automation Health control tower. | Covered |
| FR-76 | Discovery may route high-impact verification or conflict work to the existing Knowledge operator surface but shall not verify, publish, suppress, or otherwise change Knowledge claims. | Epic 20 Story 20.2 - Route verification/conflict work to existing Knowledge ownership. | Covered |
| FR-77 | Discovery shall retain only safe candidate, audit, and deduplication metadata under policy-controlled retention with 180 days as the initial default and shall retain derived comment signals for a shorter policy-controlled period. Retention changes shall not turn those signals into evidence or traveler content. | Epic 18 Story 18.5 - Policy-controlled safe candidate and derived-signal retention. | Covered |
| FR-78 | Discovery shall use only documented YouTube APIs and bounded metadata processing. It shall not introduce browser scraping, undocumented APIs, transcript scraping, video downloads, media persistence, raw comment retention, or an automatic video-analysis path. | Epic 18 Stories 18.4-18.5 - Documented APIs and bounded metadata only; no scraping, transcript, media, raw-comment, or automatic-video-analysis path. | Covered |

### Missing Requirements

None. Every PRD functional-requirement identifier has an explicit entry in the canonical FR Coverage Map. No epic-only FR identifier was found.

### Coverage Statistics

- Total PRD FRs: 131
- FRs covered in epics: 131
- Coverage percentage: 100%
- FRs present only in epics: 0

Roadmap v6.2 traceability is additionally projected from PCR-01..PCR-10, PJ-01..PJ-06, SC-8..SC-12, and AC-28..AC-33 to responsible Epic 21 stories, canonical fixtures, evaluation cohorts, and gates.

## UX Alignment Assessment

### UX Document Status

Found. The canonical traveler UX includes both DESIGN.md and EXPERIENCE.md, and EXPERIENCE.md contains an explicit v6.2 Trip-Aware Planning Addendum covering planning modes, route coverage, required planning needs, and persistent Trip conversion.

### Alignment Issues

1. **Trip correction flow is stale/ambiguous.** UX Flow 3 says a correction updates the relevant chat or selected Trip Project context and immediately confirms the update. For an ordinary chat this is valid, but for a selected Trip it conflicts with FR-13, FR-16D, SC-12, and the proposal boundary unless the UX explicitly shows a pending Trip Change Proposal and owner Apply before durable Trip state changes.
2. **`Dùng trong kế hoạch` is underspecified.** UX Flow 9 lets a traveler choose `Dùng trong kế hoạch` from answer detail but does not state whether that action drafts a typed proposal or persists an item. It must be defined as proposal drafting/review only; it cannot directly mutate a Trip plan.

### Confirmed Alignment

- The v6.2 UX addendum correctly distinguishes current plan, explored change, proposal review, and unscoped/private modes and represents only applied Trip state as current.
- Partial, ambiguous, unsupported, and stale-path behavior uses bounded Vietnamese limitation and recovery language without implying live navigation, traffic, closure, or guaranteed safety.
- Required planning gaps remain visible and cannot be hidden behind unrelated recommendations.
- The server-projected persistent `Chuyển thành chuyến đi` opportunity may suspend on ambiguous/incomplete context and changes no Trip state until explicit conversion and later proposal Apply.
- Architecture AD-39 provides bounded synchronous preflight clarification, scoped evidence, deterministic failure behavior, and owner-derived deletion semantics needed by the UX.
- Architecture AD-40 supports one persistent opportunity, latest eligible manifest refresh, stale-command rejection, atomic Trip/primary-conversation/pending-proposal creation, idempotency, and the no-copy/no-merge ordinary-chat boundary.
- Responsive web, Vietnamese-first copy, keyboard access, visible focus, live regions, 44px mobile targets, reduced motion, and plain-language recovery are supported by the existing Next.js presentation boundary and typed NestJS API contracts.

### Warnings

- The exact public privacy-policy wording remains open in both PRD and UX and must be resolved before public launch.
- Before implementing traveler-facing portions of Epic 21, update UX Flow 3 and Flow 9 language or make the story acceptance criteria explicitly override those stale/ambiguous flow descriptions.

## Epic Quality Review

### Epic Structure

- **User value:** Pass. Epic 21 expresses a coherent traveler outcome rather than a purely technical milestone.
- **Brownfield fit:** Pass. Stories reuse the existing Trip proposal, AI Ask command, direct API, Worker, Retrieval, Search, and Feedback/Eval boundaries.
- **Independence:** Conditional. The sequential chain is understandable, but several stories contain forward or time-gated dependencies that prevent ordinary independent completion.

### Critical Violations

1. **Roadmap v6.2 Definition of Done is not fully owned by the story set.** The coverage table proves RTA-1..RTA-13 and approved PCR/PJ outcomes, but the roadmap and AD-17 also require a scope-first deterministic allowlist, field-aware lexical retrieval inside that allowlist, source-metadata-safe search projections, stable candidate bounds/order, and an FTS-or-deterministic-indexed-lexical production baseline. Story 21.6 says to evolve `knowledge-search.ts` around required needs but has no acceptance criterion for these contracts; Story 21.11 records an FTS deployability spike but does not assign implementation of either allowed lexical baseline. Current code still uses the legacy indexed text/token path and card-count branch. Add explicit story ownership and executable fixtures/gates, or formally narrow/supersede the roadmap DoD in the authoritative architecture/roadmap.

### Major Issues

1. **Story 21.3 can violate PRD useful-initial-guidance behavior.** Its blocked-turn criteria require a concise follow-up and prohibit main synthesis, but do not require the safe useful initial/invariant guidance promised by FR-4 and UJ-1. Clarify that a blocked detailed deliverable still returns any profile-permitted useful partial guidance alongside the question, or update the PRD if clarification-only turns are intended.
2. **Story 21.8 combines two large, separately testable capabilities.** Atomic AI-answer finalization and cross-owner deletion/invalidation have distinct failure matrices and should be separate stories. It also references conversion opportunity invalidation before Story 21.9 creates that owner state; Story 21.9 must explicitly complete deletion integration rather than relying on an owner invalidator “when available.”
3. **Story 21.9 permits acceptance-critical validation to be deferred forward.** Its task allows `TC-13` coverage to be postponed to Story 21.11, even though conversion-projection policy validation belongs to 21.9/21.10 and release qualification cannot substitute for missing functional proof. Make TC-13 mandatory before 21.9/21.10 completion.
4. **Story 21.11 is larger than one independently completable story.** It combines gate-profile persistence, dependency manifests, paired shadow runtime, a time-bounded evidence window, Product Owner approval, cutover, and rollback. Split at least into qualification infrastructure, shadow evidence/report, and cutover/rollback, or represent the evidence/approval phase as a separately tracked gated story.
5. **Story 21.12 mixes behavioral retirement with later physical cleanup.** Physical cleanup depends on rollback-window expiry, a changed qualified target, no unresolved incident, cleanup report, and Product approval. This cannot be completed in the same ordinary delivery slice as behavioral retirement. Split physical cleanup into a later gated story; do not leave 21.12 indefinitely `ready-for-dev` with a time-dependent terminal AC.
6. **Implementation story files do not preserve the canonical BDD acceptance criteria.** `epics.md` contains full Given/When/Then criteria, while all 12 implementation files compress them into four numbered statements. The compressed versions are testable but can lose conditions and ownership details. The development artifacts should embed the full canonical BDD criteria or explicitly state that the canonical criteria are normative and include a verified one-to-one mapping.

### Minor Concerns

- Story 21.5 spans Trip schema migration, proposal operations, route registry publication, Worker behavior, route resolution, server projection, and ten fixtures. It is coherent but high-risk for one story; split if estimation shows more than one normal iteration.
- Story 21.6 similarly spans persistence, retrieval candidate generation, selection, final packing, provenance, and capacity behavior. Its lexical/allowlist ownership must be resolved before sizing can be trusted.
- UX Flow 3 and Flow 9 must be corrected or explicitly overridden in story ACs before traveler-facing implementation.

### Per-Story Readiness

| Story | Assessment |
|---|---|
| 21.1 | Ready after canonical BDD criteria are restored/mapped |
| 21.2 | Ready after canonical BDD criteria are restored/mapped |
| 21.3 | Needs PRD clarification on useful partial guidance |
| 21.4 | Ready after canonical BDD criteria are restored/mapped |
| 21.5 | Functionally aligned; sizing risk |
| 21.6 | Not ready until roadmap lexical/allowlist/search-projection ownership is explicit |
| 21.7 | Functionally aligned |
| 21.8 | Needs split or explicit later conversion-deletion integration |
| 21.9 | Not ready while TC-13 may be deferred |
| 21.10 | Functionally aligned after 21.9 validation is mandatory |
| 21.11 | Needs decomposition and explicit external-gate tracking |
| 21.12 | Needs behavioral-retirement/physical-cleanup split |

### Dependency Sequence

The intended dependency order 21.1 -> 21.2 -> 21.3 -> 21.4 -> 21.5 -> 21.6 -> 21.7 -> 21.8 -> 21.9 -> 21.10 -> 21.11 -> 21.12 is directionally correct. The exceptions are the 21.8/21.9 deletion seam, the 21.9-to-21.11 TC-13 deferral, and the external/time gates embedded in 21.11/21.12.

### Quality Verdict

**NOT READY FOR IMPLEMENTATION AS CURRENTLY WRITTEN.** Product-level FR coverage is complete, but roadmap-level technical coverage, story independence, sizing, and canonical AC preservation require correction before Story 21.1 implementation begins.

## Summary and Recommendations

### Overall Readiness Status

**NOT READY**

Epic 21 has complete PRD identifier coverage and strong architecture-level intent, but the current implementation story artifacts are not sufficiently aligned and independently completable to begin implementation safely.

### Critical Issues Requiring Immediate Action

1. Assign explicit story acceptance criteria and executable proof for the roadmap/AD-17 scope-first lexical pipeline: deterministic allowlist, field-aware lexical baseline, source-metadata-safe projections, stable candidate bounds/order, and the FTS-or-indexed-lexical gate. The current RTA-only mapping does not cover the entire roadmap v6.2 Definition of Done.

### Major Issues Requiring Resolution

1. Resolve Story 21.3 clarification-only behavior against FR-4 and UJ-1 useful-initial-guidance requirements.
2. Split Story 21.8 finalization from deletion/invalidation, or make their separate completion boundaries and later Story 21.9 deletion integration explicit.
3. Remove the Story 21.9 option to defer TC-13 functional validation to Story 21.11.
4. Decompose Story 21.11 into qualification infrastructure, shadow evidence/report, and cutover/rollback or track the evidence/approval phase separately.
5. Split Story 21.12 behavioral retirement from time-gated physical cleanup.
6. Restore full canonical BDD criteria in the 12 implementation story files or provide a verified normative one-to-one AC mapping.

### Recommended Next Steps

1. Update `epics.md` and the relevant architecture/roadmap traceability with explicit ownership for the missing lexical/search-projection DoD; add a new story if this cannot fit safely in 21.6.
2. Update PRD/UX/Story 21.3 wording so safe useful partial guidance versus clarification-only behavior is unambiguous.
3. Correct UX Flow 3 and Flow 9 to preserve proposal-only durable Trip mutation.
4. Restructure 21.8, 21.11, and 21.12; make TC-13 mandatory in 21.9/21.10.
5. Regenerate or edit all implementation story files to preserve complete BDD acceptance criteria and explicit dependencies.
6. Re-run story validation and implementation readiness before sprint execution. Do not start `bmad-dev-story` for 21.1 while the Epic-level critical gap remains unresolved.

### Final Note

This assessment identified one critical roadmap traceability/ownership gap, six major story-readiness issues, and three minor sizing/documentation concerns across roadmap alignment, PRD/UX behavior, dependency independence, and release-gate structure. The prior readiness report concluded READY because it validated the narrowed RTA/PCR/PJ mapping; this re-check additionally compared the stories to the full roadmap v6.2 Definition of Done and current retrieval code, which exposed the missing lexical/search-projection implementation owner.

**Assessor:** BMad Implementation Readiness workflow
**Completed:** 2026-08-13

