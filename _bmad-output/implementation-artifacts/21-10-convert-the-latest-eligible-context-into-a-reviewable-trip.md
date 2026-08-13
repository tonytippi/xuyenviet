# Story 21.10: Convert The Latest Eligible Context Into A Reviewable Trip

Status: backlog

## Story

As a traveler, I want current eligible chat context converted into a reviewable Trip proposal, so that nothing is copied or applied until I approve structured changes.

## Acceptance Criteria

**Given** the traveler clicks the eligible CTA
**When** the upgraded existing `acceptTripCreationRecommendation(...)` command executes with `opportunityId` and idempotency key
**Then** it revalidates the latest canonical projection, terminal AI Ask watermark, claims, scopes, policy/schema/serialization, typed payload digest, owner, conversation, and deletion fences
**And** one transaction creates exactly one Trip, a separate primary conversation, and one initial pending Trip Change Proposal, returning destination plus `proposalId`.

**Given** conversion succeeds
**When** the created Trip and original chat are inspected before proposal Apply
**Then** no transcript, assistant prose, prompt, provider payload, model reasoning, ambiguous value, unresolved field, or assumption-only operation was copied or linked, and no transferred value is applied Trip state
**And** only the existing owner-confirmed Apply command may change constraints, anchors, legs, stays, meals, activities, or route choices.

**Given** conversion retries, races deletion, or the traveler chooses an existing Trip
**When** idempotency/deletion/continue behavior is evaluated
**Then** refresh and transient failure do not burn the key, successful replay returns the same live destination/proposal, deleted destination returns `destination_deleted`, and concurrent accept/dismiss/refresh/delete permits one legal CAS transition
**And** `continueInTrip(...)` changes only URL scope to the existing primary conversation and imports no chat context or proposal.

**Given** the in-place migration is implemented
**When** database, domain, wire contract, controller/OpenAPI, direct client, and composer changes are reviewed
**Then** the existing recommendation aggregate and accept/decline endpoints evolve from `decisionId` to `opportunityId`, share the existing proposal operation parser/validator/serializer, refetch after terminal AI Ask events, and add no parallel endpoint, Worker, service, cache, dependency, model purpose, or environment flag
**And** `TC-06` through `TC-10`, `TC-13`, `TC-17`, and `TC-18` pass for FR-16J..L, PJ-01, and RTA-13.

## Tasks / Subtasks

- [ ] In new `packages/domain/src/trip-change-proposals.ts` and `packages/domain/src/index.ts`, extract the closed `TripChangeProposalOperation` union, parser, validator, and canonical serializer from `packages/worker-domain/src/features/chat-trips/trip-change-proposals.ts`; update that Worker file and `packages/database/src/traveler-proposal-commands.ts` to consume the shared contract so conversion cannot reverse-import Worker internals or duplicate proposal rules (AC: 1-4).
- [ ] In `packages/database/src/trip-recommendations.ts`, upgrade only `acceptTripCreationRecommendation(...)` and conversion replay/tombstone behavior; Story 21.9 already owns dismissal/refresh migration. Lock the owner conversation/opportunity, resolve the latest server manifest, reject a newer unterminated turn, revalidate all pinned claims/versions/payload/digest/deletion fences, and derive the request digest from command version, owner, opportunity, and resolved manifest digest (AC: 1, 3-4).
- [ ] In `packages/database/src/trip-recommendations.ts`, `packages/database/src/primary-conversation.ts`, `packages/database/src/schema.ts`, and `drizzle/migrations/`, make one transaction consume the opportunity, create exactly one Trip and separate primary conversation, insert one initial `pending` proposal from the shared validated payload, and persist non-content success replay plus destination tombstone data; copy or link no chat/provider content and apply no Trip value (AC: 1-3).
- [ ] In `packages/contracts/src/index.ts`, `packages/domain/src/index.ts`, `apps/api/src/conversations/traveler-commands.controller.ts`, and `apps/api/src/openapi.controller.ts`, complete the existing endpoint contract with `opportunityId`, success `proposalId`, and `destination_deleted` while preserving CSRF/idempotency admission and the current route identity (AC: 1, 3-4).
- [ ] In `apps/web/src/features/ai/direct-api-client.ts` and `apps/web/src/features/ai/ai-ask-composer.tsx`, submit only `opportunityId` plus the idempotency key, preserve the key across refresh-required/transient retry, route success to the returned destination/proposal review, project `destination_deleted` without stale identifiers, and keep `continueInTrip(...)` as URL-scope-only behavior (AC: 1-4).
- [ ] In `tests/trip-conversion-command.test.ts`, `tests/trip-recommendations.test.ts`, and `tests/trip-proposal-command-contract.test.ts`, add DB-free shared parser/validator/canonical-serialization and idempotency-digest coverage; in `tests/trip-conversion-command.integration.test.ts`, `tests/trip-recommendations.integration.test.ts`, and `tests/trip-recommendations-api.integration.test.ts`, add serial PostgreSQL owner-lock/CAS/API/source-deletion/destination-tombstone/no-content-copy/no-pre-Apply-mutation coverage with local `resetTestDatabase()` setup, including `TC-06` through `TC-10`, `TC-13`, `TC-17`, and `TC-18` (AC: 1-4).

### Verification

- `pnpm test:unit -- tests/trip-conversion-command.test.ts tests/trip-recommendations.test.ts tests/trip-proposal-command-contract.test.ts`
- `pnpm test:integration -- tests/trip-conversion-command.integration.test.ts tests/trip-recommendations.integration.test.ts tests/trip-recommendations-api.integration.test.ts`
- `pnpm typecheck`
- `pnpm exec drizzle-kit check`
- `git diff --check`

### Block If

- Story 21.9 is not complete, including mandatory `TC-13` projection-policy validation and the `opportunityId` accept/dismiss wire cutover.
- The shared proposal parser, validator, and canonical serializer cannot be extracted without changing proposal semantics. Resolve that shared-contract boundary before implementing conversion; do not import `packages/worker-domain` from `packages/database` or create a second validator.

## Dev Notes

- Depends on completed Story 21.9 including mandatory `TC-13` projection-policy validation. Proposal Apply remains the sole Trip-state mutation boundary. Conversion is review-first and must not create a separate conversion endpoint, service, worker, cache, dependency, model purpose, or runtime flag.
- Idempotency digest derives from command version, owner, opportunity, and resolved manifest digest. Only committed success reserves the key; deleted destination retains non-content replay information only.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.10]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-30-and-AD-40]
- [Source: packages/database/src/trip-recommendations.ts]
- [Source: packages/database/src/traveler-proposal-commands.ts]
- [Source: tests/trip-recommendations-api.integration.test.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Persistent-Chat-To-Trip-Conversion]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware-solution-design.md#Persistent-Chat-To-Trip-Conversion]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.10` is normative. Guide AC 1-4 map one-to-one to its four canonical criteria; `TC-13` is an upstream Story 21.9 prerequisite and `TC-06`-`TC-10`, `TC-17`, and `TC-18` remain this story's proof.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
