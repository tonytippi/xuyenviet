# Story 10.5: Cut AI Ask Streaming to the Versioned API

Status: done

## Story

As a traveler,
I want AI Ask streaming to use the protected API through my BFF,
so that I retain the same responsive chat experience while the domain transport has one reliable owner.

## Acceptance Criteria

1. **Given** an authenticated BFF request has a valid idempotency key, **when** it calls `POST /v1/ai-ask/stream`, **then** Nest owns the stream and the BFF forwards request correlation ID, timeout, abort, and NDJSON without exposing its credential to the browser, **and** the event sequence is byte-for-byte compatible with `preparing`, zero or more `delta`, then exactly one `done` or `error`.
2. **Given** the browser aborts, the provider fails, or context-extraction dispatch fails, **when** the command terminalizes, **then** provider work is stopped when possible and terminal assistant content, provenance, and usage are either persisted atomically or absent, **and** the BFF projects only safe retry or `refresh_required` recovery behavior.
3. **Given** the API stream passes protocol and integration tests, **when** the AI Ask transport cutover is enabled for a capability scope, **then** the matching legacy Next.js route/server-action writer no longer accepts that scope, **and** cutover verification proves exactly one transport owner.

## Tasks / Subtasks

- [x] Define the versioned streaming contract and extracted API-safe use-case seam (AC: 1-3)
  - [ ] Add a narrow, versioned AI Ask stream request/result contract to `@xuyenviet/contracts`: question, optional conversation/Trip Project IDs, optional validated image transport representation, required `Idempotency-Key`, and the existing NDJSON event union. For this cutover, correlation is the validated `x-request-id` request/response header; do not add a request-ID member to NDJSON objects because the acceptance criterion requires byte-for-byte compatibility with the current browser protocol. Keep terminal payload fields, names, omission rules, JSON serialization, and newline delimiters unchanged.
  - [ ] Extract the current route's AI Ask orchestration into a runtime-neutral AI-owned use case that accepts only validated domain input, `RequestPrincipal`, correlation/request ID, and `AbortSignal`; it must not accept `Request`, `Response`, `FormData`, Auth.js session objects, Next callbacks, or Nest objects.
  - [ ] Keep all completed Story 10.1-10.4 behavior inside that one use case: command admission/replay; owner-scoped fences; atomic assistant/provenance/usage/source-bundle/command completion; `discarded`/`refresh_required`; transactional outbox enqueue; immutable completed projections; and safe consumer-state separation.
  - [ ] Preserve image limits and validation before command admission/provider work: 1-2000-character normalized question, JPEG/PNG/WebP only, nonempty image no larger than 5 MB, 6 MB request bound, MIME/signature agreement, bounded original filename, and no image bytes/data URL in command terminal projections, logs, safe errors, or API contracts.
  - [ ] Do not make a second persistence path. The extracted use case must call the existing AI, Chat/Trips, Retrieval, and Usage owning APIs, including `acquireAiAskCommand`, fenced finalization, provenance persistence, and typed usage writing; it must not duplicate table writes or weaken feature ownership.
- [x] Add the protected Nest `POST /v1/ai-ask/stream` adapter (AC: 1-2)
  - [ ] Add an `AiAskController` to `apps/api/src/` and register it through `createApiModule`. It receives the normalized `RequestPrincipal` from the existing global `ResourceServerGuard`, request ID from existing middleware, the required idempotency header, and a bounded multipart request; it never accepts or interprets browser cookies.
  - [ ] Add only the minimal API-side repository/dependency ports needed for the extracted use case. Nest may import workspace packages only. It must not import root `src/`, `next/*`, `next-auth`, `server-only`, or a Next route/action module. Move genuinely shared AI/domain code into an approved workspace package rather than crossing that boundary.
  - [ ] Adapt the HTTP connection close/abort signal to the use-case `AbortSignal`; distinguish caller abort from local BFF timeout. Abort must reach source-bundle/provider work where supported, while a completed fenced transaction remains replayable and cannot be reclassified by a later disconnect.
  - [ ] Write raw UTF-8 NDJSON bytes from the use case to the Nest response with `content-type: application/x-ndjson; charset=utf-8`, `cache-control: no-store`, and the existing `x-request-id`. Do not parse and re-serialize event objects in the controller or transform/chunk/coalesce the upstream protocol.
  - [ ] Preserve exact stream semantics: an admitted execution emits `preparing`, zero or more `delta`, then exactly one `done` or `error`; pending replay emits its existing `in_progress` single event; terminal replay emits the retained safe terminal event. Once terminal bytes are written, end the response and suppress later events.
  - [ ] Route pre-stream validation/auth/ownership errors through the established safe API envelope and global exception filter. Once an NDJSON response has begun, emit only the established safe terminal NDJSON error, never a JSON envelope, stack, SQL error, provider payload, prompt, source bundle, token, cookie, or credential.
