---
title: Architecture Reviewer Gate — AD-39 Clarification Closure
reviewed: 2026-08-12
review_target: ../ARCHITECTURE-SPINE.md#AD-39
intent: validate-closure
reviewer: rubric-walker
---

# Architecture Reviewer Gate — AD-39 Clarification Closure

## Verdict

**FAIL — all prior CL-RW findings are closed, but two new Medium contract ambiguities remain.**

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 0 |
| Medium | 2 |

Mechanical Spine lint passes with zero findings.

## Prior-Finding Closure

| Prior finding | Status | Verification |
|---|---|---|
| CL-RW-01 — AD-6 ownership conflict | **Closed** | AD-39 now places persisted session, deliverable instances, values, revisions, and transitions under Chat/Trips. AI Orchestration coordinates prompts/owner ports and has no clarification repository; Retrieval owns immutable profiles, scope validation, and pure readiness evaluation (`ARCHITECTURE-SPINE.md:711-725`; `contracts.md:246-252`). |
| CL-RW-02 — mixed per-deliverable readiness | **Closed** | One parent session now contains typed instances with class, task/scope identity, pinned profile/completeness versions, independent status, assumptions, and claim state. Immutable claims include only ready instances; `CLAR-11` proves blocked siblings are excluded (`contracts.md:160-194,233-250`; `fixtures.md:39`). |
| CL-RW-03 — prose-only scope precedence | **Closed** | The versioned scope graph and pure comparator now produce closed relations. Strict ancestry/profile precedence is required; overlap is ambiguous. `CLAR-13` covers incomparable overlap and `CLAR-21` covers semantic group inheritance (`contracts.md:27-89,246-250`; `fixtures.md:41,49`). |
| CL-RW-04 — assumptions not replayable | **Closed** | Assumptions now pin instance, requirement, field, scope, typed value, policy/version, trigger, and disclosure digest. Answer claims and render manifests pin assumption IDs; omission fails closed. `CLAR-18` is executable proof (`contracts.md:115-172,233-250,488-503`; `fixtures.md:46`). |
| CL-RW-05 — clarification metrics absent | **Closed** | Gate profile now contains literal-zero clarification safety fields plus readiness accuracy, false-blocking, and clarification-burden controls. Evidence tuples pin all clarification plan/extract/scope/assumption versions; G0 rejects missing/weakened AD-39 metrics (`contracts.md:620-667`; `evaluation-and-release-gates.md:35,87-109`). |
| CL-RW-06 — CAS/evidence/lifecycle/deletion | **Closed** | Sole CAS reducer, monotonic content revision, extraction idempotency, exact UTF-16 evidence range, legal transition tables, unique active session, blocked-turn transaction, stale final fence, explicit deletion matrix, and race/evidence/failure fixtures are present (`ARCHITECTURE-SPINE.md:719-725`; `contracts.md:110-252,669-680`; `CLAR-14..20`). |

## New Medium Findings

### CL-CLOSE-01 — `clarification_plan` is called bounded, but its enforceable bounds are not owned or pinned

**Severity:** Medium  
**Rubric:** enforceability; completeness; operational cost

**Evidence**

- AD-39 permits one bounded `clarification_plan` attempt and forbids autonomous recursion (`ARCHITECTURE-SPINE.md:713,725`).
- The plan output arrays `proposedScopeNodes` and `proposedDeliverables` have no maximum counts, maximum graph depth/parent count, duplicate/coalescing cap, or bounded string/value limits (`retrieval-trip-aware/contracts.md:91-108`).
- `PlanningContextProfile.instanceDiscoveryRuleVersion` identifies a rule version, but neither the Spine nor companion states that this rule owns the numeric structural caps or that the accepted plan persists their policy/version identity.
- `CLAR-22` prevents interrogating every optional meal/activity slot, but no fixture exercises an over-limit or cyclic/explosive plan proposal.

**Why this matters**

The prompt story, validator story, database story, and evaluator can choose incompatible meanings of “bounded.” One implementation may persist hundreds of slot/group nodes while another rejects the same plan. This affects clarification burden, token/cost bounds, session row size, and deterministic replay.

**Required repair**

Assign structural bounds to one versioned instance-discovery/clarification-plan policy and pin that policy on proposal, validated graph, session, answer claim, and evaluation tuple. It should own at least maximum deliverable instances, scope nodes, graph depth/parents, values per field, and text/reference lengths; reject cycles, duplicates, orphan parents, and over-limit output. Add fixtures for over-limit/cyclic plans and deterministic coalescing.

### CL-CLOSE-02 — Companion wording still appears to transfer Usage ownership to AI Orchestration

**Severity:** Medium  
**Rubric:** ownership consistency; progressive-disclosure correctness

**Evidence**

- AD-6 assigns append-only AI usage events to Usage (`ARCHITECTURE-SPINE.md:139-153`).
- AD-39 correctly says blocked-turn and failure usage is appended through the Usage owner port (`ARCHITECTURE-SPINE.md:721-725`).
- The contracts companion says “AI Orchestration owns persisted plan/extraction-attempt identity and Usage,” immediately before later saying it coordinates owner ports (`retrieval-trip-aware/contracts.md:246`).

**Why this matters**

The authoritative Spine is correct, but the developer-facing companion can still lead a story to create direct AI-Orchestration usage writers—the exact ownership divergence AD-6 prevents. The same paragraph otherwise carefully prohibits clarification-table imports, so the ambiguity is material for implementation agents.

**Required repair**

Change the companion sentence to state that AI Orchestration owns plan/extraction-attempt identity and coordinates Usage through the Usage-owned transaction-aware port. It must not own or directly write Usage rows.

## New Semantics Review

### Bounded `clarification_plan`

The call lifecycle is otherwise coherent: it uses the existing synchronous extraction purpose; one semantic attempt is keyed by command/message/session revision/prompt version; output is untrusted; Retrieval validates it; Chat/Trips persists through its owner boundary; provider failure cannot fall through to the main answer. CL-CLOSE-01 is limited to structural/output bounds and their version identity.

### Scope-group behavior

**Pass.** `scope_group` is represented inside an immutable versioned graph. Retrieval owns proposal validation, group membership/relations, and the comparator. Later concrete nodes attach as descendants rather than copying values. Strict ancestry or explicit profile precedence is required; ambiguous overlap fails closed. `CLAR-07`, `CLAR-13`, and `CLAR-21` collectively cover sibling isolation, overlap, and late concrete binding.

## Existing-AD Compatibility

| Existing AD | Closure result |
|---|---|
| AD-6 | **Pass except companion wording in CL-CLOSE-02**. |
| AD-8 | **Pass** — planning mode and exact Trip/proposal/current-message fences remain authoritative. |
| AD-29 | **Pass** — clarification state is not durable Trip state. |
| AD-30 | **Pass** — durable changes still require owner-confirmed proposal apply. |
| AD-34 | **Pass** — only claimed ready instances and exact scoped context enter requirement generation. |
| AD-36 | **Pass** — claim, assumption, prompt-render, answer finalization, replay, and deletion fences are connected. |

## Gate Recommendation

Close CL-CLOSE-01 and CL-CLOSE-02, then perform a short document-only closure check. No new architecture direction, service, queue, worker, model purpose, or environment flag is needed.
