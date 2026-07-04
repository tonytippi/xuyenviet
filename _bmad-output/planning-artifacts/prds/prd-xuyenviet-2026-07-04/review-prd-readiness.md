# PRD Readiness Review — XuyenViet AI Travel Information MVP

- **PRD:** `/home/sonnh/projects/xuyenviet/_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`
- **Addendum:** `/home/sonnh/projects/xuyenviet/_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/addendum.md`
- **Review focus:** readiness to proceed to UX, architecture, and epics
- **Verdict:** Not ready to proceed without targeted resolution of blockers

## Overall Verdict

The PRD has a strong MVP thesis: validate whether a Vietnamese AI Ask surface, grounded in user memory and curated travel knowledge, can outperform generic AI for Hanoi-to-HCMC road-trip planning. It is directionally ready for discussion with UX and architecture, but not ready for formal downstream production of UX specs, architecture spine, or epics because multiple phase-blocking decisions are explicitly deferred and many requirements lack testable acceptance criteria.

Proceeding now would likely produce divergent UX assumptions, unstable architecture choices, and epics that encode guesses around privacy, web search, beta access, source display, answer quality, and minimum content readiness.

## Gate Recommendation

- **Do not proceed directly to UX/architecture/epics as final inputs.**
- **Do run a focused PRD update pass first** to resolve critical/high items below.
- **UX can start only as exploratory wireframing** for AI Ask and operator knowledge cards, with unresolved decisions marked as assumptions.
- **Architecture can start only as option framing/spikes** for memory, retrieval, source grounding, and web search provider selection, not as a committed architecture.
- **Epics should wait** until acceptance criteria and minimum beta readiness are clarified.

## Critical Blockers

### 1. Privacy and retention rules for persistent user memory are unresolved

**Severity:** Critical  
**Locations:** PRD §8.2 FR-9 to FR-13, §9 NFR-2, §12 R-5, §13 OQ-3; Addendum §25 Deferred Decisions

The PRD requires persistent authenticated user memory and profile extraction, including children, preferences, prior trips, budget, hotel style, and constraints. It also assumes OpenAI processing is acceptable. However, it leaves privacy controls, retention, correction semantics, deletion, visibility, and consent unresolved.

This blocks architecture because memory storage, data classification, prompt context assembly, deletion behavior, auditability, and AI provider use depend on privacy policy decisions. It blocks UX because users need to understand what is remembered, how to correct it, and whether chat-based correction is enough. It blocks epics because stories cannot safely define done for memory without consent, correction, and retention acceptance criteria.

**Required resolution before downstream:**

- Define what memory categories are stored for MVP.
- Define whether memory is opt-in, implicit, or confirmed after extraction.
- Define user-visible correction and deletion behavior for MVP.
- Define retention policy for user memory and conversations.
- Confirm OpenAI data processing constraints for private beta.
- Add acceptance criteria for FR-9 to FR-13 and NFR-2.

### 2. Web search fallback is mandatory but provider, trust rules, and source handling are deferred

**Severity:** Critical  
**Locations:** PRD §6.1, §8.5 FR-25 to FR-30, §12 R-3, §13 OQ-4/OQ-6/OQ-7; Addendum §8, §25

The PRD makes web search fallback a Must Have and a core product principle, but the search provider, source eligibility rules, freshness thresholds, citation format, Facebook content constraints, and user-facing source display are unresolved.

This blocks architecture because provider capabilities affect API integration, latency, cost, citation availability, ranking, caching, and compliance. It blocks UX because source display could range from direct URLs to summarized provenance labels. It blocks epics because retrieval and grounding stories cannot be accepted without knowing when web search triggers and what source evidence must appear in answers.

**Required resolution before downstream:**

- Select MVP web search provider or define a short architecture spike with decision criteria and deadline.
- Define trigger rules for fallback: missing, sparse, freshness-sensitive, or confidence below threshold.
- Define minimum source display contract for users: direct URL, source title, source type, last checked, confidence, or summarized label.
- Define how copied Facebook content may be stored, cited, reused, or excluded.
- Add acceptance criteria for FR-27 to FR-30.

### 3. Success criteria are too subjective to validate the MVP thesis

**Severity:** Critical  
**Locations:** PRD §11 SC-1 to SC-6, §11 note for PM, §13 OQ-1