- [x] Replace the legacy Next route with a thin authenticated BFF stream relay (AC: 1-3)
  - [ ] Keep the public browser URL `/api/ai-ask/stream` only as the traveler BFF boundary. Resolve its host-only Auth.js session, validate signed double-submit CSRF and exact BFF origin before minting a credential or invoking the API, preserve the browser `Idempotency-Key`, and generate/forward the correlation ID.
  - [ ] Add a stream-specific companion to `callPrivateApi` rather than using its JSON parser. It must constrain the URL to configured `XV_PRIVATE_API_URL`, attach only bearer credential, `x-request-id`, required idempotency key, and allowed multipart headers/body; preserve caller abort and BFF timeout behavior; clear timeout/listeners; and never buffer the whole response.
  - [ ] Forward API NDJSON response bytes directly to the browser without parsing, JSON reserialization, event filtering, credential headers, or `Set-Cookie` propagation. Preserve `application/x-ndjson; charset=utf-8`, `cache-control: no-store`, and the authoritative request ID. Map an API pre-stream safe error to the existing Vietnamese-safe browser response shape only; do not expose upstream messages or internal request IDs in place of the BFF correlation ID.
  - [ ] Preserve `AiAskComposer` request shape, original-key retry/reconnect behavior, current incremental rendering, discard reconciliation, non-blocking consumer notices, and Vietnamese recovery copy. The browser continues to call only the Next BFF and must never receive a bearer token or private API origin.
  - [ ] Delete the domain orchestration/writer from `src/app/api/ai-ask/stream/route.ts`. After cutover, this route may only validate the BFF boundary and relay to the API; it must not import database, AI gateway, retrieval, provenance, usage, command-finalization, outbox, or Chat/Trips mutation code.
- [x] Make routing select exactly one writer and prove cutover safety (AC: 3)
  - [ ] Add a validated, capability-scoped AI Ask API cutover setting, defaulting disabled unless explicitly enabled for an allowed development/staging/production deployment. Select legacy or API transport before either transport accepts work; avoid percentage routing, request fallback after acceptance, dual streaming, dual writes, or shadow execution of commands.
  - [ ] During the enabled state, the BFF route selects only the API relay and the old legacy writer is unreachable. During disabled state, retain only the explicitly compatible rollback route until the legacy implementation is removed; it must route before admission and never replay/continue a request on the other writer.
  - [ ] Record the chosen routing owner and correlation ID only through safe telemetry. Do not log question text, assistant text, images, prompts, source material, provider bodies, credentials, cookie/session values, idempotency keys, or terminal browser payloads.
  - [ ] Do not claim deployment, private-network/probe evidence, migration-before-traffic ordering, production rollback evidence, or final repository-wide legacy retirement. Epic 14 Story 14.2 owns that external/public-launch evidence. This story proves the local selected-owner contract and retires the matching local legacy AI Ask writer for enabled scopes.
