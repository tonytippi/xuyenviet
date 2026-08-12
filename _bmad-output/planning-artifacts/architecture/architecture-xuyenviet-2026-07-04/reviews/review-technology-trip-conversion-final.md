# AD-40 Technology And Brownfield Closure Review

**Reviewed:** 2026-08-12  
**Prior findings:** TC-TECH-01 and TC-TECH-02 in `review-technology-trip-conversion.md`  
**Verdict:** **PASS.** Both prior technology/brownfield findings are closed in the latest Spine and progressive companions. AD-40 remains a bounded evolution of the existing modular monolith, PostgreSQL data plane, Chat/Trips recommendation aggregate, AI Ask finalizers, traveler command endpoint, shared contracts, and web composer. It introduces no service, queue, Worker loop, cache, external dependency, environment flag, or reverse package dependency.

The deterministic Spine lint passes with zero findings.

## Closure Verification

### TC-TECH-01 — Closed: profiled opportunity refresh no longer depends on the suppressed background extractor

- AD-40 now binds profiled opportunity refresh to the existing synchronous API terminalization path. After clarification reduction or an answer claim terminalizes, the finalization flow invokes the transaction-aware Chat/Trips `refreshTripConversionOpportunity(...)` owner port before returning the current recommendation projection (`ARCHITECTURE-SPINE.md:743`).
- The rule explicitly says that profiled eligibility, pending-turn projection, accept, and dismiss read canonical clarification claims/conversion projection and never consult or wait for `ai_ask.context_extraction.v1` or legacy flat `chat_context`. The background path is retained only as explicit compatibility for unprofiled legacy recommendations.
- The solution design records the actual brownfield delta: the current `decisionId` flow waits for completed background extraction and reads `chat_context`; the target profiled flow refreshes from canonical claims through AI Ask finalizers (`retrieval-trip-aware-solution-design.md:33,128-130`).
- The cross-client pending-turn contract is server-authoritative: `visible_disabled` is projected while a newer turn is unterminated and accept independently rejects that state (`retrieval-trip-aware/contracts.md:379-457`; `retrieval-trip-aware/fixtures.md:150,155`).

This closes the contradiction with AD-39 without adding an asynchronous readiness authority or new Worker workload.

### TC-TECH-02 — Closed: concrete migration ownership and dependency direction are assigned

The solution design now contains a conversion migration ownership matrix that binds every required brownfield slice (`retrieval-trip-aware-solution-design.md:132-140`):

- Chat/Trips database migrations own opportunity/version/current-manifest uniqueness, canonical projection revisions, immutable typed manifests/digests, dismiss and success replay, destination tombstones, proposal identity/FKs, and conversation content revision.
- A shared Chat/Trips/domain contract owns the closed proposal-operation union, parser, canonical serializer, and validator used by both API/database accept and Worker proposal drafting. It explicitly forbids duplicated validation and forbids API/database code from importing Worker-domain internals.
- Shared contracts own the wire migration from `decisionId` to stable `opportunityId`, visible-disabled projection, and success `proposalId`.
- The existing traveler controller/OpenAPI route is adapted in place; no parallel endpoint is introduced.
- The existing direct client/recommendation panel/composer owns the stable CTA, server-owned disabled state, and recommendation refetch after each AI Ask terminal event.

This is compatible with the current package graph: `@xuyenviet/domain` depends only on `@xuyenviet/contracts`; `@xuyenviet/database` depends on domain/contracts; `@xuyenviet/worker-domain` depends on database/domain/contracts. Moving the closed proposal contract to the lower shared domain/contracts layer lets database and Worker consume it without a domain-to-database or database-to-Worker reverse dependency. No new workspace package or third-party dependency is required.

## Brownfield Fit Confirmation

- The existing `acceptTripCreationRecommendation(...)` command, advisory transaction lock, idempotency replay table, owner-bound recommendation rows, and `resolveOwnedPrimaryConversationInTransaction(...)` remain the implementation base.
- The current pending Trip Change Proposal aggregate and owner-confirmed Apply path remain the sole route from proposed conversion operations to applied Trip state.
- AD-40 adds schema/repository/contract/UI migrations inside current units; it does not introduce a separate conversion aggregate service, network boundary, queue, or deployment process.
- `TripConversionProjectionPolicy` is a finite versioned code-shipped catalog, not runtime/admin/environment configuration (`retrieval-trip-aware/contracts.md:449`).
- No application/package manifest, lockfile, deploy manifest, or environment configuration change is present in the planning-artifact update.

## Counts

- **Critical:** 0
- **High:** 0
- **Medium:** 0
- **Low:** 0

## Gate Recommendation

The AD-40 technology/brownfield gate is **PASS** and may proceed to cross-artifact implementation-readiness review. Downstream stories must schedule the migration-ownership matrix and TC-01 through TC-18 fixtures, but no architecture technology defect remains.
