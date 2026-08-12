# AD-39 Technology And Brownfield Reality Closure Review

**Reviewed:** 2026-08-12
**Prior findings:** CLAR-TECH-01 through CLAR-TECH-04 in `review-technology-clarification-final.md`
**Verdict:** **PASS.** All prior technology/brownfield findings are resolved in the Spine and progressive companions. The clarified design fits the existing modular-monolith, PostgreSQL, direct NestJS API, AI Gateway adapter/model catalog, AI Ask command, and NDJSON replay boundaries. It adds no new service, queue, continuous Worker loop, cache, model-catalog purpose, environment flag, or external state store.

The deterministic Spine lint passes with zero findings.

## Closure Verification

### CLAR-TECH-01 — Closed: synchronous preflight and background outbox coexistence

- AD-39 now requires profiled turns to use the existing synchronous API/AI Gateway path with versioned `clarification_plan` and `clarification_extract` stages under the existing `extraction` model purpose (`ARCHITECTURE-SPINE.md:725`).
- Profiled turns explicitly suppress `ai_ask.context_extraction.v1`; the existing asynchronous extractor remains only for unprofiled non-authoritative enrichment and cannot change clarification readiness or the same scoped values (`ARCHITECTURE-SPINE.md:721`).
- One semantic attempt per command/message/session revision/prompt version is persisted and replayed rather than duplicated (`ARCHITECTURE-SPINE.md:725`; `retrieval-trip-aware/contracts.md:246`).
- The implementation-delta matrix records the required current-code change, and CLAR-20 makes coexistence executable (`retrieval-trip-aware-solution-design.md:30`; `retrieval-trip-aware/fixtures.md:48`).

This avoids request/Worker polling and duplicate semantic extraction while preserving the existing Worker for unrelated enrichment.

### CLAR-TECH-02 — Closed: durable clarification terminal

- `finalizeClarificationTurn(...)` is now a distinct terminal workflow for blocked turns, not a fake main-answer path (`ARCHITECTURE-SPINE.md:721`; `retrieval-trip-aware/contracts.md:252`).
- One PostgreSQL transaction revalidates command/session/content/profile/scope/Trip fences, invokes Chat/Trips session reduction, inserts the assistant clarification message, appends extraction Usage, and completes the existing AI Ask command with replayable success.
- The contract explicitly forbids Retrieval runs, web calls, selection/prompt-render manifests, answer provenance, and main-answer usage for that turn.
- CLAR-16 verifies the exact persisted outcome and absence of forbidden artifacts (`retrieval-trip-aware/fixtures.md:44`).

The existing AI Ask command and NDJSON `done` boundary are sufficient; no endpoint or protocol family is added.

### CLAR-TECH-03 — Closed: real conversation content fence

- Chat/Trips now owns a monotonic conversation content revision incremented with every relevant message insert/delete; timestamps and message counts are explicitly forbidden as fences (`ARCHITECTURE-SPINE.md:719`).
- The persisted session and reducer command carry `conversationContentRevision` / `expectedConversationContentRevision` (`retrieval-trip-aware/contracts.md:174-231`).
- The implementation-delta matrix identifies the required migration from the current lifecycle-version/timestamp model (`retrieval-trip-aware-solution-design.md:31`).
- CAS, duplicate, stale, and out-of-order behavior is exercised by CLAR-14 and stale answer finalization by CLAR-15 (`retrieval-trip-aware/fixtures.md:42-43`).

The fence is now grounded in a concrete Chat/Trips-owned repository change rather than reusing lifecycle version or an unrelated recommendation revision.

### CLAR-TECH-04 — Closed: model failure and accounting semantics

- AD-39 reuses the existing extraction model purpose and synchronous gateway adapter and explicitly prohibits fallback to Retrieval, web, the streaming answer model, or an unrecorded assumption (`ARCHITECTURE-SPINE.md:725`).
- Missing model, timeout, invalid schema, and failure before terminalization preserve the user/session state, record failure Usage, and persist safe retry guidance where possible.
- The clarification finalizer owns successful extraction Usage; retries reuse the persisted semantic attempt (`retrieval-trip-aware/contracts.md:246-252`).
- CLAR-17 covers no-model, timeout, invalid-schema, retry, no streaming-answer substitution, failure Usage, and duplicate-call prevention (`retrieval-trip-aware/fixtures.md:45`).
- G2 requires clarification terminal, synchronous suppression, failure, CAS, stale-answer, evidence, and assumption-disclosure fixtures to pass (`retrieval-trip-aware/evaluation-and-release-gates.md:137`).

## Feasibility And Runtime Scope

The repaired design requires only bounded changes to current units:

- NestJS/direct API orchestration order changes so profiled preflight occurs before Retrieval and answer-model selection;
- PostgreSQL gains Chat/Trips-owned clarification records and monotonic conversation content revision;
- existing shared contracts gain session, attempt, scope, reducer, claim, and finalization shapes;
- existing non-streaming AI Gateway extraction and Usage paths are reused;
- current AI Ask command idempotency/replay and NDJSON terminal response are reused;
- current owner-scoped conversation/Trip deletion coordination is extended to clarification rows.

No additional deployable or operational component is needed or authorized.

## Counts

- **Critical:** 0
- **High:** 0
- **Medium:** 0
- **Low:** 0

## Gate Recommendation

The AD-39 clarification/scoped-context architecture delta may proceed to cross-artifact implementation-readiness review. Implementation readiness must still confirm that stories/migrations/tests explicitly schedule the delta matrix and CLAR-14 through CLAR-20 evidence; this is downstream delivery planning, not a remaining architecture-reality defect.
