# Adversarial Architecture Seam Review

Date: 2026-08-11
Target: `ARCHITECTURE-SPINE.md`
Lens: Construct independently built units one level below the Spine that each obey every applicable AD literally, then test whether the units can still disagree on shared data, mutation authority, state transitions, deletion, or release behavior.

## Verdict

**High-risk seams remain.** The v6.2 Spine now binds the product outcomes and most domain invariants, but it still allows incompatible implementations at the execution-finalization, route-staleness, deletion, and release-control boundaries. The most serious pattern is that AD-34 through AD-38 name the records and desired properties without assigning a single writer and atomic command boundary to several cross-module state transitions.

The progressive-disclosure companions reduce implementation ambiguity, but they do not close a Spine-level seam when two implementations can obey every AD and choose different authorities. The companion rule that the Spine wins makes these missing invariants especially important to promote into an AD rather than leaving them as prose or fixture expectations.

## High Findings

### H1. Retrieval-run finalization has no single command owner or atomic persistence boundary

**Evidence:** AD-6 assigns command ownership for Chat/Trips, Search web results, AI Orchestration provenance, Usage, Feedback/Eval, and other aggregates, but does not assign `retrieval_runs`, requirement outcomes, selection manifests, prompt-render manifests, or web-scope decisions (`ARCHITECTURE-SPINE.md:133-147`). AD-9 assigns web capture to Search and projection/decision creation to Retrieval (`:225-233`). AD-11 requires the orchestrator to persist provenance and the assistant message in one transaction (`:261-271`). AD-16 says the final message, retrieval decision, provenance, and usage are persisted “through the orchestrator” (`:321-331`). AD-36 requires one replayable chain but specifies identity rather than the writer/finalization transaction (`:647-655`).

**Two compliant units that clash:**

- Retrieval implements a stateful `executeRetrievalRun` command, writes run/outcome/selection/render rows in its own transaction, then returns a manifest ID. AI Orchestration later writes the message and provenance in its required transaction.
- AI Orchestration treats Retrieval as a query service, owns the run and both manifests, and writes them while finalizing the assistant message; Retrieval writes only web-scope projections and returns candidate decisions.

Both honor the named domain owners and replay requirements. They cannot agree on repository ownership, transaction composition, retry/idempotency keys, or what to do when streaming/model completion succeeds but one persistence step fails. The first can leave an orphan finalized run with no response; the second makes Orchestration a writer of Retrieval state despite AD-5/AD-6 boundaries.

**Required tightening:** Add one AD rule naming the writer for every v6.2 execution entity and one server command that finalizes a run. Define whether final render manifest, response provenance, and assistant message commit in one PostgreSQL transaction, or define an explicit staged state/idempotent recovery protocol. State which module owns retries and which terminal states may exist without a completed assistant message.

### H2. Read-mode cutover and rollback have multiple possible authorities

**Evidence:** AD-37 says “Retrieval and owning modules” execute shadow/cutover/rollback while Product approves (`:657-665`), but AD-6 assigns neither read-mode nor cutover-record mutation to a command module (`:133-147`). The Operational Envelope permits the read mode and records to live in “PostgreSQL/config ownership” (`:785-795`). AD-36 only requires each run to pin whatever read mode it observed (`:647-655`).

**Two compliant units that clash:**

- The API reads a database-owned active-mode row at run start; a Retrieval command atomically changes it and writes the cutover record.
- Each runtime reads a versioned deployment config at startup; the deployment pipeline changes the config after Product approval, while Feedback/Eval stores a report independently.

Both produce versioned, pinned read modes and a recorded approval. During a rolling deployment or emergency rollback, API replicas, workers, and evaluation jobs can select different modes with no AD violation. There is also no compare-and-swap fence preventing two approved reports or an old operator action from changing the active mode.

**Required tightening:** Choose one source of truth and one owning command for active read mode and cutover/rollback records. Require a compare-and-swap from expected current mode/policy version, the exact passing gate-report ID and approval, an atomic new-mode/cutover record, and run-start pinning. Config may cache or seed that authority but must not become a second writer.

### H3. `v6_shadow` and compatibility retirement do not have binding runtime semantics

