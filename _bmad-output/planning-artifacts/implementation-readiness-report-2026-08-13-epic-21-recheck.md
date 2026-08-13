---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
overallReadiness: READY FOR SEQUENTIAL STORY VALIDATION
remediationApplied: 2026-08-13
assessmentScope: Epic 21 pre-development recheck
documentsIncluded:
  prd:
    - prds/prd-xuyenviet-2026-07-04/prd.md
    - prds/prd-xuyenviet-2026-07-04/addendum.md
  architecture:
    - architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
    - architecture/architecture-xuyenviet-2026-07-04/README.md
    - architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware-solution-design.md
    - architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md
    - architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md
    - architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md
  epics:
    - epics.md
  ux:
    - ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md
    - ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
  courseCorrection:
    - sprint-change-proposal-2026-08-13.md
  priorAssessment:
    - implementation-readiness-report-2026-08-13-epic-21.md
documentsExcluded:
  - Historical readiness reports
  - YouTube Discovery architecture and UX package
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-13
**Project:** xuyenviet

## Document Inventory

The assessment uses the current main PRD package, progressive main Architecture package, current Epic 21 stories, current traveler UX package, and the 2026-08-13 course-correction proposal. The prior Epic 21 readiness report is comparison evidence only. Historical readiness reports and the separately scoped YouTube Discovery Architecture/UX package are excluded from Epic 21 authority.

No conflicting whole-versus-sharded duplicate was found.

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

### Approved Product-Change Requirements



| PCR | Disposition | PRD references | Architecture/Evaluation follow-up |
| --- | --- | --- | --- |
| `PCR-01` | Approved | FR-31, FR-61, FR-62; §10.4; SC-10; AC-11, AC-31 | Required-need vocabulary, coverage evaluation, and compatibility-trigger retirement |
| `PCR-02` | Approved | FR-65; §10.4; SC-11; AC-32 | Freshness classes, approved live-data authority, and safety evaluation cohorts |
| `PCR-03` | Approved | UJ-5; FR-63, FR-64; AC-30 | Route-resolution representation, reason codes, and fixtures |
| `PCR-04` | Approved | FR-62; SC-10; AC-31 | Evidence/response budgets, prioritization, and coverage measurement |
| `PCR-05` | Approved | FR-16O–Q; §10.7; AC-29 | Canonical Trip path schema, proposal operations, migration, rollback, and stale-reference recovery |
| `PCR-06` | Approved | UJ-5; FR-63; §11; AC-30 | Supported-coverage assertions and traveler-facing coverage projection |
| `PCR-07` | Approved | FR-35; §10.4; AC-11 | Replayable web-scope resolution, query minimization, and provenance mapping |
| `PCR-08` | Approved | UJ-4; FR-16M–P, FR-30; §10.7; SC-9, SC-12; AC-28 | Planning-mode decision, pinned Trip/proposal context, and mode fixtures |
| `PCR-09` | Approved | FR-15; §10.1; AC-8, AC-33 | Deletion transaction, replacement flow, derived-state invalidation, and retention policy |
| `PCR-10` | Approved | §10.5; SC-8–12; AC-28–33 | Versioned evaluation cohorts and numeric gate profile |

**Total PCRs: 10**

### Approved Product Journey Outcomes



| Journey | PRD references | Preserved outcome |
| --- | --- | --- |
| `PJ-01` | UJ-1, UJ-3; FR-16J–K; AC-25–26 | Natural unscoped help can become a Trip only after explicit save/continue; old chat is not reconstructed as confirmed plan |
| `PJ-02` | FR-16M–Q, FR-30; AC-28–29 | Current-plan answers use exact applied Trip state and save new stops only through proposals |
| `PJ-03` | UJ-4; FR-16M–P; SC-9, SC-12; AC-28 | Hypothetical detours preserve the current plan until owner Apply |
| `PJ-04` | UJ-5; FR-63–64; AC-30 | Partial, ambiguous, and unsupported routes still return safe bounded guidance without false end-to-end authority |
| `PJ-05` | FR-61–62; SC-10; AC-31 | Missing required evidence is surfaced or clarified and is never filled with unrelated evidence |
| `PJ-06` | FR-35, FR-65; §10.4; SC-11; AC-11, AC-32 | Recent external warnings remain distinct from live route authority and degrade safely when verification fails |

**Total PJs: 6**

### Additional Requirements and Constraints

- The PRD defines six user journeys (UJ-1..UJ-6), 14 measurable success criteria (SC), and 49 launch acceptance criteria (AC). These are independent traceability obligations even when they overlap an FR or NFR.
- Chat and Trip context are explicitly separated: only the current conversation or an explicitly selected, owner-confirmed Trip may supply durable planning context; pending, dismissed, expired, stale, foreign, or hypothetical state is not current-plan authority.
- Materially incomplete planning context requires concise clarification. Safe invariant guidance may still be supplied, but the system must not silently invent consequential route, traveler, vehicle, duration, budget, accommodation, or activity assumptions.
- Trip conversion is an explicit user action. The system may recommend converting a sufficiently durable ordinary-chat plan, but it must never create or attach a Trip automatically; the conversion projection must use the latest eligible manifest at click time.
- Retrieval is required-need based, not card-count based. Gaps, freshness-sensitive facts, conflicts, applicability uncertainty, and unsupported/partial route coverage control clarification, partial guidance, or scoped web verification.
- Canonical route authority, proposal apply semantics, deletion invalidation, provenance, replay, evaluation cohorts, shadow/cutover/rollback behavior, and retirement of the legacy “fewer than three cards” trigger are required cross-artifact contracts.
- The approved addendum contributes PCR-01..PCR-10 and PJ-01..PJ-06. It requires progressive-disclosure architecture companions, canonical fixtures, and release-gate ownership rather than leaving these outcomes as prose-only intent.
- Privacy, authorization, auditability, Vietnamese-language support, safe traveler wording, least-privilege deployment, forward-only durable-data migration, and fail-closed behavior are recurring constraints across the PRD.
- Deferred or non-MVP capabilities remain out of scope unless separately approved, including booking transactions, payments/rewards, public community submissions, real-time traffic/navigation authority, and unattended Facebook crawling.
- PRD-level open questions remain for the web-search provider, final privacy/retention wording, and image-generation output. The addendum also still labels exact canonical route representation as open; because the current Architecture appears to ratify that mechanism, this item must be checked for stale wording during cross-artifact alignment.