The success criteria use terms like "useful answer," "practical local tips," and "influence AI answers" without measurable thresholds. The PRD itself notes that usefulness needs a measurable beta rubric before implementation readiness.

This blocks epics and QA because teams cannot tell whether the AI Ask MVP is good enough for private beta. It also weakens architecture prioritization because there is no quantitative bar for answer latency, citation coverage, retrieval relevance, answer usefulness, or grounding quality.

**Required resolution before downstream:**

- Define a beta usefulness rubric with scoring dimensions and pass/fail threshold.
- Define the minimum test set: example prompts, including the magic-moment query and edge cases.
- Define who rates answers and how many users or evaluator runs are required.
- Define minimum acceptable source/uncertainty behavior per answer.
- Add counter-metrics such as hallucination incidents, unverifiable claims, stale source usage, or user correction frequency.

## High Blockers

### 4. Requirements lack acceptance criteria and testable done-ness

**Severity:** High  
**Locations:** PRD §8 Functional Requirements, §9 Non-Functional Requirements

Most FRs state capabilities but not observable acceptance criteria. Examples include "provide useful initial guidance," "ask concise follow-up questions," "reuse relevant memory," "retrieve relevant approved knowledge cards," "warn users to verify changing details," and "feel responsive enough."

This is the largest blocker for epic/story creation. Story writers would need to invent acceptance criteria, causing inconsistent scope and hidden product decisions.

**Required resolution before downstream:**

- Add acceptance criteria for each Must Have capability group, not necessarily every individual FR.
- Define answer format minimums for AI Ask.
- Define memory extraction/update/correction outcomes.
- Define knowledge-card lifecycle states and allowed transitions.
- Define retrieval success behavior when cards are absent, weak, or conflicting.
- Define NFR bounds for response latency, auditability, access control, and Vietnamese language support.

### 5. Minimum knowledge-card readiness is undefined

**Severity:** High  
**Locations:** PRD §10, §13 OQ-5; Addendum §25

The PRD says the beta should focus on the Hanoi-to-HCMC corridor and have "enough curated examples," but it does not define minimum card count, required route segments, required categories, quality thresholds, or coverage needed before beta testing.

This blocks architecture and epics because retrieval quality, data model validation, ingestion workflow scope, and beta launch readiness depend on the size and shape of the initial knowledge base. It also risks making XuyenViet feel no better than generic AI, which is already named as R-4.

**Required resolution before downstream:**

- Define minimum number of approved knowledge cards before first beta.
- Define required coverage by route segment and category.
- Define minimum metadata completeness per card.
- Define freshness-sensitive handling for price, hours, road condition, parking, and availability.
- Define what happens when the initial knowledge base is below threshold.

### 6. Private beta access and operator authorization are underspecified

**Severity:** High  
**Locations:** PRD §6.1, §8.7 FR-35 to FR-38, §13 OQ-2; Addendum §25

The PRD requires Google Login, private beta restriction, and separate operator/admin access, but leaves the access mechanism unresolved. It also says future multi-operator workflows should be supported without redesign, but does not define roles, permissions, or account provisioning.

This blocks architecture and epics because auth, authorization, data access, admin routes, and environment setup depend on whether the MVP uses allowlist, invite list, admin-created accounts, or domain restrictions.

**Required resolution before downstream:**

- Choose MVP beta access mechanism.
- Define role model for traveler and operator/admin.
- Define who can approve, edit, archive, and inspect sources.
- Define unauthorized access behavior.
- Add acceptance criteria for FR-35 to FR-38.

### 7. UX-critical source, confidence, and uncertainty behavior is ambiguous

**Severity:** High  
**Locations:** PRD §6.1, §7 UJ-1 step 8, §8.5 FR-28 to FR-30, §11 SC-4, §13 OQ-6

The PRD repeatedly requires source-aware, confidence-aware, uncertainty-aware answers, but does not define the user-facing model. It is unclear whether confidence is per answer, per source, per claim, per card, or per section. It is unclear how uncertainty should be displayed without overwhelming the chat experience.

This blocks UX because answer layout and interaction design depend on source granularity. It blocks architecture because audit and citation model depend on whether the system tracks source influence at card, passage, or answer level.

**Required resolution before downstream:**

