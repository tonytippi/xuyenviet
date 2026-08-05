# Story 16.1: Recommend and Save Trip Projects Through Typed Owner Decisions

Status: ready-for-dev

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

- [ ] Define the strict shared recommendation contracts and port seam (AC: 1-5)
   - [ ] Add bounded discriminated request/result types and exact-shape parsers for recommendation reads, decline/private/continue actions, and creation acceptance in `packages/contracts/src/index.ts`.
   - [ ] Define explicit decision IDs, owner-bound conversation identity, server revision/fingerprint binding, decision status, and command results. `clarify` results must carry bounded Vietnamese question copy and permitted typed action(s). Never accept project title, match score, arbitrary context revision, ownership, or browser-generated clarification copy as authority.
   - [ ] Define a `continueInTrip(...)` result that validates the chosen owner-scoped Trip Project and its existing primary conversation and returns the canonical `{ tripProjectId, conversationId }` destination; never accept a browser-supplied primary conversation as authority.
   - [ ] Extend `TravelerCommandPort` in `packages/domain/src/index.ts` for mutations. Add a narrowly named owner-scoped recommendation read repository/port and inject it through the existing conversations read path rather than coupling GET reads to the command writer. Keep all owner/persistence policy out of Nest and browser code.
   - [ ] Do not alter `AiAskStreamEvent` or its byte-preserved NDJSON framing. Use a separate typed read/command seam.

- [ ] Persist server-owned decisions, decline fences, and acceptance idempotency (AC: 1, 3-5)
   - [ ] Add Drizzle schema definitions and one forward migration for owner-bound recommendation decision state, decline fence, and acceptance/replay state required by the chosen contract.
   - [ ] Use owner-scoped composite foreign keys, lifecycle/revision fences, unique constraints, and safe delete behavior. A deleted conversation/project must make an actionable decision unusable and must not permit an orphaned project or retry-created duplicate.
   - [ ] Derive the context fingerprint from a deterministic, normalized server projection of approved active travel facts. Do not use AI Ask request/source-bundle digests, answer provenance hashes, browser data, free-form answer text, or raw extraction output as this decision fingerprint.
   - [ ] Persist a monotonic server-owned recommendation-context revision or immutable active-fact-set generation. Specify exactly which normalized active-fact additions, changes, removals, or supersessions advance it; do not use `conversations.lifecycleVersion` or timestamps as this revision.
   - [ ] Define material change entirely in Chat/Trips. Persist the decline fence by owner, conversation, and server context revision/fingerprint; explicit save may bypass the fence but must still pass all current owner and conversation checks.
   - [ ] Gate actionable recommendation reads on completion of the relevant owner-scoped `ai_ask.context_extraction.v1` effect. Re-read the current active facts, revision, and fingerprint under the accepted-creation transaction rather than relying on an earlier read projection.
   - [ ] Extend both existing owner deletion transactions, or add an equivalent database-owned deletion trigger, to lock then discard/scrub recommendation decisions, decline fences, and acceptance replays before deleting bound conversations or projects. Retained terminal replay state must be safe but never reusable after deletion.

- [ ] Implement recommendation and accepted-creation commands in the database owner (AC: 1-5)
  - [ ] Add the implementation through `createPostgresTravelerCommandPort()` in `packages/database/src/index.ts`, or a focused Chat/Trips module it calls. Keep persistence and transactions in `@xuyenviet/database`.
  - [ ] Reuse owner locks, request-digest comparison, `INSERT ... ON CONFLICT`, retained terminal replay, and fence revalidation patterns from `packages/database/src/ai-ask-commands.ts`; do not reuse `ai_ask_commands` as the recommendation aggregate.
  - [ ] Query existing project candidates with `userId` filtering before matching. Use deterministic normalized trip facts and bounded recency; return `clarify` or `none` for uncertain matches. Never read or disclose a foreign project as a candidate.
   - [ ] Implement `acceptTripCreationRecommendation(...)` as one transaction: lock/revalidate the decision and unscoped conversation, recompute current active facts/revision/fingerprint, verify unconsumed status, create the project, create or bind its same-owner primary conversation, consume the decision, persist the replay result, and record the accepted creation through the typed Audit boundary with the authenticated user's `AuditActor`.
  - [ ] Use `resolveOwnedPrimaryConversationInTransaction(...)` or an equivalent transaction-safe adaptation. The existing generic `createTripProject(...)` alone is insufficient because it creates no primary conversation.
  - [ ] Do not copy, merge, link, replay, or convert the ordinary conversation into the new/selected Trip Project. Do not turn extracted facts into confirmed structured plan state.
   - [ ] Implement private-answer/continue selection as typed server decisions. `continueInTrip(...)` must owner-scope the chosen project, resolve and validate its existing primary conversation using `resolveOwnedPrimaryConversationInTransaction(...)` or equivalent, and return only the canonical destination. Private selection must keep the URL scope unchanged and must not load, persist, or include selected-project constraints in the turn.
   - [ ] Use the typed Audit boundary rather than direct `audit_events` writes for meaningful durable recommendation state transitions, including accepted creation and any persisted decline/decision events selected by the existing audit taxonomy. Keep audit writes in the same transaction as their mutation.