### PRD Completeness Assessment

The PRD and approved addendum provide a strong, versioned requirement baseline. The Epic 21 readiness gate must prove not only FR coverage but also direct ownership of PCR-01..PCR-10, PJ-01..PJ-06, SC-8..SC-12, and AC-28..AC-33, plus the clarification and chat-to-Trip conversion outcomes added after the original v6.2 retrieval package. The remaining provider/privacy/image questions are explicit rather than hidden; whether any is implementation-blocking depends on the stories that claim ownership. The canonical-route “still open” note is a likely stale addendum statement and will be tested against the architecture and epic contracts in later steps.

## Epic Coverage Validation

### Epic FR Coverage Extracted

The current `FR Coverage Map` contains 131 unique FR identifiers. Epic 21 also provides a dedicated v6.2 projection that assigns its planning-context, retrieval, clarification, conversion, deletion, qualification, cutover, rollback, and compatibility-retirement obligations to Stories 21.1..21.16.

### Coverage Matrix

| FR Number | PRD Requirement | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR-1 | The system shall provide a Vietnamese chat interface for authenticated users. | Epic 2 - Vietnamese AI Ask conversation. | ✓ Covered |
| FR-2 | The system shall allow users to ask broad, underspecified road-trip planning questions. | Epic 2 - Broad planning prompts. | ✓ Covered |
| FR-3 | The system shall respond in Vietnamese by default. | Epic 2 - Vietnamese-default answers. | ✓ Covered |
| FR-4 | The system shall provide useful initial guidance even when some trip details are missing. | Epic 2 - Useful initial guidance with incomplete trip details. | ✓ Covered |
| FR-5 | The system shall ask concise follow-up questions when important planning details are missing. | Epic 2 - Concise clarifying questions. | ✓ Covered |
| FR-6 | The system shall support iterative refinement across a conversation. | Epic 2 - Iterative conversation refinement. | ✓ Covered |
| FR-6A | The system shall stream AI Ask assistant responses when the selected Gateway model and orchestration path support streaming, but only after required context, source-bundle, and provenance inputs are assembled. | Epic 4 - Provenance-prepared streaming answers. | ✓ Covered |
| FR-6B | The system shall allow authenticated users to submit supported image inputs with AI Ask messages when using an image-capable Gateway model. | Epic 2 - Authenticated traveler image input. | ✓ Covered |
| FR-6C | The system shall validate image inputs for size, type, ownership, and safety before any provider call, and invalid image submissions shall not create provider calls. | Epic 2 - Pre-provider image validation. | ✓ Covered |
| FR-6D | Once an AI Ask request is admitted and its user message is persisted, browser reloads, chat switches, or HTTP stream disconnects shall not cancel answer generation while the API process remains alive; the browser stream is a best-effort relay and the persisted terminal answer is authoritative when the traveler returns to the conversation. | Epic 10 Stories 10.4-10.5 - API-owned generation survives disconnect and reconciles to persisted terminal state. | ✓ Covered |
| FR-7 | The system shall format travel answers as a calm Vietnamese conversation with suggested plan/options, rationale, practical tips, concise verification guidance when relevant, and next steps. Technical source/provenance, reasoning, audit, processing, and provider information shall not occupy the default traveler reading path. | Epic 2 - Structured and scannable travel answers. | ✓ Covered |
| FR-8 | The system shall require Google Login before a user can ask AI. | Epic 1 - Google-authenticated access. | ✓ Covered |
| FR-9 | The system shall associate chat sessions and trip projects with the authenticated user. | Epic 2 - Owned chats and trip projects. | ✓ Covered |
| FR-10 | The system shall extract travel-relevant details from the current conversation or explicitly selected Trip Project, including adults, children, children's ages when known, preferences, budget, hotel style, driving tolerance, and constraints. It shall not automatically use another trip's details unless the traveler explicitly selects or links that trip. | Epic 2 - Travel-context extraction. | ✓ Covered |
| FR-11 | The system shall reuse relevant context within the current conversation or exact owner-confirmed state of the explicitly selected Trip Project. | Epic 2 - Chat/trip context reuse. | ✓ Covered |
| FR-12 | The system shall distinguish transient conversation intent from the Trip Project's confirmed structured state; conversation text, an AI answer, and a pending, dismissed, or expired proposal shall not become a competing itinerary source of truth. | Epic 2 - Separate chat and trip context. | ✓ Covered |
| FR-13 | The system shall allow users to correct trip details through normal chat messages. | Epic 2 - Chat-based context correction. | ✓ Covered |
| FR-14 | The system shall show users a clear notice that chat and trip details may be stored to support the current session or trip project. | Epic 1 - First-use storage notice. | ✓ Covered |
| FR-15 | The system shall allow owners to delete an ordinary chat or Trip Project. Ordinary-chat deletion shall not mutate an unrelated Trip plan; Trip deletion shall remove its structured state from normal use and invalidate derived retrieval or planning context that could reconstruct it. Deleting a primary conversation shall follow an explicit replacement-or-Trip-deletion flow and shall not implicitly orphan or erase a live confirmed plan. | Epic 2 - Owned chat/project deletion. | ✓ Covered |
| FR-16 | The system shall not store sensitive personal data beyond what is needed for trip personalization. [ASSUMPTION: child data is limited to travel-relevant facts such as age range, comfort needs, and preferences; no full names required.] | Epic 2 - Sensitive context exclusion. | ✓ Covered |
| FR-16A | The system shall let an owner request changes to structured Trip Project anchors, including origin, destination, regions, required stops, and accommodations, through the primary conversation; accepted changes shall be applied only through an explicit Trip Change Proposal confirmation. | Epic 7 - Chat-requested structured Trip Project anchors. | ✓ Covered |
| FR-16B | The system shall let an owner request dated trip legs and activities of type `transport`, `visit`, `food`, `rest`, or `accommodation` through the primary conversation; accepted changes shall be applied only through an explicit Trip Change Proposal confirmation. | Epic 7 - Chat-requested dated legs and activities. | ✓ Covered |
| FR-16C | The system shall give each structured trip item an explicit state of `idea`, `planned`, `confirmed`, or `backup`; an open or `idea` item shall not be treated as an error solely because it is unconfirmed. | Epic 7 - Explicit plan-item states and scoped backups. | ✓ Covered |
| FR-16D | The system shall let an owner request travel-relevant trip-constraint changes, including travelers, children, vehicle/EV needs, driving tolerance, budget range, preferences, and places or activities to avoid, through the primary conversation; accepted changes shall be applied only through an explicit Trip Change Proposal confirmation. | Epic 7 - Chat-requested trip constraints. | ✓ Covered |
| FR-16E | The system shall establish one primary conversation for each Trip Project while preserving owner access to currently linked historic conversations during migration. | Epic 7 - Primary conversation migration and historic conversation preservation. | ✓ Covered |
| FR-16F | The system shall show an owned Trip Project a basic Trip Home that prioritizes an unresolved planning decision when one exists, otherwise the next planned leg or preparation focus, and presents the primary conversation as the central action. | Epic 7 - Deterministic Trip Home and primary conversation access. | ✓ Covered |
| FR-16G | The system shall let AI create a typed Trip Change Proposal containing rationale, affected trip items, alternatives when available, and expiry when its supporting information is time-sensitive. | Epic 7 - Typed, expiring AI Trip Change Proposals. | ✓ Covered |
| FR-16H | The system shall require the Trip Project owner to explicitly apply a Trip Change Proposal before it changes persistent trip state; AI, provider output, and ordinary answer generation shall not directly mutate itinerary, constraints, or item state. | Epic 7 - Owner-confirmed transactional proposal application. | ✓ Covered |
| FR-16I | The system shall preserve an owner-visible history for applied, dismissed, and expired Trip Change Proposals with actor and timestamp. | Epic 7 - Owner-visible proposal change history. | ✓ Covered |
| FR-16J | The logged-in empty chat shall accept a natural-language travel request without requiring a traveler to select ordinary chat or a Trip Project first. The assistant may recommend, but never automatically create, a Trip Project when durable planning context makes saving useful; declining the recommendation is remembered until the context materially changes or the traveler asks to save. | Epic 21 Story 21.9 - Persistent explicit chat-to-Trip opportunity; Epic 16 Story 16.1 is the completed decision-bound baseline. | ✓ Covered |
| FR-16K | For an unscoped question, the system may recommend one or more owned Trip Projects or ask a clarifying question using a server-owned decision. It shall never attach project context without explicit traveler selection; a private answer shall not use or persist the selected project's constraints for that turn. | Epic 21 Story 21.9 - Owner-bound explicit conversion or existing-Trip selection without automatic context attachment. | ✓ Covered |
| FR-16L | A project-scoped composer shall state the active trip in traveler language and provide an explicit way to ask outside it or switch projects. Switching selects the existing primary conversation and shall not merge or copy an ordinary conversation into the project. | Epic 21 Story 21.9 and Epic 16 Story 16.2 - Existing-Trip scope switching without copying or importing ordinary chat. | ✓ Covered |
| FR-16M | For each Trip-scoped answer, the system shall distinguish whether the traveler is asking about the current plan, exploring a hypothetical change, reviewing or validating a pending proposal, or asking outside the Trip. If ambiguity would materially change the answer, it shall ask one concise clarification while still providing any invariant useful guidance. | Epic 21 Story 21.4 - Explicit current, hypothetical, proposal-review, and unscoped planning modes. | ✓ Covered |
| FR-16N | In a current-plan answer, only applied Trip Project state shall be planning authority. A hypothetical request or pending, dismissed, expired, stale, or foreign proposal shall not be represented as the current plan. | Epic 21 Story 21.4 - Applied Trip state is the only current-plan authority. | ✓ Covered |
| FR-16O | A Trip Project shall be able to preserve an owner-selected canonical route or path for a relevant leg with an explicit item state. Free-text route descriptions may be resolved for exploration or proposal drafting but become durable route authority only after an owner-confirmed proposal is applied. | Epic 21 Story 21.5 - Owner-confirmed canonical leg-path persistence. | ✓ Covered |
| FR-16P | Exploring an alternate route, stop, or constraint shall preserve the confirmed plan as the comparison baseline. The system may draft a typed proposal, but only a successful owner Apply action may change the route or constraints used by subsequent current-plan answers. | Epic 21 Story 21.4 - Applied plan remains baseline until proposal Apply. | ✓ Covered |
| FR-16Q | If a stored route reference can no longer be interpreted with the same material meaning, the system shall fail safely and ask the owner to review or refresh it; it shall not silently select a different route. | Epic 21 Story 21.5 - Stale path references fail safely and require owner review. | ✓ Covered |
| FR-17 | The system shall support operator-created knowledge cards. | Epic 3 - Operator-managed knowledge cards. | ✓ Covered |
| FR-18 | Each knowledge card shall include title, type, location or route segment, summary, source, collected date, confidence level, tags, and freshness-sensitive flag. | Epic 3 - Structured card metadata. | ✓ Covered |
| FR-18A | Each AI-extracted community claim shall preserve a short evidence quote, validated source-text span, source link when available, capture date, observed date when known, and identified conditions before it can be active for retrieval. | Epic 3 - Validated evidence and capture provenance. | ✓ Covered |
| FR-18B | The system shall not retain or expose personally identifying or sensitive content in traveler-visible facts or evidence quotes. Direct Facebook-derived quotes and captured text remain operator-only in the public MVP; traveler surfaces may use a XuyenViet-authored paraphrase and practical verification guidance. A canonical Facebook source link may appear only when the source is publicly accessible without authentication or group membership, passes URL-safety policy, and is not subject to a validated removal request. | Epic 3 - Traveler-safe evidence policy. | ✓ Covered |
| FR-18C | Knowledge cards shall preserve validated, bounded practical details needed for traveler guidance. A `route_note` may preserve `ordered_stops` in source order, including intentional repeated stops. | Epic 15 Story 15.2 - Preserve validated bounded practical detail and ordered route observations in target candidate processing. | ✓ Covered |
| FR-18D | The public product shall publish a content-removal contact channel. A credible Facebook source, rights-holder, privacy, or safety request shall hide the affected traveler source link while an authorized operator validates it; a validated request shall invoke the existing source-removal and dependent-knowledge re-evaluation contract. | Epic 15 Story 15.4 - Immediate content-removal safety and dependent-knowledge re-evaluation. | ✓ Covered |
| FR-19 | Knowledge card types shall include place, food, hotel area, activity, service, route note, warning, cost note, parking, EV charging, kid-friendly tip, discount/promotion, and general travel tip. | Epic 3 - Knowledge taxonomy. | ✓ Covered |
| FR-20 | Operators shall be able to create, edit, approve, and archive knowledge cards. | Epic 3 - Explicit operator lifecycle actions. | ✓ Covered |
| FR-21 | Knowledge cards in `active` lifecycle state shall be used for normal AI retrieval when their current evidence remains eligible. Operator approval is optional and must not be a prerequisite when an AI-extracted community claim meets the active-publication policy. | Epic 3 - AI-first active publication without mandatory approval. | ✓ Covered |
| FR-22 | Knowledge cards shall preserve source provenance enough for users or operators to inspect where the information came from. | Epic 3 - Source provenance. | ✓ Covered |
| FR-22A | Every knowledge card shall have exactly one lifecycle state: `draft`, `pending_operator`, `active`, `suppressed`, `archived`, or `rejected`. | Epic 15 - One target card lifecycle state. | ✓ Covered |
| FR-22B | The system shall track domain classification separately from workflow as `community_observation`, `community_pattern`, `conditional`, or `conflicted`; it shall not use workflow terms such as `uncertain`, `confirmed`, or `superseded` as a card classification. | Epic 15 - Domain classification separated from workflow lifecycle. | ✓ Covered |
| FR-22C | The system shall track verification requirement separately as `none`, `operator_required`, or `failed`. Independent corroboration is derived from eligible evidence with distinct independence keys; an operator decision is recorded in operator-work resolution and audit history. | Epic 15 - Verification requirement separated from lifecycle and derived corroboration. | ✓ Covered |
| FR-22D | The system shall exclude every card other than an evidence-eligible `active` card from normal retrieval. A `pending_operator` card is never traveler-retrievable. | Epic 15 Story 15.4 - Active cards require eligible evidence and fail-closed retrieval projection. | ✓ Covered |
| FR-23 | Operators shall be able to submit raw source material as URL, raw text, copied post content, or image/screenshot. | Epic 3 - Operator source intake. | ✓ Covered |
| FR-23A | The system shall support queued Facebook URLs whose visible post content can be captured later by an operator-run browser automation tool. | Epic 3 - Queued Facebook capture. | ✓ Covered |
| FR-23B | Facebook capture automation shall populate operator-only raw source material only after operator-visible content is extracted and confirmed; it shall not store browser credentials, cookies, tokens, local storage, full HTML dumps, or hidden page data. | Epic 3 - Operator-only Facebook capture boundary. | ✓ Covered |
| FR-23C | For each immutable Facebook capture version, the operator capture queue shall distinguish technical processing progress from candidate publication outcomes. A completed source may contain mixed candidate results, including candidates that need operator action, without misrepresenting the source as wholly published or rejected. | Epic 15 Story 15.2 - Canonical technical ingestion-job status and idempotent candidate counters; Epic 14 Story 14.4 - Safe direct admin capture queue projections, canonical status, filters, counts, and ordering. | ✓ Covered |
| FR-24 | The system shall use AI to triage submitted source material, discover structured scoped candidates, and independently validate each publishable claim against an exact evidence span from the immutable source. AI-proposed evidence locations shall not be accepted when they cannot be matched uniquely and safely to that source. | Epic 3 - AI triage, extraction, and evidence validation. | ✓ Covered |
| FR-24A | The system shall classify AI-triaged source material as rejected, context-only, or candidate-bearing, and shall retain candidate AI disposition and decision reasons for audit and quality evaluation. | Epic 3 - Triage classifications and reasons. | ✓ Covered |
| FR-24B | The system shall use an independent AI evaluation step to decide whether an extracted candidate receives `apply`, `needs_operator`, or `discard`; the extractor shall not be the sole publication decision-maker. | Epic 3 - Independent publication judge. | ✓ Covered |
| FR-24C | The system shall discover and process every independently useful atomic claim supported by a submitted immutable source version; it shall not discard otherwise qualifying claims merely because a source contains many claims or a prior sibling claim was accepted. | Epic 3 - Complete immutable-source candidate discovery and processing. | ✓ Covered |
| FR-24D | The system shall give each discovered candidate an independent, auditable processing result and immutable AI disposition and reason when completed; failed candidates shall have no business disposition. A source completes only after discovery is terminal and every candidate has completed or failed, and may complete successfully with mixed dispositions or when no candidate is applied. | Epic 3 - Candidate-level terminal outcomes and source completion. | ✓ Covered |
| FR-24E | When a newer source capture supersedes an earlier immutable version, work from the earlier version shall not create, attach, conflict with, or otherwise mutate active knowledge. Historical ingestion behavior shall remain intelligible when newer ingestion capabilities are introduced. | Epic 3 - Supersession-safe source-version claiming, processing, and recovery. | ✓ Covered |
| FR-24F | For a source describing an itinerary, the system shall preserve a route note's source-order stop sequence, including intentional repeats, and shall extract each independently useful scoped observation about a named place, venue, or route option as a sibling candidate. Bare stop labels alone shall not become knowledge-card candidates. | Epic 15 Story 15.2 - Preserve ordered route observations and independent useful candidate outcomes. | ✓ Covered |
| FR-25 | The system shall make a claim searchable without human approval only when it has validated evidence, sufficient travel specificity and actionability, no sensitive content, no high commercial/spam risk, and no unresolved high-risk conflict. | Epic 3 - Evidence-grounded automatic publication policy. | ✓ Covered |
| FR-25A | The system shall create risk-prioritized operator work, not a mandatory approval gate, for verification, relation, risk, or missing-context decisions. An authorized operator may publish, revise and requeue, or suppress a card with available validated evidence without changing the candidate's original AI disposition. Stale or superseded work shall have no mutation effect, and an active card shall have no unresolved primary operator work. | Epic 3 - Risk-prioritized review recommendations. | ✓ Covered |
| FR-25B | The system shall support quality sampling of active claims so operators can measure false-positive publication without delaying normal ingestion. Sampling is quality monitoring rather than publication approval and remains separate from actionable operator work. A high-severity sampling failure shall contain the affected cohort without changing unrelated knowledge. | Epic 3 - Quality sampling. | ✓ Covered |
| FR-26 | The system shall preserve machine-readable source classification, verification state, evidence support, freshness, and provenance for policy, audit, and traveler-safe wording. These internal fields shall not be exposed as default traveler confidence labels. | Epic 3 - Internal source, verification, evidence, freshness, and provenance metadata. | ✓ Covered |
| FR-27 | The system shall allow operators to mark facts as freshness-sensitive when they involve price, schedule, availability, road condition, opening hours, weather, or service status. | Epic 3 - Freshness-sensitive facts. | ✓ Covered |
| FR-28 | The system shall support a minimum public-MVP seed set of 100 active knowledge cards across the Hanoi-to-HCMC corridor. [ASSUMPTION: 100 is enough to test retrieval quality while remaining feasible for initial public launch.] | Epic 3 - Active evidence-grounded seed progress. | ✓ Covered |
| FR-28A | Authorized operators shall have an aggregate-only seed-coverage report that counts only active Hanoi-to-HCMC cards with complete retrieval metadata and valid bounded evidence from eligible retained sources. It shall show taxonomy and route/location gaps, including zero-count buckets; distinguish countable community observations or patterns from caveat-only material; and surface current review, verification, source, and recommendation work without exposing raw capture content, URLs, quotes, provider payloads, or removal internals. | Epic 3 Story 3.11 - Aggregate-only active evidence-grounded seed coverage; Epic 14 Story 14.4 - Direct safe admin projection. | ✓ Covered |
| FR-29 | The system shall retrieve relevant cards only when `lifecycle_state = active`, current evidence is eligible, and domain classification and verification requirement permit the requested use. | Epic 4 - State-aware active knowledge retrieval. | ✓ Covered |
| FR-30 | The system shall first determine whether the turn is unscoped, about the applied current Trip plan, exploring a change, or reviewing a proposal. It shall then assemble only the context authorized for that mode before using applicable active XuyenViet knowledge, scoped web verification, and general AI knowledge. It shall not resolve conflicts through a precedence rule between Trip state and chat text. | Epic 4 - Context priority pipeline. | ✓ Covered |
| FR-31 | The system shall use web search when a required planning need has no applicable active evidence, when a relevant fact requires fresh verification, or when pending, conflicted, or otherwise ineligible knowledge leaves a material evidence gap. Card count alone shall not determine whether evidence is sufficient. | Epic 4 - Web fallback conditions. | ✓ Covered |
| FR-32 | The system shall persist and make auditable whether answer information came from chat/trip context, XuyenViet knowledge cards, web search, or general AI reasoning. This classification is not default traveler-facing copy. | Epic 4 - Persisted answer provenance categories. | ✓ Covered |
| FR-32A | Persisted provenance shall distinguish evidence made available to answer generation from evidence materially attributed to the completed answer. Attribution shall resolve only to evidence available for that same answer and shall never invent a source. | Epic 11 Story 11.3 - Material answer attribution resolves only to same-answer available evidence. | ✓ Covered |
| FR-32B | Missing or malformed material-attribution output shall not invalidate an otherwise safe answer, but it shall not create material attribution or traveler source detail that the system cannot validate. | Epic 11 Story 11.3 and Epic 10 Story 10.4 - Invalid attribution is omitted without inventing provenance or rewriting a safe completed answer. | ✓ Covered |
| FR-33 | The system shall warn users to verify changing details before acting or booking. | Epic 4 - Changing-detail verification warnings. | ✓ Covered |
| FR-34 | The system shall avoid presenting unverified collected information as guaranteed fact. | Epic 4 - Non-guaranteed unverified wording. | ✓ Covered |
| FR-35 | Web information used in an answer shall retain external provenance and practical verification guidance and shall never be implied to be confirmed merely because it is displayed. A route- or place-specific web fact may be used as a factual premise only when its applicable geography and time resolve consistently with the current planning need; an unresolved or mismatched result remains a verification lead and does not satisfy that need. | Epic 4 - External web provenance and practical verification guidance. | ✓ Covered |
| FR-61 | Retrieval shall evaluate applicable evidence against explicit required planning needs. Multiple items covering the same need shall not conceal a missing route, safety, family, vehicle, stop, or other required need, and unrelated evidence shall not be used to make an answer appear complete. | Epic 21 - Required-need coverage cannot be hidden by duplicate or unrelated evidence. | ✓ Covered |
| FR-62 | When available evidence or response capacity cannot cover every required planning need, the system shall prioritize consequential route, safety, and traveler constraints; provide any safe useful partial guidance; identify the uncovered need concisely; and offer a permitted clarification or verification action instead of silently omitting it. | Epic 21 - Capacity-safe prioritization, useful partial guidance, and explicit gaps. | ✓ Covered |
| FR-63 | The product shall communicate its supported route-planning coverage in traveler language. Outside supported coverage, it may provide clearly scoped endpoint, place, general, or external-reference guidance, but shall not claim end-to-end route applicability. | Epic 21 - Traveler-language supported route coverage. | ✓ Covered |
| FR-64 | For routes with no supported path, partial supported coverage, or materially ambiguous alternatives, the system shall provide bounded useful behavior appropriate to that condition and shall not use incomplete coverage, nationwide advice, source prestige, or text similarity to manufacture route authority. | Epic 21 - Safe bounded behavior for partial, ambiguous, and unsupported routes. | ✓ Covered |
| FR-65 | A recent warning may be presented with its source, applicable place/time, and practical verification action, but shall not be stated as live closure, traffic, navigation, or guaranteed route-safety authority unless an approved live-data capability supports that claim. | Epic 21 - Recent warnings remain distinct from live route authority. | ✓ Covered |
| FR-36 | The system shall prefer official/provider pages over reposted or unattributed sources when using web search fallback. | Epic 4 - Official/provider web preference. | ✓ Covered |
| FR-37 | Facebook-derived information shall not be treated as official unless it comes from an identifiable official/provider page. In the public MVP, direct Facebook evidence quotes and captured text are operator-only; traveler answers may use a safe XuyenViet-authored paraphrase with provenance-aware verification guidance and a canonical source link only under the public-access, URL-safety, and removal conditions in FR-18B. | Epic 3 - Facebook community-source trust policy. | ✓ Covered |
| FR-37A | The system shall present a community observation, pattern, or conditional claim with its appropriate uncertainty wording and shall not represent it as an official fact. | Epic 4 - State-appropriate community wording. | ✓ Covered |
| FR-37B | The system shall only describe a claim as a community pattern when multiple independent supporting evidence records exist. | Epic 3 - Independent evidence required for community pattern. | ✓ Covered |
| FR-37C | The system shall not use `conflicted` knowledge as a factual premise for itinerary recommendations; it may use it to surface uncertainty, ask a clarifying question, recommend verification, or choose a safer alternative. | Epic 4 - No factual itinerary premise from conflict. | ✓ Covered |
| FR-38 | When children are part of the trip, the system shall consider shorter driving blocks, rest stops, child-friendly activities, learning opportunities, hotel convenience, and backup activities. | Epic 5 - Family-aware pacing and alternatives. | ✓ Covered |
| FR-39 | The system shall identify places or activities that may be unsuitable or boring for children when relevant. | Epic 5 - Child suitability guidance. | ✓ Covered |
| FR-40 | The system shall suggest family-relevant tips such as child discounts when known from sources. | Epic 5 - Sourced family tips. | ✓ Covered |
| FR-41 | The system shall balance parent goals with child comfort and experience. | Epic 5 - Parent/child tradeoff balance. | ✓ Covered |
| FR-42 | The system shall allow public sign-in without an email allowlist, but AI Ask shall require an authenticated Google user. | Epic 1 - Public sign-in without allowlist. | ✓ Covered |
| FR-43 | The system shall provide an operator/admin area separate from traveler chat. | Epic 1 - Traveler-separate, role-gated admin access. | ✓ Covered |
| FR-44 | The system shall support at least one admin/operator account for initial knowledge management. | Epic 1 - Initial admin/operator capability. | ✓ Covered |
| FR-45 | The system shall allow future expansion to multiple operators without redesigning the knowledge workflow. | Epic 1 - Extensible operator roles. | ✓ Covered |
| FR-45A | The operator capture-review surface shall show safe aggregate and candidate-level ingestion outcomes sufficient to diagnose a source without exposing raw provider output, raw captured text, quotes outside approved evidence storage, or internal execution secrets. | Epic 3 - Safe operator ingestion outcome diagnostics. | ✓ Covered |
| FR-45B | Exact administrators shall be able to view a paginated user roster limited to name, email, avatar, verification state, and roles; grant or revoke only `operator` and `admin` roles; and receive an audit record for each role delta. Operators shall not access the roster or role mutations, and the system shall prevent removal of the final administrator or an administrator's own final admin role. | Epic 14 Story 14.4 - Direct exact-admin roster and audited role governance; historical Epic 13 Story 13.2 is completed extraction evidence only. | ✓ Covered |
| FR-45C | The exact-admin user roster shall show each displayed user's lifetime persisted AI-event count and prompt and completion token totals. It shall include successful and failed events, treat null token values as zero, aggregate only the paginated roster user IDs, and expose neither prompts nor provider payloads; it shall not introduce quotas, credits, billing, or traveler/operator access. | Epic 14 Story 14.4 - Direct exact-admin roster usage aggregates; historical Epic 13 Story 13.2 is completed extraction evidence only. | ✓ Covered |
| FR-46 | The system shall capture a simple usefulness rating for AI answers during the public MVP through lightweight answer-footer controls. Optional reasons or comments appear only after negative feedback and never block the composer or displace planning. | Epic 5 - Answer usefulness feedback. | ✓ Covered |
| FR-46A | Traveler-facing UI shall express loading, unavailable, verification, and failure states in plain Vietnamese with the practical effect and recovery action. It shall not display internal status names, provider/model names, technical error codes, request IDs, source/provenance taxonomy, retrieval policy, audit terminology, or implementation diagnostics. | Follow-on chat-first UX epic - Plain-language traveler state projections. | ✓ Covered |
| FR-47 | The system shall record AI usage events for authenticated AI requests, including user, conversation or trip context when applicable, AI purpose, provider/model, timestamp, and available usage/cost metadata. | Epic 4 - Authenticated AI usage events. | ✓ Covered |
| FR-48 | The system shall capture referral attribution when a new user signs in or registers through a valid referral link, without calculating rewards, ranking, payout, or credit conversion in MVP. | Epic 1 - Silent referral attribution. | ✓ Covered |
| FR-49 | The system shall manage AI Gateway model records with gateway model name, intended purpose, supported input/output capabilities, active status, and input/output/cache pricing metadata. | Epic 4 - Managed AI Gateway model records. | ✓ Covered |
| FR-49A | Exact administrators shall be able to create, update, set one eligible active default per purpose, and archive AI Gateway model records without deletion. Each pricing record shall be versioned, effective-dated, currency-specific, deterministic, and non-negative; archived records shall not be defaults, and credentials and provider payloads shall not be exposed. | Epic 14 Story 14.4 - Direct exact-admin AI Gateway model-catalog management. | ✓ Covered |
| FR-50 | The system shall use configured model pricing metadata to estimate AI usage cost when provider usage token metadata is available, without creating credit balance or billing behavior in MVP. | Epic 4 - Internal cost estimation. | ✓ Covered |
| FR-51 | The system shall expose versioned domain API contracts for traveler, operator, and future client surfaces without dependence on one presentation framework's internal transport or session representation. | Epic 14 Stories 14.1-14.4 - Direct versioned domain APIs for traveler and operator clients. | ✓ Covered |
| FR-52 | Traveler and operator clients shall use the protected versioned API without receiving database credentials or internal service credentials. | Epic 14 Stories 14.1 and 14.4 - Direct browser API access through NestJS-managed secure sessions. | ✓ Covered |
| FR-53 | The system shall provide a separately deployed operator/admin application with its own origin and release lifecycle that uses the protected API without database credentials or direct domain imports. | Epic 13 Stories 13.1-13.2 and Epic 14 Story 14.4 - Separately deployed operator application with protected API ownership. | ✓ Covered |
| FR-54 | The system shall authorize every protected API read and command against the current authenticated principal and current authorization state. | Epic 14 Story 14.1 - Live opaque-session principal and current authorization checks. | ✓ Covered |
| FR-55 | The system shall provide a stable API error contract with machine-readable code, safe message, request/correlation ID, and applicable safe field violations without sensitive internals. | Epic 14 Story 14.1 - Stable safe direct-API error contract. | ✓ Covered |
| FR-56 | The system shall document versioned health/version and protected-capability API contracts, including validation, authorization, ownership, pagination/stable ordering, streaming semantics where applicable, and browser-session/CSRF admission requirements. | Epic 14 Stories 14.1-14.4 - Documented health/version and protected capability contracts. | ✓ Covered |
| FR-57 | The system shall run continuous and scheduled background work independently from traveler request handling, with bounded execution, safe recovery, and idempotent outcomes. | Epic 12 Stories 12.1-12.2 - Dedicated Worker runtime and bounded scheduled sweeps using existing PostgreSQL protocols. | ✓ Covered |
| FR-57A | Post-answer enrichment may add derived context, answer annotations, or user-confirmable proposal actions, but shall not change completed answer text, terminal command outcome, initial provenance, or successful-answer usage. | Epic 10 Stories 10.3-10.4 - Post-answer consumers cannot rewrite completed answer, provenance, outcome, or usage. | ✓ Covered |
| FR-58 | The system shall preserve one writer per aggregate command during migration and never dual-write product state. | Epic 14 Stories 14.2-14.5 - One writer per aggregate during direct-API migration. | ✓ Covered |
| FR-59 | AI Ask streaming through the versioned API shall preserve preparation, incremental delivery, explicit completion or failure, disconnect tolerance, and atomic terminal persistence. | Epic 10 Story 10.5 and Epic 14 Story 14.2 - Versioned API streaming with preserved NDJSON and atomic terminal behavior. | ✓ Covered |
| FR-59A | Provider-specific stream completion variations may be accepted only when the response is well-formed, contains usable answer content, and contains no provider-declared or parsing failure; an ambiguous or malformed completion fails safely. | Epic 10 Stories 10.2 and 10.5 - Provider completion variations must validate or fail safely before terminal persistence. | ✓ Covered |
| FR-60 | Before public launch, the system shall retire superseded authentication, domain-transport, writer, and operator surfaces so every protected capability has one current owner and no legacy mutation path remains active. | Epic 14 Story 14.5 - Retire Auth.js, BFF runtime, legacy writers, and legacy admin surface. | ✓ Covered |
| FR-66 | The system shall generate and refresh scoped YouTube Discovery query proposals from knowledge coverage gaps, freshness risk, unresolved conflicts, and safe aggregated traveler-demand signals, and shall support operator-created queries in the same governed workflow. | Epic 18 Stories 18.2-18.3 - Governed system/operator Discovery query proposals. | ✓ Covered |
| FR-67 | Authorized operators shall be able to inspect a query's origin, reason, priority, text, schedule context, and enabled or paused state and to create, edit, reprioritize, pause, or resume operator-managed queries. | Epic 18 Story 18.3 - Authorized query inspection, management, and scheduling context. | ✓ Covered |
| FR-68 | An authorized operator shall be able to enable or disable Discovery globally. Disabling stops new Discovery planning, search, enrichment, triage, provider calls, and writes safely; it shall not alter queued Knowledge sources, completed knowledge, or manual `youtube:capture` work. | Epic 18 Story 18.2 and Epic 20 Story 20.4 - Global Discovery disablement without changing Knowledge/manual capture. | ✓ Covered |
| FR-69 | While permitted by global and query policy, the system shall run bounded scheduled discovery through documented YouTube Data API capabilities and deduplicate eligible individual public videos into canonical URL candidates without downloading or storing video media. | Epic 18 Story 18.4 - Bounded documented YouTube API discovery and canonical URL deduplication. | ✓ Covered |
| FR-70 | Candidate enrichment shall retain only bounded safe video/channel metadata and closed derived comment signals needed for triage. Comments shall never become evidence, capture material, knowledge cards, retrieval input, or traveler content. | Epic 18 Story 18.5 - Bounded safe metadata and non-evidence derived comment signals. | ✓ Covered |
| FR-71 | The system shall validate bounded AI metadata triage and combine it with deterministic eligibility and ranking policy to produce `skip`, `defer`, or `consider` recommendations. Neither model output nor popularity establishes factual correctness, credibility, evidence, or publication eligibility. | Epic 19 Stories 19.1-19.2 - Validated AI metadata triage plus deterministic eligibility/ranking. | ✓ Covered |
| FR-72 | Authorized operators shall receive a ranked, one-at-a-time candidate review experience with safe metadata, a plain-language recommendation, concise factors and penalties, bounded derived signals, and prior safe capture outcome when available. | Epic 19 Story 19.3 - Ranked explainable one-at-a-time candidate review. | ✓ Covered |
| FR-73 | Authorized operators shall be able to Accept, Defer, or Skip a candidate through role-protected, audited commands. A failed or unknown result remains recoverable and shall not claim that a Knowledge source or capture exists. | Epic 19 Story 19.5 - Protected audited Accept/Defer/Skip and recoverable unknown outcomes. | ✓ Covered |
| FR-74 | Accept shall submit only the canonical URL to the existing Knowledge intake API and shall record success only after a submitted or duplicate intake result. Discovery shall not create or own a Knowledge source, capture version, ingestion job, evidence, card, or publication state and shall never invoke, schedule, or retry manual `youtube:capture` or Gemini video analysis. | Epic 19 Story 19.4 - Canonical URL handoff to Knowledge intake without capture ownership. | ✓ Covered |
| FR-75 | The Discovery control tower shall prioritize Action Required rather than a KPI dashboard and shall provide Knowledge Mission views for coverage needs, queries, candidates, and funnel progress plus Automation Health views for enablement, schedule, backlog, persistent incidents, telemetry freshness, and safe affected-record detail. | Epic 20 Stories 20.1-20.3 - Action Required, Knowledge Mission, and Automation Health control tower. | ✓ Covered |
| FR-76 | Discovery may route high-impact verification or conflict work to the existing Knowledge operator surface but shall not verify, publish, suppress, or otherwise change Knowledge claims. | Epic 20 Story 20.2 - Route verification/conflict work to existing Knowledge ownership. | ✓ Covered |
| FR-77 | Discovery shall retain only safe candidate, audit, and deduplication metadata under policy-controlled retention with 180 days as the initial default and shall retain derived comment signals for a shorter policy-controlled period. Retention changes shall not turn those signals into evidence or traveler content. | Epic 18 Story 18.5 - Policy-controlled safe candidate and derived-signal retention. | ✓ Covered |
| FR-78 | Discovery shall use only documented YouTube APIs and bounded metadata processing. It shall not introduce browser scraping, undocumented APIs, transcript scraping, video downloads, media persistence, raw comment retention, or an automatic video-analysis path. | Epic 18 Stories 18.4-18.5 - Documented APIs and bounded metadata only; no scraping, transcript, media, raw-comment, or automatic-video-analysis path. | ✓ Covered |

