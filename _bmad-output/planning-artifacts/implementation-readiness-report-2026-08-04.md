---
stepsCompleted:
  - step-01-document-discovery
documentsIncluded:
  prd: prds/prd-xuyenviet-2026-07-04/prd.md
  architecture:
    - architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
    - architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md
    - architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md
  epics: epics.md
  ux:
    - ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md
    - ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-04
**Project:** xuyenviet

## Document Inventory

### PRD

- `prds/prd-xuyenviet-2026-07-04/prd.md`

### Architecture

- `architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- `architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md`
- `architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md`

### Epics and Stories

- `epics.md`

### UX Design

- `ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md`
- `ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`

No duplicate whole-versus-sharded documents were found. The selected documents were confirmed for this assessment.

## PRD Analysis

### Functional Requirements

The PRD's authoritative functional-requirement text is section 8 of `prds/prd-xuyenviet-2026-07-04/prd.md` (lines 137-256). The complete requirements are grouped as follows for traceability:

- **AI Ask:** FR-1 through FR-7, including streaming (FR-6A), authenticated image input (FR-6B), and pre-provider image validation (FR-6C).
- **Authentication, chats, and trips:** FR-8 through FR-16, plus FR-16A through FR-16I for owner-scoped structured Trip Projects, one primary conversation, Trip Home, and explicitly applied change proposals with history.
- **Knowledge cards:** FR-17 through FR-22, plus FR-18A through FR-18C and FR-22A through FR-22D for evidence, privacy, route ordering, lifecycle, classification, verification, and retrieval eligibility.
- **Knowledge collection:** FR-23 through FR-28, plus FR-23A through FR-23C, FR-24A through FR-24F, FR-25A through FR-25B, and FR-28A for operator capture, immutable source ingestion, independent candidate judgment, lifecycle/work fencing, sampling, and seed coverage.
- **Retrieval, search, and grounding:** FR-29 through FR-37, plus FR-37A through FR-37C for retrieval precedence, fallback, provenance, confidence, and conflicted/community handling.
- **Family-aware planning:** FR-38 through FR-41.
- **Public MVP operations and platform migration:** FR-42 through FR-60, plus FR-45A through FR-45C and FR-49A, covering operator capabilities, feedback, usage/referrals, gateway model pricing, versioned NestJS APIs, worker ownership, streaming migration, and legacy retirement.

Total FRs: 98 numbered requirements, counting alphanumeric requirement identifiers independently.

### Non-Functional Requirements

The PRD's authoritative NFR text is section 9 of `prds/prd-xuyenviet-2026-07-04/prd.md` (lines 258-279):

- **NFR-1:** Interactive chat responsiveness; an exact latency target remains an architecture-spike assumption.
- **NFR-2:** Secure persistence and authenticated-only access for chats and Trip Projects.
- **NFR-3:** No normal-traveler exposure of operator-only raw sources or admin controls.
- **NFR-4:** Answer auditability to knowledge cards/source types.
- **NFR-5:** Vietnamese input, retrieval, and output support.
- **NFR-6:** Sparse-data tolerance through explicitly uncertain web-search fallback.
- **NFR-7:** Future Maps, submissions, booking, and partner flows must not become MVP dependencies.
- **NFR-8:** Facebook capture is an operator-controlled tool, not public-path logic or mass crawling.
- **NFR-9:** Active AI claims remain auditable through disposition, evidence, state, work resolution, and audit history.
- **NFR-9A:** Large-source ingestion makes bounded progress without claim quotas and resists retry, duplicate-delivery, and supersession errors.
- **NFR-9B:** Source removal atomically retires evidence, re-evaluates dependent cards, de-indexes ineligible search data, and retrieval fails closed.
- **NFR-10:** Trip Project reads and writes remain owner-scoped until approved collaboration exists.
- **NFR-11:** Proposal application verifies selected-trip membership, applicability, and owner authorization before an auditable write.
- **NFR-12:** API, worker, traveler web, operator app, and migrations deploy independently to staging with least privilege and ordered migrations.
- **NFR-13:** Defined liveness/readiness and safe worker shutdown/lease behavior.
- **NFR-14:** Correlated, safe telemetry across admission, API, worker, and providers.
- **NFR-15:** Private origin-controlled browser/API/database traffic and isolated environment credentials/configuration.
- **NFR-16:** Disposable-target clean-break migration safeguards, or an approved forward-only plan before durable data exists.
- **NFR-17:** Replacement worker operational proof before legacy loop retirement.
- **NFR-18:** Public-launch platform ownership, security, operations, capacity, and recovery approvals/tests.

Total NFRs: 20 numbered requirements, counting NFR-9A and NFR-9B independently.

### Additional Requirements

- Sections 10 and 13 define binding product contracts and acceptance criteria for data controls, source display, community-publication policy, web search, answer quality, usage/referrals, Trip Planning Foundation, and 25 acceptance criteria (AC-1 through AC-24 with variants).
- Initial scope is the Hanoi-to-HCMC corridor and must reach 100 active, evidence-grounded cards before the first public-MVP evaluation.
- Open decisions remain for web-search provider, source URL presentation, Gateway privacy wording, Facebook reuse/retention policy, and possible AI image output.

### PRD Completeness Assessment

The PRD is comprehensive and current (`updated: 2026-08-04`), with precise invariants for the highest-risk workflows. It is implementation-oriented but includes unresolved vendor/legal/product decisions and one intentionally undefined response-latency target; subsequent coverage validation must confirm these are either assigned to stories or explicitly retained as pre-launch decisions.

## Epic Coverage Validation

### Coverage Matrix

| PRD requirement group | Epic coverage | Status |
| --- | --- | --- |
| FR-1 to FR-7, FR-6A to FR-6C | Epics 2 and 4 | Covered |
| FR-8 to FR-16 | Epics 1 and 2 | Covered |
| FR-16A to FR-16I | Epic 7 | Covered |
| FR-17 to FR-28, including variants | Epics 3 and 15 | Covered; Epic 15 is the target lifecycle cutover |
| FR-29 to FR-37C | Epics 3, 4, and 15 | Covered |
| FR-38 to FR-41 | Epic 5 | Covered |
| FR-42 to FR-45A | Epics 1, 3, 9, 13, and 14 | Covered |
| FR-45B | No explicit epic/story assignment | Missing |
| FR-45C | No explicit epic/story assignment | Missing |
| FR-46 to FR-48 | Epics 1, 4, 5, and 14 | Covered |
| FR-49 | Epic 4 | Covered at epic level |
| FR-49A | No explicit epic/story assignment | Missing |
| FR-50 | Epic 4 | Covered at epic level |
| FR-51 to FR-60 | Epics 9 through 14 | Covered at epic level; migration target is Epic 14 |

### Missing Requirements

#### Critical Missing FRs

- **FR-45B:** Exact administrators need a safe paginated user roster, controlled `operator`/`admin` role mutations, audit records, and prevention of final-admin/self-final-admin removal.
  - **Impact:** The PRD adds authorization-sensitive administrator behavior not traceable to an implementation story. Story 9.2 covers initial-admin bootstrap and role changes but does not specify the roster, exact-admin-only access, or self-final-admin constraint.
  - **Recommendation:** Add a story to the direct API/admin migration scope, or expand Story 9.2 and its API/admin-client follow-through with this full contract.

- **FR-45C:** The exact-admin roster must expose per-displayed-user persisted AI-event and token aggregates, with defined null handling and no prompt/provider-payload exposure.
  - **Impact:** This is a privacy- and query-scope-sensitive administrative reporting feature with no assigned API, aggregation, authorization, or UI implementation path.
  - **Recommendation:** Add a dedicated story after the roster contract in FR-45B, including pagination-scoped aggregation and safe-response tests.

- **FR-49A:** Exact administrators need lifecycle management for AI Gateway model records, pricing snapshots, default eligibility, archive-only removal, and exact-micros pricing rules.
  - **Impact:** FR-49 and FR-50 are assigned to Epic 4, but no Epic 4 story specifies administration of model records or immutable pricing snapshots. Cost estimation cannot meet the PRD contract without it.
  - **Recommendation:** Add a model-catalog administration story before the cost-estimation story, with authorization, precision, active-default, archive, and safe-display acceptance criteria.

#### Traceability Gaps

- **FR-23C:** The canonical Facebook-capture ingestion-job status requirement is not listed in the epics requirements inventory or FR Coverage Map. Story 15.2 substantively covers technical job accounting, but the requirement must be explicitly mapped to avoid losing the admin-capture status/filter/count/order contract.
- **FR-28A:** The aggregate-only seed-coverage report is not listed in the epics requirements inventory or FR Coverage Map. Story 3.11 substantively covers the report, but the explicit map should name FR-28A and its raw-data exclusion constraint.

### Coverage Statistics

- Total PRD FRs: 98
- FRs with an explicit epic path: 93
- FRs with substantive story coverage but no explicit FR-map entry: 2 (`FR-23C`, `FR-28A`)
- FRs without an explicit epic/story path: 3 (`FR-45B`, `FR-45C`, `FR-49A`)
- Explicit epic-path coverage: 94.9%
- Story-level readiness concern: Epic 14 Stories 14.2 through 14.6 are headings without acceptance criteria. Their assigned direct-API and legacy-retirement requirements are therefore not implementable as written.

## UX Alignment Assessment

### UX Document Status

UX documentation is present and current:

- `ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md` (`status: final`, updated 2026-07-24)
- `ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md` (`status: final`, updated 2026-08-04)

### Alignment Findings

- **PRD to UX:** The UX supports authenticated Vietnamese AI Ask, broad-question guidance, source/confidence and freshness presentation, chat/trip ownership and deletion, image validation, family-aware answers, feedback, referral silence, operator separation, and structured Trip Project proposal confirmation.
- **UX to architecture:** Architecture decisions AD-4, AD-8, AD-11 through AD-13, AD-16 through AD-24, AD-29, and AD-30 explicitly provide the API/auth, source-bundle/provenance, safe detail, responsive-shell, deletion, and owner-confirmed planning foundations demanded by the UX.
- **Accessibility and responsiveness:** UX-DR1 through UX-DR24 specify Vietnamese-first copy, responsive shell transitions, focus/keyboard behavior, `aria-live` streaming states, 44px mobile touch targets, color-independent status communication, and WCAG 2.2 AA. Architecture AD-18 through AD-24 assigns the needed shell/data/state ownership.
- **Trust boundaries:** UX prohibits raw-source leakage, prose-parsed citations, unconfirmed AI plan mutations, and implied Maps/booking/current-data behavior; the PRD and architecture impose the same constraints.

### Alignment Issues and Warnings

- **Blocker:** `EXPERIENCE.md` and the current architecture require browser applications to call NestJS APIs directly with NestJS-owned Google OAuth, opaque sessions, and CSRF. Epic 14 is the implementing cutover, but Stories 14.2 through 14.6 lack acceptance criteria. The direct-API UX contract is therefore not traceable to executable story scope.
- **Warning:** The UX document has a stale source link to `implementation-readiness-report-2026-07-21.md`; it should be updated after this report becomes authoritative.
- **Warning:** The UX still lists the exact AI Gateway privacy-policy wording as an open question. The current copy is specified, but Product/legal approval remains a launch prerequisite rather than a completed implementation requirement.

## Epic Quality Review

### Strengths

- Epics 1 through 7 express traveler or operator outcomes, and their stories generally have testable Given/When/Then acceptance criteria, ownership boundaries, error behavior, and concrete privacy/safety constraints.
- Epic 7 is a strong vertical slice: aggregate schema, primary-conversation migration, Trip Home, proposal generation, proposal application, and owner-safety verification are sequenced without a future-story dependency.
- Epic 15 cleanly replaces the prior knowledge-lifecycle representation with explicit disposable-target constraints, lifecycle invariants, worker/API/admin ownership, and a final transition-matrix verification story.
- Source/knowledge stories define database changes when the relevant capability first needs them, rather than placing all persistence work into a generic setup story.

### Critical Violations

- **Epic 14 Stories 14.2 to 14.6 are incomplete.** They contain only titles and role/value statements, without acceptance criteria, dependency order, migration behavior, tests, or rollback/operational proof. Yet they are assigned FR-51 through FR-60 and NFR-12 through NFR-18, including the public-launch legacy-retirement gate.
  - **Remediation:** Write independently testable ACs for each story before implementation. Sequence them explicitly after Story 14.1 and include direct browser API admission, CSRF/origin policy, one-writer cutover, API contracts, data/route ownership removal, staging rollback, Worker readiness, and launch evidence.

### Major Issues

- **Outdated transport epics remain ambiguous.** Epics 9 through 13 prescribe Auth.js/BFF behavior that the current architecture and UX explicitly supersede with direct browser-to-NestJS API access. The document calls them historical in Epic 14 but does not consistently mark their stories as completed/superseded or prevent their BFF acceptance criteria from being selected for new work.
  - **Remediation:** Add an explicit historical/superseded status and selection rule to Epics 9 through 13, or move them to a historical appendix. Keep only evidence still relevant to the direct-API design.

- **Three current PRD requirements lack stories:** FR-45B, FR-45C, and FR-49A. This leaves privileged roster/role operations, safe AI-usage aggregates, and model pricing/default lifecycle management unplanned.
  - **Remediation:** Add stories with API, authorization, safe read-model/UI, database precision/constraints, and focused tests before related public/admin work begins.

- **Two current requirements are implemented in substance but not traceably mapped:** FR-23C and FR-28A.
  - **Remediation:** Correct the requirements inventory and FR Coverage Map so their implementation does not depend on a reviewer inferring coverage from story text.

### Minor Concerns

- Epic numbering is non-sequential in its first list (Epic 15 precedes detailed sections for Epics 12 through 14), which is acceptable for amendments but makes execution order unclear without the sprint artifact.
- Several broad implementation notes use completed-baseline claims; they should link to concrete completion evidence or story artifacts when the team uses this document for release decisions.
- The PRD NFR ordering places NFR-11 after NFR-18. It is unambiguous by identifier but should be normalized in the next PRD maintenance pass.

## Summary and Recommendations

### Overall Readiness Status

**NOT READY**

The planning set has a strong and aligned PRD, UX contract, and architecture spine. It is not ready to begin the remaining implementation sequence because the current direct-API cutover plan is incomplete and three active PRD requirements lack an implementation path.

### Critical Issues Requiring Immediate Action

1. Complete Epic 14 Stories 14.2 through 14.6 with independently testable acceptance criteria. These stories carry the direct API cutover, one-writer migration, and legacy-retirement requirements that the current architecture and UX mandate.
2. Create or explicitly scope stories for FR-45B, FR-45C, and FR-49A. Do not treat role-safe administration, roster usage aggregation, or Gateway pricing/default governance as implied work.
3. Resolve the obsolete BFF/Auth.js story ambiguity in Epics 9 through 13. They must not remain selectable as future implementation paths after the approved direct API architecture change.

### Recommended Next Steps

1. Run `bmad-correct-course` to update the epics/stories plan around the direct-API decision and add the missing administrator/model-catalog stories.
2. Update `epics.md` with explicit mappings for FR-23C and FR-28A, and normalize the authoritative current/historical status of Epics 9 through 15.
3. Re-run `bmad-check-implementation-readiness` after the epic/story corrections.
4. Before public-launch planning, resolve the named launch prerequisites: Gateway privacy/legal approval, Tavily validation, verified model pricing, OAuth/admin/referral smoke evidence, test sequencing, and operational/deployment proof.

### Final Note

This assessment identified **7 issues** across four categories: missing FR coverage, incomplete direct-API stories, superseded-plan ambiguity, and documentation traceability/currency. Address the three critical planning issues before proceeding to the next implementation story.

**Assessor:** OpenCode
**Assessment completed:** 2026-08-04

## Reconciliation Addendum - 2026-08-04

This assessment was reconciled against the current `_bmad-output/implementation-artifacts/sprint-status.yaml` and completed implementation specifications after the initial review. The initial `NOT READY` conclusion was based on incomplete traceability in `epics.md`, not missing implementation work.

- Epic 14 Stories 14.2 through 14.6 are complete in sprint status. Their approved direct-API acceptance summaries are now restored in `epics.md`.
- FR-45B and FR-45C are delivered through the completed direct admin user-roster and role-governance cutover. FR-49A is delivered through the completed direct admin AI Gateway model-catalog cutover. No duplicate stories are required.
- FR-23C and FR-28A now have explicit mappings to their existing technical and safe-admin projection stories.
- Epics 9 through 13 are completed historical API/Worker/admin extraction evidence. Their BFF/Auth.js browser-transport requirements are superseded and are not selectable for new work.

### Reconciled Status

**READY FOR NEXT STORY PLANNING**

This status applies to implementation-story planning only. **PUBLIC LAUNCH REMAINS NO-GO** until the external staging/production evidence required by Story 14.6 and the existing verified-provider-pricing and Tavily-monitoring action items are complete.

**Reconciliation source:** `sprint-change-proposal-2026-08-04-readiness-traceability.md`
