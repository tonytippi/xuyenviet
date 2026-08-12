---
title: Retrieval And Trip-Aware Contracts
status: final
updated: 2026-08-12
source_spine: ../ARCHITECTURE-SPINE.md
---

# Retrieval And Trip-Aware Contracts

## Contract Rules

These shapes define compatibility between independently built stories. Names may map to project naming conventions during implementation, but their semantics, owners, discriminators, version identity, and fences are binding under AD-8, AD-29, AD-30, and AD-34 through AD-40.

All shared types belong in the existing shared contracts/domain boundaries. Database repositories may use persistence-specific rows, but browser and feature modules must not invent parallel variants.

## Multi-Turn Clarification And Scoped Context

```ts
type PlanningDeliverableClass =
  | "multi_day_itinerary"
  | "route_comparison"
  | "accommodation"
  | "food"
  | "activity"
  | "general_planning";

type PlanningScopeKind =
  | "journey"
  | "day_range"
  | "leg"
  | "place"
  | "stay"
  | "meal"
  | "activity"
  | "scope_group"
  | "deliverable";

type PlanningContextScopeRef = {
  graphId: string;
  graphVersion: string;
  nodeId: string;
};

type PlanningContextScopeNode = {
  id: string;
  kind: PlanningScopeKind;
  canonicalTargetRef: string;
  parentIds: string[];
  coveredDayRange: null | { startDay: number; endDay: number };
};

type PlanningContextScopeGraph = {
  id: string;
  version: string;
  ownerScopeId: string;
  clarificationPlanPolicyVersion: string;
  nodes: PlanningContextScopeNode[];
  relationRuleVersion: string;
  relations: Array<{
    leftNodeId: string;
    rightNodeId: string;
    relation:
      | "equal"
      | "ancestor"
      | "descendant"
      | "overlap"
      | "sibling"
      | "unrelated";
  }>;
};

type PlanningContextProfileField = {
  key: string;
  valueSchemaVersion: string;
  materiality: "hard_required" | "conditional" | "optional";
  allowedScopes: PlanningScopeKind[];
  applicabilityRuleId: string;
  validationRuleId: string;
  precedenceRuleId: string;
  safeAssumptionPolicy: "forbidden" | "traveler_visible";
};

type PlanningContextProfile = {
  id: string;
  version: string;
  deliverableClass: PlanningDeliverableClass;
  fields: PlanningContextProfileField[];
  instanceDiscoveryRuleVersion: string;
  completenessRuleVersion: string;
};

type ClarificationPlanPolicy = {
  version: string;
  maximumDeliverableInstances: number;
  maximumScopeNodes: number;
  maximumGraphDepth: number;
  maximumParentsPerNode: number;
  maximumValuesPerField: number;
  maximumCanonicalRefChars: number;
  maximumTaskIdentityChars: number;
};

type ClarificationPlanProposal = {
  attemptId: string;
  aiAskCommandId: string;
  sourceMessageId: string;
  promptVersion: string;
  clarificationPlanPolicyVersion: string;
  expectedSessionRevision: number;
  proposedScopeNodes: Array<{
    kind: PlanningScopeKind;
    canonicalTargetRef: string;
    proposedParentRefs: string[];
    coveredDayRange: null | { startDay: number; endDay: number };
  }>;
  proposedDeliverables: Array<{
    class: PlanningDeliverableClass;
    taskIdentityDigest: string;
    proposedScopeTargetRef: string;
  }>;
};

type ValidatedClarificationPlan = {
  planAttemptId: string;
  clarificationPlanPolicyVersion: string;
  instanceDiscoveryRuleVersions: string[];
  contextProfileVersions: string[];
  scopeGraph: PlanningContextScopeGraph;
  deliverables: Array<{
    id: string;
    class: PlanningDeliverableClass;
    taskIdentityDigest: string;
    scope: PlanningContextScopeRef;
    contextProfileId: string;
    contextProfileVersion: string;
    completenessRuleVersion: string;
  }>;
  validationDigest: string;
};

type InitializeClarificationSessionCommand = {
  idempotencyKey: string;
  ownerId: string;
  conversationId: string;
  expectedConversationContentRevision: number;
  plan: ValidatedClarificationPlan;
};

type EvolveClarificationPlanCommand = {
  idempotencyKey: string;
  ownerId: string;
  conversationId: string;
  sessionId: string;
  expectedSessionRevision: number;
  expectedConversationContentRevision: number;
  plan: ValidatedClarificationPlan;
};

type MessageEvidenceRef = {
  messageId: string;
  range: { startUtf16: number; endUtf16Exclusive: number; textDigest: string };
};

type PlanningContextValue = {
  id: string;
  fieldKey: string;
  scope: PlanningContextScopeRef;
  typedValue: unknown;
  valueSchemaVersion: string;
  authority:
    | { kind: "message_evidence"; evidence: MessageEvidenceRef }
    | {
        kind: "applied_trip_snapshot";
        tripSnapshotId: string;
        tripAggregateVersion: number;
        fieldRef: string;
      }
    | {
        kind: "bounded_assumption";
        assumptionId: string;
        policyId: string;
        policyVersion: string;
      };
};

type ClarificationFieldState = {
  requirementInstanceId: string;
  fieldKey: string;
  scope: PlanningContextScopeRef;
  resolution: "missing" | "ambiguous" | "resolved" | "assumed" | "declined";
  effectiveValueId: string | null;
  candidateValueIds: string[];
};

type BoundedAssumption = {
  id: string;
  deliverableInstanceId: string;
  requirementInstanceId: string;
  fieldKey: string;
  scope: PlanningContextScopeRef;
  typedValue: unknown;
  policyId: string;
  policyVersion: string;
  trigger: "traveler_requested" | "traveler_declined";
  disclosureText: string;
  disclosureTextDigest: string;
};

type ClarificationDeliverableInstance = {
  id: string;
  class: PlanningDeliverableClass;
  taskIdentityDigest: string;
  scope: PlanningContextScopeRef;
  contextProfileId: string;
  contextProfileVersion: string;
  completenessRuleVersion: string;
  status: "collecting" | "ready" | "claimed" | "completed" | "abandoned";
  fieldStates: ClarificationFieldState[];
  assumptionIds: string[];
  claimedByRunId: string | null;
};

type PlanningClarificationSession = {
  id: string;
  revision: number;
  ownerId: string;
  conversationId: string;
  intentFamilyKey: string;
  tripProjectId: string | null;
  status: "active" | "superseded" | "completed";
  planningMode: RetrievalPlanningMode;
  scopeGraphId: string;
  scopeGraphVersion: string;
  clarificationPlanPolicyVersion: string;
  deliverables: ClarificationDeliverableInstance[];
  values: PlanningContextValue[];
  assumptions: BoundedAssumption[];
  conversationContentRevision: number;
  currentMessageId: string;
  tripSnapshotId: string | null;
  tripAggregateVersion: number | null;
  proposalId: string | null;
  proposalRevision: number | null;
};

type ClarificationExtraction = {
  attemptId: string;
  aiAskCommandId: string;
  sessionId: string;
  sourceMessageId: string;
  promptVersion: string;
  intentDisposition: "unchanged" | "changed" | "unclear";
  extracted: Array<{
    fieldKey: string;
    scope: PlanningContextScopeRef;
    value: unknown | null;
    disposition: "explicit" | "ambiguous" | "declined";
    evidence: MessageEvidenceRef;
  }>;
  requestsBoundedAssumptions: boolean;
};

type ReduceClarificationMessageCommand = {
  idempotencyKey: string;
  aiAskCommandId: string;
  ownerId: string;
  conversationId: string;
  sessionId: string;
  expectedSessionRevision: number;
  expectedConversationContentRevision: number;
  sourceMessageId: string;
  sourceMessageOrdinal: number;
  extractionPromptVersion: string;
  planningMode: RetrievalPlanningMode;
  clarificationPlanPolicyVersion: string;
  scopeGraphVersion: string;
  tripSnapshotId: string | null;
  tripAggregateVersion: number | null;
  proposalId: string | null;
  proposalRevision: number | null;
  extraction: ClarificationExtraction;
};

type ClarificationAnswerClaim = {
  id: string;
  sessionId: string;
  sessionRevision: number;
  conversationContentRevision: number;
  clarificationPlanPolicyVersion: string;
  scopeGraphVersion: string;
  deliverableInstanceIds: string[];
  contextProfileVersions: string[];
  assumptionIds: string[];
  authoritativeRunId: string;
};
```

