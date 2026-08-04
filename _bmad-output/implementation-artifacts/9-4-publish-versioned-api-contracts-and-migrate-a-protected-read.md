# Story 9.4: Publish Versioned API Contracts and Migrate a Protected Read

Status: done

## Story

As a traveler or operator,
I want one protected capability to work end to end through a documented API and BFF,
so that the API-first boundary is proven by behavior rather than only by credentials.

## Acceptance Criteria

1. Given the API service is deployed, when a caller requests `/health/live`, `/health/ready`, `/v1/version`, or the selected protected read capability, then OpenAPI documents the versioned endpoint, validation, authorization, ownership scope, safe errors, and stable list ordering or cursor pagination when applicable. Contract tests verify documented responses and the error envelope.
2. Given a traveler or operator opens the selected capability through its BFF, when the BFF validates its host-only session and calls the private API, then the browser receives only the presentation response and never an internal credential. A direct browser request is denied without CORS authorization or session interpretation.
3. Given the selected capability is cut over, when its migration flag routes a request, then exactly one transport owner accepts the read or command. Local contract and routing tests prove no legacy/API dual write or divergent ownership path exists. Deployed routing, migration ordering, rollback, and legacy-retirement evidence are owned by Epic 14 Story 14.2.

## Tasks / Subtasks

- [x] Select and document the first protected read (AC: 1-3)
  - [x] Use ordinary owned conversation summaries as the default selected capability unless a documented architecture decision chooses another small read-only capability before implementation.
  - [x] Record the API contract, authorization matrix, owner predicate, stable ordering, routing switch, rollback route, and local/staging-safe comparison behavior in the implementation record. Epic 14 Story 14.2 owns deployed routing, rollback, and legacy-retirement evidence.
  - [x] Do not select AI Ask, an admin mutation, or trip-project workspace data for this first cutover; those have broader transaction/streaming dependencies.
- [x] Extract the selected read model from Next session coupling (AC: 1-2)
  - [x] Split the existing conversation-summary query into the shared Chat/Trips domain package as an owner-scoped read model accepting a principal/user ID, with root Next and Nest adapters using the same exported contract. Nest must not import `src/features/chat-trips/conversations.ts`, `server-only`, root aliases, or Next session helpers.
  - [x] Preserve the existing safe projection: `id`, ISO-8601 UTC `updatedAt`, and preview only; preserve exclusion of trip-project conversations and deterministic ordering by conversation update/id then user message creation/id. This first contract is an unpaginated bounded list; any pagination needs an explicit compatible cursor contract.
  - [x] Do not move full conversation messages, provenance, annotations, trip planning, or mutation behavior into this contract.
- [x] Publish API platform contracts (AC: 1)
  - [x] Implement the API-foundation `release_schema_versions` record, migration advisory lock, checked-in workload compatibility declaration, and readiness admission test required by AD-33 before API traffic. The migration command records the applied version; API readiness rejects a non-compatible schema.
  - [x] Implement Nest `/health/live`, `/health/ready`, and `/v1/version` with distinct liveness/readiness semantics.
  - [x] Implement the protected `/v1` conversation-summary endpoint using the Story 9.1 principal guard and Story 9.3 validation/error/correlation boundary.
  - [x] Generate/publish OpenAPI for `/v1` and describe auth, ownership, stable ordering/pagination behavior, response DTOs, safe errors, and health/version behavior.
- [x] Adapt the root Next BFF and cut over one owner (AC: 2-3)
  - [x] Add a capability-specific BFF adapter using the Story 9.3 API client; its response must remain the page/component presentation contract and never expose the bearer credential.
  - [x] Add validated `XV_CONVERSATION_SUMMARY_API_ENABLED`, defaulting false outside an explicitly enabled deployment, that chooses the legacy read or API/BFF read before either accepts the request.
  - [x] Keep any shadow comparison read-only and development/staging-only, after the selected response, tagged by correlation ID and excluded from browser response behavior. Do not create a dual-write path; this is a read, but the same single-owner rule must remain explicit for future commands.
  - [x] Handoff deployed selected-owner execution, rollback proof, and legacy-owner retirement to Epic 14 Story 14.2. Rollback remains routing-first; schema is never destructively rolled back.
- [x] Verify contracts and end-to-end behavior (AC: 1-3)
  - [x] Add OpenAPI/HTTP contract tests for health, readiness failure, version, protected read success/failure, ownership isolation, safe envelopes, and stable ordering.
  - [x] Add BFF integration tests proving host-only session validation, internal credential containment, direct-browser denial/no CORS, and response serialization.
  - [x] Add routing-switch tests proving one selected owner and no divergent legacy/API response shape in local/staging-safe comparisons.

## Dev Notes

