---
title: Architecture Rubric Review — AD-40 Persistent Chat-To-Trip Conversion
status: final
reviewed: 2026-08-12
target: ../ARCHITECTURE-SPINE.md#AD-40
verdict: FAIL
critical_findings: 0
high_findings: 3
medium_findings: 1
---

# Architecture Rubric Review — AD-40 Persistent Chat-To-Trip Conversion

## Verdict

**FAIL — 0 Critical, 3 High, 1 Medium.**

AD-40 is directionally sound and compatible with the PRD: it keeps the original chat separate, converts only explicit supported context into an initial pending proposal, preserves owner confirmation as the only route to applied Trip state, and keeps `continueInTrip(...)` as a context-free existing-Trip scope switch. The delta is not implementation-ready, however, because the active Epic 16/Story 16.1 still specifies the old decision-revision behavior, the new opportunity dismissal path is not a closed shared contract, and release evidence does not consistently classify or pin the new conversion safety surface.

The structural spine linter passes with zero findings. The failure is semantic and cross-artifact, not markdown structure.

## Good-Spine Rubric Result

| Rubric dimension | Result | Judgment |
|---|---|---|
| Real divergence points | Pass | AD-40 governs the places teams would otherwise diverge: persistent CTA lifecycle, latest-revision conversion, transcript isolation, proposal-only transfer, idempotency, concurrency, and deletion. |
| Enforceability | Fail | Accept is typed, but explicit dismissal of the new opportunity is not; the projection exposes `opportunityId` while the current story/brownfield decline path remains decision-bound. |
| Deferred holes | Pass | Existing-Trip import is explicitly deferred behind a future separate pending-proposal command; it does not leave an implicit import path. |
| Brownfield ratification | Fail | The existing accept endpoint is intentionally reused, but the request/response migration from current `decisionId` semantics to `opportunityId` plus `proposalId` is absent from the active story and epic implementation notes. |
| PRD/v6.2 coverage | Partial | AD-40 itself preserves FR-16J–L, AC-25–26, and PJ-01, but Story 16.1 and Epic 16 do not trace or fully express RTA-13/AD-40. |
| Operational envelope | Partial | No new service, queue, worker, cache, model purpose, or flag is introduced, but the evidence-window identity omits two behavior-defining conversion versions. |

## Findings

### TC-RW-01 — High — Epic 16 and Story 16.1 still authorize the pre-AD-40 decision semantics

**Evidence**

- RTA-13 requires a persistent opportunity whose stable CTA resolves the latest eligible manifest, and a successful conversion creates a Trip, separate primary conversation, and initial pending proposal (`epics.md:248`).
- Epic 16's coverage declaration names AD-11, AD-30A, and AD-30B, but not AD-40 or RTA-13 (`epics.md:641-647`). Its implementation notes still say a stale decision cannot create a project rather than distinguishing a stale manifest from a current stable opportunity.
- Story 16.1 still returns the old `trip_creation_recommendation` decision union (`epics.md:2820-2823`) and says any changed-context decision creates nothing (`epics.md:2835-2838`). AD-40 instead requires the click to resolve the opportunity's latest eligible manifest; only an unterminalized or currently ineligible/stale state must fail (`ARCHITECTURE-SPINE.md:733-739`).
- Story 16.1 does not require creation of the initial pending proposal, return of its identity, transcript isolation for conversion, or the no-pre-Apply mutation fence.
- The current brownfield contract and API use `{ decisionId, idempotencyKey }` and return no `proposalId`, while the architecture companion changes this to `{ opportunityId, idempotencyKey }` and a successful result containing `proposalId` (`retrieval-trip-aware/contracts.md:367-386`).

**Why this blocks readiness**

An implementation agent following Story 16.1 can correctly preserve the already-shipped decision flow and still fail RTA-13: it may invalidate every displayed CTA after material context change, omit the initial proposal, or retain an incompatible wire contract. This is a direct cross-artifact implementation conflict, not merely missing detail.

**Required closure**

Update Epic 16 coverage/implementation notes and Story 16.1 acceptance criteria to trace RTA-13, AD-40, and TC-01..TC-12; distinguish stable opportunity identity from immutable manifest revisions; require the current eligible manifest, separate new primary conversation, initial pending proposal, proposal identity, transcript isolation, and pre-Apply fence; and specify the deliberate shared-contract/API migration from `decisionId` to the opportunity-compatible request without creating a parallel endpoint.

### TC-RW-02 — High — The new persistent opportunity has no closed dismissal command contract

**Evidence**

- AD-40 makes explicit dismissal the only action that records a decline fence and gives the opportunity a `dismissed` state (`ARCHITECTURE-SPINE.md:733-735`; `retrieval-trip-aware/contracts.md:309-314`).
- `TripConversionProjection` exposes `opportunityId`, and the companion defines only `AcceptTripCreationRecommendationCommand`; it defines no owner-scoped dismiss command/result or binding from the opportunity to the existing decline port (`retrieval-trip-aware/contracts.md:357-386`).
- Story 16.1 and the current brownfield UI/API dismiss a creation *decision* by `decisionId` (`epics.md:2830-2833`), while the new eligible projection carries no `decisionId`.

**Why this blocks readiness**

Teams cannot implement TC-05 consistently without inventing one of several incompatible behaviors: add a new endpoint, overload the old decision command, expose both IDs, or treat client hiding as dismissal. The last behavior violates AD-40 directly, and the others create contract divergence.

