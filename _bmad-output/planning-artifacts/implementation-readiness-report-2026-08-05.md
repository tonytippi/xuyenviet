---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentsIncluded:
  prd: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md
  architecture: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  epics: _bmad-output/planning-artifacts/epics.md
  ux: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-05
**Project:** xuyenviet

## Document Discovery

### Selected Source Documents

- PRD: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`
- Architecture: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- Epics and stories: `_bmad-output/planning-artifacts/epics.md`
- UX: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/`

### Discovery Notes

- The PRD, architecture, and UX are maintained as one sharded bundle each; `epics.md` is the sole active epic inventory.
- Prior PRD reviews and readiness reports are historical review artifacts, not competing source documents.
- No duplicate whole-versus-sharded source documents require resolution.

## PRD Analysis

### Functional Requirements

- FR-1 to FR-7: Authenticated Vietnamese AI Ask supports broad requests, useful initial guidance, concise clarification, iterative refinement, post-context/provenance streaming, validated supported images with no invalid provider call, and calm practical answer composition without technical internals in the default reading path.
- FR-8 to FR-16: Google-authenticated, owner-scoped chats and trips retain/reuse distinct chat and project context; users can correct context in chat, receive storage notice, delete owned data, and avoid unnecessary sensitive-personal-data storage.
- FR-16A to FR-16I: The primary conversation can propose owner-confirmed, structured anchors, dated legs/activities, constraints, and item states; projects retain one primary conversation, deterministic Trip Home, typed/expiring proposals, and actor/timestamped proposal history.
- FR-16J to FR-16L: Empty chat accepts natural requests without preselection; save recommendations are explicit and remembered on decline; unscoped questions never attach project context without selection; scoped composition identifies and permits switching or leaving the active trip.
- FR-17 to FR-22D: Operators manage evidence-grounded knowledge cards with required metadata, bounded practical details, target card types, active-only retrieval, inspectable provenance, exclusive lifecycle, separate classification and verification requirement, and no traveler access to pending or ineligible cards.
- FR-23 to FR-23C: Operators submit URL/text/copied content/images; queued Facebook capture uses an operator-controlled browser flow that saves only confirmed visible raw text and treats canonical ingestion job status as primary operational state.
- FR-24 to FR-24F: AI triages immutable source versions, discovers all qualifying atomic claims, grounds each against an exact span, uses independent judgment, preserves individual immutable candidate outcomes/reasons, reports technical counters only, rejects obsolete work, and preserves route-stop ordering with useful sibling observations.
- FR-25 to FR-28A: Publication requires validated safe actionable evidence; risk-prioritized, version-fenced work and separate sampling do not form an approval gate; confidence/freshness are supported; at least 100 eligible corridor cards and a safe aggregate-only coverage report are required.
- FR-29 to FR-37C: Retrieval admits eligible active cards only, prioritizes trip then chat context then knowledge/search/general AI, invokes fallback under defined conditions, retains auditable source category, provides verification guidance, prefers official sources, and gives community/conditional/conflict claims constrained wording and use.
- FR-38 to FR-41: Plans involving children account for pacing, rest, suitable activities, discounts, and child/parent tradeoffs.
- FR-42 to FR-50: Public Google sign-in, separated operator area, operator/admin roles and safe roster/role mutation, lightweight answer feedback, Vietnamese practical UI status/recovery copy, authenticated usage/referral capture without rewards, and administrable priced Gateway models are provided.
- FR-51 to FR-60: Versioned direct NestJS contracts serve traveler/admin/future clients using opaque sessions and current principals, safe errors, documented health/capability contracts, dedicated worker execution, a single writer/transport owner, API-owned AI streaming, and pre-launch retirement of Auth.js/BFF/legacy routes/actions/admin.

**Total FRs:** 73 numbered requirements (FR-1 through FR-60, including lettered sub-requirements).

### Non-Functional Requirements

