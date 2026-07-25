---
baseline_commit: 2af7ecd10ded08e8ab50efad87fb7f51b6fb2cb7
---

# Story 7.4: Generate Reviewable AI Trip Change Proposals

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Trip Project owner,
I want AI recommendations for persistent plan adjustments to appear as bounded, reviewable change proposals,
so that I can understand the intended plan impact before any persistent trip state changes.

## Acceptance Criteria

1. **Schema-validated typed proposal draft, no direct AI writes**
   - **Given** an authenticated owner asks for a persistent plan adjustment in the primary conversation
   - **When** AI orchestration creates a proposal draft
   - **Then** it uses a schema-validated typed operation set with bounded rationale, explicitly identified affected items, expected project and affected-item versions, ordering/parent preconditions when applicable, alternatives when available, and optional expiry
   - **And** the orchestration path cannot directly write plan items, constraints, or item states; persistence goes through a Chat/Trips-owned proposal command.

2. **Permitted operations only, no plan editor**
   - **Given** the owner asks to create, edit, remove, reorder, or change the state of anchors, legs, activities, alternatives, or constraints
   - **When** the proposal draft is validated
   - **Then** it permits only the defined plan-item kinds (`anchor | leg | activity`), anchor roles (`origin | destination | region | required_stop | accommodation`), leg/activity types (`transport | visit | food | rest | accommodation`), states (`idea | planned | confirmed | backup`), same-project parent/backup relationships, travel-relevant constraints, and available data boundaries
   - **And** the saved-plan timeline remains read-oriented with no separate plan-item, state, reorder, or constraint editor.

3. **Invalid provider output rejected before persistence**
   - **Given** provider output proposes an unknown operation, a cross-project item reference, an invalid type/state, or unbounded content
   - **When** the draft is validated
   - **Then** it is rejected or safely omitted before persistence (no proposal row is written for the invalid portion)
   - **And** no structured plan state changes; the answer still completes without a proposal when drafting/validation fails.

4. **Pending proposal presentation is distinct and safe**
   - **Given** a pending valid proposal exists
   - **When** the owner sees it in an answer, Trip Home, timeline, or responsive detail surface
   - **Then** the UI distinguishes it from saved plan items and shows a bounded before/after impact, bounded rationale, expiry when applicable, and only supported actions
   - **And** no apply action is offered for an expired proposal; expired proposals are visibly marked and retain their safe summary.

## Scope And Boundaries

### In Scope

- Add the Chat/Trips-owned `trip_change_proposals` table (and the `trip_plan_change_history` table **schema**, rows reserved for Story 7.5) through one Drizzle migration, with composite owner FKs, check constraints, and `ON DELETE CASCADE` from the owning trip project — following the exact discipline of `trip_plan_items` and `trip_project_constraints` from Story 7.1.
- Add a Chat/Trips-owned proposal command/read module that validates and persists AI-drafted proposals (`persistAiTripChangeProposalDraft`), reads pending proposals for the owner (`listPendingProposalsForTripProject`, `getProposalForOwnerReview`), and exposes the typed operation schema + validator (`validateProposalOperations`). No apply/dismiss/expire commands here (Story 7.5).
- Add an AI Orchestration proposal-draft module that builds the prompt from the current Trip Planning aggregate, calls the AI Gateway with a schema-validated JSON output contract, parses the result, and returns an **untrusted** typed draft that Chat/Trips validates before persistence. This module writes no tables.
- Add a new AI Gateway completion wrapper + `trip_proposal_draft` purpose for accurate usage attribution, mirroring the `completeExtraction` pattern (temperature 0, bounded maxTokens, schema-validated JSON).
- Wire proposal drafting into `src/app/api/ai-ask/stream/route.ts` as an enrichment step after the assistant message (and annotations) are persisted and before the `done` event, only when a `tripProjectId` is selected. Include a bounded proposal summary in the `done` StreamEvent payload so the client can render the proposal card. On drafting/validation failure or timeout, the answer still sends `done` without a proposal.
- Feed real pending proposals into `getOwnedTripProjectSummary` (replace the current `pendingProposals: []` placeholder from Story 7.3) so Trip Home focus and the workspace panel render live proposal state. Extend `OwnedTripProjectWorkspaceSummary` and `TripWorkspaceReadModel` with pending-proposal details (rationale, affected items, before/after, expiry) for the review card.
- Render the Change Proposal review card (`{components.change-proposal}`: amber border, white bg, radius lg) in the Trip Workspace panel / mobile sheet and in the assistant answer surface, visually distinct from confirmed timeline items. Show bounded before/after, rationale, expiry when applicable, and the supported-action row with correct state-gated visibility (`Áp dụng` omitted for expired; `Xem phương án khác` only when alternatives are supplied).
- Extend `deleteOwnedTripProject` so proposals (and the reserved history table) are removed with the project via the cascade FK, and the deletion audit `beforeSummary` reports the removed proposal count.
- Add focused regression coverage: pure unit tests for the typed-operation validator (every reject/omit case), DB-backed tests for proposal persistence/owner-scope/cascade-delete, and shell tests for proposal card rendering, visual distinction, expired-state gating, and absence of a plan editor.

### Explicitly Out Of Scope

- The `applyApprovedTripChange`, `dismissTripChangeProposal`, and `expireTripChangeProposal` commands, their server actions, history-row writes, and the `Làm mới đề xuất` (refresh) wired handler — these are Story 7.5. This story defines the history **table schema** (in the 7.4 migration) so 7.5 does not need a second migration, but writes no history rows.
- Wiring apply/dismiss click handlers to live server actions. In 7.4 the action buttons render with correct state-gated visibility as presentation; their command wiring lands in 7.5. The 7.4 buttons may be disabled with an accessible name and a clear 7.5 integration hook (e.g. `data-story="7.5"`) so 7.5 adds behavior without UI churn. Do not fake a successful apply.
- AI proposal auto-application, background proposal regeneration, scheduled expiry workers, and proposal notifications (Story 7.5 / deferred).
- A manual plan-item/constraint editor, drag-and-drop reorder, inline state toggle, or any control that mutates structured plan state from the workspace. The primary conversation remains the sole plan-authoring surface.
- Maps, Google Maps, weather, live route/ETA, booking, availability, provider snapshots, current location, budget tracking, checklists, vault, notifications, sharing, collaboration, or location sharing.
- Changes to `formatTripProjectLabel`, `TripProjectInput`, legacy project metadata, `chat_context`, transcript extraction, answer-context behavior, retrieval/search, or streaming/provenance persistence contracts.
- Knowledge-ingestion or community-knowledge changes; this story is Trip Planning only.

## Tasks / Subtasks

- [x] Add the `trip_change_proposals` table and reserve the `trip_plan_change_history` schema (AC: 1, 3)
  - [x] In `src/db/schema.ts`, add `tripChangeProposals` pgTable: `id` (UUID PK), `tripProjectId`, `userId`, `creatorClass` (check `ai_orchestration | owner_command`), `status` (check `pending | applied | dismissed | expired`, default `pending`), `rationale` (bounded text, ≤500 chars, single-line), `operations` (jsonb, non-null, typed operation list), `expectedAggregateVersion` (int ≥ 1), `expectedItemVersions` (jsonb map itemId→version, nullable), `orderingPreconditions` (jsonb, nullable), `alternatives` (jsonb, nullable, bounded), `expiresAt` (timestamptz, nullable), `terminalTimestamp` (timestamptz, nullable), `sourceAssistantMessageId` (nullable, references the assistant message that triggered the draft), `createdAt`, `updatedAt`. Composite owner FK `trip_change_proposals_owner_fk` on `(tripProjectId, userId)` → `tripProjects(id, userId)` `ON DELETE CASCADE`. Check: `status = 'pending'` iff `terminalTimestamp` is null; terminal statuses require a non-null `terminalTimestamp`. Index on `(userId, tripProjectId, status, createdAt)`.
  - [x] In `src/db/schema.ts`, add `tripPlanChangeHistory` pgTable (schema only, no rows in this story): `id` (PK), `tripProjectId`, `userId`, `proposalId` (nullable), `actorUserId` (nullable, restrict), `actorClass` (check `user | system`, default `user`), `actorSystem` (text, nullable — e.g. `system-trip-planning`), `operationClass` (check `apply | dismiss | expire`), `affectedItemReferences` (jsonb), `safeBeforeAfterSummary` (jsonb, bounded), `createdAt`. Composite owner FK cascade. (Rows are written in Story 7.5.)
  - [x] Extend the `audit_events.operation` check to add `apply | dismiss | expire` and add nullable `actorClass` (default `user`) + `actorSystem` (text) columns, so the `system-trip-planning` actor and terminal proposal operations can be audited in 7.5 without a second migration. 7.4 proposal-creation audit rows use `operation = 'create'`, `actorClass = 'user'`.
  - [x] Generate `drizzle/migrations/0063_*.sql` via `pnpm db:generate`. If Drizzle cannot express a required deferrable/check constraint, add a custom SQL supplement mirroring the `0061` deferred-FK pattern. Verify `pnpm db:generate` then `pnpm lint`/`typecheck`/`build` do not require a live database and produce no schema drift. Do NOT extend `aiGatewayModelPurposeValues` or the `ai_gateway_models_purpose_check` constraint — `trip_proposal_draft` is a gateway completion purpose and usage label only, not a DB model purpose (see Open Decision 3).

