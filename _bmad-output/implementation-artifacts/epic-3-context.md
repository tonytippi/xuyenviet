# Epic 3 Context: AI-First Community Knowledge Operations

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Enable operators to convert submitted sources and operator-assisted Facebook captures into auditable, evidence-grounded community knowledge that can safely support later traveler retrieval. Qualifying low-risk facts may become active without manual approval; the workflow instead directs operator effort to version-bound, risk-prioritized review, verification, conflicts, removal, sampling, and Hanoi-to-HCMC seed coverage. This creates a trustworthy knowledge corpus before Epic 4 makes it available to AI Ask.

## Stories

- Story 3.1: Add the AI-First Knowledge Card State Model
- Story 3.2: Create Immutable Source Capture Versions and Retention Boundaries
- Story 3.3: Backfill Bounded Evidence and Verify Legacy Retrieval Safety
- Story 3.4: Establish Source-Version Ingestion Job Claiming
- Story 3.5: Run the Source-Version AI Ingestion Pipeline
- Story 3.6: Recover Ingestion Jobs Without Stale Publication
- Story 3.7: Validate Evidence and Independently Judge Publication (superseded by Story 3.5)
- Story 3.8: Relate Evidence, Preserve Conditions, and Handle Conflicts (superseded by Story 3.5)
- Story 3.9: Operate the AI-Recommended Review and Sampling Queue
- Story 3.10: Propagate Source Removal and State Changes to Search Eligibility
- Story 3.11: Report Active Evidence-Grounded Seed Coverage

## Requirements & Constraints

Knowledge cards must retain their required travel metadata, fixed taxonomy, confidence label, freshness indicator, provenance, conditions, and an exact bounded evidence quote/span before becoming eligible. Traveler-visible facts and evidence must not retain or expose PII, sensitive content, raw material, private source data, provider payloads, or operator-only fields.

Source intake accepts URLs, raw text, copied posts, and images/screenshots. An unreadable Facebook URL remains queued for later operator-run capture rather than failing or entering AI processing. Facebook capture operates only through a confirmed, operator-visible operations tool, never the public request path or unattended crawling; it must not persist credentials, cookies, tokens, local storage, browser profile data, full HTML, or hidden data. Raw Facebook text and evidence default to operator-only. Facebook-derived information is not official unless the source is an identifiable official/provider page.

Automatic publication requires deterministic evidence, privacy, travel-context, safety, commercial-risk, and high-risk-conflict gates plus an independent judge distinct from extraction. The judge thresholds are relevance >= 0.75, extractability >= 0.70, evidence grounding >= 0.90, specificity >= 0.65, actionability >= 0.65, first-hand likelihood >= 0.55, and spam/commercial risk <= 0.25. Scores never override a failed hard gate. High-risk road, safety, EV, price, hours, availability, booking, and promotion claims require verification and review recommendation; until corroborated, they are caveat-only.

Operator review is a prioritized recommendation, not an approval queue or publication prerequisite. Sample 15% of auto-active card versions for the first four weeks and all `verify_first` outcomes. Seed progress counts only active Hanoi-to-HCMC cards with valid current evidence and complete retrieval metadata; the target is 100. Retain source/capture and dependent inactive operational artifacts for no more than 180 days when they support no active or reviewable card, preserving only concise necessary audit history.

## Technical Decisions

Knowledge owns source material, capture versions, jobs, cards, evidence, relations, recommendations, and index dirty markers. Its canonical fact aggregate is `knowledge_card`; extracted candidates are temporary operational outputs, never a second persistent claim aggregate. Cards hold current normalized fact, conditions, confidence, freshness risk, current judge summary, monotonic `content_version`, evidence-set revision, and independent publication, knowledge, review, and verification states.

Publication states are `active`, `suppressed`, and `archived`. Knowledge states are `community_observation`, `community_pattern`, `conditional`, `uncertain`, `conflicted`, `confirmed`, and `superseded`; review states are `none`, `ai_recommended`, `in_review`, and `reviewed`; verification states are `not_required`, `required`, `corroborated`, and `failed`. Only active cards are retrievable. Suppressed, archived, and superseded cards are excluded; uncertain and verification-required cards are caveat-only; conflicted cards cannot support factual itinerary recommendations. A community pattern requires at least two active supporting evidence records with distinct deterministic independence keys.

Capture versions are immutable and content-hashed. Each readable version owns one ingestion job, progressing `queued -> triaging -> extracting -> judging -> relating` to `published`, `suppressed`, `review_recommended`, `verify_first`, or `failed`. Workers claim stages with PostgreSQL `FOR UPDATE SKIP LOCKED`, a lease/fencing token, and expected stage/version. Every stage result and card mutation compare-and-swaps those values so stale or duplicate workers cannot overwrite decisions or publish later. Recapture creates a new version and job without overwriting provenance. Automated work uses the `system-knowledge-pipeline` actor; the submitter remains immutable source/job provenance.

Evidence stores only bounded validated quote/span, exact source/capture reference, observed or captured time, conditions, support, display policy, evidence state, and independence key. Relation candidates are scoped by card type and normalized location/route before independent comparison. Attach only equivalent facts with equivalent conditions; retain materially distinct compatible conditions as separate cards; attach conflicts to the affected card. Limit retrieval-effective evidence to three supporting and one conflicting record, chosen for recency, independence, and quality.

Every material card, evidence, publication, review, verification, conflict, edit, or removal transition must atomically update current state, increment the applicable version, write a meaningful audit event, and add an index dirty marker. Suppression, archival, superseding, high-risk conflict, and source withdrawal immediately disable the search projection. Source removal is a retryable, idempotent Knowledge command: lock dependent evidence/cards, make evidence traveler-invisible, re-evaluate remaining support, downgrade or suppress cards, then hide/delete artifacts. The downstream indexing and retrieval work in Epic 4 must recheck current owner-row eligibility, so an index delay never restores unsafe use.

## UX & Interaction Patterns

Knowledge operations are role-protected, separate from traveler surfaces, and desktop-optimized for dense review. Source intake shows pipeline progress and recoverable failure; failed extraction creates no active card. A recommendation presents current fact, conditions, bounded evidence, state, reasons, `content_version`, and evidence-set revision, then offers evidence-validated editing, suppression/restoration, verification recording/request, or relation/conflict resolution. It must not frame active low-risk cards as awaiting approval. Each resolution is version-bound: a changed card receives a new recommendation rather than inheriting a prior reviewed result. Seed progress distinguishes active community observations/patterns from caveat-only high-risk material and surfaces taxonomy, route/location, review, and verification gaps.

## Cross-Story Dependencies

Story 3.1 establishes the state/version model required by immutable capture, evidence, publication, review, and retrieval-safety work. Story 3.2 supplies immutable capture versions for Story 3.4 job creation; Story 3.3 prevents legacy cards from bypassing evidence and eligibility policy. Story 3.4 provides safe claiming for Story 3.5's vertical pipeline, including validation, independent judging, canonical card mutation, relation handling, and conflict policy formerly assigned to superseded Stories 3.7 and 3.8. Story 3.6 hardens that pipeline with recovery and fencing. Stories 3.9 through 3.11 consume current card/evidence/version state for recommendations, removal propagation, and seed measurement. Epic 4 depends on this epic's active, state-aware, traveler-safe knowledge model and must not treat legacy approval flags or search projections as eligibility authority.
