# AD-39 Technology And Brownfield Reality Review

**Reviewed:** 2026-08-12
**Target:** AD-39 and its scoped-context clarification projection across the Spine, solution design, contracts, fixtures, and release gates
**Lens:** Feasibility in the existing modular-monolith/PostgreSQL/direct-API AI Ask flow; unnecessary runtime/config expansion; persistence, idempotency, and model-call alignment with current code
**Verdict:** **CHANGES REQUIRED.** AD-39 is feasible inside the existing NestJS API, PostgreSQL data plane, AI Gateway adapter/model catalog, and shared contracts. It does not require a new service, queue, continuous Worker loop, or environment flag. However, two load-bearing integration semantics are still undefined against the current AI Ask command path: the existing asynchronous context-extraction outbox overlaps the new synchronous preflight, and a clarification-only turn has no authoritative terminal persistence/finalization contract. Two additional fencing/failure details should be tightened before readiness.

The deterministic Spine lint passes with zero findings. Findings below are semantic brownfield-integration issues.

## Findings

### [HIGH] CLAR-TECH-01 — The synchronous preflight conflicts with the current unconditional background context-extraction path

**Architecture target**

- AD-39 assigns AI Orchestration a versioned structured extraction call for each new traveler message and blocks Retrieval/main synthesis until the dependent deliverable is ready (`ARCHITECTURE-SPINE.md:705-719`).
- The solution design correctly says clarification is not a universal call and not an autonomous loop; it occurs once per new traveler message for a profiled intent (`retrieval-trip-aware-solution-design.md:94-102`).

**Brownfield reality**

- `acquireAiAskCommand(...)` currently inserts every user message and unconditionally enqueues `ai_ask.context_extraction.v1` in the existing domain outbox (`packages/database/src/ai-ask-commands.ts:130-149`).
- That event is consumed asynchronously by the current Worker and performs a separate extraction-model call which writes chat/trip context and usage (`packages/worker-domain/src/features/chat-trips/context-extraction.ts`).
- The current request path immediately selects the streaming answer model, assembles Retrieval/web context, and calls main answer synthesis (`packages/database/src/ai-ask-stream-execution.ts:43-74`, `:158-193`). The asynchronous outbox cannot act as AD-39's pre-answer gate without introducing polling or request/Worker coupling.

**Risk**

If AD-39 is added literally, one traveler message can cause both synchronous planning-clarification extraction and asynchronous chat-context extraction. They have different schemas, ownership, timing, and readiness effects. This creates duplicate model cost and leaves independently implemented stories free to let the later Worker result overwrite, contradict, or unexpectedly influence the next clarification turn. Reusing the Worker as the gate would instead add avoidable latency and distributed coordination to a request path that already has a synchronous AI Gateway adapter.

**Required architecture correction**

Bind the coexistence/retirement rule explicitly:

1. AD-39 preflight executes synchronously in the existing API/AI Orchestration path using the existing extraction-purpose model catalog and AI Gateway adapter; it does not wait on or poll a Worker.
2. Define whether `ai_ask.context_extraction.v1` is suppressed for a profiled clarification turn, consumes only a post-terminal projection, or remains a non-authoritative independent enrichment. It must never mark clarification readiness, mutate clarification field state, or become a second source for the same scoped value.
3. Ensure at most one planning-preflight extraction call per `(AI Ask command, user message, clarification-session revision, prompt version)` fence. Retry reuses its persisted outcome rather than creating a second semantic extraction.

No new service, queue, Worker loop, or environment configuration is justified.

### [HIGH] CLAR-TECH-02 — A blocked clarification turn has no terminal message/command transaction contract

**Architecture target**

- AD-39 says a blocked instance returns acknowledgement/safe guidance plus a concise clarification and does not begin Retrieval or main answer synthesis (`ARCHITECTURE-SPINE.md:715`).
- AD-36 defines `prepareAiAnswerRun(...)` and `finalizeAiAnswer(...)` for a fully prepared answer: Retrieval owns/seals a run, Chat/Trips inserts the assistant message, Usage appends an event, and AI Orchestration writes prompt/provenance (`ARCHITECTURE-SPINE.md:663-675`; `retrieval-trip-aware/contracts.md:348`).

**Brownfield reality**

- Every admitted command currently persists its user message before generation and must finish as a replayable terminal `done` or `error` projection (`packages/database/src/ai-ask-commands.ts:15-49`, `:130-149`).
- Successful `done` finalization inserts an assistant message, provenance/context snapshot, usage, and the command terminal result in a fenced transaction (`packages/database/src/ai-ask-stream-execution.ts:267-329`).
- The browser protocol has no separate durable clarification terminal type; a clarification rendered only as transient stream deltas would disappear on refresh and would not exist in conversation history for the next natural-language reply (`packages/contracts/src/index.ts:594-607`).

**Risk**

The current documents permit incompatible implementations:

- create a fake Retrieval run/provenance record for a turn where Retrieval is forbidden;
- persist the session but emit the clarification only ephemerally;
- store an assistant clarification but leave the AI Ask command pending/error;
- treat the extraction call as the usage/provenance of a main answer.

Any of these breaks replay, conversation history, auditability, or the intended “no main synthesis while blocked” invariant.

**Required architecture correction**

Define a distinct clarification-terminal workflow inside the existing AI Ask command boundary. In one fenced PostgreSQL transaction it should:

- compare-and-swap the expected command/session/message/profile/Trip fences;
- persist the updated clarification session and validated field states;
- insert a bounded assistant clarification message through Chat/Trips;
- append the extraction usage success/failure event when a model call occurred;
- terminalize the AI Ask command with a normal replayable success projection;
- create no Retrieval run, selection manifest, prompt-render manifest, answer provenance, web call, or main-answer usage.

The existing NDJSON `done` shape can carry the persisted clarification assistant message; no new endpoint or protocol family is necessary. A later traveler reply is a new AI Ask command and advances the same fenced session.

### [MEDIUM] CLAR-TECH-03 — `conversationRevision` is not grounded in an existing authoritative revision

The contract fences a session with `conversationRevision: number` plus `currentMessageId` (`retrieval-trip-aware/contracts.md:58-77`), and AD-39 names a conversation revision (`ARCHITECTURE-SPINE.md:719`). Current `conversations.lifecycle_version` is a lifecycle/deletion fence, not a monotonic message/content revision; AI Ask message insertion updates only `updated_at` (`packages/database/src/schema.ts:1124-1156`; `packages/database/src/ai-ask-commands.ts:130-136`). The only nearby revision/fingerprint mechanism belongs specifically to Trip recommendation decisions and is not conversation authority.

Before implementation, choose and bind one repository-real fence:

- add a Chat/Trips-owned monotonic content revision incremented atomically with every message insertion/deletion affecting clarification; or
- replace `conversationRevision` with an immutable ordered-message watermark/digest plus lifecycle version.

Do not infer concurrency from `updated_at`, message count, or the unrelated Trip-recommendation revision. Add the chosen migration/current-code delta to the implementation-delta matrix.

### [MEDIUM] CLAR-TECH-04 — Extraction model absence/failure and call accounting are not executable fixtures

The existing stack already supports an `extraction` model purpose, extraction capability flags, a non-streaming gateway completion, and AI usage events. AD-39 therefore needs no new provider/configuration surface. But the documents do not state what happens when no eligible extraction model exists, the gateway fails, the structured response is invalid, or a retry encounters an already persisted extraction result.

Main synthesis must not start merely because preflight infrastructure failed. Define a fail-closed outcome that preserves the user message and session, returns a persisted safe clarification/retry message where deterministically possible, records the extraction failure usage, and does not silently substitute the streaming answer model. Add fixtures/gate cases for:

- no eligible extraction model;
- gateway timeout/invalid schema;
- duplicate/replayed command;
- failure after extraction but before clarification terminalization;
- confirmation that blocked turns make no Retrieval, web, or main-answer model call.

## Feasibility And Simplicity Assessment

AD-39 fits the current architecture with a focused extension:

- **Runtime:** existing NestJS API and AI Orchestration request flow;
- **Persistence:** new PostgreSQL clarification session/field-state rows plus a small Chat/Trips conversation fence;
- **Model access:** existing AI Gateway non-streaming extraction call and model catalog `extraction` purpose;
- **Response:** existing AI Ask NDJSON stream and terminal replay machinery;
- **Deletion:** existing owner-scoped conversation/Trip deletion coordinator;
- **Testing:** unit tests for the pure profile evaluator and PostgreSQL integration tests for session/idempotency/finalization.

It does **not** justify a new deployable service, new queue, new continuous Worker loop, dedicated cache, external state store, or new environment flag. The existing outbox worker should not be turned into a synchronous prerequisite.

## Positive Observations

- Ownership is well separated: Retrieval owns immutable context profiles/pure completeness rules; AI Orchestration owns extraction/session coordination; Chat/Trips retains durable Trip mutation authority.
- The design correctly rejects autonomous model loops: each extraction cycle requires a new traveler message.
- Scoped values prevent journey/destination/transit preference leakage and are supported by explicit CLAR fixtures.
- Bounded-assumption mode is profile-controlled and traveler-visible rather than a model-selected silent default.
- Deletion and Trip/proposal fencing are included rather than deferred to implementation.

## Counts

- **Critical:** 0
- **High:** 2
- **Medium:** 2
- **Low:** 0

## Gate Recommendation

Do not pass the AD-39 architecture delta into implementation readiness until CLAR-TECH-01 and CLAR-TECH-02 are resolved in the Spine/contracts. CLAR-TECH-03 and CLAR-TECH-04 should be resolved in the companion contracts/fixtures and carried into G0/G2 evidence.