- [ ] Expose the direct Nest API and documented browser client (AC: 1-5)
   - [ ] Add owner-scoped recommendation GET route(s) through `apps/api/src/conversations/conversations.controller.ts` and its injected read repository. Add narrowly named action routes and DTO validation in `apps/api/src/conversations/traveler-commands.controller.ts`, using `@Principal()` and `SafeValidationPipe`; controllers supply only `principal.userId`.
   - [ ] For accepted creation, read `Idempotency-Key` with `@Headers("idempotency-key")`, validate it with the bounded shared validator before invoking the port, and pass it as a distinct command field/argument. A body parser cannot validate this header. Do not require or forward this header for other recommendation actions.
  - [ ] Register the capability through the existing `TRAVELER_COMMAND_PORT` dependency path and production `createPostgresTravelerCommandPort()` wiring. Do not create a second writer, Next route handler, server action, or direct database browser access.
  - [ ] Document every added protected route, request body, result, CSRF requirement, and idempotency header in `apps/api/src/openapi.controller.ts`.
  - [ ] Extend `apps/web/src/features/ai/direct-api-client.ts` with strict local command parsing, relative cookie-authenticated URLs, CSRF, response parsing, and an opt-in `Idempotency-Key` only for accepted creation. Do not add idempotency headers globally to unrelated commands.
  - [ ] Render only server-projected recommendation data if a minimal UI integration is required for this slice. Do not parse assistant text or create browser-persisted recommendation authority.

- [ ] Add focused regression coverage (AC: 1-5)
  - [ ] Add infrastructure-free unit tests for deterministic normalization/fingerprint/material-change and decision-result parsing.
   - [ ] Add a focused serial PostgreSQL recommendation integration suite with local `resetTestDatabase()`, independent connection concurrency coverage, and seeded authenticated-user email data for audit fixtures. Do not repurpose `ai_ask_commands` or the infrastructure-free `trip-planning-safety.test.ts` as the recommendation aggregate suite.
   - [ ] Cover no match, ambiguous match, single/multiple owned matches, incomplete/failed extraction non-actionability, decline suppression, material context change including a normalized fingerprint returning to a prior value, explicit save, idempotent/concurrent accept, stale/consumed decision, changed revision, deleted conversation/project including direct-SQL trigger coverage when applicable, and cross-owner inputs.
  - [ ] Assert failed acceptance leaves no project, primary conversation, pointer, context attachment, or consumed-state side effect; assert valid acceptance creates exactly one owner-scoped project with exactly one same-owner primary conversation.
   - [ ] Add direct API/client tests for strict contracts, Vietnamese bounded `clarify` projections, authenticated principal ownership, CSRF, safe error projection, canonical continue destination, and `Idempotency-Key` forwarding only for creation acceptance. Test missing, malformed, and reused accepted-creation headers at the controller boundary.
  - [ ] Add a private-answer data-flow test that inspects the selection/request/source-bundle/context path and proves selected-project constraints are absent and URL scope is unchanged.

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

### File List

- `_bmad-output/implementation-artifacts/16-1-recommend-and-save-trip-projects-through-typed-owner-decisions.md`
