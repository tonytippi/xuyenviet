---
baseline_commit: e0173d0
---

# Story 16.2: Preserve Explicit Trip Scope in the Planning Shell

Status: ready-for-dev

## Story

As a traveler,
I want the planning shell to show when I am working on a named trip and let the established navigation change that trip,
so that I understand when a saved plan affects my question without learning internal context terminology or managing extra composer controls.

## Acceptance Criteria

1. **Visible traveler-language trip context**
   - **Given** the URL-selected shell is scoped to an owned Trip Project
   - **When** its header and composer render on desktop, tablet, or mobile
   - **Then** they visibly identify the project in traveler language, for example `Đang lên kế hoạch cho: Hè miền Trung`
   - **And** unscoped chat renders no technical scope/context label.

2. **Explicit unscoped chat**
   - **Given** a traveler uses the existing `Hỏi XuyenViet` action from a project-scoped workspace
   - **When** the new-chat route is selected
   - **Then** it starts an unscoped ordinary conversation without silently carrying project constraints forward
   - **And** the composer does not gain persistent scope-action buttons.

3. **Validated primary-conversation switching**
   - **Given** a traveler selects an owned Trip Project from the existing sidebar or accepts a typed continue-in-trip recommendation
   - **When** Chat/Trips validates the selection
   - **Then** the URL scope changes only to that project's existing primary conversation
   - **And** the ordinary conversation is not copied, merged, linked, or replayed into the Trip Project.

4. **Pending selection and canonical reconciliation**
   - **Given** a scope selection is in flight
   - **When** the browser updates the workspace
   - **Then** it may show a pending state only
   - **And** URL-selected server shell data becomes canonical only after owner and primary-conversation validation succeeds.

5. **Safe stale-resource recovery**
   - **Given** the selected project or primary conversation is stale, deleted, unlinked, or unauthorized
   - **When** the server resolves the route or command
   - **Then** the client clears invalid local selection, reconciles to the safe server shell, and returns focus to the originating control or composer as appropriate
   - **And** it presents a practical Vietnamese recovery message without leaking resource existence or technical details.

## Tasks / Subtasks

- [ ] Extend the owner-scoped sidebar shell projection (AC: 3-5)
  - [ ] Define a bounded shared Trip Project sidebar-list response/parser in `packages/contracts/src/index.ts`; include only the existing safe summary fields needed for a row and its canonical primary-conversation destination.
  - [ ] Add a named Chat/Trips read-repository port in `packages/domain/src/index.ts`; authenticated `userId` is supplied by Nest, never by browser input.
  - [ ] Implement the PostgreSQL owner-filtered list in `packages/database/src/index.ts`. Select only projects that currently have an owned, linked primary conversation; use stable ordering and never return another owner's project, a stale primary pointer, or raw planning constraints.
  - [ ] Expose and document the protected direct Nest read route in `apps/api/src/conversations/conversations.controller.ts`, `apps/api/src/app.module.ts`, and `apps/api/src/openapi.controller.ts`. Reuse the existing principal/session/origin boundary and safe error envelope.
  - [ ] Add a strict relative-cookie browser wrapper in `apps/web/src/features/ai/direct-api-client.ts`; do not create a Next route handler, server action, browser database access, or local persistence.

- [ ] Load one server-owned shell model across breakpoints (AC: 1, 3-5)
  - [ ] Update `apps/web/src/features/chat-trips/direct-shell-loader.tsx` to load conversation summaries and owned project summaries alongside the current shell, then pass them to `AiAskComposer` as initial server data.
  - [ ] Preserve `apps/web/src/app/ai-ask/page.tsx` as the single URL parser for `conversationId`, `tripProjectId`, and `historyConversationId`; continue rejecting multi-valued query parameters.
  - [ ] Keep the existing selected-project shell rule: the database resolves `tripProjectId` to its persisted primary conversation and ignores a competing browser `conversationId`.
  - [ ] Do not add a mobile-specific loader, selection store, local-storage state, or a second scope owner. Desktop sidebar, tablet rail, and mobile sheet present the same data and URL-selected server shell.

