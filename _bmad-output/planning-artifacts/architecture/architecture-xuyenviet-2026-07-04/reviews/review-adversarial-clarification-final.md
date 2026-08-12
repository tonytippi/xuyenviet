# Adversarial Seam Review — AD-39 Clarification And Scoped Context

Date: 2026-08-12  
Scope: current Spine, retrieval/Trip-aware solution design, contracts, fixtures, and release gates  
Lens: construct independently built AI Orchestration, Retrieval, and Chat/Trips units that obey the written contracts yet can still disagree on shared state, reducer results, scope authority, answer admission, or deletion.

## Verdict

**FAIL**

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 4 |
| Medium | 1 |

AD-39 defines the intended user behavior well, but it does not yet fully bind the machine seams required for independently implemented clarification stories. Deletion is closed; the remaining risks are ownership/provenance, concurrent reduction, scope precedence, and the readiness-to-answer fence.

## High Findings

### HIGH-1 — Applied Trip context has no canonical field-level owner/provenance representation in the clarification input

**Evidence:**

- AD-39 assigns immutable profiles and completeness evaluation to Retrieval, session/extraction/reduction to AI Orchestration, and durable Trip state to Chat/Trips (`ARCHITECTURE-SPINE.md:711-719`).
- `CLAR-04` requires preflight to consume vehicle and party values from the exact applied Trip snapshot without asking again (`retrieval-trip-aware/fixtures.md:32`).
- `ClarificationFieldState` can identify only a message source (`sourceMessageId`, `evidenceTextDigest`, extraction prompt); it has no source discriminator or exact Trip snapshot field reference (`retrieval-trip-aware/contracts.md:55-64`). The session pins one overall Trip snapshot/version, but the contract does not say who maps its fields to requirement instances or whether Trip-derived values become session field states (`:66-85`).

**Two compliant units that clash:**

1. AI Orchestration reads the Chat/Trips snapshot, converts Trip values into `resolved` session fields with null message evidence, then asks Retrieval to evaluate those fields.
2. AI Orchestration persists only message-derived fields; Retrieval receives the pinned Trip snapshot separately and overlays its values during completeness evaluation.

Both respect the named owners and `CLAR-04`, but they disagree on the evaluator input, replay shape, invalidation, conflict handling when a later message contradicts the Trip, and whether a Trip-derived value survives after the pinned snapshot becomes stale.

**Required tightening:** Define one normalized `PlanningContextValue` authority union, for example `message_evidence | applied_trip_snapshot | bounded_assumption`, with exact source identity. Bind the owner that projects applied Trip fields into profile requirement instances and whether that projection is persisted in the session or passed as a separate immutable evaluator input. Require exact Trip snapshot/field references and deterministic conflict behavior: a conversational value may affect the current deliverable but never rewrite or masquerade as applied Trip authority.

### HIGH-2 — The natural-language partial-reply reducer is version-fenced but not an atomic CAS command

**Evidence:**

- AD-39 says AI Orchestration owns one conversation-bound session, reduces each new message, and version-fences the session by conversation revision/current message/profile/Trip/proposal references (`ARCHITECTURE-SPINE.md:713-719`).
- The session carries `revision`, `conversationRevision`, and `currentMessageId`, but no mutation command or expected-revision transition contract is defined (`retrieval-trip-aware/contracts.md:66-100`).
- The prose says omissions preserve earlier resolved values and contradictions remain explicit (`:103-105`), but does not bind source-message ordering, duplicate-message idempotency, or stale reducer-result behavior.

**Two compliant units that clash:**

1. Two replies are extracted concurrently from session revision 4. Each reducer writes its complete materialized field-state array; last write wins and loses the other reply.
2. Each reducer appends a per-message delta and recomputes from ordered deltas; both replies survive, with a contradiction becoming `ambiguous`.

Both can claim that each extraction used the pinned revision and preserved valid fields locally. They produce different next questions/readiness, and a slow extractor result for an earlier message can overwrite a newer `ready`, `superseded`, or deleted state.

**Required tightening:** Name one AI Orchestration command such as `reduceClarificationMessage(...)` with owner/conversation/session IDs, source message ID/order, expected session revision, and all planning/profile fences. In one transaction it must reject or deterministically rebase stale work, enforce one reduction per source message, preserve terminal/deleted states, append or merge only validated deltas, run the pinned Retrieval evaluator, and advance the session revision. Add concurrent, duplicate, out-of-order, and slow-extractor fixtures.

### HIGH-3 — “Narrower compatible scope” is not a deterministic relation for overlapping scope kinds

**Evidence:**

- AD-39 permits journey, day range, leg, place, stay, meal, activity, and deliverable scopes and says a narrower compatible value wins only in its scope (`ARCHITECTURE-SPINE.md:717`).
- The contract repeats “exact subtree” precedence but defines scopes only as an unconnected union; it provides no parent graph, containment relation, overlap rule, or tie-breaker (`retrieval-trip-aware/contracts.md:27-35`, `:103-105`).

**Two compliant units that clash:**