Retrieval owns reusable profiles/policies, deliverable-instance/decomposition validation, Trip-snapshot projection rules, and the pure completeness/scope-comparator evaluator. Chat/Trips owns sessions and their traveler-instantiated immutable graph revisions, a unique active session per conversation, the monotonic conversation content revision, and the three mutation ports `initializeClarificationSession(...)`, `evolveClarificationPlan(...)`, and `reduceClarificationMessage(...)`. AI Orchestration owns persisted plan/extraction-attempt identity and coordinates Usage through the Usage-owned transaction-aware port; it neither owns nor directly writes Usage or clarification rows. A `ClarificationPlanProposal` may create only profile-declared scope nodes and deliverable classes and has no recommendation, evidence, route-authority, or mutation semantics. Retrieval returns `ValidatedClarificationPlan`; initialize/evolve atomically persists the exact graph/instances under expected content/session revisions, is idempotent by plan attempt, and rejects stale, terminal, deleted, partial, cyclic, orphaned, duplicate, or over-policy input. The reducer accepts only those validated instances and profile-declared keys/scopes whose typed value and exact UTF-16 evidence range validate against the immutable source message. One semantic attempt per required preflight stage exists for `(AI Ask command, source message, expected session revision, prompt version)`; omission never clears a resolved value, and stale/out-of-order work cannot overwrite a later revision or terminal state.

