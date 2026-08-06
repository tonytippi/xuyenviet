---
story_id: 17-1
status: done
created: 2026-08-06
epic: 17
---

# Story 17.1: Align Admin Guides With the Current Knowledge Flow

## Story

As a knowledge operator,
I want the in-product operating guides to describe the current source-to-retrieval flow and each operational surface,
so that I can take safe actions without confusing technical processing with knowledge publication.

## Scope

- Update the deployed `apps/admin/app/guides` landing, data-flow, data-state, and daily-routine pages.
- Explain Intake source kind and current-capture status without treating it as publication.
- Separate capture/evidence, technical ingestion jobs, immutable candidate outcomes, card lifecycle/retrieval, and version-fenced operational requests.
- Preserve direct-admin, safe-projection, and presentation-only boundaries.

## Acceptance Criteria

1. Intake is described as URL registration with kind and current-capture visibility; its processed status does not imply job completion, active publication, or AI retrieval.
2. Facebook and YouTube guidance distinguishes immutable capture/evidence from the canonical technical ingestion job, including mixed candidate outcomes and UI-gated rerun/recapture actions.
3. Card, retrieval, coverage, indexing, and operational-work guidance matches the Epic 15 target lifecycle: retrieval requires an `active` card, verification requirement `none`, and eligible evidence/source.
4. Recovery guidance tells operators to record the affected source, capture/job, card, or recommendation and transfer the issue. It never recommends direct database edits, fence bypasses, duplicate re-submission, raw-material disclosure, or publication inference from technical status.
5. Focused guide boundary tests and admin typecheck pass without adding database, domain, worker, BFF, or server-action dependencies to `apps/admin`.

## Authority

- `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md`: FR-23, FR-23C, FR-24D, FR-25A, FR-28A, FR-45A, FR-51 through FR-57.
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md`: AD-7, AD-7A, AD-17 and the canonical source-linkage contract.
- `_bmad-output/planning-artifacts/epics.md`: Epic 15 target lifecycle and Story 17.1 acceptance criteria.

## Files

- `apps/admin/app/guides/page.tsx`
- `apps/admin/app/guides/data-flow/page.tsx`
- `apps/admin/app/guides/data-states/page.tsx`
- `apps/admin/app/guides/operating-routine/page.tsx`
- `tests/admin-operator-guide.test.ts`

## Verification

- `pnpm test:unit tests/admin-operator-guide.test.ts tests/admin-knowledge-views-ui-boundary.test.ts`
- `pnpm --filter @xuyenviet/admin typecheck`
- `git diff --check`

## Completion Evidence

- `pnpm test:unit tests/admin-operator-guide.test.ts tests/admin-knowledge-views-ui-boundary.test.ts` passed: 2 files, 9 tests.
- `pnpm --filter @xuyenviet/admin typecheck` passed.
- `git diff --check` passed.
