# Epic 21 Story Validation Report

**Date:** 2026-08-13
**Scope:** Stories 21.1-21.12, Context-Complete, Trip-Aware Planning And Conversion
**Method:** BMad create-story validation checklist; independent parallel review against the authoritative Epic 21 inventory, current readiness report, v6.2 architecture contracts/fixtures/release gates, UX addendum, and project test boundaries.

## Verdict

**NOT READY FOR DEVELOPMENT AS WRITTEN.**

All twelve guides have the correct Epic sequence, scoped intent, UX v6.2 citation, and no prohibited new service/worker/configuration authority. However, all guides require clarifications before implementation. The blocking set is Stories 21.2, 21.4, 21.6, 21.8, and 21.12 because their current guidance can violate a module ownership boundary or omit an acceptance-critical safety contract.

Story status remains `ready-for-dev` in `sprint-status.yaml` because this report is validation evidence only; it does not certify the guides as implementation-ready.

## Blocking Findings

1. **21.2 - Chat/Trips is incorrectly assigned plan/extraction attempts.** The guide assigns attempt/fence persistence to Chat/Trips, while the architecture assigns attempt identity to AI Orchestration. Restore the owner split: Chat/Trips owns clarification state and mutation ports; AI Orchestration owns attempt identity. [Guide 21.2:18; contracts.md:263-304; ARCHITECTURE-SPINE.md:713]
2. **21.4 - Planning-mode authority is incomplete.** Make the typed `PlanningExecutionRef` and its canonical URL scope, intent digest, pending-proposal, and null-reference rules explicit. `source-bundle.ts` must consume that resolved ref rather than infer authority from a trip/conversation ID. Add traveler-visible hypothetical/pending labels and accessibility coverage. [Guide 21.4:11-21; contracts.md:499-531; epics.md:3176-3179]
3. **21.6 - Final required-need coverage may be stale.** Require coverage recomputation from the final render manifest after packing, revocation, and source-handle pressure, immediately before generation. Persist/test pre-cap exclusion telemetry, including `eligible_but_cap_excluded`. [Guide 21.6:13-21; ARCHITECTURE-SPINE.md:641-645; contracts.md:703-731]
4. **21.8 - Deletion and finalization requirements are incomplete.** Replace “all new 21.1-21.7 rows” with the architecture deletion matrix, including reconstructable attempts, query payloads, web decisions, evaluation membership, conversion artifacts, derived context, embeddings, and diagnostics. Revalidate all clarification/content/profile/scope/assumption/Trip/proposal fences before atomically finalizing. [Guide 21.8:11-27; contracts.md:716-731,901-912]
5. **21.12 - Epic-close evidence is absent.** Add the canonical final executable evidence matrix for RTA-1..13, PCR-01..10, FR-61..65, SC-8..12, AC-28..33, and PJ-01..06, plus `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Physical cleanup must be a Feedback/Eval report plus Retrieval-owned read-policy CAS after the rollback target changes; check repository-wide executable legacy references. [Guide 21.12:18-27; epics.md:3415-3417; evaluation-and-release-gates.md:150-162]

## Per-Story Results

| Story | Result | Required correction before implementation |
| --- | --- | --- |
| 21.1 | Needs revision | Name all profile-deliverable resolver contracts, pin profile/policy/comparator/schema identities for sessions, claims, fixtures, and evaluations, and require deterministic validated-graph identity/coalescing. [21.1:11-21; contracts.md:19-25,83-90,123-139,284-295; fixtures.md:51] |
| 21.2 | Blocked | Correct AI Orchestration attempt ownership; specify the closed transition matrix, one-active-session constraint, exact source/message/attempt and Trip/proposal fences, and CAS/locking behavior for concurrent instance claims. [21.2:11-28; contracts.md:263-304; fixtures.md:53-54] |
| 21.3 | Needs revision | Declare 21.1/21.2 prerequisites; define exact preflight uniqueness `(command, source message, expected session revision, prompt version)`; add API/presentation/focus/plain-language mobile and desktop work plus contract/fixture citations. [21.3:11-35; ARCHITECTURE-SPINE.md:721-725; EXPERIENCE.md:131-136,159-163,253-258] |
| 21.4 | Blocked | Implement the exact resolved planning-mode contract, explicit dependencies on clarification claims and existing apply boundaries, PM fixture citations, and traveler display/accessibility tests for hypothetical/pending state. [21.4:11-35; contracts.md:481-531; fixtures.md:61-67] |
| 21.5 | Needs revision | Enforce transport-leg-only all-null path references and database all-null-or-all-present checks; make route-resolution output (pinned paths, coverage revision, direction, reason) the typed 21.6 handoff; require every RP fixture and persisted set/clear reopen coverage. [21.5:11-27; contracts.md:533-595; fixtures.md:73-82] |
| 21.6 | Blocked | Require final pre-generation render-manifest recomputation, stable capacity exclusion telemetry, and typed 21.1/21.4/21.5 inputs/fences. Correct the non-resolving `fixtures.md#RN` reference. [21.6:13-35; contracts.md:703-731; fixtures.md:84-94] |
| 21.7 | Needs revision | Pin query-builder/provider-request-policy versions, canonical scope terms, and excluded private-context vocabulary; test source/place/time/unverified/action warning rendering and the full query-to-render provenance chain; state exact 21.6 input fences. [21.7:11-35; contracts.md:759-807; fixtures.md:96-106] |
| 21.8 | Blocked | Adopt the complete deletion matrix and finalization fence set; map deletion/clarification fixtures to serial PostgreSQL tests with local `resetTestDatabase()` where clean tables are required. [21.8:11-36; contracts.md:716-731,901-912; fixtures.md:108-115] |
| 21.9 | Needs revision | Add conversion projection policy validation and rejection cases for empty, over-limit, duplicate, conflicting, unknown, and schema-incompatible mappings; explicitly split unit and serial integration execution. [21.9:18-28; ARCHITECTURE-SPINE.md:735; fixtures.md:154] |
| 21.10 | Needs revision | Enumerate terminal watermark, scope, conversation/content/projection revisions, ordinary-conversation validity, and newer unterminated-turn rejection; require full replay/tombstone lifecycle cases `TC-08`, `TC-17`, `TC-18`. [21.10:11-26; ARCHITECTURE-SPINE.md:737,741; fixtures.md:149,158-159] |
| 21.11 | Needs revision | Operationalize every G0 prerequisite and require a persisted release report containing exact tuple, cohorts, metrics/thresholds, failures/exclusions, deletion evidence, rollback target/procedure, Feedback/Eval sign-off, and Product Owner decision. Add `COMP-07` paired retry/deletion coverage and exact rollback authorization/CAS constraints. [21.11:11-27,45; evaluation-and-release-gates.md:106-121,168-186; fixtures.md:127] |
| 21.12 | Blocked | Add complete Epic evidence matrix; distinguish behavioral retirement from physical cleanup; require compatibility/evidence-window report fields, Product approval, a changed qualified `v6_active` rollback target, Retrieval CAS cleanup, and executable-reference removal check. [21.12:11-27; epics.md:3405-3417; evaluation-and-release-gates.md:150-162] |