- [x] Add the Chat/Trips-owned proposal command/read module (AC: 1, 2, 3)
  - [x] Create `src/features/chat-trips/trip-change-proposals.ts` (server-only, `@/*` imports, safe operational errors, no `any`/unchecked casts).
  - [x] Define the typed operation schema: a discriminated union covering create/update/remove/reorder/change-state for anchors/legs/activities/alternatives and upsert for constraints. Each operation carries only the target item id (for non-create), permitted structured-field changes, and bounded content. Reject executable SQL, arbitrary routes, provider payloads, and unbounded content at the type/validator boundary.
  - [x] Implement `validateProposalOperations(operations, { knownItems, tripProjectId })`: enforce defined kinds/roles/types/states, same-project parent/backup references (reuse the Story 7.1 `validatePlanReferences` same-project/no-cycle rules by extracting or delegating), backup-state iff backup target, travel-relevant constraints only (reuse the 7.1 constraints allowlist), and data boundaries (label ≤160, notes ≤1000, single-line, transport fields only on transport type, accommodation area only on accommodation type). Unknown operations, cross-project item refs, invalid type/state, or unbounded content are rejected or safely omitted (return `{ valid, rejected }` so a partially-valid draft can persist its valid subset only when the dev judges omission safe; otherwise reject the whole draft).
  - [x] Implement `persistAiTripChangeProposalDraft({ tripProjectId, expectedAggregateVersion, expectedItemVersions, operations, rationale, alternatives, expiresAt, sourceAssistantMessageId })`: authenticate owner, validate operations, read the current aggregate version and affected item versions, persist one `trip_change_proposals` row at `status = 'pending'` with the version fences captured at draft time, record an audit_events `create` row (actor = owner, `actorClass = 'user'`), and return a safe `OwnedTripChangeProposalSummary` or a typed failure (`unauthenticated | not_found | invalid | refresh_required`). No plan state mutation.
  - [x] Implement `listPendingProposalsForTripProject(tripProjectId)` and `getProposalForOwnerReview(tripProjectId, proposalId)` returning owner-scoped, traveler-safe projections (rationale, bounded before/after, affected item refs, expiry, status; never raw model prompts/responses). Cross-owner reads return `null` without leaking existence.

- [x] Add the AI Orchestration proposal-draft module and gateway purpose (AC: 1, 3)
  - [x] Extend `AiGatewayCompletionPurpose` in `src/features/ai/gateway.ts` with `"trip_proposal_draft"` and add a `completeTripChangeProposalDraft({ model, messages, abortSignal })` wrapper reusing the non-streaming completion shape (temperature 0, bounded maxTokens, schema-validated JSON output, purpose `trip_proposal_draft`). `trip_proposal_draft` is a gateway completion purpose and usage-attribution label only — do NOT add it to the DB `AiGatewayModelPurpose` enum or the `ai_gateway_models_purpose_check` constraint. Select the proposal-draft model by reusing the existing `extraction` `AiGatewayModelPurpose` via `selectActiveAiGatewayModel({ purpose: aiUsagePurposes.extraction, requiredCapabilities: { textInput: true, extraction: true } })`, mirroring `extractChatTripContext` in `context-extraction.ts`. Add `tripChangeProposalDraft` to `aiUsagePurposes`/`aiUsagePromptVersions` in `src/features/usage/constants.ts` (free-text usage labels, no migration) and export `tripChangeProposalDraftPurpose`/`tripChangeProposalDraftPromptVersion` from `prompts.ts`. The `ai_usage_events.purpose` column is free-text with no check constraint, so writing `trip_proposal_draft` there needs no schema change.
  - [x] In `src/features/ai/prompts.ts`, add `tripChangeProposalDraftPurpose`, a `promptVersion` constant, and `buildTripChangeProposalDraftMessages({ question, currentAggregateSummary })` that embeds the current structured plan (anchors/legs/activities/states/ordinals/parent/backup) and constraints as read-only context and instructs the model to emit only the typed operation set within defined boundaries. Knowledge-use instructions must be explicit and cannot be overridden by source data.
  - [x] Create `src/features/ai/trip-proposal-draft.ts` (server-only): read the current Trip Planning aggregate via Chat/Trips query helpers (no direct table writes), build the prompt, call `completeTripChangeProposalDraft`, parse the JSON output against the typed operation schema, and return an **untrusted** draft (`UntrustedTripChangeProposalDraft`). This module persists nothing and records the usage event via `writeAiUsageEvent` with the new purpose (or the caller records it transactionally with persistence). On parse/validation failure or timeout, return a typed failure so the caller omits the proposal.

- [x] Wire proposal drafting into the AI Ask stream route (AC: 1, 3, 4)
  - [x] In `src/app/api/ai-ask/stream/route.ts`, after the assistant message and validated annotations are persisted (and before the `done` event), and only when `tripProjectId` is present, run proposal drafting: call the new AI proposal-draft module, then `persistAiTripChangeProposalDraft` (Chat/Trips). Use a bounded `AbortSignal` timeout. Record the usage event with purpose `trip_proposal_draft`.
  - [x] On success, include a bounded proposal summary in the `done` StreamEvent payload (`{ proposalId, rationale, affectedItems, beforeAfter, expiresAt, status }`) so the client reconciles the proposal card from persisted data, not from streamed text. On drafting/validation failure or timeout, send `done` without a proposal (the answer still completes). Never let proposal drafting break the answer or write partial plan state.
  - [x] Keep the existing `preparing | delta | done | error` event contract; extend the `done` payload additively only. Preserve existing transactional assistant-message + provenance + usage persistence unchanged.

- [x] Feed real pending proposals into the workspace read model (AC: 4)
  - [x] In `src/features/chat-trips/trip-projects.ts`, extend `OwnedTripProjectWorkspaceSummary` with `pendingProposals: OwnedTripChangeProposalSummary[]`. In `getOwnedTripProjectSummary`, replace the Story 7.3 `pendingProposals: []` placeholder with `listPendingProposalsForTripProject(tripProjectId)`, owner-scoped. No aggregate/item version mutation; this is a read.
  - [x] In `src/features/chat-trips/trip-home.ts`, extend `PendingProposalFocusInput` / `TripWorkspaceReadModel` so the workspace panel can render before/after + rationale + expiry + affected items (not just the focus id). Keep `computeTripHomeFocus` pure and deterministic; feed the richer proposal rows through `buildTripWorkspaceReadModelWithConstraints`. Expired pending proposals must not win Trip Home focus and must be visibly marked in the panel.

- [x] Render the Change Proposal review card (AC: 4)
  - [x] Add a presentational `TripProposalReviewCard` (data-free, props-driven) — either inside `src/features/ai/trip-workspace-panel.tsx` or a sibling `src/features/ai/trip-proposal-review-card.tsx` — using `{components.change-proposal}` (amber `#D97706` border, white bg, radius lg). Render bounded before/after, rationale, expiry when applicable, and the supported-action row: `Áp dụng` (primary), `Giữ kế hoạch` (secondary), `Xem phương án khác` (only when alternatives are supplied). Pending proposals must never look identical to confirmed timeline items; no shadow/animation/saturated color to pressure apply.
  - [x] In the workspace panel / mobile sheet, render the proposal card when `workspace.pendingProposals` is non-empty (or when focus is `pending-proposal*`). Expired proposals render with `Áp dụng` omitted and an expired marker; safe summary retained. Alternatives action appears only when alternatives exist.
  - [x] In `ai-ask-composer.tsx`, accept the proposal summary from the extended `done` event payload, render the proposal card in the answer surface, and pass proposals into `TripWorkspacePanel`. On opening proposal review, move keyboard focus to the proposal heading; on terminal result, return focus to the originating answer card or Trip Home focus card (EXPERIENCE.md interaction primitives). The apply/dismiss buttons render with state-gated visibility as presentation; their command wiring is Story 7.5 (disabled with `aria-disabled` and a `data-story="7.5"` hook; do not fake success).
  - [x] Preserve accessibility: keyboard-reachable, visible focus, `aria-live="polite"` for proposal state changes, 44px mobile targets, labeled status in addition to color, Vietnamese diacritics legible, reduced-motion respected. Trust copy must state a proposal is a suggestion, not a booking/route/weather/availability check.

