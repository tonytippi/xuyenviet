# Epic 21 Story Contracts — Minimal Clean Break

These eight contracts are the exact `bmad-build-auto <spec-folder> <story-id>`
handoffs. Run them sequentially and update `sprint-status.yaml` after each story.

## Story 21.1: Add Minimal Planning Session Storage

**Depends on:** Epic 22 complete.

**Block If:** The configured database is not explicitly disposable or contains durable
user data. Do not reset it; stop for an expand-migrate-contract design.

### Acceptance Criteria

**Given** an explicitly disposable target
**When** migration `0077_clean_break_trip_aware_planning.sql` runs
**Then** Epic 21 adds only `planning_context_sessions`
**And** existing conversation, message, retrieval-decision, Trip, Usage, provenance, feedback, and audit tables are reused without forcing unrelated schema cleanup.

**Given** a planning session is read or written
**When** its JSON payload is validated
**Then** it contains only a bounded intent, flat scoped slots, missing-slot names, status, source message IDs, and revision
**And** arbitrary graphs, generic workflow state, model reasoning, and provider payloads are rejected.

### Tasks

- [ ] NEW `packages/contracts/src/planning-context.ts` and UPDATE `packages/contracts/src/index.ts`: define the bounded flat session payload and validation limits only.
- [ ] UPDATE `packages/database/src/schema.ts`; NEW `drizzle/migrations/0077_clean_break_trip_aware_planning.sql`: add only the owner-linked session table and establish the final Epic 21 schema. This migration is final after Story 21.1.
- [ ] NEW `packages/database/src/planning-context.ts` and UPDATE `packages/database/src/index.ts`: implement owner-scoped load and compare-and-set save using the existing database transaction pattern.
- [ ] INSPECT `scripts/db-reset.ts` and `scripts/db-seed.ts`; change them only if an existing disposable-target guard or seed path fails the tests.
- [ ] NEW `tests/planning-context.test.ts` and `tests/planning-context.integration.test.ts`; UPDATE `tests/drizzle-migration-plan.test.ts`: cover bounds, CAS, owner isolation, cascade, migration `0073`, and the one-table limit.

### Verification

```bash
pnpm test:unit -- tests/planning-context.test.ts tests/drizzle-migration-plan.test.ts
pnpm test:integration -- tests/planning-context.integration.test.ts
pnpm typecheck
```

## Story 21.2: Collect Multi-Turn Clarification

**Depends on:** Story 21.1 complete.

### Acceptance Criteria

**Given** a supported planning request lacks a material value
**When** clarification preflight runs
**Then** it asks one concise question for the next missing value and persists explicit traveler answers in the flat session
**And** it does not retrieve evidence, search web, or generate the main answer while blocked.

**Given** extraction fails, retries, or returns stale output
**When** the existing AI Ask command terminalizes
**Then** it records safe retry guidance and Usage once
**And** stale output cannot overwrite a newer session revision.

### Tasks

- [ ] UPDATE `packages/database/src/planning-context.ts`: add a small deterministic reducer for explicit slot values, missing slots, completion, supersession, revision fencing, and a flat per-supported-slot source-message-ID map. Persist only the user message ID that supplied each explicit slot; retain `sourceMessageIds` only as its bounded aggregate list, and do not add graph, claim, or attempt tables.
- [ ] UPDATE `packages/database/src/ai-ask-commands.ts`: suppress the existing background context-extraction effect for a blocked profiled turn and reuse the current terminal command fence.
- [ ] UPDATE `packages/database/src/ai-ask-stream-execution.ts`: run clarification before source assembly and return the clarification result without entering retrieval/provider/follow-up branches.
- [ ] UPDATE `apps/web/src/features/ai/ai-ask-composer.tsx`: show concise Vietnamese clarification, retry, pending, focus, keyboard, touch, and mobile behavior using existing UI state.
- [ ] UPDATE `tests/ai-ask-commands.test.ts`, `tests/ai-ask-stream-execution.test.ts`, and `tests/traveler-ui-foundation.test.ts`; NEW `tests/planning-clarification.integration.test.ts`: cover initial question, partial reply, completion, intent change, failure, retry, stale result, and deletion.

### Verification

