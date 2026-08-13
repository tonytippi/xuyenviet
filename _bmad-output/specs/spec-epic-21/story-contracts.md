# Epic 21 Story Contracts

> Canonical per-story implementation handoffs for folder-plus-ID dispatch. Each section preserves the hardened Given/When/Then criteria, exact tasks, verification, dependency gates, and source references. Generated story specs under `stories/` own execution status and evidence; this companion owns no status.

## Story 21.1: Define Versioned Planning Context Profiles And Scope Rules


### Story

As a traveler, I want XuyenViet to recognize the details material to each part of my request, so that it asks only relevant questions without leaking preferences between days, stops, meals, or stays.

### Acceptance Criteria

**Given** a profiled request asks for an itinerary, route comparison, accommodation, food, activity, or mixed planning deliverables
**When** Retrieval resolves the applicable planning-context profiles
**Then** every deliverable instance receives an immutable profile with typed fields, materiality, conditional applicability, allowed scopes, value validation, precedence, completeness, and safe-assumption policy
**And** readiness cannot be declared from prompt prose, model confidence, global traveler completeness, or an undeclared context key.

**Given** a planning request contains journey, day-range, leg, place, destination-stay, transit-stay, meal, activity, group, or deliverable scope
**When** its proposed scope graph is validated
**Then** the graph uses the versioned relation comparator and deterministic `equal`, `ancestor`, `descendant`, `overlap`, `sibling`, or `unrelated` result
**And** cycles, duplicate nodes, orphan parents, invalid references, and policy limits for nodes, instances, depth, parents, values, and text lengths are rejected without partial persistence.

**Given** a traveler specifies a nicer Đà Nẵng destination stay and simple sleep-only transit stays
**When** effective values are evaluated
**Then** strict ancestry or an explicit profile precedence rule applies each value only to its compatible subtree
**And** incomparable overlap becomes ambiguous rather than latest-write-wins or journey-wide leakage.

**Given** the profile, plan policy, scope comparator, or value schema changes
**When** a session, answer claim, fixture result, or evaluation result is created
**Then** it pins the exact versions used
**And** `CLAR-01`, `CLAR-07`, `CLAR-08`, `CLAR-13`, `CLAR-21`, `CLAR-22`, and `CLAR-23` remain executable canonical cases for FR-5, RTA-11, and RTA-12.

### Tasks / Subtasks

- [ ] Define browser-safe closed types, exact-key parsers, and version-reference contracts in new `packages/contracts/src/planning-context.ts`, then export them from `packages/contracts/src/index.ts`; keep traveler-free profile semantics out of the contracts package (AC: 1-4).
- [ ] Implement the Retrieval-owned immutable catalog, deliverable resolver, plan-policy validator, deterministic graph identity/coalescing, completeness evaluator, and pure scope comparator in new `packages/database/src/planning-context-profiles.ts`, then export that feature from `packages/database/src/index.ts` (AC: 1-3).
- [ ] Add only reusable profile/policy/value-schema version records to `packages/database/src/schema.ts` and create forward migration `drizzle/migrations/0067_add_planning_context_profiles.sql`; do not create conversation sessions, claims, values, or attempt rows in this story (AC: 1, 4).
- [ ] Add canonical executable inputs for `CLAR-01`, `CLAR-07`, `CLAR-08`, `CLAR-13`, and `CLAR-21`-`CLAR-23` in new `tests/fixtures/planning-context-v6.ts`; add DB-free resolver/identity/coalescing coverage in new `tests/planning-context-profiles.test.ts` and serial schema/migration coverage in new `tests/planning-context-profiles.integration.test.ts` (AC: 1-4).
- [ ] Verify with `pnpm test:unit -- tests/planning-context-profiles.test.ts`, `pnpm test:integration -- tests/planning-context-profiles.integration.test.ts`, `pnpm db:generate`, and `pnpm typecheck`; record any environmental database blocker exactly rather than weakening a fixture or assertion (AC: 1-4).

### Dev Notes

- This is the vocabulary foundation for 21.2-21.12. `packages/contracts` owns only browser-safe shapes/parsers; Retrieval owns profile semantics, validation, comparison, and pure completeness. Chat/Trips must not duplicate them or write a global traveler profile.
- Every field pins type/schema version, materiality, condition, permitted scopes, validation, precedence, and safe-assumption rule. Bound node/instance/depth/parent/value/text sizes deterministically.
- Validated graphs retry to the same identity and deterministically coalesce equivalent deliverables; no consumer may infer profile identity from prose or a global completion flag.
- Do not add a service, queue, Worker loop, or environment configuration. New durable data requires deletion semantics when later chat/Trip-derived rows are introduced.
- Session, answer-claim, and plan/extraction-attempt persistence belongs to Story 21.2. Story 21.1 supplies only the version references those rows will pin.

#### Project Structure Notes

- Use explicit feature exports. `packages/database/src/source-bundle.ts` is legacy retrieval assembly, not an owner for mutable clarification state.
- Keep strict TypeScript and forward-only Drizzle migration conventions.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.1]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-39]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Multi-Turn-Clarification-And-Scoped-Context]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Multi-Turn-Clarification-And-Scoped-Preferences]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.1` is normative. Contract AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Story 21.2: Persist Scoped Multi-Turn Clarification State Safely


### Story

As a traveler, I want valid answers to accumulate across clarification turns, so that XuyenViet asks only for missing details without losing, mixing, or silently replacing prior answers.

### Acceptance Criteria

**Given** a new profiled intent has a validated clarification plan
**When** Chat/Trips initializes or evolves its clarification session
**Then** it atomically persists the owner-bound immutable graph revision, typed deliverable instances, current field states, exact conversation content revision, and pinned profile/policy identities
**And** retries are idempotent by plan attempt while stale, terminal, deleted, cyclic, partial, or unvalidated plans change nothing.

**Given** the server asks for trip direction, vehicle, and party composition
**When** the traveler replies naturally with only vehicle and party information
**Then** `reduceClarificationMessage(...)` preserves both validated values with exact UTF-16 message-evidence spans and recomputes only affected instances
**And** the next state still identifies direction as missing without clearing prior values or inventing a default.

**Given** later replies contradict an equal-scope value, refine a narrower scope, arrive out of order, or are delivered more than once
**When** the reducer validates owner, message order, expected session/content revisions, extraction identity, and scope rules
**Then** ambiguity is retained for clarification, valid narrow overrides remain local, and exactly one legal compare-and-swap reduction commits
**And** stale or duplicate work cannot overwrite newer, ready, claimed, completed, abandoned, superseded, or deleted state.

**Given** one mixed session contains lodging, food, and activity instances
**When** only some instances become ready or complete
**Then** readiness and answer claims remain per instance, independently ready work excludes blocked siblings, and the parent stays active until every instance is completed or abandoned
**And** `CLAR-02`, `CLAR-03`, `CLAR-09`, `CLAR-11`, `CLAR-14`, `CLAR-24`, `CLAR-25`, and `CLAR-26` pass in unit and serial integration coverage for FR-5, RTA-11, and RTA-12.

### Tasks / Subtasks

- [ ] Extend `packages/database/src/schema.ts` and add forward migration `drizzle/migrations/0068_add_planning_clarification_state.sql` with two separately owned groups: AI Orchestration-owned immutable plan/extraction-attempt rows keyed by AI Ask command, source message, expected session revision, and prompt version; and Chat/Trips-owned graph revision, session, deliverable-instance, field-state, scoped-value, evidence, assumption, and answer-claim rows. Add owner FKs, deletion cascades, legal-state checks, attempt uniqueness, claim overlap fences, and the partial unique one-active-session-per-conversation index (AC: 1-4).
- [ ] Add monotonic `contentRevision` to `conversations` and stable owner-scoped message `ordinal` to `messages` in `packages/database/src/schema.ts` and the same migration; implement the only allocation/increment helper in new `packages/database/src/conversation-content-revisions.ts`, and route the user/assistant message writers in `packages/database/src/ai-ask-commands.ts` and `packages/database/src/ai-ask-stream-execution.ts` through it. Do not use timestamps or message counts as fences (AC: 1-3).
- [ ] Implement AI Orchestration-owned attempt creation/read/idempotency in new `packages/database/src/planning-clarification-attempts.ts` and export it from `packages/database/src/index.ts`; this story persists attempts for validated test inputs but makes no model call, which remains Story 21.3 (AC: 1, 3).
- [ ] Implement Chat/Trips-owned `initializeClarificationSession`, `evolveClarificationPlan`, `reduceClarificationMessage`, and exact-instance claim ports in new `packages/database/src/planning-clarification-state.ts`; consume Story 21.1's Retrieval evaluator and the attempt IDs from `planning-clarification-attempts.ts`, and reuse `aiAskCommands.id` as the command fence without adding another command ledger (AC: 1-4).
- [ ] Add canonical `CLAR-02`, `CLAR-03`, `CLAR-09`, `CLAR-11`, `CLAR-14`, and `CLAR-24`-`CLAR-26` data to `tests/fixtures/planning-context-v6.ts`; add reducer/transition/evidence-span tests in new `tests/planning-clarification-state.test.ts` and serial owner/CAS/attempt-idempotency/concurrent-disjoint-claim/terminal-immutability tests in new `tests/planning-clarification-state.integration.test.ts`, calling `resetTestDatabase()` in that file's setup (AC: 1-4).
- [ ] Verify with `pnpm test:unit -- tests/planning-clarification-state.test.ts`, `pnpm test:integration -- tests/planning-clarification-state.integration.test.ts`, `pnpm db:generate`, and `pnpm typecheck`; record any environmental database blocker exactly (AC: 1-4).

### Dev Notes

- Depends on Story 21.1's validated profile, comparator, scope graph, and pinned identities. Retrieval supplies the validated plan/evaluator; Chat/Trips is the sole writer of conversation-bound state. AI Orchestration owns the separate immutable plan/extraction attempt rows and their identities; those rows are created here so no later story depends on nonexistent persistence.
- Closed states: session `active|superseded|completed`; instance `collecting|ready|claimed|completed|abandoned`. Enforce the legal transition matrix and a partial unique one-active-session-per-conversation constraint. Validate owner, `sourceMessageOrdinal`, expected session/content revision, plan/extraction attempt identity, field/evidence digest, profile/scope, and Trip/proposal fences.
- Values use zero-based UTF-16 exclusive-end evidence spans. Do not mutate a Trip aggregate from clarification state.
- `contentRevision` advances in the same transaction as every relevant message insert. `ordinal` is allocated from that locked conversation and remains stable; deletion invalidates dependent evidence rather than renumbering retained messages.
- Design FKs/invalidation so Story 21.13 can synchronously remove reconstructable sessions, claims, values, and evidence on conversation/Trip deletion after finalization and conversion artifacts exist.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.2]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-39]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Multi-Turn-Clarification-And-Scoped-Context]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Multi-Turn-Clarification-And-Scoped-Preferences]
- [Source: tests/trip-recommendations.integration.test.ts]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.2` is normative. Contract AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Story 21.3: Run Bounded Preflight Clarification Before Main Answers


### Story

As a traveler, I want XuyenViet to ask follow-up questions until the relevant request is ready, so that detailed answers reflect my trip rather than a convenient wrong assumption.

### Acceptance Criteria

**Given** a traveler asks `Lịch trình 7 ngày Hà Nội - Đà Nẵng` without direction, party, or vehicle
**When** the profiled AI Ask command runs
**Then** AI Orchestration uses at most one versioned bounded `clarification_plan` attempt and one `clarification_extract` attempt under the existing synchronous extraction model purpose
**And** Retrieval validates the proposals while Chat/Trips alone persists state and deterministically decides readiness.