- [x] Extend deletion and add regression coverage (AC: 1, 2, 3, 4)
  - [x] In `deleteOwnedTripProject`, rely on the cascade FK to remove proposals (and history rows); update the deletion audit `beforeSummary` to include `proposalCount`. Verify cascade removes proposals for the deleted project and only minimal non-content audit metadata remains.
  - [x] Add `tests/trip-change-proposals.test.ts`: pure unit tests for `validateProposalOperations` covering every permitted operation and every reject/omit case (unknown op, cross-project item, invalid kind/role/type/state, backup without target, transport fields on non-transport, accommodation area on non-accommodation, unbounded label/notes/rationale, executable SQL/arbitrary route/provider payload in content). DB-backed tests for `persistAiTripChangeProposalDraft` (owner scope, version-fence capture, invalid draft rejected, no plan mutation, cascade on project delete) and the read model (cross-owner `null`, no raw model content).
  - [x] Extend `tests/trip-home.test.ts` to feed real pending-proposal rows (with expiry, without expiry, expired) and assert focus priority + that expired proposals do not win focus. Extend `tests/trip-projects.test.ts` for `pendingProposals` in the summary and cascade-delete behavior. Extend `tests/ai-ask-shell.test.ts` for proposal card rendering, visual distinction from confirmed items, expired-state gating (no apply), alternatives-only-when-supplied, focus movement, no plan editor, no provider call in the read path, and `done` payload reconciliation from persisted data (not streamed text).
  - [x] Verify: `pnpm vitest run tests/trip-change-proposals.test.ts`, `pnpm vitest run tests/trip-home.test.ts`, `pnpm vitest run tests/trip-projects.test.ts`, `pnpm vitest run tests/ai-ask-shell.test.ts` (serial-safe flags where used in 7.3), then `pnpm test:run`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:generate` (no drift). Record exact blockers if the database environment is unavailable; do not claim verification passed.

### Review Findings

Review of commit 9e8e143 (2026-07-25). Layers: Edge Case Hunter, Acceptance Auditor ran; Blind Hunter returned empty (failed layer). 1 dismissed (expiresAt never set by AI draft — "optional" permits null and expiry feature is fully implemented). 0 decision-needed, 0 defer.

- [x] [Review][Patch] Proposal drafting throw breaks the answer — `draftAndPersistProposal` outer try has only `finally` (no catch); an unexpected throw from `recordTripChangeProposalDraftUsage` (calls `getDb()` outside its inner try/catch) or `persistAiTripChangeProposalDraft` propagates to the route's outer catch, sending an `error` StreamEvent after the answer text was already streamed and the assistant message persisted. Violates AC1/AC3 + Open Decision 1 ("never block or break the answer") [src/app/api/ai-ask/stream/route.ts:531] — HIGH
- [x] [Review][Patch] `deriveAffectedItems` hardcodes `kind: "activity"` and `label: ""` for update/remove/reorder/change-state/upsert-constraints — affected items are not explicitly identified (AC1) and the review card cannot show which item is affected (only a UUID never displayed) [src/features/chat-trips/trip-change-proposals.ts:892] — MEDIUM
- [x] [Review][Patch] `deriveBeforeAfter` always sets `before: null` and for `update-item` sets `after` to a comma-joined list of field NAMES (not values) — no real before/after impact is shown, violating AC4's "bounded before/after impact" [src/features/chat-trips/trip-change-proposals.ts:907] — MEDIUM
- [x] [Review][Patch] Answer-surface proposal card never offers "Xem phương án khác" — `AnswerProposalCard` hardcodes `hasAlternatives: false` and `ProposalDoneSummary` omits the `alternatives`/`hasAlternatives` fields, so the answer surface is inconsistent with the workspace panel which does show alternatives. Violates AC4 ("Xem phương án khác only when alternatives supplied") [src/features/ai/ai-ask-composer.tsx:595] — MEDIUM
- [x] [Review][Patch] `change-item-state` before/after renders the raw English enum (`confirmed`) instead of the Vietnamese label (`Đã chốt`) — `tripPlanItemStateLabels` exists but is not applied. Violates Vietnamese-first UX + AC4 labeled-status requirement [src/features/chat-trips/trip-change-proposals.ts:922] — MEDIUM
- [x] [Review][Patch] AI proposal-draft module directly imports and queries Chat/Trips-owned tables (`tripPlanItems`, `tripProjectConstraints`, `tripProjects`) instead of reading the aggregate via Chat/Trips query helpers. Breaks the ownership boundary the spec requires ("non-owning modules receive exported read models or invoke Chat/Trips commands") [src/features/ai/trip-proposal-draft.ts:6] — MEDIUM
- [x] [Review][Patch] `create-item` activity without `parentItemId` is rejected, contradicting the system prompt ("activities may carry parent_item_id" — optional) and Story 7.1 `validatePlanReferences` (allows null parent for activities). Valid model output following the prompt gets the whole draft rejected [src/features/chat-trips/trip-change-proposals.ts:227] — MEDIUM
- [x] [Review][Patch] `orderingPreconditions` is never captured through the AI draft path (`UntrustedTripChangeProposalDraft` lacks the field, `parseDraftPayload` doesn't parse it, insert never sets it) — column is always null, so 7.5 apply will have no structural preconditions. AC1 lists "ordering/parent preconditions when applicable" [src/features/ai/trip-proposal-draft.ts:24] — LOW
- [x] [Review][Patch] `validatePlanReferences` not reused — same-project parent/backup/no-cycle rules are reimplemented inline in `validateProposalOperations`, risking divergence. Spec task required "by extracting or delegating" [src/features/chat-trips/trip-projects.ts:608] — LOW

### Second Review Findings

Second bounded review of commits 9e8e143 (initial) + 5b6f23c (repair). Layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor all ran; 0 failed layers. All 9 first-round findings verified repaired. 5 `patch` (all LOW), 1 `defer` (LOW), 0 decision-needed, 0 dismissed. None high/medium; none constitute substantial new risk (no high severity, no new systemic acceptance-criteria/security/data-integrity/cross-feature failure).

- [ ] [Review][Patch] `deriveBeforeAfter` per-field expansion silently truncates the before/after summary — finding 3's repair expanded `update-item` to one entry per changed field (up to 8), but the cap remains `summaries.slice(0, maxOperations)` (20). A multi-field proposal (e.g. 5 update-item ops × 5 fields = 25 entries) is silently truncated, so the review card shows an incomplete before/after impact while the persisted operations remain complete. Regression of the finding 3 repair [src/features/chat-trips/trip-change-proposals.ts:1126] — LOW
- [ ] [Review][Patch] `backupTargetItemId` before/after leaks a raw UUID when the backup target was deleted between persist and read — `describeKnownFieldValue`/`describeChangeValue` fall back to `?? known.backupTargetItemId` / `?? value`, contradicting the file's own stated "without leaking a raw UUID" policy. Use the `"(đã xoá)"` fallback instead [src/features/chat-trips/trip-change-proposals.ts:1057-1059,1076-1078] — LOW
- [ ] [Review][Patch] `change-item-state` before/after omits the backup target name — when the AI proposes a state change to `backup` with a `backupTargetItemId`, the review card shows only the state-label transition (e.g. "Ý tưởng → Phương án B") and never names which item is the backup target, so the owner can approve a backup relationship without seeing the target. Append the target label to the operation or before/after entry [src/features/chat-trips/trip-change-proposals.ts:1116-1121] — LOW
- [ ] [Review][Patch] Empty `update-item` changes object (`{}`) is accepted as a valid no-op operation — `parseItemChanges` returns `{}` when no keys are present (the allowed-key loop only rejects unknown keys), `parseUpdateItem` accepts it, and a no-op update is persisted, rendered as an affected item with zero before/after entries, and handed to 7.5 apply. Require at least one recognized field [src/features/chat-trips/trip-change-proposals.ts:453] — LOW
- [x] [Review][Patch] Proposal prompt `expected_output` contract omits `ordering_preconditions` — finding 8 plumbed the field through parse → carry → insert, but the system prompt and `expected_output` template never instruct the model to emit it, so the column stays always-`null` from the AI path and AC1's "ordering/parent preconditions when applicable" is not realized for AI-drafted proposals. Add an optional `ordering_preconditions` slot to the prompt [src/features/ai/prompts.ts:355-374] — LOW — repaired 2026-07-25: added `ordering_preconditions` to the `expected_output` example in `buildTripChangeProposalDraftMessages` so the model is instructed to emit the field; ~~the existing parser (`parseDraftPayload`) and persistence path already carry it through to the `trip_change_proposals.ordering_preconditions` column~~ NOTE: this claim was incorrect — the parser read camelCase `orderingPreconditions` while the prompt emits snake_case `ordering_preconditions`, so the field was still always null. Corrected by E7R2-F2 in the third epic review (see below).
- [x] [Review][Defer] Cross-operation backup cycle (A↔B) is not detected — two `change-item-state` ops in one proposal (A→backup target B, B→backup target A) each validate independently against the pre-operation snapshot where both targets are null, so both pass and a latent mutual-backup cycle is persisted. 7.4 writes no plan state, so no cycle is written to `trip_plan_items`; 7.5 `applyApprovedTripChange` must re-validate backup cycles against post-apply state (it already locks the aggregate and compares version fences). Enforcement belongs at the 7.5 apply mutation point [src/features/chat-trips/trip-change-proposals.ts:191] — deferred, pre-existing per-op snapshot pattern shared with Story 7.1 `validatePlanReferences`

### Third Epic Review Findings (E7R2 — Second and final Epic 7 completion review)

Second and final Epic 7 completion review 2026-07-26 (bmad-code-review, 3 adversarial layers on diff 4e34428..aa4c5d1) surfaced 6 actionable epic-level findings (E7R2-F1..F6: 2 HIGH, 2 MEDIUM, 2 LOW) affecting Stories 7.4 and 7.5. The 2 findings whose root cause lives in the 7.4 AI-draft path (E7R2-F2, F3) are fixed here; the 4 findings whose root cause lives in the 7.5 apply/persist/worker/UI path (F1, F4, F5, F6) are fixed in the 7.5 story record. The Acceptance Auditor had confirmed E7R-3 and E7R-6 were NOT genuinely fixed by the first epic-review repair (the repairs were no-ops at the parser/prompt layer); E7R2-F2 completes E7R-3 and E7R2-F3 completes E7R-6. Verification: 1007 tests pass, lint/typecheck/build/db:generate clean. No commit performed per instructions. Status set to review.

- [x] [Review][Patch] E7R2-F2 HIGH — orderingPreconditions camelCase/snake_case parser mismatch → column always null. `parseDraftPayload` (`trip-proposal-draft.ts:319`) read `parsed.orderingPreconditions` (camelCase) but the system prompt (`prompts.ts:116`) and expected_output example (`prompts.ts:375`) emit `ordering_preconditions` (snake_case), so the model's snake_case output was never read and the column was always null for AI-drafted proposals — AC1's "ordering/parent preconditions when applicable" was not realized for AI drafts, and E7R-3's inner-key alignment was a no-op. Fix: read `parsed.ordering_preconditions` first (the documented prompt contract) with a camelCase `parsed.orderingPreconditions` fallback for robustness/legacy callers. This completes E7R-3. [src/features/ai/trip-proposal-draft.ts:316-323]
- [x] [Review][Patch] E7R2-F3 MEDIUM — expires_at not in prompt → E7R-6 no-op. `parseDraftPayload` reads `parsed.expires_at` (`trip-proposal-draft.ts:323`) but the system prompt (`prompts.ts:107-118`) and expected_output example (`prompts.ts:356-376`) never mentioned `expires_at`, so the model never emitted it and the parse/persist wiring was unreachable from the AI path — E7R-6's fix was a no-op in practice; all AI-drafted proposals carried `expiresAt=null`. Fix: add an `expires_at` instruction (optional, ISO 8601, strictly future) to the system prompt and an `expires_at` slot to the expected_output example so the model is instructed to emit the field. This completes E7R-6. [src/features/ai/prompts.ts:117-118,376]

Third review dismissed as noise (0). Deferred (0). Decision-needed (0).

## Dev Notes

### Product And Authority

- Authority order: `epics.md` (Story 7.4), final PRD §8.2/§10.7, `ARCHITECTURE-SPINE.md` (AD-29, AD-30, AD-6, AD-10, AD-11, AD-13, AD-16), UX `DESIGN.md`/`EXPERIENCE.md`, the 2026-07-25 readiness report, and current code. The older `_bmad-output/implementation-artifacts/epic-7-context.md` is not authority (confirmed by Stories 7.1–7.3).
- This is the fourth Epic 7 story. Sequence is fixed: aggregate (7.1 done), primary conversation (7.2 done), Trip Home/workspace (7.3 done), proposals (7.4 — this story), terminal proposal actions/history (7.5), safety verification (7.6).
- FR-16G is the primary FR; FR-16H (owner-confirmed application) and FR-16I (history) are 7.5/7.6. NFR-10 (owner-scoped) and NFR-11 (apply validates membership/applicability/authorization) govern the fences authored in this story's draft and executed in 7.5.
- Readiness report line 175: "preserve the requirement that every chat-originated plan mutation becomes a typed proposal before the owner explicitly applies it; do not add a separate plan editor or direct model/table mutation." This story must not introduce any direct plan mutation path.

### Proposal Schema And Validation Contract (AD-30, AD-29)

- A Trip Change Proposal is an immutable typed **draft** owned by exactly one Trip Project. It records: status `pending | applied | dismissed | expired`; bounded rationale; explicitly identified operations; expected Trip Project aggregate version; expected versions of every affected existing item; ordering/parent preconditions for create/reorder; alternatives when available; optional expiry; terminal timestamp. It is not a plan item and does not change retrieval context by existing.
- Operations identify only the target item and permitted structured-field changes. They must NOT embed executable SQL, arbitrary routes, or provider/model payloads.
- Plan-item invariants to enforce in validation (AD-29): kind `anchor | leg | activity`; anchor → one `anchor_role` (`origin | destination | region | required_stop | accommodation`) and `type` null; leg/activity → one `type` (`transport | visit | food | rest | accommodation`) and `anchor_role` null; state `idea | planned | confirmed | backup`; `backup` iff a same-project `backupTargetItemId` exists; parent only for activities (parent = a leg) and within the same project; no cycles; ordering scope `(trip_project_id, parent_item_id)` with unique ordinals. Constraints: only the Story 7.1 travel-relevant allowlist (adult/child counts, child comfort/preference tags without names/identity/medical, vehicle type, EV need, driving tolerance 1–12h, budget VND range, preference/avoid tags); disallowed sensitive data rejected.
- Version fences are captured at draft time: `expectedAggregateVersion` and `expectedItemVersions` (map itemId→version). The 7.5 `applyApprovedTripChange` will lock the aggregate and compare these before applying. A stale/expired/missing-item/conflicting proposal applies nothing and returns a safe refresh-required result.

### AI-Mutation Boundary (AD-30, AD-29, AD-6)

- AI Orchestration may read the Trip Planning aggregate and emit a schema-validated proposal draft, but it may NOT write plan tables or bypass the Chat/Trips proposal command. The AI proposal-draft module returns an untrusted draft; `persistAiTripChangeProposalDraft` is the only persistence path.
- Provider output, answer annotations, and proposal-card actions remain untrusted inputs until the owner-confirmed command validates them (7.5).
- The primary conversation is the exclusive plan-authoring surface. `chat_context` and transcript text never become an alternative itinerary writer or source of truth.
- Chat/Trips owns proposals; non-owning modules receive exported read models or invoke Chat/Trips commands. Do not export generic cross-module table upsert/delete helpers.

### Expiry, Owner-Scope, Transactions, No Raw Model Content

- Expiry: `expiresAt` is optional. Expired pending proposals must not win Trip Home focus and must render with no apply action. The idempotent `expireTripChangeProposal` command and scheduled worker are 7.5; this story stores expiry and treats elapsed proposals as non-focus, non-applicable in reads. Reuse the Story 7.3 `isUnexpiredProposal` helper in `trip-home.ts`.
- Owner-scope: all proposal reads/writes compose `userId` predicates with the composite owner FK convention. Cross-owner reads return `null` without leaking existence, mirroring `getOwnedTripProjectSummary`.
- Transactional writes: proposal persistence + audit + usage event follow the existing transactional pattern (see `route.ts` assistant-message persistence). No partial writes; on failure, no proposal row and no plan mutation.
- No raw model content: the persisted proposal and any future history row store only safe structured operation summaries, not raw prompts/responses. The `done` event payload carries a bounded summary reconciled from the persisted row, not from streamed model text. Do not retain full prompts, provider payloads, or unlimited extraction JSON.

### Deletion Behavior (AD-13, AD-29)

- Deleting an owned Trip Project cascades to its proposals and history rows (`ON DELETE CASCADE` on the composite owner FK), alongside the existing cascade for plan items, constraints, conversations, and context. Only minimal non-content audit metadata remains. `deleteOwnedTripProject` must report the removed proposal count in its audit `beforeSummary`.

### UX Contract (EXPERIENCE.md, DESIGN.md)

- Where proposals appear: assistant answer (concise card), Trip Home focus (highest priority when a pending unexpired proposal exists, with `Xem đề xuất và tác động` entry), Trip Workspace panel / mobile sheet (complete before/after review + actions), timeline (read-oriented; proposal never silently merged into confirmed items).
- Change Proposal card (`{components.change-proposal}`): white bg, road-ink foreground, radius lg, amber `#D97706` border. Contains `Đề xuất`, rationale, before/after, bounded action row. No shadow/animation/saturated color to pressure apply. Pending proposals must never look identical to confirmed timeline items.
- Supported actions (Vietnamese): `Áp dụng` (primary, explicit owner action, never automatic), `Giữ kế hoạch` (dismiss, secondary), `Xem phương án khác` (only when alternatives supplied), `Xem đề xuất và tác động` (Trip Home entry). No apply for expired.
- Interaction: on opening proposal review, focus moves to the proposal heading; on terminal result, focus returns to the originating answer card or Trip Home focus card. Timeline has no reorder/edit/status controls.
- Conflict/stale recovery (UX `Làm mới đề xuất`): the wired refresh command is 7.5. In 7.4, a stale/expired proposal renders its safe summary with no apply and a visible "plan changed / refresh" affordance as a 7.5 integration point; do not overwrite newer confirmed changes.
- Trust copy: a proposal is a suggestion, not a booking, route check, weather check, or availability claim. Name unavailable dynamic information rather than implying it was checked (PRD §10.7).