```bash
pnpm test:unit -- tests/planning-context.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts tests/traveler-ui-foundation.test.ts
pnpm test:integration -- tests/planning-clarification.integration.test.ts
pnpm typecheck
pnpm build
```

## Story 21.3: Resolve Planning Mode And Applied Trip Authority

**Depends on:** Story 21.2 complete.

### Acceptance Criteria

**Given** a ready turn refers to an applied Trip, explores a change, reviews a pending proposal, or has no selected Trip
**When** planning mode resolves
**Then** it returns exactly `current_plan`, `explore_change`, `validate_proposal`, or `unscoped_answer`
**And** only the exact applied Trip snapshot is current-plan authority.

**Given** mode is ambiguous or the pinned Trip/proposal version changes
**When** source assembly or finalization checks the fence
**Then** the system asks one clarification or discards the stale answer
**And** pending, hypothetical, foreign, or chat-only values never become applied state.

### Tasks

- [ ] UPDATE `packages/contracts/src/planning-context.ts`: add only the four-mode union and the minimal pinned Trip/proposal/session reference.
- [ ] UPDATE `packages/database/src/answer-context.ts`: resolve the mode deterministically from authenticated URL scope, selected Trip, current proposal, and current-turn intent.
- [ ] UPDATE `packages/database/src/source-bundle.ts` and `packages/database/src/ai-ask-stream-execution.ts`: consume the resolved mode and recheck existing owner/version fences before finalization.
- [ ] NEW `tests/planning-mode.test.ts` and UPDATE `tests/ai-ask-stream-execution.test.ts`: cover `PM-01` through `PM-07`, ambiguity, ownership, and stale version behavior.

### Verification

```bash
pnpm test:unit -- tests/planning-mode.test.ts tests/ai-ask-stream-execution.test.ts
pnpm typecheck
```

## Story 21.4: Preserve Canonical Route Authority

**Depends on:** Story 21.3 complete.

### Acceptance Criteria

**Given** a transport leg has an owner-confirmed path or matches supported product coverage
**When** route applicability resolves
**Then** it returns selected, complete, partial, ambiguous, unsupported, or stale
**And** labels, similarity, popularity, model output, and pending proposals create no route authority.

**Given** an owner applies `set-leg-path` or `clear-leg-path`
**When** the existing proposal Apply command validates ownership and versions
**Then** canonical references change atomically
**And** no background publisher, registry table, Worker operation, or runtime activation state is introduced.

**Given** Story 21.4 persists an owner-confirmed canonical route path
**When** its schema change runs after final Story 21.1 migration `0073`
**Then** exactly `drizzle/migrations/0078_add_trip_plan_item_canonical_route_path_id.sql` adds nullable `canonical_route_path_id` to existing `trip_plan_items`
**And** it adds no other column, table, backfill, or persisted manifest state.

### Tasks

- [ ] NEW `packages/database/src/route-coverage.ts`: define and startup-validate one small typed code-owned route/coverage manifest plus its pure resolver.
- [ ] UPDATE `packages/contracts/src/planning-context.ts`: add canonical path references and resolver result types only.
- [ ] NEW `drizzle/migrations/0078_add_trip_plan_item_canonical_route_path_id.sql`; UPDATE `packages/database/src/schema.ts`: add only nullable `canonical_route_path_id` to existing `trip_plan_items`. Do not amend `0077` or add another migration.
- [ ] UPDATE `packages/database/src/trip-plan-commands.ts` and `packages/database/src/traveler-proposal-commands.ts`: support owner-authorized, version-fenced set/clear operations using existing Trip storage.
- [ ] UPDATE `packages/database/src/source-bundle.ts`: consume the pure resolver and surface bounded route limitations without live-navigation claims.
- [ ] NEW `tests/route-authority.test.ts` and `tests/route-authority.integration.test.ts`: cover `RP-01` through `RP-08`, owner isolation, reopen persistence, and stale references.

### Verification

```bash
pnpm test:unit -- tests/route-authority.test.ts
pnpm test:integration -- tests/route-authority.integration.test.ts
pnpm typecheck
```

## Story 21.5: Retrieve By Required Need And Remove Card Count

**Depends on:** Story 21.4 complete.

