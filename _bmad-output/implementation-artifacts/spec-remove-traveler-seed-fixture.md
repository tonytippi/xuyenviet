---
title: 'Remove Traveler Seed Fixture'
type: 'chore'
created: '2026-07-27'
status: 'done'
review_loop_iteration: 0
baseline_commit: '41766ef28931dadf9d9a30c3993b1e47d49d19bc'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The development seed includes `seed-traveler-user` and a trip/chat search graph that is no longer wanted. The Facebook and YouTube seed sources must remain available with real-person submitter provenance.

**Approach:** Retain only `seed-fixture-operator-user` as the deliberate human fixture, remove all traveler-owned seed records as one graph, and realign the Epic 8 seed/isolation regression evidence and active records with that minimal seed contract.

## Boundaries & Constraints

**Always:** Preserve all Facebook/YouTube URL seeds, their `rawSourceMaterial`, seeded AI gateway models, and `sources.submittedByUserId = "seed-fixture-operator-user"`. Keep system executors out of `users`; use the retained operator as the seeded valid human Audit actor. Run database-backed tests only against `DATABASE_URL_TEST` using their explicit child-process binding.

**Ask First:** Stop if retaining Facebook/YouTube sources would require removing the operator fixture or changing their human submitter semantics.

**Never:** Do not replace human source provenance with a `system-*` executor, alter the AuditActor catalog/schema/migrations, run `pnpm db:reset`, touch the development database, or change generic user ownership behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Seed | Fresh migrated test database | Only the operator user is seeded; 18 Facebook/YouTube sources retain that operator as submitter | Seed completes with valid foreign keys |
| Removed graph | Fresh migrated test database | Traveler user, role, trip, conversation, messages, context, search result, and retrieval decision are absent | No dangling fixture reference remains |
| Actor isolation | Seeded test database | Operator can form a valid user AuditActor; catalog executors remain non-users | Invalid system/user shapes continue to fail |

</frozen-after-approval>

## Code Map

- `scripts/db-seed.ts` -- seeds the operator, AI models, and Facebook/YouTube source provenance only.
- `tests/story-8-5-clean-break.test.ts` -- verifies clean seed composition and catalog-system audit persistence.
- `tests/story-8-6-actor-isolation.test.ts` -- verifies seeded human actor validity and executor isolation after migration/seed.
- `_bmad-output/implementation-artifacts/8-5-remove-fake-system-users-in-the-clean-break-migration.md` -- active seed contract and historical verification record.
- `_bmad-output/implementation-artifacts/8-6-verify-actor-isolation-and-attribution-end-to-end.md` -- active final seed/isolation contract.
- `_bmad-output/planning-artifacts/proposal-eliminate-fake-system-users-with-audit-actors.md` -- active clean-break proposal naming retained fixtures.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Epic 8 verification evidence timeline.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/db-seed.ts` -- remove the traveler fixture, traveler role, and all transitively traveler-owned seed inserts; retain operator, model, Facebook/YouTube source, and raw-source seed data.
- [x] `tests/story-8-5-clean-break.test.ts` -- assert the minimal operator/source seed composition and absence of every removed traveler fixture identifier while retaining the system-audit-without-user regression.
- [x] `tests/story-8-6-actor-isolation.test.ts` -- use the operator as the valid seeded human Audit actor and replace traveler relationship assertions with operator source-provenance and traveler-graph absence checks.
- [x] `_bmad-output/implementation-artifacts/8-5-remove-fake-system-users-in-the-clean-break-migration.md` -- revise the current contract to retain only operator provenance and mark prior two-person verification evidence superseded.
- [x] `_bmad-output/implementation-artifacts/8-6-verify-actor-isolation-and-attribution-end-to-end.md` -- revise current seed-isolation guidance to the single-operator fixture contract and mark superseded evidence.
- [x] `_bmad-output/planning-artifacts/proposal-eliminate-fake-system-users-with-audit-actors.md` -- update the retained fixture statement to name only the operator.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- append a narrow current-evidence note without revising prior unrelated history or Epic status.

**Acceptance Criteria:**
- Given a fresh migrated `DATABASE_URL_TEST` database is seeded, when users and seeded resource IDs are inspected, then `seed-fixture-operator-user` is present and `seed-traveler-user` plus every traveler-owned fixture record is absent.
- Given Facebook and YouTube source data is seeded, when provenance is inspected, then all 18 source rows retain `seed-fixture-operator-user` as `submittedByUserId` and no system executor is a user row.
- Given actor-isolation validation runs on the seed result, when a valid user actor is needed, then it uses the retained operator while all catalog executor isolation checks continue to pass.

## Design Notes

`sources.submitted_by_user_id` is a restrictive real-user foreign key. Retaining Facebook/YouTube seed sources therefore requires retaining the operator user, but does not require any traveler, role, trip, or conversation fixture.

The seed script remains additive and non-destructive. Existing pre-change development data must be reset/reseeded through the existing authorized disposable-database workflow; this change does not delete records from a populated database.

## Spec Change Log

- Review repair: corrected the focused Vitest command, which had forwarded filters after `--` and ran the full suite, and strengthened source-seed coverage to require all 18 rows to be Facebook/YouTube with operator provenance and a matching raw-material row. This avoids unrelated-suite failures masking the focused result and prevents accidental seed composition drift.

## Verification

**Commands:**
- `pnpm exec vitest run tests/story-8-5-clean-break.test.ts tests/story-8-6-actor-isolation.test.ts` -- expected: both isolated migration/seed suites pass using `DATABASE_URL_TEST`.
- `pnpm typecheck` -- expected: strict TypeScript passes.

## Suggested Review Order

**Seed Contract**

- Starts with the retained human provenance and makes the seed graph intentionally minimal.
  [`db-seed.ts:17`](../../../scripts/db-seed.ts#L17)

- Confirms no traveler-owned inserts remain after the model seed data.
  [`db-seed.ts:113`](../../../scripts/db-seed.ts#L113)

**Regression Coverage**

- Verifies exact user/source/raw-material composition and traveler fixture absence after a fresh seed.
  [`story-8-5-clean-break.test.ts:42`](../../../tests/story-8-5-clean-break.test.ts#L42)

- Uses the operator as the valid human Audit actor while retaining executor isolation coverage.
  [`story-8-6-actor-isolation.test.ts:50`](../../../tests/story-8-6-actor-isolation.test.ts#L50)

**Epic Records**

- Replaces the obsolete two-person seed contract with the approved operator-only provenance contract.
  [`8-5-remove-fake-system-users-in-the-clean-break-migration.md:56`](8-5-remove-fake-system-users-in-the-clean-break-migration.md#L56)

- Marks prior Epic 8 seed evidence superseded without rewriting unrelated history.
  [`sprint-status.yaml:165`](sprint-status.yaml#L165)