### Existing Implementation To Preserve

- `src/app/api/ai-ask/stream/route.ts` is the sole AI orchestration entrypoint. Preserve the `preparing | delta | done | error` contract, the two-transaction persistence (user message; assistant message + provenance + usage), the `after(() => extractChatTripContext(...))` async pattern, and `buildValidatedAnswerAnnotations`. Add proposal drafting as a bounded enrichment step before `done`; extend the `done` payload additively.
- `src/features/chat-trips/trip-projects.ts` owns `getOwnedTripProjectSummary` (currently passes `pendingProposals: []` at line 231), `OwnedTripProjectWorkspaceSummary`, `resolveOwnedPrimaryConversationInTransaction`, `deleteOwnedTripProject`, and the internal aggregate primitives (`createInternalTripPlanItem`, `updateInternalTripPlanItem`, `deleteInternalTripPlanItem`, `reorderInternalTripPlanItem`, `upsertInternalTripProjectConstraints`), plus `lockAggregate`, `advanceAggregate`, `recordAggregateAudit`, `validatePlanReferences`, `normalizePlanItem`, `normalizeConstraints`. Reuse `validatePlanReferences` (same-project parent/backup, no cycles) and the constraints allowlist for proposal validation. Do not change primary-resolution, deletion, or historic-chat behavior. The internal primitives remain internal — 7.5's `applyApprovedTripChange` will orchestrate them; 7.4 does not call them.
- `src/features/chat-trips/trip-home.ts` already defines `PendingProposalFocusInput` (`{ id, expiresAt?, createdAt }`), `TripHomeFocus` with `pending-proposal-with-expiry` / `pending-proposal` variants, `computeTripHomeFocus`, `findPendingProposalWithExpiry`, `findPendingProposalWithoutExpiry`, `isUnexpiredProposal`, and `buildTripWorkspaceReadModelWithConstraints`. Extend the input/model to carry richer proposal fields; keep the functions pure and deterministic with explicit `now`.
- `src/features/chat-trips/trip-home-labels.ts` holds client-safe Vietnamese labels. Add proposal labels there (e.g. `Đề xuất`, `Áp dụng`, `Giữ kế hoạch`, `Xem phương án khác`, `Đã hết hạn`) to keep `trip-home.ts` server-only while the presentational card imports labels.
- `src/features/ai/trip-workspace-panel.tsx` renders the project header, Trip Home focus card, timeline, constraints. Add the proposal review card there (or sibling). Keep it presentational and data-free.
- `src/features/ai/ai-ask-composer.tsx` mounts `TripWorkspacePanel` at desktop and mobile positions and owns transient selection/focus. Accept the proposal summary from the `done` payload; render the answer-surface proposal card; manage focus movement.
- `src/features/ai/gateway.ts` exposes `streamInitialAiAskAnswer`, `completeInitialAiAskAnswer`, `completeExtraction`, `completeEvaluation`. `completeExtraction` (temperature 0, maxTokens 1500, schema-validated JSON) is the template for `completeTripChangeProposalDraft`. `AiGatewayCompletionPurpose = "ai_ask" | "extraction" | "evaluation"` — add `"trip_proposal_draft"`.
- `src/features/chat-trips/context-extraction.ts` (`extractChatTripContext`) is the validate-then-persist-then-audit-then-usage template: validates ownership, calls the gateway, parses/validates JSON against an allowed-field set, persists via audited transaction, writes usage. Mirror this for proposal drafting, but persistence is delegated to the Chat/Trips proposal command.
- `src/db/schema.ts` defines `tripProjects`, `tripProjectConstraints`, `tripPlanItems`, `conversations`, `messages`, `audit_events`. Follow the composite-owner-FK + check-constraint discipline exactly. Self-FKs needing deferred behavior use a custom SQL migration (see `0061`).
- `formatTripProjectLabel` in `src/features/chat-trips/labels.ts` stays unchanged.
- Pinned stack: Next.js 15.3.5, React 19.1.0, TypeScript 5.8.3 strict, Drizzle ORM 0.44.5 / Drizzle Kit 0.31.4, PostgreSQL (`@neondatabase/serverless` 1.0.2), pnpm 10.26.2, Vitest 4.1.10, `server-only` 0.0.1. No new dependency.