- [x] Prove API, BFF, protocol, persistence, and single-owner behavior (AC: 1-3)
  - [ ] Extend Nest integration tests with signed BFF credentials to cover bearer-only access, no CORS allow-origin response, principal owner isolation, request-ID validation/propagation, required/invalid/reused idempotency keys, multipart validation, and safe pre-stream error envelopes.
  - [ ] Add API stream tests that capture bytes, not just parsed events: assert exact newline-delimited UTF-8 bytes for `preparing`, deltas, and one terminal event; content type/cache headers; no JSON envelope after stream start; pending and terminal replay; provider failure; caller abort; fence discard; and safe terminal projection replay.
  - [ ] Add PostgreSQL-backed integration coverage through the API use case for command identity, matching-fence atomic completion, stale fence discard, provider failure/abort, and context-extraction enqueue failure. Assert each outcome retains the completed Story 10.1-10.4 invariants: no duplicate provider call/turn/assistant/provenance/usage/outbox event, and final assistant-side state is atomic or absent.
  - [ ] Add BFF relay tests for CSRF/origin rejection before credential minting, host-only session credential minting, required idempotency forwarding, correlation forwarding, exact NDJSON byte pass-through, streaming rather than buffering, caller abort propagation, local-timeout cancellation, safe pre-stream error projection, and absence of credential/cookie/private-origin leakage.
  - [ ] Add routing tests for both capability states. Assert exactly one writer is invoked per request, enabling never calls the legacy writer, disabling never calls the API writer, and no path retries a request on a second writer after acceptance or error.
  - [ ] Migrate existing route-level AI Ask regressions to the API/BFF seam rather than retaining a legacy-writer test harness. Keep composer tests focused on public BFF URL, original idempotency key reuse, byte-compatible parser behavior, transient partial-content handling, `refresh_required` reconciliation, and Vietnamese-safe recovery.
  - [ ] Run focused API/BFF/AI Ask PostgreSQL suites, then `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`. Record actual results and any blockers only after implementation.

## Dev Notes

### Non-Negotiable Architecture

- AD-16 is authoritative: Nest owns `POST /v1/ai-ask/stream`; the root Next application remains the authenticated traveler presentation/BFF. The BFF forwards correlation ID, timeout, abort, and NDJSON without changing browser UX. The stream protocol is strictly `preparing`, zero or more `delta`, then exactly one `done` or `error`; pending replay is the existing single `in_progress` protocol response.
- **Correlation compatibility decision:** the existing legacy NDJSON event union has no request-ID field, while this story's acceptance criterion requires byte-for-byte event compatibility. Therefore this cutover carries correlation only in the validated `x-request-id` request/response header and safe telemetry. Do not add a field to NDJSON objects in this story. A later versioned protocol change may explicitly add event-level request IDs after updating the browser contract.
- AD-4 and AD-37 are mandatory: browser cookies never reach Nest; the private API is bearer-only and emits no CORS authorization. BFF session validation and CSRF/origin validation occur before credential minting. API errors use only the shared safe envelope, and credentials, cookies, stack traces, SQL, provider payloads, raw evidence, and private configuration never serialize across either boundary.
- AD-6 requires an adapter-only controller and BFF route. Domain use cases own authorization, ownership, transaction scope, and mutations. A Nest controller must not directly write database state or import root Next modules.
- AD-32 requires a routing decision before either writer accepts the request. A command cannot fall back from API to legacy after admission, and no safe-read shadow mechanism may be applied to a streaming write. Rollback is routing/compatible code only, never destructive schema rollback.
- AD-34 and completed Stories 10.3/10.4 remain unchanged: context extraction is committed through the outbox after user-turn persistence; annotation/proposal events are committed with fenced terminal state; delayed/failed consumers never change a completed result. Context-extraction dispatch failure at admission must follow the existing transactional failure semantics, not be converted into a second transport-specific state.

### Current Implementation to Preserve and Move

| File | Current state | Story 10.5 action |
| --- | --- | --- |
| `src/app/api/ai-ask/stream/route.ts` | Current sole AI Ask writer: authenticates, parses multipart input, admits/replays command, streams provider, fences final assistant/provenance/usage, and publishes NDJSON. | Extract its domain execution into a runtime-neutral use case, then reduce the route to BFF auth/CSRF validation and byte relay. Do not leave a second writer here. |
| `src/features/ai/ai-ask-commands.ts` | Owns command identity/replay, captured fences, finalization, terminal projections, and consumer-status projection. | Reuse unchanged through the extracted AI use case; never reproduce command SQL in API adapter code. |
| `src/features/ai/domain-outbox.ts` and `src/features/ai/domain-outbox-worker.ts` | Own deterministic enqueue, claims, fences, retries, effects, and safe completion/failure. | Preserve; API cutover changes request transport only. |
| `src/features/ai/ai-ask-composer.tsx` | Browser posts multipart form data to `/api/ai-ask/stream`, carries the original key, and parses NDJSON incrementally. | Keep browser URL and parser contract. Only adjust safe BFF/API transport integration if necessary. |
| `src/server/bff-api-client.ts` | JSON-only private API client with caller-abort versus local-timeout distinction. | Add a narrow streaming variant; do not force NDJSON through `response.json()` or alter existing JSON callers. |
| `src/server/protected-bff-adapter.ts` | CSRF-protected JSON mutation helper. | Reuse its CSRF/correlation policy where possible, but do not force multipart streaming through JSON DTO serialization. |
| `src/server/bff-credentials.ts` | Mints short-lived web-BFF bearer credentials only after server-side host session validation. | Reuse exactly; browser code and Nest responses must never see this credential. |
| `apps/api/src/app.module.ts`, `main.ts`, `auth/resource-server.guard.ts`, `common/request-id.middleware.ts`, `safe-api-exception.filter.ts` | API platform composition, protected principal, request ID, and safe JSON errors. | Register the AI Ask controller and its narrow dependencies without weakening global guard/filter/middleware behavior. |
| `packages/contracts`, `packages/domain`, `packages/database` | Existing approved API runtime seams. | Put shared contracts/use-case/repository ports here only when required by both Next and Nest. Do not import root `src/` from `apps/api`. |