**Evidence:** AD-38 allows the fewer-than-three trigger in `legacy` and `v6_shadow`, prohibits it in `v6_active`, and requires a retirement/cutover record (`:667-675`). It does not state which path supplies the traveler answer in `v6_shadow`, whether the shadow may invoke Search/model providers, or whether shadow writes normal provenance/usage. The companion solution design says shadow is side-effect-free and cannot change answers, but that behavior is not an AD. AD-38 also permits a rollback read mode after retirement without binding how long the retired trigger/config must remain executable.

**Two compliant units that clash:**

- `v6_shadow` serves the legacy answer and computes only bounded v6 comparison telemetry without external calls.
- `v6_shadow` serves the v6 answer, runs the legacy card-count trigger as a parallel compatibility comparator, and permits its web calls because AD-38 says the trigger “may run.”

Both can claim shadow comparison and keep card count subordinate to requirement coverage. They differ in traveler behavior, cost, privacy exposure, provenance, and evidence validity. At retirement, one team can delete the target-count configuration immediately while another keeps the full legacy path indefinitely for rollback; both can name a rollback mode, but only one can execute it.

**Required tightening:** Promote the companion shadow invariant into AD-38: legacy remains the sole traveler-authoritative path in `v6_shadow`; shadow performs no provider call, traveler mutation, prompt usage/provenance, or response selection. Bind a retirement sequence separating behavioral disablement from physical removal, name an executable rollback target that does not require removed schema/config, and define the retention/revisit condition for deleting compatibility code.

### H4. An applied Trip path can be either durable authority or stale unusable state after registry retirement

**Evidence:** AD-29 makes an owner-confirmed path plus registry snapshot durable Trip authority and says Retrieval validates registry identities (`:511-527`). AD-30 rejects stale or retired references when applying a new route choice (`:531-547`). AD-35 resolves against an exact registry snapshot but also speaks of active/effective coverage assertions and does not define the status of a previously applied path whose immutable registry release later becomes inactive (`:637-645`).

**Two compliant units that clash:**

- Chat/Trips returns the stored owner-confirmed path as durable authority; Retrieval emits `authoritative_selected` against its immutable historical snapshot even after that release is retired.
- Retrieval requires the Trip snapshot’s registry release to remain active/compatible; after retirement it downgrades the leg to `known_partial` or `no_path` and asks the traveler to review/refresh.

Both preserve the Trip record, never silently replace the path, and use an exact snapshot. They disagree on hard positive/negative route authority, required-need satisfaction, and which fixture state to emit. The companion fixture requires safe review/refresh but does not choose a canonical `RouteResolutionState`, so independently built read models still cannot interoperate.

**Required tightening:** Define the post-apply registry lifecycle invariant in AD-35: whether historical selected paths retain, lose, or conditionally retain hard authority; the exact resolution state/reason code when a referenced release is retired or incompatible; whether coverage assertions are evaluated from the historical or current active release; and the only owner-confirmed command that refreshes the stored choice.

### H5. Owner deletion crosses five aggregate owners without an orchestration or completion contract

**Evidence:** AD-6 makes Chat/Trips the deletion command owner while AI Orchestration, Retrieval, Search, Feedback/Eval, and Usage own dependent rows and bars cross-aggregate generic writes (`:133-147`). AD-13 requires conversation/Trip deletion to invalidate messages, context, runs, web-scope decisions, prompt manifests, snapshots, projections, and derived content, and prevents retained data from reconstructing traveler content (`:285-299`). AD-36 applies deletion/retention to traveler-derived execution payloads (`:647-655`). Feedback/Eval may link results to assistant responses/provenance (`:779-783`). No rule binds synchronous visibility, cascade ownership, idempotent continuation, or evaluation-sample handling.

**Two compliant units that clash:**

- Chat/Trips performs one database transaction using cascading foreign keys across Retrieval and Orchestration tables, immediately erasing all reconstructable content.
- Chat/Trips soft-deletes the owner aggregate, then calls exported per-module invalidation commands asynchronously; Feedback/Eval tombstones linked samples while Search retains deduplicated provider captures.

Both can make deleted content unavailable to normal retrieval and eventually invalidate the named records. They cannot share foreign-key behavior, failure recovery, deletion completion semantics, or a definition of when the user-visible delete has actually satisfied the non-reconstruction requirement. An interrupted fan-out can leave private execution data reconstructable even though the Trip is already hidden.

**Required tightening:** Bind one deletion coordinator and one completion invariant. Enumerate dependent owners and require either a single transaction for all reconstructable rows or an idempotent deletion state machine that immediately fences all reads and cannot report completion until every owner acknowledges invalidation. Specify whether provider captures can be shared/retained, how provenance is tombstoned, and how production-derived evaluation membership is removed without retaining question/answer/Trip content.

