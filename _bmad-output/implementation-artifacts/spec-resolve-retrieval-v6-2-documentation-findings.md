---
title: 'Resolve Retrieval v6.2 Documentation Findings'
type: 'bugfix'
created: '2026-08-12'
status: 'done'
review_loop_iteration: 1
baseline_commit: '8e3015d5eb747b5d64ee163faa34b197b3ab6e76'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/roadmaps/retrieval-va-tri-nho-traveler-v6.2.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The current retrieval v6.2 planning package leaves Story 4.5 in conflict with the active required-need retrieval contract, projects v6.2 coverage only at an Epic-level range, and introduces trailing whitespace that makes the documentation commit fail `git diff --check`.

**Approach:** Amend the Epic contract so legacy/shadow and `v6_active` behavior are unambiguous; add only `RP-10` and `PM-07` to close the reviewed canonical-route and post-Apply proof gaps; replace umbrella coverage entries with per-requirement implementation traceability; and mechanically remove only the trailing whitespace introduced in Architecture review artifacts.

## Boundaries & Constraints

**Always:** Preserve the PRD as product source of truth and the Architecture Spine/companions as technical source of truth; keep `v6_active` web triggering limited to uncovered or freshness-sensitive required needs, conflict, or explicit current verification; add `RP-10` for owner-confirmed set/clear-path plus reopen persistence and `PM-07` for owner Apply plus the next current-plan answer; map every PCR, production journey, safety criterion, and acceptance criterion to responsible Story 21 ownership, canonical fixtures, and named evaluation cohort/gate proof; map PCR-10 through `COMP-01`?`COMP-06`; preserve legacy rollback until the approved physical-cleanup gate; make only documentation changes.

**Ask First:** Any proposed change to PRD outcomes, Architecture decisions, fixture meanings/IDs beyond the approved `RP-10` and `PM-07` additions, story scope beyond traceability correction, or deletion of review artifacts.

**Never:** Treat card count, generic knowledge absence, or undifferentiated uncertainty as an independent `v6_active` web trigger; imply that Story 21.12 silently overrides an unchanged Story 4.5; invent additional fixtures, services, runtime configuration, schemas, or product requirements; rewrite review prose while removing whitespace.

</frozen-after-approval>

## Code Map

- `_bmad-output/planning-artifacts/epics.md` -- Story 4.5 retrieval AC, v6.2 coverage map, and Epic 21 delivery ownership.
- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/addendum.md` -- PCR dispositions, journey outcomes, and compatibility-retirement authority.
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md` -- AD-38 authoritative read-mode and retirement contract.
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware-solution-design.md` -- product traceability requirement and proof surfaces.
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md` -- canonical fixture catalog, including approved `RP-10` route mutation/reopen and `PM-07` post-Apply authority proof.
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md` -- critical-authoritative and standard cohort ownership.
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/reviews/*.md` -- files containing the 56 trailing-whitespace violations introduced by the reviewed commit.

## Tasks & Acceptance

**Execution:**
- [x] `_bmad-output/planning-artifacts/epics.md` -- rewrite Story 4.5 AC with explicit `legacy`/`v6_shadow` and `v6_active` branches, including safe handling for absence and uncertainty -- eliminate the active-contract contradiction rather than relying on Story 21.12 to override it.
- [x] `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md` and `_bmad-output/planning-artifacts/epics.md` -- add `RP-10` and `PM-07` and bind them to Stories 21.5/21.4 -- make PCR-05, AC-29, and SC-12 proof executable rather than overstated.
- [x] `_bmad-output/planning-artifacts/epics.md` -- replace the PCR/PJ/SC/AC umbrella ranges with individual rows that name responsible Story 21 stories, canonical fixture chains, and release cohort/gate proof, including PCR-10 through `COMP-01` through `COMP-06` -- make implementation ownership auditable from the Epic coverage map.
- [x] `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/reviews/*.md` -- remove the commit-introduced trailing spaces without changing visible prose -- restore a clean documentation diff.

**Acceptance Criteria:**
- Given Story 4.5 and Story 21.12 are read independently, when either is used for implementation, then both preserve count behavior only for legacy authority or shadow telemetry and give `v6_active` the same AD-38 trigger contract.
- Given an owner sets or clears a canonical leg path and applies a correction, when the Trip is reopened and the next current-plan answer runs, then `RP-10` and `PM-07` prove persisted applied authority without reuse of stale request/proposal text.
- Given PCR-01 through PCR-10, PJ-01 through PJ-06, SC-8 through SC-12, and AC-28 through AC-33, when the v6.2 Epic coverage map is inspected, then every individual item has explicit Story 21 ownership, canonical fixture proof, and a named cohort or gate proof surface.
- Given the corrected commit diff and untracked Quick Dev spec, when tracked/combined diff checks, an explicit spec whitespace scan, and targeted traceability audits run, then no whitespace errors, missing identifiers, contradictory active count trigger, or unowned v6.2 mapping remains.

## Spec Change Log

## Design Notes

Keep the coverage map compact but explicit. Shared ownership may use story ranges only within an individual requirement row; requirement identifiers themselves must not be collapsed. Cohort labels should use the Architecture vocabulary (`critical-authoritative`, `standard statistical`, or the applicable `G0`–`G3` gate) rather than creating a parallel taxonomy.

## Verification

**Commands:**
- `git diff --check HEAD^` -- expected: the combined prior commit plus current tracked corrections contain no whitespace errors.
- `awk '/[ \t]+$/ { bad=1 } END { exit bad }' _bmad-output/implementation-artifacts/spec-resolve-retrieval-v6-2-documentation-findings.md` -- expected: the untracked spec contains no trailing whitespace.
- targeted identifier audit over `epics.md` -- expected: every PCR/PJ/SC/AC identifier appears as an individual coverage-map entry with story, fixture, and cohort/gate columns.
- targeted contract/fixture search over Story 4.5, Story 21.12, `RP-10`, `PM-07`, PRD addendum, and AD-38 -- expected: aligned read-mode triggers and complete route/post-Apply proof.
- `git diff --word-diff=porcelain -- _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/reviews` -- expected: review-artifact changes are whitespace-only.

## Suggested Review Order

**Active retrieval contract**

- Start with the read-mode split that retires count-based v6 fallback.
  [`epics.md:1113`](../planning-artifacts/epics.md#L1113)

**Implementation traceability**

- Review every PCR, journey, safety criterion, and acceptance owner in one table.
  [`epics.md:562`](../planning-artifacts/epics.md#L562)

- Confirm post-Apply answers pin the resulting current Trip version.
  [`fixtures.md:67`](../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#L67)

- Confirm set/clear path mutations retain exact meaning across reopen.
  [`fixtures.md:82`](../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#L82)

- Verify Story 21.4 owns the complete PM fixture chain.
  [`epics.md:3150`](../planning-artifacts/epics.md#L3150)

- Verify Story 21.5 owns the complete RP fixture chain.
  [`epics.md:3178`](../planning-artifacts/epics.md#L3178)

**Diff hygiene**

- Review artifacts change only by removal of trailing whitespace.
  [`review-rubric-walker.md:36`](../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/reviews/review-rubric-walker.md#L36)
