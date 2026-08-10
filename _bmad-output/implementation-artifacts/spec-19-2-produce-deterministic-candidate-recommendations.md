---
title: 'Produce Deterministic Candidate Recommendations'
type: 'feature'
created: '2026-08-10'
status: 'done'
baseline_revision: '9a33e10'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-19-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Discovery has governed AI metadata triage but no durable policy-owned recommendation that can rank review safely without letting a model determine eligibility or truth.

**Approach:** Add a versioned deterministic evaluator, immutable Discovery recommendation provenance, and a fenced post-triage Worker stage while keeping eligibility behind the existing opaque Knowledge port.

## Boundaries & Constraints

**Always:** Evaluate only normalized bounded triage scores with persisted policy weights and thresholds; make canonical identity, current-run enrichment, canonical video-ID dedupe, and prior-capture eligibility hard gates. Preserve the claimed-run fence, one terminal cancellation audit, and no transaction around the opaque eligibility call. Persist only closed codes and bounded numeric values.

**Block If:** Existing Discovery fence, retention, or opaque eligibility seams cannot support immutable recommendation persistence without direct Knowledge-table access or a second provider call.

**Never:** Create mutable operator state, a queue/API/UI, Knowledge sources or capture state, a new scheduler/provider/configuration, arbitrary JSON or free-text rationale, raw/provider/source/evidence/traveler data, or a direct Knowledge-table query.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Eligible triage | Succeeded current-run triage, enrichment, valid policy, eligibility `eligible` | One immutable `skip`, `defer`, or `consider` recommendation and one `recommended` history row | Retry sees provenance and completes before eligibility lookup |
| Compatible prior capture | All hard gates except eligibility returns `already_compatible` | Immutable `skip` with `already_compatible` reason regardless of score | No Knowledge identifiers retained |
| Ineligible or transient | Canonical/enrichment hard-gate failure or eligibility `unavailable` | Hard failures receive closed skip reason where applicable; unavailable produces no recommendation/history | Unavailable/abort/deadline follows current transient retry path |
| Fence or retention | Lease/policy/proposal is lost, or candidate graph expires | No partial recommendation/history survives; ordered retention deletes recommendations under its local guard | Existing cancellation path records only its terminal audit |

</intent-contract>

## Code Map

- `packages/domain/src/youtube-discovery/policy.ts` -- versioned policy parser and DB-free deterministic evaluator.
- `packages/domain/src/youtube-video.ts` -- shared canonical URL/video-ID identity proof.
- `packages/database/src/schema.ts` -- typed policy/recommendation/history schema definitions.
- `drizzle/migrations/0056_*.sql` and `drizzle/migrations/meta/_journal.json` -- forward backfill, DB invariants, and append-only triggers.
- `packages/database/src/youtube-discovery/index.ts` -- guarded bundle read, atomic writer, provenance idempotency, and retention ordering.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- post-triage, out-of-transaction opaque eligibility sequencing.
- `tests/youtube-discovery-recommendations.test.ts` and `tests/youtube-discovery-recommendations.integration.test.ts` -- pure contract and serial PostgreSQL boundary coverage.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain/src/youtube-discovery/policy.ts` -- add seven six-decimal policy inputs, strict parser validation, decimal half-up `round6`, and closed deterministic evaluator -- scores use only the new five weights/two thresholds; equality promotes to the higher band.
- [ ] `packages/database/src/schema.ts`, `drizzle/migrations/0056_*.sql`, and `drizzle/migrations/meta/_journal.json` -- add migration-backed numeric policy values, immutable provenance-linked recommendations, `recommended` history, closed/bounded constraints, successful-triage/cross-graph validation, and guarded append-only deletion -- existing legacy weights remain inert audit fields.
- [ ] `packages/database/src/youtube-discovery/index.ts` -- add guarded current-run recommendation read/write operations and delete recommendations before triages under a transaction-local retention guard -- preserve the existing lease, fencing, policy/proposal and global enablement checks.
- [ ] `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- persist/enrich/triage every canonical candidate and run exactly one opaque eligibility lookup only after successful triage -- persist compatible candidates as hard skips and retain existing retry/cancellation semantics.
- [ ] `tests/youtube-discovery-recommendations.test.ts`, `tests/youtube-discovery-recommendations.integration.test.ts`, and relevant triage/execution/ownership tests -- cover score boundaries, hard gates, privacy, immutable DB constraints, idempotency, retention, fence loss, deadline, and port restoration -- prove no direct Knowledge access.