**Given** a dependent deliverable remains blocked after extraction
**When** the turn finalizes
**Then** one transaction persists the reduced clarification state, concise Vietnamese follow-up, extraction Usage, and replayable AI Ask success
**And** it returns any profile-permitted useful invariant guidance that does not depend on an unresolved material field
**And** it creates no Retrieval run, web call, selection manifest, prompt-render manifest, answer provenance, or main-answer model usage.

**Given** every hard-required field for an instance is resolved or an explicitly permitted bounded assumption is accepted
**When** main synthesis begins
**Then** the authoritative answer claim pins the exact ready instance IDs, session/content revisions, profiles, scope graph, Trip/proposal fences, and disclosed assumptions
**And** finalization rejects a stale or changed claim before any obsolete answer becomes visible.

**Given** the extraction model is missing, times out, returns invalid schema, or a retry races a persisted result
**When** preflight handles the failure
**Then** it preserves the user message/session, records failure Usage, returns safe retry guidance where possible, and never falls through to Retrieval, web, a streaming answer, or an unrecorded assumption
**And** profiled turns suppress `ai_ask.context_extraction.v1`, while unprofiled turns retain only its non-authoritative enrichment behavior.

**Given** the interaction is rendered on desktop or mobile
**When** clarification repeats across natural-language replies
**Then** resolved information remains visible through calm conversational acknowledgement, only unresolved material questions are asked, focus returns predictably to the composer, and pending/error states use practical Vietnamese
**And** `CLAR-01` through `CLAR-06`, `CLAR-15` through `CLAR-20`, and `CLAR-27` cover FR-5 and RTA-11 without exposing internal profile, model, command, or state names.

### Tasks / Subtasks

- [ ] Add versioned schema-constrained `clarification_plan` and `clarification_extract` builders/parsers to `packages/database/src/prompts.ts`, register their prompt versions in `packages/database/src/usage-constants.ts`, and invoke only `completeExtraction(...)` from `packages/database/src/gateway.ts` with the existing `extraction` model purpose (AC: 1, 4).
- [ ] Implement the bounded one-plan/one-extract coordinator in new `packages/database/src/planning-clarification-preflight.ts`; persist/replay attempts through `packages/database/src/planning-clarification-attempts.ts`, validate with `packages/database/src/planning-context-profiles.ts`, reduce through `packages/database/src/planning-clarification-state.ts`, and expose only `blocked | ready | unprofiled | retry` closed outcomes (AC: 1-4).
- [ ] Refactor `packages/database/src/ai-ask-commands.ts` so admission no longer unconditionally enqueues `ai_ask.context_extraction.v1`; add one idempotent helper there that enqueues the legacy event only after preflight returns `unprofiled`. Keep the existing event/dedupe contract in `packages/database/src/domain-outbox.ts` and create no event for profiled turns (AC: 4).
- [ ] Refactor the existing terminal transaction core in `packages/database/src/ai-ask-commands.ts` and add new owner composition `packages/database/src/planning-clarification-finalization.ts` implementing `finalizeClarificationTurn(...)`. A blocked/retry result must atomically reduce state, insert the bounded assistant clarification, append extraction Usage, and terminalize replayable success without enqueuing `ai_ask.context_extraction.v1`, `ai_ask.answer_annotation.v1`, or `ai_ask.trip_proposal_draft.v1`; the ready main-answer branch retains current annotation/proposal behavior (AC: 2-4).
- [ ] Integrate preflight before `assembleContextPrioritySourceBundle(...)` and before answer-model selection/streaming in `packages/database/src/ai-ask-stream-execution.ts`; pass the immutable ready claim into existing final fences and guarantee blocked/retry paths never call source-bundle, web, provenance, snapshot, or main-answer Usage writers (AC: 1-4).
- [ ] Render acknowledgement, unresolved questions, pending/error copy, and predictable composer refocus in `apps/web/src/features/ai/ai-ask-composer.tsx`; do not expose profile, attempt, command, model, or state names (AC: 5).
- [ ] Add `CLAR-01`-`CLAR-06`, `CLAR-15`-`CLAR-20`, and `CLAR-27` data to `tests/fixtures/planning-context-v6.ts`; extend `tests/ai-ask-commands.test.ts` and `tests/ai-ask-stream-execution.test.ts`, and add serial persistence/artifact-absence coverage in new `tests/planning-clarification-preflight.integration.test.ts` plus desktop/mobile focus/copy coverage in `tests/traveler-ui-foundation.test.ts` (AC: 1-5).
- [ ] Verify with `pnpm test:unit -- tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts tests/traveler-ui-foundation.test.ts`, `pnpm test:integration -- tests/planning-clarification-preflight.integration.test.ts`, `pnpm typecheck`, and `pnpm build`; record exact environmental blockers (AC: 1-5).

### Dev Notes

- Flow is fixed: AI Orchestration coordinates, Retrieval validates/evaluates, Chat/Trips persists. A blocked turn must not create a retrieval run, web request, selection or prompt-render manifest, answer provenance, or main-answer model usage.
- Depends on Stories 21.1 and 21.2. Attempt uniqueness is exactly `(AI Ask command, source message, expected session revision, prompt version)`; the blocked/retry outcome is terminally persisted and failure Usage goes through the Usage owner port.
- Preserve unprofiled legacy enrichment behavior. Reuse `ai-ask-commands.ts`, gateway model selection, and one refactored terminal transaction core; `finalizeClarificationTurn(...)` is an owner composition over that core, not a second command ledger or competing finalization authority.
- Browser language is concise Vietnamese, contains no internal profile/model/state names, acknowledges resolved context calmly, and returns focus predictably to the composer.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.3]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-39]
- [Source: packages/database/src/ai-ask-stream-execution.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Multi-Turn-Clarification-And-Scoped-Context]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Multi-Turn-Clarification-And-Scoped-Preferences]
- [Source: tests/ai-ask-stream-execution.test.ts]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.3` is normative. The five Given/When/Then blocks above map one-to-one to its five canonical criteria. Completion must satisfy both documents.

## Story 21.4: Preserve Applied Trip Authority Across Planning Modes


### Story

As a traveler, I want XuyenViet to distinguish my current plan from ideas and pending changes, so that exploratory advice cannot be mistaken for saved Trip state.

### Acceptance Criteria

**Given** an authenticated AI Ask has a validated URL scope and current-turn intent
**When** planning mode is resolved
**Then** it is exactly `current_plan`, `explore_change`, `validate_proposal`, or `unscoped_answer`
**And** the execution pins the relevant Trip aggregate, item, proposal, clarification-claim, and intent versions or explicitly records their absence.

**Given** the traveler asks about the current selected Trip
**When** context is assembled
**Then** only applied Trip state and the exact current snapshot are planning authority
**And** hypothetical, pending, dismissed, expired, stale, foreign, or chat-only values are not represented as the current plan.

**Given** the traveler explores a detour or reviews one pending proposal
**When** the answer is generated
**Then** the applied Trip remains the comparison baseline and proposed effects stay visibly hypothetical or pending
**And** only the existing owner-confirmed proposal Apply command may change subsequent current-plan authority.

**Given** mode ambiguity would materially change the answer or a pinned Trip/proposal changes during execution
**When** the final fence runs
**Then** safe invariant guidance plus one concise clarification is returned, or stale output is discarded/refreshed
**And** `PM-01` through `PM-07`, SC-9, SC-12, and AC-28 pass without private Trip-context leakage.

### Tasks / Subtasks

- [ ] Add browser-safe `PlanningTurnIntent`, `PlanningExecutionRef`, mode, proposal-ref, clarification-ref, and explicit-absence contracts/parsers to `packages/contracts/src/planning-context.ts`. The intent union is closed to `current_plan | explore_change | proposal_review | outside_trip | ambiguous` and pins its producer/prompt version plus canonical digest (AC: 1, 4).
- [ ] Extend the existing single `clarification_plan` prompt/result in `packages/database/src/prompts.ts` and `packages/database/src/planning-clarification-preflight.ts` to produce the bounded typed current-turn intent; validate it in new `packages/database/src/planning-intent.ts`. Do not add a model call or model purpose: Trip-scoped planning classification reuses the one Story 21.3 plan attempt, and missing/invalid intent becomes `ambiguous` rather than a guessed mode (AC: 1, 4).
- [ ] Implement deterministic owner/canonical-URL-scope/proposal/intent resolution in new `packages/database/src/planning-execution.ts`, then export it from `packages/database/src/index.ts`. Resolve `outside_trip` or absent URL Trip scope to `unscoped_answer`; require one current owner-scoped pending proposal for `validate_proposal`; pin the applied aggregate/items/path, clarification claim, and intent versions or explicit nulls (AC: 1-4).
- [ ] Resolve and pin `PlanningExecutionRef` before retrieval assembly in `packages/database/src/ai-ask-stream-execution.ts`; extend the existing final transaction fence in `packages/database/src/ai-ask-commands.ts` to revalidate intent, clarification, Trip, item, proposal status/revision/expiry, Apply/dismiss/delete, and explicit-absence fences before traveler-visible completion (AC: 1, 4).
- [ ] Change `packages/database/src/source-bundle.ts` to accept only `PlanningExecutionRef` for planning authority, and change `packages/database/src/answer-context.ts` to load the exact pinned applied snapshot. Remove mode inference from `tripProjectId`, transcript, `chat_context`, and conversation linkage; unscoped mode loads no Trip/path/proposal/constraint/project metadata (AC: 2-3).
- [ ] Add the server-owned mode/effect projection to `packages/contracts/src/planning-context.ts`, populate it from applied/pending/hypothetical state in `packages/database/src/index.ts`, and render its Vietnamese labels in `apps/web/src/features/ai/ai-ask-composer.tsx`. Keep the existing Apply command in `packages/database/src/traveler-proposal-commands.ts` as the sole durable authority change (AC: 3-4).
- [ ] Add `PM-01`-`PM-07` data to `tests/fixtures/planning-context-v6.ts`; add resolver tests in new `tests/planning-mode-resolver.test.ts`, serial scope/fence/privacy integration coverage in new `tests/planning-mode.integration.test.ts`, and desktop/mobile server-projection accessibility coverage in `tests/traveler-ui-foundation.test.ts` (AC: 1-4).
- [ ] Verify with `pnpm test:unit -- tests/planning-mode-resolver.test.ts tests/traveler-ui-foundation.test.ts`, `pnpm test:integration -- tests/planning-mode.integration.test.ts tests/private-turn-answer-context.integration.test.ts`, `pnpm typecheck`, and `pnpm build`; record exact environmental blockers (AC: 1-4).

### Dev Notes

- `unscoped_answer` loads no Trip snapshot, path, proposal, constraints, or project metadata, even for an owner with Trips.
- Depends on Story 21.3's authoritative clarification claim and existing Trip/proposal Apply boundaries. Mode resolution rejects stale/foreign URL scope and proposal references; `unscoped_answer` has null Trip/proposal references.
- The typed intent is proposal data from the existing bounded plan attempt, never authority by itself. `planning-execution.ts` deterministically resolves it against server-owned URL, owner, applied Trip, pending proposal, and clarification fences; an invalid or materially ambiguous proposal cannot silently fall back to `current_plan`.
- Pin applied aggregate/item/path or proposal revisions, or explicit absence. Apply/dismiss/expiry/deletion during generation invalidates output.
- Do not implement route registry, required-need retrieval, web verification, or conversion here.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-8]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29-and-AD-30]
- [Source: tests/private-turn-answer-context.integration.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Planning-Authority]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Planning-Modes]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.4` is normative. Contract AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Story 21.5: Preserve Canonical Trip Paths And Supported Route Coverage


### Story

As a traveler, I want route advice to reflect my selected path or real product coverage, so that text similarity cannot masquerade as journey authority.

