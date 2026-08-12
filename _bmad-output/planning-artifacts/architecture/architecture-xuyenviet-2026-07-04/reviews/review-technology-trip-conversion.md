# AD-40 Technology And Brownfield Reality Review

**Reviewed:** 2026-08-12
**Verdict:** **CHANGES REQUIRED.** AD-40 is deployable within the current modular monolith, NestJS API, PostgreSQL data plane, direct traveler API, and web composer. Reusing the recommendation owner ports, current advisory-lock/idempotency pattern, primary-conversation helper, and pending Trip Change Proposal boundary is the minimal fit; no service, queue, Worker loop, cache, model purpose, or environment flag is justified. The latest clarification closes stale-manifest, assumption-only, projection-policy, lifecycle/CAS, payload-integrity, and cross-client pending-turn seams. Two brownfield integration/migration ownership gaps remain before implementation readiness.

The deterministic Spine lint passes with zero findings.

## Findings

### HIGH — TC-TECH-01: The profiled conversion read/refresh path is not explicitly detached from the background outbox that AD-39 suppresses

**Brownfield evidence**

The current `loadRecommendations(...)` and `currentDecision(...)` functions refuse to expose or accept a creation decision unless the latest `ai_ask.context_extraction.v1` outbox row is `completed`. They then build the context revision from the legacy flat `chat_context` rows (`packages/database/src/trip-recommendations.ts:98-129`). AD-39 deliberately suppresses that same outbox event for profiled turns and makes synchronous clarification claims/values the readiness authority (`ARCHITECTURE-SPINE.md:721,725`; `retrieval-trip-aware-solution-design.md:30,115`). Therefore a literal extension of the existing repository leaves profiled AD-40 opportunities permanently absent: the current reader sees no completed outbox event and returns `none`.

The repaired AD-40 contract correctly defines canonical claim aggregation, `refreshTripConversionOpportunity(...)`, terminal AI Ask watermark, visible-disabled projection, and click-time rejection (`ARCHITECTURE-SPINE.md:735-741`; `retrieval-trip-aware/contracts.md:306-457`). What remains unstated is the production trigger/writer seam that replaces today's `loadRecommendations -> completed outbox -> refreshContext(chat_context)` behavior.

**Required tightening**

Bind the profiled path to an existing API transaction boundary: after a profiled AI Ask turn terminalizes and its Chat/Trips clarification reduction/answer claim is committed, that same finalization flow invokes the Chat/Trips `refreshTripConversionOpportunity(...)` owner port (or writes an explicit same-transaction dirty marker consumed on the next owner-scoped read). State plainly that profiled opportunity eligibility, refresh, pending-turn projection, accept, and dismiss do **not** consult `ai_ask.context_extraction.v1` or legacy `chat_context`; unprofiled legacy recommendations may retain that path during migration. This uses no new Worker and prevents a suppressed background event from becoming an accidental prerequisite.

### MEDIUM — TC-TECH-02: The implementation-delta matrix does not assign the concrete schema/validator/API migration slices required by the upgraded aggregate

**Brownfield evidence**

The current recommendation persistence is materially smaller than AD-40:

- `trip_recommendation_contexts` stores only revision/fingerprint;
- `trip_recommendation_decisions` stores `creation | context`, one context revision/fingerprint, optional candidate Trip, and `open | consumed | declined | private`;
- `trip_recommendation_acceptances` stores decision ID plus a JSON terminal result and has no opportunity/manifest/proposal FK or success-only/tombstone shape (`packages/database/src/schema.ts:1444-1451`; `drizzle/migrations/0043_trip_recommendation_decisions.sql`);
- `acceptTripCreationRecommendation(...)` accepts a `decisionId`, hashes only that decision, creates a title-only Trip and primary conversation, and returns no proposal ID (`packages/database/src/trip-recommendations.ts:56-78`);
- the shared contracts, controller DTO, OpenAPI request body, direct client, and composer all expose `decisionId`, `save_trip`, `Lưu chuyến đi`, and the old result union (`packages/contracts/src/index.ts:614-645`; `apps/api/src/conversations/traveler-commands.controller.ts:69-73`; `apps/api/src/openapi.controller.ts:34`; `apps/web/src/features/ai/direct-api-client.ts:138`; `apps/web/src/features/ai/ai-ask-composer.tsx:276-294,1599-1640`).

The current proposal operation schema and validator also live in the Worker-domain Chat/Trips implementation, while the existing accept command lives in `packages/database` (`packages/worker-domain/src/features/chat-trips/trip-change-proposals.ts`; `packages/database/src/trip-recommendations.ts`). AD-40 must not solve this by importing Worker-domain code into the API/database package or by reimplementing a divergent operation validator.

The solution-design delta currently assigns the whole conversion change only to `Chat/Trips + traveler presentation` (`retrieval-trip-aware-solution-design.md:33`). That is directionally correct but too coarse for a clean brownfield migration and does not name ownership of the operation schema/validator reuse.

**Required tightening**

Expand that delta row (or add a short migration matrix) to name:

1. the Chat/Trips PostgreSQL migration for content revision, opportunity/version/current-manifest uniqueness, canonical projection revisions, immutable typed manifests/payload digests, dismiss replay, acceptance replay/tombstone, and proposal identity/FKs;
2. moving/exporting the existing proposal operation type, parser, canonical serializer, and validation boundary into a shared Chat/Trips/domain module usable by both API/database accept and Worker proposal drafting, without a reverse dependency;
3. the shared contracts + parser/result migration from `decisionId` to `opportunityId` and proposal ID;
4. the existing controller/OpenAPI endpoint body adaptation (same endpoint, no parallel API);
5. the web recommendation projection/action migration to stable eligible/visible-disabled CTA and server-reported disablement, including refetch after the current AI Ask terminalizes rather than relying only on the initial mount effect.

These are migrations within existing modules, not new architecture components, but leaving them implicit permits incompatible story slicing and a duplicated proposal validator.

## Confirmed Minimal Fit

- **Command and concurrency:** current PostgreSQL transactions, owner locks, advisory idempotency lock, and replay table provide a suitable base for the stronger opportunity/manifest digest contract.
- **Trip creation:** the existing `resolveOwnedPrimaryConversationInTransaction(...)` already creates/binds the separate primary conversation under the Trip lock.
- **Proposal boundary:** current `trip_change_proposals` already supports a pending typed operation array, expected aggregate/item versions, ordering preconditions, review/apply/dismiss/expire, and all-or-nothing apply. Conversion should insert one owner-command proposal through the same Chat/Trips validation boundary; it must not apply operations during conversion.
- **UI/API:** the current accept endpoint, direct client, panel, in-flight guard, and navigation flow can be evolved in place. The CTA can be disabled by `isPending` locally and by the new server projection for other tabs.
- **Operations:** no additional runtime, deployable service, queue, Worker loop, cache, provider, dependency, or environment configuration is required.

## Counts

- **Critical:** 0
- **High:** 1
- **Medium:** 1
- **Low:** 0

## Gate Recommendation

Do not pass AD-40 to cross-artifact implementation readiness until TC-TECH-01 is bound in the Spine/solution design and TC-TECH-02 is assigned in the implementation-delta/migration ownership surface. Both repairs should remain inside the existing Chat/Trips, database, contracts, NestJS API, and traveler-presentation units.
