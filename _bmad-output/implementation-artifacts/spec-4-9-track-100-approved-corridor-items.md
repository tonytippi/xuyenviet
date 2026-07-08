---
title: 'Story 4.9: Track 100 Approved Corridor Items'
type: 'feature'
created: '2026-07-08'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '90ff618a5591f6ca9fa73737acf263fb8fe0cfce'
final_revision: '90ff618a5591f6ca9fa73737acf263fb8fe0cfce-uncommitted'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-8-make-approved-knowledge-searchable-by-ai.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Operators can create, approve, source-link, and search approved knowledge, but they still do not have a seed-progress view for the public-MVP requirement of 100 approved Hanoi-to-HCMC corridor items. Without a clear count and distribution, readiness checks can overcount drafts/rejected/archived content or miss obvious type/route gaps.

**Approach:** Add an admin/operator-only seed progress helper and admin page that derive progress from existing approved, reviewed, source-linked knowledge cards and seed batch item statuses. Show the count toward 100, remaining gap, status counts, and distributions by card type and route/location without adding new persistence or exposing raw source material.

## Boundaries & Constraints

**Always:** Require admin/operator authorization before progress queries. Count only approved knowledge cards with `needsReview = false`, at least one linked normalized source, and a corridor signal from `routeSegment` or `locationName`. Exclude draft, rejected, duplicate, no-action, archived, source-orphaned, and needs-review cards. Derive and persist stale seed batch item statuses before reporting progress. Keep returned DTOs aggregate and safe: no raw source material, no raw metadata, no file names, no storage keys, and no provider payloads.

**Block If:** Implementation requires deciding the final canonical corridor taxonomy beyond the existing route/location fields, changing knowledge card schema, introducing manual readiness override records, changing AI Ask retrieval behavior, or counting unlinked/orphaned cards as production-ready seed items.

**Never:** Do not create new seed-progress tables, approve cards automatically, call AI/search/embedding providers, read `raw_source_material`, treat batch item status alone as proof of approved knowledge, or expose this dashboard to normal travelers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Count eligible approved corridor cards | Approved, reviewed, source-linked cards with route/location mentioning Hanoi-to-HCMC corridor cities or segments | Progress returns `targetApprovedItems: 100`, approved count, remaining count, incomplete/readiness flag, and type/location distributions | No error expected |
| Exclude ineligible cards | Draft, archived, rejected, duplicate, no-action, needs-review, source-orphaned, or non-corridor approved cards exist | They do not increase approved corridor count or readiness | No mutation beyond stale batch status derivation |
| Derive seed item progress | Batch items are still pending/extracted while linked cards or duplicate/no-action suggestions exist | Helper reports updated status counts and persists stale item statuses | Safe aggregate result only |
| Readiness incomplete | Fewer than 100 eligible approved corridor cards exist | Dashboard reports incomplete and exact remaining item count | No error expected |
| Unauthorized access | Traveler session calls progress helper or page loader | Access fails before DB mutation and no progress data is returned | Throws existing `AdminAuthorizationError`/admin route denial |

</intent-contract>

## Code Map

- `src/features/knowledge/batch-intake.ts` -- existing batch intake/status derivation boundary; add approved corridor seed progress helper and DTOs here to reuse private status derivation without exporting internals.
- `src/app/admin/layout.tsx` -- admin navigation; add a link to the seed progress page.
- `src/app/admin/knowledge/progress/page.tsx` -- new server-rendered operator dashboard for the 100-item target, distributions, gaps, and seed status counts.
- `tests/knowledge-batch-source-intake.test.ts` -- extend database-backed knowledge batch tests for progress counting, exclusion, derived statuses, and authorization.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- move Story 4.9 through implementation statuses.
- `_bmad-output/implementation-artifacts/spec-4-9-track-100-approved-corridor-items.md` -- update checkboxes, verification, notes, review log, and file list.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/batch-intake.ts` -- add `getApprovedCorridorSeedProgress` with target constant, safe DTOs, eligibility filtering, type/location distributions, readiness gap calculation, and global seed item status derivation -- centralize the production-readiness count behind admin-only server code.
- [x] `src/app/admin/knowledge/progress/page.tsx` and `src/app/admin/layout.tsx` -- render the progress dashboard and add admin navigation -- make the 100-item target visible to operators without exposing traveler routes or raw data.
- [x] `tests/knowledge-batch-source-intake.test.ts` -- cover eligible counting, ineligible exclusions, status derivation/persistence, global aggregation beyond recent batches, and traveler denial -- prevent overcounting and authorization regressions.
- [x] `_bmad-output/implementation-artifacts/spec-4-9-track-100-approved-corridor-items.md` and `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update story status, task checkboxes, verification, notes, and file list -- keep BMad artifacts aligned.