### Acceptance Criteria

**Given** existing transport legs contain free-text endpoints
**When** the forward migration runs
**Then** canonical origin, destination, selected path, and registry-snapshot references remain null together unless explicitly owner-confirmed
**And** no migration, label parser, or model infers a durable route choice from historical text.

**Given** an owner reviews a typed route-choice proposal
**When** `applyApprovedTripChange(...)` applies `set-leg-path` or `clear-leg-path`
**Then** it validates owner, Trip/item versions, endpoint/path membership, active registry identity, and ordering preconditions before writing all route references atomically
**And** stale, retired, mismatched, unresolved, or unauthorized references apply nothing and return safe review guidance.

**Given** Retrieval publishes a route-registry release and coverage projections
**When** the bounded existing Worker operation validates and activates it
**Then** `publishRouteRegistryRelease(...)` is the sole writer, the release and dependencies are replayable, and partial failure leaves the previous release active
**And** deployment configuration cannot create a second registry authority.

**Given** a requested leg is selected, fully supported, partially supported, ambiguous, unsupported, or stale
**When** route resolution runs
**Then** it returns the corresponding `authoritative_selected`, `authoritative_complete`, `known_partial`, `ambiguous_paths`, `no_path`, or `stale_selected_path` state with bounded traveler guidance
**And** `RP-01` through `RP-10`, FR-16O..Q, FR-63..64, AC-29, and AC-30 pass without claiming live navigation or nationwide coverage.

### Tasks / Subtasks

- [ ] Extend `tripPlanItems` in `packages/database/src/schema.ts` with nullable canonical origin, canonical destination, selected path, and registry-snapshot references; add Retrieval-owned immutable release/location/segment/path/membership/coverage tables and forward migration `drizzle/migrations/0069_add_route_registry_and_trip_paths.sql`. Non-transport items require all four Trip route references null; transport legs require all four null or all four present, and the migration must leave every historical free-text leg all-null (AC: 1, 3).
- [ ] Add `TripLegRouteChoice`, `set-leg-path`, `clear-leg-path`, route-resolution, release-manifest, and traveler projection contracts/parsers to `packages/contracts/src/planning-context.ts`; extend the pending-proposal affected-operation projection in `packages/contracts/src/index.ts` (AC: 2-4).
- [ ] Extend proposal prompting in `packages/database/src/prompts.ts`, untrusted Worker parsing in `packages/worker-domain/src/features/ai/trip-proposal-draft.ts`, and Worker draft validation/persistence in `packages/worker-domain/src/features/chat-trips/trip-change-proposals.ts` for the two closed operation discriminators. Model output may draft exact IDs only from supplied server candidates and never grants route authority (AC: 2).
- [ ] Extend canonical normalization/write helpers in `packages/database/src/trip-plan-commands.ts` and the aggregate-locked apply/fence/history/projection paths in `packages/database/src/traveler-proposal-commands.ts` and `packages/database/src/index.ts`. `set-leg-path` revalidates owner, Trip/leg versions, transport discriminator, exact endpoints, active registry snapshot, path membership, and ordering before writing all four references; `clear-leg-path` clears all four; any failure writes nothing (AC: 2).
- [ ] Implement Retrieval-owned immutable validation, active-release CAS, exact OD/path lookup, and `resolveQueryLeg(...)` in new `packages/database/src/route-registry.ts`, export it from `packages/database/src/index.ts`, and make `packages/database/src/answer-context.ts` project the selected historical choice while `packages/database/src/source-bundle.ts` consumes only the Story 21.4 planning execution and typed resolution (AC: 3-4).
- [ ] Add the code-reviewed bounded reference manifest in new `packages/worker-domain/src/features/retrieval/route-registry-manifest.ts` and the sole transaction-aware `publishRouteRegistryRelease(...)` operation in new `packages/worker-domain/src/features/retrieval/route-registry-release.ts`; export it from `packages/worker-domain/src/index.ts` and invoke it through new one-shot `scripts/publish-route-registry-release.ts` plus `route-registry:publish` in `package.json`. Do not add a supervisor adapter, continuous loop, environment-selected authority, admin writer, or second endpoint (AC: 3).
- [ ] Project selected/stale/partial/ambiguous/no-path review state from `packages/database/src/index.ts` through `packages/contracts/src/planning-context.ts` and render bounded Vietnamese limitation/next-action copy in `apps/web/src/features/ai/ai-ask-composer.tsx`; only `authoritative_selected` and `authoritative_complete` permit hard route authority (AC: 3-4).
- [ ] Add `RP-01`-`RP-10` data to `tests/fixtures/planning-context-v6.ts`; extend `tests/trip-proposal-command-contract.test.ts`, and add DB-free validation/resolution/publisher tests in new `tests/route-registry.test.ts`, serial migration/release-CAS/proposal/fence/stale-release/set-clear-reopen coverage in new `tests/route-registry.integration.test.ts`, and traveler projection accessibility coverage in `tests/traveler-ui-foundation.test.ts` (AC: 1-4).
- [ ] Verify with `pnpm test:unit -- tests/trip-proposal-command-contract.test.ts tests/route-registry.test.ts tests/traveler-ui-foundation.test.ts`, `pnpm test:integration -- tests/route-registry.integration.test.ts`, `pnpm db:generate`, `pnpm typecheck`, and `pnpm build`; record exact environmental blockers (AC: 1-4).

### Dev Notes

- Free-text endpoint labels are query aids only. Never infer/backfill durable canonical choice from labels or model output.
- The four-field null rule is intentionally asymmetric by item type: non-transport items are always all-null; transport legs are either all-null or all-present. All-null transport legs remain valid historical/unselected state.
- Only the first two resolution states permit route authority. All other states must provide bounded Vietnamese next steps without live traffic, navigation, closure, nationwide, or safety guarantees.
- Consume Story 21.4 mode/fences; do not redefine planning authority or add a direct route-write endpoint.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.5]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29-AD-30-AD-35]
- [Source: packages/database/src/trip-plan-commands.ts]
- [Source: packages/database/src/traveler-proposal-commands.ts]
- [Source: tests/trip-proposal-command-contract.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Trip-Persistence-Delta]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Route-Registry-And-Resolution]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Canonical-Trip-Path-And-Route-Resolution]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.5` is normative. Contract AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Story 21.6: Retrieve And Pack Evidence By Required Planning Need


### Story

As a traveler, I want answers to cover important needs of my trip rather than merely related cards, so that missing guidance remains visible and actionable.

### Acceptance Criteria

**Given** a ready planning execution enters Retrieval
**When** the intent profile expands its needs
**Then** it creates deterministic versioned requirement keys with exact facet, importance, scope/leg, constraint, and freshness identity before candidate generation
**And** it validates current owner-row eligibility, resolves canonical geographic/facet authority, and persists a deterministic scope-first allowlist with stable order and bounded candidate inputs before lexical retrieval.

**Given** a deterministic scope-first allowlist exists
**When** the versioned field-aware lexical stage generates candidates
**Then** it searches only that allowlist using title, type, canonical route/location, summary, tags, and policy-allowlisted practical-detail fields
**And** source labels, URLs, publishers, capture/provenance/evidence/provider metadata, and other source metadata cannot create or improve lexical relevance.

**Given** the G0 deployed PostgreSQL/provider/Vietnamese lexical spike result is recorded
**When** Retrieval selects its v6 lexical implementation
**Then** PostgreSQL FTS activates only after deployability, candidate-recall, and critical false-exclusion gates pass
**And** otherwise `v6_active` uses the deterministic indexed field-aware lexical implementation and keeps FTS inactive.

**Given** candidate evidence contains mixed facts, different legs, duplicate coverage, or an off-scope high-prestige source
**When** eligibility and contribution decisions run
**Then** each contribution binds one exact eligible fact, owner/capture revision, scope/freshness decision, requirement key, and permitted render variant
**And** one fact, leg, source reputation, similarity score, or card-level shortcut cannot authorize another need or scope.

**Given** token, candidate, or source-handle capacity cannot retain every contribution
**When** the selector and final prompt packer run
**Then** consequential route, safety, and traveler constraints take priority and stable pre-cap telemetry records eligible exclusions
**And** every dropped required need becomes an explicit `missing`, `requires_verification`, or `requires_clarification` outcome before model generation.

**Given** one exact contribution covers the only required need or three cards leave a required need uncovered
**When** final coverage is recomputed from the prompt-render manifest
**Then** the first request is sufficient without count-only web fallback and the second keeps the gap despite its card count
**And** `RN-01` through `RN-07`, lexical allowlist/source-metadata/order/bound/fallback fixtures, FR-61..62, SC-8, SC-10, and AC-31 pass, including literal-zero hard-off-route, unrelated-need satisfaction, source-metadata leakage, and critical hard-filter/cap false exclusion.

### Tasks / Subtasks

- [ ] In `packages/database/src/schema.ts` and `drizzle/migrations/`, add one forward migration for Retrieval-owned runs, requirement keys, fact-bound contributions, outcomes, scope-first allowlists, pre-cap exclusions, and immutable selection manifests; export only aggregate-owned row types and transaction-aware ports from `packages/database/src/retrieval-required-needs.ts` and `packages/database/src/index.ts` (AC: 1, 4).
- [ ] In `packages/database/src/knowledge-search.ts` and `packages/database/src/approved-knowledge.ts`, replace source-metadata-weighted document scoring with the versioned field-aware projection over title, type, canonical route/location, summary, tags, and policy-allowlisted practical details; constrain candidate generation to the persisted allowlist with stable bound/order and pin the lexical/search-projection versions (AC: 1-3).
- [ ] In `packages/database/src/retrieval-required-needs.ts` and `packages/database/src/source-bundle.ts`, expand the pinned intent profile into deterministic requirement keys, bind each eligible atomic fact to one requirement/leg and render variant, prioritize consequential requirements, and persist `eligible_but_cap_excluded` plus explicit gap outcomes without retiring the legacy count trigger (AC: 1-5).
- [ ] In `packages/database/src/source-bundle.ts`, recompute final outcomes exclusively from the final prompt-render manifest after packing, owner/capture revision revalidation, and source-handle pressure immediately before provider generation; expose immutable prepared inputs for Story 21.8 without implementing its terminal transaction (AC: 4-6).
- [ ] In `_bmad-output/implementation-artifacts/evidence/story-21-6/g0-vietnamese-lexical-spike.md`, record the exact deployed PostgreSQL/provider version, Vietnamese corpus, SQL/CLI commands executed, allowlist/candidate bounds, recall and critical false-exclusion results, and the pass/fail decision. In `packages/database/src/knowledge-search.ts`, activate FTS only for a recorded passing result; otherwise select and test the deterministic indexed field-aware fallback (AC: 2-3, 6).
- [ ] In `tests/retrieval-required-needs.test.ts` and `tests/knowledge-search.test.ts`, add DB-free identity, coalescing, lexical field-isolation, stable-order, capacity, and `RN-01` through `RN-07` coverage; in `tests/retrieval-required-needs.integration.test.ts`, add serial PostgreSQL allowlist, owner-row revalidation, immutable provenance, pre-cap telemetry, revocation-before-render, and prompt-manifest recomputation coverage with local `resetTestDatabase()` setup (AC: 1-6).

#### Verification

- `pnpm test:unit -- tests/retrieval-required-needs.test.ts tests/knowledge-search.test.ts`
- `pnpm test:integration -- tests/retrieval-required-needs.integration.test.ts`
- `pnpm typecheck`
- `pnpm exec drizzle-kit check`
- `git diff --check`

#### Block If

- Stories 21.1, 21.4, and 21.5 are not complete or their pinned profile, `PlanningExecutionRef`, and route-resolution contracts are unavailable.
- FTS activation is blocked when `_bmad-output/implementation-artifacts/evidence/story-21-6/g0-vietnamese-lexical-spike.md` is absent, incomplete, or failing. No repository spike runner exists at story creation time; record the exact commands actually executed rather than inventing a passing script. This blocks FTS only: the story must proceed with the deterministic indexed field-aware fallback.

### Dev Notes

- Requirement identity includes intent-profile version, facet, importance, scope/leg, constraint, and freshness. Final coverage comes exclusively from the prompt-render manifest.
- Consume Story 21.1 profile identities, Story 21.4 `PlanningExecutionRef`, and Story 21.5 route-resolution output with their pinned fences; stale inputs fail closed rather than being re-derived from chat or Trip rows.
- Retrieval is sole writer for runs, keys, contributions, outcomes, and selection manifests; AI Orchestration may coordinate but cannot write Retrieval tables.
- Do not retire the legacy target-count trigger in this story; Story 21.12 owns behavioral retirement and Story 21.16 owns later physical cleanup after G3.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-34-and-AD-36]
- [Source: packages/database/src/source-bundle.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Required-Needs-And-Coverage]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Required-Need-Coverage-And-Capacity]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.6` is normative. Contract AC 1 maps to canonical allowlist/key creation, AC 2 to fact-bound contribution safety, AC 3 to capacity outcomes, and AC 4 to final coverage plus lexical isolation/fallback proof. Completion must satisfy both documents.

