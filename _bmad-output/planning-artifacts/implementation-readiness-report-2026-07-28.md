---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentsIncluded:
  - prds/prd-xuyenviet-2026-07-04/prd.md
  - prds/prd-xuyenviet-2026-07-04/addendum.md
  - architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md
  - architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md
  - epics.md
  - ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
  - ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md
---

# Implementation Readiness Assessment Report

> Historical assessment. Superseded for planning purposes by the approved and applied `sprint-change-proposal-2026-07-28.md`. Retained as the evidence that triggered the course correction.

**Date:** 2026-07-28
**Project:** xuyenviet

## Document Discovery

| Document Type | Selected Source Documents |
| --- | --- |
| PRD | `prds/prd-xuyenviet-2026-07-04/prd.md`, `prds/prd-xuyenviet-2026-07-04/addendum.md` |
| Architecture | `architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`, `community-knowledge-solution-design.md`, `frontend-shell-implementation-notes.md` |
| Epics & Stories | `epics.md` |
| UX | `ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`, `DESIGN.md` |

No duplicate whole and sharded source documents were found. Review documents are treated as supporting evidence rather than the authoritative requirement or design sources.

## PRD Analysis

### Functional Requirements

The authoritative, complete wording for FR-1 through FR-60 is in PRD section 8, lines 141-253. The extracted requirement inventory below preserves its functional commitments for traceability.

| ID | Requirement |
| --- | --- |
| FR-1 to FR-7 | Authenticated Vietnamese AI Ask: broad questions, Vietnamese defaults, useful incomplete-input guidance, concise follow-ups, iterative refinement, supported streaming, validated image input, and structured answers with plans, tips, warnings, sources, uncertainty, and next steps. |
| FR-8 to FR-16 | Google-authenticated ownership of chats and trips; context extraction/reuse/correction; clear storage notice; owner deletion; and minimization of sensitive personal data. |
| FR-16A to FR-16I | Primary-conversation Trip Project authoring through explicit, typed, expiring, owner-confirmed proposals; structured anchors, legs, activities, constraints, states, primary-conversation migration, Trip Home, and actor/timestamped proposal history. |
| FR-17 to FR-22C | Operator knowledge-card creation and lifecycle; required metadata and types; validated community evidence; PII safeguards; publication, knowledge, and review states; provenance; and exclusion of non-retrievable states. |
| FR-23 to FR-28 | Raw-source submission and operator-assisted Facebook capture; AI triage, extraction, independent evaluation, exhaustive candidate processing, supersession safety, publication/review policy, quality sampling, confidence/freshness metadata, and 100 active-card seed target. |
| FR-29 to FR-37C | Guardrailed retrieval; priority of trip/chat/knowledge/search/general context; search fallback; source classification; verification warning; official-source preference; Facebook handling; state-aware community wording; and conflicted-knowledge safety. |
| FR-38 to FR-41 | Family-aware pacing, activities, suitability warnings, sourced discounts, and balancing parent and child needs. |
| FR-42 to FR-50 | Public Google sign-in; separate operator area and future operator expansion; safe operator ingestion outcomes; answer feedback; AI usage and referral attribution; Gateway model records; and internal usage-cost estimation without billing. |
| FR-51 to FR-60 | Versioned domain APIs; Next.js BFF browser boundary; separately deployed admin app; neutral-principal authorization; safe error and documented contracts; dedicated durable workers; single-writer migration; preserved AI NDJSON streaming and atomic persistence; and retirement of legacy transport/admin owners. |

Total FRs: 60 (including the lettered sub-requirements).

### Non-Functional Requirements

The authoritative, complete wording for NFR-1 through NFR-18 is in PRD section 9, lines 257-275.