### Exact Transport Contract

| Condition | BFF/API behavior | Browser-visible result |
| --- | --- | --- |
| Valid new command | BFF validates session/CSRF then relays multipart request, key, request ID, and abort signal; Nest executes the extracted use case. | Byte-compatible NDJSON: `preparing`, zero or more `delta`, one `done`/`error`. |
| Identical pending replay | API reads existing command; no provider or mutation work. | Existing single `in_progress` NDJSON event, with safe persisted identifiers where present. |
| Identical terminal replay | API reads retained safe terminal projection; no provider or mutation work. | Exact retained terminal NDJSON event. |
| Invalid/reused key or invalid multipart body before streaming | API returns shared safe error envelope; BFF maps only safe localized response. | Existing Vietnamese-safe retry/input presentation; no command/provider side effects. |
| Provider failure or browser abort | Abort propagates where possible; existing command terminalization semantics apply. | Existing safe terminal `error`; no partial answer is represented as saved. |
| Fence mismatch/deletion | Existing fenced finalization discards command and scrubs safe metadata. | One `error` with `refresh_required`; transient partial content is cleared/reconciled. |
| Delayed/failed follow-up consumer | Outbox worker state changes only. | Completed `done` answer remains immutable; optional consumer notice remains non-blocking. |

### File Structure and Dependency Rules

- Add the API adapter under `apps/api/src/ai-ask/`; use `@xuyenviet/*` workspace imports in API code. Do not use `@/` imports from the Nest runtime unless a root path has been deliberately extracted into a workspace package.
- Keep the Next BFF route under `src/app/api/ai-ask/stream/route.ts`, BFF transport primitives under `src/server/`, and AI orchestration under an AI-owned module/package. Keep contracts and API-safe parsers in `packages/contracts`.
- Use TypeScript strict mode and existing Nest 11, Next 15, React 19, Vitest, PostgreSQL, Drizzle, and `jose` dependencies. No external queue, stream framework, generic SDK, CORS configuration, public API origin, new worker runtime, or new browser credential mechanism is justified.
- Preserve `server-only` for Next-only helpers. Shared API/domain code cannot use it, `next/*`, `next-auth`, React server-action directives, or request-runtime globals.

### Testing Requirements

Use `DATABASE_URL_TEST` for command/fence/finalization/outbox proof. The existing Vitest configuration is serial for shared database setup; use independent PostgreSQL connections only for real lock/concurrency races.

