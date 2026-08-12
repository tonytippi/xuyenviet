# Adversarial Seam Review — AD-40 Persistent Chat-To-Trip Conversion

Date: 2026-08-12  
Scope: current Spine, retrieval/Trip-aware companions, `TC-*` fixtures, evaluation gates, and RTA-13

## Verdict

**FAIL**

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 4 |
| Medium | 1 |

AD-40 closes the major product-safety boundaries: the command reuses `acceptTripCreationRecommendation(...)`, never trusts the browser’s old manifest, copies no transcript, creates one separate Trip and primary conversation, and leaves every transferred value behind the pending-proposal Apply boundary. However, independently built Chat/Trips, clarification, and presentation units can still disagree on the latest-context candidate set, opportunity transitions, disabled CTA projection, and idempotent deletion/replay behavior.

## High Findings

### HIGH-1 — “Latest context” is not deterministic across multiple completed clarification sessions and claims

**Evidence:** A manifest pins exact completed clarification claims, deliverable instances, and scoped value IDs; construction is deterministic once its inputs are selected (`ARCHITECTURE-SPINE.md:735`; `contracts.md:316-346`, `:391`). AD-39 permits completed instances/sessions to be followed by new instances/sessions for later requests (`ARCHITECTURE-SPINE.md:723`; `contracts.md:302`). Neither AD-40 nor `TripConversionProjectionPolicy` defines which completed claims from the ordinary conversation form the current conversion input, how a newer completed value supersedes an older value at equal scope, or how compatible completed instances from different sessions are accumulated.

**Two compliant units that clash:**

1. One implementation selects only claims associated with the most recently completed useful answer.
2. Another accumulates all non-superseded completed claims in the conversation and applies field/scope precedence, potentially retaining older route/lodging values alongside newer ones.

Both can produce a deterministic manifest from their chosen set and pin exact IDs. They can create materially different Trip seeds/proposals for the same visible CTA.

**Required tightening:** Make `TripConversionProjectionPolicy` own a versioned current-context selection/reduction rule over all eligible conversation claims: exact ordering/fence, session/instance terminal eligibility, supersession, equal-scope replacement, cross-session accumulation, and conflict-to-suspension behavior. Persist one canonical conversion-context projection/revision that the manifest references. Add a fixture where a later completed request changes dates, vehicle, direction, or a same-scope preference after an earlier completed conversion-worthy answer.

### HIGH-2 — Opportunity lifecycle and dismissal are not a closed CAS state machine

**Evidence:** Status is `eligible | suspended | dismissed | consumed | invalidated`, and prose says material changes refresh, suspend, invalidate, or permit re-offer after a decline (`contracts.md:309-355`, `:389-393`; AD-30A at Spine `:569`; AD-40 at `:733-741`). There is no legal transition table, no typed dismiss command, no expected opportunity/manifest/content revision, and no deterministic distinction between `suspended` and `invalidated`.

**Two compliant units that clash:**

1. Dismissal permanently terminalizes the opportunity and a material change creates a new opportunity ID.
2. Dismissal preserves the stable opportunity ID and a material change transitions it back to `eligible` with a new manifest.

A concurrent click/dismiss/context-refresh can therefore consume a CTA another implementation considers dismissed, lose a valid re-offer, or create two “current” opportunities despite the one-open invariant.

**Required tightening:** Define the complete state machine and one Chat/Trips transition owner. Add typed `dismissTripCreationRecommendation(...)` and manifest-refresh/suspension transition inputs with expected opportunity version, current manifest ID, content revision, and material-context fingerprint. Specify which states are terminal, when the same opportunity can reactivate, when a new opportunity ID is required, and how accept/dismiss/refresh/delete races serialize under the same conversation/opportunity lock. Add transition/race fixtures.

### HIGH-3 — “Visible but non-actionable” CTA cannot be represented by the shared projection

**Evidence:** AD-40 and the contracts allow the eligible CTA to remain visible but non-actionable while a newer traveler turn is unterminalized (`ARCHITECTURE-SPINE.md:737`; `contracts.md:391`; `TC-11`). Yet `TripConversionProjection` exposes only `none`, `suspended`, or `eligible` with an action; the eligible shape has no actionability/pending-revision discriminator (`contracts.md:357-365`). The accept revalidation list names content/claims/profile/scope/policy/deletion but does not explicitly model the pending AI Ask command or turn-terminalization fence (`:393`).

**Two compliant units that clash:**

1. The server keeps returning `eligible`; the browser locally disables the CTA from streaming/request state.
2. The server projects `suspended` during the pending turn and re-enables after terminalization.

The first is vulnerable to another client/tab invoking the action; the second changes status/lifecycle for a condition described as presentation-only. Both conflict with part of the current language.

**Required tightening:** Make server projection authoritative with an explicit visible-disabled state or `eligible { actionable: false, blockedByContentRevision/commandId }`. Bind “newer turn pending” to the monotonic conversation content revision plus the authoritative AI Ask command terminal state, and require `acceptTripCreationRecommendation(...)` to reject while that fence is pending even from another client. Pending-turn disablement must not create dismissal or change durable opportunity eligibility. Add cross-tab and pending-failure fixtures.

