---
title: XuyenViet Architecture Reading Guide
status: final
updated: 2026-08-12
---

# XuyenViet Architecture Reading Guide

## Authority

Use this folder through progressive disclosure. Do not treat every file as an equal source of truth.

| Level | Artifact | Authority |
|---|---|---|
| 1 | [ARCHITECTURE-SPINE.md](ARCHITECTURE-SPINE.md) | Binding paradigms, ownership, mutation and safety invariants, stable `AD-*` decisions |
| 2 | [retrieval-trip-aware-solution-design.md](retrieval-trip-aware-solution-design.md) | End-to-end v6.2 developer projection of the binding ADs |
| 3 | [retrieval-trip-aware/contracts.md](retrieval-trip-aware/contracts.md) | Typed boundaries, persistence ownership, migration and deletion contracts |
| 3 | [retrieval-trip-aware/fixtures.md](retrieval-trip-aware/fixtures.md) | Canonical clarification, scoped-preference, planning-mode, route, coverage, web, deletion, and compatibility cases |
| 3 | [retrieval-trip-aware/evaluation-and-release-gates.md](retrieval-trip-aware/evaluation-and-release-gates.md) | Cohorts, versioned numeric profile ownership, shadow evidence, cutover, retirement, and rollback |
| 2 | [community-knowledge-solution-design.md](community-knowledge-solution-design.md) | Detailed Knowledge lifecycle and ingestion design under the Spine |
| 2 | [frontend-shell-implementation-notes.md](frontend-shell-implementation-notes.md) | Traveler shell implementation projection under the Spine and UX artifacts |

The PRD owns product behavior. The Spine owns technical invariants. Companion documents add executable detail. Epics and stories schedule implementation. Tests prove fixtures and acceptance criteria.

```text
PRD -> Architecture Spine -> Solution Design -> Contracts / Fixtures / Gates
    -> Epics -> Story -> Tests
```

If artifacts conflict, resolve them in this order:

1. Current PRD and addendum for product outcomes and scope.
2. `ARCHITECTURE-SPINE.md` for architecture decisions.
3. Current code for implemented integration constraints.
4. Companion design details.
5. Epics, stories, and historical proposals.

## Reading Paths

### Architecture or readiness review

Read the Spine, then the solution-design traceability table, fixtures, and release gates. Confirm every PRD requirement maps to an AD and an implementation story.

### Story preparation and development

Read the story and cited ADs first. Load only the linked companion sections and fixture IDs needed by that story. Do not implement an entire roadmap section because one story cites a shared contract.

### Retrieval or Trip-context implementation

Read AD-8, AD-9, AD-13, AD-17, AD-29, AD-30, and AD-34 through AD-40. Then read the solution design and only the relevant contract and fixture sections.

### Evaluation and release

Read AD-37 and AD-38, then the evaluation and release-gate companion. A gate result is invalid unless it identifies the exact corpus, Trip fixtures, runtime/read-mode configuration, registry snapshot, and gate-profile version.

## Change Discipline

- Keep existing AD IDs stable. Amend a rule or add the next ID; never renumber.
- Record architecture decisions in `.memlog.md` before distilling the Spine.
- A companion may not override an AD. Correct the companion or update the Spine through the architecture workflow.
- Keep numeric runtime thresholds in a versioned gate profile, not prose copied across files.
- Keep fixture IDs stable after stories or tests reference them.
- Remove superseded current-contract wording or label it historical; do not maintain two active retrieval authorities.
