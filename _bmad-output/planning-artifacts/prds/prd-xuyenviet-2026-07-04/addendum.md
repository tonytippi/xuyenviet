# XuyenViet AI Travel Information MVP PRD Addendum

## Source Inputs

- Brainstorming intent: `_bmad-output/brainstorming/brainstorm-ai-travel-info-mvp-2026-07-04/brainstorm-intent.md`
- Market landscape research digest captured during PRD creation.
- YouTube Discovery proposal: `docs/proposals/ai-first-youtube-discovery.md`.
- Retrieval and Trip-aware Planning Context roadmap v6.2: `docs/roadmaps/retrieval-va-tri-nho-traveler-v6.2.md`.

## Resolved Product Decisions

- Public MVP surface: AI Ask chat.
- Launch intent: public MVP entry with authenticated AI Ask.
- Initial geography: Hanoi-to-HCMC road-trip corridor.
- User language: Vietnamese.
- Authentication: Google Login.
- Access model: public sign-in without an email allowlist; Google Login is required before AI Ask.
- Initial operator model: owner/admin first, expandable to operators later.
- Minimum public-MVP seed data target: 100 active, evidence-grounded knowledge cards.
- Machine-readable source classification, verification state, evidence support, freshness, and provenance remain internal policy/audit data. Traveler UI does not expose them as default confidence labels.
- Traveler source disclosure is progressive: when relevant, it may show a safe source title/label, safe URL, useful checked/collected date, and plain-language verification context. Internal source type, confidence code, provenance identifier, retrieval policy, and provider/model metadata remain hidden.
- Community knowledge uses AI-first provisional publication: qualifying claims may be active without operator approval, while AI recommends prioritized review only for risk, weak evidence, freshness, duplicate, or conflict signals.
- Operator approval is a signal of review, not a mandatory retrieval gate. Active claims must preserve validated source evidence and use state-aware uncertainty wording.
- Active publication requires sufficient relevance, extractability, grounding, specificity, actionability, first-hand likelihood, and low commercial/spam risk in addition to hard evidence, privacy, safety, and conflict gates. Versioned numeric thresholds belong to the Community Knowledge architecture/evaluation contract.
- Quality monitoring samples active claims without becoming a publication gate. Every `needs_operator` outcome retains its required quality-control obligation separately from actionable operator work; sampling rate and cohort configuration belong to the Community Knowledge architecture/evaluation contract.
- Direct Facebook-derived quotes and captured text are operator-only in the public MVP. Traveler surfaces may show a XuyenViet-authored paraphrase and practical verification guidance. A canonical source link may appear only when the source is public without authentication or group membership, passes URL-safety policy, and has no validated removal request. The published content-removal contact hides a credible affected link during validation and routes a validated request through source removal and dependent-card re-evaluation. Public direct-quote display remains deferred until a separately approved rights and display policy exists.
- Trip Planning Foundation is the implemented product baseline: single-owner structured itinerary, trip constraints, one primary conversation, basic Trip Home, and user-confirmed change proposals with history. Later route-aware retrieval work must preserve this ownership and confirmation model.
- Trip Home focus policy: pending expiring proposal, pending proposal, defined confirmed-item gap, next dated planned/confirmed leg, then preparation. Explicit lifecycle phases and on-trip today focus remain deferred.
- `confirmed` means owner confirmation or a supplied real constraint, not booking/provider validation; booking and availability remain out of scope.
- Proposal application uses aggregate/item version fences and structural preconditions; a stale proposal applies nothing and returns a safe refresh-required result.
- YouTube Discovery is an approved bounded operator capability whose product contract is authoritative in PRD UJ-6, FR-66..78, NFR-19..20, SC-13..14, and AC-34..41. Discovery architecture, UX, and Epics 18-20 implement and trace that contract; they do not originate or override product behavior.

## Roadmap v6.2 PRD Decision Traceability

All ten product change requests are approved at outcome level. No PCR is deferred. Architecture follow-up defines only the implementation mechanism and may not weaken the mapped product behavior.

| PCR | Disposition | PRD references | Architecture/Evaluation follow-up |
|---|---|---|---|
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

## Roadmap v6.2 Production Journey Traceability

The roadmap's production journeys are preserved by the following PRD-owned outcomes. Architecture and stories must trace these mappings without reconstructing Trip authority from chat text.

| Journey | PRD references | Preserved outcome |
|---|---|---|
| `PJ-01` | UJ-1, UJ-3; FR-16J–K; AC-25–26 | Natural unscoped help can become a Trip only after explicit save/continue; old chat is not reconstructed as confirmed plan |
| `PJ-02` | FR-16M–Q, FR-30; AC-28–29 | Current-plan answers use exact applied Trip state and save new stops only through proposals |
| `PJ-03` | UJ-4; FR-16M–P; SC-9, SC-12; AC-28 | Hypothetical detours preserve the current plan until owner Apply |
| `PJ-04` | UJ-5; FR-63–64; AC-30 | Partial, ambiguous, and unsupported routes still return safe bounded guidance without false end-to-end authority |
| `PJ-05` | FR-61–62; SC-10; AC-31 | Missing required evidence is surfaced or clarified and is never filled with unrelated evidence |
| `PJ-06` | FR-35, FR-65; §10.4; SC-11; AC-11, AC-32 | Recent external warnings remain distinct from live route authority and degrade safely when verification fails |