Each deliverable instance is evaluated independently. `ready` requires every applicable `hard_required` instance to be resolved or satisfied by an immutable permitted assumption. A narrow value wins only through strict scope-graph ancestry or an explicit profile precedence edge; incomparable overlap is `ambiguous`. Applied Trip values carry exact snapshot/field authority, while message values affect only the current planning execution. Session state is not a Trip mutation.

Legal session transitions are `active -> superseded | completed`; terminal sessions have no outgoing transition. Legal instance transitions are `collecting -> ready | abandoned`, `ready -> claimed | collecting | abandoned`, and `claimed -> completed | collecting | abandoned`; `completed` and `abandoned` are terminal. A session remains active while any instance is `collecting | ready | claimed`; it completes only when every instance is `completed | abandoned`, recomputed in the same finalization transaction. A later request after completion creates a new session/instance. A newer valid reply may invalidate a ready/claimed instance, but its older answer claim remains immutable and fails the final fence.

`finalizeClarificationTurn(...)` revalidates the expected command/session/content/profile/scope/Trip fences, persists the reduced Chat/Trips session and assistant clarification message, appends extraction Usage through its owner port, and terminalizes the existing AI Ask command in one transaction. It produces no Retrieval run, web call, selection/prompt-render manifest, answer provenance, or main-answer usage. Missing extraction model, timeout, or invalid schema fails closed into a persisted safe retry outcome and cannot invoke the main model.

## Persistent Chat-To-Trip Conversion

```ts
type TripConversionOpportunityStatus =
  | "eligible"
  | "suspended"
  | "dismissed"
  | "consumed"
  | "invalidated";

type TripConversionTransitionReason =
  | "context_insufficient"
  | "context_ambiguous"
  | "deliverable_reopened"
  | "context_eligible"
  | "traveler_dismissed"
  | "conversion_committed"
  | "owner_deleted"
  | "conversation_deleted"
  | "ownership_lost"
  | "scope_incompatible"
  | "policy_withdrawn"
  | "proposal_schema_withdrawn";

type TripConversionManifest = {
  id: string;
  opportunityId: string;
  ownerId: string;
  conversationId: string;
  conversationContentRevision: number;
  sourceMessageWatermark: string;
  clarificationClaimIds: string[];
  deliverableInstanceIds: string[];
  scopedValueIds: string[];
  contextProfileVersions: string[];
  clarificationPlanPolicyVersion: string;
  scopeGraphVersion: string;
  conversionProjectionPolicyVersion: string;
  tripProposalSchemaVersion: string;
  canonicalSerializationVersion: string;
  conversionContextProjectionId: string;
  conversionContextProjectionRevision: number;
  payload: TripConversionPayload;
  manifestDigest: string;
};

type TripConversionPayload = {
  tripSeed: { title: string };
  proposalOperations: TripChangeProposalOperation[];
};

type TripConversionContextProjection = {
  id: string;
  opportunityId: string;
  revision: number;
  conversationContentRevision: number;
  terminalAiAskCommandWatermark: string;
  selectedClaimIds: string[];
  selectedExplicitValueIds: string[];
  status: "eligible" | "insufficient" | "ambiguous";
  projectionDigest: string;
};

type TripConversionProjectionPolicy = {
  version: string;
  maximumSupportedContextFieldKeys: number;
  maximumMappingRules: number;
  supportedContextFieldKeys: string[];
  fieldToProposalOperationRules: Array<{
    fieldKey: string;
    allowedScopeKinds: PlanningScopeKind[];
    operationKind: TripChangeProposalOperation["kind"];
    valueSchemaVersion: string;
  }>;
  tripTitleSeedRuleVersion: string;
};

type TripConversionOpportunity = {
  id: string;
  ownerId: string;
  conversationId: string;
  version: number;
  status: TripConversionOpportunityStatus;
  currentManifestId: string | null;
  declineContextRevision: number | null;
};

type TripConversionProjection =
  | { kind: "none" }
  | {
      kind: "visible_disabled";
      opportunityId: string;
      label: "Chuyển thành chuyến đi";
      reason: "turn_pending" | "context_ineligible";
      blockedByContentRevision: number;
      blockedByAiAskCommandId: string | null;
    }
  | {
      kind: "eligible";
      opportunityId: string;
      action: "convert_to_trip";
      label: "Chuyển thành chuyến đi";
    };

type AcceptTripCreationRecommendationCommand = {
  opportunityId: string;
  idempotencyKey: string;
};

type AcceptTripCreationRecommendationResult =
  | {
      success: true;
      destination: { tripProjectId: string; conversationId: string };
      proposalId: string;
    }
  | {
      success: false;
      reason:
        | "not_found"
        | "refresh_required"
        | "not_eligible"
        | "key_reused"
        | "destination_deleted"
        | "failed";
    };

type DismissTripCreationRecommendationCommand = {
  opportunityId: string;
  idempotencyKey: string;
};

type DismissTripCreationRecommendationResult =
  | { success: true; dismissedContextRevision: number }
  | {
      success: false;
      reason: "not_found" | "refresh_required" | "key_reused" | "failed";
    };

type RefreshTripConversionOpportunityCommand = {
  ownerId: string;
  conversationId: string;
  opportunityId: string;
  expectedOpportunityVersion: number;
  expectedCurrentManifestId: string | null;
  expectedConversationContentRevision: number;
  expectedMaterialContextFingerprint: string;
  transitionReason: Extract<
    TripConversionTransitionReason,
    | "context_insufficient"
    | "context_ambiguous"
    | "deliverable_reopened"
    | "context_eligible"
    | "scope_incompatible"
    | "policy_withdrawn"
    | "proposal_schema_withdrawn"
  >;
  projection: TripConversionContextProjection;
  nextManifest: TripConversionManifest | null;
};
```

