---
title: "Sprint Change Proposal: Epic 21 Clean Break"
date: 2026-08-16
status: approved
scope: Epic 21
approved_by: Product Owner
---

# Sprint Change Proposal: Epic 21 Clean Break

## 1. Issue Summary

Story 21.11 exposed that Epic 21 had optimized for a production migration that does not exist. The plan introduced durable qualification profiles, paired legacy/shadow executions, read-policy and cutover records, approval records, rollback targets, evidence windows, and delayed compatibility cleanup. XuyenViet currently has no production traveler population or durable Epic 21 data to preserve, and repository policy already permits destructive reset/reseed on explicitly disposable targets. The resulting design cost is therefore accidental complexity rather than product safety.

Evidence:

- No generated Epic 21 story spec exists under `_bmad-output/specs/spec-epic-21/stories/`; implementation has not started.
- Current migrations end at `0072_discovery_activate_vietnamese_query_builder.sql`; earlier planned Epic 21 migration numbers are already obsolete.
- PRD NFR-16 permits destructive reset/reseed for explicitly disposable targets.
- The current Story 21.11 alone proposes nearly ten qualification, shadow, policy, and cutover persistence concepts before delivering traveler behavior.

## 2. Impact Analysis

### Epic impact

Epic 21 remains valuable, but its delivery mechanism must be replaced. The traveler outcomes stay unchanged: scoped clarification, Trip authority, canonical path safety, required-need retrieval, scoped web verification, atomic finalization, explicit chat-to-Trip conversion, and deletion safety.

The 16-story migration/qualification sequence is replaced by eight small stories:

1. Add minimal planning-session storage.
2. Collect multi-turn clarification.
3. Resolve planning mode and applied Trip authority.
4. Preserve canonical route authority.
5. Retrieve by required need and remove card count.
6. Verify fresh facts and finalize through existing AI Ask.
7. Convert eligible chat context into a reviewable Trip.
8. Delete planning data and verify the clean break.

### Story impact

- Old Stories 21.11, 21.14, 21.15, 21.12, and 21.16 are removed, not reimplemented.
- Their qualification/shadow/read-policy/rollback requirements are retired.
- Old Stories 21.1-21.10 and 21.13 are consolidated into eight smaller contracts.
- No story may add a gate-profile, shadow-run, read-policy, cutover, approval, or rollback table.

### Artifact impact

- PRD outcomes remain; the addendum changes PCR-10 and the temporary compatibility assumption to clean-break verification.
- Architecture AD-37/AD-38 and their companion contracts change from dual-run cutover to direct replacement on disposable targets.
- The route/clarification/retrieval contracts use code-owned versioned definitions plus bounded JSON snapshots rather than normalized configuration tables.
- `epics.md`, the Epic 21 spec folder, fixtures, release verification, and `sprint-status.yaml` are regenerated around the eight-story plan.
- UX behavior is unchanged.

### Technical impact

- One forward migration, starting at `0073`, establishes the target schema and deletes incompatible development data instead of backfilling it.
- At most one new table is introduced: `planning_context_sessions`, containing one bounded JSON document per active conversation session.
- Existing `assistant_retrieval_decisions` stores the bounded required-needs, selected evidence, gaps, and web-decision snapshot after removing count-authority columns.
- Existing Trip, proposal, recommendation, message, provenance, Usage, and AI Ask command tables are extended or reused.
- Profile, route-coverage, and required-need definitions are typed, versioned code constants. They become database entities only after a real runtime-editing requirement exists.
- Reset/reseed uses the existing guarded `pnpm db:reset` workflow; no backfill, dual write, shadow comparison, runtime read mode, or legacy rollback is built.

## 3. Recommended Approach

Use a direct adjustment plus disposable-data reset. This is a moderate backlog reorganization, not a product replan.

