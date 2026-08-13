---
date: 2026-08-13
project: xuyenviet
trigger: implementation-readiness-report-2026-08-13.md
scope: Epic 21 - Context-Complete, Trip-Aware Planning And Conversion
status: approved-and-applied
change_classification: moderate
---

# Sprint Change Proposal: Epic 21 Readiness Corrections

## 1. Issue Summary

The 2026-08-13 implementation-readiness assessment found Epic 21 not ready to begin development. PRD functional-requirement coverage is complete, but the delivery plan does not yet make several architecture and roadmap contracts independently executable.

The material trigger is the full Definition of Done in `docs/roadmaps/retrieval-va-tri-nho-traveler-v6.2.md` and Architecture Decision AD-17. The current Epic 21 Story 21.6 guide requires required-need contributions and final render-manifest coverage, but it does not explicitly own the prerequisite scope-first deterministic allowlist, field-aware lexical baseline, source-metadata isolation, stable candidate ordering/bounds, or the gated FTS versus indexed-lexical decision. The v6.2 target cannot safely become authoritative without that ownership.

The assessment also found a stale Trip-mutation UX flow, one ambiguity around adding an answer detail to a Trip, clarification behavior that can omit useful invariant guidance, and several stories whose terminal acceptance criteria depend on later work, time windows, or Product Owner approval.

Evidence:

- `implementation-readiness-report-2026-08-13.md`, sections "UX Alignment Assessment" and "Epic Quality Review".
- `ARCHITECTURE-SPINE.md`, AD-17: scope-first deterministic allowlist, field-aware lexical retrieval, source-metadata exclusion, and FTS fallback rule.
- `retrieval-va-tri-nho-traveler-v6.2.md`, field-aware lexical retrieval and release-gate sections.
- `epics.md`, Stories 21.3, 21.6, 21.8, 21.9, 21.11, and 21.12.
- `EXPERIENCE.md`, Flow 3 and Flow 9.

## 2. Impact Analysis

### Epic Impact

Epic 21 remains valid and preserves its traveler outcome: safe context completion, Trip-aware planning, evidence-grounded guidance, and explicit chat-to-Trip conversion. No completed Epic 1-20 behavior must be rolled back.

Epic 21 needs a backlog reorganization, not a product replan:

- Story 21.6 must explicitly own the v6.2 lexical retrieval baseline and its proof.
- Story 21.3 must preserve useful invariant guidance when a detailed deliverable is blocked.
- Story 21.8 must become finalization-only; deletion invalidation must be independently completable after conversion artifacts exist.
- Story 21.9 must complete `TC-13` validation before Story 21.10 begins; release qualification cannot substitute for functional proof.
- Stories 21.11 and 21.12 must separate implementation work from external evidence, approval, and time-window gates.

### Artifact Impact

| Artifact | Required adjustment | Impact |
| --- | --- | --- |
| `epics.md` | Add explicit lexical/allowlist ownership to 21.6; clarify 21.3; split finalization/deletion and release-gate stories; add mapped stories and dependencies. | Moderate backlog reorganization, no changed product scope. |
| Epic 21 implementation guides | Preserve canonical BDD AC as normative through a verified one-to-one mapping; update affected guides and create guides for new stories. | Prevents loss of acceptance-critical conditions at development handoff. |
| `EXPERIENCE.md` | Correct Flow 3 and Flow 9 so selected-Trip changes draft/review a proposal and persist only after Apply. | Removes conflict with FR-16A through FR-16H. |
| `sprint-status.yaml` | Add new stories as `backlog`; mark the current Epic 21 guides `backlog` until revalidation passes. | Stops implementation from starting on stale story guides. |
| PRD and architecture | No requirement or architectural-decision change proposed. | No MVP scope change. |

### Dependency Impact

The corrected sequence is:

`21.1 -> 21.2 -> 21.3 -> 21.4 -> 21.5 -> 21.6 -> 21.7 -> 21.8 -> 21.9 -> 21.10 -> 21.13 -> 21.11 -> 21.14 -> 21.15 -> 21.12 -> 21.16`

Story identifiers 21.13 through 21.16 are intentionally appended to avoid renumbering existing prepared records and their traceability. Their dependencies, not numeric adjacency, define implementation order.

## 3. Recommended Approach

**Recommended approach: Direct Adjustment with backlog reorganization (moderate scope).**

This approach retains the approved PRD, architecture, UX v6.2 addendum, and all existing Epic 21 outcomes. It makes ownership and completion boundaries explicit where the plan currently conflates implementation, release qualification, and delayed operational cleanup.

Alternatives considered:

| Option | Assessment | Decision |
| --- | --- | --- |
| Direct story edits only | Insufficient. Story 21.8, 21.11, and 21.12 retain time-gated or later-owned terminal work. | Rejected. |
| Roll back completed baseline work | Does not address the planning gap and risks regressions in Epics 4, 7, 10, 11, and 16. | Rejected. |
| Reduce or redefine the MVP | Not required. The PRD already permits the deterministic indexed lexical fallback when the FTS gate fails. | Rejected. |
| Reorganize Epic 21 while preserving scope | Establishes executable ownership and explicit gates with the smallest product and technical impact. | Selected. |

Estimated planning effort: medium. Implementation effort is redistributed, not enlarged by a new product capability. Risk after correction: medium, concentrated in the scope-first retrieval and release qualification work; risk before correction: high because the target retrieval path could be activated without full ownership of its safety baseline.

## 4. Detailed Change Proposals

### 4.1 Story 21.3: Preserve Useful Partial Guidance

Section: Acceptance Criteria, blocked-turn behavior.

OLD:

```text
Then one transaction persists the reduced clarification state, concise Vietnamese follow-up, extraction Usage, and replayable AI Ask success
And it creates no Retrieval run, web call, selection manifest, prompt-render manifest, answer provenance, or main-answer model usage.
```

NEW:

```text
Then one transaction persists the reduced clarification state, concise Vietnamese follow-up, extraction Usage, and replayable AI Ask success
And it includes any profile-permitted Vietnamese invariant guidance that does not depend on an unresolved material field, together with the follow-up question
And it creates no Retrieval run, web call, selection manifest, prompt-render manifest, answer provenance, or main-answer model usage.
```

Rationale: preserves FR-4, FR-62, and the useful-initial-guidance outcome without allowing blocked detailed synthesis or unsafe assumptions.

### 4.2 Story 21.6: Own The Scope-First Lexical Baseline

Section: Acceptance Criteria and tasks.

OLD:

```text
Candidate generation, selection, rendering, provenance, and evaluation consume the same immutable key/contribution vocabulary.
```

NEW:

```text
Before candidate generation, Retrieval validates current owner-row eligibility, resolves canonical geographic and facet authority, and persists a deterministic scope-first allowlist with stable ordering and bounded candidate inputs.
The versioned field-aware lexical implementation searches only that allowlist and indexes only title, type, canonical route/location, summary, tags, and policy-allowlisted practical-detail fields.
Source label, URL, publisher, capture metadata, provenance, evidence quote, provider metadata, and other source metadata cannot create or improve lexical relevance.
The G0 result activates PostgreSQL FTS only when the exact deployed provider/version and Vietnamese configuration pass its deployability, candidate-recall, and critical false-exclusion gates; otherwise v6 uses the deterministic indexed field-aware lexical implementation and keeps FTS inactive.
Candidate generation, selection, rendering, provenance, and evaluation consume the same immutable allowlist, key, contribution, ordering, and bound identities.
```

New executable proof requirements:

- Add source-metadata collision, out-of-scope high-prestige, hard-excluded must-include, stable ordering/bounds, and FTS-unavailable fallback fixtures.
- Pin and emit allowlist version, lexical implementation/version, input projection version, candidate bound, and pre-cap exclusions in Retrieval records.
- Require zero source-metadata lexical leakage and zero critical hard-filter/cap false exclusions in the gate profile.

Rationale: closes the critical roadmap/AD-17 ownership gap without creating a new service or making FTS an unconditional dependency.

### 4.3 UX Flow 3: Correcting A Selected Trip

Section: `EXPERIENCE.md`, Flow 3 steps 4 through 6.

OLD:

```text
4. The system treats it as a correction and updates the relevant chat or selected trip project context.
5. Assistant confirms briefly: `Mình đã cập nhật: bé 8 tuổi.`
6. Future answer pacing and activity suggestions use the corrected age.
```

NEW:

```text
4. For an ordinary chat, the system updates only the chat's transient context. For a selected Trip Project, it drafts a typed Trip Change Proposal and leaves the saved Trip unchanged.
5. The assistant confirms the understood correction and, for a selected Trip, offers `Xem đề xuất và tác động` rather than claiming the saved plan changed.
6. Future Trip-scoped current-plan answers use the corrected age only after the owner applies that proposal; exploration may use the correction only as visibly hypothetical context.
```

Rationale: restores the proposal-only mutation boundary in FR-16A, FR-16D, and FR-16H.

### 4.4 UX Flow 9: Use An Answer Detail In A Trip

Section: `EXPERIENCE.md`, Flow 9 step 4.

OLD:

```text
Trang chooses `Dùng trong kế hoạch` if she wants to keep it, or closes the panel to return focus to the answer.
```

NEW:

```text
For a selected Trip, Trang chooses `Dùng trong kế hoạch` to draft and review a typed Trip Change Proposal; the detail panel states that the saved plan will change only after `Áp dụng`. For an ordinary chat, the action may save only a supported chat-local note and never creates or mutates a Trip. Closing the panel returns focus to the answer.
```

Rationale: removes an ambiguous direct-write interpretation and keeps the action consistent with the Trip Home proposal flow.

### 4.5 Split Story 21.8: Finalization From Deletion

Change Story 21.8 title and scope to `Finalize Planning Evidence Atomically`.

Retain only prepared-run persistence, cross-owner finalization through ports, finalization fence checks, and terminal retry behavior.

Remove from Story 21.8:

```text
Conversation/Trip deletion invalidates every reconstructable clarification, path, retrieval, web, manifest, derived-context, embedding, and evaluation-membership artifact in the same transaction.
```

Add Story 21.13: `Invalidate Planning Evidence On Conversation And Trip Deletion`.

Required acceptance boundary:

```text
Given an ordinary conversation, primary conversation, or Trip Project is deleted
When Chat/Trips coordinates deletion through owner invalidator ports
Then all reconstructable clarification state, attempts and payloads, query plans, retrieval and web decisions, manifests, conversion opportunities/manifests/nonterminal replay state, derived context, embeddings, diagnostics, Trip snapshots, canonical route choices, Trip proposals, and production-evaluation membership are invalidated in one transaction
And ordinary-chat deletion leaves an unrelated Trip unchanged, while primary-conversation deletion requires replacement or Trip deletion.
```

Story 21.13 depends on 21.8 and 21.10 so conversion-state deletion is implemented by its actual owner rather than conditionally called before it exists.

Rationale: finalization and cross-owner deletion have different data/failure matrices and can be tested and completed independently.

### 4.6 Make TC-13 Mandatory In Story 21.9

Section: Story 21.9 task list.

OLD:

```text
Add `TC-13` coverage or block release qualification on Story 21.11's explicit validation evidence.
```

NEW:

```text
Add `TC-13` coverage before Story 21.9 can be complete. Validate and reject empty, over-limit, duplicate, conflicting, unknown-field, and schema-incompatible TripConversionProjectionPolicy mappings before opportunity eligibility is evaluated.
```

Rationale: conversion projection validation is functional behavior, not release-only evidence. Story 21.10 remains blocked on successful Story 21.9 validation.

### 4.7 Split Story 21.11: Qualification, Evidence, And Cutover

Retain Story 21.11 as `Establish V6 Retrieval Qualification Infrastructure`.

Story 21.11 completes when it provides:

- Feedback/Eval-owned closed numeric gate-profile, cohort, dependency-tuple, and release-report persistence.
- Retrieval-owned shadow policy/execution and `activateRetrievalReadPolicy(...)` CAS contracts.
- G0 prerequisite recording, including lexical baseline/FTS spike result as pass or fail-closed blocker.
- Unit and serial PostgreSQL contract tests.

Add Story 21.14: `Collect And Approve V6 Shadow Qualification Evidence`.

Completion requires an exact persisted evidence window, cohorts, thresholds, failures/exclusions, deletion evidence, rollback procedure/target, Feedback/Eval sign-off, and Product Owner decision. It has no cutover authority.

Add Story 21.15: `Cut Over V6 Retrieval Through Qualified Read Policy`.

Completion requires a passing, approved Story 21.14 report and a runnable rollback target. It owns the single Retrieval CAS cutover and authorized rollback behavior. A failed gate blocks activation.

Rationale: code delivery, externally gathered evidence, and authority activation are separate work with separate owners and terminal criteria.

### 4.8 Split Story 21.12: Behavioral Retirement From Physical Cleanup

Retain Story 21.12 as `Retire The Legacy Card-Count Trigger Behaviorally`.

It completes when `v6_active` no longer uses card count as a web-search trigger/suppressor, the legacy branch remains only runnable legacy/shadow compatibility, compatibility cohorts pass, and Product approval is recorded.

Add Story 21.16: `Physically Remove Expired Legacy Card-Count Compatibility`.

Completion requires rollback-window expiry, a passing Feedback/Eval cleanup report, no unresolved rollback incident, Product Owner approval, a changed qualified known-safe `v6_active` rollback target, Retrieval CAS confirmation, and a repository-wide check that no executable legacy branch/reference remains.

Rationale: physical cleanup cannot be honestly completed in the same delivery slice as behavioral retirement because it is deliberately time-gated.

### 4.9 Preserve Canonical Acceptance Criteria In Story Guides

For each Story 21.1 through 21.16 implementation guide, add a `Canonical Acceptance-Criteria Mapping` section:

```text
The Given/When/Then acceptance criteria in `epics.md#Story-<id>` are normative.
This guide maps every canonical criterion one-to-one; implementation, tests, and completion review must satisfy both this guide and the canonical criteria.
```

Each guide must list the canonical criteria identifiers and its matching tasks/tests. This is preferred over duplicating long BDD blocks into every guide, while retaining one authoritative acceptance contract.

## 5. Implementation Handoff

Classification: **Moderate**.

| Recipient | Responsibility |
| --- | --- |
| Product Owner | Approve this proposal; approve the exact evidence report before Story 21.15 cutover and before Stories 21.12/21.16 retirement gates. |
| Product/Architecture owner | Update `epics.md`, validate the lexical-baseline and dependency contracts against AD-17 and the roadmap, and preserve traceability. |
| UX owner | Apply Flow 3 and Flow 9 corrections and confirm the v6.2 addendum remains authoritative. |
| Developer agent | Regenerate/update implementation guides after planning changes; implement only a story that passes story validation. |
| Sprint planner | Add Stories 21.13-21.16 as `backlog`, hold all existing Epic 21 guides at `backlog` until validation passes, and sequence work by the dependency chain above. |

Success criteria:

1. `epics.md`, UX flows, and all Story 21 guides have no direct-mutation ambiguity, unresolved lexical-baseline ownership, or time-gated completion hidden in an ordinary development story.
2. Story 21.6 explicitly proves scope-first allowlisting, source-metadata isolation, deterministic lexical fallback, candidate bounds/order, and FTS gate behavior.
3. Story 21.3 returns safe invariant guidance where available while still asking its concise material clarification.
4. Story 21.9 completes `TC-13` before Story 21.10 starts.
5. Finalization, deletion, qualification infrastructure, shadow evidence, cutover, behavioral retirement, and physical cleanup have distinct owners and independently verifiable terminal outcomes.
6. Re-running `bmad-create-story validate` for Epic 21 and `bmad-check-implementation-readiness` returns ready status before any `bmad-dev-story` begins.

## 6. Checklist Status

- [x] 1.1 Triggering scope identified: Epic 21 readiness assessment.
- [x] 1.2 Core problem defined: incomplete technical ownership and non-independent completion boundaries.
- [x] 1.3 Evidence collected from readiness report, roadmap, architecture, epics, guides, UX, and sprint status.
- [x] 2.1-2.5 Epic impact assessed: preserve scope; reorganize Story 21 work and dependency order.
- [x] 3.1 PRD conflict assessed: no PRD change required.
- [x] 3.2 Architecture conflict assessed: no architecture change required; planning must implement AD-17 explicitly.
- [x] 3.3 UX conflict assessed: Flow 3 and Flow 9 require correction.
- [x] 3.4 Secondary artifacts assessed: story guides and sprint status require updates after approval.
- [x] 4.1 Direct adjustment evaluated: viable with backlog reorganization.
- [x] 4.2 Rollback evaluated: not viable or justified.
- [x] 4.3 MVP review evaluated: not needed.
- [x] 4.4 Recommended path selected: direct adjustment with moderate backlog reorganization.
- [x] 5.1-5.5 Proposal, action plan, and handoff prepared.
- [x] 6.1-6.2 Proposal reviewed for consistency with source artifacts.
- [x] 6.3 Product Owner approval recorded on 2026-08-13, including the post-readiness document-unification instruction.
- [x] 6.4 Sprint status updated with Stories 21.13-21.16 and retained in `backlog` pending just-in-time validation.
- [x] 6.5 Handoff completed: Story 21.1 validation is the next required gate.

## Approval

Approved by Product Owner on 2026-08-13 and applied to `epics.md`, PRD addendum, UX spines, Epic 21 implementation guides, validation/readiness reports, and `sprint-status.yaml`. The implementation-readiness recheck is closed; Epic 21 remains in `backlog` pending Story 21.1 just-in-time validation.

## Post-Readiness Closure

The Epic 21 recheck identified four remaining implementation-handoff inconsistencies. The Product Owner's instruction to unify the documents approved their direct correction on 2026-08-13.

- `epics.md` and the guides now carry one authoritative dependency chain, including 21.8→21.9, 21.10→21.13→21.11, and 21.15→21.12.
- Story 21.13 owns deletion invalidation; Story 21.8 owns finalization only.
- Story 21.12 owns behavioral retirement; Story 21.16 owns later G3 physical cleanup and is not a forward prerequisite for completing 21.12.
- The story-guide validation report now has one final verdict, covers Stories 21.1-21.16, and agrees with the current `backlog` sprint status.
- PRD addendum and UX metadata/wording no longer describe the approved canonical path contract as open or confuse persistent server opportunity state with a sticky visual banner.

Closure status: **applied**. Epic 21 is ready for sequential just-in-time story validation. Story 21.1 remains `backlog` until that validation passes.