### Acceptance Criteria

**Given** a ready planning turn enters retrieval
**When** applicable evidence is evaluated
**Then** a small code-owned requirement list maps eligible facts to `satisfied`, `missing`, `requires_verification`, or `requires_clarification`
**And** one fact, source metadata, or one leg cannot satisfy an unrelated need.

**Given** one applicable card satisfies every need or many cards omit a required need
**When** fallback is decided
**Then** the first case does not call web solely to reach a count and the second preserves the gap
**And** the fewer-than-three branch and its active config/test authority are removed in this story; existing count columns may remain inert telemetry.

### Tasks

- [ ] UPDATE `packages/database/src/source-bundle.ts`: define the minimal typed requirements beside the owning retrieval code, map eligible facts to needs, compute four coverage outcomes, and delete the count trigger.
- [ ] UPDATE `packages/database/src/knowledge-search.ts`: search only eligible owner rows and existing allowlisted relevance fields; source URL, label, publisher, and provenance metadata cannot boost relevance.
- [ ] UPDATE `packages/database/src/provenance.ts` and `packages/database/src/answer-freshness.ts`: consume one bounded `assistant_retrieval_decisions.knowledgePolicySnapshot` required-need snapshot; do not change schema or migration `0073`.
- [ ] NEW `tests/required-need-retrieval.test.ts` and `tests/required-need-retrieval.integration.test.ts`; UPDATE `tests/knowledge-search.test.ts`: cover `RN-01` through `RN-06`, `COMP-01`, `COMP-02`, route isolation, capacity, and persisted snapshot bounds.

### Verification

```bash
pnpm test:unit -- tests/required-need-retrieval.test.ts tests/knowledge-search.test.ts
pnpm test:integration -- tests/required-need-retrieval.integration.test.ts
pnpm lint
pnpm typecheck
```

## Story 21.6: Verify Fresh Facts And Finalize Through Existing AI Ask

**Depends on:** Story 21.5 complete.

### Acceptance Criteria

**Given** a need is missing, changing, conflicted, or explicitly current
**When** existing web fallback runs
**Then** it sends a minimized query for that need and allowed place/route terms
**And** provider failure preserves the gap with practical verification guidance.

**Given** answer generation succeeds, fails, retries, or becomes stale
**When** the existing AI Ask terminal transaction runs
**Then** message, Usage, provenance, and the bounded retrieval snapshot remain consistent
**And** no run table, prepare/finalize framework, service, queue, or second terminal state is created.

### Tasks

- [ ] UPDATE `packages/database/src/source-bundle.ts`: trigger web only from required-need outcomes and build the minimized query inputs.
- [ ] UPDATE `packages/database/src/web-search.ts`: preserve exact captured result, scope/freshness decision, provider failure, and existing Usage behavior without new persistence.
- [ ] UPDATE `packages/database/src/ai-ask-stream-execution.ts` and `packages/database/src/ai-ask-commands.ts`: extend the existing terminal transaction/fence directly; do not introduce new prepare/finalize abstractions.
- [ ] UPDATE `packages/database/src/provenance.ts` and `packages/database/src/answer-freshness.ts`: derive sources and freshness from the committed snapshot and stored provenance.
- [ ] NEW `tests/scoped-web-answer.test.ts` and `tests/scoped-web-answer.integration.test.ts`; UPDATE `tests/ai-ask-stream-execution.test.ts`: cover `WS-01` through `WS-05`, provider failure, replay, stale fences, and duplicate terminalization.

### Verification

```bash
pnpm test:unit -- tests/scoped-web-answer.test.ts tests/ai-ask-stream-execution.test.ts
pnpm test:integration -- tests/scoped-web-answer.integration.test.ts
pnpm typecheck
pnpm build
```

## Story 21.7: Convert Eligible Chat Context Into A Reviewable Trip

**Depends on:** Story 21.6 complete.

### Acceptance Criteria

**Given** a completed unscoped answer contains at least one supported explicit planning value
**When** existing recommendation state is projected
**Then** it is simply `eligible`, `accepted`, `dismissed`, or `invalidated`
**And** each eligible value is authorized by the bounded planning session's flat per-slot source-message-ID map as originating from the current completed unscoped terminal turn; ambiguous, stale, unresolved, or assumption-only values are never eligible.

