---
title: Architecture Reviewer Gate — Good-Spine Rubric Walker
reviewed: 2026-08-11
review_target: ../ARCHITECTURE-SPINE.md
intent: validate
reviewer: rubric-walker
---

# Architecture Reviewer Gate — Good-Spine Rubric Walker

## Gate Verdict

**CONDITIONAL FAIL — repair before cross-artifact implementation-readiness.** The revised Spine now covers every v6.2 outcome family and correctly establishes progressive-disclosure authority, but four shared contracts remain too incomplete for independently implemented stories to converge, and one compatibility-retirement ambiguity leaves the operational rollback envelope unsafe after cleanup.

Mechanical lint passes with zero findings when the skill's `lint_spine.py` is executed directly with Python. (`uv run` could not use its read-only cache in this review environment; this is an environment issue, not a Spine finding.)

## Review Scope

Reviewed together:

- `ARCHITECTURE-SPINE.md`;
- `README.md`;
- `retrieval-trip-aware-solution-design.md`;
- `retrieval-trip-aware/contracts.md`;
- `retrieval-trip-aware/fixtures.md`;
- `retrieval-trip-aware/evaluation-and-release-gates.md`;
- current PRD `prd.md` and `addendum.md`;
- selected brownfield implementation surfaces for `TripAnswerContext v1`, `trip_plan_items`, indexed retrieval, and the broad-query target-count trigger.

The rubric applied the BMad good-spine checklist: real divergence points, Rule enforceability, Deferred safety, brownfield ratification, driving-requirement coverage, and the project/feature operational envelope.

## High Findings

### RW-01 — The cross-stage requirement contribution is referenced but has no shared contract

**Severity:** High  
**Disposition:** Discuss, then tighten AD-34 and the contracts companion before readiness  
**Rubric:** divergence points; enforceability; v6.2 coverage

**Evidence**

- AD-34 says coverage comes from exact contributions in the final render manifest and forbids wrong-scope or wrong-leg satisfaction (`ARCHITECTURE-SPINE.md:625-635`).
- The contracts companion defines `RequirementKey`, `RequirementOutcome`, and manifests containing opaque `contributionIds`, but it never defines the contribution itself, its owning stage, or the identity/version fences it must carry (`retrieval-trip-aware/contracts.md:115-195`).
- The only semantic statement is prose: a contribution binds one atomic fact/facet assertion to one requirement and optional leg (`retrieval-trip-aware/contracts.md:154`).

**Why this is a divergence hole**

A candidate-generation story, a selector story, a final-packing story, and a provenance story can all obey AD-34 while independently choosing incompatible meanings for `contributionId`: card-level versus evidence-level, mutable card ID versus card/content/evidence revision, one ID reused across legs versus leg-specific IDs, or a web-result ID versus one atomic web fact. The final renderer then cannot reliably re-check eligibility or prove that one rendered fact satisfied exactly one need at exactly one scope.

**Required repair**

Define a shared `RequirementContribution` contract and owner. At minimum it must bind:

- immutable contribution ID and kind (`knowledge | web`);
- exact source/fact identity and owner/content/evidence or capture/projection revisions;
- one requirement key and one leg/scope identity;
- applicability and freshness decision identity;
- permitted render variant/digest;
- eligibility/revocation fence used by the final owner/version re-check.

The contract should state which module creates it, which stages may only consume it, and when a new identity is required. Add a fixture in which the same card contains two facts with different scope/freshness outcomes and only one may survive rendering.

### RW-02 — Web search is not replayable from query planning through fact-scope resolution

**Severity:** High  
**Disposition:** Tighten AD-9/AD-36 and add a typed query-plan/request contract  
**Rubric:** divergence points; enforceability; v6.2 PCR-07 coverage

**Evidence**

- PCR-07 requires replayable web-scope resolution, query minimization, and provenance mapping (`addendum.md:45`).
- AD-9 and the solution design govern immutable provider capture and post-capture fact-scoped geography decisions (`ARCHITECTURE-SPINE.md:225-237`; `retrieval-trip-aware-solution-design.md:114-124`).
- AD-36 says the chain pins a query plan, but `QueryExecutionContext` has no query-plan ID/version, minimized provider-query digest, requirement-to-query mapping, provider request-policy version, or fact-segmentation/parser version (`ARCHITECTURE-SPINE.md:647-655`; `retrieval-trip-aware/contracts.md:156-173`).
- `WebEvidenceScopeProjection` identifies `webFactId` and the whole result payload digest, but not the immutable fact text/digest or the rule version that split a provider result into atomic facts (`retrieval-trip-aware/contracts.md:199-228`).

**Why this is a divergence hole**

Search and Retrieval can independently minimize a query, batch requirements, segment result text into facts, and assign `webFactId` while still producing a valid-looking projection. The persisted capture can reproduce what the provider returned, but not why that query was sent, which private fields were excluded, how an atomic fact was derived, or whether the same fact-to-requirement decision would be rebuilt after parser changes. This leaves both privacy minimization and factual-premise replay under-specified.