- Effort: medium, materially lower than the prior plan.
- Risk: low before production data exists; the reset command remains target-confirmed and fail-closed.
- Timeline impact: removes five operational stories and most release-only persistence.
- Trade-off: there is no runtime rollback to legacy retrieval. Recovery is code rollback plus resetting/reseeding the disposable database until real shared/customer data exists.

Rejected alternatives:

- Keep shadow/cutover infrastructure: no present user or data requirement justifies it.
- Preserve the 16-story sequence but simplify Story 21.11 only: leaves dependencies, terminology, and dormant compatibility code throughout the epic.
- Reduce product behavior: unnecessary; the complexity is in migration/release machinery, not the traveler outcomes.

## 4. Detailed Change Proposals

### PRD addendum

OLD: PCR-10 requires versioned numeric gate profiles, shadow evidence, and Product Owner cutover approval.

NEW: PCR-10 requires executable deterministic fixtures, focused integration tests, guarded reset/reseed, and direct target activation; production-grade rollout machinery is deferred until durable customer data exists.

### Architecture

OLD: PostgreSQL gate profiles, read policies, paired shadow executions, cutover records, rollback policies, and delayed cleanup.

NEW: Code-versioned contracts, one bounded planning-session JSON document, reuse of the existing retrieval-decision snapshot, direct removal of count authority, and guarded reset/reseed. Safety is proven by fixtures and tests before deployment.

### Epic 21 stories

OLD: 16 stories with separate qualification infrastructure, evidence collection, cutover, behavioral retirement, and physical cleanup.

NEW: Eight sequential, single-responsibility stories with no release-control subsystem.

### Sprint tracking

OLD: 16 Epic 21 story keys in `backlog`.

NEW: Eight replacement keys in `backlog`; `epic-21` remains `backlog` until the first story starts.

## 5. Implementation Handoff

Classification: **Moderate** — Product Owner/Developer backlog reorganization.

- Product Owner decision: clean break approved by the 2026-08-16 instruction; existing development data may be deleted.
- Architect responsibility: remove dual-run release machinery without weakening owner authorization, Trip authority, provenance, deletion, or traveler-safe failure behavior.
- Developer responsibility: implement only the eight canonical stories, reuse existing tables and ports, and stop if a real non-disposable target or durable user data is discovered.
- Orchestrator responsibility: dispatch `stories.yaml` sequentially and synchronize `sprint-status.yaml`.

Success criteria:

- No active planning artifact requires shadow, read-policy, cutover, gate-profile, approval, or legacy rollback persistence for Epic 21.
- Epic 21 introduces no more than one new table and one initial clean-break migration.
- Card-count authority is removed in the same epic, not retained behind compatibility modes.
- All traveler outcomes and critical fixtures remain executable.
- Reset/reseed refuses any target not explicitly confirmed disposable.

## Change Navigation Checklist

- [x] 1.1-1.3 Trigger, problem, and evidence recorded.
- [x] 2.1-2.5 Epic 21 is redefined; no new epic or rollback of completed Epic 21 code is needed.
- [x] 3.1 PRD outcomes remain; only release mechanism changes.
- [x] 3.2 Architecture release and persistence contracts require updates.
- [N/A] 3.3 UX behavior does not change.
- [x] 3.4 Spec, fixtures, roadmap authority, and sprint tracker require synchronization.
- [x] 4.1 Direct adjustment is viable, medium effort, low risk.
- [N/A] 4.2 No completed Epic 21 implementation exists to roll back.
- [N/A] 4.3 MVP scope does not need reduction.
- [x] 4.4 Selected guarded clean break and direct activation.
- [x] 5.1-5.5 Proposal, impact, rationale, action plan, and handoff defined.
- [x] 6.1-6.2 Proposal reviewed for consistency and actionability.
- [x] 6.3 Product Owner approval recorded from the explicit clean-break instruction dated 2026-08-16.
- [x] 6.4 Sprint tracker updated to the eight canonical backlog entries.
- [x] 6.5 Final handoff validated against the clean-break SPEC and dispatch inventory.