- NFR-1: Chat must feel responsive for interactive planning; latency target remains to be defined after architecture spikes.
- NFR-2: Chats and Trip Projects remain secure and accessible only to authenticated users.
- NFR-3: Traveler views never expose operator-only raw sources or admin controls.
- NFR-4: Answers retain sufficient auditability of influencing knowledge and source types.
- NFR-5: Input, retrieval, and output support Vietnamese content.
- NFR-6: Sparse knowledge is tolerated through clearly uncertain web-search fallback.
- NFR-7: Maps, public submissions, and booking/partner flows remain non-dependencies that can be added later.
- NFR-8: Facebook automation remains operator-controlled operations tooling, outside public request paths and mass crawling.
- NFR-9: Active AI claims remain auditable through disposition, work resolution, evidence/source, lifecycle, and audit history.
- NFR-9A: Large-source ingestion advances without fact quotas; retries, interruptions, duplicates, and supersession cannot duplicate or mutate canonical knowledge; technical job status does not express business outcomes.
- NFR-9B: Source withdrawal/removal atomically removes traveler eligibility, re-evaluates cards, disables ineligible projections, and retrieval fails closed while indexing catches up.
- NFR-10: All Trip Project reads/mutations remain owner-scoped until collaboration is separately approved.
- NFR-11: Proposal application validates project membership, applicability, and owner authorization before an auditable write.
- NFR-12: API, Worker, traveler web, operator app, and migrations deploy independently to staging with least privilege, health contracts, and migrations before traffic.
- NFR-13: Liveness/readiness distinguish process from configuration/dependency health; shutdown stops claims and safely completes/releases leases.
- NFR-14: Safe correlated telemetry spans admission, API, Worker, and provider operations.
- NFR-15: Browser/API and database traffic stay private and origin-controlled, with environment-isolated credentials/configuration/observability.
- NFR-16: Lifecycle normalization is a safeguarded clean-break/reset/reseed only for disposable targets; durable data requires approved forward migration.
- NFR-17: Legacy worker retirement requires replacement dashboard/runbook evidence for lag, retry, recovery, duplicate pollers, and restart.
- NFR-18: Public launch requires Railway/domain/DNS/CSP/OAuth/secrets/backup/monitoring/on-call approval plus connection-pool, stream-concurrency, and restore proof.

**Total NFRs:** 19 numbered requirements (NFR-1 through NFR-18, including NFR-9A and NFR-9B).

### Additional Requirements

- The public-MVP target is the Hanoi-to-HCMC corridor, with 100 active evidence-grounded cards before public evaluation.
- Product contracts constrain data retention, traveler-safe source disclosure, community publication/conflict handling, web search fallback, answer-quality evaluation, usage/referral behavior, and single-owner Trip Planning Foundation behavior.
- MVP exclusion boundaries include booking/payments/rewards, mobile, Google Maps, public submissions, mass scraping, and the deferred dynamic-data/collaboration planning features.
- Success criteria require practical, family-aware, source-safe Vietnamese answers and measurable knowledge/answer quality before launch.

### PRD Completeness Assessment

The PRD is complete and highly specific on functional behavior, security/data boundaries, lifecycle correctness, and launch safeguards. The only deliberately unresolved product/operational inputs are the web-search mechanism, privacy and Facebook reuse policies, possible image generation, and the exact interactive-response latency target. These should remain explicit launch or architecture decisions rather than block document traceability.

## Epic Coverage Validation

### Coverage Matrix

| PRD FR group | Epic coverage | Status |
| --- | --- | --- |
| FR-1 to FR-7, FR-9 to FR-16 | Epics 1, 2, 4, 5, 10, and 11 | Covered baseline and API-cutover work |
| FR-8, FR-14, FR-42 to FR-45, FR-48 | Epic 1, with direct-session replacement in Epic 14 | Covered |
| FR-16A to FR-16I | Epic 7 | Covered |
| FR-16J to FR-16L | Epic 16 claims coverage | **Gap: no Epic 16 stories exist** |
| FR-17 to FR-28A, FR-37, FR-37B, FR-45A | Epics 3 and 15; direct-admin presentation in Epic 14.4 | Covered, subject to lifecycle target contract |
| FR-29 to FR-37C, FR-47, FR-49, FR-50 | Epic 4, Epic 11, Epic 15, and direct-admin model management in Epic 14.4 | Covered |
| FR-38 to FR-41, FR-46 | Epic 5 | Covered |
| FR-46A | Epic 16 claims coverage | **Gap: no Epic 16 stories exist** |
| FR-49A | Epic 14.4 | Covered |
| FR-51 to FR-60 | Epic 14, with supporting historical foundations in Epics 9 to 13 | Covered; Epic 14 is the authoritative direct-browser cutover |

### Coverage Findings

