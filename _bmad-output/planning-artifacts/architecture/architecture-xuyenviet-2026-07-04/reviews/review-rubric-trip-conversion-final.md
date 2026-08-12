---
title: Final Architecture Rubric Closure Review — AD-40 Persistent Chat-To-Trip Conversion
status: final
reviewed: 2026-08-12
target: ../ARCHITECTURE-SPINE.md#AD-40
verdict: PASS
critical_findings: 0
high_findings: 0
medium_findings: 0
---

# Final Architecture Rubric Closure Review — AD-40

## Verdict

**PASS — 0 Critical, 0 High, 0 Medium.**

The current Spine and progressive companions close the AD-40 architecture seams, technology ownership, dismissal contract, gate metrics, evidence identity, and policy validation. TC-RW-01 through TC-RW-04 are closed for the current Architecture + Epic Step-2 gate, and the seam/technology repairs introduce no new architecture regression.

Under the mandatory epics workflow, Epic 21 is currently a Step-2 structure/coverage deliverable. Story 21.x acceptance criteria belong to Step 3 and cannot be generated until the user approves the Epic 21 structure and selects `C`. Their intentional absence is therefore a required next workflow step, not a current Architecture finding.

The deterministic Spine linter passes: `ok: true`, `total_findings: 0`.

## Prior-Finding Closure Matrix

| Prior finding | Status | Current evidence |
|---|---|---|
| TC-RW-01 — Epic/story traceability and target contract | **Closed for Step 2** | The completed Story 16.1 is correctly marked as historical `decisionId` baseline; Epic 21 owns AD-40/RTA-13 and explicitly requires the in-place accept/decline-port migration, persistent latest-manifest conversion, separate primary conversation, initial pending proposal, and context-free existing-Trip continuation (`epics.md:519-531`, `:668-676`, `:2841-2847`). Story 21.x coverage is the mandatory Step-3 deliverable after user approval, not a missing Step-2 artifact. |
| TC-RW-02 — No closed opportunity-dismissal contract | **Closed** | `DismissTripCreationRecommendationCommand/Result` is typed, uses `opportunityId` and idempotency, and the existing decline port is explicitly upgraded without a parallel endpoint (`retrieval-trip-aware/contracts.md:418-428`, `:451`). The closed CAS lifecycle is defined in Spine and contract prose (`ARCHITECTURE-SPINE.md:741`; `contracts.md:443`). |
| TC-RW-03 — Gate safety/evidence identity incomplete | **Closed** | Conversion mutation/isolation/idempotency measures are literal-zero critical-authoritative safety metrics; AD-40 is mandatory at G0; conversion projection-policy, proposal-schema, and canonical-serialization versions pin result identity, evidence tuple, restart behavior, and release reports (`evaluation-and-release-gates.md:18-74`, `:106-115`, `:168-180`; `contracts.md:843-875`). |
| TC-RW-04 — Projection policy structurally open | **Closed** | The policy is bounded, uses the closed proposal-operation discriminator, has a code-owned validated catalog, rejects empty/over-limit/duplicate/conflicting/unknown/schema-incompatible mappings, and is exercised by TC-13 (`contracts.md:355-367`, `:449`; `fixtures.md:152`). |

## Required Next Workflow Step — Not A Current Finding

After the user approves the Epic 21 Step-2 structure and selects `C`, Step 3 must create Story 21.x acceptance coverage. The conversion story should trace FR-16J–L, PJ-01, RTA-13, AD-30/30A/39/40, and TC-01..TC-18; carry the deliberate in-place `decisionId` to `opportunityId` accept/decline migration; and verify latest eligible context, disabled pending turns, explicit dismissal, exact pending proposal creation, transcript isolation, pre-Apply authority, idempotent deletion/replay, and `continueInTrip(...)` non-import behavior.

This is a downstream story-authoring obligation and becomes gate-relevant at Step 3 / cross-artifact implementation readiness. It does not block the present Architecture + Epic Step-2 approval.

## Seam And Technology Regression Check

No new Critical, High, or Medium regression was found in the repaired architecture artifacts:

- Canonical cross-session claim selection, same-scope replacement, compatible-scope accumulation, contradiction suspension, and persisted projection identity are closed (`ARCHITECTURE-SPINE.md:735`; `contracts.md:343-367`, `:445-447`; TC-14).
- Accept/dismiss/refresh/delete share one versioned owner/conversation CAS state machine; terminal states cannot reactivate and post-dismissal material change creates a new opportunity (`ARCHITECTURE-SPINE.md:741`; `contracts.md:443`; TC-15).
- Server-owned `visible_disabled` projection and admission fencing cover other clients/tabs while a newer AI Ask is unterminalized (`contracts.md:379-394`, `:447`; TC-16).
- The manifest stores a typed proposal payload, pins canonical serialization, and fails closed on missing/schema-invalid/digest-mismatched payload (`contracts.md:316-367`, `:447`; TC-17).
- Accept idempotency now defines digest inputs, success-only key reservation, refresh retry, source deletion, and destination tombstoning (`ARCHITECTURE-SPINE.md:741`; `contracts.md:453-455`; TC-18).
- Profiled opportunity refresh is synchronously attached to the existing AI Ask terminalization seam and explicitly detached from suppressed background extraction and legacy flat `chat_context` (`ARCHITECTURE-SPINE.md:743`; `retrieval-trip-aware-solution-design.md:127`).
- The migration matrix assigns database, proposal-contract, wire-contract, NestJS/OpenAPI, and traveler-presentation changes to existing modules without a new service, endpoint, Worker path, cache, model purpose, or environment flag (`retrieval-trip-aware-solution-design.md:129-137`).

## Gate Decision

The AD-40 Architecture reviewer gate and Epic 21 Step-2 ownership/coverage gate pass. Proceed to user approval of the Epic 21 structure; after `C`, generate and validate Story 21.x before the later cross-artifact implementation-readiness gate.
