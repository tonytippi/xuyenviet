---
baseline_commit: 92da48e24a760c8e0e21dc91d277212a71513f0e
---

# Story 16.1: Recommend and Save Trip Projects Through Typed Owner Decisions

Status: review

## Story

As a traveler,
I want XuyenViet to offer a saved Trip Project only when it is useful and let me decide what to do,
so that I can begin with a natural question without an automatic project or unwanted reuse of another trip's details.

## Acceptance Criteria

1. **Server-owned recommendation projection**
    - **Given** an authenticated traveler asks in an unscoped conversation
    - **When** Chat/Trips evaluates the current conversation's completed, server-calculated recommendation-context revision and fingerprint
    - **Then** it returns only a typed, owner-bound `trip_creation_recommendation` of `none`, `clarify`, or `offer` and a typed, owner-bound `trip_context_recommendation` of `none`, `clarify`, `single`, or `multiple` when applicable
    - **And** the browser neither calculates material context change nor decides whether a recommendation may be offered again.
    - **And** it returns only a non-actionable `none` projection until the relevant owner-scoped context-extraction effect is terminal and its approved active facts have been incorporated.
    - **And** each `clarify` result contains bounded server-projected Vietnamese question copy and only its permitted typed follow-up action(s); the browser does not derive either from assistant prose.

2. **Explicit server-projected actions only**
   - **Given** a typed recommendation is actionable
   - **When** the traveler UI renders it after useful guidance and durable context exist
   - **Then** it offers only the server-projected explicit choices appropriate to that decision, such as saving a new trip, continuing in an owned trip, or receiving only the current answer
   - **And** rendered assistant prose, local storage, or parsed answer text cannot create a recommendation control, Trip Project, context attachment, or scope change.

3. **Decline fence**
   - **Given** a traveler declines a creation recommendation
   - **When** Chat/Trips records the decision
   - **Then** it persists a decline fence for that owner, conversation, and context revision
   - **And** the service does not re-offer creation until server-calculated material context changes or the traveler explicitly asks to save.

4. **Idempotent accepted creation**
   - **Given** a traveler accepts a creation recommendation
   - **When** `acceptTripCreationRecommendation(...)` receives a valid idempotent request
   - **Then** it revalidates the authenticated owner, current conversation, decision binding, and context revision before atomically creating the Trip Project and its primary conversation
   - **And** a stale, consumed, foreign-owner, deleted-conversation, or changed-context decision creates and attaches nothing.

5. **Owner isolation and private-answer boundary**
    - **Given** an unscoped answer offers an existing Trip Project or a private-answer choice
    - **When** the traveler chooses the existing project or private answer
    - **Then** existing-project candidates have been queried owner-scoped and no other owner's project existence, title, route, metadata, or match score is exposed
    - **And** a successful `continueInTrip(...)` revalidates the selected owned project and its existing same-owner primary conversation, then returns only that canonical project/conversation scope destination for the later shell-navigation slice.
    - **And** a private answer neither loads, uses, nor persists selected Trip Project constraints for that turn and leaves URL-selected scope unchanged.

## Tasks / Subtasks

- [x] Define the strict shared recommendation contracts and port seam (AC: 1-5)
   - [x] Add bounded discriminated request/result types and exact-shape parsers for recommendation reads, decline/private/continue actions, and creation acceptance in `packages/contracts/src/index.ts`.
   - [x] Define explicit decision IDs, owner-bound conversation identity, server revision/fingerprint binding, decision status, and command results. `clarify` results carry bounded Vietnamese question copy and permitted typed action(s). Browser-supplied title, match score, context revision, ownership, and clarification copy are rejected.
   - [x] Define a `continueInTrip(...)` result that validates the chosen owner-scoped Trip Project and its existing primary conversation and returns the canonical `{ tripProjectId, conversationId }` destination; never accept a browser-supplied primary conversation as authority.
   - [x] Extend `TravelerCommandPort` in `packages/domain/src/index.ts` for mutations. Add a narrowly named owner-scoped recommendation read repository/port and inject it through the existing conversations read path rather than coupling GET reads to the command writer. Keep all owner/persistence policy out of Nest and browser code.
   - [x] Do not alter `AiAskStreamEvent` or its byte-preserved NDJSON framing. Use a separate typed read/command seam.

