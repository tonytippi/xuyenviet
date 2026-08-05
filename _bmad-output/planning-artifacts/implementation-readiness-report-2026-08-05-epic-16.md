---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
scope: Epic 16
documents:
  prd:
    - prds/prd-xuyenviet-2026-07-04/prd.md
  epics:
    - epics.md
  project_context:
    - ../project-context.md
  architecture: []
  ux: []
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-05
**Project:** xuyenviet
**Scope:** Epic 16

## Document Inventory

### PRD

- `prds/prd-xuyenviet-2026-07-04/prd.md`

### Architecture

- No architecture artifact was discoverable using the prescribed planning-artifact patterns.

### Epics and Stories

- `epics.md`

### UX

- No UX artifact was discoverable using the prescribed planning-artifact patterns.

### Persistent Project Context

- `_bmad-output/project-context.md`

### Discovery Notes

- No duplicate whole-document and sharded-document source was discovered.
- The existing Epic 16 readiness report is replaced by this assessment.
- Architecture and UX inputs are unavailable through the prescribed discovery patterns and will be recorded as assessment constraints.

**Discovery correction:** The initial patterns did not recurse into nested artifact directories. The epics frontmatter identifies, and a recursive verification found, the authoritative architecture and UX inputs listed below. They are used for the remaining assessment steps.