## Cross-Story Corrections

1. Add explicit upstream artifacts and typed fences to every dependent guide rather than relying only on ordering: 21.1 -> 21.2 -> 21.3 -> 21.4 -> 21.5 -> 21.6 -> 21.7 -> 21.8 -> 21.9 -> 21.10 -> 21.11 -> 21.12.
2. Add direct citations to `retrieval-trip-aware/contracts.md`, `fixtures.md`, and, where relevant, `retrieval-trip-aware-solution-design.md` or `evaluation-and-release-gates.md`. Existing UX v6.2 citations pass for all twelve guides.
3. In every guide that writes or verifies persistence, identify database-free tests for `pnpm test:unit` and PostgreSQL tests for serial `pnpm test:integration`. Tests requiring clean tables must call `resetTestDatabase()` in local setup.
4. Preserve one writer per aggregate: presentation remains projection-only, Nest remains request/domain boundary, PostgreSQL/Drizzle owns persistence, and migrations stay forward-only.

## External Completion Gates

- **21.11:** Code and local tests can only establish local readiness. Completion requires the exact qualified evidence window and Product Owner approval recorded in the release report and referenced by cutover CAS.
- **21.12:** Behavioral retirement requires qualified compatibility evidence and Product approval. Physical cleanup additionally requires rollback-window expiry, an approved cleanup report, no unresolved rollback incident, and a known-safe qualified `v6_active` rollback target. Before cleanup, emergency rollback may use retained legacy compatibility; after cleanup, only the retained known-safe v6 target is runnable.

## Remediation And Final Revalidation

The findings above describe the guides before remediation. All required corrections were applied to Stories 21.1-21.12 and independently revalidated on 2026-08-13.

**Final guide readiness: PASS.** The guides now explicitly preserve module ownership, typed inter-story fences, fixture traceability, unit versus serial PostgreSQL test boundaries, complete deletion/finalization requirements, and cutover/retirement evidence gates. Stories 21.11 and 21.12 remain `ready-for-dev`, not complete: their external evidence and Product Owner gates are still mandatory for eventual completion.

## Sources

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/implementation-readiness-report-2026-08-13-epic-21.md`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md`
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md`
- `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`
- `_bmad-output/project-context.md`
