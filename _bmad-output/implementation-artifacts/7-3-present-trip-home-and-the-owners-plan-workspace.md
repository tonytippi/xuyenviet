---
baseline_commit: 64a64ab3499bd454fcd5b4315e5dc0cf42cdf10b
---

# Story 7.3: Present Trip Home and the Owner's Plan Workspace

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Trip Project owner,
I want a focused Trip Home and readable plan timeline,
so that I know the most useful next planning action and can inspect my saved plan state.

## Acceptance Criteria

1. **Deterministic Trip Home focus**
   - **Given** a selected owned Trip Project has current plan and (future) proposal state
   - **When** its Trip Home read model is calculated
   - **Then** it selects exactly one focus in this order: pending unexpired proposal with expiry, other pending unexpired proposal, confirmed-item gap, next future planned/confirmed leg, then preparation
   - **And** ties use earliest expiry, earliest planned time, then stable item creation time or ID.

2. **Confirmed-item gap definition**
   - **Given** a confirmed transport item lacks date/time or origin/destination context, or a confirmed accommodation item lacks date/time or place/area
   - **When** Trip Home is calculated
   - **Then** it identifies that item as a confirmed-item gap
   - **And** an `idea` or incomplete `planned` item is never treated as a gap by itself.

3. **Responsive owner workspace**
   - **Given** the owner opens a Trip Project on desktop, tablet, or mobile
   - **When** the workspace renders
   - **Then** it shows the project context, Trip Home focus, structured timeline, and central primary conversation using the existing server-loaded and URL-owned shell model
   - **And** mobile uses accessible sheets/drawers without creating a separate data loader or state owner.

4. **Readable plan-item state labels**
   - **Given** a plan item is displayed in the timeline
   - **When** its state is shown
   - **Then** it includes a semantic icon and visible Vietnamese label for `Ý tưởng`, `Dự kiến`, `Đã chốt`, or `Phương án B`
   - **And** `Đã chốt` is not represented as booking, availability, provider, weather, or live-route confirmation.

## Scope And Boundaries

### In Scope

- Add a Chat/Trips-owned, deterministic Trip Home read model that selects exactly one focus from current structured plan state and an optionally supplied pending-proposal list, following the AD-29 priority and tie-breakers.
- Add a read-only structured plan timeline read model that groups `trip_plan_items` by date/leg with semantic kind/type icons and visible Vietnamese state labels (`Ý tưởng`, `Dự kiến`, `Đã chốt`, `Phương án B`).
- Add a read-only travel-constraints summary projection of `trip_project_constraints` that surfaces only traveler-safe fields (counts, vehicle/EV, driving tolerance, budget range, preference/avoid tags) without sensitive child identity data.
- Extend the existing authenticated `/ai-ask` server shell (`src/app/ai-ask/page.tsx`) to load the Trip Project workspace read model for the selected owned project through Chat/Trips-owned server reads, preserving the URL-owned, server-loaded, single-shell model.
- Render the Trip Project workspace inside the existing `AiAskComposer`: primary conversation remains the desktop center column; a persistent right Trip Workspace panel on desktop shows project context, Trip Home focus card, structured plan timeline, and constraints summary; tablet may collapse the panel to a sheet or rail; mobile renders the workspace as an accessible sheet/drawer. No second data loader or state owner.
- Surface the active Trip Project context (origin/destination/dates/travelers label) in the workspace header and composer context indicator using the existing `formatTripProjectLabel` pattern. `formatTripProjectLabel` renders only `title (origin → destination)` and is shared by sidebar rows, the context indicator, and the `Đang hỏi trong dự án` line; do not modify it to append dates/travelers (that would regress those call sites). The workspace header composes the `formatTripProjectLabel` output with a separate compact subtitle derived from `startDate`/`endDate`/`travelers` (already present on `OwnedTripProjectSummary`); the composer context indicator keeps using `formatTripProjectLabel` unchanged.
- Keep the timeline strictly read-oriented: no plan-item, state, reorder, or constraint editor controls; the primary conversation remains the sole plan-authoring surface and its typed proposals (from Story 7.4) remain the only path to persistent changes.
- Add focused regression coverage: pure Trip Home read-model unit tests covering every priority branch and tie-breaker, plus database-backed shell tests covering workspace rendering, timeline grouping, state labels, responsive sheet behavior, owner isolation, and absence of editor/map controls.

### Explicitly Out Of Scope

- Trip Change Proposal persistence, drafting, apply/dismiss/expiry commands, and plan-change history tables/UI (Stories 7.4 and 7.5). The Trip Home read model must accept an optional typed pending-proposal list so the priority algorithm is complete, but the loader passes an empty list now; Story 7.4 wires real proposals in.
- Any new database table, migration, column, index, or schema change. Story 7.1 already established `trip_plan_items` and `trip_project_constraints`; this story only reads them.
- AI proposal generation, provider calls, prompt changes, retrieval/search changes, or answer-annotation changes. The workspace is a read surface over persisted structured state.
- A manual plan-item/constraint editor, drag-and-drop reorder, inline state toggle, or any control that mutates structured plan state from the workspace.
- Maps, Google Maps, weather, live route/ETA, booking, availability, provider snapshots, current location, budget tracking, checklists, vault, notifications, sharing, collaboration, or location sharing.
- On-trip "today" focus, explicit lifecycle phases, owner phase overrides, or dynamic-data inference (deferred by AD-29).
- A new client state store, `localStorage`/`sessionStorage` workspace cache, breakpoint-specific data loader, or independent history/selection state. Reuse the existing composer URL reconciliation and accessible sheet/focus patterns.
- Refactoring the composer into a separate route or extracting a parallel shell component that owns its own data. The workspace renders inside the existing `AiAskComposer` with server-loaded props.
- Changing `TripProjectInput`, legacy project metadata, `chat_context`, transcript extraction, answer-context behavior, or streaming/provenance persistence.

## Tasks / Subtasks