- `epics.md` contains an explicit FR coverage map for FR-1 through FR-50 and maps direct-browser requirements through Epic 14. The map also explicitly assigns FR-16J, FR-16K, FR-16L, and FR-46A to the follow-on chat-first UX Epic 16.
- Epic 16 contains only an epic-level outcome and implementation notes. It has no `Story 16.x` entries, acceptance criteria, dependency order, or implementation-artifact status. Therefore it cannot provide an executable implementation path for its claimed FRs.
- FR-7, FR-32, FR-33, and FR-46 are already implemented in earlier epics, but Epic 16 intentionally revises their traveler-facing presentation. Its required delta must be made traceable through stories rather than relying on historical implementation evidence.
- The Epic 3 historical coverage map uses legacy terminology for FR-24A (`verify-first`) and the old state model. The current PRD and Epic 15 target contract correctly define `rejected`, `context-only`, and `candidate-bearing` triage plus separate candidate dispositions. This should be clarified in the Epic 16/15 traceability notes, but does not remove the current Epic 15 target coverage.

### Missing Requirements

#### Critical Missing FR Coverage

- FR-16J: Empty chat must support a natural-language request, only explicitly recommend durable Trip Project creation, and remember a decline until material context change or an explicit save request.
  - Impact: This is the core entry and decision model of the revised chat-first UX.
  - Recommendation: Add an Epic 16 story for typed server-owned Trip Project recommendation and persisted decline fencing.

- FR-16K: Unscoped questions must offer an explicit owner-scoped Trip Project choice or clarification and must never attach project constraints to a private answer without selection.
  - Impact: Incorrect implementation risks hidden context use and owner-scope/privacy regressions.
  - Recommendation: Add an Epic 16 story for server-owned recommendation selection and direct API/client contracts.

- FR-16L: Project-scoped composition must identify the active trip and let the traveler leave/switch scope without merging ordinary and primary conversations.
  - Impact: Required to keep the new streamlined UI explicit and preserve one-primary-conversation invariants.
  - Recommendation: Add an Epic 16 story for URL-owned scope switching and shell/composer behavior.

- FR-46A: Traveler loading, unavailable, verification, and failure states must be plain Vietnamese with a practical recovery action and no technical implementation vocabulary.
  - Impact: The last UX commit specifically changes this traveler-facing behavior; historical technical state UI cannot be treated as compliant evidence.
  - Recommendation: Add an Epic 16 presentation story that covers answer/provenance/feedback, state/recovery copy, and regression/accessibility validation.

### Coverage Statistics

- Total PRD FRs: 73
- FRs with an epic-level coverage claim: 73 (100%)
- FRs with an executable story path in the active epic inventory: 69 of 73 (94.5%)
- Missing executable coverage: FR-16J, FR-16K, FR-16L, FR-46A, all assigned to Epic 16 but lacking stories.

## UX Alignment Assessment

### UX Document Status

Found: the active UX bundle is `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/`, comprising `EXPERIENCE.md`, `DESIGN.md`, and supporting mockups. Both spine documents are `final` and updated on 2026-08-05.

### Aligned Contracts

- The UX supports the PRD's Vietnamese-first, authenticated AI Ask, chat-first entry, stored-context notice, owner-scoped conversation/Trip Project, image validation, feedback, deletion, proposal confirmation, and family-planning contracts.
- The UX's explicit save/continue/private/decline choices align with FR-16J to FR-16L and Architecture AD-30A. It preserves no automatic project creation/attachment, owner selection, primary-conversation integrity, and decline fencing.
- The plain-language loading, unavailable, verification, error, source-detail, and recovery rules align with FR-7, FR-33, FR-46A, PRD traveler trust contracts, and Architecture AD-11/AD-30B. Technical source/provenance taxonomy and diagnostics remain hidden from traveler defaults.
- The application-shell, responsive sheet/rail behavior, persisted annotation-only detail selection, safe provenance disclosure, streaming reconciliation, and accessible interaction requirements align with Architecture presentation/API ownership and direct NestJS session/CSRF boundaries.
- Architecture directly supports the UX direction: `apps/web` is presentation-only, direct API clients use Nest sessions, typed server-owned recommendation decisions preserve owner scope, and responsive variants reuse server-loaded shell state rather than introducing alternate loaders or writers.

### Resolved Alignment Issues

- `EXPERIENCE.md` now uses plain-language, action-oriented accessible labels for traveler verification disclosures and explicitly restricts source/confidence taxonomy to authorized admin surfaces.
- The admin ingestion state pattern now distinguishes technical job status from candidate outcomes, card lifecycle, and recommendation status using the Epic 15 target vocabulary.

### Warnings

- The UX delta is architecturally supported, but Epic 16 has no stories. The aligned UX requirements cannot be implemented or tested through the BMad story lifecycle until Epic 16 is decomposed into executable stories.