### Database And Concurrency Guardrails

- This story persists proposals only; it does not mutate plan items, constraints, or item states, and does not advance `aggregateVersion` or any item `version`. Version fences are captured at draft time for 7.5 to enforce.
- Owner-scoping is mandatory on every proposal read/write. A cross-owner proposal read returns `null` without leaking existence.
- `pnpm lint`/`typecheck`/`build` must not require a live database. DB-backed tests run through the existing Vitest global setup that applies all Drizzle migrations.
- Migrations live in `drizzle/migrations/` (latest `0062`); next is `0063`.

### Previous Story Intelligence

- Story 7.1 established `trip_plan_items` and `trip_project_constraints` with composite owner FKs, root/child ordinal unique indexes, deferred self-reference FKs (custom SQL), and a version-fenced internal command boundary. Reuse its typed projection shapes, owner-scoping, `validatePlanReferences` rules, and constraints allowlist; do not restate or relax its invariants. 7.1 recovery found malformed values must be rejected before transaction/persistence — apply the same to proposal operations.
- Story 7.2 established the primary conversation as the exclusive plan-authoring surface and the `Lịch sử trao đổi` historic-chat access pattern; the canonical URL shell for `conversationId`/`tripProjectId`/`historyConversationId`. Proposals are requested in the primary conversation; no competing composer.
- Story 7.3 established the pure Trip Home read model with `pendingProposals: []` placeholder and `PendingProposalFocusInput`; this story supplies real proposals. 7.3 review fixes to mirror: no unchecked casts (use `instanceof`/type-guard filters); validate `plannedAt` when non-null; keep label constants in `trip-home-labels.ts` so client components do not import server-only modules; use `idPrefix` to keep duplicate-safe ids across desktop/mobile instances; convert date/time display to Vietnam time (ICT, UTC+7) deterministically; ensure only one `aria-modal="true"` dialog open at a time (coordinate with the existing answer-detail dialog and workspace sheet).
- Unresolved action items (Epic 3 chat concurrency, Epic 5 Tavily/pricing/assistant idempotency, Epic 5 family-context scoping) remain open and are not resolved by this story.