**Required repair**

Add one immutable web query-plan/request manifest that binds each minimized query to requirement keys, allowed scope terms, excluded private-context classes, provider/request policy version, and request digest. Bind each web fact to an immutable fact digest plus extraction/segmentation version before geography projection. Extend `WS-06` or add fixtures that prove both same-version replay and new identities after query-policy or fact-parser changes.

### RW-03 — Route-registry publication and projection activation have ownership but no enforceable mutation boundary

**Severity:** High  
**Disposition:** Add a route-registry lifecycle/activation invariant and operational command boundary  
**Rubric:** divergence points; brownfield ratification; operational envelope

**Evidence**

- AD-35 assigns immutable registry releases and active/effective coverage assertions to Retrieval (`ARCHITECTURE-SPINE.md:637-645`).
- The contracts companion says only one validated release is active for a read mode (`retrieval-trip-aware/contracts.md:88-113`).
- Gate G1 requires registry and coverage assertions to validate and activate atomically (`retrieval-trip-aware/evaluation-and-release-gates.md:105-113`).
- The migration design says to add registry/projections but does not name a command, writer, state machine, bootstrap/rebuild owner, or failure behavior for publication (`retrieval-trip-aware-solution-design.md:134-150`).
- The operational envelope explicitly adds no new worker workload or environment flag but does not say which existing runtime seeds/builds/activates these records (`ARCHITECTURE-SPINE.md:785-798`).

**Why this is a divergence hole**

Database/schema, Retrieval, Worker, and evaluation stories can each choose a different registry authority: migration-seeded rows, an admin writer, a Worker rebuild, or deployment config. They can also disagree on whether release activation and coverage-assertion activation are one transaction, whether reads may see a release with stale projections, and what happens when validation or projection construction fails midway. Since registry state grants hard route authority, this is a safety and rollout boundary, not ordinary implementation detail.

**Required repair**

Define the smallest existing-runtime command boundary that creates, validates, activates, and rolls back a registry release plus its coverage assertions and required projections. Specify:

- sole writer and authorized caller/runtime;
- release lifecycle and immutable/effective identity;
- atomic activation fence and one-active-release invariant per read mode;
- bootstrap/rebuild behavior and fail-closed partial-failure semantics;
- audit/version record and the relationship to Trip stale-reference refresh;
- whether any operator projection is required or explicitly out of scope.

This can remain inside the modular monolith and existing Worker; no new service or queue is required.

### RW-04 — The typed gate profile cannot encode all safety criteria that AD-37 declares mandatory

**Severity:** High  
**Disposition:** Autofix the contract shape, then re-run fixture/gate reconciliation  
**Rubric:** enforceability; v6.2 coverage; release-gate ownership

**Evidence**

- AD-37 requires zero known hard-off-route contribution, unrelated-need satisfaction, hypothetical/pending-as-committed behavior, private Trip leakage, and silent required-gap omission (`ARCHITECTURE-SPINE.md:657-665`).
- The gate document additionally requires source-metadata leakage, web-scope premise safety, recent-warning/live-authority safety, provenance correctness, and provider-failure recovery (`retrieval-trip-aware/evaluation-and-release-gates.md:16-49,68-89`).
- `RetrievalGateProfile` has fields for planning-mode and several retrieval metrics but lacks fields for hard-off-route contribution, unrelated-need satisfaction, source-metadata leakage, provenance/rendered-handle correctness, web-scope misuse, recent-warning-as-live-authority, and provider-failure recovery. `operationalLimits: Record<string, number>` is an unbounded escape hatch rather than an enforceable shared contract (`retrieval-trip-aware/contracts.md:230-254`).

**Why this is an enforceability failure**

A profile can satisfy the declared TypeScript shape while omitting mandatory zero-tolerance criteria and still appear populated. Different evaluation stories can also invent incompatible keys or denominators in `operationalLimits`. The prose gate is correct, but the typed compatibility boundary does not enforce it.

**Required repair**

Make every mandatory critical criterion a required typed threshold with its metric-definition/denominator version, or use a closed discriminated metric-definition union that requires every mandatory metric ID exactly once. Keep operational limits closed/versioned as well. Add a profile-validation fixture proving that a profile missing any SC-8..12 / AC-28..33 safety criterion cannot be activated or used for a release decision.

## Medium Findings

### RW-05 — Physical compatibility retirement and post-retirement rollback are not reconciled

**Severity:** Medium  
**Disposition:** Discuss and make the lifecycle explicit in AD-38/G3  
**Rubric:** operational envelope; deferred holes

**Evidence**