- [ ] Make active trip scope understandable without composer scope controls (AC: 1-2)
  - [ ] In `apps/web/src/features/ai/ai-ask-composer.tsx`, replace technical project labels such as `Dự án:` and `Ngữ cảnh kế hoạch...` with the bounded traveler label `Đang lên kế hoạch cho: {title}` in the main header and adjacent composer context.
  - [ ] Render no corresponding label for ordinary unscoped chat. Sidebar active state alone is insufficient; the main shell must disclose a selected trip.
  - [ ] Remove the persistent `Quản lý chuyến đi`/project-select scope-control block. Do not replace it with another persistent composer action bar, dropdown, or leave/switch button.
  - [ ] Keep existing project deletion/create controls only if their present behavior remains reachable through appropriate sidebar/sheet navigation; do not expand manual project-management UX in this story.
  - [ ] Rename the established new-chat action and accessible labels from `Trò chuyện mới` to `Hỏi XuyenViet` where it represents the unscoped entry action.

- [ ] Implement explicit unscoped navigation and validated switching (AC: 2-4)
  - [ ] Change `handleNewChat()` so it clears the transient draft/message selection as needed and navigates to `/ai-ask` with neither `conversationId` nor `tripProjectId`, including when called from a selected Trip Project. Never submit an AI turn with project constraints after this action.
  - [ ] Make sidebar/sheet Trip Project rows use their server-projected canonical `{ tripProjectId, conversationId }` destination. Do not build authority from a selected ID alone or infer a primary conversation on the client.
  - [ ] Wire Story 16.1 typed recommendation actions using `loadTripRecommendations`, `continueDirectInTrip`, `chooseDirectPrivateTripRecommendation`, `declineDirectTripCreationRecommendation`, and `acceptDirectTripCreationRecommendation` only. Render controls only from the typed response, never assistant prose, annotations, local storage, or parsed answer text.
  - [ ] Navigate after `continueDirectInTrip(...)` and accepted creation only from the returned canonical destination. Keep private-answer selection on the current unscoped URL; it must not load or persist selected-project constraints or link conversations.
  - [ ] During an action, disable duplicate scope choices and expose only a concise pending status. After terminal success or failure, reconcile with router navigation/refresh so the server shell is authoritative.

- [ ] Preserve recovery and accessible focus behavior (AC: 4-5)
  - [ ] On a null/stale shell or failed validated selection, clear pending local selection, reconcile to `/ai-ask`, and show generic practical Vietnamese recovery copy. Foreign, missing, deleted, and unlinked resources must be indistinguishable to travelers.
  - [ ] Preserve existing mobile sheet focus trapping and `Escape` close behavior. Selecting a conversation/project from the mobile sheet must close it and focus the main chat heading or composer rather than restoring focus to a now-stale row.
  - [ ] Ensure sidebar/sheet rows expose `aria-current` for active route state, remain keyboard and touch reachable, retain visible focus, and meet the existing 44px mobile target floor.
  - [ ] Use the established polite `aria-live` status mechanism for selection pending/recovery updates; do not expose route IDs, API codes, request IDs, state discriminators, source/provenance, retrieval, audit, provider, or diagnostic terms.
  - [ ] Preserve historical linked conversation behavior: it remains read-only and returns to the primary conversation. It must never become a parallel project composer.