### Git Intelligence

- Recent commits: `2af7ecd docs(status): mark story 7.3 done`, `267a122 fix(trip-planning): repair trip home second review findings`, `be629f4 fix(trip-planning): repair trip home review findings`, `a354e1f feat(trip-planning): present trip home and owner plan workspace`, `64a64ab docs(status): mark story 7.2 done`, `5123e27 feat(trip-planning): establish primary project conversation`, `5f7e482 docs(status): mark story 7.1 done`, `a76ce4c fix(trip-planning): defer plan item self references`, `448d134 fix(trip-planning): reject malformed constraints`, `7741622 feat(trip-planning): establish versioned project aggregate`.
- Pattern: Chat/Trips-owned modules in `src/features/chat-trips/`, server-only with `@/*` imports, real PostgreSQL tests under `tests/`, no new services/packages, no UI/route split. AI enrichment modules in `src/features/ai/` call the gateway and delegate persistence to Chat/Trips. Follow the same conventions.
- 7.3 shell tests used `pnpm vitest run tests/ai-ask-shell.test.ts --maxWorkers=1 --fileParallelism=false` for serial safety; reuse that flag for the shell suite.

### Library And Framework Requirements

- Use the repository-pinned Next.js 15.3.5 App Router, React 19.1.0, TypeScript 5.8.3 strict, Drizzle ORM 0.44.5 / Drizzle Kit 0.31.4, PostgreSQL, pnpm 10.26.2, Vitest 4.1.10, `server-only` 0.0.1. No additional library, icon package, or external vector store.
- Use `server-only` on `src/features/chat-trips/trip-change-proposals.ts` and `src/features/ai/trip-proposal-draft.ts`. Use `@/*` imports, explicit types, and safe operational errors. No `any`, unchecked casts, generic cross-module table helpers, or a separate service/package.
- Keep React components presentational and data-free (props from server-loaded read model); avoid unnecessary `useMemo`/`useCallback`.

### File Structure Requirements

**New**

- `src/features/chat-trips/trip-change-proposals.ts` — Chat/Trips-owned proposal command/read module: typed operation schema, `validateProposalOperations`, `persistAiTripChangeProposalDraft`, `listPendingProposalsForTripProject`, `getProposalForOwnerReview`, owner-scoped safe projections (server-only).
- `src/features/ai/trip-proposal-draft.ts` — AI Orchestration proposal-draft module: read aggregate via Chat/Trips helpers, build prompt, call gateway, parse/validate JSON, return untrusted draft; persists nothing (server-only).
- `src/features/ai/trip-proposal-review-card.tsx` (or inline in `trip-workspace-panel.tsx`) — presentational Change Proposal card (data-free, props-driven).
- `drizzle/migrations/0063_*.sql` (+ custom SQL supplement if Drizzle cannot express a check/deferrable constraint) — adds `trip_change_proposals`, `trip_plan_change_history` schema, extends `audit_events.operation` and adds `audit_events.actorClass`/`actorSystem`.
- `tests/trip-change-proposals.test.ts` — validator unit tests + DB-backed persistence/read/cascade tests.

**Update**

- `src/db/schema.ts` — add `tripChangeProposals`, `tripPlanChangeHistory` tables; extend `audit_events` operation check + actor columns; export types.
- `src/features/ai/gateway.ts` — add `"trip_proposal_draft"` purpose + `completeTripChangeProposalDraft` wrapper.
- `src/features/ai/prompts.ts` — add proposal-draft purpose, prompt version, and `buildTripChangeProposalDraftMessages`.
- `src/app/api/ai-ask/stream/route.ts` — wire proposal drafting before `done`; extend `done` payload with bounded proposal summary; record usage event.
- `src/features/chat-trips/trip-projects.ts` — extend `OwnedTripProjectWorkspaceSummary` + `getOwnedTripProjectSummary` with real `pendingProposals`; extend `deleteOwnedTripProject` audit `beforeSummary` with proposal count (cascade via FK).
- `src/features/chat-trips/trip-home.ts` — extend `PendingProposalFocusInput`/`TripWorkspaceReadModel` with richer proposal fields; feed through `buildTripWorkspaceReadModelWithConstraints`; expired proposals do not win focus.
- `src/features/chat-trips/trip-home-labels.ts` — add proposal Vietnamese labels (`Đề xuất`, `Áp dụng`, `Giữ kế hoạch`, `Xem phương án khác`, `Đã hết hạn`).
- `src/features/ai/trip-workspace-panel.tsx` — render the proposal review card when proposals exist; expired gating; alternatives-only-when-supplied.
- `src/features/ai/ai-ask-composer.tsx` — accept proposal summary from `done` payload; render answer-surface proposal card; focus movement; pass proposals to `TripWorkspacePanel`.
- `tests/trip-home.test.ts` — real pending/expired proposal focus rows.
- `tests/trip-projects.test.ts` — `pendingProposals` summary + cascade-delete proposal count.
- `tests/ai-ask-shell.test.ts` — proposal card rendering, visual distinction, expired gating, alternatives visibility, focus movement, no plan editor, no provider call in read path, `done` payload reconciliation.

Do not create a new generic service, package, client persistence store, manual plan editor, map integration, or a separate route. Keep all proposal command/read logic in the owning Chat/Trips feature; keep AI drafting in the AI feature.

### Testing Requirements