**Acceptance Criteria:**
- Given approved knowledge items exist, when an operator views seed progress, then the admin area shows the count of approved Hanoi-to-HCMC corridor items and excludes draft, rejected, duplicate, no-action, archived, needs-review, and source-orphaned items.
- Given approved eligible items have type and route/location fields, when progress is displayed, then the operator can see distribution by type and by route/location, including obvious zero-count or low-count gaps where data is sparse.
- Given fewer than 100 approved corridor items exist, when progress is calculated, then the system reports the seed set as incomplete and shows the exact remaining count.
- Given batch seed item statuses lag behind linked cards or source suggestions, when progress is calculated, then the returned status counts reflect derived current statuses and stale item rows are persisted safely.
- Given a normal traveler attempts to access progress data, when the helper runs, then access is denied before status derivation or mutation.

## Spec Change Log

## Review Triage Log

### 2026-07-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 2, medium 2, low 0)
- defer: 2: (high 0, medium 2, low 0)
- reject: 6
- addressed_findings:
  - `[high]` `[patch]` Seed item status derivation marked approved cards with `needsReview = true` as `approved`; fixed by mapping those cards to `needs_review` and updating regression expectations.
  - `[high]` `[patch]` Corridor matching used raw substring checks that could count unrelated labels like `Vinhomes`; fixed by normalized word-boundary alias matching and regression coverage.
  - `[medium]` `[patch]` Dashboard did not show zero-count type/route gaps; fixed by returning all card types and conservative corridor buckets with zero counts included.
  - `[medium]` `[patch]` Stale seed status persistence could overwrite a concurrent status change; fixed by conditioning updates on the previously read status.
  - `[medium]` `[defer]` Progress helper reads all seed items and approved source-linked cards in memory; acceptable for the 100-item MVP seed target but should be revisited if source intake grows substantially.
  - `[medium]` `[defer]` Progress counts approved source-linked corridor knowledge regardless of whether the source originated from a seed batch; this matches the broader approved-corridor seed requirement but may need a stricter seeded-only report later.

## Design Notes

Corridor eligibility uses existing `routeSegment`/`locationName` fields and a conservative Vietnam corridor keyword list. This is intentionally a readiness dashboard heuristic, not a permanent geography model. A later story can add canonical route taxonomy if operators need structured corridor segments.

## Verification

**Commands:**
- `pnpm test:run tests/knowledge-batch-source-intake.test.ts` -- expected: batch intake and progress coverage passes.
- `pnpm typecheck` -- expected: TypeScript strict checks pass.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm build` -- expected: production build succeeds.

**Results:**
- `pnpm test:run tests/knowledge-batch-source-intake.test.ts` -- passed; 9 tests passed.
- `pnpm typecheck` -- passed after rerun. An earlier parallel run with `pnpm build` failed because `.next/types` was being regenerated concurrently.
- `pnpm lint` -- passed.
- `pnpm build` -- passed after marking the admin progress page dynamic so admin authorization is evaluated at request time instead of during prerender.

## Implementation Notes

- Added `getApprovedCorridorSeedProgress` in `src/features/knowledge/batch-intake.ts` as an admin-only server helper with a 100-item target, aggregate-only DTO, derived global seed batch status counts, and safe persistence of stale derived statuses.
- Corridor readiness counts only unique approved cards with `needsReview = false`, at least one linked normalized source, and a conservative corridor signal from `routeSegment` or `locationName`; draft/rejected/duplicate/no-action/archived/source-orphaned/needs-review cards do not increase readiness.
- Added the admin progress page at `/admin/knowledge/progress`, showing approved count, remaining gap, status counts, and type/route-location distributions without selecting or rendering raw source material.
- Added focused database-backed tests for eligible/ineligible counting, status derivation persistence across all seed items, safe aggregate DTO shape, and traveler denial before mutation.
- Review hardening added `needsReview` handling for approved card status derivation, normalized corridor bucket matching, zero-count distribution buckets, and conditional stale-status persistence.

## Auto Run Result

Status: done

Summary: Implemented Story 4.9 seed progress tracking with an admin-only server helper, a Vietnamese admin dashboard, focused database-backed tests, review fixes, and BMad status updates.

Review findings breakdown: 4 patch findings fixed (2 high, 2 medium), 2 medium follow-ups deferred, 6 findings rejected as out of scope or already covered by the story boundary.

Follow-up review recommended: false. Review-driven changes were localized to eligibility/status matching and aggregate display behavior, with focused regression coverage and full verification passing.

Verification performed: `pnpm test:run tests/knowledge-batch-source-intake.test.ts`, `pnpm typecheck`, `pnpm lint`, and `pnpm build` all passed. One earlier `pnpm typecheck` run failed only because it was executed concurrently with `pnpm build` while `.next/types` was being regenerated; rerunning after build passed.

Residual risks: Progress aggregation is intentionally in-process for the public-MVP 100-item target and may need SQL aggregation/pagination if seed intake grows far beyond MVP scale. The dashboard counts approved source-linked corridor knowledge, not only cards whose sources came from seed batches.

## File List

- `_bmad-output/implementation-artifacts/spec-4-9-track-100-approved-corridor-items.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/admin/layout.tsx`
- `src/app/admin/knowledge/progress/page.tsx`
- `src/features/knowledge/batch-intake.ts`
- `tests/knowledge-batch-source-intake.test.ts`