- [x] Persist server-owned decisions, decline fences, and acceptance idempotency (AC: 1, 3-5)
   - [x] Add Drizzle schema definitions and one forward migration for owner-bound recommendation decision state, decline fence, and acceptance/replay state required by the chosen contract.
   - [x] Use owner-scoped composite foreign keys, lifecycle/revision fences, unique constraints, and safe delete behavior. A deleted conversation/project makes an actionable decision unusable and cannot permit an orphaned project or retry-created duplicate.
   - [x] Derive the context fingerprint from a deterministic, normalized server projection of approved active travel facts, not AI Ask or browser data.
   - [x] Persist a monotonic server-owned recommendation-context revision for normalized active-fact additions, changes, and removals; do not use `conversations.lifecycleVersion` or timestamps as this revision.
   - [x] Define material change entirely in Chat/Trips. Persist the decline fence by owner, conversation, and server context revision/fingerprint; explicit save bypasses only the fence while retaining current owner/conversation checks.
   - [x] Gate actionable recommendation reads on completion of the relevant owner-scoped `ai_ask.context_extraction.v1` effect. Re-read current active facts, revision, and fingerprint in the accepted-creation transaction.
   - [x] Extend owner deletion transactions to scrub recommendation acceptance replays before deleting bound conversations or projects.

- [x] Implement recommendation and accepted-creation commands in the database owner (AC: 1-5)
   - [x] Add the implementation through `createPostgresTravelerCommandPort()` in `packages/database/src/index.ts`, using a focused Chat/Trips module. Keep persistence and transactions in `@xuyenviet/database`.
   - [x] Reuse owner locks, request-digest comparison, retained terminal replay, and fence revalidation patterns from `packages/database/src/ai-ask-commands.ts`; do not reuse `ai_ask_commands` as the recommendation aggregate.
   - [x] Query existing project candidates with `userId` filtering before matching. Return safe `none`/`multiple` projections where no single owned candidate is available and never disclose foreign project data.
    - [x] Implement `acceptTripCreationRecommendation(...)` as one transaction: lock/revalidate the decision and unscoped conversation, recompute current active facts/revision/fingerprint, verify unconsumed status, create the project and same-owner primary conversation, consume the decision, persist the replay result, and audit the accepted creation with the authenticated user's `AuditActor`.
   - [x] Use `resolveOwnedPrimaryConversationInTransaction(...)`; the generic `createTripProject(...)` alone is insufficient because it creates no primary conversation.
   - [x] Do not copy, merge, link, replay, or convert the ordinary conversation into the new/selected Trip Project. Do not turn extracted facts into confirmed structured plan state.
    - [x] Implement private-answer/continue selection as typed server decisions. `continueInTrip(...)` owner-scopes the chosen project, resolves its primary conversation, and returns only the canonical destination. Private selection neither loads nor persists project constraints and leaves the unscoped conversation unchanged.
    - [x] Use the typed Audit boundary rather than direct `audit_events` writes for accepted creation, in the same transaction as the mutation.

- [x] Expose the direct Nest API and documented browser client (AC: 1-5)
   - [x] Add owner-scoped recommendation GET route(s) through `apps/api/src/conversations/conversations.controller.ts` and its injected read repository. Add narrowly named action routes and DTO validation in `apps/api/src/conversations/traveler-commands.controller.ts`, using `@Principal()` and `SafeValidationPipe`; controllers supply only `principal.userId`.
   - [x] For accepted creation, read `Idempotency-Key` with `@Headers("idempotency-key")`, validate it with the bounded shared validator before invoking the port, and pass it as a distinct command field. Do not require or forward this header for other recommendation actions.
   - [x] Register the capability through the existing `TRAVELER_COMMAND_PORT` dependency path and production `createPostgresTravelerCommandPort()` wiring. Do not create a second writer, Next route handler, server action, or direct database browser access.
   - [x] Document every added protected route, request body, result, CSRF requirement, and idempotency header in `apps/api/src/openapi.controller.ts`.
   - [x] Extend `apps/web/src/features/ai/direct-api-client.ts` with strict local command parsing, relative cookie-authenticated URLs, CSRF, response parsing, and an opt-in `Idempotency-Key` only for accepted creation. Do not add idempotency headers globally to unrelated commands.
   - [x] Render integration is deferred to Story 16.2; this slice exposes only server-projected typed data and does not parse assistant text or create browser-persisted recommendation authority.

