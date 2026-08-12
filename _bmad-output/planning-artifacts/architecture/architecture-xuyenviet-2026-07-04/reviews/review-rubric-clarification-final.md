---
title: Architecture Reviewer Gate — AD-39 Clarification Delta
reviewed: 2026-08-12
review_target: ../ARCHITECTURE-SPINE.md#AD-39
intent: validate-delta
reviewer: rubric-walker
---

# Architecture Reviewer Gate — AD-39 Clarification Delta

## Verdict

**FAIL — AD-39 is directionally sound but not ready for compatible story implementation.**

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 5 |
| Medium | 1 |

Mechanical Spine lint passes with zero findings. This review is limited to the current AD-39 clarification/scoped-context delta and its interaction with AD-6, AD-8, AD-29, AD-30, AD-34, and AD-36.

## High Findings

### CL-RW-01 — Clarification-session ownership contradicts AD-6's existing chat-context ownership

**Severity:** High
**Rubric:** ownership; brownfield consistency; enforceability

**Evidence**

- AD-6 assigns conversations, messages, and `chat/trip context` to Chat/Trips; AI Orchestration owns assistant-response provenance (`ARCHITECTURE-SPINE.md:139-153`).
- AD-39 assigns the persisted conversation-bound `PlanningClarificationSession` and its extracted current-planning values to AI Orchestration (`ARCHITECTURE-SPINE.md:705-719`).
- The contracts and solution design repeat AI Orchestration ownership of clarification-session writes (`retrieval-trip-aware/contracts.md:66-105`; `retrieval-trip-aware-solution-design.md:69-79`).
- `planning_clarification_sessions` is now a core persisted entity next to conversation/chat context (`ARCHITECTURE-SPINE.md:761-772`).

**Why this blocks stories**

One story can treat clarification state as Chat/Trips-owned conversation context and require an exported owner port; another can create an AI-Orchestration repository that writes it directly. Both can cite a binding AD. Deletion coordination, authorization helpers, module imports, and table-write linting will diverge.

**Required repair**

Choose one owner and reconcile AD-6 explicitly. Either:

1. Chat/Trips owns persisted clarification session/value state while AI Orchestration coordinates extraction through transaction-aware owner ports; or
2. AD-6 explicitly excludes bounded preflight execution state from Chat/Trips context and assigns that named aggregate to AI Orchestration.

In both cases, Chat/Trips must remain owner of messages and durable Trip state, and the clarification-response message write must use its existing owner port.

### CL-RW-02 — The contract cannot represent the per-deliverable readiness behavior that AD-39 and CLAR-08 require

**Severity:** High
**Rubric:** completeness/readiness ownership; per-deliverable scoping; compatibility

**Evidence**

- AD-39 says one unresolved field blocks only dependent deliverable instances, while unrelated ready instances may proceed (`ARCHITECTURE-SPINE.md:711-715`).
- `CLAR-08` requires accommodation to become ready while food/activity instances remain independently blocked or assumption-eligible (`retrieval-trip-aware/fixtures.md:25-38`).
- `PlanningContextProfile` has exactly one `deliverableClass`; `PlanningClarificationSession` also has exactly one `deliverableClass` plus an untyped array of instance IDs (`retrieval-trip-aware/contracts.md:18-85`).
- `PlanningExecutionRef.clarificationRef` lists only ready instance IDs under one session/profile version; it carries no instance-to-class/profile/readiness mapping (`contracts.md:125-151`).

**Why this blocks stories**

Implementers must invent whether a mixed accommodation/food/activity request creates one session, one session per class, or one parent session with child evaluations. They can also disagree on which profile/version evaluates each instance and whether ready instances can enter one shared Retrieval run. The current type cannot prove that an ID belongs to its correct class/profile or that blocked siblings were excluded.

**Required repair**

Define a canonical execution shape. For example, one conversation-bound clarification execution with typed deliverable instances, each containing:

- instance ID, class, exact task/scope identity;
- pinned profile ID/version and completeness-rule version;
- per-instance readiness/status and unresolved requirement IDs;
- permitted assumptions;
- inclusion/exclusion identity for the subsequent Retrieval execution.

Alternatively define one session per deliverable instance plus an immutable parent execution that coordinates them. Add a mixed-class fixture that asserts exact run membership, not only traveler behavior.

### CL-RW-03 — Scoped override semantics are prose-only because scopes have no canonical hierarchy or ancestry contract

**Severity:** High
**Rubric:** per-deliverable scoping; divergence points; enforceability

**Evidence**

- AD-39 requires narrower explicit values to override broader defaults only within an exact subtree and never leak to siblings (`ARCHITECTURE-SPINE.md:717`).
- The scope union contains journey, day range, leg, place, stay, meal, activity, and deliverable variants, but no canonical scope ID, owner reference, parent/ancestor relation, overlap rule, or precedence comparator (`retrieval-trip-aware/contracts.md:27-45`).
- Several references are unconstrained strings (`stayRef`, `mealRef`, `activityRef`, `deliverableInstanceId`) and the contract does not say how a place intersects a stay, how a day range intersects a leg, or which scope is narrower when two scopes overlap.

**Why this blocks stories**

A completeness evaluator, merger, requirement expander, and UI summary can all obey the prose yet calculate different effective values. Example: destination-place quality versus a stay on that place, or a day-range preference overlapping two legs, has no deterministic ancestry/precedence result. This directly undermines CLAR-07 and cross-scope leakage evaluation.

**Required repair**

Define one versioned scope graph/projection and pure comparator owned by Retrieval. Each scope needs immutable identity, owner/execution binding, kind, canonical target, and explicit parents/coverage. The profile must specify permitted scope kinds and how effective values are resolved when scopes are equal, ancestor/descendant, overlapping, siblings, or unrelated. Ambiguous overlap must produce `ambiguous`, not implementation-specific precedence. Add overlap and sibling fixtures beyond the current destination/transit example.

### CL-RW-04 — Bounded-assumption mode is required by the Spine but cannot be persisted, replayed, or rendered from the contract

**Severity:** High
**Rubric:** persistence/replay; traveler-visible safety; compatibility

**Evidence**

- AD-39 permits a blocked instance to proceed only under a profile-approved bounded-assumption mode whose assumptions are traveler-visible (`ARCHITECTURE-SPINE.md:715`).
- `CLAR-05` exercises refusal or “cứ giả định” and requires no silent default (`retrieval-trip-aware/fixtures.md:33`).
- `PlanningContextProfileField` stores only whether assumption policy is forbidden or traveler-visible; field state has no `assumed` resolution and no assumption value/source/reason/display contract (`retrieval-trip-aware/contracts.md:37-64`).
- `ClarificationExtraction.requestsBoundedAssumptions` is untrusted extractor output, while `PlanningExecutionRef` says assumptions may be recorded but contains only `readyDeliverableInstanceIds` and no assumption records (`contracts.md:87-105,125-151`).

**Why this blocks stories**

The server cannot prove which value was assumed, for which field/instance/scope, under which policy, or what exact traveler-visible wording must survive into the answer. Implementations can silently substitute different defaults while all marking the same instance ready.

**Required repair**

Add immutable validated assumption records containing requirement instance, scoped field, assumed typed value, policy/profile version, reason/trigger, traveler-visible disclosure payload, and render-manifest reference. Readiness must distinguish resolved versus assumption-satisfied fields, and Retrieval/main synthesis must fail closed if an assumption disclosure is omitted or its fence is stale.

### CL-RW-05 — Clarification release gates name metrics that the closed gate profile cannot encode

**Severity:** High
**Rubric:** completeness/readiness ownership; evaluation/release enforceability

**Evidence**