- `v6_active` stops using the count trigger, while G3 later removes the historical trigger and target-count semantics (`ARCHITECTURE-SPINE.md:667-675`; `retrieval-trip-aware/evaluation-and-release-gates.md:126-138`).
- The only read-mode union is `legacy | v6_shadow | v6_active`, and G3 still requires a rollback read mode (`retrieval-trip-aware/contracts.md:159-173`; `retrieval-trip-aware/evaluation-and-release-gates.md:132-136`).

**Why it matters**

After the legacy trigger and target-count fields are physically removed, `legacy` is no longer a valid rollback target. The documents do not say whether G3 is delayed until a bounded legacy rollback window expires, whether rollback after G3 means a prior known-safe `v6_active` policy version, or whether compatibility code remains dormant. Operators and stories can therefore implement incompatible cleanup/rollback behavior.

**Required repair**

Separate behavioral cutover from physical cleanup. Define the allowed rollback target before and after cleanup, the bounded retention window for legacy code/schema if any, and the evidence that authorizes irreversible cleanup. Ensure the cutover record refers to a concrete still-runnable configuration, not only an enum label.

### RW-06 — PJ-01 is traced to an unnamed external fixture rather than one stable executable fixture

**Severity:** Medium  
**Disposition:** Add/cite stable fixture IDs before readiness  
**Rubric:** v6.2 coverage

**Evidence**

- The solution design requires PJ-01 through PJ-06 to appear in the epic map and at least one canonical fixture (`retrieval-trip-aware-solution-design.md:173`).
- The fixture mapping for PJ-01 cites `PM-04`, “existing Trip recommendation fixtures,” and `PM-01`, but no stable fixture ID proves the explicit save/continue decision and the rule that the old ordinary chat is not copied, merged, linked, or replayed into the Trip (`retrieval-trip-aware/fixtures.md:91-100`).
- AD-30A contains the correct invariant (`ARCHITECTURE-SPINE.md:549-563`), so this is an executable-proof gap rather than a missing architecture decision.

**Required repair**

Reference the exact existing fixture IDs if they already exist, or add stable fixtures for accept/decline, explicit continue/private choice, owner-scoped matching, and no transcript reconstruction. Map PJ-01 to those IDs.

## Checklist Result

| Good-spine dimension | Result | Notes |
|---|---|---|
| Real divergence points | **Fail** | Requirement contributions, web query/fact identity, and registry activation remain independently implementable in incompatible ways. |
| AD Rule enforceability | **Fail** | AD-37's mandatory gate rules cannot be completely represented by the current typed profile; AD-34 references an undefined compatibility object. |
| Deferred safety | **Pass with caution** | Listed Deferred items do not undermine v6.2, but compatibility cleanup/rollback is an unresolved operational choice and should not remain implicit. |
| Brownfield ratification | **Pass** | The design accurately ratifies `TripAnswerContext v1`, free-text Trip legs, PostgreSQL indexed retrieval, and the active target-count trigger as current reality, then defines a forward/shadow delta without pretending it is implemented. |
| v6.2 requirement coverage | **Pass at outcome level; fail at executable contract level** | PCR-01..10, PJ-01..06, FR-61..65, SC-8..12, and AC-28..33 all trace to ADs and companion sections. RW-01, RW-02, RW-04, and RW-06 prevent complete downstream proof. |
| Operational/environmental envelope | **Fail** | Core deployment/runtime constraints are present, but registry activation/build ownership and safe post-retirement rollback are not executable. |
| Named technology/current reality | **Pass for this rubric sweep** | New v6.2 work reuses verified repository technologies and adds no new named runtime dependency. Tavily remains explicitly provisional behind a required spike rather than silently ratified. |
| Mechanical spine form | **Pass** | No duplicate AD IDs, placeholders, malformed Binds/Prevents/Rule blocks, or unpinned committed stack versions were reported by lint. |

## What Is Strong

- Progressive-disclosure authority is explicit and coherent: PRD owns outcomes, the Spine owns invariants, and companions project executable details without claiming equal authority.
- AD-34 through AD-38 directly eliminate the two reported readiness blockers: required-need coverage replaces card-count sufficiency, and the fewer-than-three trigger is compatibility-only.
- Planning-mode isolation, owner-confirmed Trip mutation, route-resolution states, safe partial/outside-coverage behavior, deletion propagation, and release ownership are all represented with stable ADs and canonical fixture families.
- Brownfield delta is unusually honest: it names current code limitations and requires migration/shadow/cutover rather than describing v6.2 as already present.
- The operational envelope preserves the project's simplicity constraint: no microservice, new queue, new worker workload, or new environment flag is introduced merely for v6.2.

## Readiness Recommendation

Do not run the cross-artifact readiness gate as a final pass yet. Repair RW-01 through RW-05, anchor PJ-01 to stable fixtures, then update the Epic coverage map and Story 4.5. After those changes, the Architecture package should be re-linted and re-walked before `bmad-check-implementation-readiness` decides the whole PRD–Architecture–Epics package.
