---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
scope: Epic 16
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-05
**Project:** xuyenviet
**Scope:** Epic 16

## Document Inventory

### PRD

- `prds/prd-xuyenviet-2026-07-04/prd.md`

### Architecture

- `architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- `architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md`
- `architecture/architecture-xuyenviet-2026-07-04/frontend-shell-implementation-notes.md`

### Epics and Stories

- `epics.md`

### UX

- `ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md`
- `ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`

### Discovery Notes

- No duplicate whole-document and sharded-document sources were found.
- Historical readiness reviews and sprint change proposals are retained as context only, not as authoritative requirement sources.
- This report is scoped to Epic 16 and is separate from the pre-existing 2026-08-05 readiness report.

## PRD Analysis

### Functional Requirements

The PRD defines AI Ask, authenticated chat/trip ownership, community knowledge collection and retrieval, family-aware planning, public-MVP operations, and API/runtime migration requirements. Epic 16 is a focused presentation and Chat/Trips decision delta, not a replacement for the completed conversation, provenance, feedback, or Trip Project foundations.

| Requirement | Epic 16 implementation path | Assessment |
|---|---|---|
| FR-7: Calm Vietnamese answers with practical guidance; no technical default reading path | Story 16.3 default answer presentation | Covered |
| FR-16J: Unscoped natural-language start; explicit durable-project recommendation/decline memory | Story 16.1 typed creation recommendation and decline fence | Covered |
| FR-16K: Explicit owner choice for an owned project; never auto-attach context; private turn excludes project constraints | Story 16.1 owner-scoped matching and private-answer behavior; Story 16.4 verification | Covered |
| FR-16L: Visible active-trip context plus an explicit way to ask outside/switch; no conversation merge | Story 16.2 URL-owned shell and established navigation | Covered, subject to UX reconciliation below |
| FR-32: Persist and audit source categories without making them default traveler copy | Story 16.3 consumes persisted provenance only; Story 16.4 prevents technical leakage | Covered by preservation of AD-11 baseline |
| FR-33: Plain-language changing-detail verification guidance | Story 16.3 contextual disclosure and verification projection | Covered |
| FR-46: Lightweight answer usefulness feedback | Story 16.3 preserves accessible, non-displacing feedback presentation; existing capture is completed baseline | Covered by preservation of completed baseline |
| FR-46A: Plain Vietnamese loading, unavailable, verification, and failure state with recovery action | Story 16.3 presentation contract; Story 16.4 projection tests | Covered |

### Non-Functional Requirements

The Epic 16 scope directly preserves NFR-2 owner-scoped chat/trip access, NFR-3 protection of raw/admin-only information, NFR-4 persisted answer auditability, NFR-5 Vietnamese output, and NFR-10 owner-scoped Trip Project reads and mutations. Its implementation plan does not introduce a new latency, availability, deployment, or data-retention requirement. Existing implementation and platform NFRs remain owned by their source epics.

### Additional Requirements And Constraints

- The PRD acceptance criteria AC-25 through AC-27 are the direct end-to-end acceptance contracts for this epic.
- A browser, local storage, or rendered AI prose must not create a project, attach project context, or change scope.
- A selected project stays owner-scoped; an ordinary conversation is never copied, merged, linked, or replayed into it.
- Trust detail derives solely from stored, traveler-safe provenance. Raw material and internal classifications remain unavailable to travelers.
- The implementation must retain the completed answer-feedback persistence contract; this epic changes its placement and interaction, not its meaning or storage.

### PRD Completeness Assessment

The PRD is sufficiently precise for Epic 16. It explicitly defines the primary behavior, privacy boundary, recovery-copy restriction, and acceptance tests. The Epic 16 subset has no unresolved product decision that blocks story implementation.

## Epic Coverage Validation

### Epic 16 Coverage Matrix

| PRD requirement | Story coverage | Status |
|---|---|---|
| FR-7 | 16.3 | Covered |
| FR-16J | 16.1, 16.4 | Covered |
| FR-16K | 16.1, 16.4 | Covered |
| FR-16L | 16.2, 16.4 | Covered |
| FR-32 | 16.3, 16.4 | Covered |
| FR-33 | 16.3, 16.4 | Covered |
| FR-46 | 16.3 | Covered through completed capture baseline; presentation preserved here |
| FR-46A | 16.3, 16.4 | Covered |
| AC-25 | 16.1, 16.4 | Covered |
| AC-26 | 16.1, 16.2, 16.4 | Covered |
| AC-27 | 16.2, 16.3, 16.4 | Covered |

### Architecture Traceability

- AD-11 is implemented by Story 16.3's stored-provenance-only disclosure and Story 16.4's no-inferred-provenance tests.
- AD-30A is implemented by Story 16.1's typed, owner-bound decisions, persisted decline fence, idempotent acceptance, and private-answer boundary.
- AD-30B is implemented by Story 16.3's Vietnamese state projections and Story 16.4's leakage/recovery tests.
- AD-24 is preserved by Story 16.2's URL-selected server shell, pending-only browser state, and safe reconciliation.

### Missing Requirements

No Epic 16-scoped PRD functional requirement is missing a story-level implementation path.

### Coverage Statistics

- Epic 16-scoped PRD FRs: 8
- Scoped FRs with story-level coverage: 8
- Scoped coverage: 100%
- Direct acceptance criteria AC-25 to AC-27 covered: 3 of 3

## UX Alignment Assessment

### UX Document Status

UX documentation exists in `DESIGN.md` and `EXPERIENCE.md`, including the chat-first companion direction and responsive accessibility behavior.

### Confirmed Alignment

- The chat-first entry, compact contextual trip recommendation, and no mode choice before asking align with FR-16J and Story 16.1.
- Progressive, persisted-provenance trust disclosure aligns with FR-7, FR-32, FR-33, AD-11, and Story 16.3.
- Quiet feedback controls that do not displace the composer align with FR-46 and Story 16.3.
- Plain Vietnamese recovery, accessible controls, focus restoration, `aria-live`, 44px touch targets, and reduced motion align with FR-46A and Stories 16.3-16.4.
- Server-loaded, URL-owned shell behavior across breakpoints aligns with Story 16.2 and AD-24.

### Major Alignment Issue

**UX-16-01: Scoped-composer navigation contradicts Epic 16 navigation boundary.**

- Evidence: `EXPERIENCE.md` states that a selected-trip composer shows an accessible action to ask outside the trip or switch trips (line 119). Epic 16's implementation note and Story 16.2 explicitly prohibit persistent scope-action buttons in the composer; they make `Hỏi XuyenViet` the action for an unscoped question and the sidebar the action for switching projects.
- Impact: Implementers can reasonably add persistent composer controls, violating the approved Epic 16 interaction boundary and introducing a competing scope-navigation surface.
- Required remediation: Update `EXPERIENCE.md` to identify `Hỏi XuyenViet` and the existing sidebar/project list as the accessible explicit scope actions. State that the composer may display the active trip name but contains no persistent scope-switch/leave controls.

### Resolution

**Resolved 2026-08-05.** `EXPERIENCE.md` now specifies that unscoped chat has no technical scope label; a selected-trip composer displays only traveler-language trip context; `Hỏi XuyenViet` starts unscoped chat; and the sidebar/sheet Trip Project list switches projects. Persistent composer scope-switch or leave-trip controls are explicitly excluded.

## Epic Quality Review

### Epic Structure

Epic 16 delivers coherent traveler value: a simpler, safer chat-first planning entry with explicit control over durable Trip Projects. It is not a technical milestone and depends only on completed Chat/Trips, provenance, feedback, and shell foundations.

### Story Quality

- Story 16.1 has clear traveler value and testable owner, freshness, idempotency, and private-answer boundaries.
- Story 16.2 keeps scope selection server-validated and URL-owned, with explicit stale-resource recovery and focus behavior.
- Story 16.3 contains concrete rendering, disclosure, accessibility, and prohibited-data conditions; it preserves completed feedback capture rather than redefining it.
- Story 16.4 supplies executable regression coverage for decisions, source bundles, persisted provenance, privacy, responsive shell ownership, and accessibility.

### Dependency Assessment

- Order is valid: 16.1 establishes typed decision behavior; 16.2 integrates the scoped shell; 16.3 simplifies presentation; 16.4 verifies the resulting boundary.
- No story requires a future Epic 16 story to be useful in isolation, although Story 16.4 intentionally verifies all preceding slices.
- Database/persistence changes are introduced by the first consuming story, 16.1. Stories 16.2 and 16.3 consume typed server decisions and persisted provenance rather than creating alternative client state.

### Quality Findings

| Severity | Finding | Recommendation |
|---|---|---|
| Resolved major | UX-16-01 created conflicting instructions for scoped-composer navigation. | `EXPERIENCE.md` now matches Story 16.2 and the Epic 16 implementation note. |
| Minor | Story 16.3 relies on the completed feedback capture baseline without naming its preserving read/write contract. | During Story 16.3 preparation, link the existing feedback contract/tests so the visual simplification cannot accidentally turn feedback into a no-op. |

## Summary and Recommendations

### Overall Readiness Status

**READY**

The feature contract, architecture, story sequence, scoped PRD traceability, and UX interaction boundary are implementation-ready.

### Critical Issues Requiring Immediate Action

None.

### Recommended Next Steps

1. Create Story 16.1 and validate it against the existing Chat/Trips ownership, decision, idempotency, and migration contracts.
2. When preparing Story 16.3, identify the completed feedback capture contract and keep its persistence behavior covered while changing presentation.
3. Run Story 16.4's focused unit/integration, accessibility, lint, typecheck, and build verification after the first three stories are complete.

### Final Note

This assessment found 2 issues across 2 categories: the major documentation-alignment issue is resolved, and 1 minor preservation-traceability concern remains for Story 16.3 preparation. No PRD coverage gap was found in Epic 16.