| ID | Requirement |
| --- | --- |
| NFR-1 | Interactive planning responses feel responsive; exact latency target remains an architecture-spike decision. |
| NFR-2 to NFR-4 | Authenticated secure chat/trip persistence; no traveler access to operator raw material/admin controls; auditable answer influences. |
| NFR-5 to NFR-8 | Vietnamese input/retrieval/output; sparse-knowledge fallback with uncertainty; extensible future integrations; operator-controlled Facebook automation outside public request paths. |
| NFR-9 to NFR-9A | Auditable active claims and bounded, idempotent, supersession-safe ingestion without accepted-fact quotas. |
| NFR-10 to NFR-11 | Owner-scoped Trip Project reads/mutations and authorized, valid, auditable proposal application. |
| NFR-12 to NFR-15 | Independently deployable staging workloads, migration ordering, accurate liveness/readiness, graceful workers, correlated safe telemetry, private traffic, and isolated environments. |
| NFR-16 to NFR-18 | Safe schema evolution, worker operational evidence before retirement, and approved launch operations including load and restore testing. |

Total NFRs: 19 (NFR-1 through NFR-18, including NFR-9A).

### Additional Requirements

- Product contracts in PRD sections 10.1-10.7 define privacy/deletion, source display, community publication/conflict policy, web-search behavior, answer quality, usage/referral, and Trip Planning Foundation invariants.
- Acceptance criteria AC-1 through AC-33 define demonstrable delivery outcomes, including API cutover, deployment, worker, migration, and operational readiness.
- Addendum decisions establish an API-first modular-monolith target: NestJS API/worker, Next.js web and separate admin app, PostgreSQL/Drizzle ownership, Railway private networking, and no public browser API credential.
- Open decisions remain for search provider, privacy notice wording, source URL presentation, Facebook content-reuse policy, mobile authorization server, and launch operational ownership.

### PRD Completeness Assessment

The PRD is comprehensive and current (updated 2026-07-28), with explicit functional, non-functional, acceptance, data-control, and operational requirements. It deliberately leaves several supplier, legal, privacy-copy, and launch-ownership decisions open; later readiness steps must verify that architecture and stories either resolve them with bounded decisions or keep dependent work explicitly blocked.

## Epic Coverage Validation

### Coverage Matrix

| PRD FR range | Epic coverage | Status |
| --- | --- | --- |
| FR-1 to FR-7 | Epic 2; FR-6A is Epic 4 | Covered |
| FR-8 to FR-16 | Epic 1 for auth/storage notice; Epic 2 for chats, projects, context, deletion, privacy | Covered |
| FR-16A to FR-16I | Epic 7 | Covered |
| FR-17 to FR-28 | Epic 3 | Covered |
| FR-29 to FR-36 | Epic 4 | Covered |
| FR-37 | Epic 3 | Covered |
| FR-37A and FR-37C | Epic 4 | Covered |
| FR-37B | Epic 3 | Covered |
| FR-38 to FR-41 | Epic 5 | Covered |
| FR-42 to FR-45 | Epic 1 | Covered |
| FR-45A | Epic 3 | Covered |
| FR-46 | Epic 5 | Covered |
| FR-47, FR-49, FR-50 | Epic 4 | Covered |
| FR-48 | Epic 1 | Covered |
| FR-51 | No FR Coverage Map entry | Missing |
| FR-52 | No FR Coverage Map entry | Missing |
| FR-53 | No FR Coverage Map entry | Missing |
| FR-54 | No FR Coverage Map entry | Missing |
| FR-55 | No FR Coverage Map entry | Missing |
| FR-56 | No FR Coverage Map entry | Missing |
| FR-57 | No FR Coverage Map entry | Missing |
| FR-58 | No FR Coverage Map entry | Missing |
| FR-59 | No FR Coverage Map entry | Missing |
| FR-60 | No FR Coverage Map entry | Missing |

The epics document contains explicit FR coverage mapping through FR-50. Epic 9-11 map ADR-32 requirements, which provide partial technical foundations for FR-51 through FR-59, but they do not claim or demonstrate full coverage of those PRD functional requirements. No story maps the legacy transport retirement in FR-60.

### Missing Requirements

#### Critical Missing FRs

- FR-51: Versioned domain APIs shared by traveler web, separately deployed operator app, and future mobile clients.
  Impact: The API-first product boundary has no complete implementation path.
  Recommendation: Add explicit API-contract/capability stories, likely under Epic 9 and subsequent cutover work.