### H6. The web-scope authorization chain is not bound to a single persisted identity

**Evidence:** AD-9 requires an immutable fact-scoped projection and a query-specific decision for every requirement/leg (`:225-233`). AD-17 limits authority to the exact atomic fact/facet and requirement/leg (`:335-349`). AD-36 requires web facts, contributions, selection, rendering, and provenance to form one replayable chain (`:647-655`). However, the core persisted entity list names `web_evidence_scope_projections` but not a query-specific decision entity (`:717-727`), and AD-11 provenance identifies a web result and source snapshot without requiring a web fact/assertion/scope-decision reference (`:261-271`).

**Two compliant units that clash:**

- Retrieval persists a first-class `web_evidence_scope_decision` row, and a rendered contribution/provenance row references that decision.
- Retrieval stores decisions inside the run/selection manifest, while provenance references only the provider result and copies a safe snapshot.

Both record a decision and retain bounded replay data. The second implementation cannot provide the same referential proof that one exact fact was authorized for one requirement/leg, especially when one provider result contains facts for multiple places or routes. UI, Eval, and audit consumers cannot use a common key or withdrawal path.

**Required tightening:** Make the query-specific web-scope decision a first-class persisted contract (or explicitly bind an immutable embedded identity), and require the chain `web result capture -> fact assertion/projection -> requirement/leg decision -> contribution -> render manifest -> provenance`. Specify which ID a web `selectedItemsInOrder.itemId` represents and require same-run/requirement/leg validation.

## Medium Findings

### M1. Requirement-key identity and granularity can diverge under the same profile version

AD-34 fixes the vocabulary, fields, and final outcome states (`:625-635`), but it does not bind deterministic key identity/cardinality for repeated needs. One planner can produce one route-wide `warning` requirement; another can produce one per leg or constraint. Both consume the same facet vocabulary and materialize keys before candidates, yet coverage percentages, packing priority, and “silent omission” cohorts are not comparable. The companion type exposes an opaque string `id` and does not define canonical derivation.

Tighten the intent-profile contract so a profile version owns deterministic expansion/granularity, canonical scope identity, duplicate coalescing, and stable requirement-key derivation. A changed generation rule must create a new profile version.

### M2. Gate evidence is immutable, but activation eligibility under changing dependencies is underspecified

AD-37 pins each gate result to configurations and profile (`:657-665`), while AD-35 permits active route releases/assertions to evolve (`:637-645`). One release implementation can approve cutover when every individual run is pinned even if the evidence window spans multiple registry/runtime versions; another can require the complete evidence window to share one identical dependency tuple. Both preserve replayability, but they evaluate different systems.

Bind the aggregation rule: a cutover report may count evidence only from one exact comparable configuration tuple, or it must define an approved stratified aggregation contract. Any change to read mode, registry/coverage revisions, requirement vocabulary/profile, eligibility/ranking/selector/runtime policy, or relevant code revision must restart or explicitly partition the evidence window.

## Seam Coverage Summary

| Requested seam | Result |
|---|---|
| Shared-data shapes | Hole: web-scope decision identity and requirement-key derivation |
| State mutation paths | Hole: retrieval-run finalization and read-mode activation owners |
| Required-need coverage | Mostly bound; deterministic requirement granularity remains open |
| Trip path ownership | Owner is clear; stale/retired snapshot semantics are not |
| Web-scope replay | Projection exists; end-to-end authorization linkage is not binding |
| Evaluation gates | Data owner is clear; evidence comparability and activation command are not |
| Compatibility retirement | Gate exists; shadow authority and executable rollback lifecycle are not bound |
| Deletion | Intended effects are clear; cross-owner completion protocol is not |
| Cutover/rollback | Approval is clear; source of truth, CAS, runtime convergence, and physical retirement order are not |

## Recommended Spine Fix Order

1. Bind read-mode/cutover authority and `v6_shadow` semantics before any shadow story is considered ready.
2. Bind the retrieval-run finalization writer/transaction and web-scope decision identity before schema/API stories split across modules.
3. Bind deletion coordination before production-derived shadow/evaluation data is retained.
4. Bind retired Trip-path semantics before route fixtures become implementation acceptance tests.
5. Make requirement-key derivation and gate evidence comparability versioned invariants before the first numeric gate profile is approved.
