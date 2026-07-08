---
title: 'Story 4.7: Preserve Source And Confidence In Approved Knowledge'
type: 'feature'
created: '2026-07-08'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: '50592bcb0139db110a9c4f4c86800cc24154b77f'
final_revision: '50592bcb0139db110a9c4f4c86800cc24154b77f-uncommitted'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-6-approve-knowledge-for-retrieval.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Approved knowledge cards preserve source links, confidence labels, and freshness flags at the database level, but operators have no approved-card read surface that proves those provenance fields survived approval or makes them safe to inspect after the draft leaves the review queue. Without an explicit approved-card projection, Story 4.8 retrieval work risks re-deriving provenance from free text or accidentally reaching into raw source material.

**Approach:** Add operator/admin-only approved knowledge read helpers and a compact admin approved-card list/detail UI that return approved cards with confidence, freshness, support levels, and linked safe source metadata only. Strengthen tests so approval preservation becomes an explicit contract across multiple source links, confidence ceilings, and raw-source privacy.

## Boundaries & Constraints

**Always:** Authorize admin/operator before approved-card lookup or listing. Return only `status = "approved"` cards. Include confidence label, freshness-sensitive flag, route/location, tags, support levels, and linked safe source metadata. Keep raw source material, storage keys, raw metadata, provider payloads, and operator-only notes out of all approved-card DTOs/UI. Preserve existing approval behavior: approval changes lifecycle only and must not rewrite reviewed card fields or source links.

**Block If:** The work requires first-class `approvedByUserId` / `approvedAt` columns, embeddings/vector schema, traveler-facing provenance UI, public search, source metadata editing, or a policy decision about mutating existing approved target cards.

**Never:** Do not generate embeddings, call AI/search providers, fetch URLs, expose raw source material, approve drafts automatically, loosen confidence ceilings, or include draft/rejected/duplicate/no-action/archived cards in approved-card read results.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Inspect approved card | Operator opens an approved card with linked sources | UI/read helper shows approved fields, confidence, freshness label, source support levels, and safe source metadata | No error expected |
| Multiple provenance links | Approved card has primary, supporting, and conflicting sources | All source links remain visible with their support levels, and confidence is the reviewed card confidence | No error expected |
| Raw material present | Linked source has raw text, file metadata, storage key, or raw metadata | Approved read result and UI contain none of the raw/operator-only material | No raw fields selected or serialized |
| Non-approved lifecycle | Draft, rejected, duplicate, no-action, or archived card exists | Approved list/detail excludes it | Detail returns safe not-found behavior |
| Unauthorized caller | Traveler or unauthenticated caller requests approved-card data | Authorization fails before lookup and no existence is leaked | Safe authorization error; no side effects |

</intent-contract>

## Code Map

- `src/features/knowledge/review.ts` -- current draft review/edit/reject/approve service; best place or reference for safe source DTOs, authorization, approval lifecycle, confidence ceilings, and raw leak patterns.
- `src/features/knowledge/actions.ts` -- current server action boundary for knowledge admin operations; may expose approved-card helpers only if UI needs action wrappers.
- `src/app/admin/knowledge/drafts/page.tsx` -- current post-approval queue messaging; useful navigation entry point to approved cards.
- `src/app/admin/knowledge/drafts/[draftId]/page.tsx` -- source/confidence/freshness presentation pattern for reviewable drafts.
- `src/app/admin/knowledge/approved/page.tsx` -- add approved-card list showing preserved confidence, freshness, and source summary.
- `src/app/admin/knowledge/approved/[cardId]/page.tsx` -- add approved-card detail showing safe linked source provenance and no raw material.
- `tests/knowledge-draft-review.test.ts` or `tests/knowledge-approved-cards.test.ts` -- cover approved-card read contract, lifecycle filtering, auth-first behavior, multi-source preservation, and raw privacy.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- move Story 4.7 through implementation statuses.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/review.ts` or a focused knowledge approved-card module -- add protected approved-card list/detail read helpers with safe source projections -- make provenance preservation explicit for post-approval consumers.
- [x] `src/app/admin/knowledge/approved/page.tsx` and `src/app/admin/knowledge/approved/[cardId]/page.tsx` -- add Vietnamese-first admin list/detail UI for approved knowledge cards -- let operators inspect preserved source/confidence/freshness after approval without raw-source exposure.
- [x] `src/app/admin/knowledge/drafts/page.tsx` and/or admin knowledge navigation copy -- add a small link or message path from draft approval success to approved cards -- keep the operator workflow discoverable.
- [x] `tests/knowledge-approved-cards.test.ts` or existing focused knowledge tests -- cover the I/O matrix and confidence/source/freshness preservation after approval -- prevent regressions before retrieval indexing work.
- [x] `_bmad-output/implementation-artifacts/spec-4-7-preserve-source-and-confidence-in-approved-knowledge.md` and `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update checkboxes, status, verification, notes, and file list -- keep BMad artifacts aligned.

