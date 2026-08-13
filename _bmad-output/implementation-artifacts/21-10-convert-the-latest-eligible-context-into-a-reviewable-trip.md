# Story 21.10: Convert The Latest Eligible Context Into A Reviewable Trip

Status: ready-for-dev

## Story

As a traveler, I want current eligible chat context converted into a reviewable Trip proposal, so that nothing is copied or applied until I approve structured changes.

## Acceptance Criteria

1. Existing `acceptTripCreationRecommendation(...)` revalidates latest opportunity/manifest, owner, terminal AI Ask watermark, scope, conversation/content/projection revisions, ordinary-conversation validity, fences, claims, versions, typed payload, and digest using `opportunityId` plus idempotency key; it rejects an independently unterminated newer turn.
2. One transaction creates exactly one Trip, separate primary conversation, and one initial pending Trip Change Proposal, returning destination and `proposalId`.
3. No transcript, prose, prompt, provider data, reasoning, ambiguous/unresolved value, or assumption-only operation is copied/linked; no value is applied before proposal Apply.
4. Replay is stable, deletion returns `destination_deleted`, CAS allows one legal transition, and `continueInTrip(...)` only switches URL scope. `TC-06` through `10`, `13`, `17`, `18` pass.

## Tasks / Subtasks

- [ ] Upgrade existing accept/decline command in `trip-recommendations.ts`; trust server-resolved manifest only (AC: 1-4).
- [ ] Reuse `primary-conversation.ts` and typed proposal parser/validator/serializer to create the initial pending proposal (AC: 2-3).
- [ ] Evolve current API/domain/contracts/client/composer port in place; update integration and wire tests (AC: 1-4).
- [ ] Add DB-free proposal/parser/idempotency-digest tests and serial PostgreSQL owner-lock/CAS/API/deletion tests. Prove `TC-08`, `TC-17`, and `TC-18`: refresh/validation/transient failures do not consume a key, changed digest returns `key_reused`, source deletion retains non-content replay only, and destination deletion exposes no live identifiers (AC: 1-4).

## Dev Notes

- Proposal Apply remains the sole Trip-state mutation boundary. Conversion is review-first and must not create a separate conversion endpoint, service, worker, cache, dependency, model purpose, or runtime flag.
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

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