- [x] Add the Chat/Trips-owned Trip Home read model (AC: 1, 2)
  - [x] Create `src/features/chat-trips/trip-home.ts` (server-only) exporting a pure `computeTripHomeFocus(input)` function and a `TripHomeFocus` result type. Keep it pure/deterministic: same input → same focus, no Date.now side effects, no DB access.
  - [x] Define an input shape that accepts the project's current `trip_plan_items` rows (typed projection: id, kind, anchorRole, type, state, plannedAt, transportOriginLabel, transportDestinationLabel, accommodationPlaceAreaLabel, ordinal, parentItemId, createdAt, id tie-breaker) and an optional `pendingProposals: PendingProposalFocusInput[]` list typed as `{ id, expiresAt?, createdAt, id }`. Story 7.4 will supply proposals; the loader passes `[]` now.
  - [x] Implement the AD-29 priority in order: (1) pending unexpired proposal with expiry (earliest `expiresAt`), (2) other pending unexpired proposal (earliest `createdAt`, then stable id), (3) confirmed-item gap, (4) next future planned/confirmed leg by `plannedAt` ascending, then (5) preparation. Ties within (3) and (4) use earliest `plannedAt`, then stable `createdAt`, then `id`.
  - [x] Implement `findConfirmedItemGap(items)` exactly per AC 2: a `confirmed` item with `type = 'transport'` is a gap when `plannedAt` is null OR `transportOriginLabel` is null OR `transportDestinationLabel` is null; a `confirmed` item with `type = 'accommodation'` is a gap when `plannedAt` is null OR `accommodationPlaceAreaLabel` is null; `idea` and `planned` items are never gaps by themselves; non-confirmed backups are not gaps.
  - [x] Implement `findNextFutureLeg(items, now)` selecting the earliest `plannedAt` strictly after `now` among `planned`/`confirmed` items. Treat `now` as an explicit parameter (server loader passes the request time) so tests are deterministic; do not call `new Date()` inside the pure function.
  - [x] Return a typed `TripHomeFocus` with a `kind` discriminator (`pending-proposal-with-expiry | pending-proposal | confirmed-item-gap | next-leg | preparation`), the stable target id(s), a short Vietnamese reason string, and a deterministic `sortKey`. The workspace UI maps this to the focus card copy.
  - [x] Export a `buildTripWorkspaceReadModel(input)` helper that bundles focus + ordered timeline groups + constraints summary into one serializable projection for the server loader to pass to the client. Keep it pure; the server caller assembles DB rows into the input shape.

- [x] Add the structured plan timeline and constraints summary read projections (AC: 3, 4)
  - [x] In `src/features/chat-trips/trip-home.ts` (or a sibling `trip-workspace-read.ts` if separation is clearer), add `buildTimelineGroups(items)` that groups `trip_plan_items` into date/leg sections in deterministic order: root anchors and legs by `ordinal`, child activities under their parent leg by `ordinal`, and date dividers derived from `plannedAt` where present. Each timeline entry exposes kind, anchorRole/type, state, label, concise time/place context when known, and stable ids — never raw notes beyond a bounded single-line preview and never provider/booking/route data.
  - [x] Add `buildConstraintsSummary(constraintsRow | null)` projecting only traveler-safe fields: adult/child counts, children age/comfort/preference tags (no names/identity/medical), vehicle type, EV charging need, driving tolerance hours, budget currency/min/max VND, preference tags, and avoid-item category/label pairs. Omit any field that is not in the Story 7.1 allowlist; never expose raw JSONB blobs to the client.
  - [x] Export Vietnamese state label constants: `idea → Ý tưởng`, `planned → Dự kiến`, `confirmed → Đã chốt`, `backup → Phương án B`. Export kind/type label constants for timeline semantic labels.

- [x] Extend the Chat/Trips server summary to include the workspace read model (AC: 1, 2, 3)
  - [x] Extend `OwnedTripProjectWorkspaceSummary` in `src/features/chat-trips/trip-projects.ts` with `planItems: TripPlanItemProjection[]`, `constraints: TripConstraintsProjection | null`, and `tripHome: TripHomeFocus`. Keep the existing `primaryConversation` and `historicChats` fields unchanged.
  - [x] In `getOwnedTripProjectSummary(tripProjectId)`, after resolving the primary conversation and project, load the owner-scoped `trip_plan_items` (ordered by `(parentItemId NULLS FIRST, ordinal)`) and the single `trip_project_constraints` row. Reject cross-owner rows by composing `userId` predicates with the existing composite owner FK convention. Do not load another owner's rows or raw provider/provenance material.
  - [x] Assemble the read model inputs and call `computeTripHomeFocus(...)` and `buildTripWorkspaceReadModel(...)` with `now = new Date()` from the server. Pass `pendingProposals: []` until Story 7.4 supplies real proposals. Keep the function server-only (`server-only` import) and return safe non-leaking `null` for missing/unauthorized projects.
  - [x] Do not mutate `aggregateVersion`, `tripProjects`, `conversations`, `tripPlanItems`, or `tripProjectConstraints`. This story only reads; the version fences remain owned by Story 7.1 internal commands and the future Story 7.5 `applyApprovedTripChange(...)`.
  - [x] Preserve the existing deletion, primary-resolution, and historic-chat behavior. Do not change `deleteOwnedTripProject`, `resolveOwnedPrimaryConversationInTransaction`, or historic-chat selection semantics.

- [x] Render the Trip Project workspace inside the existing shell (AC: 3, 4)
  - [x] Extend `AiAskComposerProps` in `src/features/ai/ai-ask-composer.tsx` with an optional `tripWorkspace?: TripWorkspaceReadModel | null` prop (and the selected project already flows through `selectedTripProject`). Pass it from `src/app/ai-ask/page.tsx` only when a project is selected; otherwise pass `null`.
  - [x] On desktop `lg+`, render the persistent right Trip Workspace panel (around 380px, matching the existing detail-panel width token) containing: compact project header that renders the `formatTripProjectLabel` route text (title + origin → destination) plus a separate compact subtitle from `startDate`/`endDate`/`travelers` on the summary — do not modify `formatTripProjectLabel` itself; Trip Home focus card; structured plan timeline; and constraints summary. Keep the central primary conversation column capped near 760px and the left sidebar unchanged.
  - [x] On tablet `md`, the panel may collapse to a rail or move to a sheet; on mobile `< md`, render the workspace as a single accessible sheet/drawer opened from the top bar, following the existing mobile sheet/focus conventions. Exactly one interactive workspace surface is open at a time; inert duplicates are `aria-hidden` and removed from the tab order.
  - [x] Render the Trip Home focus card with: one focus label, a short Vietnamese reason, the next action, and a link/anchor to the affected timeline item (or the proposal review entry point once Story 7.4 exists). For `preparation` focus, show calm copy like `Chuẩn bị cho chuyến đi` and avoid alert-style styling. Use borders and tonal separation, never saturated color, shadow, or animation to pressure the owner.
  - [x] Render the timeline with date dividers and a thin route-teal progression line. Each item shows a semantic icon (kind/type), visible state label chip (`Ý tưởng` / `Dự kiến` / `Đã chốt` / `Phương án B`), and concise time/place context when known. `Đã chốt` must use the confirmed token only and must not show booking/availability/provider/weather/live-route badges.
  - [x] Render the constraints summary as a compact, read-only list. Do not render child names, identity, payment, medical, or exact home-address data; show only the allowlisted Story 7.1 fields. Provide an `aria-live="polite"` region for workspace state changes (focus refresh after navigation).
  - [x] Keep the timeline read-only: no buttons/controls that create, edit, delete, reorder, or change plan-item state. The only actions from the workspace are navigation (select project, open history chat, open mobile sheet) and, in future stories, proposal review. Add a visible Vietnamese hint that plan changes are requested through the primary conversation (e.g., `Yêu cầu thay đổi kế hoạch trong cuộc trò chuyện`).
  - [x] Preserve accessibility: keyboard-reachable workspace controls, visible focus rings, `aria-current` on the active project row (already present), labeled status in addition to color, 44px mobile targets, reduced-motion respect, `Esc` to close the mobile workspace sheet with focus restoration to the opener, and Vietnamese diacritics legible at 200% zoom and common mobile widths.