### HIGH-4 — Manifest identity pins only digests, not a canonical typed conversion payload or recomputation rule

**Evidence:** `TripConversionManifest` stores `tripSeedDigest` and `proposalOperationsDigest`, while `TripConversionProjectionPolicy` maps field keys to an untyped `operationKind` string (`contracts.md:316-346`). AD-40 says the manifest contains bounded operations and the conversion transaction creates a proposal from operations “represented by” or “derived from” the manifest (`ARCHITECTURE-SPINE.md:735-739`; contracts `:393`). The type does not carry the bounded Trip seed/proposal operation union, nor explicitly require canonical recomputation and byte-for-byte digest verification at click.

**Two compliant units that clash:**

1. Manifest rows store hidden JSON operations beside the typed fields and click uses that immutable payload.
2. Manifest rows store only digests; click reprojects current scoped values through the pinned policy/schema.

Both pin policy/schema and validate the digest conceptually, but they differ on replay after source-value supersession/removal, schema decoding, audit, and whether the initial proposal is exactly what the user’s eligible CTA represented.

**Required tightening:** Add a closed canonical `TripConversionPayload` containing bounded Trip seed fields and the existing typed proposal-operation union, or bind canonical deterministic reprojection from the exact immutable value IDs with mandatory digest equality. Version canonical serialization, validate every operation against the pinned proposal schema before eligibility and again before creation, and fail closed on missing values/schema/serialization mismatch. `operationKind` must be the closed proposal-operation discriminator rather than an arbitrary string.

## Medium Finding

### MEDIUM-1 — Idempotency replay after failed attempts and source/destination deletion is ambiguous

AD-40 promises replay of the same terminal destination/proposal for the same owner/key/request digest, says a different digest fails, and invalidates replayable **nonterminal** results on source-conversation deletion (`ARCHITECTURE-SPINE.md:741`). The command carries no request digest (`contracts.md:367-386`), failure results are not classified terminal/nonterminal, and behavior is not defined when the original conversation is deleted after success or when the created Trip/proposal is later deleted.

One implementation can replay a success after source deletion while the Trip exists; another can return `not_found`. One can burn an idempotency key on `refresh_required`; another can permit retry against the newly eligible manifest. Both fit the current text.

**Required tightening:** Define the server-derived request digest inputs (at least owner, opportunity, resolved manifest digest, command version), terminality of every result reason, and key reservation lifecycle. Persist terminal success independently of reconstructable source context with tombstone-safe authorization. Specify replay after source conversation deletion, and return a safe deleted-destination result rather than a live destination if the created Trip/proposal was deleted. Add fixtures for refresh-then-retry, delete-source-after-success, delete-Trip-before-replay, and same key across advanced manifests.

## Closed Boundaries

### Clarification readiness and assumption isolation — closed

Only completed clarification claims and validated explicit scoped values can contribute. Blocked, ambiguous, unresolved, and assumption-only operations are excluded, and at least one supported operation is required (`ARCHITECTURE-SPINE.md:733-739`; `contracts.md:391`; `TC-04`, `TC-12`).

### Proposal/apply authority — closed

Conversion atomically creates exactly one Trip, a separate primary conversation, and one initial `pending` proposal. No transferred value becomes applied Trip state until the existing owner-confirmed `applyApprovedTripChange(...)` boundary succeeds (`ARCHITECTURE-SPINE.md:571`, `:739`; `TC-06`).

### Transcript isolation — closed

The original conversation stays ordinary and separate; messages, assistant prose, prompts, provider payload, reasoning, ambiguous values, and unresolved context are neither copied nor linked (`ARCHITECTURE-SPINE.md:739`; `contracts.md:393`; `TC-07`).

### `continueInTrip(...)` behavior — closed

The existing command remains an owner-authorized URL/scope switch to an existing Trip’s primary conversation and performs no import or proposal creation. AD-40 conversion does not overload it (`ARCHITECTURE-SPINE.md:573`, `:741`; `TC-10`; RTA-13).

### Core conversion atomicity — closed except for the idempotency replay detail above

Owner/conversation/opportunity locking, latest-manifest server resolution, stale-content revalidation, one Trip/primary-conversation/proposal transaction, opportunity consumption, and no duplicate successful conversion are clearly required (`ARCHITECTURE-SPINE.md:737-741`; contracts `:393`; `TC-03`, `TC-06`, `TC-08`, `TC-09`).

## Final Assessment

AD-40 should not yet pass the adversarial architecture seam gate. Close HIGH-1 through HIGH-4 before story readiness so “latest context,” CTA lifecycle, disabled-state admission, and the exact pending proposal payload cannot diverge across independently implemented units. MEDIUM-1 should be resolved in the same contract pass because it controls retry and deletion behavior already promised by RTA-13.