### Selected Capability and Current Behavior

- The recommended selected protected read is the ordinary owned conversation list currently loaded by `listOwnedConversations()` in `src/features/chat-trips/conversations.ts` and consumed by `src/app/ai-ask/page.tsx`.
- It is the smallest useful authenticated read: it is owner-scoped, does not mutate data, and already establishes stable ordering. The query filters `conversations.user_id`, excludes project-linked conversations, orders by `updated_at DESC, id DESC, user-message created_at ASC, id ASC`, and de-duplicates joined message rows into summaries.
- Preserve the exact display projection and Vietnamese new-conversation preview behavior. API serialization may convert `Date` values to an explicit contract-safe representation, but the BFF/component contract must be updated deliberately and tested.

### Implementation Guardrails

- Build on Stories 9.1-9.3. Do not recreate JWT verification, principal construction, CSRF, BFF transport, correlation, or safe-error logic inside the read module.
- Start only after Stories 9.1-9.3 complete and their identity/transport integration coverage passes.
- Liveness proves process operation only. Readiness verifies validated configuration, compatible schema version from the API-foundation release record, database access, configured issuer verification keys, and the critical dependencies required to serve assigned API traffic. Do not make liveness depend on the database.
- The controller accepts only `RequestPrincipal` and a validated request DTO. The extracted read model accepts domain input/principal/user ID, not a Next session, request, cookie, redirect, or revalidation callback.
- API ownership enforcement is server-side; a BFF/page-side role or user check is presentation gating, not the authorization decision.
- The validated `XV_CONVERSATION_SUMMARY_API_ENABLED` flag chooses exactly one transport before request acceptance. Shadow checks compare safe read outcomes only after the selected response in development/staging, tag results with the correlation ID, and must not become a second public owner.
- Preserve the root Next traveler app. `apps/web` and the separately deployed admin BFF remain later work.

### Existing Code to Preserve

- `src/features/chat-trips/conversations.ts#listOwnedConversations` is the behavior reference, but it calls `getAuthenticatedSession()` internally and cannot be called directly by Nest. Extract its query into the shared domain/database seam and retain this file as the temporary Next session adapter rather than importing it into `apps/api`.
- `src/app/ai-ask/page.tsx` server-loads ordinary sessions unless a trip project is selected. Keep URL selection and shell ownership unchanged; only adapt the selected summary-list source through the BFF/API path.
- `src/app/api/health/route.ts` is the legacy combined health endpoint. Retire/re-route only after the new health contract is verified; do not conflate `/health/live` and `/health/ready`.
- Keep full conversation reads, image attachment behavior, answer provenance/annotations, and trip-project history in their existing Chat/Trips owners. They are not part of this read slice.

### Suggested File Structure

- NEW `apps/api/src/health/*`, `apps/api/src/version/*`, and `apps/api/src/conversations/*`: controller/DTO/OpenAPI adapters only.
- NEW/UPDATE `packages/database` and `packages/domain/src/chat-trips/*`: Drizzle client/schema and the extracted owner-scoped conversation-summary read model shared by root Next and Nest.
- NEW/UPDATE shared contracts for health/version/conversation-summary response and safe error DTOs.
- UPDATE `src/features/chat-trips/conversations.ts`: exported principal/user-ID scoped read query plus an existing Next-session adapter that calls it.
- UPDATE `src/server/bff-api-client.ts` and add a narrow Chat/Trips BFF read adapter.
- UPDATE `src/app/ai-ask/page.tsx`: select the capability routing owner without changing other shell loaders.
- UPDATE deployment/workspace configuration only insofar as API build/start and health checks require it. Full staging topology and worker deployment remain later stories.

### Testing Requirements

- Use API integration/contract tests for HTTP status, DTOs, OpenAPI, safe error envelopes, owner isolation, and stable ordering.
- Test `/health/live` independently from database readiness, then test `/health/ready` for config, release-schema compatibility, issuer-key, and database dependency failure.
- Test browser-facing BFF behavior separately: it must not expose `Authorization`, private URL/configuration, token claims, or cookie/session data.
- Test direct API browser/cookie calls are denied with no CORS allow-origin header.
- Test both routing positions and assert only the selected transport executes. Any shadow test must be environment-gated and read-only.
- Run targeted tests plus `pnpm lint`, `pnpm typecheck`, `pnpm build`, and API/workspace build checks introduced by this story.

### Scope Boundaries