**Required closure**

Ratify one owner-port path for explicit opportunity dismissal. Prefer extending the existing decline port, mirroring the accept-port reuse decision. Define its request/result, owner/current-manifest/idempotency fences, legal status transition, stale/latest-context behavior, and how the stable projection supplies its identifier. Add the corresponding Story 16.1 acceptance criterion and fixture contract.

### TC-RW-03 — High — Conversion safety is mandatory in the contract but not closed consistently in the release gate or evidence identity

**Evidence**

- `RetrievalGateProfile.mandatorySafetyLimits` correctly requires literal zero for stale-manifest use, transcript copy, duplicate conversion, and pre-Apply conversion mutation (`retrieval-trip-aware/contracts.md:781-799`).
- The evaluation document's critical-authoritative zero-tolerance list omits all four conversion metrics, while its standard-statistical section classifies persistent-conversion correctness as standard (`retrieval-trip-aware/evaluation-and-release-gates.md:18-50`).
- G0 requires the validator to reject missing/unknown SC-8..12, AC-28..33, or AD-39 metrics, but does not name AD-40 conversion metrics (`retrieval-trip-aware/evaluation-and-release-gates.md:104-118`).
- The manifest correctly pins `conversionProjectionPolicyVersion` and `tripProposalSchemaVersion` (`retrieval-trip-aware/contracts.md:316-346`), but neither version appears in `RetrievalGateProfile` result identity or the exact comparable evidence tuple (`retrieval-trip-aware/evaluation-and-release-gates.md:54-72`; `retrieval-trip-aware/contracts.md:811-813`).

**Why this blocks readiness**

The current documents permit two incompatible gate implementations: one treats conversion safety as literal-zero critical authority, while another treats it as a benchmarked standard metric. Even if literal-zero validation is chosen, evidence could be accumulated across different projection-policy or proposal-schema versions, so a passing window would not prove the behavior being released.

**Required closure**

Classify the four conversion mutation/isolation metrics explicitly as critical-authoritative literal-zero metrics in the evaluation document and make G0 validation name AD-40. Add conversion projection-policy and Trip proposal-schema versions to result identity, the comparable evidence tuple, restart rules, and the release report. Keep freshness/usefulness measures standard only if they cannot authorize unsafe mutation.

### TC-RW-04 — Medium — `TripConversionProjectionPolicy` is versioned but not structurally closed

**Evidence**

- The policy uses unbounded string arrays and an open `operationKind: string` (`retrieval-trip-aware/contracts.md:336-346`).
- The prose requires deterministic mapping and an existing proposal schema, but defines no policy activation validator for duplicate/conflicting field rules, unknown field keys, invalid scope kinds/value-schema combinations, empty mappings, or size limits (`retrieval-trip-aware/contracts.md:389-393`).
- TC-12 covers assumption-only and unsupported fields, but no fixture rejects a malformed or ambiguous projection policy (`retrieval-trip-aware/fixtures.md:150-151`).

**Impact**

A version can be syntactically present yet map the same context field to conflicting operations or admit an unknown operation discriminator, shifting determinism into implementation convention.

**Required closure**

Bind `operationKind` to the existing closed proposal-operation discriminator, define finite policy bounds and uniqueness/compatibility validation, identify the owner/activation path, and add a fixture that rejects a malformed policy before it can produce an eligible opportunity or count toward a gate.

## PRD And Journey Compatibility

| Requirement | AD-40 judgment |
|---|---|
| FR-16J / AC-25 | Compatible: explicit owner conversion only; not clicking is neutral; explicit dismissal creates the material-context decline fence. |
| FR-16K / AC-26 | Compatible: no Trip context is attached automatically; existing-Trip continuation remains a separate explicit scope switch. |
| FR-16L | Compatible: `continueInTrip(...)` selects the existing primary conversation and imports no ordinary-chat context. |
| FR-16G–I / AC-22–23 | Compatible: conversion creates an initial pending typed proposal; only owner Apply mutates Trip state and existing proposal history/audit remains authoritative. |
| PJ-01 | Compatible at architecture level: raw chat is not reconstructed as confirmed plan. The active story does not yet carry the full proof obligation. |

## Strong Parts To Preserve

- Chat/Trips is the single owner of opportunity, manifest, decision, transaction, and deletion fencing; no new service or parallel accept endpoint is introduced.
- The stable CTA resolves the latest eligible server manifest and is disabled while a newer traveler turn is unterminalized.
- The deterministic conversion policy and proposal schema are pinned in each manifest; raw transcript/model artifacts, ambiguity, unresolved fields, unsupported fields, and assumption-only operations are excluded.
- Conversion creates a separate primary conversation and pending proposal atomically; original chat remains ordinary and separate.
- TC-01..TC-12 cover persistence, refresh, ambiguity, dismissal, transactionality, transcript isolation, idempotency, races, existing-Trip isolation, pending turns, and assumption/unsupported-field behavior.
- The linter result is clean: `ok: true`, `total_findings: 0`.

## Gate Decision

Do not pass the AD-40 implementation-readiness gate until TC-RW-01 through TC-RW-03 are closed. TC-RW-04 should be closed in the same documentation repair because it is a bounded contract clarification and avoids implementation-defined policy validation.