- [x] Add focused regression coverage (AC: 1-5)
   - [x] Add infrastructure-free unit tests for deterministic normalization/fingerprint/material-change and decision-result parsing.
    - [x] Add a focused serial PostgreSQL recommendation integration suite with local `resetTestDatabase()`, concurrent acceptance coverage, and seeded authenticated-user email data for audit fixtures.
    - [x] Cover no match, multiple owned matches, incomplete/failed extraction non-actionability, decline suppression, material context changes including a fingerprint returning to a prior value, explicit save, idempotent/concurrent accept, changed revision, deleted conversation/project, and cross-owner inputs.
    - [x] Assert failed acceptance leaves no project or consumed-state side effect; assert valid acceptance creates exactly one owner-scoped project with exactly one same-owner primary conversation.
    - [x] Add direct API/client tests for strict contracts, Vietnamese bounded `clarify` projections, authenticated principal ownership, CSRF, safe error projection, canonical continue destination, and `Idempotency-Key` forwarding only for creation acceptance. Test missing and malformed accepted-creation headers at the controller boundary; replay/key reuse is covered by the persisted command suite.
   - [x] Add a private-answer data-flow test proving the selection leaves the unscoped conversation's project pointer unchanged and does not expose another owner's project.

## Dev Notes

### Scope and Product Intent

This is the first implementation slice of Epic 16. It establishes durable, typed Chat/Trips decisions so a traveler can start with an ordinary question and explicitly opt into a Trip Project later. The feature is intentionally server-authoritative: a model response, rendered assistant prose, local storage, or browser inference cannot create a project, attach project context, or decide whether a prior decline can be re-offered.

The story owns the recommendation aggregate, owner-scoped matching, decline fence, and accepted creation transaction. It may expose a minimal typed client seam, but it does not redesign the AI Ask shell or answer presentation.

### Architecture Compliance