For a meal on leg L2, at place P, on day 4, one unit treats `meal` as narrower than `day_range`; another treats the two as intersecting peers because neither structurally contains the other. If values conflict, one selects the meal value while the other marks ambiguity or selects the latest message. Similar incompatibility exists among leg/place/stay/deliverable scopes.

Both preserve siblings and avoid promoting narrow values journey-wide. They still produce different profile readiness and retrieval requirements for the same persisted session.

**Required tightening:** Make the profile own a versioned scope graph/resolver that maps every deliverable instance to exact scope memberships. Define containment/overlap, applicability, precedence, and conflict rules. Narrow override should require strict containment or an explicit profile precedence relation; overlapping incomparable scopes must resolve by a declared rule or become `ambiguous`, never by recency or implementation convention. Add intersecting day/leg/place/stay/meal fixtures.

### HIGH-4 — A ready clarification revision is checked at retrieval admission but not at terminal answer finalization

**Evidence:**

- `PlanningExecutionRef.clarificationRef` pins session ID/revision/profile and ready deliverable instances; profiled retrieval requires a ready or permitted-assumption revision (`retrieval-trip-aware/contracts.md:125-152`).
- The terminal stale-output rule explicitly names only Trip/proposal fences (`:152`).
- AD-39 allows later messages to supersede, contradict, decline, or otherwise advance the session, and says transition to main synthesis begins at ready (`ARCHITECTURE-SPINE.md:715-719`). The existing `finalizeAiAnswer(...)` fence does not explicitly revalidate the clarification session/revision before committing the answer.

**Two compliant units that clash:**

1. Retrieval starts from ready revision 5. A new traveler message creates revision 6 and changes intent, but the revision-5 detailed answer later finalizes because its original `clarificationRef` was valid when prepared.
2. Finalization rechecks session status/revision/current-message fence and discards or safely refreshes the stale answer.

Both obey “begin only at ready”; they disagree on whether an obsolete detailed itinerary may appear after a newer traveler message.

**Required tightening:** Include the clarification session ID/revision, conversation revision/current-message fence, profile version, ready deliverable IDs, and bounded-assumption identities in the shared prepare/finalize idempotency fence. Revalidate them immediately before final commit. Any changed, superseded, declined, completed-by-another-run, or deleted session must prevent the stale main answer from committing and return a safe refresh/retry outcome. Define the atomic transition from `ready` to `completed` and whether exactly one authoritative answer run may claim a ready deliverable instance.

## Medium Finding

### MEDIUM-1 — Message evidence is described as an exact span but the shared shape stores only text/digest

AD-39 requires an exact source-message evidence reference; the solution says exact evidence-backed validation. `ClarificationExtraction` stores `evidenceText`, and `ClarificationFieldState` stores only its digest, with no UTF-16/code-point offsets or unique normalized-match rule (`retrieval-trip-aware/contracts.md:55-100`). Repeated phrases can therefore validate to different occurrences, and later reviewers cannot reproduce which characters supported the value.

Define the same kind of deterministic range contract already used by answer annotations: source message ID plus explicit offset convention, exclusive end, exact substring/digest, and unique validation. Reject no-match/mismatch; repeated identical text remains valid only with exact offsets.

## Closed Areas

### Ownership of durable Trip mutations — closed

AI Orchestration owns clarification session/extraction workflow; Retrieval owns profiles and the pure evaluator; Chat/Trips remains the only durable Trip writer. Clarification values cannot directly mutate Trip route, constraint, stay, meal, or activity state (`ARCHITECTURE-SPINE.md:711-719`). The remaining HIGH-1 concerns the read/projection seam, not mutation authority.

### Partial reply product behavior — closed at intent level

Omitted fields do not erase prior resolutions; only validated fields merge; contradiction/ambiguity/refusal remain explicit; unresolved material fields block only dependent deliverable instances; no autonomous self-prompt loop is allowed (`ARCHITECTURE-SPINE.md:713-715`; contracts `:103-105`; `CLAR-01`–`CLAR-09`). HIGH-2 is the missing concurrency-safe execution contract.

### Deletion — closed

AD-39 explicitly invalidates sessions, extracted values, evidence references, and derived preflight telemetry with the owning conversation or Trip (`ARCHITECTURE-SPINE.md:719`). This composes with the Chat/Trips single-transaction deletion coordinator and AI Orchestration invalidator under AD-13 (`:291-307`). `CLAR-10` verifies the intended result. No separate high-risk deletion seam remains.

### Release gate coverage — adequate but must include the new seam fixtures

The critical-authoritative cohorts and G2 already require clarification readiness, partial-reply, contradiction, and scoped-preference safety (`retrieval-trip-aware/evaluation-and-release-gates.md:20-35`, `:125-136`). Before PASS, the fixture set should additionally exercise concurrent/stale reducer writes, Trip-derived field provenance, intersecting scope kinds, and stale-ready answer finalization.

## Final Assessment

AD-39 should not pass the mandatory architecture seam gate yet. The product policy is coherent, but independent teams can still implement incompatible reducer state, scope resolution, Trip-context projection, and answer-finalization behavior while following the current prose. Close HIGH-1 through HIGH-4 in the Spine/contracts and add their fixtures; MEDIUM-1 can be closed alongside the reducer contract without expanding the architecture beyond this slice.