## Provisional Assumptions For Architecture

- Preferred AI access path: OpenAI-compatible AI Gateway, not direct OpenAI API calls.
- The AI Gateway must be configured with its base URL and API key per environment; downstream model/provider data-use settings must ensure project/user data is not used to train provider models where configurable.
- Web search is required when an explicit planning need lacks applicable evidence or needs current verification; card count is not the product definition of sufficient coverage.
- Web search provider is an architecture decision, but must support Vietnamese, source URLs/titles/snippets, provenance capture, and official/provider-source preference.
- Architecture must define publication, knowledge, and review state storage; independent AI evaluation; citation-span validation; suppression propagation; dedup/conflict handling; and retrieval metadata/wording enforcement for active provisional community claims.
- Architecture must make high-risk conflict detection immediately de-index or downgrade a claim, and must implement 180-day deletion for Facebook raw text that supports no active or reviewable claim.
- Google Maps/Places/Routes remains a deferred initiative that requires a separately approved PRD and provider architecture; the retrieval roadmap does not imply live routing or navigation capability.
- Trip correction is requested through chat but changes durable state only through an owner-confirmed typed proposal.
- Deletion must support owner chats and Trip Projects, preserve a live Trip from implicit primary-conversation deletion, and invalidate derived reconstructable planning/retrieval context; Architecture owns the cascade, retention, and transaction mechanism.
- Conversation transcript retention must follow the final PRD and privacy notice; do not treat earlier debugging-retention assumptions as active requirements unless a later privacy decision reinstates them.
- Architecture must define the Trip Project aggregate boundary, primary-conversation migration, owner-scoped plan/proposal commands, proposal expiry/conflict handling, audit history, and deletion propagation for all derived Trip Planning data.
- Architecture AD-29, AD-30, and AD-35 now define the approved canonical Trip leg-path representation, owner-confirmed proposal operations, migration behavior, supported-coverage resolution, and safe stale-reference recovery. Free-text route labels remain query aids and cannot grant durable route authority.
- The former broad-query `< 3 relevant cards` web-search trigger may remain only as a temporary compatibility behavior. It is retired when the required-need vocabulary and Architecture contract are approved, the versioned evaluation profile includes broad-query compatibility and missing-need cohorts, shadow evaluation passes the approved non-regression gates for the agreed evidence window, and the Product Owner approves production cutover from the recorded evaluation report. Architecture/Evaluation owns numeric thresholds and evidence-window length; the Product Owner owns retirement approval.
- Weather, location, Google Maps/Places/Routes, booking/OTA data, dynamic provider snapshots, budget, checklists, travel vault, collaboration, and notifications remain deferred from the Trip Planning Foundation tranche.

## Architecture Authority Handoff

The approved runtime remains a modular monolith with separate traveler and operator presentation surfaces, one versioned authorization/domain API, PostgreSQL-owned product state, dedicated background execution, and one writer per aggregate command. These constraints matter to the PRD because they preserve owner-scoped access, auditable mutations, durable AI Ask completion, operational independence, and a clean public-launch cutover.

The implementation topology, framework ownership, session transport, streaming protocol, database/migration mechanics, deployment routing, worker lifecycle, release cutover, and rollback rules are authoritative in:

- [XuyenViet Architecture Spine](../../architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md)
- [Community Knowledge Pipeline Solution Design](../../architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md)

The PRD and this addendum own product behavior and constraints. Architecture owns how those constraints are implemented. A later architecture change may replace a mechanism but shall not weaken owner authorization, single-writer mutation, provenance, deletion, safety, or traveler-facing failure outcomes without a corresponding PRD change.

## Market Context Digest

- AI trip planners commonly converge on chat-to-itinerary plus booking marketplace flows.
- Road-trip-specific competitors emphasize route optimization, stop discovery, map-first planning, and logistics.
- Strong products combine AI generation with manual control; generated plans should be treated as drafts.
- Most competitors use third-party trust surfaces rather than decision-specific verification guidance, leaving room for XuyenViet to differentiate on practical source transparency, last-checked context, and honest limitations without exposing technical confidence labels.
- Personalization is shifting toward persistent preference memory and imported context, but XuyenViet does not automatically use cross-trip/global memory without explicit traveler selection or approval.
- Vietnam travel information is rich but fragmented and often static.
- Freshness risk is high for road trips: prices, road conditions, hours, parking, weather, service availability, traffic restrictions, and seasonal events change often.

## Still Open

- Exact web search provider/mechanism.
- Exact privacy-policy wording for AI Gateway-backed memory and chat processing.
