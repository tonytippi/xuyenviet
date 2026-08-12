# Adversarial Clarification Seam Review — Closure

Date: 2026-08-12  
Scope: repaired AD-39 plus current solution design, contracts, fixtures, and gates

## Verdict

**FAIL**

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 2 |
| Medium | 1 |

The four prior High findings and prior Medium evidence-span finding are closed. The repair introduces enough structure to make the clarification reducer safe, but two new cross-unit seams remain around plan/scope persistence and parent-session completion for mixed deliverable instances. Deletion also needs one narrow clarification for traveler-derived graphs/attempts.

## Prior Finding Closure

| Prior finding | Status | Verification |
|---|---|---|
| HIGH-1 — Applied Trip context authority/provenance | **Closed** | `PlanningContextValue.authority` distinguishes exact message evidence, applied Trip snapshot/field/version, and bounded assumption; Retrieval owns snapshot projection rules and Chat/Trips remains durable Trip authority (`contracts.md:115-135`, `:246-248`; AD-39 at Spine `:717`). |
| HIGH-2 — Concurrent/stale partial-reply reducer | **Closed** | Chat/Trips owns the sole `reduceClarificationMessage(...)` CAS port with expected session/content revisions, source ordinal, idempotency, exact fences, legal terminal rejection, and one semantic extraction attempt (`contracts.md:213-250`; Spine `:719`; `CLAR-14`). |
| HIGH-3 — Scope override ambiguity | **Closed** | Retrieval owns an immutable scope graph and comparator with explicit relations; strict ancestry/profile precedence permits override and incomparable overlap is ambiguity, not recency (`contracts.md:27-89`, `:248`; Spine `:717`; `CLAR-13`). |
| HIGH-4 — Stale ready answer finalization | **Closed** | Immutable answer claims pin session/content/scope/profile/assumptions/run; finalization revalidates every clarification fence and atomically completes claimed instances or rejects stale output (`contracts.md:233-250`, `:272-303`, `:503`; Spine `:723`; `CLAR-15`). |
| MEDIUM-1 — Exact message evidence span | **Closed** | `MessageEvidenceRef` uses source message plus zero-based UTF-16 exclusive-end range and digest; reducer validation and `CLAR-19` reject digest-only/non-matching evidence (`contracts.md:110-135`, `:196-246`; `CLAR-19`). |

## Remaining High Findings

### HIGH-1 — The validated clarification plan has no typed persistence command connecting Retrieval-owned graphs to Chat/Trips-owned sessions

**Evidence:** AI Orchestration owns `ClarificationPlanProposal`; Retrieval validates deliverable decomposition/scope nodes and owns immutable graphs; Chat/Trips must persist the validated instances and is the sole session mutation owner (`ARCHITECTURE-SPINE.md:713-719`; `contracts.md:91-108`, `:246`). However, `ReduceClarificationMessageCommand` carries only the extraction and graph version; it contains neither a validated plan result nor instance/scope-graph delta (`contracts.md:213-231`). No separate typed initialize/evolve command binds atomic creation of the graph, session, and instances.

**Two compliant units that clash:**

1. Retrieval persists a new graph, then AI Orchestration calls an undocumented Chat/Trips session-initialize command before extraction.
2. Chat/Trips overloads `reduceClarificationMessage(...)` to persist model-proposed nodes/instances after calling Retrieval inline, while Retrieval treats the graph as a pure returned value rather than its own persisted row.

They disagree on writer ownership, atomicity, IDs, retry behavior, and what survives if graph creation succeeds but session creation fails. Later concrete stays in `CLAR-21` have the same problem: the documents say they “bind as descendants,” but no fenced graph/session evolution command defines that transition.

**Required tightening:** Add typed `ValidatedClarificationPlan` output owned by Retrieval and Chat/Trips commands such as `initializeClarificationSession(...)` / `evolveClarificationPlan(...)`. Each must accept expected conversation/session revision, exact plan-attempt ID, profile/instance-discovery/scope-rule versions, immutable graph ID/version and validated instances; atomically persist or advance the Chat/Trips session with graph references, be idempotent per plan attempt, and reject stale/terminal/deleted work. Bind whether Retrieval persists the immutable graph before the command or creates it through an owner port in the same transaction. Add retry/partial-failure and later-concrete-descendant fixtures.

### HIGH-2 — Parent-session completion is undefined when only a subset of mixed deliverable instances completes

**Evidence:** One session may contain lodging, food, and activity instances; ready lodging can be claimed while blocked siblings remain (`ARCHITECTURE-SPINE.md:715`; `CLAR-11`). Instance transitions are closed, and `finalizeAiAnswer(...)` completes the claimed instances (`contracts.md:250`, `:503`). The parent session can transition `active -> completed`, but no invariant says when this happens (`contracts.md:174-194`, `:250`).

**Two compliant units that clash:**

1. Finalizing the lodging answer completes the parent session because its authoritative answer run finished; food/activity siblings become unreachable under the unique-active-session rule.
2. Finalization completes lodging only and keeps the parent active until all instances are `completed | declined`; later replies can continue food/activity.

Both honor the legal transition lists and exact claim. They produce incompatible user journeys and session uniqueness behavior.

**Required tightening:** Define parent-session aggregation explicitly. A session remains `active` while any instance is `collecting | ready | claimed` (and, if intended, resumable `declined`); it becomes `completed` only when every instance is terminal under a named terminal set, or is `superseded` on intent replacement. Finalization must update only claimed instances and recompute parent status deterministically in the same transaction. Define whether a reply after all instances complete creates a new session/instance, and add fixtures for partial completion, declined siblings, and simultaneous claims of disjoint ready instances.

## Medium Finding

### MEDIUM-1 — Deletion does not explicitly name traveler-derived scope graphs and plan/extraction attempts

AD-39 invalidates session values, evidence, assumptions, claims, and preflight telemetry, while the deletion matrix names clarification sessions/instances/values/evidence/assumptions/claims (`ARCHITECTURE-SPINE.md:723`; `contracts.md:673-680`). A per-owner `PlanningContextScopeGraph` can contain canonical target references and day/group structure, and AI Orchestration owns persisted plan/extraction attempt identity. Two owners can therefore disagree whether these immutable/diagnostic records are generic reusable configuration or reconstructable traveler content.

**Required tightening:** Classify profile templates/rules as reusable non-user configuration, but classify conversation/Trip-instantiated scope graphs, validated plan proposals, model attempts, and their target/task digests as owner-derived reconstructable rows. Add them to the Retrieval and AI Orchestration invalidators and deletion matrix; retained metrics may contain only non-content aggregates. Add deletion during plan creation and after partial instance completion fixtures.

## Mixed-Instance And Plan/Extract Assessment

- Independent readiness and exact claims for mixed instances are correctly modeled.
- Scope groups correctly avoid cloning group values globally; concrete descendants inherit only through the pinned graph/comparator.
- Plan and extraction prompts are distinct, bounded, versioned, non-recursive, and cannot declare readiness or recommendation content.
- The remaining problems are not product-policy gaps: they are the missing typed persistence seam for validated plan/graph deltas and the missing deterministic parent-session completion rule.

## Final Assessment

The repaired AD-39 is close but does not yet pass the adversarial seam gate. Close HIGH-1 and HIGH-2 before implementation-readiness approval. MEDIUM-1 should be fixed in the same contract pass because its change is small and directly affects the already mandatory deletion invariant.