Chat/Trips extends the existing recommendation context/decision aggregate with the opportunity, canonical context-projection revisions, and immutable manifest revisions. One ordinary conversation has at most one current nonterminal opportunity and one current manifest. Legal transitions are `eligible -> suspended | dismissed | consumed | invalidated` and `suspended -> eligible | invalidated`; terminal states have no outgoing transition. `context_insufficient | context_ambiguous | deliverable_reopened` always suspend; `context_eligible` restores the same ID with a new manifest; deletion, ownership loss, incompatible scope, or unrecoverable policy/schema withdrawal invalidate; explicit dismiss and successful conversion terminate as dismissed/consumed. Pending-turn disablement changes only the projection, not durable opportunity status. `refreshTripConversionOpportunity(...)`, accept, dismiss, and delete use the same owner/conversation lock and expected opportunity version/current-manifest compare-and-swap. A later eligible revision after dismissal or recoverable policy/schema withdrawal gets a new opportunity ID; deletion, ownership loss, and incompatible scope cannot re-offer on that owner/conversation. The traveler projection deliberately omits a manifest ID: a stable visible CTA always asks the server to resolve the latest eligible revision. Not clicking performs no command and cannot create a decline.

The projection policy selects every eligible non-superseded completed claim at or before the terminal command watermark, ordered by conversation content revision then stable claim ID. Compatible cross-scope values accumulate under the pinned scope comparator; a later explicit equal-scope value replaces an older one only when its field rule declares replacement, while an unresolved contradiction makes the projection `ambiguous`. Thus claim selection across sessions is canonical rather than “latest answer only” or unbounded union.

Manifest construction is deterministic from that persisted canonical projection, validated explicit scoped values, the pinned `TripConversionProjectionPolicy`, and the existing proposal-operation schema. The manifest stores the exact bounded typed `TripConversionPayload`; canonical serialization of the payload plus every pinned identity produces `manifestDigest`. Eligibility and click-time validation both schema-check every operation and recompute byte-identical canonical serialization/digest. Missing source values, unsupported schema, or digest mismatch fails closed. The manifest excludes raw transcript/prose, prompt or provider payload, model reasoning, blocked deliverables, ambiguous/unresolved fields, and any operation derived only from a bounded assumption. Eligibility requires at least one supported proposal operation. While a newer traveler turn is pending terminalization, the server returns `visible_disabled` and admission rejects accept from every client until that exact command/content revision is terminal.

Chat/Trips owns `TripConversionProjectionPolicy` as a finite code-shipped typed catalog, not traveler/admin data or environment configuration. G0/startup validation rejects empty or over-limit policies, duplicate field/scope pairs, conflicting operation mappings, unknown profile field keys, unknown proposal-operation discriminators, incompatible scope/value schemas, and title rules outside the bounded seed contract. One active version is pinned in every manifest; a code release that changes the policy creates a new version and restarts affected evidence.

