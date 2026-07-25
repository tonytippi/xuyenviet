---
baseline_commit: 9405cd1d457422ec497db5d05b7bafeb44068e76
---

# Story 7.6: Verify Owner-Scoped Trip Planning Safety

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a product owner,
I want automated verification of Trip Project ownership, conflicts, and state transitions,
so that structured planning remains safe as chat-driven proposals and confirmed changes interact.

## Acceptance Criteria

1. **Given** migration, command, and read-model tests run
   **When** they exercise multiple owners, deleted or unlinked conversations, invalid item relationships, stale versions, backup references, ordering conflicts, proposal expiry, and concurrent applies
   **Then** unauthorized or invalid operations fail without data leakage or partial writes
   **And** valid owner operations preserve aggregate versions, ordering, history, and existing project-deletion behavior.

2. **Given** Trip Home test fixtures cover expiring proposals, pending proposals, confirmed-item gaps, future legs, empty plans, and ties
   **When** its read model is evaluated
   **Then** it deterministically chooses the architecture-defined focus
   **And** it never implies unavailable dynamic data was checked.

3. **Given** the Trip Project workspace is verified across desktop and mobile presentations
   **When** keyboard, touch, focus, live-region, and reduced-motion behaviors are assessed
   **Then** plan and proposal actions remain reachable with explicit labels and recovery paths
   **And** proposal application remains an unmistakable owner-confirmed action.

## Scope And Boundaries

### In Scope

- Adversarial, automated verification of the safety contracts already implemented by Stories 7.1–7.5: owner-scoping, aggregate/item version fences, ordering-scope uniqueness, backup-reference and cycle rules, proposal expiry/dismiss/apply idempotency and atomicity, primary-conversation invariant, project-deletion cascade, Trip Home deterministic focus, and workspace accessibility/recovery.
- A new dedicated cross-cutting safety test suite plus additive extensions to existing trip-planning test files.
- Pure-unit Trip Home fixture tests (AC2) and DOM/source-inspection accessibility tests (AC3).

### Explicitly Out Of Scope

- No new product feature, command, table, column, migration, UI component, route, worker, or dependency. This is a verification story.
- No auto-regeneration of proposals (deferred per readiness report 2026-07-25 line 143 and Story 7.5 decision 5).
- No Google Maps/Places/Routes, booking, weather, live route, availability, budget tracking, checklist, vault, notifications, or collaboration (PRD §10.7 exclusions).
- No Epic 7 retrospective (status `optional`); this is the final Epic 7 story but the retro is separate.
- No refactor of production code for its own sake. If a test reveals a genuine safety defect, record it as a finding/blocker in Completion Notes and consult before expanding scope (do not silently rewrite production modules).

## Tasks / Subtasks