- [ ] Add focused regression coverage (AC: 1-5)
  - [ ] Add pure contract/client tests for strict project-list parsing, relative cookie-authenticated reads, and canonical destination use. Preserve accepted-creation-only `Idempotency-Key` behavior.
  - [ ] Add serial PostgreSQL/Nest integration coverage for authenticated owner-scoped project lists, foreign-project non-disclosure, primary-conversation validity, and safe stale/unlinked routing. Each clean-table suite calls `resetTestDatabase()` locally.
  - [ ] Add focused shell/navigation coverage for `Hỏi XuyenViet` clearing both URL scope values, no project-constraint carryover, typed continue destination navigation, private-answer URL preservation, pending selection, and stale recovery/focus intent.
  - [ ] Include source-level or existing-compatible UI assertions for no persistent composer project selector, selected-trip traveler-language labels, absent unscoped technical label, shared desktop/mobile data flow, keyboard active state, and mobile selection focus transfer. Do not introduce a broad new UI test framework solely for this story.
  - [ ] Run focused unit tests, serial integration tests, `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact environment blockers rather than claiming unrun verification.

## Dev Notes

### Scope and Product Intent

This is the navigation and shell slice after Story 16.1. It consumes, but does not recreate, the typed owner-bound recommendation decisions and canonical continuation destinations from Story 16.1. Its outcome is deliberately narrow: a traveler can see when a Trip Project applies, leave it through `Hỏi XuyenViet`, or choose another owned Trip Project through established navigation.

The browser has no authority to decide trip matching, material context changes, primary conversations, or resource ownership. A pending client selection is allowed; durable URL scope becomes canonical only after the server validates it.

### Architecture Compliance

- **One server-loaded URL shell.** `apps/web/src/app/ai-ask/page.tsx` parses scope; `DirectShellLoader` loads direct API data; `AiAskComposer` owns transient workspace state only. Do not introduce another loader or persistence owner at a breakpoint. [Source: `ARCHITECTURE-SPINE.md#AD-24`]
- **Chat/Trips owns sidebar reads.** Conversation/project lists must be authenticated, owner-scoped server projections. No browser ownership filtering, project scraping from messages, or arbitrary client `primaryConversationId` construction. [Source: `ARCHITECTURE-SPINE.md#AD-21`]
- **Primary conversation is an invariant.** A project route resolves to its existing same-owner primary conversation. The current shell already returns null when its primary pointer is invalid; preserve this fail-closed behavior. Do not copy, merge, link, or replay an ordinary conversation into a project. [Source: `packages/database/src/index.ts#createPostgresTravelerShellRepository`; `ARCHITECTURE-SPINE.md#AD-30`, `#AD-30A`]
- **Story 16.1 is the recommendation authority.** Use typed decisions and `continueInTrip(...)`; never derive a recommendation control or route from assistant prose, annotations, browser state, or local storage. Private selection remains a data boundary: no project constraints loaded/persisted and no URL change. [Source: `ARCHITECTURE-SPINE.md#AD-30A`; `_bmad-output/implementation-artifacts/16-1-recommend-and-save-trip-projects-through-typed-owner-decisions.md#Architecture Compliance`]
- **Direct API only.** Contracts in `packages/contracts`, ports/policy in `packages/domain`, PostgreSQL in `packages/database`, Nest transport in `apps/api`, and browser client in `apps/web`. Keep relative credentialed calls, CSRF for mutations, strict parsers, safe errors, and OpenAPI documentation. No Auth.js, BFF, Next domain writer, server action, or database import in the browser. [Source: `_bmad-output/project-context.md#Framework-Specific Rules`; `ARCHITECTURE-SPINE.md#AD-33`]
- **Plain Vietnamese projection.** Render only practical situation/recovery copy. Never render internal scope/state discriminators, raw errors, IDs, provenance/retrieval taxonomy, audit terms, provider/model details, or diagnostics. [Source: `ARCHITECTURE-SPINE.md#AD-30B`; PRD `#FR-46A`]

### Existing Code to Extend

| File | Current responsibility | Story 16.2 change / preservation |
|---|---|---|
| `apps/web/src/app/ai-ask/page.tsx` | Canonical query parsing and direct shell entry. | Preserve as the only URL selection parser; do not add parallel parameters/state. |
| `apps/web/src/features/chat-trips/direct-shell-loader.tsx` | Loads direct traveler shell, summaries, details, and planning context. | Load owner-scoped project summaries with existing shell data and pass them into the one composer. |
| `apps/web/src/features/ai/ai-ask-composer.tsx` | URL reconciliation, sidebar/sheet, composer, transient shell state, and focus management. | Add traveler trip labels and typed recommendation integration; make new chat unscoped; replace direct project-ID navigation with canonical destinations; remove persistent composer scope selector. |
| `apps/web/src/features/ai/direct-api-client.ts` | Strict cookie-authenticated browser reads/commands and byte-sensitive NDJSON streaming. | Add project-list read wrapper and consume existing recommendation wrappers; do not alter NDJSON handling or global idempotency behavior. |
| `packages/contracts/src/index.ts` | Shared parsed API response contracts. | Add a bounded project-sidebar projection/parser only; preserve existing `TravelerShellResponse` and recommendation contracts unless an additive shell contract is demonstrably smaller. |
| `packages/domain/src/index.ts` | Owner-scoped read interfaces and traveler command port. | Add a narrow project-sidebar read port; keep authentication/persistence out of it. |
| `packages/database/src/index.ts` | PostgreSQL shell and command ownership. | Implement only owner-filtered list/canonical-destination projection; retain selected shell primary-validation and deletion semantics. |
| `apps/api/src/conversations/conversations.controller.ts` | Principal-bound direct traveler reads. | Add protected project-list route through a named repository, with strict route/result contract and no command ownership. |
| `apps/api/src/app.module.ts` and `apps/api/src/openapi.controller.ts` | Production DI and documented API surface. | Wire/document the new read capability. |