**Acceptance Criteria:**
- Given an approved knowledge card with linked source metadata, when an operator lists or opens approved knowledge, then the response/UI shows the card confidence label, freshness-sensitive label, location/route, tags, source support levels, collected date where available, source kind/type/verification, publisher/label, and safe URL/canonical URL where applicable.
- Given approval succeeds for a reviewed draft, when the approved card is read through the new approved-card surface, then the reviewed confidence, freshness flag, and all source links/support levels are unchanged from the draft at approval time.
- Given linked raw source material exists, when approved-card data is read or rendered, then raw text, raw metadata, storage keys, file names, provider payloads, phone/email-like raw snippets, and operator-only fields are absent.
- Given draft, rejected, duplicate, no-action, or archived knowledge cards exist, when approved-card list/detail helpers run, then only `status = "approved"` cards are returned and non-approved detail lookups fail safely.
- Given an unauthenticated user or traveler requests approved-card admin data, when the service executes, then authorization fails before card/source lookup and no card existence or raw/source details are leaked.

## Spec Change Log

## Review Triage Log

### 2026-07-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 2, low 1)
- defer: 1: (high 0, medium 1, low 0)
- reject: 1
- addressed_findings:
  - `[high]` `[patch]` Approved-card helpers selected full card rows and could serialize non-surface fields; fixed by selecting and constructing an exact approved DTO shape and adding exact-key tests.
  - `[medium]` `[patch]` Approved DTO included `practicalDetails` without a safe-details contract; removed it from the approved-card DTO and tests.
  - `[medium]` `[patch]` Approved list did not render required source support/metadata; added safe source metadata, support level, publisher/date, and URL display to the list.
  - `[low]` `[patch]` Raw privacy tests only checked substring absence; strengthened tests with exact top-level and source DTO key assertions.

Deferred findings:
- Source label/publisher normalization predates Story 4.7 and accepts operator-entered strings as safe metadata. Approved-card projections now avoid raw material fields, but a future source-metadata hardening story should decide whether to reject phone/email/raw-token patterns in source labels and publishers at intake/edit time.

## Design Notes

This story deliberately avoids adding approval actor/time columns. Story 4.6 records approval provenance in audit events and deferred first-class approval metadata as a future decision. Story 4.7 should instead lock the next required invariant for retrieval: approved card consumers must use normalized source links and safe source metadata, not free-text card summaries or raw source material.

## Verification

**Commands:**
- `pnpm test:run tests/knowledge-approved-cards.test.ts` -- expected: focused approved-card provenance/privacy coverage passes.
- `pnpm test:run tests/knowledge-draft-review.test.ts` -- expected: existing draft review and approval lifecycle coverage still passes.
- `pnpm typecheck` -- expected: TypeScript strict checks pass.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm build` -- expected: production build succeeds.

**Results:**
- `pnpm test:run tests/knowledge-approved-cards.test.ts` -- passed; 4 tests passed after review fixes.
- `pnpm test:run tests/knowledge-draft-review.test.ts` -- passed; 17 tests passed after review fixes.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `pnpm build` -- passed; Next.js production build completed successfully.
- Note: running `tests/knowledge-approved-cards.test.ts` and `tests/knowledge-draft-review.test.ts` concurrently in separate processes caused shared test database/mock interference. Running the same files sequentially passed.

## Implementation Notes

- Added `listApprovedKnowledgeCards` and `getApprovedKnowledgeCard` as admin/operator-protected approved-card read helpers.
- Approved-card helpers return only an exact safe DTO shape: approved card summary fields, confidence, freshness, status, timestamps, tags, and linked safe source metadata with support levels.
- Added read-only approved-card admin list and detail pages plus navigation from the admin shell and post-approval success message.
- Added focused approved-card tests for preservation after approval, multiple source links/support levels, lifecycle filtering, auth-first behavior, exact DTO shape, and raw material/file metadata privacy.
- No embeddings, AI/search calls, URL fetching, schema migration, traveler-facing provenance UI, source editing, or auto-approval behavior was added.

## Auto Run Result

Status: done

Summary: Implemented Story 4.7 approved knowledge provenance inspection with safe approved-card read helpers, read-only admin list/detail UI, navigation, focused tests, review hardening, and BMad status updates.

Acceptance criteria: complete. Operators can list/open approved cards and see preserved confidence, freshness, location/route, tags, source support levels, collected date, kind/type/verification, publisher/label, and safe URLs. Non-approved and source-orphaned cards are excluded. Unauthenticated/traveler callers fail authorization before lookup. Raw source material, storage keys, raw metadata, file metadata, AI model fields, creator IDs, and `practicalDetails` are not in the approved-card DTO.

Review findings breakdown: 4 patch findings fixed (1 high, 2 medium, 1 low), 1 medium pre-existing source-metadata hardening item deferred, 1 finding rejected/no action. Follow-up review recommended: true because the review drove a high-consequence DTO privacy hardening change.

Verification performed: focused approved-card tests, existing draft review tests, typecheck, lint, and production build all passed after review fixes.

Residual risks: Source labels and publishers are treated as safe metadata by existing intake rules; future hardening should decide whether those fields need phone/email/raw-token rejection at source intake/edit time.

## File List

- `_bmad-output/implementation-artifacts/spec-4-7-preserve-source-and-confidence-in-approved-knowledge.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/admin/layout.tsx`
- `src/app/admin/knowledge/approved/page.tsx`
- `src/app/admin/knowledge/approved/[cardId]/page.tsx`
- `src/app/admin/knowledge/drafts/page.tsx`
- `src/features/knowledge/review.ts`
- `tests/knowledge-approved-cards.test.ts`