The existing `declineTripCreationRecommendation(...)` port is upgraded to `DismissTripCreationRecommendationCommand`; no parallel dismissal endpoint is introduced. It owner-locks the stable opportunity, resolves its latest eligible current manifest, applies the same content/deletion fence as accept, and idempotently transitions `eligible -> dismissed` while persisting the exact current material-context decline revision. Same-key replay returns the same result; changed digest fails. Client hide, navigation, unmount, timeout, and non-click never invoke this command. A stale/suspended/deleted opportunity writes no decline and returns a safe refresh result.

The existing `acceptTripCreationRecommendation(...)` port is upgraded to this opportunity/result contract; no parallel conversion endpoint is introduced. It locks the owner-bound conversation/opportunity, resolves the latest manifest, and revalidates content/projection revisions, terminal AI Ask watermark, claims/instances, profiles, scopes, projection-policy/proposal-schema/serialization versions, payload digest, and deletion state. In one transaction it creates exactly one Trip, its separate primary conversation, and one initial pending proposal from the manifest's exact typed operations. It consumes the opportunity and records an idempotent terminal result containing destination plus proposal identity. A concurrent newer context revision causes refresh/retry rather than applying the older manifest. The original conversation and its messages are not copied or linked.

The server derives the accept request digest from command-contract version, owner ID, opportunity ID, and resolved manifest digest. Only committed success reserves the key; `not_found`, `refresh_required`, `not_eligible`, and transient `failed` do not reserve it. Same-key success replay returns the same live destination/proposal; a changed manifest digest returns `key_reused`. Source-conversation deletion after success may retain only the non-content replay ledger and still replay while the destination exists. Trip/proposal deletion tombstones the result to `{ success: false, reason: "destination_deleted" }` without exposing deleted identifiers.

## Planning Authority

```ts
type RetrievalPlanningMode =
  | "current_plan"
  | "explore_change"
  | "validate_proposal"
  | "unscoped_answer";

type TripLegRouteChoice = {
  legItemId: string;
  legItemVersion: number;
  canonicalOriginId: string;
  canonicalDestinationId: string;
  selectedPathId: string;
  registrySnapshotId: string;
};

type PlanningExecutionRef = {
  mode: RetrievalPlanningMode;
  tripSnapshotId: string | null;
  tripAggregateVersion: number | null;
  currentTurnIntentDigest: string;
  clarificationRef: null | {
    sessionId: string;
    sessionRevision: number;
    conversationContentRevision: number;
    clarificationPlanPolicyVersion: string;
    scopeGraphVersion: string;
    claimId: string;
    readyDeliverableInstanceIds: string[];
    contextProfileVersions: string[];
    assumptionIds: string[];
  };
  proposalRef: null | {
    proposalId: string;
    proposalRevision: number;
    expectedTripAggregateVersion: number;
    affectedItemVersions: Array<{ itemId: string; version: number }>;
  };
};
```

Rules:

- `unscoped_answer` requires null Trip and proposal references.
- `current_plan` ignores pending/dismissed/expired proposal effects.
- `explore_change` keeps the Trip snapshot as baseline; transient route choices do not persist.
- `validate_proposal` requires one current pending owner-scoped proposal.
- A profiled detailed deliverable requires a `clarificationRef` whose pinned session revision marks that exact instance ready or records its permitted traveler-visible bounded assumptions.
- A terminal AI Ask revalidates clarification, content, scope/profile, assumption, Trip, and proposal fences and discards or safely refreshes output when any are stale.

## Trip Persistence Delta

The existing `trip_plan_items` transport-leg representation gains nullable canonical route-choice fields:

```text
canonical_origin_location_id
canonical_destination_location_id
selected_route_path_id
route_registry_snapshot_id
```

All four values are null together or present together. They are permitted only for a transport leg. Existing free-text endpoint labels remain traveler display/input fields and migrate without inferred canonical values.

The Trip proposal operation union adds:

```ts
type TripRouteChoiceOperation =
  | {
      kind: "set-leg-path";
      legItemId: string;
      expectedLegVersion: number;
      choice: Omit<TripLegRouteChoice, "legItemId" | "legItemVersion">;
    }
  | {
      kind: "clear-leg-path";
      legItemId: string;
      expectedLegVersion: number;
    };
```

Apply validates the exact owner, Trip aggregate/item fences, transport-leg discriminator, endpoints, path membership, and registry snapshot. It writes the route choice and Trip history atomically or writes nothing.

## Route Registry And Resolution

Retrieval owns immutable registry releases and their canonical locations, physical segments, route paths, path memberships, aliases, and origin/destination coverage assertions. Only one validated release is active for a read mode at a time.

