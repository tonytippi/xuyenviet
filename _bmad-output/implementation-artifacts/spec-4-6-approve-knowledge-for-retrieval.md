---
title: 'Story 4.6: Approve Knowledge For Retrieval'
type: 'feature'
created: '2026-07-08'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: 'd1b371b'
final_revision: 'd1b371b-uncommitted'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-5-batch-seed-source-url-intake.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Operators can edit or reject AI-prepared knowledge drafts, but there is no protected approval path that turns a reviewed draft into an approved, retrieval-eligible knowledge card. Without approval, later retrieval/search stories cannot safely distinguish human-approved cards from drafts, rejected items, duplicates, or archived content.

**Approach:** Add an operator/admin-only approval mutation and admin UI action that transitions a reviewable draft to `approved`, clears `needsReview`, preserves source links and safe metadata, audits the decision, and removes the card from the draft queue. Treat approval as lifecycle eligibility only; embedding/index generation remains later Story 4.8.

## Boundaries & Constraints

**Always:** Authorize admin/operator before lookup, mutation, source inspection, or audit. Only approve cards currently in `status = "draft"` and `needsReview = true` with at least one valid linked safe source. Preserve linked sources, card fields, confidence label, freshness flag, and suggestion metadata. Write a safe audit event with operation `approve` and no raw source material. Approved cards must disappear from default draft review APIs/UI and become identifiable by `status = "approved"` for later retrieval filters.

**Block If:** Approval requires creating embeddings, a vector table, traveler-facing provenance UI, or changing the approved knowledge card schema beyond lifecycle state.

**Never:** Do not auto-approve during extraction, suggestion, or batch intake. Do not fetch URLs, call AI, generate embeddings, expose raw source material, mutate an existing approved target card from an update suggestion, or allow unauthenticated/traveler callers to infer draft existence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Approve reviewable draft | Operator approves a draft with valid linked source | Card becomes `approved`, `needsReview = false`, source links remain, audit records `approve`, draft leaves queue | No error expected |
| Approve invalid lifecycle | Draft id points to approved, rejected, archived, non-review-needed, or missing card | No mutation and no audit; caller receives safe not-reviewable/not-found error | Redirect/action surfaces safe Vietnamese error |
| Orphan draft | Draft has no valid linked source | Cannot approve because approval needs provenance | No mutation and no audit |
| Unauthorized caller | Traveler or unauthenticated caller attempts approval | Authorization fails before lookup, mutation, source reads, or audit | No side effects or existence leak |

</intent-contract>

## Code Map

- `src/features/knowledge/review.ts` -- add `approveKnowledgeDraft` service beside edit/reject, reusing reviewable-draft loading and safe audit patterns.
- `src/features/knowledge/actions.ts` -- expose direct and form approval actions with safe redirect/error handling.
- `src/app/admin/knowledge/drafts/[draftId]/page.tsx` -- add approval copy and confirmation form next to edit/reject controls.
- `src/app/admin/knowledge/drafts/page.tsx` -- update queue messaging and success state so approval is visible to operators.
- `tests/knowledge-draft-review.test.ts` -- extend review coverage for approval lifecycle, provenance preservation, audit, edge cases, and auth-first behavior.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- move Story 4.6 through implementation statuses.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/knowledge/review.ts` -- implement protected approval service, lifecycle guard, source-link requirement, and safe approval audit -- make approved status the single retrieval-eligibility signal for later stories.
- [x] `src/features/knowledge/actions.ts` -- add `approveKnowledgeDraft` and `approveKnowledgeDraftForm` -- support server-action use from admin UI with consistent authorization/error redirects.
- [x] `src/app/admin/knowledge/drafts/[draftId]/page.tsx` and `src/app/admin/knowledge/drafts/page.tsx` -- add approve CTA, approved success messaging, and updated Vietnamese copy -- make approval usable without exposing raw source data.
- [x] `tests/knowledge-draft-review.test.ts` -- cover the I/O matrix and queue exclusion after approval -- prevent lifecycle, audit, and auth regressions.
- [x] `_bmad-output/implementation-artifacts/spec-4-6-approve-knowledge-for-retrieval.md` and `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update checkboxes, status, verification, notes, and file list -- keep BMad artifacts aligned.

**Acceptance Criteria:**
- Given an operator reviews a valid draft, when they approve it, then the card status becomes `approved`, `needsReview` becomes false, source links remain intact, and an `approve` audit event is recorded without raw source material.
- Given a card is approved, when the draft review queue or direct draft detail lookup runs, then the card is no longer returned as a reviewable draft.
- Given a draft is missing safe source linkage or is no longer in reviewable draft state, when approval is attempted, then no card or audit mutation occurs and a safe operational error is returned.
- Given an unauthenticated user or traveler attempts approval, when the request reaches the server action/service, then authorization fails before draft lookup or side effects.
- Given Story 4.6 completes, when later retrieval work filters knowledge cards, then it can rely on `status = "approved"` as the human approval gate while embeddings remain uncreated until Story 4.8.