- **Chat/Trips owns all recommendation policy and commands.** `@xuyenviet/contracts` owns DTOs/parsers; `@xuyenviet/domain` owns ports; `@xuyenviet/database` owns transactions/schema; Nest is only the authenticated HTTP adapter; the web app is only a typed direct client. [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30A`; `_bmad-output/project-context.md#Code Quality & Style Rules`]
- **Owner isolation is non-negotiable.** Filter candidate projects by authenticated `userId` before matching, lock/revalidate the owner-bound decision in the same transaction as acceptance, and return the same safe result for foreign/missing resources. Do not disclose foreign existence, title, route, metadata, or score. [Source: `ARCHITECTURE-SPINE.md#AD-30A`; `_bmad-output/planning-artifacts/epics.md#Story 16.1`]
- **The existing generic project creation command is not enough.** It creates a project only. This story's accepted-creation command must atomically create the new project and its same-owner primary conversation. Preserve the current primary-conversation invariant and never attach the original ordinary conversation. [Source: `packages/database/src/index.ts#createTripProject`; `packages/database/src/primary-conversation.ts#resolveOwnedPrimaryConversationInTransaction`; `ARCHITECTURE-SPINE.md#AD-30`]
- **Use separate idempotency state.** The AI Ask command ledger is the implementation precedent, not the recommendation data model. Its request digest represents a submitted question/scope, not recommendation eligibility. Reuse its locking, unique-arbitration, replay, and terminal-fence techniques without coupling decision lifecycle to `ai_ask_commands`. [Source: `packages/database/src/ai-ask-commands.ts`]
- **Context materiality is server-calculated.** Build a canonical normalized fact projection from current owner-scoped conversation context. The current `TripAnswerContext v1` format version, project aggregate version, `requestDigest`, source-bundle digest, and answer snapshot digest do not replace an ordinary-conversation recommendation revision/fingerprint. [Source: `packages/database/src/answer-context.ts`; `packages/database/src/ai-ask-commands.ts`; `ARCHITECTURE-SPINE.md#AD-30A`]
- **Wait for durable extracted facts, then fence them.** The AI Ask command enqueues `ai_ask.context_extraction.v1`; its message persistence does not mean current travel facts are ready. Return non-actionable `none` until that owner-scoped extraction reaches a usable terminal state, and persist a monotonic recommendation-context revision or immutable active-fact-set generation for normalized active-fact changes. `conversations.lifecycleVersion` fences deletion/primary lifecycle only; it is not a context revision. [Source: `packages/database/src/ai-ask-commands.ts`; `packages/worker-domain/src/features/chat-trips/context-extraction.ts`; `packages/database/src/answer-context.ts`]
- **Continue is a validated destination, not a client route.** The server must owner-scope the selected project, resolve its current existing primary conversation, and return the canonical `{ tripProjectId, conversationId }` destination. Story 16.2 owns browser URL reconciliation, but it depends on this typed, validated result. [Source: `ARCHITECTURE-SPINE.md#AD-30A`; `_bmad-output/planning-artifacts/epics.md#Story 16.2`]
- **Recommendation lifecycle must follow resource deletion.** Existing conversation and project deletion explicitly fences retained AI Ask commands. Apply an equivalent transaction-owned or trigger-owned invalidation/scrubbing policy to recommendation decisions, fences, and replays so deleted resources cannot reactivate a decision or duplicate a project on retry. [Source: `packages/database/src/index.ts#deleteConversation`; `packages/database/src/index.ts#deleteTripProject`; `packages/database/src/ai-ask-commands.ts#discardAiAskCommandsForDeletedConversations`]
- **Private is a data boundary, not a visual state.** A private choice must neither load nor persist project constraints, must preserve the current URL scope, and must not link/copy/replay conversations. Test the actual source-bundle/context persistence path, not only UI output. [Source: `ARCHITECTURE-SPINE.md#AD-30A`; `_bmad-output/planning-artifacts/epics.md#Story 16.1`]
- **Preserve direct API rules.** Use Nest principal/session admission and CSRF, direct relative browser requests with credentials, strict parsers on both boundaries, safe error envelopes, and OpenAPI documentation. Do not add Auth.js, BFF credentials, Next route/server-action writers, client identity, or database imports to the web app. [Source: `ARCHITECTURE-SPINE.md#AD-33`; `apps/api/src/conversations/traveler-commands.controller.ts`; `apps/web/src/features/ai/direct-api-client.ts`]
- **Keep reads and commands on their existing transport seams.** Put owner-scoped recommendation reads on a named repository through `ConversationsController`; put recommendation actions on `TravelerCommandPort` through `TravelerCommandsController`. Accepted creation alone reads `Idempotency-Key` from the HTTP header, validates it before port invocation, and passes it independently of the body DTO. [Source: `apps/api/src/conversations/conversations.controller.ts`; `apps/api/src/conversations/traveler-commands.controller.ts`; `packages/contracts/src/index.ts#parseAiAskIdempotencyKey`]
- **Audit durable decision mutations through Audit.** Do not directly insert `audit_events`. Accepted creation and any meaningful persisted recommendation/decline transitions use the typed Audit boundary with the principal-derived user `AuditActor` in the mutation transaction. [Source: `ARCHITECTURE-SPINE.md#AD-31`; `packages/database/src/index.ts#createTripProject`]
- **Do not change NDJSON streaming.** Stream frames are byte-sensitive and current recommendation data is not part of the stream contract. A separate JSON read/command endpoint is lower-risk and preserves `preparing`, `delta`, `done`, and `error` semantics. [Source: `packages/contracts/src/index.ts#AiAskStreamEvent`; `apps/web/src/features/ai/direct-api-client.ts#submitDirectAiAskStream`]

### Existing Code to Extend

| File | Current responsibility | Story 16.1 change / preservation |
|---|---|---|
| `packages/contracts/src/index.ts` | Shared strict HTTP/browser contracts and parsers. | Add only bounded recommendation command/result types and parsers. Keep existing shell and NDJSON contracts compatible. |
| `packages/domain/src/index.ts` | `TravelerCommandPort` boundary. | Add typed recommendation commands/read port; do not add persistence or authentication. |
| `packages/database/src/schema.ts` | Drizzle-owned aggregate schema. | Add decision/fence/idempotency tables and owner-scoped constraints; define deletion behavior. |
| `drizzle/migrations/` | Forward database migrations. | Add one migration for this story; do not reset, dual-write, or add compatibility runtime paths. |
| `packages/database/src/index.ts` | PostgreSQL traveler command factory and owner-scoped commands. | Implement transactional recommendation/acceptance commands through the existing factory. Preserve generic manual project creation. |
| `packages/database/src/primary-conversation.ts` | Locks/repairs owner-scoped primary conversation. | Reuse or safely adapt it in the accepted-creation transaction; retain same-owner project pointer invariants. |
| `packages/database/src/ai-ask-commands.ts` | Idempotency/fence/replay reference implementation. | Reuse design patterns only; do not overload its tables or alter its behavior. |
| `apps/api/src/conversations/conversations.controller.ts` | Principal-bound owner-scoped traveler reads. | Add recommendation read endpoint through a dedicated read repository; do not bind GET reads to the command port. |
| `apps/api/src/conversations/traveler-commands.controller.ts` | Principal-bound direct traveler mutations. | Add strict DTO/controller endpoints using the existing injected port and CSRF protection; extract and validate `Idempotency-Key` only for accepted creation. |
| `apps/api/src/openapi.controller.ts` | Versioned protected API documentation. | Document every new route/schema/header. |
| `apps/web/src/features/ai/direct-api-client.ts` | Typed direct browser API client. | Add recommendation wrappers and opt-in idempotency-header support only for accepted creation. |

### Explicitly Out of Scope

- Story 16.2 owns sidebar project-list loading, `Hỏi XuyenViet` unscoped routing, scoped header/composer copy, URL reconciliation, mobile sheet behavior, and focus restoration. Do not implement these shell changes here.
- Story 16.3 owns answer layout, trust/provenance disclosure presentation, recovery-copy presentation, feedback placement, and associated accessibility polish. Do not modify feedback persistence or provenance rendering in this story.
- Story 16.4 owns the final cross-epic responsive/accessibility verification matrix. This story still needs focused tests for its own durable decision behavior.
- No Maps, booking, provider availability, weather, budget, checklists, collaboration, additional domain services, or new dependencies.

### Testing Requirements

- Use `pnpm test:unit` for pure contract/fingerprint logic. Unit tests must not require database environment variables or a PostgreSQL connection.
- Use `pnpm test:integration` for decision persistence, locks, ownership, idempotency, and direct Nest API behavior. Each clean-table integration suite must call `resetTestDatabase()` in its own setup; integration execution remains serial.
- Add a focused recommendation integration suite rather than treating `ai_ask_commands` as the new aggregate or `tests/trip-planning-safety.test.ts` as a database transaction suite. Reuse their patterns only where applicable. Include an independent-connection accept-race test, deletion invalidation coverage, and context-extraction readiness/revision coverage.
- Add controller tests for separate `Idempotency-Key` header admission, and read-route tests for owner-scoped `none`/`clarify`/`single`/`multiple` projections and canonical continue destinations.
- Run focused tests first, then `pnpm lint`, `pnpm typecheck`, and `pnpm build`. If integration infrastructure is unavailable, record the exact command and blocker in completion notes.

### Project Structure Notes

- The app is a modular monolith. Keep contracts in `packages/contracts`, policy/port interfaces in `packages/domain`, PostgreSQL/Drizzle in `packages/database`, Nest transport in `apps/api`, and browser behavior in `apps/web`.
- TypeScript is strict. Do not add `any`, unchecked casts, new dependencies, generic repository helpers, or alternate state owners.
- User-facing text remains Vietnamese with diacritics. Keep technical decision discriminators internal or map them through bounded server projections; do not interpolate raw errors, IDs, hashes, provider data, or database diagnostics.

### Recent Git Intelligence

Recent commits are documentation/planning commits for Epic 16 (`ff8071f`, `c2231d0`, `c213d52`, `f9c3997`) after the UX simplification commit (`67f3f96`). No implementation baseline exists for Story 16.1, so start from the completed direct API and Chat/Trips ownership patterns rather than assuming a partial recommendation implementation is present.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 16.1`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#FR-16J`, `#FR-16K`, `#AC-25`, `#AC-26`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-24]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30A]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-33]
- [Source: `_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Trip recommendation]
- [Source: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-08-05-epic-16.md#Summary and Recommendations]
- [Source: `_bmad-output/project-context.md#Testing Rules`]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- Story context created from Epic 16 readiness, PRD, architecture/UX spines, current code ownership, direct API contracts, existing primary-conversation and AI Ask idempotency implementations, and recent git history.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Status set to `ready-for-dev`.
- Implemented the server-owned recommendation persistence foundation: strict shared contracts, domain read/command ports, owner-bound context revisions/fingerprints, decisions, declines, accepted-creation replay state, and forward migration `0042_trip_recommendation_decisions.sql`.
- Added direct Nest read/action routes, OpenAPI documentation, and typed browser wrappers. Accepted creation alone sends `Idempotency-Key`; the controller rejects missing or malformed headers before it invokes the command port.
- Added focused contract/client tests and an isolated PostgreSQL recommendation suite covering completed-extraction gating, material revision advancement after decline, idempotent accepted creation with a new primary conversation, and cross-owner rejection.
- Verification passed: `pnpm test:unit --run tests/ai-ask-direct-api.test.ts tests/trip-recommendations.test.ts` (10 tests), `pnpm test:integration --run tests/trip-recommendations.integration.test.ts` (4 tests), `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- Completed the remaining acceptance matrix: failed extraction gating, explicit save after decline, single/multiple owner-scoped candidate projections, canonical continue destination, private-answer pointer preservation, concurrent accepted-creation replay, changed-context rejection, and conversation/project deletion replay invalidation.
- Added direct Nest browser-session coverage for principal-bound recommendation reads, Vietnamese `clarify` projection, CSRF admission, and missing/malformed accepted-creation idempotency headers. This exposed and repaired the erased-interface DTO validation path so valid recommendation commands now reach the port.
- Corrected the stale YouTube capture regression assertion from the removed `stage` field to the current `status` field in `knowledgeIngestionJobs`.
- Verification passed: focused unit suite (10 tests), focused recommendation PostgreSQL/API suite (12 tests), full `pnpm test:integration` (47 files, 430 tests), `pnpm lint` (0 errors; 45 existing warnings), `pnpm typecheck`, `pnpm build`, and `git diff --check`.

### File List

- `_bmad-output/implementation-artifacts/16-1-recommend-and-save-trip-projects-through-typed-owner-decisions.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/contracts/src/index.ts`
- `packages/domain/src/index.ts`
- `packages/database/src/schema.ts`
- `packages/database/src/index.ts`
- `packages/database/src/trip-recommendations.ts`
- `drizzle/migrations/0042_trip_recommendation_decisions.sql`
- `drizzle/migrations/meta/_journal.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/conversations/conversations.controller.ts`
- `apps/api/src/conversations/traveler-commands.controller.ts`
- `apps/api/src/openapi.controller.ts`
- `apps/web/src/features/ai/direct-api-client.ts`
- `tests/trip-recommendations.test.ts`
- `tests/trip-recommendations.integration.test.ts`
- `tests/trip-recommendations-api.integration.test.ts`
- `tests/ai-ask-direct-api.test.ts`
- `tests/youtube-capture.test.ts`

### Change Log

- 2026-08-05: Implemented the initial typed, server-owned recommendation aggregate and focused regression coverage; retained `in-progress` pending the remaining Story 16.1 acceptance matrix.
- 2026-08-05: Completed the recommendation acceptance matrix, repaired direct command DTO admission and a stale unrelated YouTube test assertion, and moved the story to `review` after full regression validation.