## Story 21.7: Verify Fresh External Facts Through Replayable Web Scope


### Story

As a traveler, I want changing external information checked for the exact place, route, and time, so that unrelated or old warnings are not presented as live route authority.

### Acceptance Criteria

**Given** a required need is missing, freshness-sensitive, conflicted, or explicitly requests current verification
**When** web fallback is permitted
**Then** Retrieval persists an immutable minimized query-plan manifest with exact requirement keys, allowed canonical scope terms, excluded private-context classes, policy versions, and request digest before Search is called
**And** private Trip notes, child details, budget, or preferences are not sent unless the exact requirement permits that value.

**Given** Search returns a result containing multiple facts or geographic references
**When** fact extraction and scope resolution run
**Then** immutable fact-level assertions pin capture payload, text digest, parser/segmentation, registry, and resolver versions, and one query-specific decision binds the exact assertion to one requirement/leg
**And** mismatched, ambiguous, or unknown scope cannot satisfy coverage or become a factual premise.

**Given** a recent warning describes an earlier closure or the provider fails
**When** the traveler answer is rendered
**Then** the warning retains source, applicable place/time, unverified status, and practical verification action without being described as live closure, traffic, navigation, or guaranteed safety
**And** provider failure preserves the gap and returns bounded useful recovery rather than fail-open certainty.

**Given** the same capture is replayed or a query/parser/resolver dependency changes
**When** projection identity is evaluated
**Then** unchanged dependencies reproduce the same decision while changed dependencies create a new immutable projection
**And** `WS-01` through `WS-07`, FR-35, FR-65, SC-11, and AC-32 pass with complete query-to-fact-to-render provenance.

### Tasks / Subtasks

- [ ] In `packages/database/src/schema.ts` and `drizzle/migrations/`, add one forward migration for immutable web query-plan manifests, captures, fact assertions, scope projections, query-specific decisions, and their run/requirement/leg/version fences; export Retrieval/Search transaction-aware owner ports from `packages/database/src/web-evidence-scope.ts` and `packages/database/src/index.ts` (AC: 1-4).
- [ ] In `packages/database/src/web-search.ts`, replace whole-question admission with a bounded request built only from Story 21.6 requirement keys and Story 21.5 canonical allowed scope terms; persist the minimized manifest before the provider call and exclude private context unless the exact requirement policy permits it (AC: 1).
- [ ] In `packages/database/src/web-evidence-scope.ts`, segment each captured result into immutable assertions, pin payload/text/parser/segmentation/registry/resolver identities, and persist one exact assertion-to-requirement/leg decision whose replay identity changes whenever a dependency changes (AC: 2, 4).
- [ ] In `packages/database/src/source-bundle.ts` and `packages/database/src/provenance.ts`, admit only applicable exact/reviewed web decisions as contributions, preserve mismatched/ambiguous/unknown results as gaps or verification leads, and render source/place/time/unverified/action fields without live-authority wording (AC: 2-4).
- [ ] In `packages/database/src/web-evidence-scope.ts`, expose immutable prepared decision/contribution rows and transaction-aware sealing ports for Story 21.8. Do not require `finalizeAiAnswer(...)` to exist yet and do not add a second terminalizer; the current AI Ask path may consume the prepared projection until Story 21.8 composes owner ports atomically (AC: 2-4).
- [ ] In `tests/web-evidence-scope.test.ts`, `tests/web-search-adapter.test.ts`, and `tests/web-search-quality.test.ts`, add DB-free minimization/privacy, ordering, exact-scope, replay, prior-warning, provider-failure, and `WS-01` through `WS-07` coverage; in `tests/web-evidence-scope.integration.test.ts`, add serial PostgreSQL query-to-capture-to-assertion-to-decision-to-contribution-to-render provenance and immutable dependency-change coverage with local `resetTestDatabase()` setup (AC: 1-4).

#### Verification

- `pnpm test:unit -- tests/web-evidence-scope.test.ts tests/web-search-adapter.test.ts tests/web-search-quality.test.ts`
- `pnpm test:integration -- tests/web-evidence-scope.integration.test.ts`
- `pnpm typecheck`
- `pnpm exec drizzle-kit check`
- `git diff --check`

#### Block If

- Stories 21.5 and 21.6 are not complete or their pinned route/scope resolution and immutable requirement-key contracts are unavailable.

### Dev Notes

- Available private context is not authorization. Never send notes, child details, budgets, or preferences unless explicitly permitted by the exact key.
- A warning retains source/place/time, unverified status, and verification action; it must never become live closure, traffic, navigation, or guaranteed-safety authority.
- Retrieval owns decisions; AI Orchestration owns prompt-render/provenance. Add no endpoint, service, worker loop, or runtime configuration authority.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.7]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-35-and-AD-36]
- [Source: packages/database/src/web-search.ts]
- [Source: tests/web-search-quality.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Web-Evidence-Scope]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Web-Scope-And-Freshness]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.7` is normative. Contract AC 1-4 map one-to-one to the four canonical criteria. Completion must satisfy both documents.

## Story 21.8: Finalize Planning Evidence Atomically


### Story

As a traveler, I want completed answers internally consistent, so that retries and failures leave no partial or competing terminal state.

### Acceptance Criteria

**Given** a required-need execution is ready for a provider call
**When** `prepareAiAnswerRun(...)` persists its prepared state
**Then** the run, selection, bounded prompt inputs, planning/clarification identities, and idempotency fence are committed before provider work
**And** retries cannot create competing authoritative executions.

**Given** provider work succeeds or fails
**When** `finalizeAiAnswer(...)` terminalizes the command
**Then** one PostgreSQL transaction coordinates Chat/Trips message writes, Retrieval run sealing, Usage append, and AI Orchestration prompt/provenance writes through owner ports
**And** failure records no completed message, while duplicate retry cannot create a second terminal outcome.

**Given** finalization fences change or a retry races an existing terminal command
**When** `finalizeAiAnswer(...)` attempts terminalization
**Then** it discards stale output or returns the existing terminal result without partial writes
**And** prepared/finalized state remains unavailable as traveler content until the owning finalization transaction commits.

### Tasks / Subtasks

- [ ] In `packages/database/src/schema.ts` and `drizzle/migrations/`, add the prepared/finalized/failed run state, immutable bounded-input identities, and idempotency/finalization fences required by `prepareAiAnswerRun(...)`; expose the new module from `packages/database/src/index.ts` (AC: 1).
- [ ] In new `packages/database/src/planning-answer-runs.ts`, implement idempotent `prepareAiAnswerRun(...)` before provider work and transaction-scoped `finalizeAiAnswer(...)`. Define explicit Chat/Trips, Retrieval, Usage, and AI Orchestration owner-port interfaces; the coordinator may call those ports but must not import another owner's tables (AC: 1-3).
- [ ] In `packages/database/src/ai-ask-commands.ts`, keep `finalizeAiAskCommand(...)` as the existing command-level lock, lifecycle/Trip fence, and one-transaction boundary; extend its callback context with content, clarification claim, profile, scope, assumption, Trip, and proposal fence identities and make duplicate terminal replay return the existing terminal result (AC: 2-3).
- [ ] In `packages/database/src/ai-ask-stream-execution.ts`, call `prepareAiAnswerRun(...)` after the final prompt-render manifest is assembled and before the provider call, then replace direct cross-owner final writes with `finalizeAiAskCommand(commandId, (transaction, command) => finalizeAiAnswer(transaction, command, preparedRun, providerResult))`; preserve streaming as a best-effort relay only (AC: 1-3).
- [ ] In `packages/database/src/source-bundle.ts`, `packages/database/src/provenance.ts`, and `packages/database/src/usage.ts`, implement the transaction-aware Retrieval, AI Orchestration, and Usage port adapters consumed by `finalizeAiAnswer(...)`; require each claimed bounded assumption to appear in the prompt-render manifest and fail the whole finalization when a disclosure or fence is missing (AC: 2-3).
- [ ] In `tests/planning-answer-finalization.test.ts`, add DB-free prepared/finalized/failed state and assumption-disclosure validation; in `tests/planning-answer-finalization.integration.test.ts`, `tests/ai-ask-commands.test.ts`, and `tests/ai-ask-stream-execution.test.ts`, add serial PostgreSQL prepare-before-provider, owner-port rollback, failure-Usage-with-no-completed-message, stale-fence discard, duplicate terminal replay, and traveler-invisibility coverage with local `resetTestDatabase()` setup (AC: 1-3).

#### Verification

- `pnpm test:unit -- tests/planning-answer-finalization.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts`
- `pnpm test:integration -- tests/planning-answer-finalization.integration.test.ts`
- `pnpm typecheck`
- `pnpm exec drizzle-kit check`
- `git diff --check`

#### Block If

- Stories 21.1 through 21.7 are not complete or do not expose the pinned planning, clarification, scope, selection, web-decision, and prompt-render identities required by preparation and finalization.

### Dev Notes

- Reuse `finalizeAiAskCommand(...)`, but stop making stream execution a cross-owner direct-write hub. The coordinator does not import or write other owners' tables.
- Ordinary conversation deletion must leave unrelated Trips unchanged. Primary conversation deletion replaces it or deletes its Trip; no orphan. Keep only approved non-content audit/aggregate fields.
- Story 21.13 owns deletion invalidation after Story 21.10 creates conversion artifacts. Do not implement conversation or Trip deletion here.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.8]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13-and-AD-36]
- [Source: packages/database/src/ai-ask-commands.ts]
- [Source: packages/database/src/ai-ask-stream-execution.ts]
- [Source: packages/database/src/index.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Replay-Identity-And-Manifests]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.8` is normative. Contract AC 1-2 map to prepared/finalized persistence and owner-port finalization; contract AC 3-4 map to stale-fence and no-partial-write behavior. Deletion requirements moved to Story 21.13.

## Story 21.9: Keep A Current Chat-To-Trip Opportunity Available


### Story

As a traveler, I want a persistent `Chuyển thành chuyến đi` action when chat has useful planning context, so that I can convert it when ready.

### Acceptance Criteria

**Given** an unscoped profiled turn commits a useful answer with at least one supported explicit planning operation
**When** the same terminalization path refreshes Trip conversion state
**Then** Chat/Trips exposes one owner-bound stable opportunity and persistent `Chuyển thành chuyến đi` CTA from canonical clarification claims without consulting the suppressed background extractor or legacy flat `chat_context`
**And** not clicking, navigation, unmount, timeout, or hiding the control records no dismissal or decline fence.