```ts
type RouteResolutionState =
  | "authoritative_selected"
  | "authoritative_complete"
  | "known_partial"
  | "ambiguous_paths"
  | "no_path"
  | "stale_selected_path";

type ResolvedQueryLeg = {
  legId: string;
  originId: string;
  destinationId: string;
  direction: "forward" | "reverse";
  pathIds: string[];
  resolutionState: RouteResolutionState;
  registrySnapshotId: string;
  coverageAssertionRef: null | { assertionId: string; revision: number };
  reasonCodes: string[];
};
```

`authoritative_selected` requires an exact owner-confirmed Trip choice or an exact explicit current-turn selection. `authoritative_complete` requires an active effective coverage assertion for the exact OD pair and registry snapshot. Partial and ambiguous states never derive hard negative authority from absence.

`stale_selected_path` means the Trip retains an exact historical route choice whose registry release is retired or incompatible. The choice remains available for review/history but grants no current hard applicability. Only an owner-confirmed `set-leg-path` operation can refresh it.

`publishRouteRegistryRelease(...)` is the sole registry mutation boundary. An authorized bounded Worker operation validates a code-reviewed reference manifest and all required projections, then compare-and-swap activates the immutable release and coverage assertion set in one transaction. Failure leaves the prior release active.

## Required Needs And Coverage

```ts
type TravelFacet =
  | "route"
  | "driving_segment"
  | "stop"
  | "accommodation"
  | "food"
  | "activity"
  | "warning"
  | "fuel_or_charging"
  | "parking"
  | "cost"
  | "general";

type RequirementKey = {
  id: string;
  vocabularyVersion: string;
  facet: TravelFacet;
  importance: "required" | "useful" | "optional";
  legId: string | null;
  canonicalPlaceId: string | null;
  constraintKey: string | null;
  freshnessClass: "static" | "recent_warning" | "live_authority_required";
};

type RequirementContribution =
  | {
      id: string;
      kind: "knowledge";
      runId: string;
      requirementKeyId: string;
      legId: string | null;
      cardId: string;
      contentVersion: number;
      evidenceSetRevision: number;
      factAssertionId: string;
      eligibilitySnapshotId: string;
      scopeDecisionId: string;
      freshnessDecisionId: string;
      permittedRenderVariants: Array<{
        id: string;
        textDigest: string;
        tokenCount: number;
      }>;
    }
  | {
      id: string;
      kind: "web";
      runId: string;
      requirementKeyId: string;
      legId: string | null;
      captureId: string;
      resultPayloadDigest: string;
      webFactId: string;
      webFactTextDigest: string;
      factExtractionVersion: string;
      scopeProjectionId: string;
      scopeDecisionId: string;
      freshnessDecisionId: string;
      permittedRenderVariants: Array<{
        id: string;
        textDigest: string;
        tokenCount: number;
      }>;
    };

type RequirementOutcome = {
  requirementKeyId: string;
  status:
    | "satisfied"
    | "missing"
    | "requires_verification"
    | "requires_clarification";
  renderedContributionIds: string[];
  gapReason: string | null;
};
```

Requirement keys exist before candidate generation. A contribution binds one atomic fact/facet assertion to one requirement and, when applicable, one leg. Final outcomes use rendered contributions only.

The key ID is a content-addressed digest of the intent-profile version and canonical key fields. The profile owns expansion cardinality, per-leg duplication, and duplicate coalescing; a rule change requires a new profile version. Retrieval is the sole contribution creator. Selector, AI Orchestration, provenance, and Eval consume immutable IDs. Any owner revision, decision identity, fact digest, or permitted render variant change creates a new contribution ID.

## Replay Identity And Manifests

```ts
type QueryExecutionContext = {
  runId: string;
  readMode: "legacy" | "v6_shadow" | "v6_active";
  evaluatedAt: string;
  normalizedQuestionDigest: string;
  queryPlanId: string;
  queryPlanVersion: string;
  activeReadPolicyId: string;
  planning: PlanningExecutionRef;
  requirementProfileVersion: string;
  facetVocabularyVersion: string;
  registrySnapshotId: string;
  coverageAssertionRefs: Array<{ assertionId: string; revision: number }>;
  eligibilityRuleVersion: string;
  rankingConfigVersion: string;
  selectorConfigVersion: string;
  runtimePolicyVersion: string;
};

type SelectionManifest = {
  id: string;
  runId: string;
  requirementOutcomes: RequirementOutcome[];
  selectedItemsInOrder: Array<{
    itemKind: "knowledge" | "web";
    itemId: string;
    renderVariantId: string;
    renderTextDigest: string;
    contributionIds: string[];
  }>;
};

type PromptRenderManifest = {
  id: string;
  runId: string;
  selectionManifestId: string;
  renderedItems: SelectionManifest["selectedItemsInOrder"];
  finalRequirementOutcomes: RequirementOutcome[];
  renderedAssumptionDisclosures: Array<{
    assumptionId: string;
    disclosureTextDigest: string;
  }>;
};
```

