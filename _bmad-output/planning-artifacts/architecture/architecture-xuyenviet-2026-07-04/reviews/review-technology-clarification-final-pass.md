# AD-39 Technology And Brownfield Final Regression Review

**Reviewed:** 2026-08-12  
**Scope:** Chat/Trips initialization/evolution commands, structural policy caps, mixed-instance parent aggregation, and traveler-derived deletion  
**Verdict:** **PASS.** The final AD-39 clarification delta remains feasible inside the existing modular monolith, NestJS API request path, shared PostgreSQL data plane, AI Gateway extraction capability, AI Ask command finalizer, and owner-scoped deletion transactions. The additions do not require or authorize a new deployable service, queue, continuous Worker loop, cache, model purpose, environment variable, or external state store. No new Critical, High, or Medium technology/brownfield issue was found.

The deterministic Spine lint passes with zero findings.

## Regression Verification

### 1. Chat/Trips initialization and evolution fit the current transaction model

- AD-39 keeps reusable profiles, structural policy, and pure validation in Retrieval while assigning traveler-instantiated graph/session persistence exclusively to Chat/Trips (`ARCHITECTURE-SPINE.md:711-713`).
- `initializeClarificationSession(...)` and `evolveClarificationPlan(...)` accept owner/conversation fences, persist the validated graph and instances atomically, and are idempotent by plan attempt (`retrieval-trip-aware/contracts.md:141-157,298`). They are module owner ports, not new network services.
- This matches current repository patterns: the database package already exposes transaction-aware Trip/Chat command boundaries, locks owner aggregates with PostgreSQL `FOR UPDATE`, applies expected-version checks, and composes internal commands in a shared transaction (`packages/database/src/trip-plan-commands.ts`; `packages/database/src/traveler-proposal-commands.ts`; `packages/database/src/ai-ask-commands.ts`).
- `CLAR-26` covers retry and partial-failure behavior, including the absence of orphan graphs or partially visible descendants (`retrieval-trip-aware/fixtures.md:54`).

The required implementation is a bounded schema/repository migration plus owner-port wiring in the existing packages. It does not imply a new runtime boundary.

### 2. Structural policy caps are deterministic data validation

- `ClarificationPlanPolicy` pins maximum deliverable instances, scope nodes, graph depth, parents per node, values per field, and canonical-reference/task-identity lengths (`retrieval-trip-aware/contracts.md:75-92`).
- Retrieval rejects cycles, duplicates, orphan parents, unknown profile shapes, and over-policy proposals before Chat/Trips persistence (`ARCHITECTURE-SPINE.md:711-713`; `retrieval-trip-aware/contracts.md:298`).
- The policy version is carried through validated graph/session/claim/evaluation evidence, so the checks are replayable and do not depend on deployment configuration.
- `CLAR-23` verifies over-limit and malformed proposals and deterministic retry identity (`retrieval-trip-aware/fixtures.md:51`).

These checks are bounded TypeScript/domain validation plus PostgreSQL constraints where appropriate. No service, worker, cache, or dynamic configuration plane is justified.

### 3. Parent-session aggregation stays inside the answer finalization transaction

- AD-39 defines that completing an answer affects only the exact claimed instances and recomputes the parent session in the same PostgreSQL transaction (`ARCHITECTURE-SPINE.md:723`).
- The parent remains `active` while any child is `collecting | ready | claimed`, becomes `completed` only when every child is `completed | abandoned`, and becomes `superseded` only on intent replacement (`retrieval-trip-aware/contracts.md:300-302`).
- Disjoint simultaneous claims remain compare-and-swap fenced; overlapping or duplicate claims cannot mutate the aggregate (`retrieval-trip-aware-solution-design.md:108`; `retrieval-trip-aware/fixtures.md:52-53`).

This is a deterministic aggregate reducer/finalizer extension to the current AI Ask PostgreSQL finalization pattern, not a background coordinator or distributed workflow.

### 4. Traveler-derived deletion extends the existing deletion coordinator

- Reusable profile/policy templates contain no traveler data, while instantiated graph revisions, validated plan results, plan/extract attempts and payloads, target/task digests, sessions, values, evidence, assumptions, and claims are explicitly reconstructable owner-derived content (`ARCHITECTURE-SPINE.md:725`; `retrieval-trip-aware/contracts.md:720-730`).
- Those records follow the owning conversation or Trip deletion lifecycle; `CLAR-27` exercises deletion during plan creation and after partial mixed-instance completion (`retrieval-trip-aware/fixtures.md:55`).
- Current code already deletes a Trip and all linked conversations in one PostgreSQL transaction after locking the owner rows and invalidating dependent AI Ask/recommendation records (`packages/database/src/index.ts:201-258`). Extending the exported invalidator set for clarification rows preserves that topology and atomic user-visible success contract.

No retention service, deletion worker, scheduled cleanup loop, or new configuration is introduced.

## Existing Runtime And Configuration Check

The clarification path continues to use:

- the existing NestJS/direct API AI Ask execution path;
- the existing synchronous AI Gateway adapter and the existing `extraction` model purpose;
- the existing PostgreSQL transaction and command-idempotency patterns;
- the existing AI Ask command terminal/replay shape and Usage owner port;
- the existing Worker only for unprofiled asynchronous enrichment, with profiled turns suppressing the overlapping outbox event.

AD-39 explicitly prohibits a new service, queue, Worker loop, cache, model-catalog purpose, or environment flag (`ARCHITECTURE-SPINE.md:725`). The solution-design delta likewise adds no microservice, queue, worker workload, or environment flag (`retrieval-trip-aware-solution-design.md:23`). No application, package, lockfile, deployment manifest, or environment-config change is present in the current planning-artifact update.

## Counts

- **Critical:** 0
- **High:** 0
- **Medium:** 0
- **Low:** 0

## Gate Recommendation

The technology/brownfield regression gate remains **PASS**. Cross-artifact implementation readiness may proceed, provided the epics/stories schedule the required Chat/Trips migrations, owner-port implementations, deletion invalidators, and `CLAR-23` through `CLAR-27` tests. Those are implementation-planning obligations, not unresolved architecture technology defects.