**Given** completed later turns replace or add compatible scoped values, reopen a deliverable, create ambiguity, or remain unterminated
**When** the server projects the opportunity
**Then** the canonical conversion projection deterministically reduces all eligible non-superseded claims, refreshes the manifest, suspends recoverable ambiguity/insufficiency, or returns a server-owned visible-disabled pending state
**And** another tab cannot accept an older or unterminated context revision.

**Given** the traveler explicitly dismisses or later resolves suspended context
**When** the upgraded existing decline/refresh owner ports run
**Then** only explicit dismissal records the exact material-context fence and terminalizes that opportunity, while resolved context restores the same suspended ID with a new manifest
**And** later eligible context after dismissal creates a new opportunity rather than reactivating the dismissed ID.

**Given** the opportunity UI is rendered on desktop, mobile, or another active tab
**When** eligibility, pending-turn, suspension, dismissal, or refreshed-manifest state changes
**Then** it uses the server projection, remains keyboard/touch accessible, refetches after terminal AI Ask events, and never infers eligibility solely from local streaming state
**And** `TC-01` through `TC-05`, `TC-11` through `TC-16`, `TC-19`, and `TC-20` pass for FR-16J..L, PJ-01, and RTA-13.

### Tasks / Subtasks

- [ ] In `packages/database/src/schema.ts` and `drizzle/migrations/`, evolve the existing recommendation tables in place into stable opportunity, canonical projection revision, immutable manifest/digest, decline-fence, and closed-transition persistence; retain one ordinary-conversation/nonterminal-opportunity invariant and add no second aggregate (AC: 1-3).
- [ ] In `packages/database/src/trip-recommendations.ts`, replace profiled reads of `chat_context` and `ai_ask.context_extraction.v1` with canonical completed clarification claims; implement deterministic claim reduction, stable manifest refresh, `eligible -> suspended|dismissed|invalidated` and `suspended -> eligible|invalidated` transitions, pending-turn visible-disabled projection, and same-lock/version CAS for refresh/dismiss/delete (AC: 1-3).
- [ ] In new `packages/domain/src/trip-conversion-opportunities.ts` and `packages/domain/src/index.ts`, define and startup-validate the finite code-shipped `TripConversionProjectionPolicy`; reject empty/over-limit catalogs, duplicate or conflicting field/scope mappings, unknown fields/operations, incompatible schemas, and invalid title rules before any opportunity becomes eligible (AC: 1-3; mandatory `TC-13`).
- [ ] In `packages/contracts/src/index.ts`, `packages/domain/src/index.ts`, `apps/api/src/conversations/traveler-commands.controller.ts`, and `apps/api/src/openapi.controller.ts`, evolve the existing recommendation projection and accept/dismiss bodies from `decisionId` to `opportunityId`, add `eligible` and `visible_disabled` server projections, and preserve the existing endpoint identities (AC: 1-4).
- [ ] In `packages/database/src/ai-ask-commands.ts`, `packages/database/src/ai-ask-stream-execution.ts`, and `packages/database/src/index.ts`, invoke `refreshTripConversionOpportunity(...)` through the Chat/Trips transaction-aware owner port after profiled clarification reduction or `finalizeAiAnswer(...)` and before returning the final projection; do not create a competing finalizer, outbox event, Worker, or asynchronous eligibility path (AC: 1, 4).
- [ ] In `apps/web/src/features/ai/direct-api-client.ts` and `apps/web/src/features/ai/ai-ask-composer.tsx`, render the persistent `Chuyển thành chuyến đi` CTA from the server projection, preserve it while eligible, disable it for a pending newer turn, use `opportunityId` for accept/dismiss, and refetch after every terminal AI Ask event without inferring durable status from local stream state (AC: 1, 4).
- [ ] In `tests/trip-conversion-opportunities.test.ts`, `tests/trip-recommendations.test.ts`, and `tests/direct-shell-proposal-actions.test.ts`, add DB-free policy/projection/presentation, keyboard/touch, and `TC-01` through `TC-05`, `TC-11` through `TC-16`, `TC-19`, `TC-20` coverage; in `tests/trip-conversion-opportunities.integration.test.ts` and `tests/trip-recommendations-api.integration.test.ts`, add serial PostgreSQL manifest/CAS/ownership/pending-tab/dismiss/refresh and opportunity-only conversation-deletion cascade tests with local `resetTestDatabase()` setup (AC: 1-4).

#### Verification

- `pnpm test:unit -- tests/trip-conversion-opportunities.test.ts tests/trip-recommendations.test.ts tests/direct-shell-proposal-actions.test.ts`
- `pnpm test:integration -- tests/trip-conversion-opportunities.integration.test.ts tests/trip-recommendations-api.integration.test.ts`
- `pnpm typecheck`
- `pnpm exec drizzle-kit check`
- `git diff --check`

#### Block If

- Story 21.8 is not complete or its atomic `finalizeAiAnswer(...)` transaction-aware Chat/Trips owner port is unavailable.
- Full cross-owner deletion/invalidation remains Story 21.13. This story tests only opportunity/manifest state owned by Chat/Trips and must not claim the complete Retrieval/evaluation deletion matrix.

### Dev Notes

- Depends on Story 21.8's atomic finalization path; opportunity refresh extends that terminalization and must not create a competing finalizer.
- AD-40/RTA-13: Chat/Trips owns closed opportunity transitions `eligible -> suspended|dismissed|consumed|invalidated` and `suspended -> eligible|invalidated`.
- One ordinary conversation has one current nonterminal opportunity and manifest. Pending newer turn is visible-disabled projection only, never dismissal.
- Manifest pins revisions, claims/value IDs, policy/schema/serialization versions, source watermark, typed payload, and digest. Fail closed for ambiguity, assumptions-only, unsupported or digest mismatch.
- No Worker, queue, feature flag, model purpose, service, or cache. Vietnamese-first copy and browser authority remain server-owned.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-40]
- [Source: packages/database/src/trip-recommendations.ts]
- [Source: apps/web/src/features/ai/ai-ask-composer.tsx]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Persistent-Chat-To-Trip-Conversion]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware-solution-design.md#Persistent-Chat-To-Trip-Conversion]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.9` is normative. Contract AC 1-4 map one-to-one to its four canonical criteria. `TC-13` is required before completion and before Story 21.10 starts.

## Story 21.10: Convert The Latest Eligible Context Into A Reviewable Trip


### Story

As a traveler, I want current eligible chat context converted into a reviewable Trip proposal, so that nothing is copied or applied until I approve structured changes.

### Acceptance Criteria

**Given** the traveler clicks the eligible CTA
**When** the upgraded existing `acceptTripCreationRecommendation(...)` command executes with `opportunityId` and idempotency key
**Then** it revalidates the latest canonical projection, terminal AI Ask watermark, claims, scopes, policy/schema/serialization, typed payload digest, owner, conversation, and deletion fences
**And** one transaction creates exactly one Trip, a separate primary conversation, and one initial pending Trip Change Proposal, returning destination plus `proposalId`.

**Given** conversion succeeds
**When** the created Trip and original chat are inspected before proposal Apply
**Then** no transcript, assistant prose, prompt, provider payload, model reasoning, ambiguous value, unresolved field, or assumption-only operation was copied or linked, and no transferred value is applied Trip state
**And** only the existing owner-confirmed Apply command may change constraints, anchors, legs, stays, meals, activities, or route choices.

**Given** conversion retries, races deletion, or the traveler chooses an existing Trip
**When** idempotency/deletion/continue behavior is evaluated
**Then** refresh and transient failure do not burn the key, successful replay returns the same live destination/proposal, deleted destination returns `destination_deleted`, and concurrent accept/dismiss/refresh/delete permits one legal CAS transition
**And** `continueInTrip(...)` changes only URL scope to the existing primary conversation and imports no chat context or proposal.

**Given** the in-place migration is implemented
**When** database, domain, wire contract, controller/OpenAPI, direct client, and composer changes are reviewed
**Then** the existing recommendation aggregate and accept/decline endpoints evolve from `decisionId` to `opportunityId`, share the existing proposal operation parser/validator/serializer, refetch after terminal AI Ask events, and add no parallel endpoint, Worker, service, cache, dependency, model purpose, or environment flag
**And** `TC-06` through `TC-10`, `TC-13`, `TC-17`, and `TC-18` pass for FR-16J..L, PJ-01, and RTA-13.

### Tasks / Subtasks

- [ ] In new `packages/domain/src/trip-change-proposals.ts` and `packages/domain/src/index.ts`, extract the closed `TripChangeProposalOperation` union, parser, validator, and canonical serializer from `packages/worker-domain/src/features/chat-trips/trip-change-proposals.ts`; update that Worker file and `packages/database/src/traveler-proposal-commands.ts` to consume the shared contract so conversion cannot reverse-import Worker internals or duplicate proposal rules (AC: 1-4).
- [ ] In `packages/database/src/trip-recommendations.ts`, upgrade only `acceptTripCreationRecommendation(...)` and conversion replay/tombstone behavior; Story 21.9 already owns dismissal/refresh migration. Lock the owner conversation/opportunity, resolve the latest server manifest, reject a newer unterminated turn, revalidate all pinned claims/versions/payload/digest/deletion fences, and derive the request digest from command version, owner, opportunity, and resolved manifest digest (AC: 1, 3-4).
- [ ] In `packages/database/src/trip-recommendations.ts`, `packages/database/src/primary-conversation.ts`, `packages/database/src/schema.ts`, and `drizzle/migrations/`, make one transaction consume the opportunity, create exactly one Trip and separate primary conversation, insert one initial `pending` proposal from the shared validated payload, and persist non-content success replay plus destination tombstone data; copy or link no chat/provider content and apply no Trip value (AC: 1-3).
- [ ] In `packages/contracts/src/index.ts`, `packages/domain/src/index.ts`, `apps/api/src/conversations/traveler-commands.controller.ts`, and `apps/api/src/openapi.controller.ts`, complete the existing endpoint contract with `opportunityId`, success `proposalId`, and `destination_deleted` while preserving CSRF/idempotency admission and the current route identity (AC: 1, 3-4).
- [ ] In `apps/web/src/features/ai/direct-api-client.ts` and `apps/web/src/features/ai/ai-ask-composer.tsx`, submit only `opportunityId` plus the idempotency key, preserve the key across refresh-required/transient retry, route success to the returned destination/proposal review, project `destination_deleted` without stale identifiers, and keep `continueInTrip(...)` as URL-scope-only behavior (AC: 1-4).
- [ ] In `tests/trip-conversion-command.test.ts`, `tests/trip-recommendations.test.ts`, and `tests/trip-proposal-command-contract.test.ts`, add DB-free shared parser/validator/canonical-serialization and idempotency-digest coverage; in `tests/trip-conversion-command.integration.test.ts`, `tests/trip-recommendations.integration.test.ts`, and `tests/trip-recommendations-api.integration.test.ts`, add serial PostgreSQL owner-lock/CAS/API/source-deletion/destination-tombstone/no-content-copy/no-pre-Apply-mutation coverage with local `resetTestDatabase()` setup, including `TC-06` through `TC-10`, `TC-13`, `TC-17`, and `TC-18` (AC: 1-4).

#### Verification

- `pnpm test:unit -- tests/trip-conversion-command.test.ts tests/trip-recommendations.test.ts tests/trip-proposal-command-contract.test.ts`
- `pnpm test:integration -- tests/trip-conversion-command.integration.test.ts tests/trip-recommendations.integration.test.ts tests/trip-recommendations-api.integration.test.ts`
- `pnpm typecheck`
- `pnpm exec drizzle-kit check`
- `git diff --check`