- No AI Ask streaming cutover, command idempotency, outbox, worker migration, separate admin app, or broad Chat/Trips API migration.
- Do not add a generic API client SDK, public API origin, offset pagination without an explicit contract need, or a permanent legacy/API compatibility layer.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.4: Publish Versioned API Contracts and Migrate a Protected Read]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-15: Railway Deploys Independently Gated Workloads]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-32: Capability Cutovers Have One Writer And Compatible Rollback]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Operational Envelope]
- [Historical source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-07-28.md#Sprint Change Proposal: API-First Runtime and Launch Readiness]
- [Source: src/features/chat-trips/conversations.ts#listOwnedConversations]
- [Source: src/app/ai-ask/page.tsx]
- [Source: src/app/api/health/route.ts]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- 2026-07-28 independent Story 9.4 review of `7736a1d6fd2770864ea4c1cb6c1dc87191d25e76..21303df22f5dc3e10a3d7fb9419c868678d539ba` is blocked; no application code was changed during review.
- Local evidence: `pnpm vitest run tests/api-platform-contract.test.ts tests/conversation-summary-cutover.test.ts tests/ai-ask-sessions.test.ts` passed (3 files, 16 tests); `pnpm lint` passed with 4 warnings and 0 errors; `pnpm typecheck`, `pnpm build`, and range `git diff --check` passed.
- HIGH code/integration finding: `Dockerfile:39-47` ships only the Next runtime and starts `next start`; it omits the built `apps/api/dist` workload and an API start command. The newly enabled BFF route therefore has no API workload to reach in Docker-based deployment.
- MEDIUM AC3 code finding: `src/features/chat-trips/conversation-summary-loader.ts:10-15` selects one transport but implements neither the required development/staging-only, correlation-tagged, read-only comparison nor response-equivalence coverage against both real adapters. `tests/conversation-summary-cutover.test.ts:8-19` exercises synthetic callbacks only.
- External prerequisite, not a local code failure: no local evidence establishes a separately deployed API workload, private route/probes, migration-before-traffic ordering, selected-owner execution, response equivalence, or rollback. The required staging evidence and post-proof legacy-owner retirement in AC3 remain unavailable; do not mark this story done until recorded.
- 2026-07-28 local independent-review repair: `Dockerfile` now provides an `api-runner` target that copies `apps/api/dist`, starts Nest on port 3001, and remains separately deployable from the Next `runner` target. This satisfies the local workload packaging finding without claiming deployment evidence.
- 2026-07-28 local independent-review repair: the conversation-summary loader now optionally performs an asynchronous, read-only equivalence comparison only when `XV_CONVERSATION_SUMMARY_SHADOW_COMPARE_ENABLED=true` and `APP_ENV` is `local` or `staging`. It begins only after the selected owner returns, has no browser-response effect, logs only equivalence metadata tagged with its correlation ID, propagates that ID to the API adapter, and is disabled in production. Focused coverage invokes the actual legacy/API adapter seams with equivalent serialized responses.
- Staging deployment, migration-before-traffic, selected-owner execution, rollback, and legacy-owner retirement evidence remains unavailable and is not represented as complete.
- 2026-07-28 final bounded independent review of `7736a1d6fd2770864ea4c1cb6c1dc87191d25e76..be1b19abb9714071b344b0c2044c23ff6285165c` ran Blind Hunter, Edge Case Hunter, and Acceptance Auditor synchronously. BLOCKED. MEDIUM local finding: `src/features/chat-trips/conversation-summary-loader.ts:30-32,46-51` throws for a malformed shadow-comparison flag after the selected read completes, causing an observability-only comparison setting to alter the browser-facing result; shadow configuration must fail closed without changing the selected response. The `api-runner` Docker target builds successfully and contains the Nest artifact, production dependencies, port 3001, and the API entrypoint, but target selection in the separately deployed Railway service is not represented or verifiable locally. AC3 staging evidence remains a real external blocker: deployed private routing/probes, migration-before-traffic, selected-owner execution, equivalence records, rollback, and legacy-owner retirement are not available. No code or commit changes were made during this review.
- 2026-07-28 final local repair: malformed `XV_CONVERSATION_SUMMARY_SHADOW_COMPARE_ENABLED` values now fail closed as disabled, so optional local/staging observability cannot change a successfully selected browser response. Regression coverage proves the selected legacy and API responses remain unchanged and no unselected transport runs. Story remains in-progress: AC3 external staging/Railway evidence is unavailable.
- 2026-07-28 approved course correction: Story 9.4 is complete for development and local contract proof. Its remaining deployed private routing/probe, migration-before-traffic, selected-owner, rollback, and legacy-retirement evidence is an explicit Epic 14 Story 14.2 launch-evidence gate, not a blocker for subsequent development epics. This does not mark the public-launch gate complete.

### File List

- Dockerfile
- src/features/chat-trips/conversation-summary-bff.ts
- src/features/chat-trips/conversation-summary-loader.ts
- tests/conversation-summary-cutover.test.ts
