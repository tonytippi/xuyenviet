# Epic 10 Context: Reliable AI Ask API Cutover

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Move AI Ask to a BFF-forwarded, versioned API path that safely tolerates retries, disconnects, concurrent planning changes, and delayed background work. The cutover must preserve the responsive NDJSON chat experience while ensuring a request has one transport writer, cannot repeat provider work or persist duplicate messages, and can save a final answer only while the selected conversation and Trip Project remain valid. Follow-up enrichment must be durable but must never make an already completed answer fail or change its terminal result.

## Stories

- Story 10.1: Make AI Ask Commands Idempotent
- Story 10.2: Fence Terminal AI Ask Persistence
- Story 10.3: Dispatch AI Ask Follow-Up Work Through a Transactional Outbox
- Story 10.4: Preserve Completed AI Ask Results While Consumers Run
- Story 10.5: Cut AI Ask Streaming to the Versioned API

## Requirements & Constraints

- Each migrated AI Ask capability must route a request to exactly one transport owner. Do not dual-write user messages, assistant messages, provenance, usage, trip state, or knowledge state; the matching legacy Next.js writer must stop accepting a cut-over scope.
- AI Ask streaming must use protected `POST /v1/ai-ask/stream` through the BFF. Preserve the byte-stable NDJSON sequence: `preparing`, zero or more `delta`, then exactly one `done` or `error`.
- The BFF forwards correlation ID, timeout, abort, and NDJSON without exposing its protected credential to the browser. On browser abort, stop provider work when possible. Provider failure, abort, or follow-up dispatch failure must leave terminal assistant content, provenance, and usage either atomically persisted or absent.
- Require a 16-128 character URL-safe ASCII `Idempotency-Key`. The same owner, scope, and key may represent only one normalized request digest. A changed digest fails safely before a turn is persisted or a provider is called; an identical pending or terminal command returns persisted state without duplicate provider work, turns, messages, or provenance. Retain keys and terminal command metadata for 24 hours.
- Persist the final answer only while captured ownership fences remain current. A stale conversation or Trip Project must produce a safe `refresh_required` terminal error and a `discarded` command, with no visible assistant response, provenance, successful usage event, annotation, or proposal.
- Background context extraction, annotation enrichment, and proposal drafting are durable follow-up work. Their delay, retry, fence rejection, or terminal failure cannot change a completed AI Ask command or final assistant/provenance/usage result. Read models expose only relevant pending or safe failed consumer status.
- Maintain safe, correlated telemetry for API, BFF, worker, and provider operations. Liveness/readiness and full worker deployment proof are owned by later runtime/launch work; this epic preserves the protocols needed for those operations.

## Technical Decisions

- Nest owns the versioned AI Ask stream; Next.js remains the traveler presentation/BFF runtime. Protected API requests use the established domain-neutral principal and safe API contract rather than Next.js session serialization as API authorization.
- AI Orchestration owns `ai_ask_commands`. Uniqueness is `(user_id, scope_kind, scope_id, idempotency_key)` for an existing conversation or selected Trip Project. New unscoped conversations receive a command-generated scope only after command creation. Store normalized question, attachment metadata, selected-scope SHA-256 digest, status, message references, terminal result, captured fences, expiry, and source-bundle reference where created.
- Lock owner-scoped conversation and selected Trip Project during command creation. Capture conversation `lifecycle_version` and, when applicable, Trip Project `aggregate_version` before persisting the user turn. Deletion, project link or primary-conversation changes, and changes affecting TripAnswerContext increment the relevant fence.
- Finalization uses one transaction to recheck the exact captured fences and write final assistant content, retrieval decision, provenance, usage, and source-bundle snapshot. Stream tokens are transient client state and never imply a saved answer.
- Durable work uses PostgreSQL `domain_outbox`, written in the originating domain transaction. Rows contain a versioned event type, aggregate/resource ID, expected owner fence, deterministic unique dedupe key, safe bounded payload, status, attempt and availability data, lease/fencing state, and safe terminal failure code.
- Workers claim outbox rows with `FOR UPDATE SKIP LOCKED`, lease expiry, fencing tokens, and compare-and-swap acknowledgement. Validate the expected owner fence before every write, make consumers idempotent by dedupe key, use bounded exponential backoff, and record alertable safe terminal failures. No fire-and-forget callback, `after()` callback, or replay path may bypass the owning domain command.
- Enqueue context extraction only after the user turn persists, annotation enrichment only after terminal assistant/provenance persistence, and proposal drafting only after terminal assistant persistence. Proposal drafting validates the same or newer Trip Project aggregate fence before attaching output.

## UX & Interaction Patterns

- Preserve the existing responsive AI Ask experience: incremental text is visibly pending, reconciles to the persisted final answer, and is announced through `aria-live`. Do not present partial content as a saved answer when streaming fails or finalization is discarded.
- On an ambiguous disconnect or reconnect, reuse the original idempotency key and restore the persisted in-progress or terminal command state rather than submitting another request. Reconcile the URL-owned server shell with that state.
- For `refresh_required`, remove the pending-partial treatment and show the Vietnamese recovery copy: `Kế hoạch hoặc cuộc trò chuyện đã thay đổi. Hãy làm mới rồi hỏi lại.` Do not expose provider, token, SQL, or transport internals.
- Keep the user draft on provider failure and offer safe retry. Post-answer consumer work may show non-blocking pending or safe failed status; it must not restate the completed answer as failed.

## Cross-Story Dependencies

- Epic 9 provides the protected `/v1` API, BFF credential/principal validation, safe error contract, and first capability cutover primitives consumed by this epic.
- Stories 10.1 and 10.2 establish command identity and finalization safety that Story 10.5 transports through the API/BFF path. Stories 10.3 and 10.4 establish the durable dispatch and read-state behavior required after terminal persistence.
- Epic 11 consumes the resulting API cutover for canonical TripAnswerContext, source-bundle, provenance-withdrawal, and annotation behavior. Its structured planning context is not implemented by this epic.
- Epic 14 owns deployed selected-owner verification, migration ordering, rollback, and final legacy-retirement evidence; this epic proves local/API contract, integration, NDJSON protocol, and no-divergent-writer behavior for the AI Ask capability.