#### Block If

- Story 21.9 is not complete, including mandatory `TC-13` projection-policy validation and the `opportunityId` accept/dismiss wire cutover.
- The shared proposal parser, validator, and canonical serializer cannot be extracted without changing proposal semantics. Resolve that shared-contract boundary before implementing conversion; do not import `packages/worker-domain` from `packages/database` or create a second validator.

### Dev Notes

- Depends on completed Story 21.9 including mandatory `TC-13` projection-policy validation. Proposal Apply remains the sole Trip-state mutation boundary. Conversion is review-first and must not create a separate conversion endpoint, service, worker, cache, dependency, model purpose, or runtime flag.
- Idempotency digest derives from command version, owner, opportunity, and resolved manifest digest. Only committed success reserves the key; deleted destination retains non-content replay information only.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.10]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30-and-AD-40]
- [Source: packages/database/src/trip-recommendations.ts]
- [Source: packages/database/src/traveler-proposal-commands.ts]
- [Source: tests/trip-recommendations-api.integration.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Persistent-Chat-To-Trip-Conversion]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware-solution-design.md#Persistent-Chat-To-Trip-Conversion]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.10` is normative. Contract AC 1-4 map one-to-one to its four canonical criteria; `TC-13` is an upstream Story 21.9 prerequisite and `TC-06`-`TC-10`, `TC-17`, and `TC-18` remain this story's proof.

## Story 21.13: Invalidate Planning Evidence On Conversation And Trip Deletion


### Story

As a traveler, I want deleted planning data to stop influencing the system, so that a deleted conversation or Trip cannot leave reconstructable state behind.

### Acceptance Criteria

**Given** an ordinary conversation, primary conversation, or Trip is deleted
**When** Chat/Trips coordinates owner invalidator ports
**Then** every reconstructable clarification graph/session/claim/value, plan/extract attempt and payload, task digest, query plan, retrieval execution/run, web decision, manifest, conversion opportunity/manifest/nonterminal replay state, derived context, embedding, diagnostic, Trip snapshot, canonical route choice, Trip proposal, and production-evaluation membership is invalidated in one transaction
**And** ordinary-chat deletion leaves an unrelated Trip unchanged, while primary-conversation deletion replaces the primary conversation or deletes the Trip without orphaning it.

**Given** audit or aggregate evaluation remains after deletion
**When** it is inspected
**Then** it contains only approved non-content identity, actor/operation class, timestamp, or aggregate metrics
**And** it cannot reconstruct the question, answer, Trip state, route, source text, or planning context.

**Given** deletion races finalization, conversion, or evaluation work
**When** the transaction fences execute
**Then** stale work cannot restore or mutate deleted state
**And** `DEL-01` through `DEL-04`, `CLAR-10`, `CLAR-27`, FR-15, PCR-09, and AC-33 pass in serial integration tests.

### Tasks / Subtasks

- [ ] `packages/domain/src/planning-evidence-invalidation.ts` (NEW) — define transaction-aware Chat/Trips, AI Orchestration, Retrieval, Trip conversion, projection/embedding, and Feedback/Eval invalidator ports. Each owner receives only owner-scoped IDs plus the shared transaction and returns a bounded non-content result; no generic cross-owner table writer is allowed (AC: 1-3).
- [ ] `packages/database/src/ai-ask-commands.ts`, `packages/database/src/ai-ask-stream-execution.ts`, and `packages/database/src/planning-evidence-invalidation.ts` (NEW) — implement AI Orchestration and Retrieval invalidators for plan/extract attempts, task/query digests, executions/runs, web decisions, selection/would-render/prompt manifests, derived context, embeddings, reconstructable diagnostics, and production-evaluation membership that exists after Stories 21.1-21.10 (AC: 1-3).
- [ ] `packages/database/src/trip-recommendations.ts`, `packages/database/src/traveler-proposal-commands.ts`, and `packages/database/src/primary-conversation.ts` — invalidate conversion opportunities/manifests and nonterminal replay state created by Story 21.10 while retaining only bounded non-content replay/audit fields (AC: 1-3).
- [ ] `packages/database/src/index.ts` and `packages/domain/src/index.ts` — extend the existing `deleteConversation(...)` and `deleteTripProject(...)` command/port boundary to coordinate all owner invalidators in the existing PostgreSQL transaction. Preserve the current primary-conversation replacement behavior, unrelated Trip isolation, owner locks, lifecycle fences, and audit semantics at `packages/database/src/index.ts:202-247` (AC: 1-3).
- [ ] `packages/database/src/schema.ts`, `drizzle/migrations/`, and `drizzle/migrations/meta/_journal.json` — only if completed upstream schemas lack an owner/lifecycle fence, add the minimal next Drizzle-generated forward migration needed for atomic invalidation and run `pnpm db:generate`; do not create persistence for Story 21.11 tables early or edit historical migrations (AC: 1, 3).
- [ ] `tests/planning-evidence-invalidation.test.ts` (NEW) and `tests/planning-evidence-deletion.integration.test.ts` (NEW) — cover redaction, the complete owner map, ordinary/primary/Trip deletion, unrelated Trip isolation, non-reconstructable retained audit, finalization/conversion/evaluation races, `DEL-01`-`DEL-04`, `CLAR-10`, and `CLAR-27`; the integration file calls `resetTestDatabase()` locally (AC: 1-3).
- [ ] Run `pnpm test:unit -- tests/planning-evidence-invalidation.test.ts`, `pnpm test:integration -- tests/planning-evidence-deletion.integration.test.ts tests/trip-recommendations.integration.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` (AC: 1-3).

### Dev Notes

- Depends on Stories 21.8 and 21.10. Chat/Trips coordinates deletion; each owning module invalidates its own reconstructable state through a port.
- Keep only approved non-content audit and aggregate fields. Do not add a deletion worker or a deferred cleanup path.
- Story 21.11 must extend `packages/database/src/planning-evidence-invalidation.ts` for its new qualification, shadow, comparison, report-membership, and read-policy evidence rows and rerun the paired deletion coverage. Story 21.13 must not create fake future tables to claim that extension early.

#### Invalidator Owner Map

| Owner | Transaction-aware port | Implementation path |
| --- | --- | --- |
| Chat/Trips coordinator | `deleteConversation(...)`, `deleteTripProject(...)` | `packages/database/src/index.ts` |
| AI Orchestration | `invalidateAiOrchestrationEvidence(...)` | `packages/database/src/ai-ask-commands.ts`, `packages/database/src/ai-ask-stream-execution.ts` |
| Retrieval | `invalidateRetrievalEvidence(...)` | `packages/database/src/planning-evidence-invalidation.ts` |
| Trip conversion | `invalidateTripConversionEvidence(...)` | `packages/database/src/trip-recommendations.ts`, `packages/database/src/traveler-proposal-commands.ts`, `packages/database/src/primary-conversation.ts` |
| Planning projections/embeddings | `invalidatePlanningProjections(...)` | `packages/database/src/planning-evidence-invalidation.ts` |
| Feedback/Eval membership | `invalidateEvaluationMembership(...)` | `packages/database/src/planning-evidence-invalidation.ts`; Story 21.11 extends this port for its new tables |

#### Block If

- Stories 21.8 and 21.10 are not `done`, or their File Lists do not identify the finalization and conversion persistence that deletion must invalidate.
- Any owner invalidator cannot participate in the caller's PostgreSQL transaction, or the implementation would require direct cross-owner writes, a deferred worker, or a best-effort cleanup path.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.13]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13-and-AD-36]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Deletion-Matrix]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Deletion-And-Ownership]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]
## Story 21.11: Establish V6 Retrieval Qualification Infrastructure


### Story

As a product owner, I want qualification and read-policy infrastructure before evidence collection, so that later evidence and activation cannot weaken safety, privacy, provenance, or operations.

### Acceptance Criteria

**Given** Feedback/Eval defines the v6.2 qualification profile
**When** G0 validation runs
**Then** the closed versioned profile contains numeric cohort thresholds, literal-zero safety limits, literal-one provenance correctness, minimum run/duration windows, and every required context/conversion/route/retrieval/web/deletion metric
**And** missing, unknown, null, prose-only, weakened, malformed, or structurally incompatible profiles/policies cannot start an evidence window.

**Given** fixture and dependency manifests are prepared
**When** an evaluation run begins
**Then** it pins the exact code, read policy, corpus, fixtures, registry/coverage, requirement/context/clarification/conversion/proposal/serialization, retrieval, parser/resolver, prompt/model, and evaluator versions
**And** any changed comparable member restarts the evidence window rather than averaging incompatible results.

**Given** Retrieval runs in `v6_shadow`
**When** an authoritative legacy request is paired with the v6 candidate
**Then** exactly one immutable execution contains one authoritative legacy run and at most one shadow run, and only the authoritative role may select/persist a traveler answer or write provider, prompt, provenance, or usage effects
**And** shadow stores only bounded `would-render` evaluation data and performs no web/model call or traveler mutation.

**Given** qualification infrastructure is used to prepare a cutover decision
**When** a report or policy is invalid, incomplete, or missing a qualified target
**Then** it cannot activate `v6_active`
**And** `GATE-01` through `GATE-05` and `COMP-03` through `COMP-05` remain reproducible before Story 21.14 evidence collection and Story 21.15 cutover.

### Tasks / Subtasks

- [ ] `packages/database/src/schema.ts`, `drizzle/migrations/`, and `drizzle/migrations/meta/_journal.json` — add Feedback/Eval-owned gate/corpus/cohort/run/report/approval persistence and Retrieval-owned read-policy/cutover/execution/run/shadow-comparison/would-render persistence through the next Drizzle-generated forward migration. The gate profile designates the exact Feedback/Eval and Product Owner actor identities allowed to sign its reports; do not invent a new application role or edit historical migrations/snapshots by hand (AC: 1-4).
- [ ] `packages/domain/src/retrieval-qualification.ts` (NEW) and `packages/database/src/retrieval-qualification.ts` (NEW) — implement the closed DB-free profile/tuple/report validators and Feedback/Eval repository. G0 must persist mandatory fixture IDs, metric-definition versions, legacy baseline, source-metadata leakage cases, reviewed Trip proposal/schema design, and the deployed PostgreSQL/provider/Vietnamese lexical spike result; an absent or failing prerequisite returns a fail-closed result (AC: 1-2, 4).
- [ ] `packages/domain/src/retrieval-read-policy.ts` (NEW) and `packages/database/src/retrieval-read-policy.ts` (NEW) — implement the Retrieval-owned PostgreSQL policy reader and `activateRetrievalReadPolicy(...)` CAS contract. Define `shadow | cutover | cleanup | rollback` validation, audit, expected-current-policy fencing, qualified runnable targets, and deployment-config seed/cache-only behavior; this story must not invoke cutover (AC: 2, 4).
- [ ] `packages/database/src/source-bundle.ts` and the post-Story-21.8 finalization seam in `packages/database/src/ai-ask-stream-execution.ts` — pin the committed read-policy row at execution start and create one authoritative run plus at most one shadow run. Shadow may write only a bounded would-render manifest/comparison and must not call Search/model code or write traveler, prompt, provenance, or Usage state (AC: 2-3).
- [ ] `scripts/retrieval-qualification.ts` (NEW), `scripts/retrieval-read-policy.ts` (NEW), and `package.json` — add `retrieval:qualification` read/validate/profile-approve/collect/report-approve commands, with `collect --gate shadow|cleanup`, and `retrieval:read-policy` inspect/transition/record-retirement commands. Both commands require an explicit database target identity; mutating commands require exact report/policy IDs and an actor identity designated by the applicable immutable gate profile/report. Validate G0 profile approval with `pnpm retrieval:qualification -- profile-approve --profile-id "$RETRIEVAL_PROFILE_ID" --actor-user-id "$FEEDBACK_EVAL_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`; no command may infer approval, invent a Product/Feedback application role, or silently target production (AC: 1-4).
- [ ] `tests/retrieval-qualification.test.ts` (NEW), `tests/retrieval-qualification.integration.test.ts` (NEW), `tests/retrieval-read-policy.integration.test.ts` (NEW), and `tests/retrieval-shadow.integration.test.ts` (NEW) — cover malformed/weakened profiles, exact tuple restart, `GATE-01`-`GATE-05`, `COMP-03`-`COMP-05`, `COMP-07`, paired retry/deletion, stale CAS, no shadow side effects, authorized rollback, and qualified runnable targets; each clean-table integration file calls `resetTestDatabase()` locally (AC: 1-4).
- [ ] Run `pnpm db:generate`, `pnpm test:unit -- tests/retrieval-qualification.test.ts`, `pnpm test:integration -- tests/retrieval-qualification.integration.test.ts tests/retrieval-read-policy.integration.test.ts tests/retrieval-shadow.integration.test.ts tests/drizzle-migration-plan.test.ts tests/schema-compatibility.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`; record exact environmental failures without weakening a gate (AC: 1-4).