- [x] Task 1 — AC1: Owner-scope and existence-leakage verification (AC: #1)
  - [x] 1.1 DB-backed: two owners, each with a Trip Project; cross-owner reads of `getOwnedTripProjectSummary`, `listPendingProposalsForTripProject`, `getProposalForOwnerReview`, `listPlanHistoryForTripProject`, `resolveOwnedPrimaryConversation` return `null`/`not_found`/empty WITHOUT leaking whether the other owner's resource exists.
  - [x] 1.2 DB-backed: cross-owner `applyApprovedTripChange`, `dismissTripChangeProposal` return `not_found`, write no plan/history/audit row, and advance no version.
  - [x] 1.3 DB-backed: unauthenticated command paths return unauthenticated/redirect and write nothing (no provider call, no usage event, no persistence).
- [x] Task 2 — AC1: Deleted/unlinked primary-conversation invariant (AC: #1)
  - [x] 2.1 DB-backed: `resolveOwnedPrimaryConversation` never returns a cross-project, cross-owner, deleted, or unlinked conversation; after a primary conversation is deleted, re-resolving selects or creates exactly one same-owner linked live conversation (AD-30).
  - [x] 2.2 DB-backed: deleting a primary conversation requires an owner-scoped replacement or an explicit project-level delete; a live Trip Project never points at a deleted conversation.
- [x] Task 3 — AC1: Invalid item relationships, stale versions, backup references (AC: #1)
  - [x] 3.1 DB-backed + pure-unit: `createInternalTripPlanItem`/`updateInternalTripPlanItem` reject cross-project parent, non-leg parent for an activity, cycles, and backup target outside the same project.
  - [x] 3.2 DB-backed: stale aggregate or item version on every mutating command returns `refresh_required`/equivalent and applies nothing; aggregate version is unchanged.
  - [x] 3.3 DB-backed: `backup` state without a same-project `backupTargetItemId` is rejected; a `backup` referencing a cross-project or missing item is rejected.
- [x] Task 4 — AC1: Ordering-scope uniqueness and conflicts (AC: #1)
  - [x] 4.1 DB-backed: ordinals remain unique within `(trip_project_id, parent_item_id)` after create/reorder/remove; renumber is atomic and a concurrent reorder conflict applies nothing.
  - [x] 4.2 Pure-unit: `validateProposalOperations` rejects reorder/create operations whose `orderingPreconditions` are unrecognized (fail-closed) per the 7.5 P6 fix.
- [x] Task 5 — AC1: Proposal expiry, dismiss, and concurrent applies (AC: #1)
  - [x] 5.1 DB-backed: expired proposal apply returns `expired`, writes no history row, mutates no plan state; expire-on-read drops elapsed proposals from the pending list.
  - [x] 5.2 DB-backed: two concurrent `applyApprovedTripChange` calls for the same proposal — exactly one wins (`applied`), the other returns `not_found` (no second history row, no partial write). Use the real PostgreSQL test database; assert via history-row count and proposal terminal status.
  - [x] 5.3 DB-backed: concurrent apply vs. dismiss and worker vs. read expire are idempotent (first-to-lock wins; second is a no-op success or `not_found`); `FOR UPDATE`/`FOR UPDATE SKIP LOCKED` behavior is exercised, not mocked.
  - [x] 5.4 DB-backed: deleting an owned Trip Project cascades to constraints, plan items, proposals, AND `trip_plan_change_history` rows; only permitted minimal non-content audit metadata remains; no deleted plan state is reconstitutable.
- [x] Task 6 — AC2: Trip Home deterministic focus fixtures (AC: #2)
  - [x] 6.1 Pure-unit: `computeTripHomeFocus` fixtures for expiring proposal (earliest expiry wins), pending proposal without expiry (earliest createdAt wins), confirmed-item gap (transport missing date/time or origin/destination; accommodation missing date/time or place/area), next future planned/confirmed leg (earliest planned time), empty plan / no dated future leg → preparation, and all tie-break rules (earliest expiry → earliest planned time → stable createdAt/id).
  - [x] 6.2 Pure-unit: an open `idea` or incomplete `planned` item is NEVER treated as a gap by itself.
  - [x] 6.3 Pure-unit: focus descriptions/labels never imply weather, route, availability, booking, or other unavailable dynamic data was checked (assert against `trip-home-labels.ts` copy and the focus payload).
- [x] Task 7 — AC3: Workspace accessibility and recovery verification (AC: #3)
  - [x] 7.1 DOM/source-inspection: plan and proposal action controls (apply/dismiss/refresh, plan-history entry) are keyboard-reachable with visible focus and explicit Vietnamese labels; no hover-only actions.
  - [x] 7.2 DOM/source-inspection: mobile touch targets for plan/proposal actions are at least 44px; reduced-motion disables non-essential transitions in the plan-history sheet and proposal reveal.
  - [x] 7.3 DOM/source-inspection: pending/terminal apply/dismiss states announce via polite `aria-live`; terminal focus returns to the originating answer card or Trip Home focus card; only one `aria-modal="true"` dialog is open at a time (plan-history sheet coordinates with answer-detail and workspace sheets).
  - [x] 7.4 DOM/source-inspection: proposal application is an unmistakable owner-confirmed action — `Áp dụng` is explicit, never invoked by sending a chat message or by the stream `done` event; the timeline has no reorder/edit/status controls; refresh (`Làm mới đề xuất`) focuses the composer and does NOT auto-regenerate or call the AI gateway.
  - [x] 7.5 DOM/source-inspection: recovery paths are explicit — `refresh_required`/`expired` outcomes show `Làm mới đề xuất`/`Đã hết hạn` with the action row hidden (P4 invariant preserved); transient errors keep the action row visible for retry (Q3 invariant preserved).
- [x] Task 8 — Verification and status sync (AC: #1, #2, #3)
  - [x] 8.1 Run `pnpm vitest run` for the new and extended suites, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:generate` (no drift, no new migration). Record exact commands and results.
  - [x] 8.2 If the DB environment is unavailable, record the exact command, failure, and blocker; do NOT claim verification passed.
  - [x] 8.3 Update story Dev Agent Record, Completion Notes, File List, Change Log; do not commit unless explicitly instructed.

## Dev Notes

### Product And Authority

- Authority order: `epics.md` (Story 7.6), PRD §8.2/§10.7 (FR-16H, FR-16I) and §9 (NFR-10, NFR-11), `ARCHITECTURE-SPINE.md` (AD-6, AD-13, AD-29, AD-30), UX `EXPERIENCE.md` (Accessibility Floor, Responsive & Platform, Interaction Primitives, Trust/Privacy/Provenance), the 2026-07-25 readiness report, and current code. The compiled `_bmad-output/implementation-artifacts/epic-7-context.md` is NOT authority — it describes a superseded "Traveler Workspace UX" epic and does not match the implemented Trip Planning aggregate or the sprint-status keys (confirmed by Stories 7.1–7.5). Do not use it.
- This is the sixth and final Epic 7 story. Sequence is fixed and all predecessors are `done`: aggregate (7.1), primary conversation (7.2), Trip Home/workspace (7.3), proposals (7.4), terminal proposal actions/history (7.5), safety verification (7.6 — this story).
- FR-16H (owner must explicitly apply before persistent state changes; AI/provider never mutate directly) and FR-16I (owner-visible history with actor/timestamp) are the primary FRs under verification. NFR-10 (all Trip Project reads/mutations owner-scoped) and NFR-11 (apply validates ownership/applicability/authorization before writing an auditable change) are the governing non-functionals. PRD §10.7 is the Trip Planning Foundation Contract.
- Readiness report 2026-07-25 line 143: UX specifies conflict recovery (`Làm mới đề xuất`) but Story 7.6 only requires a safe refresh request. Auto-regeneration is out of scope; verify refresh focuses the composer and does not regenerate.

### Verification Philosophy

- **Test-only story.** Add tests and minimal test-only helpers. Do NOT change production modules unless a test exposes a genuine safety defect. If a defect is found, record it as a finding/blocker in Completion Notes (with the exact failing command and assertion) and consult before any production fix — do not silently expand scope or rewrite modules.
- Reuse the existing Vitest 4.1.10 stack. The global setup (`tests/global-setup.ts`) runs `drizzle-kit migrate` against the real PostgreSQL test database; `tests/helpers/db.ts` exports `testDb`, `resetTestDatabase()`, and `closeTestDatabase()`. Mocked DB CANNOT prove owner-scoping, cascade, `FOR UPDATE`, or concurrent-apply behavior — use the real PostgreSQL test database for AC1 DB-backed tests.
- Prefer extending the existing per-module test files for in-module cases; add ONE new dedicated cross-cutting safety suite for scenarios that span modules/owners (see File Structure). Do not duplicate coverage that already passes — first map existing describe blocks, then fill gaps.

### AC1 Coverage Map (ownership, conflicts, state transitions)

- Owner-scope: every read/write composes `userId` predicates with the composite owner FK convention `(tripProjectId, userId)`. Cross-owner reads return `null` (read) or `{ success: false, reason: "not_found" }` (command) without leaking existence. Verify for: `getOwnedTripProjectSummary`, `listPendingProposalsForTripProject`, `getProposalForOwnerReview`, `listPlanHistoryForTripProject`, `resolveOwnedPrimaryConversation`, `applyApprovedTripChange`, `dismissTripChangeProposal`. (7.5 P16 fixed `listPlanHistoryForTripProject` to return `null` cross-owner — preserve that.)
- Primary conversation (AD-30, 7.2): `resolveOwnedPrimaryConversation`/`resolveOwnedPrimaryConversationInTransaction` (src/features/chat-trips/trip-projects.ts:362,368) must never resolve to a cross-project/cross-owner/deleted/unlinked conversation; the pointer is nullable only during the forward idempotent migration. Deleting a primary conversation requires an owner-scoped replacement or project-level delete. Read the 7-2 story and `trip-projects.ts`/`conversations.ts` for the exact deletion/nulling seam before writing tests.
- Aggregate/item versions (AD-29, 7.1/7.5): every mutating command locks the Trip Project (`lockAggregate`), validates `expectedAggregateVersion` and `expectedItemVersions` before commit, and advances the version exactly once. Stale version → `refresh_required`, apply nothing. The 7.5 apply orchestrator threads the updated aggregate version in-memory op-to-op (P1 fix) and THROWs on any op failure so the whole transaction rolls back (P18 fix) — verify multi-op proposals touching the same item succeed and a mid-proposal failure leaves zero mutations.
- Ordering (AD-29, 7.1/7.5): ordering scope is exactly `(trip_project_id, parent_item_id)`; ordinals unique within scope; commands atomically renumber. `orderingPreconditions` re-validation fails closed on unrecognized keys (7.5 P6 fix).
- Backup references (AD-29, 7.4/7.5): `backup` requires a same-project `backupTargetItemId`; cross-project/missing targets rejected by `validatePlanReferencesRules`. The 7.5 apply orchestrator simulates cross-operation backup cycles (A→backup B, B→backup A) and returns `refresh_required` if a cycle forms (P8 fix). Verify the cycle case and the per-op `validatePlanReferences` guard.
- Proposal terminal actions (AD-30, 7.5): apply is single-transaction all-or-nothing with actor-correct history (`user` actor); dismiss is idempotent; expire uses `system-trip-planning` actor, is idempotent, and never mutates plan state; expire-on-read drops elapsed proposals before Trip Home focus. Apply writes NO history row on failure. Concurrent apply/apply, apply/dismiss, worker/read expire are idempotent via `FOR UPDATE`/`FOR UPDATE SKIP LOCKED` + `status = 'pending'` guard.
- Deletion (AD-13, AD-29, 7.1/7.4): deleting an owned Trip Project cascades to constraints, plan items, proposals, and `trip_plan_change_history` (`ON DELETE CASCADE` on composite owner FK, migration `0063`). Verify the cascade removes history rows and that no deleted plan state is reconstitutable from retained audit metadata.

### AC2 Coverage Map (Trip Home read model)

- `computeTripHomeFocus` (src/features/chat-trips/trip-home.ts:252) is pure. The existing `tests/trip-home.test.ts` covers the priority order; 7.6 must add the full fixture matrix named in AC2: expiring proposal, pending proposal, confirmed-item gap, future leg, empty plan, and ties (earliest expiry → earliest planned time → stable createdAt/id).
- A confirmed-item gap exists ONLY when confirmed `transport` lacks planned date/time OR origin/destination, or confirmed `accommodation` lacks date/time OR place/area; an open `idea` or incomplete `planned` item is NEVER a gap by itself (assert explicitly).
- "Never implies unavailable dynamic data was checked": assert focus labels/payloads (and `trip-home-labels.ts` copy) do not reference weather, route, ETA, availability, booking, provider snapshots, or other PRD §10.7 exclusions. `confirmed` means owner confirmation only.

### AC3 Coverage Map (workspace accessibility)

- Components under test (presentational, data-free): `src/features/ai/trip-proposal-review-card.tsx`, `src/features/ai/trip-workspace-panel.tsx`, `src/features/ai/ai-ask-composer.tsx`. The existing `tests/ai-ask-shell.test.ts` "Story 7.5 proposal terminal actions and plan history shell wiring" block covers button wiring, pending state, terminal focus return, refresh affordance, plan history rendering, no raw model content, and no provider call on read/apply/dismiss. 7.6 adds explicit accessibility assertions on top of that wiring.
- Accessibility floor (EXPERIENCE.md §Accessibility Floor, §Interaction Primitives): keyboard reachability + visible focus for plan/proposal actions; explicit Vietnamese labels (no hover-only actions); `aria-live` polite announcements for pending/terminal states; 44px mobile touch targets; reduced-motion disables non-essential transitions; only one `aria-modal="true"` dialog open at a time (plan-history sheet vs answer-detail dialog vs workspace sheet — 7.3 review fix to preserve).
- Recovery paths: `refresh_required`/`expired` outcomes show `Làm mới đề xuất`/`Đã hết hạn` with the action row hidden (7.5 P4 fix — refresh keeps the refresh-required outcome permanent); transient errors keep the action row visible for retry (7.5 Q3 fix — `transient-error` is non-terminal).
- Owner-confirmed action: `Áp dụng` is explicit, never triggered by sending a chat message or by the stream `done` event; the timeline has no reorder/edit/status controls; `Làm mới đề xuất` focuses the primary conversation composer and does NOT auto-regenerate or call the AI gateway (7.5 decision 5). Proposal cards must never look identical to confirmed timeline items (amber `#D97706` border, suggestion note preserved).

### Existing Implementation To Verify (do not change unless a defect is found)

- `src/features/chat-trips/trip-projects.ts` — `createInternalTripPlanItem`/`*InTransaction`, `updateInternalTripPlanItem`/`*InTransaction`, `deleteInternalTripPlanItem`/`*InTransaction`, `reorderInternalTripPlanItem`/`*InTransaction`, `changeInternalTripPlanItemStateInTransaction`, `upsertInternalTripProjectConstraints`/`*InTransaction`, `lockAggregate`, `advanceAggregate`, `recordAggregateAudit`, `validatePlanReferences`, `normalizePlanItem`, `normalizeConstraints`, `getOwnedTripProjectSummary`, `deleteOwnedTripProject`, `resolveOwnedPrimaryConversation`/`...InTransaction`, `OwnedTripProjectWorkspaceSummary`.
- `src/features/chat-trips/trip-change-proposals.ts` — `validateProposalOperations`, `persistAiTripChangeProposalDraft`, `listPendingProposalsForTripProject` (expire-on-read), `getProposalForOwnerReview` (expire-on-read), `applyApprovedTripChange`, `dismissTripChangeProposal`, `expireTripChangeProposal`, `listPlanHistoryForTripProject`, `formatPlanHistoryRow`, `detectCrossOperationBackupCycle`, `toOwnedSummary`, `deriveAffectedItems`, `deriveBeforeAfter`, `tripPlanningSystemActor`.
- `src/features/chat-trips/plan-references.ts` — `validatePlanReferencesRules` (pure same-project parent/backup/no-cycle rules).
- `src/features/chat-trips/trip-home.ts` — `computeTripHomeFocus`, `findPendingProposalWithExpiry`, `findPendingProposalWithoutExpiry`, `findConfirmedItemGap`, `findNextFutureLeg`, `buildTripWorkspaceReadModelWithConstraints`, `PlanHistoryEntryView`.
- `src/features/chat-trips/trip-home-labels.ts` — `tripPlanItemStateLabels`, `tripChangeProposalLabels` (client-safe; no `server-only`).
- `src/features/chat-trips/trip-proposal-expiry-worker.ts` — `processNextExpiredTripChangeProposal`, `runTripChangeProposalExpiryWorkerLoop`.
- `src/features/chat-trips/conversations.ts` — `getOwnedConversation`, `listOwnedConversations`, `deleteOwnedConversation`.
- `src/features/chat-trips/actions.ts` — `applyTripChangeProposalAction`, `dismissTripChangeProposalAction`, `deleteTripProjectAction`.
- `src/features/ai/trip-proposal-review-card.tsx`, `src/features/ai/trip-workspace-panel.tsx`, `src/features/ai/ai-ask-composer.tsx` — presentational shell + handlers.
- `src/db/schema.ts` — `tripProjects`, `tripProjectConstraints`, `tripPlanItems`, `tripChangeProposals`, `tripPlanChangeHistory`, `auditEvents`. Migrations live in `drizzle/migrations/` (latest `0064` data-only system-actor reservation).

### Database And Concurrency Guardrails

- DB-backed tests run through the existing Vitest global setup that applies all Drizzle migrations. `pnpm lint`/`typecheck`/`build` must NOT require a live database; only the DB-backed test runs do.
- For concurrent-apply tests, use the real PostgreSQL test database and parallel `Promise.all` calls; assert exactly one `applied` history row and one terminal proposal. Do not mock `FOR UPDATE`.
- The `system-trip-planning` reserved user row (migration `0064`) may be truncated by other test files that call `resetTestDatabase()`. Reuse the `ensureSystemTripPlanningActor()` helper pattern from `tests/trip-change-proposals.test.ts` (check-then-insert) in any DB-backed expire/expire-on-read test body that needs it.
- 7.6 adds NO new migration. Confirm `pnpm db:generate` produces no drift (clean exit, no new file).

### Testing Requirements

- DB-backed tests for AC1: real PostgreSQL, multiple owners, cross-owner existence-leakage, deleted/unlinked primary conversation, stale versions, invalid relationships, backup references/cycles, ordering conflicts, proposal expiry, concurrent applies, project-deletion cascade. Mocked DB is insufficient for these.
- Pure-unit tests for AC2: `computeTripHomeFocus` full fixture matrix and tie-breaks; no DB needed.
- DOM/source-inspection tests for AC3: assert accessible names, keyboard reachability, focus management, `aria-live`, 44px targets, reduced-motion handling, single `aria-modal` coordination, explicit owner-confirmed apply, no auto-regeneration, and recovery-path invariants. Prefer source-inspection assertions (consistent with the 7.5 Q3/Q4/Q5 shell tests) where DOM rendering is impractical.
- Reuse the serial flag for shell-suite runs: `pnpm vitest run tests/ai-ask-shell.test.ts --maxWorkers=1 --fileParallelism=false`.
- Relevant commands: `pnpm vitest run tests/trip-planning-safety.test.ts`, `pnpm vitest run tests/trip-change-proposals.test.ts`, `pnpm vitest run tests/trip-projects.test.ts`, `pnpm vitest run tests/trip-home.test.ts`, `pnpm vitest run tests/trip-proposal-expiry-worker.test.ts`, `pnpm vitest run tests/ai-ask-shell.test.ts --maxWorkers=1 --fileParallelism=false`, `pnpm test:run`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:generate`.
- If the database environment is unavailable, record the exact command, failure, and blocker in Completion Notes; do not claim verification passed.
- Preserve old behavior: passing 7.1–7.5 tests must remain green. Do not weaken existing assertions to make new tests pass.

### Previous Story Intelligence

- Story 7.1: `trip_plan_items`/`trip_project_constraints` with composite owner FKs, root/child ordinal unique indexes, deferred self-reference FKs (custom SQL in `0061`), version-fenced internal command boundary. Reuse `lockAggregate`/`advanceAggregate`/`recordAggregateAudit`/`validatePlanReferences` as the seams under test. 7.1 recovery: reject malformed values before transaction/persistence.
- Story 7.2: primary conversation as the exclusive plan-authoring surface; idempotent owner-scoped migration preserves historic linked conversations; project-level fencing governs primary selection/replacement; pointer never references cross-project/cross-owner/deleted/unlinked conversation.
- Story 7.3: pure Trip Home read model; review fixes to preserve — no unchecked casts (use `instanceof`/type-guard filters), label constants in `trip-home-labels.ts` (client-safe), `idPrefix` for duplicate-safe ids, deterministic ICT (UTC+7) date/time display, only one `aria-modal="true"` dialog open at a time.
- Story 7.4: proposal table, typed operation schema, `validateProposalOperations`, `persistAiTripChangeProposalDraft`, presentational review card, `done` StreamEvent payload. AI modules do not import Chat/Trips tables directly; activities may omit `parentItemId`; `orderingPreconditions` plumbed through; reuse `validatePlanReferencesRules` (no inline reimplementation). The deferred cross-operation backup-cycle finding was resolved in 7.5.
- Story 7.5: apply/dismiss/expire terminal commands, expiry worker, plan history, action-button wiring. Critical fixes to verify remain in place — P1 (in-memory version threading op-to-op), P18 (throw on op failure → full rollback, no partial writes), P2 (`safeBeforeAfterSummary` ≤8192 bytes), P3 (expired UI variant), P4 (refresh keeps refresh-required permanent), P5 (worker `FOR UPDATE SKIP LOCKED` inside one `db.transaction`), P6 (ordering-precondition fail-closed on unrecognized keys), P7 (pure unit tests for apply orchestrator), P8 (cross-operation backup-cycle test), P9 (mobile sheet / desktop collapsible plan history), P10/P11 (apply/dismiss re-throw transient DB errors), P12 (expire audit via `recordAuditEvent`), P16 (cross-owner history returns `null`), Q1 (expire-on-read survives transient errors), Q2 (worker loop survives transient batch errors), Q3 (server actions return typed `transient` reason; composer maps to non-terminal `transient-error`), Q4 (`useRef<Set<string>>` synchronous click dedup), Q5 (mobile history-sheet panel receives action callbacks).
- Unresolved action items (Epic 3 chat concurrency, Epic 5 Tavily/pricing/assistant idempotency, Epic 5 family-context scoping) remain open and are NOT resolved by this story.

### Git Intelligence

- Recent commits: `9405cd1 docs(status): mark story 7.5 done`, `3f27942 fix(trip-planning): repair proposal second review findings`, `e40a906 fix(trip-planning): repair proposal apply dismiss expire review findings`, `feeb7e5 feat(trip-planning): apply dismiss and expire proposals safely`, `4f42d69 docs(status): mark story 7.4 done`, `9e8e143 feat(trip-planning): generate reviewable AI trip change proposals`, `a354e1f feat(trip-planning): present trip home and owner plan workspace`, `5123e27 feat(trip-planning): establish primary project conversation`, `5f7e482 docs(status): mark story 7.1 done`.
- Pattern: Chat/Trips-owned modules in `src/features/chat-trips/`, server-only with `@/*` imports, real PostgreSQL tests under `tests/`, no new services/packages, AI modules in `src/features/ai/` delegate persistence to Chat/Trips. Tests follow the `testDb` + `resetTestDatabase` + `ensureSystemTripPlanningActor` harness. Follow the same conventions; this story adds tests only.

### Library And Framework Requirements

- Use the repository-pinned stack: Next.js 15.3.5, React 19.1.0, TypeScript 5.8.3 strict, Drizzle ORM 0.44.5 / Drizzle Kit 0.31.4, PostgreSQL (`@neondatabase/serverless` 1.0.2), pnpm 10.26.2, Vitest 4.1.10, `server-only` 0.0.1. No additional library, test framework, or dependency.
- No `any`, unchecked casts, or generic cross-module table helpers in test code. Use `@/*` imports and explicit types. Test helpers belong in `tests/helpers/` or the new test file; do not add production exports just to support tests.

### File Structure Requirements

**New**

- `tests/trip-planning-safety.test.ts` — cross-cutting adversarial safety suite: multi-owner existence-leakage, deleted/unlinked primary conversation, concurrent applies (apply/apply, apply/dismiss, worker/read), project-deletion cascade to history, and any AC1 scenario that spans modules/owners. DB-backed where locking/cascade must be real.

**Update (additive; do not duplicate existing passing coverage)**

- `tests/trip-home.test.ts` — AC2 full fixture matrix (expiring, pending, gap, future leg, empty, ties) and the "never implies unavailable dynamic data" assertions.
- `tests/trip-projects.test.ts` — AC1 invalid item relationships, stale versions, backup references/cycles, ordering-scope uniqueness/conflicts, primary-conversation invariant.
- `tests/trip-change-proposals.test.ts` — AC1 proposal expiry/concurrent terminal-action idempotency if not already fully covered by the 7.5 suite (fill gaps, do not duplicate).
- `tests/ai-ask-shell.test.ts` — AC3 accessibility/recovery assertions (keyboard, focus, aria-live, 44px, reduced-motion, single aria-modal, explicit owner-confirmed apply, no auto-regeneration, refresh-required/transient recovery invariants).

### Open Decisions Resolved For The Dev

1. **Test-only**: no production code changes unless a test reveals a genuine safety defect; in that case record a finding/blocker and consult before fixing. Do not silently expand scope.
2. **No new migration**: 7.6 writes no schema changes. Confirm `pnpm db:generate` has no drift.
3. **Real PostgreSQL for AC1 DB-backed tests**: mocked DB cannot prove owner-scoping, cascade, `FOR UPDATE`, or concurrent-apply behavior.
4. **Refresh UX scope**: `Làm mới đề xuất` focuses the composer and does NOT auto-regenerate or call the AI gateway (readiness report 2026-07-25 line 143; 7.5 decision 5). Verify this, do not implement regeneration.
5. **epic-7-context.md is superseded**: do not use it as authority; it describes a different (Traveler Workspace UX) epic.
6. **Do not commit** unless explicitly instructed; update the story Dev Agent Record and sprint-status.yaml only.

### Project Structure Notes

- Alignment: tests stay under `tests/`; Chat/Trips-owned modules under `src/features/chat-trips/`; AI presentational components under `src/features/ai/`; migrations under `drizzle/migrations/` (no new file). BMad artifacts stay under `_bmad-output/`.
- No detected conflicts with the existing structure. This story adds verification only; it does not move ownership boundaries or introduce new aggregates.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.6: Verify Owner-Scoped Trip Planning Safety]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7: Controlled Trip Project Planning]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.2 User Authentication, Chats, And Trips] (FR-16H, FR-16I)
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.7 Trip Planning Foundation Contract]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#9 NonFunctional Requirements] (NFR-10, NFR-11)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Mutations Are Server-Side And Audited]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13: Users Delete Their Own Chats And Trip Projects]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29: Trip Planning Is A Chat/Trips-Owned Structured Aggregate]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30: Primary Conversation And Change Proposals Are Explicit Commands]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Trip Planning minimum persisted contract]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Trip Planning deletion rule]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Accessibility Floor]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Responsive & Platform]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Interaction Primitives]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Trust, Privacy, And Provenance]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-25.md#Epic 7: Controlled Trip Project Planning] (line 143 refresh scope)
- [Source: _bmad-output/project-context.md#Technology Stack & Versions]
- [Source: _bmad-output/project-context.md#Testing Rules]
- [Source: _bmad-output/project-context.md#Development Workflow Rules]
- [Source: _bmad-output/implementation-artifacts/7-1-establish-the-versioned-structured-trip-project-aggregate.md]
- [Source: _bmad-output/implementation-artifacts/7-2-establish-the-primary-project-conversation-without-losing-history.md]
- [Source: _bmad-output/implementation-artifacts/7-3-present-trip-home-and-the-owners-plan-workspace.md]
- [Source: _bmad-output/implementation-artifacts/7-4-generate-reviewable-ai-trip-change-proposals.md#Review Findings]
- [Source: _bmad-output/implementation-artifacts/7-5-apply-dismiss-and-expire-proposals-safely.md#Review Findings] (P1–P18)
- [Source: _bmad-output/implementation-artifacts/7-5-apply-dismiss-and-expire-proposals-safely.md#Second Bounded Review Findings] (Q1–Q5)
- [Source: _bmad-output/implementation-artifacts/7-5-apply-dismiss-and-expire-proposals-safely.md#Existing Implementation To Preserve]
- [Source: src/features/chat-trips/trip-projects.ts#resolveOwnedPrimaryConversation]
- [Source: src/features/chat-trips/trip-projects.ts#createInternalTripPlanItem]
- [Source: src/features/chat-trips/trip-projects.ts#lockAggregate]
- [Source: src/features/chat-trips/trip-change-proposals.ts#applyApprovedTripChange]
- [Source: src/features/chat-trips/trip-change-proposals.ts#expireTripChangeProposal]
- [Source: src/features/chat-trips/trip-change-proposals.ts#listPlanHistoryForTripProject]
- [Source: src/features/chat-trips/plan-references.ts#validatePlanReferencesRules]
- [Source: src/features/chat-trips/trip-home.ts#computeTripHomeFocus]
- [Source: src/features/chat-trips/trip-proposal-expiry-worker.ts#processNextExpiredTripChangeProposal]
- [Source: src/features/chat-trips/actions.ts#applyTripChangeProposalAction]
- [Source: src/features/ai/trip-proposal-review-card.tsx]
- [Source: src/features/ai/trip-workspace-panel.tsx]
- [Source: src/features/ai/ai-ask-composer.tsx#AnswerProposalCard]
- [Source: src/db/schema.ts#tripChangeProposals]
- [Source: src/db/schema.ts#tripPlanChangeHistory]
- [Source: tests/helpers/db.ts#testDb]
- [Source: tests/global-setup.ts]

## Dev Agent Record

### Agent Model Used

glm-5.2 (gpu4ai/glm-5.2)

### Debug Log References

- `pnpm vitest run tests/trip-planning-safety.test.ts` — 10 tests pass (new file)
- `pnpm vitest run tests/trip-home.test.ts` — 75 tests pass (18 new AC2 tests)
- `pnpm vitest run tests/ai-ask-shell.test.ts --maxWorkers=1 --fileParallelism=false` — 128 tests pass (12 new AC3 tests)
- `pnpm vitest run tests/trip-projects.test.ts` — 35 tests pass (6 new AC1 tests)
- `pnpm vitest run tests/trip-change-proposals.test.ts` — 70 tests pass (no new tests; existing coverage sufficient)
- `pnpm vitest run tests/trip-proposal-expiry-worker.test.ts` — 5 tests pass (no new tests; existing coverage sufficient)
- `pnpm test:run` — 979 tests pass across 54 files (full suite, no regressions)
- `pnpm lint` — 0 errors, 4 warnings (all pre-existing in knowledge-indexing-worker tests; new code is lint-clean)
- `pnpm typecheck` — clean (tsc --noEmit)
- `pnpm build` — clean (Next.js build succeeds)
- `pnpm db:generate` — "No schema changes, nothing to migrate" (no drift, no new migration)

### Completion Notes List

- Story 7.6 is a test-only verification story. No production code was changed. All verification was achieved by adding new tests and extending existing test files.
- Validation: bmad-create-story validate action was run on the story file. All source references, function exports, line numbers, test files, helper patterns, migration numbers, and library versions were verified accurate. No repairable story-document issues were found. Validation passed on the first run.
- AC1 (owner-scope, conflicts, state transitions): Verified via a new cross-cutting safety suite (`tests/trip-planning-safety.test.ts`) with real PostgreSQL DB-backed tests for multi-owner existence-leakage, cross-owner command rejection, primary-conversation invariant (deleted/unlinked/cross-owner), concurrent apply/apply and apply/dismiss (FOR UPDATE serialization), expired proposal apply, project-deletion cascade to trip_plan_change_history, and ordering-precondition fail-closed (P6). Additional gap tests added to `tests/trip-projects.test.ts` for stale versions on all mutating commands, cross-project parent rejection, backup-state/backup-target DB check enforcement, and ordinal uniqueness after create/remove.
- AC2 (Trip Home deterministic focus): Extended `tests/trip-home.test.ts` with a full fixture matrix (expiring, pending, gap, future leg, empty, ties), the full priority chain, explicit idea/planned-never-gap assertions, and a comprehensive "never implies unavailable dynamic data" assertion block checking all focus kind labels, next-action labels, tripChangeProposalLabels copy, focus reasons, and sortKeys against forbidden terms (weather, route, availability, booking, ETA, provider, snapshot).
- AC3 (workspace accessibility and recovery): Extended `tests/ai-ask-shell.test.ts` with 12 source-inspection and DOM assertions covering keyboard reachability (type="button", focus:ring-4), 44px touch targets (min-h-11), reduced-motion (no JS animations), aria-live polite announcements, terminal focus return (focusOriginAfterTerminal), single aria-modal coordination, explicit owner-confirmed apply (Áp dụng on button, not in stream done), no timeline reorder/edit controls, refresh focuses composer without auto-regeneration, refresh-required/expired recovery (P4 action row hidden), transient-error retry (Q3 action row visible), and amber border + suggestion note distinguishing proposals from confirmed items.
- DB environment was available (DATABASE_URL and DATABASE_URL_TEST set in .env). All DB-backed tests ran against the real PostgreSQL test database.
- No new migration: `pnpm db:generate` produced "No schema changes, nothing to migrate" confirming no drift.
- No production code defects were found. All 7.1–7.5 safety invariants (P1–P18, Q1–Q5) remain verified and green.
- Task 4.2 note: the story mentioned `validateProposalOperations` for ordering-precondition fail-closed, but the actual P6 fix lives in the apply orchestrator's `validateOperationFences` function (not exported). The test was written as a DB-backed apply test with unrecognized orderingPreconditions, which correctly returns `refresh_required` and applies nothing — testing the real behavior rather than the story's imprecise reference.

### File List

- `tests/trip-planning-safety.test.ts` — NEW: cross-cutting adversarial safety suite (10 tests) covering multi-owner existence-leakage, cross-owner commands, primary-conversation invariant, concurrent apply/apply and apply/dismiss, expired proposal apply, project-deletion cascade to history, and ordering-precondition fail-closed.
- `tests/trip-home.test.ts` — UPDATED: added 18 AC2 tests (full fixture matrix, priority chain, idea/planned-never-gap, never-implies-unavailable-dynamic-data assertions).
- `tests/ai-ask-shell.test.ts` — UPDATED: added 12 AC3 accessibility/recovery source-inspection tests and imported `tripChangeProposalLabels`.
- `tests/trip-projects.test.ts` — UPDATED: added 6 AC1 tests (cross-project parent, stale aggregate/item versions on all commands, backup-state DB check enforcement, ordinal uniqueness after create/remove).
- `_bmad-output/implementation-artifacts/7-6-verify-owner-scoped-trip-planning-safety.md` — UPDATED: story record (baseline_commit, status, task checkboxes, Dev Agent Record, Completion Notes, File List, Change Log).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — UPDATED: story 7.6 status synchronized to in-progress then review.

### Change Log

- 2026-07-25: Story 7.6 validation passed (bmad-create-story validate action). No repairable issues found.
- 2026-07-25: Story 7.6 implementation complete. Test-only story: 46 new tests across 4 files (1 new + 3 extended). Full suite: 979 tests pass, lint/typecheck/build/db:generate clean. No production code changed. No new migration. Status set to review.