- Pure unit tests for `validateProposalOperations` (no DB) so every permitted operation and every reject/omit case is exhaustively covered without migration coupling.
- DB-backed tests for proposal persistence, owner-scope, version-fence capture, invalid-draft rejection, no plan mutation, and cascade-on-delete — using the real PostgreSQL test database so composite FKs and checks are exercised. Mocked DB cannot prove owner scoping or cascade.
- Shell tests for proposal card rendering, visual distinction from confirmed items, expired-state gating (no apply), alternatives-only-when-supplied, focus movement, absence of a plan editor/map controls, no provider call in the read path, and `done` payload reconciliation from persisted data (not streamed text).
- The test global setup applies all Drizzle migrations; confirm `pnpm db:generate` produces no drift (clean exit, no new migration beyond `0063`).
- Preserve old behavior: ordinary chats without a selected project create no proposal; a selected project with no pending proposals shows the existing Trip Home focus; expired proposals do not win focus; cross-owner proposal reads return `null` without leaking existence.
- If the database environment is unavailable, record the exact command, failure, and blocker in completion notes; do not claim verification passed.
- Relevant commands: `pnpm vitest run tests/trip-change-proposals.test.ts`, `pnpm vitest run tests/trip-home.test.ts`, `pnpm vitest run tests/trip-projects.test.ts`, `pnpm vitest run tests/ai-ask-shell.test.ts`, `pnpm test:run`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:generate`.

### Open Decisions Resolved For The Dev

1. **Stream lifecycle placement**: run proposal drafting after the assistant message + annotations are persisted and before the `done` event, only when a `tripProjectId` is selected. Include a bounded proposal summary in `done`. On failure/timeout, send `done` without a proposal; never block or break the answer.
2. **`trip_plan_change_history` table**: define the schema in the 7.4 migration (`0063`) alongside `trip_change_proposals` so 7.5 needs no second migration. Write no history rows in 7.4.
3. **Gateway purpose**: add `"trip_proposal_draft"` to `AiGatewayCompletionPurpose` (the gateway runtime type) for clean usage attribution; add a `completeTripChangeProposalDraft` wrapper. This is NOT a DB `AiGatewayModelPurpose` — do not extend `aiGatewayModelPurposeValues` or the `ai_gateway_models_purpose_check` constraint. Reuse the `extraction` model purpose for `selectActiveAiGatewayModel` (both are bounded non-streaming JSON at temperature 0). Add `tripChangeProposalDraft` to `aiUsagePurposes`/`aiUsagePromptVersions` constants and write the free-text `ai_usage_events.purpose`; neither needs a migration.
4. **Refresh UX**: `Làm mới đề xuất` wired handler is 7.5. In 7.4, stale/expired proposals render safe summary + no apply + a visible 7.5 refresh integration point; do not overwrite newer confirmed changes.
5. **`audit_events` enum/actor**: extend `operation` with `apply | dismiss | expire` and add `actorClass`/`actorSystem` columns in migration `0063` so 7.5 can record terminal history and the `system-trip-planning` actor without a second migration. 7.4 proposal-creation audit uses `operation = 'create'`, `actorClass = 'user'`.
6. **Action buttons in 7.4**: render the supported-action row with correct state-gated visibility as presentation; apply/dismiss command wiring is 7.5. Use `aria-disabled` + `data-story="7.5"` hooks; do not fake a successful apply.

### Project Structure Notes

- Alignment with the unified structure: Chat/Trips owns the proposal command/read module; the AI feature owns only the draft-generation + presentational card; UI primitives stay under `src/components/ui`; tests stay under `tests/`; migrations stay under `drizzle/migrations/`.
- No detected conflicts with the existing structure. Keep the composer as the single shell owner; prefer a focused presentational `TripProposalReviewCard` rather than bloating the composer.
- Do not move planning/implementation documents into app folders; BMad artifacts stay under `_bmad-output/`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.4: Generate Reviewable AI Trip Change Proposals]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7: Controlled Trip Project Planning]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.2 User Authentication, Chats, And Trips] (FR-16G, FR-16H, FR-16I)
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.7 Trip Planning Foundation Contract]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#9 NonFunctional Requirements] (NFR-10, NFR-11)
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/addendum.md#Resolved Product Decisions]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Mutations Are Server-Side And Audited]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-10: AI Gateway Access Is Adapter-Based And Source-Bundled]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-11: Answer Provenance Is Persisted, Not UI-Derived]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13: Users Delete Their Own Chats And Trip Projects]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-16: Streaming Starts After Context Assembly]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29: Trip Planning Is A Chat/Trips-Owned Structured Aggregate]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30: Primary Conversation And Change Proposals Are Explicit Commands]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Core persisted entities] (`trip_change_proposals`, `trip_plan_change_history`)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Component Patterns] (Trip Change Proposal)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#State Patterns] (Pending/Applying/Conflict/Expired/Applied-dismissed)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Interaction Primitives]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Trust, Privacy, And Provenance]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md#Components] (change-proposal card)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md#Do's and Don'ts]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-25.md#Trip Project Traceability]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-25.md#Epic 7: Controlled Trip Project Planning]
- [Source: _bmad-output/project-context.md#Technology Stack & Versions]
- [Source: _bmad-output/project-context.md#Framework-Specific Rules]
- [Source: _bmad-output/project-context.md#Development Workflow Rules]
- [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- [Source: _bmad-output/implementation-artifacts/7-1-establish-the-versioned-structured-trip-project-aggregate.md#Aggregate Contract]
- [Source: _bmad-output/implementation-artifacts/7-1-establish-the-versioned-structured-trip-project-aggregate.md#Plan-Item Location Contract]
- [Source: _bmad-output/implementation-artifacts/7-2-establish-the-primary-project-conversation-without-losing-history.md#Existing Implementation To Preserve]
- [Source: _bmad-output/implementation-artifacts/7-3-present-trip-home-and-the-owners-plan-workspace.md#Existing Implementation To Preserve]
- [Source: _bmad-output/implementation-artifacts/7-3-present-trip-home-and-the-owners-plan-workspace.md#Review Findings] (casts, plannedAt validation, label split, idPrefix, ICT dates, single aria-modal)
- [Source: src/db/schema.ts#tripProjects]
- [Source: src/db/schema.ts#tripPlanItems]
- [Source: src/db/schema.ts#tripProjectConstraints]
- [Source: src/db/schema.ts#audit_events]
- [Source: src/app/api/ai-ask/stream/route.ts#POST]
- [Source: src/features/chat-trips/trip-projects.ts#getOwnedTripProjectSummary]
- [Source: src/features/chat-trips/trip-projects.ts#validatePlanReferences]
- [Source: src/features/chat-trips/trip-home.ts#PendingProposalFocusInput]
- [Source: src/features/chat-trips/trip-home.ts#computeTripHomeFocus]
- [Source: src/features/ai/gateway.ts#completeExtraction]
- [Source: src/features/chat-trips/context-extraction.ts#extractChatTripContext]
- [Source: src/features/ai/trip-workspace-panel.tsx]
- [Source: src/features/ai/ai-ask-composer.tsx#AiAskComposer]

## Dev Agent Record

### Agent Model Used

glm-5.2 (gpu4ai/glm-5.2)

### Debug Log References

- Initial DB-backed proposal-persist tests failed because `normalizeRationale` had return type `string | string` (always string), so the `typeof rationale === "string"` guard always rejected. Fixed by returning a `{ ok, value } | { ok: false }` result. Same flaw existed in `parseBoundedLabel`, `parseBoundedNotes`, `parseBoundedOptionalLabel`, and `parseOptionalPlannedAt`; all fixed to return `undefined` as the invalid sentinel (valid values are string or null).
- Cross-owner proposal read test leaked because two `vi.doMock` + dynamic-import sequences in one test shared a cached module. Fixed by calling `vi.resetModules()` inside the `persistAs` and `loadReadsAs` helpers before each mocked import.

### Completion Notes List

- Implemented all 7 tasks and 4 acceptance criteria for Story 7.4.
- Schema: added `trip_change_proposals` and `trip_plan_change_history` (schema-only, no rows in 7.4) tables with composite owner FKs `ON DELETE CASCADE`, check constraints, and the status/terminal-timestamp shape invariant. Extended `audit_events.operation` with `apply | dismiss | expire` and added `actorClass`/`actorSystem` columns. Migration `0063_neat_tattoo.sql` generated with no drift.
- Chat/Trips proposal module (`trip-change-proposals.ts`): typed discriminated-union operation schema, `validateProposalOperations` (rejects unknown ops, cross-project refs, invalid kind/role/type/state, backup-without-target, transport fields on non-transport, accommodation area on non-accommodation, unbounded/multi-line content, executable SQL/URLs/JSON provider payloads), `persistAiTripChangeProposalDraft` (owner auth, aggregate version fence, in-transaction validation, `pending` row + `create` audit with `actorClass = 'user'`, no plan mutation), `listPendingProposalsForTripProject`, `getProposalForOwnerReview` (owner-scoped, cross-owner returns null, no raw model content). The dev judged omission of interdependent operations unsafe in 7.4, so any rejected operation rejects the whole draft.
- AI Orchestration proposal-draft module (`trip-proposal-draft.ts`): reads the aggregate via Chat/Trips-owned tables (read-only), builds the prompt, calls `completeTripChangeProposalDraft` (temperature 0, bounded maxTokens), parses JSON, returns an untrusted draft; persists nothing; records usage via `recordTripChangeProposalDraftUsage`. Gateway purpose `trip_proposal_draft` added to `AiGatewayCompletionPurpose` (runtime type only — NOT added to the DB `AiGatewayModelPurpose` enum or `ai_gateway_models_purpose_check`). `tripChangeProposalDraft` added to `aiUsagePurposes`/`aiUsagePromptVersions` constants (free-text usage labels, no migration). Reuses the existing `extraction` model purpose for `selectActiveAiGatewayModel`.
- Stream route: proposal drafting runs after the assistant message + annotations are persisted and before `done`, only when `tripProjectId` is selected, with a bounded 20s `AbortSignal` timeout. On success the `done` payload carries a bounded proposal summary reconciled from the persisted row; on drafting/validation failure or timeout, `done` is sent without a proposal and the answer still completes. The `preparing | delta | done | error` contract is preserved; `done` is extended additively only.
- Workspace read model: `OwnedTripProjectWorkspaceSummary` and `TripWorkspaceReadModel` extended with real `pendingProposals`; the 7.3 `pendingProposals: []` placeholder is replaced with `listPendingProposalsForTripProject`. `PendingProposalFocusInput` carries rationale/affectedItems/beforeAfter/alternatives. `computeTripHomeFocus` remains pure and deterministic; expired proposals do not win focus.
- Proposal review card (`trip-proposal-review-card.tsx`, presentational, data-free): amber `#D97706` border, white bg, radius lg, no shadow/animation/saturated color. Renders rationale, bounded before/after, affected items, expiry (ICT), trust copy ("đề xuất, không phải đặt phòng..."), and the supported-action row with state-gated visibility: `Áp dụng`/`Giữ kế hoạch` omitted for expired (expired marker shown), `Xem phương án khác` only when alternatives supplied. Buttons render with `aria-disabled` + `data-story="7.5"` hooks (no fake success). Card is rendered in the workspace panel and in the answer surface via `AnswerProposalCard` (focus moves to the proposal heading on appearance). Accessibility: keyboard-reachable heading (`tabindex="-1"`), `aria-live="polite"`, 44px mobile targets, Vietnamese diacritics preserved.
- Deletion: `deleteOwnedTripProject` relies on the cascade FK to remove proposals/history; the audit `beforeSummary` now includes `proposalCount`.
- Tests: new `tests/trip-change-proposals.test.ts` (37 tests: 24 pure validator unit tests covering every permitted and rejected case + 7 DB-backed persist tests + 6 read-model owner-scope/safety tests). Extended `tests/trip-home.test.ts` (+4 tests for rich fields and expired-focus priority), `tests/trip-projects.test.ts` (+2 tests for pending proposals in summary and cascade-delete proposal count), `tests/ai-ask-shell.test.ts` (+11 tests for card rendering, visual distinction, expired gating, alternatives visibility, 7.5 hooks, done-payload reconciliation, no provider call in read path).