- FR-52: Traveler browser remains behind the Next.js BFF and cannot call the private API directly.
  Impact: Epic 9 defines security mechanics but lacks a complete web migration and verification path.
  Recommendation: Add an Epic 9 BFF-client migration and browser-boundary verification story.
- FR-53: Separately deployed operator/admin application using the protected API without direct database access.
  Impact: No story provisions or migrates the separate admin application and its release lifecycle.
  Recommendation: Add an API/admin application extraction and deployment story before launch work.
- FR-54: Every protected API operation authorizes through a domain-neutral principal mapped from short-lived BFF credentials.
  Impact: Epic 9.1 covers principal validation but does not demonstrate protected capability adoption across domains.
  Recommendation: Add per-capability authorization migration/coverage and integration verification.
- FR-55: Stable API safe-error contract.
  Impact: Epic 9.3 mentions an envelope but no story owns its reusable contract, mapping, and cross-capability tests.
  Recommendation: Add a contracts/error-envelope story.
- FR-56: Documented API contracts for health/version and protected capabilities, including pagination/order and streaming semantics.
  Impact: No OpenAPI publication or API documentation story exists.
  Recommendation: Add a versioned OpenAPI and API-contract verification story.
- FR-57: Dedicated continuous worker runtime and bounded scheduled sweeps using PostgreSQL protocols.
  Impact: Existing stories rely on workers but do not establish the dedicated worker deployment/runtime boundary for all loops.
  Recommendation: Add worker bootstrap, deployment, and migration stories.
- FR-58: Single transport writer during migration with no dual writes.
  Impact: No systematic capability-cutover plan or verification owns single-writer enforcement.
  Recommendation: Add a transport cutover epic/story sequence with a capability inventory.
- FR-59: Move AI Ask streaming to versioned API while preserving NDJSON and atomic terminal persistence.
  Impact: Epic 10 strengthens semantics but does not explicitly move the streaming transport to the versioned API and BFF path.
  Recommendation: Add a dedicated API AI Ask streaming cutover story with protocol tests.
- FR-60: Retire legacy Next.js domain route handlers, server-action writers, and legacy `/admin` before public launch.
  Impact: No retirement inventory, migration sequence, or enforcement story is planned.
  Recommendation: Add a final decommissioning/cutover story with repository and deployed-route verification.

### Coverage Statistics

- Total PRD FRs: 70 (FR-1 through FR-60, including lettered requirements)
- FRs directly covered in epics: 60
- FRs missing direct epic coverage: 10 (FR-51 through FR-60)
- Direct coverage: 85.7%

## UX Alignment Assessment

### UX Document Status

Found. The authoritative UX set is `ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md` (experience, behavior, states, accessibility) and `DESIGN.md` (visual-system contract). Both are marked final and were updated 2026-07-24/25.

### Alignment Confirmed

- PRD AI Ask, Google gate, Vietnamese-first behavior, image validation, chat/trip ownership, storage notice, deletion, source confidence, web-fallback uncertainty, family-aware answers, feedback, referral non-goals, and role-gated admin flows have concrete UX surfaces and failure states.
- The Trip Planning Foundation is aligned: primary conversation is the sole authoring surface; Trip Home ordering, structured plan states, proposal review/apply/dismiss/expiry behavior, owner safety, historic conversations, and no booking/live-data implication match PRD section 10.7 and architecture Trip Planning rules.
- Provenance is aligned: UX requires persisted, traveler-safe source details and selection descriptors, never parses answer prose, and hides raw operator material. This matches architecture AD-11, AD-19, AD-20, and provenance-withdrawal rules.
- Responsive and accessibility contracts are concrete: shared server-loaded shell, desktop/tablet/mobile presentation changes only, sheets, keyboard/focus behavior, live regions, reduced motion, color-independent labels, 44px mobile targets, and WCAG 2.2 AA target.
- Architecture explicitly supports the UX shell using Next.js traveler/admin BFF presentation layers, private API boundaries, persisted provenance, NDJSON streaming, server-side role-gated navigation, and URL-owned conversation/project selection.