### UX and Accessibility Guardrails

- Use `Hỏi XuyenViet` as the explicit ordinary-chat entry. Do not force a chat/project mode choice before asking. [Source: `EXPERIENCE.md#Sidebar hierarchy`]
- A selected project shows `Đang lên kế hoạch cho: {title}` in the main chat header/composer. An ordinary chat has no technical label. Sidebar-only indication is insufficient. [Source: `EXPERIENCE.md#Trip context indicator`; `_bmad-output/planning-artifacts/epics.md#Story 16.2`]
- The sidebar/sheet project list is the project-switch surface. The composer can show active context but must not contain persistent leave/switch controls. [Source: `EXPERIENCE.md#Chat composer`; `#Trip context indicator`]
- Mobile uses the existing full-height navigation sheet, closes it after selection, and moves focus to the main heading/composer. Do not create nested modal stacks. [Source: `EXPERIENCE.md#Interaction Primitives`; `#Responsive navigation`]
- Retain visible focus, keyboard traversal, `aria-current`, `Escape` behavior, polite status announcements, 44px mobile targets, and reduced-motion classes already established in the shell. [Source: `EXPERIENCE.md#Accessibility Floor`; `_bmad-output/project-context.md#Code Quality & Style Rules`]

### Explicitly Out of Scope

- Story 16.1 recommendation policy, context revision/fingerprint, decision persistence, decline fences, accepted-creation transaction, matching, and idempotency implementation.
- Story 16.3 answer hierarchy, source/provenance disclosure presentation, broad recovery-copy system, feedback placement/persistence changes, and broad accessibility polish.
- Story 16.4 final cross-epic UI/accessibility verification matrix.
- Maps, booking, route/traffic/weather/availability claims, budget tracking, checklists, collaboration, new dependencies, new services, or a new state-management/UI-test framework.

### Testing Requirements

- Use `pnpm test:unit` only for infrastructure-free parsers/client/navigation helpers. Unit tests must not need `DATABASE_URL`, `DATABASE_URL_TEST`, migrations, or PostgreSQL.
- Use `pnpm test:integration` for owner-scoped PostgreSQL/Nest behavior. Integration files are serial; each suite needing clean tables calls `resetTestDatabase()` locally.
- Reuse `tests/ai-ask-direct-api.test.ts` for direct-client strictness and `tests/trip-recommendations-api.integration.test.ts` for browser-session/CSRF/owner-principal patterns. Do not mistake source-inspection tests for rendered interaction proof.
- Start with the focused relevant commands, then run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.

### Recent Git Intelligence

- `f1a7ca2 feat(trips): add typed trip recommendations` introduced Story 16.1 contracts, persistence, direct API routes, client wrappers, and tests.
- `e0173d0 fix(trips): fence recommendation decisions` is the current baseline. It requires the latest context extraction, serializes decision actions with extraction, rejects now-scoped/missing ordinary conversations, validates accepted-creation client admission, and uses exact deletion-replay matching.
- Treat those Story 16.1 repairs as constraints. Story 16.2 consumes the resulting typed contracts and must not bypass them with client-created scope behavior.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 16`, `#Story 16.2`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#FR-16J`, `#FR-16K`, `#FR-16L`, `#AC-26`, `#AC-27`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-21`, `#AD-24`, `#AD-30`, `#AD-30A`, `#AD-30B`]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Sidebar hierarchy`, `#Chat composer`, `#Trip context indicator`, `#Interaction Primitives`, `#Accessibility Floor`]
- [Source: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-08-05-epic-16.md#Story Quality And Ordering`]
- [Source: `_bmad-output/implementation-artifacts/16-1-recommend-and-save-trip-projects-through-typed-owner-decisions.md#Architecture Compliance`, `#Review Findings`]
- [Source: `_bmad-output/project-context.md#Testing Rules`, `#Critical Don't-Miss Rules`]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- Story context created from the Epic 16 PRD/epic contract, architecture spine, UX specifications, readiness report, completed Story 16.1 guide and repairs, current direct shell implementation, direct API contracts, and recent git history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Status set to `ready-for-dev`.

### File List

- `_bmad-output/implementation-artifacts/16-2-preserve-explicit-trip-scope-in-the-planning-shell.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