## Spec Change Log

- 2026-07-08: Implemented Story 4.6 protected approval path for reviewable knowledge drafts, admin UI CTA/success copy, focused approval tests, and BMad status updates. No commit created per user instruction.

## Review Triage Log

### 2026-07-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 5, low 0)
- defer: 1: (high 0, medium 1, low 0)
- reject: 7
- addressed_findings:
  - `[medium]` `[patch]` Added approval-ready field validation before lifecycle transition so incomplete persisted drafts cannot become retrieval-eligible by status alone.
  - `[medium]` `[patch]` Rechecked linked-source provenance after the approval update inside the transaction before writing audit, reducing stale-read approval risk.
  - `[medium]` `[patch]` Added an explicit operator confirmation checkbox to the approve form to reduce accidental one-click approvals.
  - `[medium]` `[patch]` Added hidden `updatedAt` version checking so approval fails if the draft changed after the operator opened the page.
  - `[medium]` `[patch]` Included the approved draft id in the success redirect/message and redirected approval failures to the queue so errors are not lost on non-reviewable detail routes.

Deferred findings:
- First-class `approvedByUserId` and `approvedAt` columns are not required for Story 4.6 because approval provenance is recorded in audit events, but this may be useful for future card-level UI or retrieval diagnostics and was added to `deferred-work.md`.

## Design Notes

Approval intentionally does not normalize or rewrite draft fields again. Story 4.3 owns edit-time validation, and approval should preserve the operator-reviewed card exactly while changing lifecycle state and audit trail. The reviewable-draft loader remains the approval gate so orphan, rejected, duplicate, archived, approved, and non-review-needed records are all fail-closed.

## Verification

**Commands:**
- `pnpm test:run tests/knowledge-draft-review.test.ts` -- expected: focused draft review/approval coverage passes.
- `pnpm test:run tests/knowledge-draft-extraction.test.ts tests/knowledge-source-suggestions.test.ts tests/knowledge-batch-source-intake.test.ts` -- expected: adjacent intake/extraction/suggestion/batch lifecycle behavior still passes.
- `pnpm typecheck` -- expected: TypeScript strict checks pass.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm build` -- expected: production build succeeds.

**Results:**
- `pnpm test:run tests/knowledge-draft-review.test.ts` -- passed; 14 tests passed after review fixes. PostgreSQL emitted existing migration schema/relation notices.
- `pnpm test:run tests/knowledge-draft-extraction.test.ts tests/knowledge-source-suggestions.test.ts tests/knowledge-batch-source-intake.test.ts` -- passed; 3 files / 27 tests passed. Existing expected stderr appeared in provider failure-path tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `pnpm build` -- passed; Next.js production build completed successfully.

## Implementation Notes

- Added `approveKnowledgeDraft` as an operator/admin-protected service that authorizes before lookup, reuses the reviewable draft/source-link gate, sets `status = "approved"`, clears `needsReview`, preserves existing card fields and source links, and records an `approve` audit event without raw source material.
- Review hardening added approval-ready field validation, a post-update source-link recheck in the transaction, and an `updatedAt` form version guard to avoid approving content changed after page render.
- Added direct and form server actions for approval with safe Vietnamese error redirects and a success redirect back to the draft queue.
- Added explicit approval UI copy, a required confirmation checkbox, and queue success messaging clarifying that approval is lifecycle eligibility only and does not create embeddings.
- Extended draft review tests for approval success, queue/detail exclusion after approval, source-link preservation, safe audit content, invalid lifecycle/orphan failure, and authorization-before-side-effects.
- No embeddings, vector schema, URL fetching, AI calls, traveler provenance UI, auto-approval, or approved target-card mutation was added.

## Auto Run Result

Status: done

Summary: Implemented and review-hardened Story 4.6 end-to-end with protected approval service, server actions, admin approval CTA/confirmation/success copy, focused tests, and BMad tracking updates.

Acceptance criteria: complete. Approved cards now use `status = "approved"` and `needsReview = false` as the human approval gate, leave draft review APIs/UI, preserve source linkage and reviewed fields, and write a safe `approve` audit event. Approval also requires explicit confirmation and fails if the draft changed after page render.

Review findings breakdown: 5 medium patch findings fixed, 1 medium finding deferred, 7 findings rejected as already covered, speculative, or outside the Story 4.6 lifecycle-approval scope. Follow-up review recommended: true because review fixes touched approval safety, form semantics, and transactional guard behavior.

Verification performed: focused Story 4.6 draft review tests, adjacent intake/extraction/suggestion/batch tests, typecheck, lint, and production build all passed after review fixes.

Residual risks: Approval actor/time are audit-log-only rather than first-class columns on knowledge cards; deferred for future card-level provenance needs.

## File List

- `_bmad-output/implementation-artifacts/spec-4-6-approve-knowledge-for-retrieval.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/admin/knowledge/drafts/[draftId]/page.tsx`
- `src/app/admin/knowledge/drafts/page.tsx`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/review.ts`
- `tests/knowledge-draft-review.test.ts`