### Missing Requirements

No PRD functional requirement is absent from the current epic coverage map.

### Epic-Only FR Identifiers

No FR identifier appears in the epic coverage map without a matching PRD requirement.

### Coverage Statistics

- Total PRD FRs: 131
- FRs covered in epics: 131
- Missing FRs: 0
- Epic-only FR identifiers: 0
- Coverage percentage: 100.0%

This step validates traceability presence only. It does not yet accept broad epic-level claims as sufficient story quality; Story 21 ownership and acceptance-criterion adequacy are evaluated in the later epic-quality step.

## UX Alignment Assessment

### UX Document Status

**Found.** The active traveler UX contract is split between `DESIGN.md` and `EXPERIENCE.md`. The 2026-08-13 course correction has been applied to the two previously conflicting Trip-mutation flows: ordinary-chat correction remains transient, selected-Trip correction drafts a proposal, and `Dùng trong kế hoạch` cannot directly mutate a Trip.

### UX ↔ PRD Alignment

- Planning-mode language, applied-Trip authority, bounded partial/ambiguous/unsupported-route guidance, explicit required gaps, verification wording, deletion behavior, and explicit proposal Apply align with FR-5, FR-15, FR-16J..FR-16Q, FR-30..FR-35, and FR-61..FR-65.
- The v6.2 addendum now names the persistent server-projected `Chuyển thành chuyến đi` action, latest eligible context, suspension on ambiguity/incompleteness, and the no-mutation-before-convert-and-Apply boundary.
- Existing conversational rules support repeated clarification: Vietnamese-first copy, only a few concise follow-up questions, practical recovery states, preserved composer focus, and no internal profile/model/state terminology.