Every hard decision is reproducible from immutable identity plus bounded decision records. Runtime policies own caps, ordering, timeouts, and diagnostic retention; stages do not hard-code independent values.

Retrieval owns runs, requirement keys/contributions/outcomes, selection manifests, web decisions, and read-policy state. AI Orchestration owns terminal workflow coordination plus prompt-render/provenance rows. `prepareAiAnswerRun(...)` and `finalizeAiAnswer(...)` share one run/idempotency fence, including the exact clarification claim when present. Finalization composes transaction-aware owner ports in one PostgreSQL transaction: Chat/Trips revalidates and completes claimed deliverable instances plus inserts the assistant message, Retrieval seals its run, Usage appends its event, and AI Orchestration writes prompt/provenance. Every claimed assumption must appear in `renderedAssumptionDisclosures`; omission fails closed. The coordinator imports no other owner's tables. Failure seals a failed run and usage event with no completed message.

## Shadow Execution Pair

```ts
type RetrievalExecution = {
  id: string;
  authoritativeRunId: string;
  shadowRunId: string | null;
  authoritativeAssistantMessageId: string | null;
};

type RetrievalRunRole = "authoritative" | "shadow";

type RetrievalShadowComparison = {
  executionId: string;
  authoritativeRunId: string;
  shadowRunId: string;
  authoritativePolicyId: string;
  shadowPolicyId: string;
  authoritativeResultDigest: string;
  codeAndConfigTupleDigest: string;
  wouldRenderManifestId: string;
};
```

One execution has exactly one authoritative run and at most one shadow run. Only the authoritative role may own a prompt-render manifest, select/persist a traveler response, or write prompt/provider/provenance usage. Shadow uses a separate `would-render` manifest with no `usedInPrompt` semantics. Retry preserves role uniqueness; deletion invalidates the execution, both runs, and comparison atomically.

## Web Evidence Scope

```ts
type WebQueryPlanManifest = {
  id: string;
  runId: string;
  requirementKeyIds: string[];
  allowedCanonicalScopeTerms: string[];
  excludedPrivateContextClasses: Array<
    "trip_notes" | "child_details" | "budget" | "preferences"
  >;
  minimizedQueryDigest: string;
  queryBuilderVersion: string;
  providerRequestPolicyVersion: string;
};
```

```ts
type WebEvidenceScopeProjection = {
  id: string;
  captureId: string;
  resultPayloadDigest: string;
  registrySnapshotId: string;
  resolverVersion: string;
  factAssertions: Array<{
    webFactId: string;
    webFactTextDigest: string;
    factExtractionVersion: string;
    assertionId: string;
    resolutionStatus: "exact" | "reviewed" | "ambiguous" | "unknown";
    canonicalScopeIds: string[];
  }>;
};

type WebEvidenceScopeDecision = {
  id: string;
  projectionId: string;
  assertionId: string;
  requirementKeyId: string;
  legId: string | null;
  relation: "applicable" | "mismatched" | "unresolved";
  eligibleAsPremise: boolean;
  decisionDigest: string;
};
```

The projection is immutable for its exact capture payload, registry, and resolver. Query-specific decisions are separate. `ambiguous`, `unknown`, or mismatched scope cannot satisfy a requirement.

`web_evidence_scope_decisions` is a first-class immutable owner row. A web selection item identifies the exact web requirement contribution, not the provider result. Provenance must traverse the same-run chain from query manifest and capture through fact/projection/decision/contribution to the exact rendered variant.

## Read Policy And Cutover

```ts
type RetrievalReadPolicy = {
  id: string;
  version: number;
  mode: "legacy" | "v6_shadow" | "v6_active";
  runtimePolicyVersion: string;
  targetQualificationReportId: string | null;
  triggerReportOrIncidentId: string | null;
  productApprovalId: string | null;
  rollbackPolicyId: string | null;
  activatedAt: string;
};

type RetrievalReadPolicyTransition =
  | {
      reason: "shadow" | "cutover" | "cleanup";
      expectedCurrentPolicyId: string;
      targetPolicyId: string;
      passingQualificationReportId: string;
      productApprovalId: string;
    }
  | {
      reason: "rollback";
      expectedCurrentPolicyId: string;
      targetPolicyId: string;
      targetQualificationReportId: string;
      triggerReportOrIncidentId: string;
      authorizedActorId: string;
    };
```

`activateRetrievalReadPolicy(...)` is Retrieval-owned and compare-and-swap protected. Shadow/cutover/cleanup validates current passing qualification and Product Owner approval. Rollback validates a failing report/incident, authorized actor, and a target already runnable and previously qualified/approved; it requires no new passing report. Every transition stores prior/next policy, target qualification, trigger evidence, and audit. Deployment config is seed/cache only.

