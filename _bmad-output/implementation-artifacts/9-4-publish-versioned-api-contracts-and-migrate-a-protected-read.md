# Story 9.4: Publish Versioned API Contracts and Migrate a Protected Read

Status: ready-for-dev

## Story

As a traveler or operator,
I want one protected capability to work end to end through a documented API and BFF,
so that the API-first boundary is proven by behavior rather than only by credentials.

## Acceptance Criteria

1. Given the API service is deployed, when a caller requests `/health/live`, `/health/ready`, `/v1/version`, or the selected protected read capability, then OpenAPI documents the versioned endpoint, validation, authorization, ownership scope, safe errors, and stable list ordering or cursor pagination when applicable. Contract tests verify documented responses and the error envelope.
2. Given a traveler or operator opens the selected capability through its BFF, when the BFF validates its host-only session and calls the private API, then the browser receives only the presentation response and never an internal credential. A direct browser request is denied without CORS authorization or session interpretation.
3. Given the selected capability is cut over, when its migration flag routes a request, then exactly one transport owner accepts the read or command. Staging tests prove no legacy/API dual write or divergent ownership path exists.

## Tasks / Subtasks

- [ ] Select and document the first protected read (AC: 1-3)
  - [ ] Use ordinary owned conversation summaries as the default selected capability unless a documented architecture decision chooses another small read-only capability before implementation.
  - [ ] Record the API contract, authorization matrix, owner predicate, stable ordering, routing switch, rollback route, and legacy-owner retirement condition in the implementation record.
  - [ ] Do not select AI Ask, an admin mutation, or trip-project workspace data for this first cutover; those have broader transaction/streaming dependencies.
- [ ] Extract the selected read model from Next session coupling (AC: 1-2)
  - [ ] Split the existing conversation-summary query into an owner-scoped read model accepting a principal/user ID and a temporary Next adapter that obtains the host-only session.
  - [ ] Preserve the existing safe projection: `id`, `updatedAt`, and preview only; preserve exclusion of trip-project conversations and deterministic ordering by conversation update/id then user message creation/id.
  - [ ] Do not move full conversation messages, provenance, annotations, trip planning, or mutation behavior into this contract.
- [ ] Publish API platform contracts (AC: 1)
  - [ ] Implement Nest `/health/live`, `/health/ready`, and `/v1/version` with distinct liveness/readiness semantics.
  - [ ] Implement the protected `/v1` conversation-summary endpoint using the Story 9.1 principal guard and Story 9.3 validation/error/correlation boundary.
  - [ ] Generate/publish OpenAPI for `/v1` and describe auth, ownership, stable ordering/pagination behavior, response DTOs, safe errors, and health/version behavior.
- [ ] Adapt the root Next BFF and cut over one owner (AC: 2-3)
  - [ ] Add a capability-specific BFF adapter using the Story 9.3 API client; its response must remain the page/component presentation contract and never expose the bearer credential.
  - [ ] Add a named routing flag that chooses the legacy read or API/BFF read before either accepts the request.
  - [ ] Keep any shadow comparison read-only and development/staging-only. Do not create a dual-write path; this is a read, but the same single-owner rule must remain explicit for future commands.
  - [ ] After the API path is stable, remove the matching legacy transport owner rather than preserving a permanent compatibility path. Roll back by routing before the new owner accepts requests; never destructively roll back schema.
- [ ] Verify contracts and end-to-end behavior (AC: 1-3)
  - [ ] Add OpenAPI/HTTP contract tests for health, readiness failure, version, protected read success/failure, ownership isolation, safe envelopes, and stable ordering.
  - [ ] Add BFF integration tests proving host-only session validation, internal credential containment, direct-browser denial/no CORS, and response serialization.
  - [ ] Add routing-switch tests proving one selected owner and no divergent legacy/API response shape in staging-safe comparisons.

## Dev Notes

### Selected Capability and Current Behavior

- The recommended selected protected read is the ordinary owned conversation list currently loaded by `listOwnedConversations()` in `src/features/chat-trips/conversations.ts` and consumed by `src/app/ai-ask/page.tsx`.
- It is the smallest useful authenticated read: it is owner-scoped, does not mutate data, and already establishes stable ordering. The query filters `conversations.user_id`, excludes project-linked conversations, orders by `updated_at DESC, id DESC, user-message created_at ASC, id ASC`, and de-duplicates joined message rows into summaries.
- Preserve the exact display projection and Vietnamese new-conversation preview behavior. API serialization may convert `Date` values to an explicit contract-safe representation, but the BFF/component contract must be updated deliberately and tested.

### Implementation Guardrails

- Build on Stories 9.1-9.3. Do not recreate JWT verification, principal construction, CSRF, BFF transport, correlation, or safe-error logic inside the read module.
- Liveness proves process operation only. Readiness verifies validated configuration, database access, and the critical dependencies required to serve assigned API traffic. Do not make liveness depend on the database.
- The controller accepts only `RequestPrincipal` and a validated request DTO. The extracted read model accepts domain input/principal/user ID, not a Next session, request, cookie, redirect, or revalidation callback.
- API ownership enforcement is server-side; a BFF/page-side role or user check is presentation gating, not the authorization decision.
- The route flag chooses exactly one transport before request acceptance. Shadow checks compare safe read outcomes only in development/staging and must not become a second public owner.
- Preserve the root Next traveler app. `apps/web` and the separately deployed admin BFF remain later work.

### Existing Code to Preserve

- `src/features/chat-trips/conversations.ts#listOwnedConversations` is the behavior reference, but it calls `getAuthenticatedSession()` internally and cannot be called directly by Nest. Split query ownership from the Next session adapter rather than importing it into `apps/api`.
- `src/app/ai-ask/page.tsx` server-loads ordinary sessions unless a trip project is selected. Keep URL selection and shell ownership unchanged; only adapt the selected summary-list source through the BFF/API path.
- `src/app/api/health/route.ts` is the legacy combined health endpoint. Retire/re-route only after the new health contract is verified; do not conflate `/health/live` and `/health/ready`.
- Keep full conversation reads, image attachment behavior, answer provenance/annotations, and trip-project history in their existing Chat/Trips owners. They are not part of this read slice.

### Suggested File Structure

- NEW `apps/api/src/health/*`, `apps/api/src/version/*`, and `apps/api/src/conversations/*`: controller/DTO/OpenAPI adapters only.
- NEW/UPDATE shared contracts for health/version/conversation-summary response and safe error DTOs.
- UPDATE `src/features/chat-trips/conversations.ts`: exported principal/user-ID scoped read query plus an existing Next-session adapter that calls it.
- UPDATE `src/server/bff-api-client.ts` and add a narrow Chat/Trips BFF read adapter.
- UPDATE `src/app/ai-ask/page.tsx`: select the capability routing owner without changing other shell loaders.
- UPDATE deployment/workspace configuration only insofar as API build/start and health checks require it. Full staging topology and worker deployment remain later stories.

### Testing Requirements

- Use API integration/contract tests for HTTP status, DTOs, OpenAPI, safe error envelopes, owner isolation, and stable ordering.
- Test `/health/live` independently from database readiness, then test `/health/ready` for config/database dependency failure.
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
- [Source: docs/proposals/nestjs-api-implementation-plan.md#Extract Domain Boundary]
- [Source: src/features/chat-trips/conversations.ts#listOwnedConversations]
- [Source: src/app/ai-ask/page.tsx]
- [Source: src/app/api/health/route.ts]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