### UX ↔ Architecture Alignment

- AD-39's server-owned multi-turn clarification, scoped values, per-deliverable readiness, bounded assumptions, and clarification-only terminalization support the UX without requiring a new form-first surface.
- AD-40's stable opportunity ID, server-revisioned latest manifest, visible-disabled pending state, explicit dismissal, idempotent conversion, separate primary conversation, and initial pending proposal support the persistent conversion interaction.
- Planning-mode, canonical-path, deletion-invalidation, required-need, web-scope, and provenance decisions supply the data and ownership needed by the traveler projections.

### Resolved Alignment Issues

The following documentation ambiguities were found during the recheck and are closed in the current artifacts.

1. **Persistent eligibility versus persistent callout — closed.** UX now states that persistence belongs to server opportunity state across turns/navigation, while the visual treatment remains an inline action rather than a sticky banner.
2. **Stale UX metadata — closed.** Both UX files now declare `updated: 2026-08-13` and cite the current v6.2/correct-course sources.

### Warnings

No missing architecture capability, unresolved direct-Trip-mutation conflict, or active UX warning remains. `DESIGN.md` and `EXPERIENCE.md` now distinguish persistent server opportunity state from a non-sticky inline visual treatment and carry current update metadata.

## Epic Quality Review

### Epic Structure