## Evaluation Profile

```ts
type RetrievalGateProfile = {
  version: string;
  metricDefinitionsVersion: string;
  cohorts: Array<{
    id: string;
    safetyClass: "critical_authoritative" | "standard";
    minimumCandidateRecall: number;
    maximumHardFilterFalseExclusion: number;
    maximumCandidateCapFalseExclusion: number;
    minimumFinalSetPrecision: number;
    minimumRequiredNeedCoverage: number;
    minimumPlanningModeAccuracy: number;
    minimumClarificationReadinessAccuracy: number;
    maximumFalseBlockedClarificationRate: number;
    maximumClarificationTurnsPerReadyInstance: number;
    maximumHypotheticalAsCommittedRate: number;
    maximumPrivateTripContextLeakageRate: number;
    maximumSilentRequiredGapOmissionRate: number;
    minimumUsefulPartialAnswerRate: number;
  }>;
  mandatorySafetyLimits: {
    maximumHardOffRouteContributionRate: 0;
    maximumUnrelatedNeedSatisfactionRate: 0;
    maximumSourceMetadataLeakageRate: 0;
    minimumProvenanceCorrectnessRate: 1;
    maximumWebScopePremiseMisuseRate: 0;
    maximumRecentWarningAsLiveAuthorityRate: 0;
    maximumProviderFailureUnsafeRecoveryRate: 0;
    maximumSilentMaterialContextDefaultRate: 0;
    maximumFalseReadyProgressionRate: 0;
    maximumUnresolvedMaterialFieldOmissionRate: 0;
    maximumCrossScopePreferenceLeakageRate: 0;
    maximumMissingAssumptionDisclosureRate: 0;
    maximumPartialReplyValueLossRate: 0;
    maximumStaleConversionManifestUseRate: 0;
    maximumConversationTranscriptCopyRate: 0;
    maximumDuplicateTripConversionRate: 0;
    maximumPreApplyConversionMutationRate: 0;
  };
  operationalLimits: {
    maximumP95TotalLatencyMs: number;
    maximumAiCallRate: number;
    maximumWebCallRate: number;
    maximumCostPerSuccessfulAnswer: number;
  };
  evidenceWindow: { minimumRunCount: number; minimumDurationHours: number };
  minimumLegacyRollbackWindowHours: number;
};
```

Critical-authoritative cohort validation also requires literal zero for hypothetical/pending-as-committed, private Trip leakage, silent required-gap omission, hard-filter false exclusion, candidate-cap false exclusion, silent material defaults, false-ready progression, unresolved material-field omission, cross-scope preference leakage, missing assumption disclosure, partial-reply value loss, stale conversion-manifest use, transcript copy, duplicate conversion, and pre-Apply conversion mutation. False blocking and clarification burden use approved standard-cohort numeric limits. Standard values and operational limits are benchmarked and approved before shadow evidence can count toward cutover.

Profile validation requires every closed field, rejects unknown/missing metric IDs, and rejects any complete profile whose mandatory literal values are weakened. One evidence window contains one exact code/read-policy/corpus/registry/requirement/context-profile/clarification-plan-policy/instance-discovery/completeness/clarification-plan/extraction/scope-graph/assumption/conversion-projection-policy/proposal-schema/canonical-serialization/eligibility/ranking/selector/runtime/parser/resolver tuple; changing any member restarts the window.

## Deletion Matrix

| Owner deletion | Invalidated content |
|---|---|
| Ordinary conversation | Message-derived intent, instantiated scope graphs, validated plan results, plan/extract attempts and payloads, target/task digests, clarification sessions/instances/values/evidence/assumptions/claims, open conversion opportunities/manifests and nonterminal replay state, query payload, run/manifests, web decisions, production evaluation membership, derived context, embeddings, reconstructable diagnostics |
| Primary conversation | Same as ordinary conversation plus owner-scoped replacement or Trip deletion transaction |
| Trip Project | Snapshots, canonical route choices, proposals, Trip-derived runs/manifests, derived context and embeddings |
| Source/web capture removal | Normal evidence eligibility, prompt handles, traveler detail availability under existing provenance-withdrawal rules |

Retained audit is non-content and cannot reconstruct questions, Trip state, route choices, source text, or answers.

Chat/Trips coordinates each owner deletion in one PostgreSQL transaction through exported module invalidators. No user-visible success is returned until every invalidation commits. Message-owned web captures are removed/tombstoned rather than retained as reusable knowledge; production-derived evaluation membership is removed while non-content aggregate metrics may remain.