### Alignment Issues

- The UX files cite the prior readiness report and do not list the 2026-07-28 architecture delta as a source. They consequently do not explicitly specify the new API-cutover concerns: idempotency-key recovery, `discarded`/`refresh_required` terminal behavior, durable consumer status, and versioned API error semantics. The existing streaming/retry and proposal-conflict UX is directionally compatible, but a small UX addendum should define these user-visible failure/recovery states before Epic 9-11 implementation.
- `EXPERIENCE.md` still calls Next.js the primary runtime assumption. This is correct for traveler/admin presentation, but can be misread after the architecture changed the domain API and worker owner to NestJS. Clarify that Next.js is the presentation/BFF runtime and NestJS owns domain API/worker transport.

### Warnings

- UX documentation is not missing. Its main risk is currency rather than functional coverage: it should be updated after the API/runtime cutover epics are added to retain a single authoritative cross-layer contract.

## Epic Quality Review

### Critical Violations

- **Epics 9, 10, and 11 are technical milestones rather than independently valuable user outcomes.** Their titles and stated outcomes are framed around private API credentials, command idempotency, outbox processing, and provenance mechanics. These are important architecture work, but each depends on an unplanned end-to-end capability cutover and does not independently satisfy a traveler/operator outcome. They also leave FR-51 to FR-60 without full stories.
  Recommendation: organize these into a capability-based API migration sequence, where each slice delivers a protected traveler or operator capability through the API/BFF path and retires its legacy writer, with explicit contract, error, and deployment evidence.
- **Epic 8 is a cross-cutting technical migration with no product-facing outcome.** “Trustworthy Automation And Audit Attribution” is architecture maintenance, not an independently usable customer increment. It also touches Audit, Knowledge, Chat/Trips, Usage, workers, migrations, and seed behavior.
  Recommendation: retain its technical scope as an architecture-enablement initiative, but split delivery into bounded, feature-owned migration stories or explicitly treat it as a prerequisite program with a testable operational exit gate rather than a normal user-value epic.

### Major Issues

- **Story 3.5 is epic-sized.** It includes the whole source-version pipeline plus deterministic gates, independent judge, bounded evidence creation, canonical card mutation, relation matching, conditions, conflict policy, and exhaustive candidate traversal. Its superseded Stories 3.7 and 3.8 leave that breadth concentrated in one story.
  Recommendation: split into independently releasable stages with end-to-end tests, such as candidate discovery/evidence validation, independent publication decision, and canonical relation/conflict application, while preserving one source-level terminal invariant.
- **Stories 9.1-9.3 establish an identity boundary but do not include the first protected domain capability using it.** This makes the API security epic difficult to demonstrate as a complete vertical slice and contributes to the FR-51 to FR-56 coverage gap.
  Recommendation: add a first capability read/command migrated through BFF/API, with principal authorization, safe errors, documented OpenAPI, and contract tests.
- **Stories 10.1-10.4 define reliable AI Ask semantics but not the required versioned API transport cutover.** The acceptance criteria never explicitly require the Nest `POST /v1/ai-ask/stream` endpoint, BFF forwarding, or legacy Next transport retirement.
  Recommendation: add a separate transport migration story that satisfies FR-59 and contributes to FR-58/FR-60.
- **Epic 6 launch-readiness prerequisites contain unresolved implementation/decision work but are not represented as stories.** Provider pricing, search-provider validation, privacy notice/settings, usage/provenance coupling, same-conversation concurrency, DB-backed test sequencing, and manual smoke evidence are listed as prerequisites only.
  Recommendation: assign every prerequisite a named owner and either a story, an externally tracked decision record, or an explicit accepted-risk authority before sprint planning.
- **NFR traceability is incomplete in the epics document.** Its requirements inventory only includes NFR-1 through NFR-11, while the PRD contains NFR-12 through NFR-18 for deployment, health, telemetry, private networking, schema evolution, worker retirement, and launch operations.
  Recommendation: add an NFR coverage map and stories/operational gates for NFR-12 through NFR-18; they materially support AC-25 and AC-32/33.