- `architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- `architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md`
- `architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md`
- `ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md`
- `ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`

## PRD Analysis

### Functional Requirements

The authoritative PRD defines FR-1 through FR-60, including inserted requirements. The complete requirement text is authoritative in `prds/prd-xuyenviet-2026-07-04/prd.md` lines 141-260. This assessment extracts the complete identifier set below and preserves the Epic 16-relevant requirements verbatim for coverage validation.

**AI Ask:** FR-1 Vietnamese authenticated chat; FR-2 broad underspecified road-trip questions; FR-3 Vietnamese-default answers; FR-4 useful initial guidance with missing details; FR-5 concise follow-up questions; FR-6 iterative conversation refinement; FR-6A streaming only after context/source-bundle/provenance preparation; FR-6B supported authenticated image input; FR-6C image size/type/ownership/safety validation before provider calls; FR-7 calm Vietnamese answer presentation with plan/options, rationale, practical tips, relevant verification guidance, and next steps, excluding technical provenance/reasoning/audit/processing/provider detail from the default reading path.

**Authentication, chats, and trips:** FR-8 Google Login before AI; FR-9 authenticated-user ownership of chat sessions and Trip Projects; FR-10 extraction of traveler and trip details; FR-11 reuse of relevant current-chat or selected-project context; FR-12 chat versus project context distinction; FR-13 chat correction of trip details; FR-14 storage notice; FR-15 owner deletion of chat/project; FR-16 travel-only non-sensitive personalization data; FR-16A through FR-16I owner-scoped structured Trip Project anchors, dated legs/activities, states, constraints, primary conversation, Trip Home, typed proposals, explicit proposal application, and history; FR-16J unscoped natural-language start with explicit durable-project recommendation/creation and persisted decline fence; FR-16K server-owned recommendation or clarification for unscoped questions without automatic context attachment, with private answers excluding selected-project constraints; FR-16L traveler-language active-project composer context and an explicit outside/switch action, without conversation merge/copy.

**Knowledge cards:** FR-17 operator-created cards; FR-18 required card metadata; FR-18A validated evidence/source details; FR-18B no traveler-visible PII/sensitive content; FR-18C bounded practical route details; FR-19 card types; FR-20 operator lifecycle actions; FR-21 active eligible cards retrieved without mandatory operator approval; FR-22 provenance inspection; FR-22A lifecycle states; FR-22B domain classification distinct from workflow; FR-22C verification requirement distinct from classification; FR-22D only evidence-eligible active cards retrieved.

**Knowledge collection:** FR-23 raw-source submission; FR-23A through FR-23C controlled Facebook capture and canonical job-status rules; FR-24 AI triage and independently grounded candidates; FR-24A through FR-24F dispositions, independent judgment, complete atomic-claim processing, transactional aggregate completion, superseded-capture safety, and itinerary observation extraction; FR-25 retrievability gates; FR-25A version-bound risk-prioritized operator work; FR-25B quality sampling and cohort containment; FR-26 confidence labels; FR-27 freshness marking; FR-28 100-card seed set; FR-28A safe aggregate seed-coverage reporting.

**Retrieval and answer grounding:** FR-29 active, eligible card retrieval; FR-30 priority order of project context, chat context, active knowledge, web search, then general AI; FR-31 web-search fallback cases; FR-32 persisted/auditable source categories without default traveler display; FR-33 changing-detail verification warning; FR-34 no guarantees for unverified collection; FR-35 external/unverified web-search representation; FR-36 official/provider preference; FR-37 Facebook official-source rule; FR-37A through FR-37C community wording, independent-pattern threshold, and conflicted-claim restriction.

**Family-aware planning:** FR-38 through FR-41 child-aware pacing, suitability warnings, sourced family tips, and parent/child balance.

**Public-MVP operations and runtime:** FR-42 public sign-in with authenticated AI Ask; FR-43 through FR-45 operator-area and role foundations; FR-45A safe ingestion outcomes; FR-45B exact-admin roster and role safety; FR-45C safe user usage aggregates; FR-46 answer usefulness feedback; FR-46A plain-Vietnamese traveler operational states and recovery actions, with no technical terminology; FR-47 usage events; FR-48 referral attribution without rewards; FR-49 model records; FR-49A model pricing/default/archive management; FR-50 pricing-based cost estimates; FR-51 through FR-60 versioned NestJS API, direct browser clients, separate admin app, request-principal authorization, safe API errors, documented contracts, worker ownership, one writer per command, streamed API events, and retirement of legacy domain transports.

**Total FR identifiers:** 89 (FR-1 through FR-60, including suffix requirements).

### Non-Functional Requirements

- NFR-1: Interactive planning responsiveness; architecture defines the target.
- NFR-2: Secure authenticated-only chat and Trip Project persistence.
- NFR-3: No operator-only raw material or admin controls for travelers.
- NFR-4: Auditable AI-answer knowledge/source influence.
- NFR-5: Vietnamese input, retrieval, and output.
- NFR-6: Sparse-knowledge tolerance through clearly uncertain web fallback.
- NFR-7: Deferred Maps, submissions, and booking/partner flows do not become MVP dependencies.
- NFR-8: Operator-controlled Facebook automation, not public-path or unattended mass crawling.
- NFR-9: Auditability of active AI-extracted claims across disposition, work resolution, evidence, source, lifecycle, and history.
- NFR-9A: Bounded-progress, idempotent source ingestion with supersession safety and technical-only job status.
- NFR-9B: Atomic source-removal retirement and fail-closed retrieval/indexing behavior.
- NFR-10: Owner-scoped Trip Project reads and mutations until separately approved collaboration.
- NFR-11: Owner-authorized, applicable, auditable proposal application.
- NFR-12: Independently deployable staging workloads with least privilege and pre-traffic migrations.
- NFR-13: Explicit liveness/readiness and safe worker shutdown.
- NFR-14: Correlation IDs and safe telemetry across browser, API, worker, and provider operations.
- NFR-15: Private, origin-controlled browser/API/database traffic and isolated environment credentials/configuration.
- NFR-16: Disposable-target-only clean-break lifecycle migration; durable data requires approved forward-only migration.
- NFR-17: Replacement worker operational evidence before legacy-loop retirement.
- NFR-18: Public-launch operational approval and capacity/backup-restore validation.

**Total NFR identifiers:** 19.

### Additional Requirements

- PRD acceptance criteria AC-25 through AC-27 are the direct Epic 16 acceptance contracts.
- The chat/trip and traveler-trust product contracts prohibit automatic project attachment, prohibit project constraints in a private turn, require persisted answer provenance, and restrict traveler source disclosure to safe, action-triggered detail.
- Trip Planning Foundation remains single-owner, proposal-confirmed, and excludes weather, live route data, location, Maps, booking, budget, checklists, vault, collaboration, and notifications.

### PRD Completeness Assessment

The current PRD is final and was last updated on 2026-08-05. Its historic readiness reviews are context, not authoritative requirements. For Epic 16, FR-7, FR-16J to FR-16L, FR-32, FR-33, FR-46, FR-46A, and AC-25 to AC-27 provide sufficient product specificity for validation.

## Epic Coverage Validation

### Epic FR Coverage Extracted

The `FR Coverage Map` in `epics.md` maps the baseline product requirements to Epics 1-5, 7, 14, and 15. The later architecture-delta coverage map assigns API, runtime, and migration requirements to Epics 9-14. Epic 16 explicitly maps FR-7, FR-16J, FR-16K, FR-16L, FR-32, FR-33, FR-46, and FR-46A to Stories 16.1-16.4.

### Epic 16 Coverage Matrix

| PRD requirement | Story coverage | Status |
|---|---|---|
| FR-7: calm Vietnamese answers without technical default reading path | 16.3, 16.4 | Covered |
| FR-16J: unscoped natural-language start, explicit save recommendation, decline fence | 16.1, 16.4 | Covered |
| FR-16K: explicit server-owned owned-project choice; no auto-attachment; private turn excludes constraints | 16.1, 16.4 | Covered |
| FR-16L: traveler-language active context and explicit unscoped/switch path without merge | 16.2, 16.4 | Covered |
| FR-32: persisted/auditable source category without default traveler display | 16.3, 16.4; preserves Epic 4 persistence baseline | Covered |
| FR-33: practical changing-detail verification guidance | 16.3, 16.4 | Covered |
| FR-46: lightweight answer-footer usefulness feedback | 16.3; preserves completed Epic 5 capture baseline | Covered with preservation dependency |
| FR-46A: plain Vietnamese loading, unavailable, verification, and failure states with recovery | 16.3, 16.4 | Covered |
| AC-25: explicit save/decline behavior | 16.1, 16.4 | Covered |
| AC-26: explicit owned-project continuation or private answer | 16.1, 16.2, 16.4 | Covered |
| AC-27: technical-detail-free Vietnamese state and recovery copy | 16.2, 16.3, 16.4 | Covered |

### Full PRD FR Coverage Finding

The coverage map provides an implementation path for every PRD FR except FR-57. Although Epic 12 describes a dedicated Worker runtime and bounded sweeps, the map and Epic 12 do not claim FR-57, and its explicit FR coverage list is absent. This is an overall epics traceability defect, not an Epic 16 feature gap.

### Missing Requirements

#### High Priority Missing FR

**FR-57:** The system shall run continuous background work in a dedicated worker runtime and bounded sweeps as scheduled one-shot commands using existing PostgreSQL job, claim, lease, fencing, and idempotency protocols.

- Impact: Worker ownership and bounded scheduled execution are production-contract requirements. Omitting the formal map makes the final requirements traceability incomplete even though Epic 12 appears to contain the intended implementation work.
- Recommendation: Add FR-57 to Epic 12's FR coverage and identify its implementing stories, or explicitly map it to the delivered epic if another epic owns it.

### Coverage Statistics

- Total PRD FR identifiers: 89.
- FR identifiers with an explicit epic implementation path: 88.
- Overall explicit FR coverage: 98.9%.
- Epic 16-scoped FRs with story-level coverage: 8 of 8 (100%).
- Epic 16 direct acceptance criteria AC-25 through AC-27 covered: 3 of 3.

## UX Alignment Assessment

### UX Document Status

**Found.** `DESIGN.md` and `EXPERIENCE.md` are final artifacts updated on 2026-08-05. They define the chat-first traveler experience, responsive shell, traveler-safe trust disclosure, feedback placement, state copy, and accessibility floor required by Epic 16.

### Confirmed Alignment

- Natural-language first use, a compact assistant recommendation only after durable context, and no mandatory chat-versus-project choice align with FR-16J and Story 16.1.
- The companion action's explicit save, continue, private-answer, another-trip, or decline choices align with FR-16K; architecture AD-30A supplies the server-owned decision, owner scoping, decline fence, idempotency, and private-turn boundary.
- Selected-trip context in traveler language, `Hỏi XuyenViet` for unscoped chat, and sidebar/sheet project selection align with FR-16L and Story 16.2. The UX explicitly excludes persistent composer scope-switch/leave controls.
- Calm scannable answers, compact nearby verification disclosure, persisted-provenance-only detail views, and quiet answer-footer feedback align with FR-7, FR-32, FR-33, FR-46, and Story 16.3.
- Plain Vietnamese loading, unavailable, verification, failure, and retry projections, plus accessibility rules for focus restoration, `aria-live`, keyboard operation, 44px mobile targets, and reduced motion align with FR-46A and Stories 16.3-16.4.
- Architecture AD-11 requires persisted provenance rather than prose parsing; AD-24 keeps conversation/project selection URL-owned with a server-loaded shell; AD-30B constrains traveler state to bounded Vietnamese recovery copy. These decisions support the UX contract.

### Alignment Issues

None found. The previously reported composer-navigation conflict is resolved in `EXPERIENCE.md`: active-trip context may be displayed in the composer, while `Hỏi XuyenViet` and the sidebar/sheet project list are the explicit unscoped/switch mechanisms.

### Warnings

- UX `Source summary row` refers to a source detail action while correctly prohibiting generic source-category chips. Implement Story 16.3 using the narrower PRD traveler-trust contract and AD-11 safe disclosure projection; do not reintroduce the older generic source/confidence display treatment found in historical UX material.
- The architecture spine confirms the three Epic 16 decisions, but the final report must retain the overall FR-57 mapping omission as a non-Epic-16 traceability issue.

## Epic Quality Review

### Epic Structure

Epic 16 is user-value focused. It gives travelers a simpler safe entry to planning, explicit choice over persistent Trip Project creation/context, and practical non-technical trust and recovery guidance. It is not a technical milestone: the typed decision, server-shell, provenance, and accessibility constraints protect directly observable traveler outcomes.

Its dependencies are valid completed baselines rather than future Epic 16 work: Chat/Trips ownership and primary conversations; persisted provenance and source detail; feedback capture; and the URL-owned shell. The epic does not recreate those aggregates and preserves their existing ownership boundaries.

### Story Quality And Ordering

| Story | User value and size | Dependency assessment | Acceptance-criteria assessment |
|---|---|---|---|
| 16.1 | A focused vertical slice for explicit save/continue/private decisions. | Correctly establishes the typed owner-bound decisions, decline fence, and idempotent creation before consumers render/switch them. | Specific and testable across no-match, decline, acceptance, stale, deleted, changed-context, and cross-owner paths. Persistence is introduced at first use. |
| 16.2 | A coherent shell/navigation slice that makes trip scope understandable without extra composer controls. | Depends on the established decision behavior in 16.1 and completed URL-owned shell/primary conversation baseline; no forward dependency. | Tests normal scope, unscoped escape, project selection, pending state, stale/deleted/unauthorized recovery, and focus behavior. |
| 16.3 | A contained presentation slice for calm answer, disclosure, feedback placement, recovery, and accessibility. | Consumes completed persisted provenance and feedback capture rather than introducing alternate browser state or data ownership. It can follow 16.1/16.2 without waiting for 16.4. | Clear rendering prohibitions and actionable accessibility/recovery outcomes. It protects the most likely trust and UI regressions. |
| 16.4 | A verification story that produces executable evidence that the preceding value slices preserve ownership, privacy, trust, and accessibility. | Intentionally follows 16.1-16.3 and does not introduce a feature dependency back into them. | Comprehensive, testable unit/integration/UI/accessibility coverage plus required lint/typecheck/build verification. |

### Quality Findings

| Severity | Finding | Recommendation |
|---|---|---|
| Minor | Story 16.3 changes feedback presentation but does not name the completed feedback capture contract or its test location. A visual simplification could leave controls displayed but make persistence a no-op. | During Story 16.3 preparation, explicitly link the existing feedback command/read contract and preserve its focused test coverage. |
| Minor | Epic 16’s stated architecture decisions AD-11, AD-30A, and AD-30B are present in the architecture spine, but the plan does not cite the completed baseline story/contract locations for feedback and URL-shell behavior. | Include these baseline references in each generated story file, especially for Stories 16.2 and 16.3, to prevent duplicate client state or ownership. |

### Compliance Checklist

- Epic delivers traveler value: Pass.
- Epic is independently valuable on completed baseline capabilities: Pass.
- Stories are appropriately sized as vertical slices: Pass.
- No forward implementation dependencies: Pass.
- New persistence is introduced by the first consuming story: Pass.
- Acceptance criteria are BDD-formatted, testable, and cover recovery/authorization edges: Pass.
- Epic-level PRD traceability: Pass.

## Summary and Recommendations

### Overall Readiness Status

**READY for Epic 16 implementation.**

The Epic 16 product contract is complete and aligned: all eight scoped FRs, AC-25 through AC-27, the final UX contract, and architecture decisions AD-11, AD-24, AD-30A, and AD-30B have an ordered, testable story path. Stories 16.1 through 16.4 form valid vertical slices without forward dependencies.

### Critical Issues Requiring Immediate Action

None for Epic 16.

### Non-Blocking Findings

1. **Overall epics traceability:** FR-57 has no explicit coverage-map entry, despite Epic 12 appearing to contain the intended Worker-runtime work. This does not block Epic 16, but the map should be corrected before relying on it for whole-product readiness.
2. **Feedback preservation:** Story 16.3 must retain the completed usefulness-feedback persistence contract while changing its placement and interaction.
3. **Baseline traceability:** Generated Story 16.2 and Story 16.3 artifacts should cite the existing URL-owned shell and feedback/provenance contracts to avoid parallel client state or accidental behavior replacement.

### Recommended Next Steps

1. Create and validate Story 16.1 using the Chat/Trips owner-decision, idempotency, context-revision, and migration contracts.
2. Correct the `epics.md` coverage map by assigning FR-57 to Epic 12 and its relevant stories.
3. Before Story 16.3 development, link the existing feedback persistence tests and the AD-11 provenance projection contract in the story context.
4. Complete Story 16.4 with focused unit/integration and responsive accessibility tests, then run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

### Final Note

This assessment identified three non-blocking findings across overall requirements traceability and story-preservation documentation. No Epic 16-scoped requirement gap, UX conflict, architecture conflict, technical-milestone problem, or forward dependency was found.