- Define source display granularity for MVP.
- Define confidence labels and whether they apply to cards, sources, claims, or answers.
- Define required uncertainty language for stale or freshness-sensitive information.
- Define whether source details are inline, expandable, or summarized at answer end.

## Ambiguous Requirements Needing Resolution

- **"Useful initial guidance"** in FR-4 needs a concrete answer quality rubric.
- **"Concise follow-up questions"** in FR-5 needs a maximum number of questions or prioritization rule.
- **"Relevant memory"** in FR-11 needs rules for relevance, conflicts, stale preferences, and current-trip override.
- **"Conversation-level trip profile extraction"** in §6.1 needs persistence boundaries: conversation-only vs saved trip profile vs long-term memory.
- **"Operator roles prepared for future multi-operator workflows"** in §6.2 needs an MVP role model or explicit non-goal.
- **"Auditable enough"** in NFR-4 needs an audit target: developer logs, operator UI, stored trace, or user-facing citations.
- **"Responsive enough"** in NFR-1 needs a latency target or streaming-response expectation.
- **"Vietnamese content input, retrieval, and output"** in NFR-5 needs language acceptance criteria for tone, diacritics, mixed Vietnamese/English, and source content.

## Missing Acceptance Criteria

The PRD should add acceptance criteria for these MVP capability groups before epics are created:

- AI Ask chat behavior and answer format.
- Clarifying-question behavior.
- Memory extraction, update, correction, deletion, and current-trip vs long-term preference separation.
- Knowledge-card creation, edit, approve, archive, and retrieval eligibility.
- AI extraction from URLs/text/Facebook/image inputs if kept as Should Have.
- Web search fallback trigger and citation behavior.
- Source/confidence/uncertainty display.
- Family-aware planning behavior.
- Private beta access and operator/admin authorization.
- Minimum beta data readiness.
- Non-functional requirements: latency, security, auditability, Vietnamese quality, and admin/traveler separation.

## Risks That Need Explicit Mitigation

- **Hallucination and overconfidence:** The product differentiates on source-aware honesty, but there is no acceptance bar for hallucinated or unsupported claims.
- **Sparse data undermines differentiation:** The PRD relies on curated cards while admitting the initial knowledge base is sparse; minimum data readiness is undefined.
- **Privacy expectations:** Persistent family/travel memory creates user trust obligations before public launch, even in private beta.
- **Facebook/source reuse constraints:** The operator workflow accepts copied post content, but provenance, rights, and user-facing citation are unresolved.
- **Provider lock-in and cost/latency:** OpenAI and web search fallback are assumed, but cost, latency, rate limits, and fallback failures are not bounded.
- **UX overload:** Showing memory, sources, confidence, uncertainty, warnings, and next steps in every answer may create a noisy chat experience unless a source/uncertainty display model is defined.

## Medium/Lower Issues

- User journeys are useful but lack named protagonists, which reduces downstream UX specificity.
- There is no glossary for terms such as memory, trip profile, knowledge card, confidence, freshness-sensitive, source, and approved.
- FR IDs are contiguous and usable, but there are no cross-references from success criteria to FRs.
- Assumptions are inline but not indexed; this makes open-item triage harder.
- Non-goals are generally clear, but Google Maps replacement vs no Google Maps integration should stay explicit in UX and architecture to prevent map-first drift.

## Minimum Fix Set Before Proceeding

1. Resolve privacy/memory rules, beta access, web search provider/source policy, source display, and minimum knowledge-card readiness.
2. Replace subjective success criteria with a measurable beta evaluation rubric and counter-metrics.
3. Add acceptance criteria for each Must Have capability group.
4. Add a short glossary and assumption/open-question triage table with owner and decision deadline.
5. Mark which Should Have items are in beta scope versus optional stretch, especially AI extraction from images/screenshots and future multi-operator preparation.

## Final Readiness Call

The PRD is a solid draft for product direction but remains too assumption-heavy for formal downstream handoff. After the minimum fix set, it should be ready for UX and architecture in parallel, followed by epics and stories.

## Unresolved Questions

- What privacy and retention policy applies to persistent user memory and conversations?
- Which web search provider and source display model will be used for MVP?
- What measurable rubric defines a useful AI Ask answer for private beta?
- What minimum knowledge-card coverage is required before beta?
- Which beta access mechanism and operator role model will be used?
