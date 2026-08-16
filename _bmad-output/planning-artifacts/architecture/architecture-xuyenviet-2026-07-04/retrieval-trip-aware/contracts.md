---
title: Retrieval And Trip-Aware Minimal Contracts
status: final
updated: 2026-08-16
source_spine: ../ARCHITECTURE-SPINE.md
---

# Retrieval And Trip-Aware Minimal Contracts

These contracts define only the values Epic 21 needs now. Implement them with existing
module owners and tables. Do not generalize them into a graph engine, workflow engine,
runtime registry, evaluation system, or release control plane.

## Planning Session

Epic 21 adds one table containing one bounded JSON payload per active conversation.

```ts
type PlanningScope =
  | { kind: "journey" }
  | { kind: "leg"; legItemId: string }
  | { kind: "place"; placeRef: string }
  | { kind: "stay"; placeRef: string };

type PlanningSlot = {
  key: string;
  value: string | number | boolean | string[];
  scope: PlanningScope;
  sourceMessageId: string;
};

type PlanningContextSessionPayload = {
  version: "planning-session-v1";
  intent: string;
  slots: PlanningSlot[];
  missingSlotKeys: string[];
  status: "collecting" | "ready" | "superseded";
  sourceMessageIds: string[];
  revision: number;
};
```

Limits are code constants and tests must pin them: maximum payload bytes, slots,
missing keys, source message IDs, and string/array lengths. Slot keys come from a small
typed profile beside the clarification reducer. Unknown keys, invalid scopes, duplicate
key/scope pairs, invalid values, and over-limit payloads are rejected.

`savePlanningContextSession(...)` compares the expected revision, owner, conversation,
and latest source message before replacing the JSON document. It never persists model
reasoning, raw provider payloads, prompt text, or a second copy of the transcript.

No clarification graph, deliverable instance table, claim table, plan/extraction attempt
table, arbitrary parent relation, or generic state-machine framework exists.

## Clarification

One profiled turn performs at most one use of the existing context-extraction capability.
The deterministic reducer accepts only explicit values supported by the active intent
profile, retains compatible prior slots, marks contradictory same-scope values missing,
and computes the next missing material slot. It asks at most one concise traveler-facing
question per blocked turn.

A blocked turn terminalizes through the existing AI Ask command. It records the
clarification message and Usage once and creates no retrieval, web-search, main-answer,
annotation, recommendation, or proposal effect. Failure returns persisted safe retry
guidance. A stale extraction cannot update a newer session revision.

## Planning Mode

```ts
type PlanningMode =
  | "current_plan"
  | "explore_change"
  | "validate_proposal"
  | "unscoped_answer";

type PlanningExecutionRef = {
  mode: PlanningMode;
  tripProjectId: string | null;
  tripAggregateVersion: number | null;
  proposalId: string | null;
  proposalRevision: number | null;
  planningSessionRevision: number | null;
};
```

The server resolves mode from authenticated URL scope, selected owned Trip, current
pending proposal, and current-turn intent. Applied Trip state is the only authority in
`current_plan`. Exploration and proposal values are labeled hypothetical/pending and do
not affect later current-plan turns until the existing owner Apply command succeeds.
Ambiguity asks one clarification. Changed owner/version fences discard stale output.

## Canonical Route Authority

Until runtime editing is required, route support is one typed constant in
`packages/database/src/route-coverage.ts`:

```ts
type RouteResolution =
  | { kind: "selected"; pathId: string }
  | { kind: "complete"; pathIds: string[] }
  | { kind: "partial"; pathIds: string[] }
  | { kind: "ambiguous"; pathIds: string[] }
  | { kind: "unsupported" }
  | { kind: "stale"; pathId: string };
```

Only an owner-confirmed `set-leg-path` proposal stores a path reference; the existing
proposal Apply command also supports `clear-leg-path`. Free-text endpoint labels remain
query aids and never create a durable route choice. Partial, ambiguous, unsupported, and
stale results may provide bounded general guidance but cannot make hard route claims.

There is no route-registry table, release object, publisher, Worker operation, activation
record, or compare-and-set registry lifecycle.

## Required-Need Retrieval

Required needs are a small typed constant beside `source-bundle.ts`, selected by intent
and planning mode:

```ts
type RequiredNeed = {
  id: string;
  importance: "required" | "optional";
  scope: PlanningScope;
  freshness: "stable" | "changing";
};

type NeedOutcome =
  | { kind: "satisfied"; evidenceIds: string[] }
  | { kind: "missing" }
  | { kind: "requires_verification"; reason: string }
  | { kind: "requires_clarification"; question: string };
```