## Epic Quality Review

### Epic Structure

- Epics 1 to 7 express coherent traveler/operator outcomes. Epics 8, 10, 12, and 14 are infrastructure-leaning, but each has a clear protected user, reliability, or launch outcome and is justified by the direct-API and operational contracts.
- Epics 9 to 13 are explicitly historical and superseded for browser transport. Epic 14 correctly declares the authoritative replacement boundary, avoiding a current duplicate ownership path.
- Epic 15 is an intentional clean-break lifecycle cutover. Its technical shape is justified by operator safety and traveler retrieval correctness, and its stories clearly divide schema, accounting, lifecycle command, evidence removal, sampling, views, and verification.
- Epic 16 has a valid traveler-value outcome, but it fails the epic-to-story decomposition requirement: it contains no stories, acceptance criteria, dependency sequence, or testable implementation increments.

### Dependency Review

- Existing completed stories are generally ordered from owned state/contract creation to commands, presentation, and verification. Epic 14's direct API/session cutover precedes Epic 15's protected admin lifecycle views, which is a valid backward dependency.
- Epic 16 correctly depends on existing direct API, persisted provenance, primary-conversation, and owner-scoping contracts. Its notes preserve these invariants rather than creating a future dependency.
- The absence of Epic 16 stories prevents dependency validation inside that epic. In particular, recommendation decision persistence, direct API contracts, URL scope behavior, and traveler presentation cannot be safely ordered or independently completed.

### Story Quality Findings

#### Critical Violations

- None in completed Epic 14 or Epic 15 story inventories.

#### Major Issues

- Epic 16 has no implementation stories despite claiming FR-16J, FR-16K, FR-16L, and FR-46A. It therefore has no independently deliverable slices, BDD acceptance criteria, migration/contract ownership, or verification plan.
  - Remediation: run `bmad-create-epics-and-stories` as a **delta update scoped to Epic 16**, not a regeneration of the full epic inventory. At minimum, create ordered stories for: server-owned Trip Project recommendation/decline decision; explicit existing-project/private/scope switching; plain-language traveler presentation simplification; and focused accessibility/ownership/regression proof. Merge slices only if their API and UI seams cannot be verified independently.

- Resolved: obsolete `inputDocuments` references were removed from `epics.md` and its overview now names only current authoritative planning inputs.

#### Minor Concerns

- Resolved: the FR-22A through FR-22C coverage-map entries now point to Epic 15's target lifecycle, classification, and verification contracts.

### Best-Practice Checklist

| Area | Result |
| --- | --- |
| User-value outcomes | Pass for Epics 1-15; Epic 16 outcome passes but lacks stories |
| Epic independence | Pass for active Epic 14/15 boundaries; Epic 16 internal ordering cannot be evaluated |
| Independently completable stories | Pass for documented Epic 14/15 stories; fail for Epic 16 because none exist |
| No forward dependencies | No newly identified forward dependency; Epic 16 cannot be fully assessed |
| BDD/testable acceptance criteria | Pass for existing active inventories; fail for Epic 16 |
| FR traceability | Epic-level map exists; executable path is missing for four Epic 16 FRs |

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK** for the chat-first UX delta. The overall product artifact set is coherent, and completed Epics 14 and 15 do not need to be recreated. However, the newly documented Epic 16 has no stories, so its changed traveler behavior has no executable delivery, validation, or verification path.

### Critical Issues Requiring Immediate Action

1. Epic 16 claims FR-16J, FR-16K, FR-16L, and FR-46A without any `Story 16.x` entries. This blocks implementation readiness for the UX update.

### Recommended Next Steps

1. Run `bmad-create-epics-and-stories` as a scoped delta for **Epic 16 only**. Do not regenerate completed Epics 1-15. Create independently testable stories for: server-owned create/continue/private/decline decisions; explicit project scope switching; plain-language traveler answer/trust/feedback/state presentation; and end-to-end accessibility, owner-scope, and regression verification.
2. Run `bmad-check-implementation-readiness` again after Epic 16 stories are created. If it passes, run `bmad-sprint-planning`, then create/validate the first Epic 16 story before implementation.

### Final Note

This assessment originally identified five issues across three categories. Four documentation and UX-contract issues are now resolved. The remaining blocker is the missing Epic 16 story decomposition; the required work is a focused Epic 16 planning delta, not a new product PRD, architecture rewrite, or full epic regeneration.