```bash
pnpm vitest run tests/api-platform-contract.test.ts tests/api-request-principal.integration.test.ts tests/bff-transport.test.ts
pnpm vitest run tests/ai-ask-commands.test.ts tests/domain-outbox.test.ts tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts
pnpm vitest run tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

- Tests must inspect raw NDJSON bytes and response headers at both API and BFF boundaries. Assert the validated `x-request-id` header propagates end-to-end and that no request-ID member is added to byte-compatible legacy NDJSON events. Parsed event assertions alone cannot prove the byte-compatibility requirement.
- Test both `AbortSignal` directions: browser cancellation reaches BFF/API/provider work, and BFF local timeout stops the API fetch without translating a caller cancellation into an internal error.
- Assert no bearer token, browser cookie, private API URL, provider detail, raw source material, prompt, image bytes, SQL, or stack text appears in browser headers/body or API safe errors.
- For all error/replay paths, assert provider-call, user-turn, assistant/provenance/usage, and outbox effects are exactly those already permitted by Stories 10.1-10.4, never duplicated by transport handling.

### Scope Boundaries

- Story 10.1 owns idempotency identity, replay, and retention. Story 10.2 owns captured fences, atomic terminal persistence, discard, and deletion scrubbing. Story 10.3 owns transactional outbox dispatch and workers. Story 10.4 owns consumer read models and immutable completed-result behavior. Reuse all four; do not redesign them.
- Story 10.5 owns only the versioned Nest stream, BFF relay, API/BFF contract tests, local capability routing, and removal/disablement of the matching legacy writer for enabled scopes.
- Epic 11 owns `TripAnswerContext v1`, source-bundle evolution, provenance withdrawal, and annotation contract changes. Epic 12 owns deployed worker scheduling, readiness, telemetry, shutdown, and schema-overlap operations. Epic 14 Story 14.2 owns deployed API service selection, private route/probe proof, migration-before-traffic, public rollback evidence, and final launch/legacy-retirement evidence.
- Do not add database schema/migrations unless a shared extracted boundary requires a compatible contract. If a durable-data or overlapping-runtime schema change is discovered, stop for AD-33 expand-migrate-contract approval rather than assuming a clean break.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Epic 10: Reliable AI Ask API Cutover`]
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 10.5: Cut AI Ask Streaming to the Versioned API`]
- [Source: `_bmad-output/implementation-artifacts/epic-10-context.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4: Identity Maps Into A Domain-Neutral Request Principal`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-6: Domain Use Cases Own Mutations, Authorization, And Audit`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-16: Nest Owns Source-Bundled NDJSON AI Ask Streaming`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-32: Capability Cutovers Have One Writer And Compatible Rollback`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-34: Durable Work Uses A PostgreSQL Transactional Outbox`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-37: API Foundation Has One Shared Platform Contract`]
- [Source: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-28.md#4.2 Replace Technical Migration Framing With Capability Cutovers`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `_bmad-output/implementation-artifacts/10-1-make-ai-ask-commands-idempotent.md`]
- [Source: `_bmad-output/implementation-artifacts/10-2-fence-terminal-ai-ask-persistence.md`]
- [Source: `_bmad-output/implementation-artifacts/10-3-dispatch-ai-ask-follow-up-work-through-a-transactional-outbox.md`]
- [Source: `_bmad-output/implementation-artifacts/10-4-preserve-completed-ai-ask-results-while-consumers-run.md`]
- [Source: `src/app/api/ai-ask/stream/route.ts`]
- [Source: `src/server/bff-api-client.ts`]
- [Source: `src/server/protected-bff-adapter.ts`]
- [Source: `src/server/bff-credentials.ts`]
- [Source: `apps/api/src/app.module.ts`]

## Story Validation

### BMad Checklist Validation

- [x] The three authoritative acceptance criteria are reproduced and mapped to contract/use-case, Nest adapter, BFF relay, routing, and test tasks.
- [x] Completed Stories 10.1-10.4 are explicitly reused and protected: idempotency/replay, fences/atomicity/deletion scrubbing, outbox durability, and immutable completed-result semantics are not reimplemented.
- [x] AD-4, AD-6, AD-16, AD-32, AD-34, and AD-37 requirements are operationalized: principal-only Nest authorization, workspace-only runtime imports, safe errors, private bearer transport, exact NDJSON relay, abort/timeout distinction, and one-writer routing.
- [x] Existing update seams are read and documented with preserved behavior and intended change: legacy route, command/outbox modules, composer, BFF client/credentials, Nest platform, and workspace packages.
- [x] Security and protocol hazards are explicit: no cookie/credential/private-origin disclosure, CSRF before minting, API no-CORS, no NDJSON reserialization/buffering, no post-stream JSON envelope, and raw-byte test proof.
- [x] The request-ID correlation decision is ratified: retain byte-compatible legacy NDJSON event objects without a request-ID member; correlate only through the validated `x-request-id` request/response header and safe telemetry.
- [x] Regression/edge coverage includes admission and terminal replay, provider failure, abort, stale fence discard, dispatch failure, owner isolation, multipart/image validation, consumer immutability, local timeout, and enabled/disabled selected-owner routing.
- [x] Scope excludes Epic 11 contract evolution, Epic 12 runtime operations, and Epic 14 deployed/public-launch evidence; no production implementation, migration, test run, or deployment claim is made.

### Validation Outcome

The product owner has ratified the correlation decision: retain byte-compatible legacy NDJSON event objects and do not add a request-ID member to them. Correlation is limited to the validated `x-request-id` request/response header and safe telemetry. The prior AD-16 event-level request-ID blocker is resolved for this legacy-compatible protocol. All story context is complete, traceable, and implementation-ready.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story context created and validated on 2026-07-29 from the full applicable Epic 10 plan/context, architecture spine, approved API-first change proposal, project context, completed Stories 10.1-10.4, current API/BFF platform seams, current legacy AI Ask writer, and recent completed-story commits.

### Completion Notes List

- Ultimate context-engine analysis completed: complete developer guide created for the protected, versioned AI Ask stream cutover.
- Validation completed before implementation: acceptance criteria, API/BFF ownership, byte-compatible NDJSON, prior-story invariants, security, one-writer routing, exact current-file seams, and PostgreSQL/API/BFF test requirements are complete and traceable. The product owner ratified header-only correlation through the validated `x-request-id` request/response header and safe telemetry; legacy NDJSON event objects remain byte-compatible without a request-ID member.
- No production code, migration, test execution, deployment, or other story artifact was modified by this story-creation workflow.
- 2026-07-29: bmad-dev-auto established the disabled-by-default capability boundary, stream contracts, protected API controller scaffold, BFF byte relay, and compatible legacy writer location. Completion is blocked before enabling the cutover: the current AI Ask execution, including its owning persistence and provider dependencies, remains root `src/` code and cannot legally be composed into Nest. Importing it from `apps/api` violates the mandatory workspace-only/No Next-runtime boundary; duplicating it violates the single persistence path requirement. A deliberate approved workspace extraction of the AI execution dependencies is required before this story can complete.
- Verified partial work: `pnpm typecheck`, `pnpm build`, and `git diff --check` passed; focused `tests/bff-transport.test.ts` passed 20 tests and `tests/api-platform-contract.test.ts` passed 2 tests. `pnpm lint` had no errors and five pre-existing warnings. `tests/ai-ask-shell.test.ts` has two pre-existing session/database setup failures and one expected stale legacy-writer-location assertion that must be migrated when the enabled API execution exists.
- 2026-07-29: Authorized bounded recovery added the runtime-neutral `@xuyenviet/domain` stream execution port and raw-byte contract tests, but could not legally compose the full execution in Nest. The sole command admission and fenced terminal transaction still bind root-only Drizzle schema, source-bundle retrieval, freshness policy, model selection/gateway, provenance, usage, and transactional-outbox owners. Re-implementing those mutations in `packages/database` would be a second persistence path and risks breaking atomic assistant/provenance/usage/outbox/fence semantics. No production extraction was claimed; `apps/api/src/main.ts` intentionally remains without an AI Ask execution composition. Recovery verification passed `pnpm typecheck`, `tests/ai-ask-stream-execution.test.ts` (2 tests), and `git diff --check`.
- 2026-07-29: The product-owner-authorized coordinated extraction completed. The transaction-owning execution closure now resides in `@xuyenviet/database`; root modules are compatibility re-exports, so Nest and the disabled Next compatibility adapter call one atomic command/finalization/provenance/usage/outbox implementation without importing root `src/` from `apps/api` or adding a package.
- 2026-07-29: Synchronous blind, edge-case, and acceptance reviews repaired API disconnect/backpressure handling, single-terminal semantics, strict multipart parsing, timeout behavior, safe telemetry, session-before-minting, and shared CSRF/origin routing. Final serial verification passed 46 API/BFF, 169 command/outbox/context, and 160 shell/protocol tests. `pnpm typecheck`, `pnpm build`, and `git diff --check` passed; lint had zero errors and five pre-existing warnings.
- 2026-07-29: Targeted Epic 10 completion-review repair completed. Disabled compatibility routing now selects before loading API-only configuration. API and BFF stream relays frame raw NDJSON records, preserve header-only correlation, suppress bytes after the first terminal event, and append exactly one safe terminal only after a complete non-terminal prefix. The BFF timeout remains active through the response body and cancels upstream work.
- 2026-07-29: Added authenticated CSRF-valid BFF-to-live-Nest PostgreSQL integration proof using the one shared execution port. It covers raw byte relay, credential/session/CSRF ordering and non-disclosure, request/replay atomicity, provider failure, caller abort, stale-fence discard, and context-extraction dispatch failure. Synchronous final blind, edge-case, and acceptance reviews found no actionable high or medium findings. Serial verification passed 47 API/BFF, 169 command/outbox/context, and 154 shell/session tests; `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. Lint had zero errors and five pre-existing warnings.
- 2026-07-29: Final permitted Epic 10 completion-review repair completed. Pending `in_progress` replays now finish as their one accepted record at both relays. The BFF relay is pull-driven, retains no per-record backlog, bounds incomplete NDJSON records to 1 MiB, and cancels safely on terminal, timeout, and framing failures. Disabled rollback CSRF configuration now shares the enabled transport's exact-origin, 32-character secret, and 60-3600 second lifetime validation. API-side incomplete frames are likewise bounded; iterator cleanup cannot leave a response open.
- Final synchronous adversarial, edge-case, and acceptance reviews found no actionable findings. Serial verification passed 47 API/BFF, 169 command/outbox/context, and 154 shell/session tests; `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm lint` had zero errors and five pre-existing warnings.

### File List

- `_bmad-output/implementation-artifacts/10-5-cut-ai-ask-streaming-to-the-versioned-api.md`
- `_bmad-output/implementation-artifacts/spec-10-5-cut-ai-ask-streaming-to-the-versioned-api.md`
- `packages/contracts/src/index.ts`
- `packages/domain/src/index.ts`
- `packages/config/src/index.ts`
- `apps/api/package.json`
- `apps/api/src/ai-ask/ai-ask.controller.ts`
- `apps/api/src/app.module.ts`
- `src/server/bff-api-client.ts`
- `src/app/api/ai-ask/stream/route.ts`
- `src/features/ai/legacy-ai-ask-stream-writer.ts`
- `tests/ai-ask-stream-execution.test.ts`
- `packages/database/src/ai-ask-stream-execution.ts`
- `packages/database/src/ai-ask-commands.ts`
- `packages/database/src/source-bundle.ts`
- `packages/database/src/schema.ts`
- `tests/ai-ask-api-adapter.test.ts`
- `tests/ai-ask-bff-routing.test.ts`
- `tests/ai-ask-stream-contract.test.ts`
- `tests/ai-ask-bff-api.integration.test.ts`

### Review Findings

- [x] [Review][Patch] Disabled compatibility routing requires API-only configuration — repaired by selecting the capability owner and validating shared CSRF before loading `getBffTransportConfig`; disabled routing has no private API URL dependency.
- [x] [Review][Patch] BFF stream timeout ends after upstream headers — repaired with stream-lifetime cancellation, raw-frame-safe terminal recovery, and upstream reader cancellation.
- [x] [Review][Patch] Started API stream can end without a terminal NDJSON event — repaired with complete-frame forwarding, exactly-one root-terminal detection, post-terminal suppression, and canonical safe recovery for incomplete/failed streams.
- [x] [Review][Patch] Required enabled-path API/BFF integration proof is absent — repaired with authenticated CSRF-valid BFF-to-Nest PostgreSQL integration covering raw bytes, correlation, ordering/non-disclosure, abort, provider failure, stale fence, dispatch failure, persistence, and replay invariants.
- [x] [Review][Patch] Pending idempotency replay is terminalized as a stream failure [apps/api/src/ai-ask/ai-ask.controller.ts; src/server/bff-api-client.ts] — repaired by accepting a complete root `in_progress` record as the single replay result, closing/cancelling safely without a synthetic error, with API/BFF regressions.
- [x] [Review][Patch] BFF relay drains upstream without downstream backpressure [src/server/bff-api-client.ts] — repaired with a `pull()`-driven zero-high-water-mark relay, raw coalesced-byte forwarding, 1 MiB incomplete-record bounds, and slow-reader coverage.
- [x] [Review][Patch] Disabled rollback path accepts CSRF values rejected by enabled transport [packages/config/src/index.ts] — repaired by sharing exact-origin, 32-character signing-secret, and 60-3600-second lifetime validation with enabled BFF transport configuration.