The existing knowledge search returns eligible owner rows. A pure evaluator maps an
applicable fact to one or more compatible need IDs. Source name, URL, publisher, and
provenance metadata cannot improve relevance or authorize scope. Selection prioritizes
required needs within the existing prompt budget; dropped required evidence changes the
final outcome before generation.

Card count has no decision authority. One applicable fact may satisfy the only required
need; many irrelevant cards cannot hide a missing need. Existing candidate/selected/target
count columns may remain diagnostic telemetry but no branch, config, test, or runbook may
use them to decide web fallback or answer sufficiency.

The existing `assistant_retrieval_decisions.knowledgePolicySnapshot` stores one bounded
JSON value:

```ts
type RequiredNeedSnapshot = {
  version: "required-needs-v1";
  mode: PlanningMode;
  route: RouteResolution | null;
  outcomes: Array<{ needId: string; outcome: NeedOutcome }>;
  renderedEvidenceIds: string[];
  webEvidenceIds: string[];
  topExclusionReasons: string[];
};
```

No retrieval-run, contribution, selection, query-plan, policy, evaluation, or shadow table
is introduced.

## Scoped Web Verification And Finalization

Web fallback is permitted only for a missing/changing/conflicted need or an explicit
request for current information. `source-bundle.ts` passes `web-search.ts` a minimized
query containing the need and allowed canonical place/route terms. It excludes private
notes, child details, budget, and unrelated preferences.

Captured results keep the existing source URL/type/time fields. A result may satisfy a
need only when its fact matches the required place/route/time; ambiguous or mismatched
results remain verification leads or are excluded. Provider failure preserves the need
gap and gives practical verification guidance. Old warnings are never labeled live
traffic, navigation, closure, or guaranteed safety.

The existing AI Ask command is the only terminal fence. Its existing transaction writes
the assistant message, Usage, provenance, and bounded retrieval snapshot consistently.
Failure writes failure Usage without a completed message. Retry returns the existing
terminal result. Do not add `prepareAiAnswerRun`, `finalizeAiAnswer`, a run table, or a
new orchestration framework unless those symbols already exist when the story starts.

## Chat-To-Trip Conversion

Reuse the current trip-recommendation aggregate and commands. Its externally relevant
state is only:

```ts
type TripConversionState = "eligible" | "accepted" | "dismissed" | "invalidated";
```

A completed unscoped answer is eligible only when the latest planning session contains
at least one explicit supported value that maps to an existing Trip proposal operation.
Ambiguous, missing, stale, unsupported, or assumption-only values are ineligible. A
later completed turn recomputes eligibility from the current session; no manifest
history or suspension workflow is required.

Accept uses the existing recommendation idempotency key and owner/conversation lock. It
maps current explicit values to existing proposal operations, validates them through the
database proposal command, and creates one Trip, its separate primary conversation, and
one pending proposal in the same transaction. Dismiss updates the existing recommendation
state. Continue-in-Trip changes URL scope only.

The original transcript, assistant prose, prompts, provider payloads, model reasoning,
ambiguous values, and assumptions are not copied. Only the existing owner Apply command
changes Trip state. No opportunity table, manifest table, workflow engine, new endpoint,
Worker, or background refresh job is introduced.

## Deletion

Foreign-key cascades are the default. Existing conversation/Trip deletion commands add
explicit same-transaction cleanup only for owner-derived rows that a cascade cannot
remove safely. Deletion covers the planning session, retrieval snapshots/provenance,
open recommendation, pending proposal, and related derived content. It must not change
an unrelated Trip or conversation. Existing owner/version fences prevent stale answer
or conversion work from restoring deleted state.

Retained audit may keep non-content identity, actor/operation class, and timestamp only;
it cannot reconstruct questions, answers, Trip state, route, source text, or planning
context.

## Clean-Break Boundary

- Migration `0073_clean_break_trip_aware_planning.sql` is the only Epic 21 migration and is finalized in Story 21.1.
- The target must be explicitly disposable; otherwise implementation stops before destructive action.
- Later stories do not amend `0073` and do not automatically reset a database.
- There is no backfill, dual write, shadow mode, runtime read policy, gate profile, approval row, cutover record, cleanup report, or legacy rollback target.
- Before durable data exists, recovery is code rollback plus a separately user-confirmed guarded reset/migrate/seed.
- Final verification uses existing test/build commands and scoped `rg`; it creates no custom verification tool.