### Review Findings

- [x] [Review][Patch] Preserve required recommended history records during bounded history trimming [packages/database/src/youtube-discovery/index.ts:313]
- [x] [Review][Patch] Re-read unexpired current-run safe signals before recommendation persistence [packages/database/src/youtube-discovery/index.ts:418]
- [x] [Review][Decision] Keep `numeric(7,6)` canonical storage for ranking numerics [drizzle/migrations/0056_add_discovery_recommendations.sql:1] -- PostgreSQL rounds direct SQL inputs before constraints/triggers can observe excess precision. Story-required `numeric(7,6)` and strict application policy parsing remain authoritative; direct SQL inputs canonicalize to six decimal places rather than being rejected.
- [x] [Review][Patch] Keep recommendation-history provenance in the same candidate/run/policy graph [drizzle/migrations/0056_add_discovery_recommendations.sql:42]
- [x] [Review][Patch] Enforce the execution deadline across eligibility and recommendation persistence [packages/worker-domain/src/features/youtube-discovery/execution.ts:82]
- [x] [Review][Patch] Fail closed for malformed eligibility-port responses [packages/worker-domain/src/features/youtube-discovery/execution.ts:82]
- [x] [Review][Patch] Restore the repository unit-test boundary after new integration fixtures use ranking-history stage [tests/knowledge-target-vocabulary-boundary.test.ts:7]
- [x] [Review][Patch] Consolidate recommendation schema changes into the single permitted forward migration [drizzle/migrations/0056_harden_discovery_recommendation_invariants.sql:1]

**Acceptance Criteria:**
- Given valid triage, when deterministic policy evaluates it, then immutable `skip | defer | consider` provenance has bounded closed factor, penalty, reason, and signal codes independent of future operator state.
- Given a candidate is considered for review, when policy evaluates it, then canonical identity, current-run enrichment, dedupe, prior-capture status, and score bands are rechecked and no score overrides a failed hard gate.
- Given later review consumes a recommendation, when it projects its fields, then closed codes support plain-language rendering without asserting truth, source verification, or publication eligibility; this story adds no authorization, endpoint, copy, or UI.

## Spec Change Log

## Review Triage Log

- 2026-08-10: BMad review repaired seven implementation defects covering ranking-history retention, unexpired signals, provenance linkage, execution deadlines, malformed eligibility results, the unit boundary, and the single-migration contract. The remaining numeric finding was resolved by decision: retain the required `numeric(7,6)` storage and PostgreSQL canonicalization, because database constraints cannot inspect pre-coercion scale.

## Design Notes

The recommendation is immutable provenance rather than candidate state. The Worker must first read a guarded durable bundle, return idempotently before the eligibility port when it already exists, call the port outside a transaction, then re-enter a guarded atomic writer. This prevents retry/provider duplication and discards external eligibility results if the claim fence is lost.

## Verification

**Commands:**
- `pnpm exec vitest run --project unit tests/youtube-discovery-recommendations.test.ts tests/youtube-discovery-triage.test.ts tests/youtube-discovery-ownership.test.ts` -- deterministic evaluator, bounded data, and ownership behavior pass without a database.
- `pnpm exec vitest run --project integration tests/youtube-discovery-recommendations.integration.test.ts tests/youtube-discovery-triage.integration.test.ts tests/youtube-discovery-execution.integration.test.ts` -- serial migration-backed provenance, fencing, retention, and retry behavior pass.
- `pnpm lint` -- no lint errors.
- `pnpm typecheck` -- strict TypeScript passes.
- `pnpm build` -- production build passes.
- `git diff --check` -- no whitespace errors.

## Auto Run Result

Status: blocked

Blocking condition: `bmad-dev-auto` requires a synchronous implementation subagent. No subagent-execution capability is available in this environment, so continuing would violate the workflow's mandatory subagent requirement.