### Dev Notes

- Depends on Story 21.13 so the canonical deletion matrix, races, and production-evaluation invalidation are executable inputs to qualification rather than prose-only metric names.
- AD-37/AD-38/RTA-8/RTA-9 govern ownership. Deployment configuration cannot override the PostgreSQL read-policy row.
- Shadow records bounded evaluation material only. It must never make a provider or web call, select a response, mutate traveler state, or write prompt/provenance/provider usage.
- Completion is local infrastructure readiness only. Story 21.14 owns evidence collection/Product Owner approval; Story 21.15 owns activation and incident rollback.

#### Block If

- Story 21.13 is not `done`, or its transaction-aware invalidator ports and `DEL-01` through `DEL-04` evidence are unavailable.
- The numeric gate profile, immutable fixture manifest, current legacy baseline, reviewed Trip proposal/schema design, or deployed PostgreSQL/provider/Vietnamese lexical spike result is missing. Persist the failure as G0-blocked; do not invent evidence.
- The implementation cannot identify the exact post-Story-21.8 finalization seam or post-Story-21.13 deletion invalidator. Reconcile the path against completed upstream story File Lists before editing.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.11]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-37-and-AD-38]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Compatibility-And-Cutover]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.11` is normative. Contract AC 1-3 map to gate profile, tuple, and shadow execution. Contract AC 4 maps to fail-closed activation prerequisites only; evidence approval and cutover moved to Stories 21.14 and 21.15.

## Story 21.14: Collect And Approve V6 Shadow Qualification Evidence


### Story

As a product owner, I want a reviewed comparable shadow-evidence report, so that activation is based on one exact qualified window rather than local test success.

### Acceptance Criteria

**Given** Story 21.11 qualification infrastructure and all G0 prerequisites are complete
**When** a shadow evidence window is collected
**Then** one persisted report records its exact dependency tuple, cohorts, metric/threshold versions, failures, exclusions, deletion evidence, and qualified runnable rollback target/procedure
**And** a changed tuple member restarts the window rather than mixing incompatible observations.

**Given** the report has a passing complete evidence window
**When** Feedback/Eval and the Product Owner review it
**Then** their exact sign-off/decision is persisted against that report
**And** approval grants no direct cutover authority.

### Tasks / Subtasks

- [ ] `scripts/retrieval-qualification.ts`, `package.json`, and `packages/database/src/retrieval-qualification.ts` — run `pnpm retrieval:qualification -- collect --profile-id "$RETRIEVAL_PROFILE_ID" --read-policy-id "$RETRIEVAL_READ_POLICY_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"` against the Story 21.11-qualified `v6_shadow` cohort. The runner must resume only the same tuple, restart on any changed member, and persist run count/start/end timestamps, failures, exclusions, deletion evidence, and rollback procedure/target (AC: 1-2).
- [ ] `tests/retrieval-qualification.integration.test.ts` and `tests/retrieval-shadow.integration.test.ts` — add/execute report-integrity, tuple-restart, minimum-duration/run-count, deletion-membership, runnable-rollback-target, and no-shadow-side-effect cases. Run `pnpm test:integration -- tests/retrieval-qualification.integration.test.ts tests/retrieval-shadow.integration.test.ts` (AC: 1-2).
- [ ] `scripts/retrieval-qualification.ts` and `packages/database/src/retrieval-qualification.ts` — persist two attributable decisions against the exact passing report using `pnpm retrieval:qualification -- report-approve --report-id "$RETRIEVAL_REPORT_ID" --review-role feedback-eval --actor-user-id "$FEEDBACK_EVAL_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"` and then `pnpm retrieval:qualification -- report-approve --report-id "$RETRIEVAL_REPORT_ID" --review-role product-owner --actor-user-id "$PRODUCT_OWNER_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`. Validate each actor against the exact authority identity designated by the immutable gate profile/report; do not invent new application roles. Approval writes no read-policy transition (AC: 3-4).
- [ ] `_bmad-output/specs/spec-epic-21/stories/21-14-collect-and-approve-v6-shadow-qualification-evidence.md` — record the exact profile/report/evidence-window IDs, tuple digest, rollback target/procedure, both approval record IDs, commands executed, and any external blocker under Completion Notes without copying traveler content (AC: 1-4).
- [ ] Run `pnpm test:unit -- tests/retrieval-qualification.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` after any runner/repository correction required by evidence collection (AC: 1-4).

### Dev Notes

- Depends on Story 21.11. This is an external evidence and approval gate, not a code-only completion.
- It cannot mutate the Retrieval read policy. Story 21.15 owns activation and rollback.

#### Block If

- Story 21.11 is not `done`, G0/G1 is not passing, or the exact profile, read-policy, environment, corpus/fixture, and runnable rollback-target IDs are unavailable.
- The minimum run count or duration has not elapsed, any tuple member changes, any required cohort/gate fails, or deletion evidence is incomplete. Persist a failed/restarted report; do not shorten or merge the window.
- A current Feedback/Eval reviewer and Product Owner cannot be resolved and authorized from PostgreSQL. `bmad-build-auto` must not impersonate either approver or fabricate their decision.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.14]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Compatibility-And-Cutover]
## Story 21.15: Cut Over V6 Retrieval Through Qualified Read Policy


### Story

As a product owner, I want required-need retrieval activated only through a qualified read-policy decision, so that a failed gate or incident can safely retain or restore a known-safe authority.

### Acceptance Criteria

**Given** Story 21.14 provides a passing Product Owner-approved report with a runnable qualified rollback target
**When** `activateRetrievalReadPolicy(...)` performs its Retrieval-owned compare-and-swap cutover
**Then** `v6_active` becomes authoritative and every production run pins the committed PostgreSQL policy
**And** deployment configuration cannot override the row.

**Given** a safety, quality, deletion, latency, call-rate, cost, or stale-projection gate fails after cutover
**When** an authorized rollback runs
**Then** the CAS uses the incident/failing evidence and a previously qualified runnable target without waiting for a new passing report
**And** no traveler output is selected by the shadow path.

### Tasks / Subtasks

- [ ] `packages/domain/src/retrieval-read-policy.ts`, `packages/database/src/retrieval-read-policy.ts`, and `scripts/retrieval-read-policy.ts` — validate the exact Story 21.14 report, both approval records, expected current policy, target `v6_active` policy, runnable qualified rollback target, actor authorization, and explicit target database identity before calling `activateRetrievalReadPolicy(...)`; deployment configuration remains seed/cache only (AC: 1-3).
- [ ] `tests/retrieval-read-policy.integration.test.ts` and `tests/retrieval-shadow.integration.test.ts` — cover stale CAS, incomplete/failed report, approval/report mismatch, non-runnable target, unauthorized actor, production-run policy pinning, incident/failing-report rollback, and no shadow traveler authority. Run `pnpm test:integration -- tests/retrieval-read-policy.integration.test.ts tests/retrieval-shadow.integration.test.ts` (AC: 1-4).
- [ ] `scripts/retrieval-read-policy.ts` and `package.json` — expose an inspect-only preflight and an explicit transition command. Run preflight first with `pnpm retrieval:read-policy -- inspect --environment "$RETRIEVAL_TARGET_IDENTITY"`; invoke cutover only with `pnpm retrieval:read-policy -- transition --reason cutover --environment "$RETRIEVAL_TARGET_IDENTITY" --expected-policy-id "$EXPECTED_POLICY_ID" --target-policy-id "$TARGET_POLICY_ID" --report-id "$RETRIEVAL_REPORT_ID" --product-approval-id "$PRODUCT_APPROVAL_ID" --rollback-policy-id "$ROLLBACK_POLICY_ID" --actor-user-id "$CUTOVER_ACTOR_USER_ID" --confirm-target "$RETRIEVAL_TARGET_IDENTITY"` (AC: 1-3).
- [ ] `packages/database/src/retrieval-read-policy.ts` and `_bmad-output/specs/spec-epic-21/stories/21-15-cut-over-v6-retrieval-through-qualified-read-policy.md` — persist and record the exact cutover row/transition ID, report and approval IDs, previous/next policy IDs, rollback target, actor, target identity, and command result. Never store credentials or traveler content in the story (AC: 1-4).
- [ ] Run `pnpm test:unit -- tests/retrieval-qualification.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` (AC: 1-4).

### Dev Notes

- Depends on Story 21.14. A failed or incomplete report blocks this story; no deployment configuration or feature flag can bypass the database policy.

#### Block If

- Story 21.14 is not `done`, or its exact passing report, Feedback/Eval review, Product Owner approval, expected policy, target policy, and qualified runnable rollback target cannot be verified in the target database.
- The target environment/database identity or authorized actor is absent or ambiguous. A development agent may complete and test the command but must not silently perform a production transition.
- A cutover command is not explicitly authorized for the named target. HALT before mutation and record the preflight result; never infer production authority from story assignment.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.15]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-37-and-AD-38]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
## Story 21.12: Retire The Legacy Card-Count Trigger Behaviorally


### Story

As a traveler, I want web verification to respond to missing or changing planning needs rather than arbitrary card count, so that one exact answer is not over-searched and irrelevant cards cannot hide a gap.

### Acceptance Criteria

**Given** legacy or shadow behavior still contains the historical fewer-than-three rule
**When** a broad query has one sufficient exact contribution or at least three irrelevant contributions
**Then** count behavior affects only the legacy authoritative path or comparison telemetry, while `v6_active` uses uncovered/freshness-sensitive requirements, conflict, or explicit current verification
**And** count alone neither triggers web work nor suppresses a required gap in the v6 path.

**Given** Story 4.5 compatibility behavior is implemented or referenced
**When** the target contract is applied
**Then** its fewer-than-three trigger is explicitly subordinate compatibility behavior with RTA-10/AD-38 ownership
**And** no active epic, runtime policy, test, config, schema default, or operator procedure treats it as permanent v6 product behavior.

**Given** Story 21.15 has activated `v6_active` from Story 21.14's passing Product Owner-approved evidence report
**When** Product approves behavioral retirement
**Then** the cutover record names the retired policy and current rollback mode while required-need coverage becomes the sole v6 authority
**And** `COMP-01`, `COMP-02`, and non-regression evidence remain attached to the recorded decision.

**Given** physical target-count cleanup is requested
**When** G3 evaluates rollback safety
**Then** cleanup remains blocked for Story 21.16 until the profile-owned rollback window, `COMP-06`, a passing cleanup report, Product approval, and a retained known-safe `v6_active` rollback target exist
**And** behavioral retirement preserves the still-runnable compatibility path until that later cleanup completes.