### File List

New:
- `src/features/chat-trips/trip-change-proposals.ts`
- `src/features/chat-trips/plan-references.ts`
- `src/features/ai/trip-proposal-draft.ts`
- `src/features/ai/trip-proposal-review-card.tsx`
- `drizzle/migrations/0063_neat_tattoo.sql`
- `tests/trip-change-proposals.test.ts`

Updated:
- `src/db/schema.ts`
- `src/features/audit/events.ts`
- `src/features/usage/constants.ts`
- `src/features/ai/gateway.ts`
- `src/features/ai/prompts.ts`
- `src/app/api/ai-ask/stream/route.ts`
- `src/features/chat-trips/trip-projects.ts`
- `src/features/chat-trips/trip-home.ts`
- `src/features/chat-trips/trip-home-labels.ts`
- `src/features/ai/trip-workspace-panel.tsx`
- `src/features/ai/ai-ask-composer.tsx`
- `src/app/ai-ask/page.tsx`
- `tests/trip-home.test.ts`
- `tests/trip-projects.test.ts`
- `tests/ai-ask-shell.test.ts`

### Change Log

- 2026-07-25: Created the Story 7.4 implementation guide; status synchronized to ready-for-dev.
- 2026-07-25: Validated story readiness; clarified that `trip_proposal_draft` is a gateway completion + usage-attribution purpose only (not a DB `AiGatewayModelPurpose`), reusing the existing `extraction` model purpose for `selectActiveAiGatewayModel` so migration `0063` does not extend `ai_gateway_models_purpose_check`. Status remains ready-for-dev.
- 2026-07-25: Implemented Story 7.4 — schema + migration 0063, Chat/Trips proposal command/read module, AI Orchestration proposal-draft module + gateway purpose, stream-route wiring, workspace read model, presentational proposal review card, deletion cascade + proposal count audit, and full regression coverage (37 new + 17 extended tests). All verification gates pass: target vitest files (223 tests), `pnpm test:run` (884 tests), `pnpm lint` (0 errors), `pnpm typecheck`, `pnpm build`, `pnpm db:generate` (no drift). Status set to review.
- 2026-07-25: Repaired all 9 actionable code-review findings (1 HIGH, 6 MEDIUM, 2 LOW). Finding 1 (HIGH): added catch to `draftAndPersistProposal` outer try so an unexpected throw from usage recording or persistence returns undefined instead of propagating to the route outer catch (which would send an error StreamEvent after the answer was already streamed). Finding 2: `deriveAffectedItems` now uses loaded knownItems to identify the real kind/label of update/remove/reorder/change-state targets (falls back to "(đã xoá)" for removed items). Finding 3: `deriveBeforeAfter` now emits real before→after values per changed field for update-item, the removed label as `before` for remove-item, and before/after ordinals for reorder-item. Finding 4: `ProposalDoneSummary` (route + composer) now carries `alternatives`/`hasAlternatives`; `AnswerProposalCard` passes them through so "Xem phương án khác" appears when alternatives are supplied, consistent with the workspace panel. Finding 5: change-item-state before/after now uses `tripPlanItemStateLabels` (Vietnamese) instead of the raw English enum. Finding 6: AI proposal-draft module no longer imports Chat/Trips-owned tables; it reads the aggregate via the new `readOwnedTripProjectAggregateForProposalDraft` helper exported from `trip-projects.ts`. Finding 7: `create-item` activity without `parentItemId` is now accepted (matches the system prompt "activities may carry parent_item_id" and Story 7.1 `validatePlanReferences`); the corresponding unit test was flipped to assert acceptance. Finding 8: `orderingPreconditions` is now parsed from the model output, carried on `UntrustedTripChangeProposalDraft`, threaded through `persistAiTripChangeProposalDraft`, and written to the `trip_change_proposals.ordering_preconditions` column. Finding 9: extracted pure same-project parent/backup/no-cycle rules into `src/features/chat-trips/plan-references.ts` (`validatePlanReferencesRules`); the DB-backed `validatePlanReferences` and the proposal validator (`parseCreateItem`/`parseUpdateItem`/`parseReorderItem`/`parseChangeItemState`) both delegate to it, eliminating the inline reimplementation and divergence risk. All verification gates re-pass: target vitest files (223 tests: 37 trip-change-proposals + 84 trip-home/trip-projects + 102 ai-ask-shell), `pnpm test:run` (884 tests), `pnpm lint` (0 errors), `pnpm typecheck`, `pnpm build`, `pnpm db:generate` (no drift). Status set to review.
- 2026-07-25: Repaired the 1 remaining LOW second-review patch finding (prompt `expected_output` omits `ordering_preconditions`). Added an `ordering_preconditions` slot to the `expected_output` example in `buildTripChangeProposalDraftMessages` (`src/features/ai/prompts.ts`) so the model is instructed to emit the field; the existing parser (`parseDraftPayload`) and persistence path (`persistAiTripChangeProposalDraft` → `trip_change_proposals.ordering_preconditions`) already carry it through, so the column is now populated through the AI path and AC1's "ordering/parent preconditions when applicable" is realized for AI-drafted proposals. Prompt version unchanged (`trip_change_proposal_draft_v1`) since the story has not shipped. Verification gates re-pass: target vitest files (223 tests), `pnpm typecheck`, `pnpm lint` (0 errors). Status remains review.
- 2026-07-26: Epic 7 completion review (bmad-code-review, diff 4e34428..0955211) surfaced 6 epic-level findings (3 HIGH, 2 MEDIUM, 1 LOW) affecting Stories 7.4 and 7.5. Repaired the 3 findings that affect 7.4 (E7R-1, E7R-3, E7R-6). E7R-1 [HIGH]: `itemDraftToInternalInput` and `mergeChangesToInternalInput` in `trip-change-proposals.ts` now parse `plannedAt` from the item/changes via `parsePlannedAtForApply` instead of hardcoding `null`/`current.plannedAt`, so an owner-approved date change is written to the DB. E7R-3 [HIGH]: the prompt `expected_output` example in `buildTripChangeProposalDraftMessages` (`prompts.ts`) now emits `ordering_preconditions` with the validator-recognized keys (`parentItemId`, `ordinal`, `expectedChangedItemVersions`) instead of the mismatched `parentRequirements`/`ordinalNotes` keys that caused fail-closed `refresh_required`; a system-prompt line was added instructing the model on the recognized keys. E7R-6 [LOW]: `parseDraftPayload` in `trip-proposal-draft.ts` now parses `expires_at` from the model output; `UntrustedTripChangeProposalDraft` carries `expiresAt`; the stream route passes `draft.expiresAt` to `persistAiTripChangeProposalDraft` so AI-proposed expiry is persisted. Verification: `pnpm test:run` (1000 passed / 54 files), `pnpm lint` (0 errors), `pnpm typecheck` (clean), `pnpm build` (clean), `pnpm db:generate` (no drift). No commit performed per instructions. Status set to review.
