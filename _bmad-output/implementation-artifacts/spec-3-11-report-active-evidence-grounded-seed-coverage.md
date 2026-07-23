---
title: 'Story 3.11: Report Active Evidence-Grounded Seed Coverage'
type: 'feature'
created: '2026-07-23'
status: 'done'
baseline_revision: 'f56bb04'
final_revision: '489bb14'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-10-propagate-source-removal-and-state-changes-to-search-eligibility.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The operator seed-progress screen reports legacy approved cards rather than the active, evidence-grounded knowledge that can safely support public MVP readiness. It cannot show current coverage gaps, caveat-only high-risk material, or the version-current source/recommendation work needed to close the gap.

**Approach:** Replace the approval-based aggregate with a protected, current-state coverage report. Count only active Hanoi-to-HCMC cards with complete retrieval metadata and valid bounded evidence from eligible, retained sources; expose aggregate-safe distribution, policy signals, and links to existing operator workflows.

## Boundaries & Constraints

**Always:** Require an operator/admin session before querying or deriving progress; make current card, evidence, source eligibility, and retained capture/span validation authoritative; exclude ineligible current states without depending on search projections or historical approvals; preserve the 100-card target and full taxonomy/corridor zero-count distributions; return aggregate-only safe data with no raw capture content, URLs, quotes, provider payloads, or internal source-removal details; label caveat-only high-risk material distinctly from counted active community observations/patterns.

**Block If:** Current persisted card/evidence/source/capture state cannot distinguish countable evidence-grounded coverage from withdrawn, tombstoned, incomplete, or caveat-only material without exposing protected data.

**Never:** Do not change publication/review/verification state, create a new approval lifecycle, make seed-batch status a readiness authority, implement traveler retrieval/indexing, or expose raw/operator-only source material.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|----------------------------|----------------|
| Countable coverage | Active corridor card with complete metadata, eligible source, retained capture, and active bounded supporting evidence | Count once toward the 100 target and its taxonomy/route bucket | No error expected |
| Unsafe/incomplete card | Suppressed, archived, superseded, conflicted, pending-review, verification-required/failed, withdrawn-source, tombstoned, invalid-evidence, missing metadata, or non-corridor card | Exclude from count; show applicable aggregate review, verification, or caveat-only signal where relevant | Never promote via historical approval or stale projection |
| Work trace | Current corridor card has open/in-review version-current recommendation or source intake work | Return reason/priority aggregate and a safe link to existing operator workflow | Exclude stale/superseded recommendation work |
| Authorization | Traveler/unauthenticated caller requests progress | Reject before reading progress or deriving statuses | Return existing admin authorization error |

</intent-contract>

## Code Map

- `src/features/knowledge/batch-intake.ts` -- existing protected corridor report, current-card eligibility projection, route/type distribution, and seed intake operational counts.
- `src/features/knowledge/state.ts` -- canonical traveler-eligibility convention that the report must align with while additionally checking live source eligibility.
- `src/features/knowledge/recommendations.ts` and `src/db/schema.ts` -- version-bound operator work/reason fields and current source/evidence/card state used for aggregate signals.
- `src/app/admin/knowledge/progress/page.tsx` -- existing protected Vietnamese operator progress UI and its legacy approval wording.
- `tests/knowledge-batch-source-intake.test.ts` -- integration coverage for progress authorization, current evidence eligibility, aggregates, and safe output.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/batch-intake.ts` -- replace the approval-named progress contract with an active evidence-grounded aggregate that validates current eligible sources, retained captures, bounded active evidence, complete card metadata, and corridor membership; add active community, caveat-only, pending review/verification, and current actionable-work aggregates without leaking source data.
- [x] `src/app/admin/knowledge/progress/page.tsx` -- render Vietnamese-first active-evidence readiness language, remaining gap, zero-count taxonomy/location gaps, policy signals, and safe links to intake/recommendation workflows; explicitly state that historical approval is not readiness.
- [x] `tests/knowledge-batch-source-intake.test.ts` -- update legacy progress assertions and cover current source/evidence/capture eligibility, excluded unsafe states, community versus caveat-only separation, version-current operator work signals, authorization, and aggregate-only output.

**Acceptance Criteria:**
- Given AI-first cards exist, when an operator views seed progress, then the report counts only active Hanoi-to-HCMC cards with current active evidence and complete retrieval metadata toward the 100-card target, excluding suppressed, archived, superseded, evidence-invalid, incomplete, or otherwise ineligible cards.
- Given counted cards have type, route/location, review, and verification state, when progress is displayed, then taxonomy and route/location gaps plus pending review/verification signals are shown, and active community observations/patterns are distinct from caveat-only high-risk material.
- Given the active evidence-grounded target is not met, when readiness is checked, then the remaining gap is reported without an approval-based readiness claim and operators receive safe traces to current source/recommendation work needed to close it.

## Design Notes

The report is a current-state read model, not a new readiness state. A card is counted once after the same card-level eligibility rules used for traveler safety and a report-specific evidence existence check that joins the current eligible source and a retained capture whose bounded span still exactly matches the evidence quote. Recommendation summaries must require the recommendation's card content/evidence-set versions to match current card versions so stale work is not represented as actionable.

## Verification

**Commands:**
- `pnpm vitest run tests/knowledge-batch-source-intake.test.ts` -- expected: protected current-state coverage, safety exclusions, aggregate signals, and safe output pass.
- `pnpm lint` -- expected: success.
- `pnpm typecheck` -- expected: success.
- `pnpm build` -- expected: success.

## Review Triage Log

### 2026-07-23 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (medium 2)
- defer: 0
- reject: 1 (medium 1)
- addressed_findings:
  - `[medium]` `[patch]` Restricted card and evidence reads to active publication state so inactive card work cannot inflate coverage policy signals and unrelated inactive evidence is not loaded.
  - `[medium]` `[patch]` Kept caveat, review, and verification counters scoped to the active card set established by the report query.

### 2026-07-23 - Follow-up review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

## Auto Run Result

Status: done

Replaced approval-based corridor progress with a protected active evidence-grounded coverage report. It counts only active Hanoi-to-HCMC cards with complete metadata, eligible retained sources, and active bounded evidence; it also reports distribution gaps, caveat-only material, review/verification signals, and version-current recommendation work without returning protected source content.

Files changed:
- `src/features/knowledge/batch-intake.ts` -- current-state coverage aggregate and safe operator-work summaries.
- `src/app/admin/knowledge/progress/page.tsx` -- Vietnamese operator readiness page with active-evidence terminology and workflow links.
- `tests/knowledge-batch-source-intake.test.ts` -- coverage, exclusion, authorization, and privacy regression tests.

Review findings: two medium review patches were applied to scope report inputs and policy signals to active publication state; one proposed current-capture restriction was rejected because evidence must remain valid against its immutable referenced capture version.

Verification passed: `pnpm vitest run tests/knowledge-batch-source-intake.test.ts` (12 tests), `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`.

Residual risk: Corridor membership is normalized in application code because the current schema has no canonical indexed corridor field; the report remains operator-only and targets the bounded seed corpus.