- The gate document adds critical material-context completeness and scoped-preference non-leakage cohorts, plus readiness correctness, unresolved-field omission, and cross-scope leakage metrics (`retrieval-trip-aware/evaluation-and-release-gates.md:18-35,71-94`).
- G2 requires these cohorts to pass with no silent material default or cross-scope leakage (`evaluation-and-release-gates.md:125-136`).
- The closed `RetrievalGateProfile` has no mandatory or statistical fields for false-ready/false-blocked decisions, unresolved-material omission, cross-scope leakage, assumption-disclosure correctness, or partial-reply retention (`retrieval-trip-aware/contracts.md` Evaluation Profile section).
- G0 profile validation still scopes mandatory rejection language to SC-8..12 and AC-28..33 and does not require the AD-39 metric definitions (`evaluation-and-release-gates.md:98-111`).

**Why this blocks stories**

Feedback/Eval cannot create one schema-valid profile that contains the new declared gate thresholds. A report can claim that clarification cohorts pass without a versioned denominator or enforceable threshold, recreating the prose-only gate problem previously removed from AD-37.

**Required repair**

Extend the closed gate profile and validator with versioned clarification metric definitions and required limits. At minimum, critical profiled cases should fix silent material default, false-ready progression, cross-scope leakage, and missing required assumption disclosure to literal zero. Define the statistical policy for false blocking/clarification burden separately. Pin context-profile/completeness/extraction/scope-graph versions in the evidence tuple.

## Medium Finding

### CL-RW-06 — Session CAS, evidence-span replay, and terminal lifecycle are not fully enforceable

**Severity:** Medium
**Rubric:** persistence/replay/deletion; concurrency

AD-39 requires one version-fenced session and exact source-message evidence, but the contract does not yet define:

- the one-active-session uniqueness scope or the CAS command that rejects two replies/intent changes from the same expected revision;
- exact evidence-span offsets and offset semantics—field state stores only message ID and text digest, while extraction returns free text;
- idempotency identity for an extraction per `(session revision, source message, prompt version)`;
- the transition rule from `ready` to `completed`, or whether `declined` is field-only, session-wide, or per deliverable instance;
- explicit clarification-session rows in the deletion matrix, although AD-39's deletion rule is correct at the Spine level.

Tighten the contract with a single compare-and-swap reduce command, exact persisted evidence span, extraction idempotency key, legal transition table, and explicit deletion-matrix row. Add concurrent-reply, duplicate-delivery, repeated-text evidence, and delete-versus-reduce fixtures.

## Compatibility With Existing ADs

| Existing decision | Result |
|---|---|
| AD-6 mutation ownership | **Fail** — CL-RW-01. |
| AD-8 planning modes/context authority | **Pass with fences** — clarification remains current-planning input and planning mode/Trip/proposal versions are pinned. |
| AD-29 Trip aggregate ownership | **Pass** — clarification values do not become applied Trip state. |
| AD-30 owner-confirmed proposal boundary | **Pass** — durable route/constraint/stay/meal/activity changes still require proposal apply. |
| AD-34 required-need generation | **Pass conceptually; contract blocked** — generation begins after instance readiness, but CL-RW-02/03/04 prevent exact executable membership/context. |
| AD-36 replay/deletion chain | **Fail for the delta** — assumption and evidence/session replay are incomplete; deletion is correct in AD-39 but not fully projected into the contract matrix. |

## What Is Strong

- Completeness is deterministic and profile-owned rather than model-declared.
- Each clarification cycle requires a new traveler message, preventing an autonomous model loop.
- Partial replies preserve valid fields and contradictions remain explicit.
- Durable Trip authority and proposal application remain unchanged.
- Readiness is intended to be per deliverable instance rather than a global traveler-profile flag.
- Conversation/Trip deletion is explicitly required to invalidate session values, evidence, and telemetry.

## Gate Recommendation

Do not mark the AD-39 delta ready for epic/story implementation yet. Close CL-RW-01 through CL-RW-05, then tighten the concurrency/evidence lifecycle in CL-RW-06 and re-run this scoped rubric gate. The fixes can remain within the existing modular-monolith, PostgreSQL, Retrieval, AI Orchestration, and Chat/Trips boundaries; no new service or worker is justified.