**Given** Story 21.12 behavioral retirement is ready for completion and all earlier stories in the authoritative sequence have completed
**When** focused unit tests, serial PostgreSQL integration tests, immutable fixture/evaluation checks, `pnpm lint`, `pnpm typecheck`, and `pnpm build` run
**Then** every RTA-1..RTA-13, PCR-01..PCR-10, FR-61..65, SC-8..12, AC-28..33, and PJ-01..06 mapping has executable evidence
**And** any environmental blocker is recorded exactly rather than weakening or skipping a gate.

### Tasks / Subtasks

- [ ] `packages/database/src/source-bundle.ts` — update the actual post-Story-21.6 retrieval-decision seam to branch on the persisted read policy and exact requirement outcomes. In the current pre-Epic-21 code the seam is `decideWebSearchFallback(...)` at line 286, not `buildRetrievalDecision`; reconcile the final symbol from Story 21.6's File List before editing. Preserve count behavior only for `legacy` authority or `v6_shadow` comparison telemetry (AC: 1-2).
- [ ] `packages/database/src/schema.ts`, `packages/database/src/provenance.ts`, `packages/database/src/answer-freshness.ts`, and `packages/database/src/retrieval-read-policy.ts` — make `v6_active` interpretation independent of `approvedKnowledgeTargetCount` and `insufficient_active_knowledge`, while retaining those fields/reasons as runnable legacy compatibility until Story 21.16. Record retired policy/target-count fields, exact Story 21.14 evidence window/report, current rollback mode, `COMP-01`-`COMP-05`, and Product retirement approval in the cutover/retirement record (AC: 1-3).
- [ ] `scripts/retrieval-qualification.ts`, `scripts/retrieval-read-policy.ts`, and `package.json` — persist Product Owner behavioral-retirement approval with `pnpm retrieval:qualification -- report-approve --report-id "$RETRIEVAL_REPORT_ID" --review-role product-owner --decision behavioral-retirement --actor-user-id "$PRODUCT_OWNER_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`, then run `pnpm retrieval:read-policy -- record-retirement --environment "$RETRIEVAL_TARGET_IDENTITY" --expected-policy-id "$ACTIVE_V6_POLICY_ID" --retired-policy-id "$LEGACY_POLICY_ID" --report-id "$RETRIEVAL_REPORT_ID" --product-approval-id "$RETIREMENT_APPROVAL_ID" --rollback-policy-id "$LEGACY_POLICY_ID" --actor-user-id "$RETIREMENT_ACTOR_USER_ID" --confirm-target "$RETRIEVAL_TARGET_IDENTITY"`. Neither command removes schema/code/config or names removed behavior as a rollback target (AC: 2-4).
- [ ] `tests/retrieval-required-needs.test.ts`, `tests/retrieval-read-policy.integration.test.ts`, and `tests/ai-ask-stream-execution.test.ts` — add legacy, `v6_shadow`, and `v6_active` cases for one sufficient contribution, three irrelevant contributions, `COMP-01`-`COMP-05`, and `COMP-06`. Prove a cleanup request is rejected and compatibility remains runnable until Story 21.16 gates pass (AC: 1-4).
- [ ] `_bmad-output/specs/spec-epic-21/evidence/21-12-epic-21-closure-evidence.md` (NEW) — record executable test/fixture/report IDs for RTA-1..13, PCR-01..10, FR-61..65, SC-8..12, AC-28..33, and PJ-01..06; every mapping names its test or persisted evidence record and contains no prose-only “covered” assertion (AC: 5).
- [ ] Run `pnpm test:unit -- tests/retrieval-required-needs.test.ts tests/ai-ask-stream-execution.test.ts`, `pnpm test:integration -- tests/retrieval-read-policy.integration.test.ts`, `pnpm retrieval:qualification -- read --report-id "$RETRIEVAL_REPORT_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`; record exact environmental blockers (AC: 1-5).

### Dev Notes

- Depends on Story 21.15's Product Owner-approved cutover. This story records behavioral retirement; it does not independently collect the shadow window or activate `v6_active`.
- AD-38/RTA-10: current `approvedKnowledgeTargetCount = 3` branch is a compatibility baseline, not v6 authority. Do not add environment flags or runtime-policy overrides.
- This story does not alter Story 4.5 independently. It consumes required-need behavior and the persisted read-policy authority from 21.6/21.11.
- Story 21.16 owns physical cleanup. This story completes after behavioral retirement and its Product approval while retaining runnable compatibility behavior.
- Before physical cleanup, emergency rollback can name retained legacy compatibility. After cleanup, only the retained qualified `v6_active` target is runnable.

#### Block If

- Story 21.15 is not `done`, or its active PostgreSQL policy, exact passing report, runnable legacy rollback target, and cutover record cannot be verified.
- Product Owner behavioral-retirement approval against the exact report is absent. `bmad-build-auto` must not impersonate the approver.
- The post-Story-21.6 decision seam or post-Story-21.11 read-policy/retirement record path differs from the paths above and cannot be reconciled from completed upstream File Lists.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.12]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-38]
- [Source: packages/database/src/source-bundle.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

### Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.12` is normative. Contract AC 1-3 map to behavioral retirement. Contract AC 4 maps to current executable proof that physical cleanup remains blocked and compatibility remains runnable; Story 21.16 owns the later cleanup execution and is not a prerequisite for completing Story 21.12.

## Story 21.16: Physically Remove Expired Legacy Card-Count Compatibility


### Story

As a product owner, I want legacy card-count compatibility removed only after rollback safety expires, so that cleanup cannot strand the product without a known-safe recovery path.

### Acceptance Criteria

**Given** Story 21.12 behavioral retirement is complete
**When** physical cleanup is requested
**Then** it waits for rollback-window expiry, `COMP-06`, a passing Feedback/Eval cleanup report, no unresolved rollback incident, Product Owner approval, and a changed qualified known-safe `v6_active` rollback target
**And** failure preserves runnable compatibility behavior.

**Given** all physical-cleanup gates pass
**When** Retrieval performs the approved CAS cleanup
**Then** a repository-wide executable-reference check finds no active legacy card-count branch, schema default, config, runtime policy, test, or operator procedure
**And** only the retained qualified v6 target remains runnable.

### Tasks / Subtasks

- [ ] `scripts/retrieval-qualification.ts`, `packages/database/src/retrieval-qualification.ts`, and `scripts/retrieval-read-policy.ts` — inspect the retained release records and fail closed unless Story 21.12 is done, `minimumLegacyRollbackWindowHours` has elapsed, `COMP-06` passes, the cleanup report passes, no rollback incident is unresolved, Product Owner approved that exact report, and a different qualified runnable `v6_active` rollback target is recorded (AC: 1).
- [ ] `scripts/retrieval-qualification.ts` and `packages/database/src/retrieval-qualification.ts` — collect the cleanup report with `pnpm retrieval:qualification -- collect --gate cleanup --profile-id "$RETRIEVAL_PROFILE_ID" --read-policy-id "$EXPECTED_POLICY_ID" --source-report-id "$RETRIEVAL_REPORT_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`; then persist the designated Feedback/Eval and Product Owner approvals with `pnpm retrieval:qualification -- report-approve --report-id "$CLEANUP_REPORT_ID" --review-role feedback-eval --actor-user-id "$FEEDBACK_EVAL_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"` and `pnpm retrieval:qualification -- report-approve --report-id "$CLEANUP_REPORT_ID" --review-role product-owner --actor-user-id "$PRODUCT_OWNER_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`. Approval does not perform cleanup (AC: 1).
- [ ] `tests/retrieval-read-policy.integration.test.ts` — prove every failed or stale G3 prerequisite writes no cleanup transition and leaves legacy compatibility runnable; prove the approved cleanup CAS rejects stale expected policy and changes the rollback target before compatibility removal (AC: 1-2).
- [ ] `scripts/retrieval-read-policy.ts` and `_bmad-output/specs/spec-epic-21/stories/21-16-physically-remove-expired-legacy-card-count-compatibility.md` — run `pnpm retrieval:read-policy -- transition --reason cleanup --environment "$RETRIEVAL_TARGET_IDENTITY" --expected-policy-id "$EXPECTED_POLICY_ID" --target-policy-id "$CLEANUP_TARGET_POLICY_ID" --report-id "$CLEANUP_REPORT_ID" --product-approval-id "$CLEANUP_PRODUCT_APPROVAL_ID" --rollback-policy-id "$V6_ROLLBACK_POLICY_ID" --actor-user-id "$CLEANUP_ACTOR_USER_ID" --confirm-target "$RETRIEVAL_TARGET_IDENTITY"` before removing compatibility. Record the admission/transition ID, report/approval IDs, previous/next/rollback policy IDs, actor, target identity, and CAS result without credentials or traveler content. Do not edit code unless this CAS has first changed the runnable rollback target to the qualified v6 target (AC: 1-2).
- [ ] `packages/database/src/source-bundle.ts`, `packages/database/src/answer-freshness.ts`, `packages/database/src/provenance.ts`, `packages/database/src/schema.ts`, `tests/ai-ask-stream-execution.test.ts`, and `tests/retrieval-required-needs.test.ts` — after the approved CAS succeeds, remove active `approvedKnowledgeTargetCount`, fewer-than-three branching/telemetry, `insufficient_active_knowledge` compatibility interpretation, target-count prompt rendering, schema/default/check usage, and tests that treat count as runnable authority (AC: 2).
- [ ] `drizzle/migrations/` and `drizzle/migrations/meta/_journal.json` — generate the next forward migration for active target-count schema/config cleanup. Preserve immutable historical SQL/snapshots for audit; never rewrite `drizzle/migrations/0000_baseline.sql` or prior `drizzle/migrations/meta/*_snapshot.json` files (AC: 2).
- [ ] Run the executable-source check `rg -n 'approvedKnowledgeTargetCount|approved_knowledge_target_count|insufficient_active_knowledge|knowledge\.length\s*<\s*3|approvedKnowledgeTargetCount\s*=\s*3' packages apps scripts tests package.json` and the active operator-procedure check `rg -n 'fewer than three|fewer-than-three|card-count|target count|approvedKnowledgeTargetCount|insufficient_active_knowledge' docs/runbooks`. Both must return no active legacy authority. `_bmad-output/**`, `docs/roadmaps/**`, planning/history documents, and immutable `drizzle/migrations/**` history are intentionally outside this executable check (AC: 2).
- [ ] `_bmad-output/specs/spec-epic-21/stories/21-16-physically-remove-expired-legacy-card-count-compatibility.md` — append the forward migration name, deployment/verification revision, and both scoped reference-check outputs to Completion Notes, tied to the already persisted cleanup transition ID (AC: 1-2).
- [ ] Run `pnpm db:generate`, `pnpm test:unit -- tests/retrieval-required-needs.test.ts tests/ai-ask-stream-execution.test.ts`, `pnpm test:integration -- tests/retrieval-read-policy.integration.test.ts tests/drizzle-migration-plan.test.ts tests/schema-compatibility.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` (AC: 1-2).

### Dev Notes

- Depends on Story 21.12 and is intentionally time-gated. Do not start it merely because code and local tests pass.

#### Block If

- Story 21.12 is not `done`, the rollback window has not expired, `COMP-06` or the cleanup report fails, any rollback incident remains unresolved, Product Owner approval is absent, or the changed qualified runnable `v6_active` rollback target is unavailable.
- The target environment/database identity or authorized cleanup actor is absent or ambiguous. A development agent must not silently mutate production.
- The scoped executable-reference checks find an active runtime/config/test/runbook reference. Historical migrations, snapshots, planning artifacts, and roadmaps may retain historical wording and must not be destructively rewritten.

#### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.16]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-38]