Epic 21 is outcome-oriented: travelers gain context-complete clarification, Trip-authority safety, required-need retrieval, scoped verification, and explicit review-first Trip conversion. Its later Product Owner stories are release-safety work inside that user outcome rather than a separate infrastructure-only epic. Brownfield integration points, forward migrations, one-writer boundaries, existing API/worker reuse, and test boundaries are generally explicit.

### Resolved Dependency And Story Findings

The following handoff defects were identified in the initial pass and then closed by the approved direct adjustment.

#### Closed major issues

1. **Dependency chain propagation — closed.** Epic 21 now publishes one authoritative sequence, and guides 21.9, 21.11, and 21.12 declare their direct prerequisites.
2. **Deletion and cleanup ownership — closed.** Story 21.13 owns deletion invalidation; Story 21.8 owns finalization only. Story 21.12 owns behavioral retirement; Story 21.16 owns later G3 physical cleanup.
3. **Story 21.12 forward-completion contradiction — closed.** Its AC mapping now treats blocked cleanup/runnable compatibility as the current proof and Story 21.16 as later execution, not a prerequisite.
4. **Contradictory story-validation artifact — closed.** The active report now has one final verdict, covers Stories 21.1-21.16, and agrees with the current `backlog` sprint status and just-in-time validation policy.

