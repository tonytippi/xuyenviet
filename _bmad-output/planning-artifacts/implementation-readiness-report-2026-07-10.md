# Implementation Readiness Assessment Report

**Date:** 2026-07-10
**Project:** xuyenviet
**Assessor:** BMad Implementation Readiness workflow via OpenCode

## Document Discovery

### Selected Documents

- PRD: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`
- Architecture: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- Epics and Stories: `_bmad-output/planning-artifacts/epics.md`
- UX Design: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md`
- UX Experience: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`

### Discovery Notes

- PRD review files exist in the PRD folder, but they are review artifacts, not duplicate PRDs.
- UX review file exists in the UX folder, but it is a review artifact, not a duplicate UX source.
- Existing readiness reports from `2026-07-05` and `2026-07-10` are prior outputs, not input conflicts.
- No blocking whole-vs-sharded duplicate document formats were found.

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
- FR-7: The system shall format travel answers with suggested plan/options, rationale, practical tips, warnings, sources, uncertainty notes, and next steps.
- FR-8: The system shall require Google Login before a user can ask AI.
- FR-9: The system shall associate chat sessions and trip projects with the authenticated user.
- FR-10: The system shall extract traveler and trip details from chat, including adults, children, children's ages when known, preferences, prior trips, budget, hotel style, driving tolerance, and constraints.
- FR-11: The system shall reuse relevant context within the current chat session or selected trip project.
- FR-12: The system shall distinguish chat-session context from trip-project context.
- FR-13: The system shall allow users to correct trip details through normal chat messages.
- FR-14: The system shall show users a clear notice that chat and trip details may be stored to support the current session or trip project.
- FR-15: The system shall allow users to delete a chat session or trip project they own.
- FR-16: The system shall not store sensitive personal data beyond what is needed for trip personalization.
- FR-17: The system shall support operator-created knowledge cards.
- FR-18: Each knowledge card shall include title, type, location or route segment, summary, source, collected date, confidence level, tags, and freshness-sensitive flag.
- FR-19: Knowledge card types shall include place, food, hotel area, activity, service, route note, warning, cost note, parking, EV charging, kid-friendly tip, discount/promotion, and general travel tip.
- FR-20: Operators shall be able to create, edit, approve, and archive knowledge cards.
- FR-21: Only approved knowledge cards shall be used for normal AI retrieval.
- FR-22: Knowledge cards shall preserve source provenance enough for users or operators to inspect where the information came from.
- FR-23: Operators shall be able to submit raw source material as URL, raw text, copied post content, or image/screenshot.
- FR-23A: The system shall support queued Facebook URLs whose visible post content can be captured later by an operator-run browser automation tool.
- FR-23B: Facebook capture automation shall populate operator-only raw source material only after operator-visible content is extracted and confirmed; it shall not store browser credentials, cookies, tokens, local storage, full HTML dumps, or hidden page data.
- FR-24: The system shall use AI to propose structured knowledge cards from submitted source material.
- FR-25: The system shall require human approval before extracted cards become searchable by AI.
- FR-26: The system shall support confidence labels such as unverified, community, curated, partner, or official.
- FR-27: The system shall allow operators to mark facts as freshness-sensitive when they involve price, schedule, availability, road condition, opening hours, weather, or service status.
- FR-28: The system shall support a minimum public-MVP seed set of 100 approved knowledge cards across the Hanoi-to-HCMC corridor.
- FR-29: The system shall retrieve relevant approved knowledge cards for user questions.
- FR-30: The system shall prioritize answer context in this order: selected trip project context, current chat session context, approved XuyenViet knowledge, web search fallback, and general AI knowledge.
- FR-31: The system shall use web search fallback when approved knowledge is missing, sparse, or freshness-sensitive.
- FR-32: The system shall identify when information came from chat/trip context, XuyenViet knowledge cards, web search, or general AI reasoning.
- FR-33: The system shall warn users to verify changing details before acting or booking.
- FR-34: The system shall avoid presenting unverified collected information as guaranteed fact.
- FR-35: Web search results used in answers shall be shown as external/unverified unless reviewed into approved knowledge cards.
- FR-36: The system shall prefer official/provider pages over reposted or unattributed sources when using web search fallback.
- FR-37: Facebook-derived information shall not be treated as official unless it comes from an identifiable official/provider page.
- FR-38: When children are part of the trip, the system shall consider shorter driving blocks, rest stops, child-friendly activities, learning opportunities, hotel convenience, and backup activities.
- FR-39: The system shall identify places or activities that may be unsuitable or boring for children when relevant.
- FR-40: The system shall suggest family-relevant tips such as child discounts when known from sources.
- FR-41: The system shall balance parent goals with child comfort and experience.
- FR-42: The system shall allow public sign-in without an email allowlist, but AI Ask shall require an authenticated Google user.
- FR-43: The system shall provide an operator/admin area separate from traveler chat.
- FR-44: The system shall support at least one admin/operator account for initial knowledge management.
- FR-45: The system shall allow future expansion to multiple operators without redesigning the knowledge workflow.
- FR-46: The system shall capture a simple usefulness rating for AI answers during the public MVP.
- FR-47: The system shall record AI usage events for authenticated AI requests, including user, conversation or trip context when applicable, AI purpose, provider/model, timestamp, and available usage/cost metadata.
- FR-48: The system shall capture referral attribution when a new user signs in or registers through a valid referral link, without calculating rewards, ranking, payout, or credit conversion in MVP.
- FR-49: The system shall manage AI Gateway model records with gateway model name, intended purpose, supported input/output capabilities, active status, and input/output/cache pricing metadata.
- FR-50: The system shall use configured model pricing metadata to estimate AI usage cost when provider usage token metadata is available, without creating credit balance or billing behavior in MVP.

Total FRs: 55 including lettered requirements.

### Non-Functional Requirements

- NFR-1: User-facing chat responses should feel responsive enough for interactive planning.
- NFR-2: The product shall preserve chat sessions and trip projects securely and only for authenticated users.
- NFR-3: The system shall not expose operator-only raw source material or admin controls to normal travelers.
- NFR-4: AI answers shall be auditable enough to identify which knowledge cards or source types influenced the response.
- NFR-5: The system shall support Vietnamese content input, retrieval, and output.
- NFR-6: The MVP shall tolerate sparse internal knowledge by using web search fallback and clearly labeling uncertainty.
- NFR-7: The system shall be designed so Google Maps integration, public submissions, and booking/partner flows can be added later without becoming MVP dependencies.
- NFR-8: Browser automation for Facebook capture shall run as an operator-controlled operations tool, not as public request-path app logic or unattended mass crawling.

Total NFRs: 8.

### Additional Requirements

- Facebook capture is in Should Have scope, not Must Have.
- `AC-9A` requires operators to queue Facebook URLs, run operator-assisted capture, and continue through existing AI extraction/review without changing Facebook-derived trust defaults.
- Source display and confidence contract requires compact source/confidence section, source URL when available, collected/checked date, confidence label, and freshness warning.
- Web search fallback contract remains provider-adapted and unverified until operator approval.
- Usage and referral readiness contract excludes billing, balances, rewards, payout, or credit conversion in MVP.
- Initial data scope remains Hanoi-to-HCMC corridor with 100 approved knowledge cards before public-MVP evaluation.
- Facebook captured content policy remains open: captured post text retention, operator review, quoting, and deletion need explicit policy before broader operator use.

### PRD Completeness Assessment

The PRD is implementation-ready for the Facebook capture MVP slice if treated as operator-only automation. The new requirements are clear on product intent, trust boundary, and non-goals. The largest remaining non-blocking gap is policy, not engineering: exact captured Facebook text retention/reuse/deletion rules remain open and should constrain broader operations before scale.

## Epic Coverage Validation

### Coverage Matrix

| FR Number | PRD Requirement | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR-1 | Vietnamese chat interface | Epic 2 | Covered |
| FR-2 | Broad road-trip planning questions | Epic 2 | Covered |
| FR-3 | Vietnamese default responses | Epic 2 | Covered |
| FR-4 | Useful initial guidance with missing details | Epic 2 | Covered |
| FR-5 | Concise follow-up questions | Epic 2 | Covered |
| FR-6 | Iterative refinement | Epic 2 | Covered |
| FR-6A | Streaming AI Ask responses | Epic 2 Story 2.7 | Covered |
| FR-6B | AI Ask image input | Epic 2 Story 2.7 | Covered |
| FR-6C | Image input validation before provider calls | Epic 2 Story 2.7 | Covered |
| FR-7 | Structured travel answer format | Epic 2 | Covered |
| FR-8 | Google Login before AI Ask | Epic 1 | Covered |
| FR-9 | User-owned chat sessions and trip projects | Epic 3 | Covered |
| FR-10 | Traveler/trip context extraction | Epic 3 | Covered |
| FR-11 | Chat/trip context reuse | Epic 3 | Covered |
| FR-12 | Chat-session vs trip-project context | Epic 3 | Covered |
| FR-13 | Correct trip details through chat | Epic 3 | Covered |
| FR-14 | Chat/trip storage notice | Epic 3 | Covered |
| FR-15 | Delete chat session or trip project | Epic 3 | Covered |
| FR-16 | Sensitive-data protection | Epic 3 | Covered |
| FR-17 | Operator-created knowledge cards | Epic 4 | Covered |
| FR-18 | Required knowledge-card fields | Epic 4 | Covered |
| FR-19 | Knowledge-card type taxonomy | Epic 4 | Covered |
| FR-20 | Create/edit/approve/archive cards | Epic 4 | Covered |
| FR-21 | Approved-only retrieval eligibility | Epic 4/Epic 5 | Covered |
| FR-22 | Source provenance preservation | Epic 4 | Covered |
| FR-23 | Raw source submission formats | Epic 4 Story 4.1 | Covered |
| FR-23A | Queued Facebook URLs for later browser automation capture | Epic 4 Story 4.1A | Covered |
| FR-23B | Confirmed visible Facebook text capture without storing credentials, cookies, tokens, full HTML, or hidden data | Epic 4 Story 4.1A | Covered |
| FR-24 | AI-assisted card extraction | Epic 4 Story 4.2 | Covered |
| FR-25 | Human approval before retrieval | Epic 4 | Covered |
| FR-26 | Confidence labels | Epic 4 | Covered |
| FR-27 | Freshness-sensitive marking | Epic 4 | Covered |
| FR-28 | 100-card public-MVP seed set | Epic 4 Story 4.9 | Covered |
| FR-29 | Approved-card retrieval | Epic 5 | Covered |
| FR-30 | Context priority order | Epic 5 | Covered |
| FR-31 | Web search fallback trigger | Epic 5 | Covered |
| FR-32 | Source category identification | Epic 5 | Covered |
| FR-33 | Verify changing details warning | Epic 5 | Covered |
| FR-34 | Avoid guaranteed unverified claims | Epic 5 | Covered |
| FR-35 | Web facts external/unverified | Epic 5 | Covered |
| FR-36 | Prefer official/provider sources | Epic 5 | Covered |
| FR-37 | Facebook-derived source handling | Epic 5 and Story 4.1A trust defaults | Covered |
| FR-38 | Child-aware planning constraints | Epic 6 | Covered |
| FR-39 | Identify child-unsuitable activities | Epic 6 | Covered |
| FR-40 | Family-relevant sourced tips | Epic 6 | Covered |
| FR-41 | Balance parent goals and child comfort | Epic 6 | Covered |
| FR-42 | Public sign-in and authenticated AI Ask access | Epic 1 | Covered |
| FR-43 | Separate operator/admin area | Epic 1 | Covered |
| FR-44 | Initial admin/operator account | Epic 1 | Covered |
| FR-45 | Future multi-operator expansion | Epic 1 | Covered |
| FR-46 | Answer usefulness rating | Epic 6 | Covered |
| FR-47 | AI usage event recording | Epic 5 | Covered |
| FR-48 | Referral attribution capture | Epic 1 | Covered |
| FR-49 | AI Gateway model catalog and pricing | Epic 5 | Covered |
| FR-50 | Usage cost estimation from model pricing | Epic 5 | Covered |

### Missing Requirements

No PRD FR lacks an implementable story path. The Facebook capture requirements are covered by Story 4.1A.

### Alignment Gaps

- None blocking. Previous traceability staleness was already resolved in `epics.md`: `FR-23A`, `FR-23B`, and `NFR-8` are present in the Requirements Inventory and FR Coverage Map.

### Coverage Statistics

- Total PRD FRs: 55 including lettered requirements.
- FRs with story coverage: 55.
- Coverage percentage: 100% story coverage.
- Traceability map accuracy: complete for current PRD.

## UX Alignment Assessment

### UX Document Status

Found:

- `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md`
- `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`

### Alignment Issues

- Medium: UX documents predate the Facebook capture change and do not explicitly mention queued Facebook capture. This is acceptable for the MVP slice because Story 4.1A defines the capture tool as an operator operations command, not a traveler-facing or admin-web UI surface.
- Low: If later work adds an admin-web queue view, capture status, or copyable capture command, UX should be updated to include queued Facebook source, capture failed, capture skipped, and capture complete states.

### PRD / UX Alignment

- Traveler-facing trust, provenance, source chips, community/unverified labeling, freshness warnings, and raw-material non-exposure are aligned.
- Admin knowledge intake already supports URL, raw text, copied post content, screenshot/file metadata, safe extraction failure, and no approved-card creation on failure.
- Current UX supports the fallback manual path: operator can paste copied content when capture is not available.

### Architecture / UX Alignment

- Architecture supports UX separation between traveler and admin surfaces.
- Architecture explicitly keeps Facebook capture outside public request-path UI, which matches UX guidance to keep operator workflows separate from traveler chat.
- No additional traveler UX is required for Story 4.1A because captured Facebook content remains operator-only raw source material until approved knowledge cards enter existing source/provenance display.

### Warnings

- If capture becomes visible in the web admin, UX update is required before implementation. For the current Playwright script MVP, UX is sufficient.

## Epic Quality Review

### Critical Violations

None found for the Facebook capture slice or current Epic 4 readiness.

### Major Issues

- Major: Story 2.7 contains a forward dependency note on Story 5.0 for model capability catalog. This is existing scope, not introduced by Facebook capture, but it violates strict independence guidance unless the story explicitly approves a temporary capability gate. Recommendation: during Story 2.7 validation, either reorder Story 5.0 first or make the temporary gate explicit in the story implementation contract.

### Minor Concerns

- Minor: Story 4.1A uses lettered numbering to avoid renumbering existing stories. This is pragmatic and keeps prior references stable, but story generation and sprint status should preserve this identifier exactly.
- Minor: Story 4.1A audit criterion says "when audit support is available from the operations context." That is intentionally flexible, but implementation should decide whether the script can use the existing audit helper or will write a narrower operations log first.
- Minor: UX spines are still marked `status: draft`; this is acceptable for current implementation because the Facebook capture MVP is a script, but UX should be refreshed if an admin-web capture queue is added.

### Epic Structure Assessment

- Epic 1 is foundation-heavy but still tied to public sign-in, admin protection, referral attribution, and launch safety. Acceptable for MVP sequencing.
- Epic 2 through Epic 6 are user/operator value-oriented and not merely technical milestones.
- Epic 4 remains coherent after Story 4.1A: source intake creates queued sources, capture populates raw material, extraction creates drafts, review approves knowledge, retrieval uses approved cards only.

### Story 4.1A Quality Assessment

- User value: clear operator value; reduces manual copy/paste while preserving review and trust boundaries.
- Independence: can be implemented after Story 4.1 because it relies on existing `sources` and `raw_source_material`. It does not require Story 4.2 to function, but hands off to Story 4.2 after capture.
- Acceptance criteria: specific and testable for queue selection, browser capture, safe metadata, confirmation, DB write, failure behavior, trust defaults, extraction handoff, and audit.
- Risk coverage: covers blocked/inaccessible pages, selector failure, no fabrication, and no persistence of browser credentials/session data.

### Best Practices Compliance Checklist

- Epic delivers user value: Pass.
- Epic can function independently: Pass for Epic 4 relative to earlier admin/auth foundations.
- Stories appropriately sized: Pass for Story 4.1A MVP script scope.
- No forward dependencies: Pass for Story 4.1A; existing concern remains Story 2.7 -> Story 5.0.
- Database tables created when needed: Pass; Story 4.1A reuses existing source/raw material tables and should not create broad unrelated tables.
- Clear acceptance criteria: Pass for Story 4.1A.
- Traceability to FRs maintained: Pass.

## Summary and Recommendations

### Overall Readiness Status

READY.

Story 4.1A is ready for development after story validation. The implementation path is clear: operator-run Playwright script, queued Facebook sources, confirmed visible text capture, safe raw metadata, existing raw source material persistence, and existing AI extraction/review flow.

### Critical Issues Requiring Immediate Action

None for Story 4.1A implementation.

### High Priority Issues

1. Preserve Story 4.1A's guardrails during implementation: no public request-path scraping, no stored Facebook credentials/cookies/tokens/local storage/full HTML/hidden data, no trust upgrade, and no auto-approval.

### Recommended Next Steps

1. Complete `bmad-create-story` validation for `_bmad-output/implementation-artifacts/spec-4-1a-capture-queued-facebook-source-text-with-operator-browser-automation.md`.
2. If validation passes, run `bmad-dev-story` for Story 4.1A.
3. During implementation, pay special attention to Playwright profile location, `.gitignore`, script-safe DB imports, confirmation UX, audit/logging behavior, and failure handling.
4. Defer a web-admin capture queue UI until after the script MVP works; if added, refresh UX first.
5. Before broad operational use, decide the captured Facebook text retention/reuse/deletion policy.

### Final Note

This assessment identified 4 actionable issues across 3 categories: existing dependency hygiene, UX future-scope warning, audit implementation choice, and Facebook content policy. None block Story 4.1A implementation readiness.

Unresolved questions:

- What detailed Facebook content reuse policy should govern captured post text retention, operator review, quoting, and deletion beyond provenance and non-official labeling?
- For Story 4.1A, should the operations script write through existing audit helpers, a narrow script log, or both?