- [x] Add focused regression coverage (AC: 1, 2, 3, 4)
  - [x] Add `tests/trip-home.test.ts` (or extend `tests/trip-projects.test.ts` if a sibling is materially clearer) with pure unit tests for `computeTripHomeFocus`, `findConfirmedItemGap`, `findNextFutureLeg`, and `buildTimelineGroups` covering: pending proposal with expiry wins; pending proposal without expiry next; confirmed-item gap (transport missing date / origin / destination; accommodation missing date / place); `idea` and incomplete `planned` never gaps; next future leg by `plannedAt`; empty plan → preparation; ties resolved by earliest expiry, earliest planned time, then stable `createdAt`/`id`; deterministic re-run with same `now`. Use typed in-memory proposal inputs to exercise proposal branches without persisting proposal tables.
  - [x] Extend `tests/trip-projects.test.ts` to verify `getOwnedTripProjectSummary` returns the workspace read model (plan items, constraints summary, Trip Home focus) only for the authenticated owner, returns `null` for unauthenticated/other-owner projects, and does not mutate `aggregateVersion` or any row.
  - [x] Extend `tests/ai-ask-shell.test.ts` with real PostgreSQL fixtures (primary conversation, plan items across kinds/states, constraints row) and render assertions for: selected project renders Trip Home focus card, timeline groups with date dividers, semantic icons, Vietnamese state labels, constraints summary, no editor/reorder/delete-state controls, no map/booking/weather UI, mobile sheet markup with `aria-hidden` inert duplicate, and `aria-live` region. Verify a cross-owner project renders no workspace data and no existence leak.
  - [x] Verify the workspace adds no provider call, no AI usage event, no retrieval/search call, and no persistence write. The shell test should confirm the render path only reads.
  - [x] Follow established test setup: `vi.doMock("@/server/auth", ...)`, dynamic module import after `vi.resetModules()`, real PostgreSQL constraints/migrations from global setup, and serial-safe fixtures. Run `pnpm vitest run tests/trip-home.test.ts`, `pnpm vitest run tests/trip-projects.test.ts`, `pnpm vitest run tests/ai-ask-shell.test.ts`, then `pnpm test:run`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm db:generate` (to confirm no schema drift). Record exact blockers rather than claiming verification passed if the database environment is unavailable.

## Dev Notes

### Product And Authority

- The active authority is `epics.md`, the final PRD, `ARCHITECTURE-SPINE.md`, UX `DESIGN.md`/`EXPERIENCE.md`, the 2026-07-25 readiness report, and current code.
- This is the third Epic 7 story. Sequence is fixed: aggregate (7.1), primary conversation (7.2), Trip Home/workspace (7.3), proposals (7.4), terminal proposal actions/history (7.5), safety verification (7.6).
- FR-16F and AD-29 require a deterministic Trip Home read model with the exact priority in AC 1. This is a read surface, not a new aggregate, not a dashboard, and not a map.
- The workspace must not imply AI suggestions equal confirmed state. Pending proposals (Story 7.4) will be visually distinct from confirmed timeline items; this story prepares the Trip Home focus slot and the workspace panel but passes no proposals yet.

### Trip Home Read Model Contract (AD-29)

- Priority, highest first:
  1. Pending unexpired proposal with expiry — earliest `expiresAt`.
  2. Other pending unexpired proposal — earliest `createdAt`, then stable `id`.
  3. Confirmed-item gap — earliest `plannedAt`, treating null `plannedAt` as earliest (first) so the most underspecified gap (no date at all) surfaces ahead of any dated gap, then stable `createdAt`, then `id`. This null-first tiebreak is the chosen resolution of the AD-29 ambiguity; document it in code and tests.
  4. Next future planned/confirmed leg — earliest `plannedAt` strictly after `now`, then stable `createdAt`, then `id`.
  5. Preparation — when no higher focus applies (empty plan, no dated future leg, no gaps, no proposals).
- A confirmed-item gap exists only when a `confirmed` item lacks required context: transport missing `plannedAt`/`transportOriginLabel`/`transportDestinationLabel`, or accommodation missing `plannedAt`/`accommodationPlaceAreaLabel`. An `idea` or incomplete `planned` item is never a gap by itself.
- The read model is pure and deterministic. `now` is an explicit parameter. No `Date.now()`/`new Date()` inside the pure functions; the server loader supplies the timestamp.
- Proposal inputs are typed but optional. Story 7.4 will define the persisted proposal table and the loader wiring; until then the loader passes `[]` and proposal branches are covered by unit tests with in-memory inputs.
- Explicit lifecycle phases, owner phase overrides, and on-trip "today" focus are deferred by AD-29. Trip Home never infers live conditions from unavailable providers (weather, route, ETA, availability).

### Existing Implementation To Preserve

- `src/app/ai-ask/page.tsx` already loads the selected project via `getOwnedTripProjectSummary`, canonicalizes `conversationId`/`tripProjectId`/`historyConversationId`/`ref`/`draft`, and passes `selectedTripProject`, `historyConversation`, and `initialSessions` to `AiAskComposer`. Extend this loader with the workspace read model; do not add a second server entrypoint or route.
- `src/features/chat-trips/trip-projects.ts` owns `getOwnedTripProjectSummary`, `OwnedTripProjectWorkspaceSummary` (currently `{ ...OwnedTripProjectSummary, primaryConversation, historicChats }`), `resolveOwnedPrimaryConversationInTransaction`, and `deleteOwnedTripProject`. Extend the summary type and load call; do not change primary resolution, deletion, or historic-chat behavior.
- `src/features/ai/ai-ask-composer.tsx` is the single shell owner. It already renders the sidebar, center conversation, project context indicator, `Lịch sử trao đổi` history surface, and mobile sheets. Add the right Trip Workspace panel and mobile sheet there; do not introduce `localStorage`, `sessionStorage`, a breakpoint-specific loader, or an independent workspace state store. Reuse its accessible sheet/focus patterns and Vietnamese-first copy.
- `src/components/ui/icons.tsx` is the local typed SVG icon boundary. Add semantic plan-item icons there (kind/type/state) using the existing style; do not introduce a competing feature-local icon system or an icon library dependency.
- `src/db/schema.ts` already defines `tripPlanItems` and `tripProjectConstraints` with all bounds/checks/FKs from Story 7.1. This story only reads them; no schema or migration change.
- `formatTripProjectLabel` in `src/features/chat-trips/labels.ts` remains the canonical project label builder and renders only `title (origin → destination)`. Reuse it unchanged for the composer context indicator and the route portion of the workspace header; the workspace header adds a separate compact dates/travelers subtitle from `startDate`/`endDate`/`travelers` on the summary. Do not modify `formatTripProjectLabel`, or sidebar rows and the context indicator regress.
- Pinned stack: Next.js 15.3.5, React 19.1.0, TypeScript 5.8.3 strict, Drizzle ORM 0.44.5, Drizzle Kit 0.31.4, PostgreSQL, pnpm 10.26.2, Vitest 4.1.10. No new dependency.

### Database And Concurrency Guardrails

- This story performs no mutations. The version fences from Story 7.1 (`aggregateVersion`, item `version`) remain owned by internal Chat/Trips commands and the future Story 7.5 `applyApprovedTripChange(...)`. The workspace read must not advance any version or write any audit event.
- Owner-scoping is mandatory. All `trip_plan_items` and `trip_project_constraints` reads must compose `userId` predicates with the existing composite owner FK convention. A cross-owner project must return `null` (or canonical redirect to `/ai-ask`) without leaking existence, mirroring the established `getOwnedTripProjectSummary` behavior.
- The read model is a transient projection. It must not create a new mutable aggregate, a new persisted table, or a cached client store. The server loader is the only assembler.
- Reading must not block on a live database for ordinary `pnpm lint`/`typecheck`/`build`. DB-backed tests run through the existing Vitest global setup that applies all Drizzle migrations.

### UX And URL Guardrails

- The Trip Project workspace reuses the existing shell: left sidebar, center primary conversation, right Trip Workspace panel on desktop; mobile uses the top bar plus an accessible sheet/drawer. No separate route, no `apps/web` monorepo, no map-first layout.
- Trip Home is one focus card before the timeline, never a dashboard grid of weather/budget/map/booking/checklist widgets (DESIGN.md). Use tonal separation and borders; avoid shadow, animation, or saturated color to pressure the owner.
- The timeline is read-oriented. No reorder/edit/status controls. The primary conversation is the sole plan-authoring surface; plan changes are requested there and applied only via Story 7.5 owner-confirmed proposals.
- `Đã chốt` (confirmed) is owner confirmation only. It must not be represented as booking, availability, provider, weather, or live-route confirmation. No badges implying external validation.
- Preserve Vietnamese-first UX: diacritics, `html lang="vi"`, readable mobile/desktop layouts, accessible names for every control, 44px mobile targets, visible focus, `aria-current` for the active project, labeled status in addition to color, polite live announcements, and reduced-motion support.
- URL selection stays canonical. `tripProjectId`/`conversationId`/`historyConversationId` remain server-loaded and URL-owned. The workspace does not introduce new query params or client-side selection state.
- Do not implement the proposal review card, apply/dismiss actions, or plan history UI here. Story 7.4 owns proposal rendering and the `Xem đề xuất và tác động` entry; Story 7.5 owns apply/dismiss/expiry and history.

### Previous Story Intelligence

- Story 7.1 established `trip_plan_items` and `trip_project_constraints` with composite owner FKs, `NULLS NOT DISTINCT`-equivalent root/child ordinal unique indexes, deferred self-reference FKs, and a version-fenced internal command boundary. Reuse its typed projection shapes and owner-scoping conventions for reads; do not restate or relax its invariants.
- Story 7.1 recovery found that malformed values must be rejected before transaction/persistence. This story performs no persistence, but the read model must still validate input shapes defensively (e.g., ignore unknown kinds/types/states rather than throwing on bad DB rows) so a future schema gap does not crash the workspace.
- Story 7.2 established the primary conversation as the exclusive plan-authoring surface and the `Lịch sử trao đổi` historic-chat access pattern. The workspace must keep the primary conversation in the center column and must not create a competing composer or a parallel project authoring path.
- Story 7.2 established the canonical URL shell for `conversationId`/`tripProjectId`/`historyConversationId`. The workspace adds no new URL params and must respect the existing canonicalization and stale-selection clearing.
- Unresolved action items (Epic 3 chat concurrency, Epic 5 Tavily/pricing/assistant idempotency, Epic 5 family-context scoping) remain open and are not resolved by this story.

### Git Intelligence

- Recent commits: `64a64ab docs(status): mark story 7.2 done`, `5123e27 feat(trip-planning): establish primary project conversation`, `5f7e482 docs(status): mark story 7.1 done`, `a76ce4c fix(trip-planning): defer plan item self references`, `448d134 fix(trip-planning): reject malformed constraints`, `7741622 feat(trip-planning): establish versioned project aggregate`.
- Pattern: Chat/Trips-owned modules in `src/features/chat-trips/`, server-only with `@/*` imports, real PostgreSQL tests under `tests/`, no new services or packages, no UI/route split. Follow the same conventions.
- Composer and page changes in 7.2 were validated with `pnpm vitest run tests/ai-ask-shell.test.ts --maxWorkers=1 --fileParallelism=false` for serial safety; reuse that flag for the shell suite when needed.

### Library And Framework Requirements

- Use the repository-pinned Next.js 15.3.5 App Router, React 19.1.0, TypeScript 5.8.3 strict mode, Drizzle ORM 0.44.5, PostgreSQL, pnpm 10.26.2, and Vitest 4.1.10. No additional library or icon package.
- Use `server-only` on `src/features/chat-trips/trip-home.ts` (and any server-only helper) since it reads owned structured state. Use `@/*` imports under `src/`, explicit types, and safe operational errors. Do not add `any`, unchecked casts, generic cross-module table helpers, or a separate service/package.
- For React, keep the workspace components presentational and data-free: they receive the server-loaded `TripWorkspaceReadModel` as props and do not fetch. Avoid unnecessary `useMemo`/`useCallback`; follow the existing composer simplicity.

### File Structure Requirements

**Update**

- `src/app/ai-ask/page.tsx` — extend the server loader to pass the workspace read model to `AiAskComposer` for the selected project.
- `src/features/chat-trips/trip-projects.ts` — extend `OwnedTripProjectWorkspaceSummary` and `getOwnedTripProjectSummary` to load and return `planItems`, `constraints`, and `tripHome`.
- `src/features/ai/ai-ask-composer.tsx` — add the `tripWorkspace` prop, render the right Trip Workspace panel and mobile sheet, project context header, Trip Home focus card, timeline, and constraints summary; keep the primary conversation as the center column.
- `src/components/ui/icons.tsx` — add semantic plan-item kind/type/state icons matching the existing typed SVG style.
- `tests/trip-projects.test.ts` — workspace summary owner isolation and read-only behavior.
- `tests/ai-ask-shell.test.ts` — workspace rendering, timeline, state labels, responsive sheet, no editor/map controls, no provider call.

**New**

- `src/features/chat-trips/trip-home.ts` — pure Trip Home read model (`computeTripHomeFocus`, `findConfirmedItemGap`, `findNextFutureLeg`), timeline/constraints projections, and `buildTripWorkspaceReadModel`. Server-only import; pure functions accept explicit `now`.
- `tests/trip-home.test.ts` — pure unit tests for the read model covering every priority branch, gap rule, tie-breaker, and deterministic re-run.

Do not create a new generic service, package, client persistence store, plan/proposal/history table, manual plan editor, map integration, or a separate route. Keep all aggregate/read logic in the owning Chat/Trips feature.

### Testing Requirements

- Trip Home read-model tests must be pure unit tests (no DB) so the deterministic priority and tie-breakers are exhaustively covered without migration/global-setup coupling. Use typed in-memory inputs for both items and proposals.
- Workspace summary and shell tests must use the real PostgreSQL test database so owner isolation, composite FKs, and the actual `trip_plan_items`/`trip_project_constraints` schema are exercised. Mocked DB tests cannot prove owner scoping or null-inclusive ordering.
- The test global setup applies all Drizzle migrations; no new migration is added here. Confirm `pnpm db:generate` produces no drift (clean exit, no new migration file).
- Preserve old behavior deliberately: ordinary chats render without a Trip Workspace panel; a selected project with no plan items shows preparation focus; a project with only `idea` items shows preparation focus (not a gap); historic chat review remains read-only; cross-owner projects render no workspace data and no existence leak.
- If the database environment is unavailable, record the exact command, failure, and blocker in the completion notes; do not claim verification passed.
- Relevant commands: `pnpm vitest run tests/trip-home.test.ts`, `pnpm vitest run tests/trip-projects.test.ts`, `pnpm vitest run tests/ai-ask-shell.test.ts`, `pnpm test:run`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm db:generate`.

### Project Structure Notes

- Alignment with the unified project structure: Chat/Trips owns the workspace read model and server summary; the AI feature owns only the presentational shell extension; UI primitives stay under `src/components/ui`; tests stay under `tests/`.
- No detected conflicts with the existing structure. The composer is large (93KB); prefer a focused presentational `TripWorkspacePanel` subcomponent inside `src/features/ai/` (data-free, props-driven) rather than bloating the composer further, while keeping the composer as the single shell owner that mounts it.
- Do not move planning/implementation documents into app folders; BMad artifacts stay under `_bmad-output/`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.3: Present Trip Home and the Owner's Plan Workspace]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7: Controlled Trip Project Planning]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.2 User Authentication, Chats, And Trips]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.7 Trip Planning Foundation Contract]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#MVP Acceptance Criteria]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-5: Feature Ownership Boundaries Are Explicit]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Mutations Are Server-Side And Audited]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13: Users Delete Their Own Chats And Trip Projects]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-29: Trip Planning Is A Chat/Trips-Owned Structured Aggregate]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Trip Planning minimum persisted contract]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Component Catalog]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Interaction Primitives]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md#Trip Project Workspace]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-25.md#Trip Project Traceability]
- [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-07-25.md#UX Alignment Assessment]
- [Source: _bmad-output/project-context.md#Technology Stack & Versions]
- [Source: _bmad-output/project-context.md#Framework-Specific Rules]
- [Source: _bmad-output/project-context.md#Development Workflow Rules]
- [Source: _bmad-output/project-context.md#Critical Don't-Miss Rules]
- [Source: _bmad-output/implementation-artifacts/7-1-establish-the-versioned-structured-trip-project-aggregate.md#Aggregate Contract]
- [Source: _bmad-output/implementation-artifacts/7-1-establish-the-versioned-structured-trip-project-aggregate.md#Plan-Item Location Contract]
- [Source: _bmad-output/implementation-artifacts/7-2-establish-the-primary-project-conversation-without-losing-history.md#Existing Implementation To Preserve]
- [Source: src/db/schema.ts#tripPlanItems]
- [Source: src/db/schema.ts#tripProjectConstraints]
- [Source: src/db/schema.ts#tripProjects]
- [Source: src/features/chat-trips/trip-projects.ts#getOwnedTripProjectSummary]
- [Source: src/features/chat-trips/trip-projects.ts#OwnedTripProjectWorkspaceSummary]
- [Source: src/features/chat-trips/labels.ts#formatTripProjectLabel]
- [Source: src/app/ai-ask/page.tsx#AiAskPage]
- [Source: src/features/ai/ai-ask-composer.tsx#AiAskComposer]
- [Source: src/components/ui/icons.tsx]
- [Source: tests/trip-projects.test.ts#Trip project helpers]
- [Source: tests/ai-ask-shell.test.ts#AI Ask authenticated shell]

## Dev Agent Record

### Agent Model Used

glm-5.2 (gpu4ai/glm-5.2)

### Debug Log References

- Fixed sort comparator operator precedence bug in `buildTimelineGroups`: `a.ordinal - b.ordinal || condition ? -1 : 0` was parsed as `(diff || condition) ? -1 : 0` which reversed ordering for positive ordinal differences. Extracted `compareByOrdinalThenId` helper with explicit conditional logic.
- Split runtime label constants from `trip-home.ts` (server-only) into `trip-home-labels.ts` (client-safe) to resolve Next.js build failure: client component `TripWorkspacePanel` needed to import label constants from the server-only module, which triggered the `server-only` import guard. Types are imported with `import type` (erased at build time) and remain in `trip-home.ts`.

### Completion Notes List

- Implemented the pure, deterministic Trip Home read model in `src/features/chat-trips/trip-home.ts` with `computeTripHomeFocus`, `findConfirmedItemGap`, `findNextFutureLeg`, `findPendingProposalWithExpiry`, `findPendingProposalWithoutExpiry`, `buildTimelineGroups`, `buildConstraintsSummary`, and `buildTripWorkspaceReadModelWithConstraints`. All functions accept explicit `now` and validate input shapes defensively (ignoring unknown kinds/types/states rather than throwing).
- AD-29 priority implemented exactly: pending proposal with expiry → pending proposal → confirmed-item gap → next future leg → preparation. Null `plannedAt` sorts earliest for confirmed-item gaps so the most underspecified gap surfaces first. Tie-breakers use earliest `plannedAt`, then `createdAt`, then stable `id`.
- Extracted client-safe label constants and type definitions to `src/features/chat-trips/trip-home-labels.ts` to keep `trip-home.ts` server-only while allowing the presentational `TripWorkspacePanel` to import labels without triggering the `server-only` build guard.
- Extended `OwnedTripProjectWorkspaceSummary` and `getOwnedTripProjectSummary` in `trip-projects.ts` to load owner-scoped `trip_plan_items` (ordered by `parentItemId NULLS FIRST, ordinal`), the single `trip_project_constraints` row, and compute the Trip Home focus with `now = new Date()`. Passes `pendingProposals: []` until Story 7.4. No mutations to `aggregateVersion`, item versions, or constraints version. Returns `null` for cross-owner projects without leaking existence.
- Added semantic plan-item icons to `src/components/ui/icons.tsx`: TransportIcon, VisitIcon, FoodIcon, RestIcon, AccommodationIcon, AnchorIcon, IdeaIcon, PlannedIcon, ConfirmedIcon, BackupIcon, ClockIcon — all matching the existing typed SVG style.
- Created `src/features/ai/trip-workspace-panel.tsx` as a presentational, data-free component that renders the project header (route text + separate dates/travelers subtitle), Trip Home focus card, structured plan timeline with date dividers and route-teal progression line, and constraints summary with traveler-safe fields only. No localStorage, sessionStorage, fetch, useEffect, or useState.
- Extended `AiAskComposer` with `tripWorkspace` prop, desktop right panel (`lg:block`, ~24rem/384px), mobile workspace sheet with focus trap and Esc-to-close with focus restoration, and `aria-hidden` inert duplicate on the desktop panel when the mobile sheet is open. Extended `TripProjectSummary` type with `startDate`, `endDate`, `travelers` fields. The center conversation column remains capped at `max-w-[760px]`.
- Extended `src/app/ai-ask/page.tsx` to pass `tripWorkspace` (built from `selectedTripProject.planItems`, `selectedTripProject.tripHome`, and `selectedTripProject.constraints` via `buildTimelineGroups`) and the extended `startDate`/`endDate`/`travelers` fields to `AiAskComposer`.
- `formatTripProjectLabel` remains unchanged; the workspace header composes a separate compact subtitle from `startDate`/`endDate`/`travelers`.
- All verification passed: `pnpm vitest run tests/trip-home.test.ts` (45 tests), `pnpm vitest run tests/trip-projects.test.ts` (25 tests), `pnpm vitest run tests/ai-ask-shell.test.ts` (89 tests), `pnpm test:run` (820 tests across 51 files), `pnpm lint` (0 errors, 3 pre-existing warnings), `pnpm typecheck` (clean), `pnpm build` (success), `pnpm db:generate` (no schema drift).

### File List

- `src/features/chat-trips/trip-home.ts` — NEW: pure Trip Home read model, timeline/constraints projections, workspace read model builder (server-only).
- `src/features/chat-trips/trip-home-labels.ts` — NEW: client-safe Vietnamese label constants and focus kind type.
- `src/features/chat-trips/trip-projects.ts` — UPDATED: extended `OwnedTripProjectWorkspaceSummary` and `getOwnedTripProjectSummary` to load plan items, constraints, and compute Trip Home focus.
- `src/features/ai/trip-workspace-panel.tsx` — NEW: presentational Trip Workspace panel component (data-free, props-driven).
- `src/features/ai/ai-ask-composer.tsx` — UPDATED: added `tripWorkspace` prop, `isWorkspaceSheetOpen` state, desktop right panel, mobile workspace sheet with focus trap/Esc, extended `TripProjectSummary` type.
- `src/app/ai-ask/page.tsx` — UPDATED: passes `tripWorkspace` and extended summary fields to `AiAskComposer`.
- `src/components/ui/icons.tsx` — UPDATED: added semantic plan-item kind/type/state icons.
- `tests/trip-home.test.ts` — NEW: 45 pure unit tests covering every priority branch, gap rule, tie-breaker, and deterministic re-run.
- `tests/trip-projects.test.ts` — UPDATED: 5 new tests for workspace summary owner isolation, read-only behavior, preparation focus, cross-owner null, and no audit/version mutation.
- `tests/ai-ask-shell.test.ts` — UPDATED: 9 new tests for workspace rendering, timeline, state labels, constraints, mobile sheet, no editor/map controls, no provider call, aria-live, and presentational panel source checks.

### Change Log

- 2026-07-25: Created the Story 7.3 implementation guide; status synchronized to ready-for-dev.
- 2026-07-25: Re-validation repaired the gap tie-break wording (null `plannedAt` sorts earliest) and clarified `formatTripProjectLabel` non-modification + separate workspace header subtitle; status remains ready-for-dev.
- 2026-07-25: Implemented all tasks and subtasks. Pure Trip Home read model, timeline/constraints projections, server summary extension, presentational workspace panel, composer shell extension, page loader extension, semantic icons, and focused regression coverage. All verification passed (820 tests, lint, typecheck, build, db:generate). Status synchronized to review.
- 2026-07-25: Code review of commit a354e1f completed. 2 medium patch findings, 6 low patch findings, 1 low defer, 3 dismissed. Status synchronized to in-progress.
- 2026-07-25: Fixed all 8 actionable review findings. (1) Desktop workspace aside `aria-hidden` now gated on `isWorkspaceSheetOpen && !isDesktopViewport` so mobile→desktop resize with sheet open no longer leaves a visible desktop panel hidden with no recovery. (2) `findNextFutureLeg` now filters by `kind === "leg"` per AC1/AD-29 so anchors/activities are no longer surfaced as "next leg" focus. (3) Removed dead `lastDivider` variable in `buildTimelineGroups`. (4) `formatTravelersSummary` returns `travelers` only; structured counts remain in the constraints section, eliminating duplicate count rendering. (5) Workspace header now calls shared `formatTripProjectLabel` for the route text instead of manually constructing `origin → destination`. (6) Replaced unchecked cast `document.activeElement as HTMLElement | null` with `instanceof HTMLElement` guard. (7) Replaced unchecked `as string[]` cast after `.filter(Boolean)` in `buildPlaceContext` with a type-guard filter `(p): p is string => Boolean(p)`. (8) `isValidItem` now validates `plannedAt` when non-null (`instanceof Date` and `!Number.isNaN`) so invalid dates cannot corrupt sort comparators or date dividers. Added 4 new regression tests (anchor/activity exclusion from `findNextFutureLeg`, invalid `plannedAt` defensive ignoring in focus and gap detection). Updated the aria-hidden source-level test to match the gated expression. All verification passed: `pnpm vitest run tests/trip-home.test.ts` (49 tests), `pnpm vitest run tests/trip-projects.test.ts` (25 tests), `pnpm vitest run tests/ai-ask-shell.test.ts` (89 tests), `pnpm test:run` (824 tests across 51 files), `pnpm lint` (0 errors, 3 pre-existing warnings), `pnpm typecheck` (clean), `pnpm build` (success), `pnpm db:generate` (no schema drift). Status synchronized to review.
- 2026-07-25: Second bounded code review of commit be629f4 together with initial commit a354e1f. Acceptance Auditor verified all 8 first-review repairs present and correct; all 4 ACs and scope boundaries satisfied; no AC/scope violations. Blind Hunter + Edge Case Hunter surfaced 10 new non-overlapping patch findings (4 Medium, 6 Low) and 4 dismissed. No defer, no decision-needed, no High severity. Findings are local to the new Trip Workspace shell/read model: duplicate timeline `id` across mobile+desktop instances (breaks focus-card anchor on desktop), workspace sheet + answer-detail dialog `aria-modal` conflict, focus restored to `display:none` trigger on mobile→desktop resize, UTC date/time display off-by-one for Vietnam (UTC+7), and six low-severity cleanups (double `buildTimelineGroups` compute, partial gap reason, dead `ClockIcon`, dead `buildTripWorkspaceReadModel`, no-op `formatTravelersSummary`, shared mutable `preparationFocus`). Risk classification: NOT substantial new risk — no High severity, no acceptance-criteria violation, no security/data-integrity issue, no cross-feature failure. Actionable findings remain, so status synchronized to in-progress.
- 2026-07-25: Fixed all 10 actionable second-review findings. (M1) Added `idPrefix` prop to `TripWorkspacePanel`; mobile sheet passes `"sheet-"`, desktop aside passes `"desktop-"`, so timeline `<li>` ids and focus-card anchor `href`s are unique per instance and the anchor resolves to the visible desktop element. (M2) Workspace "Kế hoạch" button onClick now clears `selectedAnswerEntity` and `answerEntityTriggerRef` (matching the session-sheet pattern); added `&& !isWorkspaceSheetOpen` to the answer-detail dialog render condition and `|| isWorkspaceSheetOpen` to the answer-detail Esc guard so only one `aria-modal="true"` dialog is open at a time. (M3) Workspace sheet focus-restore cleanup now checks `offsetParent !== null` before focusing the previous trigger, so focus is not sent to a `display:none` element on mobile→desktop resize. (M4) `formatDateDivider` and `formatTimeContext` now convert to Vietnam time (ICT, UTC+7) via a deterministic `toIctParts` helper (shift +7h, read UTC parts) so a 20:00 UTC leg lands on the correct day divider and shows `giờ Việt Nam` instead of `UTC`; determinism preserved since input `plannedAt` is explicit. (L5) Added `timelineGroups: TimelineGroup[]` to `OwnedTripProjectWorkspaceSummary`, returned `workspaceReadModel.timelineGroups` from the summary, and consumed it directly in `page.tsx` (removed the `buildTimelineGroups` import and second compute). (L6) `formatReasonForGap` now builds the reason from all missing field names dynamically via `joinVietnameseList`, so a transport missing both origin and destination mentions both in one message. (L7) Removed dead `ClockIcon` export from `icons.tsx`. (L8) Removed dead `buildTripWorkspaceReadModel` (no constraints) export from `trip-home.ts`; only `buildTripWorkspaceReadModelWithConstraints` is used. (L9) Removed no-op `formatTravelersSummary` identity wrapper; inlined `header.travelers` at the call site. (L10) `computeTripHomeFocus` now returns `{ ...preparationFocus }` so a mutating caller cannot corrupt the shared module-level constant. Added 5 new regression tests (ICT date divider off-by-one, ICT time context label, gap reason mentions all missing fields, gap reason all-three-missing, preparation focus mutation isolation). Updated the source-level Esc-guard test assertion to match the new `isWorkspaceSheetOpen` guard. All verification passed: `pnpm vitest run tests/trip-home.test.ts` (54 tests), `pnpm vitest run tests/trip-projects.test.ts` (25 tests), `pnpm vitest run tests/ai-ask-shell.test.ts` (89 tests), `pnpm test:run` (829 tests across 51 files), `pnpm lint` (0 errors, 3 pre-existing warnings), `pnpm typecheck` (clean), `pnpm build` (success), `pnpm db:generate` (no schema drift). Status synchronized to review.

- 2026-07-25: Status-only finalization. Verified supplied final repair commit 267a12264793c3b71eca6fe56531908e502801fe exists and the pre-update worktree was clean. No code inspection, review, tests, or commit performed. Status synchronized from review to done; sprint-status.yaml updated to mark 7-3 done.

### Review Findings

- [x] [Review][Patch] Desktop workspace aside `aria-hidden` not gated on `!isDesktopViewport` [src/features/ai/ai-ask-composer.tsx:1789] — Medium. When the mobile workspace sheet is open and the viewport resizes to desktop, `isWorkspaceSheetOpen` stays true, the Escape effect early-returns on `isDesktopViewport`, and the visible desktop aside gets `aria-hidden="true"` with no recovery path. Fix: `aria-hidden={isWorkspaceSheetOpen && !isDesktopViewport ? "true" : undefined}`.
- [x] [Review][Patch] `findNextFutureLeg` does not filter by `kind === "leg"` [src/features/chat-trips/trip-home.ts:176-180] — Medium. AC1 and AD-29 say "next future planned/confirmed leg"; the implementation selects among all planned/confirmed items including anchors and activities. An anchor or activity with future `plannedAt` is surfaced as focus with label "Chặng tiếp theo" (next leg), which is semantically wrong. Fix: add `item.kind === "leg"` to the filter.
- [x] [Review][Patch] Dead `lastDivider` variable in `buildTimelineGroups` [src/features/chat-trips/trip-home.ts:365,370-372] — Low. `lastDivider` is written but never read; remove the dead variable or implement same-date group merging.
- [x] [Review][Patch] `formatTravelersSummary` duplicates traveler counts [src/features/ai/trip-workspace-panel.tsx:49-62] — Low. Combines structured constraints counts with free-text `travelers` string in the header subtitle; when they overlap the counts render twice. Spec says the subtitle derives from `startDate`/`endDate`/`travelers` only; structured counts belong in the constraints section. Fix: return `travelers` only, do not concatenate structured counts.
- [x] [Review][Patch] Workspace header does not use `formatTripProjectLabel` [src/features/ai/trip-workspace-panel.tsx:73,89-90] — Low. Manually constructs `origin → destination` instead of calling the shared `formatTripProjectLabel` builder as required by the spec. Fix: call `formatTripProjectLabel` for the route text.
- [x] [Review][Patch] Unchecked cast `document.activeElement as HTMLElement | null` [src/features/ai/ai-ask-composer.tsx:862] — Low. Violates project "no unchecked casts" rule. Fix: use `document.activeElement instanceof HTMLElement ? document.activeElement : null`.
- [x] [Review][Patch] Unchecked cast `as string[]` after `.filter(Boolean)` in `buildPlaceContext` [src/features/chat-trips/trip-home.ts:306] — Low. `.filter(Boolean)` does not narrow in TypeScript; the `as string[]` cast violates the "no unchecked casts" rule. Fix: use a type-guard filter `(p): p is string => Boolean(p)`.
- [x] [Review][Patch] `isValidItem` does not validate `plannedAt` [src/features/chat-trips/trip-home.ts:86-87] — Low. `createdAt` is validated for valid Date but `plannedAt` is not; an invalid Date (NaN) corrupts sort comparators and date dividers. Fix: if `plannedAt` is not null, check `instanceof Date` and `!Number.isNaN(plannedAt.getTime())`.
- [x] [Review][Defer] No explicit reduced-motion handling on workspace buttons [src/features/ai/ai-ask-composer.tsx:1479] — deferred, pre-existing. The codebase has zero `motion-reduce` utilities anywhere; this is a project-wide pattern gap, not a Story 7.3-specific regression. The focus card correctly avoids animation.

### Second Bounded Review Findings (commit be629f4 + initial a354e1f, 2026-07-25)

Review layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor. Acceptance Auditor verified all 8 first-review repairs present and correct; all 4 ACs and scope boundaries satisfied. This second pass surfaced the following new, non-overlapping findings.

- [x] [Review][Patch] Duplicate `id` on timeline `<li>` across mobile sheet and desktop aside; focus-card anchor `#plan-item-X` resolves to the hidden mobile instance on desktop and breaks navigation [src/features/ai/trip-workspace-panel.tsx:117, src/features/ai/ai-ask-composer.tsx:1759,1790] — Medium. Both panel instances render `id={`plan-item-${entry.id}`}`; both stay in the DOM (one is `display:none` per breakpoint). HTML ids must be unique; the anchor jumps to the first DOM match (the hidden mobile sheet) on desktop. Fix: pass an `idPrefix` prop (e.g., `"sheet-"` / `"desktop-"`) into `TripWorkspacePanel` and use it in both the `id` and the anchor `href`, or suppress the `id` on the non-visible instance.
- [x] [Review][Patch] Workspace sheet opens without clearing `selectedAnswerEntity`; two simultaneous `aria-modal="true"` dialogs, competing focus traps, and Esc closes both [src/features/ai/ai-ask-composer.tsx:1474,1728,707] — Medium. The "Kế hoạch" button onClick sets `setSessionSheetOpen(false); setWorkspaceSheetOpen(true)` but does not clear the answer detail entity. The answer detail dialog condition and its Esc handler check `!isSessionSheetOpen` but not `!isWorkspaceSheetOpen`. Fix: in the workspace button onClick add `setSelectedAnswerEntity(null); answerEntityTriggerRef.current = null;` (matching the session-sheet button pattern), and/or add `&& !isWorkspaceSheetOpen` to the answer detail condition and Esc guard.
- [x] [Review][Patch] Focus restored to `display:none` "Kế hoạch" trigger on mobile→desktop resize while workspace sheet is open [src/features/ai/ai-ask-composer.tsx:906,1452] — Medium. The workspace sheet effect cleanup focuses `workspaceSheetPreviousFocusRef`, which is the "Kế hoạch" button inside an `lg:hidden` container; on desktop it is `display:none`, so focus is sent to a hidden element. Fix: guard the restore with an `offsetParent !== null` check, or reset `isWorkspaceSheetOpen` to `false` via an effect when `isDesktopViewport` becomes true.
- [x] [Review][Patch] Time and date dividers displayed in UTC without ICT conversion; date divider can be off-by-one for Vietnam (UTC+7) [src/features/chat-trips/trip-home.ts:294-306] — Medium. `formatDateDivider` uses `getUTCFullYear/Month/Date` and `formatTimeContext` returns `HH:MM UTC`. A leg at `20:00 UTC` shows under the previous day's divider and a meaningless UTC time to a Vietnamese-first user. Determinism is preserved by the explicit `now`/`plannedAt` inputs; only the display formatting needs to convert to ICT (UTC+7) or otherwise label local time. Fix: format divider and time in Asia/Ho_Chi_Minh (UTC+7), or document the UTC choice in the UI label.
- [x] [Review][Patch] `buildTimelineGroups` computed twice on each load with a selected project [src/features/chat-trips/trip-projects.ts:230,237-238, src/app/ai-ask/page.tsx:140] — Low. `buildTripWorkspaceReadModelWithConstraints` already builds `timelineGroups` but the summary discards it (returns only `planItems`, `constraints`, `tripHome`); `page.tsx` then recomputes `buildTimelineGroups(selectedTripProject.planItems)`. Fix: add `timelineGroups: TimelineGroup[]` to `OwnedTripProjectWorkspaceSummary`, return `workspaceReadModel.timelineGroups`, and consume it directly in `page.tsx`.
- [x] [Review][Patch] `formatReasonForGap` mentions only the first missing field when a confirmed transport lacks several [src/features/chat-trips/trip-home.ts:199-205] — Low. If `plannedAt` is present but both origin and destination are null, the reason returns after mentioning only "điểm đi", forcing multiple fix-refresh cycles. Fix: build the reason from all missing field names dynamically rather than returning on the first.
- [x] [Review][Patch] `ClockIcon` is dead code [src/components/ui/icons.tsx:122] — Low. Exported but not imported anywhere in `src/` or `tests/`. Fix: remove the export or wire it into the time-context line.
- [x] [Review][Patch] `buildTripWorkspaceReadModel` (without constraints) is dead code [src/features/chat-trips/trip-home.ts:509] — Low. Only `buildTripWorkspaceReadModelWithConstraints` is called. Fix: remove the unused export or add a test exercising it.
- [x] [Review][Patch] `formatTravelersSummary` is a no-op identity wrapper [src/features/ai/trip-workspace-panel.tsx:50-52] — Low. `return travelers ?? null` on a `string | null` input changes nothing. Fix: inline `header.travelers` at the call site and delete the function.
- [x] [Review][Patch] `preparationFocus` shared mutable object returned by reference [src/features/chat-trips/trip-home.ts:65-69,267] — Low. `computeTripHomeFocus` returns the module-level constant directly; every other branch returns a fresh literal. A mutating caller would corrupt all subsequent calls. Fix: return `{ ...preparationFocus }` or `Object.freeze(preparationFocus)`.

Dismissed as noise (not recorded as action items):
- Inconsistent 3-space/2-space indentation at `trip-home.ts:267-268` — cosmetic; `pnpm lint` passes and Prettier is not enforced project-wide.
- `findConfirmedItemGap` not filtering by `kind === "leg"` — by design; AC2 defines gaps by `state === "confirmed"` plus type/context absence, with no leg restriction. A confirmed transport activity is still a "chuyến xe" and the reason wording is correct.
- Orphan children silently dropped when a parent fails `isValidItem` — only reachable via DB-level corruption that bypasses schema checks (`ordinal >= 0` and `createdAt` are DB-enforced); practically unreachable.
- `now` not NaN-guarded in `computeTripHomeFocus` — unreachable in production; the server loader always passes `new Date()`. Defensive-scheme consistency only.