**Given** the traveler accepts an eligible recommendation
**When** the existing idempotent command runs
**Then** one transaction creates one Trip, its primary conversation, and one pending typed proposal
**And** no transcript, assistant prose, provider payload, workflow engine, or pre-Apply Trip mutation is introduced.

### Tasks

- [ ] UPDATE `packages/database/src/traveler-proposal-commands.ts`: expose the existing database-owned operation validation needed to create a pending proposal; do not move or redesign the Worker proposal module.
- [ ] UPDATE `packages/database/src/trip-recommendations.ts`: reuse the current aggregate and idempotency behavior for the four states, authorize only supported explicit values whose flat planning-session slot source-message ID equals the current completed unscoped terminal user message ID, map them into existing proposal operations, validate them through `traveler-proposal-commands.ts`, and insert the pending proposal in the accept transaction. Do not read transcript, assistant prose, prompt, assumptions, or provider payload for conversion provenance.
- [ ] UPDATE `packages/database/src/ai-ask-commands.ts` and `packages/database/src/ai-ask-stream-execution.ts`: refresh recommendation eligibility only after successful answer terminalization.
- [ ] UPDATE `packages/contracts/src/index.ts`, `apps/api/src/conversations/traveler-commands.controller.ts`, `apps/api/src/openapi.controller.ts`, `apps/web/src/features/ai/direct-api-client.ts`, and `apps/web/src/features/ai/ai-ask-composer.tsx`: evolve existing endpoints/UI without adding a parallel endpoint.
- [ ] UPDATE `tests/trip-recommendations.test.ts`, `tests/trip-recommendations.integration.test.ts`, `tests/trip-recommendations-api.integration.test.ts`, and `tests/traveler-ui-foundation.test.ts`: cover eligibility, dismissal, stale context, idempotent accept, pending proposal, deletion race, and no transcript copy.

### Verification

```bash
pnpm test:unit -- tests/trip-recommendations.test.ts tests/traveler-ui-foundation.test.ts
pnpm test:integration -- tests/trip-recommendations.integration.test.ts tests/trip-recommendations-api.integration.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

## Story 21.8: Delete Planning Data And Verify The Clean Break

**Depends on:** Story 21.7 complete.

### Acceptance Criteria

**Given** a conversation or Trip is deleted
**When** existing owner deletion commands run
**Then** foreign-key cascades remove planning sessions and proven explicit cleanup removes remaining owner-derived snapshots/recommendations/proposals in the same transaction
**And** unrelated owned data remains unchanged.

**Given** Epic 21 implementation is complete
**When** active runtime, config, tests, scripts, and runbooks are checked
**Then** no card-count threshold or rollout-control authority remains executable
**And** verification uses existing commands plus scoped `rg`, not a new scanner, automatic database reset, or migration edit.

### Tasks

- [ ] INSPECT `packages/database/src/schema.ts` cascades first; UPDATE `packages/database/src/index.ts` and `packages/domain/src/index.ts` only for owner-derived rows that existing cascades cannot remove safely.
- [ ] UPDATE `packages/database/src/planning-context.ts`, `packages/database/src/trip-recommendations.ts`, and `packages/database/src/provenance.ts` only where deletion tests prove an explicit cleanup gap; do not add a generic invalidation framework.
- [ ] NEW `tests/planning-deletion.integration.test.ts`: call `resetTestDatabase()` locally and cover `DEL-01` through `DEL-04`, finalization/conversion races, primary-conversation policy, cascade, and non-reconstructable audit.
- [ ] RUN the verification commands below and record exact results; do not run `pnpm db:reset` unless the user separately confirms the exact disposable target.

### Verification

```bash
pnpm test:unit
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
rg -n 'knowledge\.length\s*<\s*approvedKnowledgeTargetCount|legacy\|v6_shadow\|v6_active|retrieval[_-](read[_-]policy|cutover|gate[_-]profile|shadow)' packages apps scripts tests docs/runbooks
```

The final `rg` command passes only when it returns no active matches. Historical
planning artifacts and immutable prior migrations are outside this executable scan.
