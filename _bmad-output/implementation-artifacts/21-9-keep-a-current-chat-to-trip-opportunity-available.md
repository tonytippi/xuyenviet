# Story 21.9: Keep A Current Chat-To-Trip Opportunity Available

Status: backlog

## Story

As a traveler, I want a persistent `Chuyển thành chuyến đi` action when chat has useful planning context, so that I can convert it when ready.

## Acceptance Criteria

**Given** an unscoped profiled turn commits a useful answer with at least one supported explicit planning operation
**When** the same terminalization path refreshes Trip conversion state
**Then** Chat/Trips exposes one owner-bound stable opportunity and persistent `Chuyển thành chuyến đi` CTA from canonical clarification claims without consulting the suppressed background extractor or legacy flat `chat_context`
**And** not clicking, navigation, unmount, timeout, or hiding the control records no dismissal or decline fence.

**Given** completed later turns replace or add compatible scoped values, reopen a deliverable, create ambiguity, or remain unterminated
**When** the server projects the opportunity
**Then** the canonical conversion projection deterministically reduces all eligible non-superseded claims, refreshes the manifest, suspends recoverable ambiguity/insufficiency, or returns a server-owned visible-disabled pending state
**And** another tab cannot accept an older or unterminated context revision.

**Given** the traveler explicitly dismisses or later resolves suspended context
**When** the upgraded existing decline/refresh owner ports run
**Then** only explicit dismissal records the exact material-context fence and terminalizes that opportunity, while resolved context restores the same suspended ID with a new manifest
**And** later eligible context after dismissal creates a new opportunity rather than reactivating the dismissed ID.

**Given** the opportunity UI is rendered on desktop, mobile, or another active tab
**When** eligibility, pending-turn, suspension, dismissal, or refreshed-manifest state changes
**Then** it uses the server projection, remains keyboard/touch accessible, refetches after terminal AI Ask events, and never infers eligibility solely from local streaming state
**And** `TC-01` through `TC-05`, `TC-11` through `TC-16`, `TC-19`, and `TC-20` pass for FR-16J..L, PJ-01, and RTA-13.

## Tasks / Subtasks

- [ ] In `packages/database/src/schema.ts` and `drizzle/migrations/`, evolve the existing recommendation tables in place into stable opportunity, canonical projection revision, immutable manifest/digest, decline-fence, and closed-transition persistence; retain one ordinary-conversation/nonterminal-opportunity invariant and add no second aggregate (AC: 1-3).
- [ ] In `packages/database/src/trip-recommendations.ts`, replace profiled reads of `chat_context` and `ai_ask.context_extraction.v1` with canonical completed clarification claims; implement deterministic claim reduction, stable manifest refresh, `eligible -> suspended|dismissed|invalidated` and `suspended -> eligible|invalidated` transitions, pending-turn visible-disabled projection, and same-lock/version CAS for refresh/dismiss/delete (AC: 1-3).
- [ ] In new `packages/domain/src/trip-conversion-opportunities.ts` and `packages/domain/src/index.ts`, define and startup-validate the finite code-shipped `TripConversionProjectionPolicy`; reject empty/over-limit catalogs, duplicate or conflicting field/scope mappings, unknown fields/operations, incompatible schemas, and invalid title rules before any opportunity becomes eligible (AC: 1-3; mandatory `TC-13`).
- [ ] In `packages/contracts/src/index.ts`, `packages/domain/src/index.ts`, `apps/api/src/conversations/traveler-commands.controller.ts`, and `apps/api/src/openapi.controller.ts`, evolve the existing recommendation projection and accept/dismiss bodies from `decisionId` to `opportunityId`, add `eligible` and `visible_disabled` server projections, and preserve the existing endpoint identities (AC: 1-4).
- [ ] In `packages/database/src/ai-ask-commands.ts`, `packages/database/src/ai-ask-stream-execution.ts`, and `packages/database/src/index.ts`, invoke `refreshTripConversionOpportunity(...)` through the Chat/Trips transaction-aware owner port after profiled clarification reduction or `finalizeAiAnswer(...)` and before returning the final projection; do not create a competing finalizer, outbox event, Worker, or asynchronous eligibility path (AC: 1, 4).
- [ ] In `apps/web/src/features/ai/direct-api-client.ts` and `apps/web/src/features/ai/ai-ask-composer.tsx`, render the persistent `Chuyển thành chuyến đi` CTA from the server projection, preserve it while eligible, disable it for a pending newer turn, use `opportunityId` for accept/dismiss, and refetch after every terminal AI Ask event without inferring durable status from local stream state (AC: 1, 4).
- [ ] In `tests/trip-conversion-opportunities.test.ts`, `tests/trip-recommendations.test.ts`, and `tests/direct-shell-proposal-actions.test.ts`, add DB-free policy/projection/presentation, keyboard/touch, and `TC-01` through `TC-05`, `TC-11` through `TC-16`, `TC-19`, `TC-20` coverage; in `tests/trip-conversion-opportunities.integration.test.ts` and `tests/trip-recommendations-api.integration.test.ts`, add serial PostgreSQL manifest/CAS/ownership/pending-tab/dismiss/refresh and opportunity-only conversation-deletion cascade tests with local `resetTestDatabase()` setup (AC: 1-4).

### Verification

- `pnpm test:unit -- tests/trip-conversion-opportunities.test.ts tests/trip-recommendations.test.ts tests/direct-shell-proposal-actions.test.ts`
- `pnpm test:integration -- tests/trip-conversion-opportunities.integration.test.ts tests/trip-recommendations-api.integration.test.ts`
- `pnpm typecheck`
- `pnpm exec drizzle-kit check`
- `git diff --check`

### Block If

- Story 21.8 is not complete or its atomic `finalizeAiAnswer(...)` transaction-aware Chat/Trips owner port is unavailable.
- Full cross-owner deletion/invalidation remains Story 21.13. This story tests only opportunity/manifest state owned by Chat/Trips and must not claim the complete Retrieval/evaluation deletion matrix.

## Dev Notes

- Depends on Story 21.8's atomic finalization path; opportunity refresh extends that terminalization and must not create a competing finalizer.
- AD-40/RTA-13: Chat/Trips owns closed opportunity transitions `eligible -> suspended|dismissed|consumed|invalidated` and `suspended -> eligible|invalidated`.
- One ordinary conversation has one current nonterminal opportunity and manifest. Pending newer turn is visible-disabled projection only, never dismissal.
- Manifest pins revisions, claims/value IDs, policy/schema/serialization versions, source watermark, typed payload, and digest. Fail closed for ambiguity, assumptions-only, unsupported or digest mismatch.
- No Worker, queue, feature flag, model purpose, service, or cache. Vietnamese-first copy and browser authority remain server-owned.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.9]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-40]
- [Source: packages/database/src/trip-recommendations.ts]
- [Source: apps/web/src/features/ai/ai-ask-composer.tsx]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Persistent-Chat-To-Trip-Conversion]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware-solution-design.md#Persistent-Chat-To-Trip-Conversion]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.9` is normative. Guide AC 1-4 map one-to-one to its four canonical criteria. `TC-13` is required before completion and before Story 21.10 starts.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