#### Minor concerns

1. **Guide source-anchor mismatch — closed.** Obsolete companion aliases were replaced with current headings for clarification, planning authority, canonical paths, required needs, web evidence scope, replay identity, and deletion.

2. **Retained non-blocking delivery caution.** Story-size risk remains concentrated in 21.6 and 21.9. Both are cross-layer changes with multiple independently testable surfaces. The scope is coherent enough to retain, but sprint planning should use task-level checkpoints and avoid marking either complete from only its happy path.

### Acceptance Criteria And Testability

- All 16 canonical stories use testable Given/When/Then criteria in `epics.md`; guides provide numbered one-to-one mappings and name fixtures, failure behavior, idempotency/concurrency, ownership, and unit versus serial PostgreSQL checks.
- Stories 21.13-21.16 are intentionally external-gate or release-action stories; unavailable evidence/approval must block completion rather than be simulated.
- No new service, queue, cache, model purpose, feature flag, or environment authority is introduced for clarification or conversion.

### Quality Verdict

**Ready for sequential story validation and handoff.** Product, architecture, UX, Epic 21, and implementation guides now use one dependency/ownership model. This does not make all 16 stories simultaneously `ready-for-dev`; Story 21.1 is the next story to validate just in time, and later external evidence/approval gates remain mandatory.

## Summary and Recommendations

### Overall Readiness Status

**READY FOR SEQUENTIAL STORY VALIDATION.**

The product, architecture, UX behavior, FR traceability, Epic 21 dependency chain, and story-guide ownership are aligned: 131/131 PRD functional requirements are represented, and all 16 canonical stories have testable acceptance criteria. The four handoff defects found in the initial pass are closed.

### Critical Issues Requiring Immediate Action

None. No active PRD, Architecture, UX, Epic, dependency, ownership, or validation-report blocker remains.

### Recommended Next Steps

1. Run `bmad-create-story` validation for Story 21.1 against the corrected sources in a fresh context.
2. If it passes, move only Story 21.1 from `backlog` to `ready-for-dev` and begin `bmad-dev-story`.
3. Continue through the authoritative dependency chain and validate each later story just in time.
4. Treat Stories 21.14-21.16 as real evidence/approval/time gates; never mark them complete from local code or fixture success alone.

### Final Note

This assessment identified and closed **4 major handoff issues** and **3 minor documentation warnings** across story dependency/ownership, validation evidence, source references, and UX/document currency. One non-blocking story-sizing caution remains for 21.6 and 21.9. PRD and Architecture did not require reopening. Story 21.1 just-in-time validation is the next required workflow gate.