### Minor Concerns

- The document contains both high-level Epic 1-11 declarations and a second detailed Epic 1-11 story sequence. This is understandable as incremental planning history, but status/evidence is interleaved with planned work and makes the active implementation path harder to identify.
  Recommendation: maintain a concise active epic index with status, authoritative stories, and superseded-story links.
- Several acceptance criteria correctly require automated verification but do not name the intended test layer or harness. This is especially relevant for database migrations, BFF/API contracts, worker lifecycle, and streaming protocol behavior.
  Recommendation: specify the required verification command/harness in the corresponding story before implementation.

### Strengths

- Epics 1-7 are user-outcome oriented and maintain sensible sequencing: trusted access, personal conversations, knowledge operations, source-grounded answers, family/quality, launch readiness, and controlled trip planning.
- Stories generally use testable Given/When/Then criteria, include failure conditions, and enforce owner scope, raw-material protection, and no direct AI mutation of confirmed trip state.

## Summary and Recommendations

### Overall Readiness Status

**NOT READY** for implementation of the current API-first runtime and public-launch scope. The underlying product, UX, and architecture are unusually detailed, and Epics 1-7 provide strong coverage for the original traveler and knowledge workflows. However, the PRD added mandatory FR-51 through FR-60 and NFR-12 through NFR-18 without a complete, traceable epic/story plan.

### Critical Issues Requiring Immediate Action

1. **Add coverage for FR-51 through FR-60.** The epics document's explicit FR Coverage Map ends at FR-50. API contracts, BFF boundary migration, separate admin deployment, capability-wide principal authorization, safe errors/OpenAPI, dedicated worker runtime, single-writer cutover, API streaming, and legacy transport retirement do not have complete story paths.
2. **Add coverage for NFR-12 through NFR-18.** Independent deployment, migration ordering, readiness/liveness, telemetry, private-network isolation, expand-migrate-contract rollout, worker operational proof, and launch ownership/load/restore validation are missing from the epics requirements inventory and traceability.
3. **Restructure technical Epics 8-11 into deliverable capability cutovers.** They currently describe required technical foundations but not independently valuable vertical slices. Each migrated capability must identify its API contract, BFF adaptation, authorization, safe errors, deployment/worker behavior, legacy writer retirement, and verification evidence.
4. **Resolve or explicitly gate the open launch decisions.** Search provider validation, Gateway privacy configuration and public notice, Facebook reuse policy, mobile authorization-server decision, Railway operations ownership, pricing verification, and outstanding launch prerequisites need a named owner and disposition.
5. **Update UX sources and recovery states for the architecture delta.** Add explicit UX behavior for idempotent retry/reconnect, `discarded`/`refresh_required`, durable post-answer work status, and API-safe failures; clarify Next.js as the traveler/admin presentation BFF rather than domain API owner.

### Recommended Next Steps

1. Run `bmad-correct-course` to update the epics/stories plan for the 2026-07-28 architecture delta, including an FR/NFR traceability map through FR-60 and NFR-18.
2. Create vertical-slice API migration stories: first protected read/command, API contract/error/OpenAPI baseline, AI Ask streaming BFF/API cutover, worker/runtime deployment, admin application migration, and final single-writer/legacy retirement validation.
3. Update the UX spine with the API-cutover recovery contract and update its sources to include the current architecture delta.
4. Assign owners and decisions/evidence for all Epic 6 launch prerequisites and PRD open questions; convert implementation-dependent prerequisites into stories or explicit blockers.
5. Rerun `bmad-check-implementation-readiness` after the revised architecture/UX/epics artifacts are complete.

### Final Note

This assessment identified 5 critical readiness categories, 6 major planning-quality issues, and 2 documentation-currency concerns. The planning baseline is strong, but implementation should not begin for the new API-first/public-launch tranche until the missing requirements and capability-cutover plan are represented in authoritative epics and stories.

**Assessor:** OpenCode
**Assessment completed:** 2026-07-28
- Database entities are usually introduced at their first feature use instead of being front-loaded into a generic schema epic.
