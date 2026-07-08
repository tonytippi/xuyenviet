---
title: 'Story 4.4: AI Suggests Create Or Update From Source URL'
type: 'feature'
created: '2026-07-08'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: '845f91fbb29272c5cb91b2f4e0ca71cc244ff0d3'
final_revision: '845f91fbb29272c5cb91b2f4e0ca71cc244ff0d3-uncommitted'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-review-and-edit-ai-prepared-drafts.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Operators can extract new drafts from readable source material, but AI cannot yet compare source facts against existing draft/approved knowledge or classify whether a URL should create, update, conflict with, duplicate, or produce no useful knowledge. Without first-class suggestion metadata, later approval/retrieval stories cannot distinguish ordinary new drafts from proposed updates or conflicts.

**Approach:** Add a protected source suggestion workflow that loads safe existing knowledge summaries, asks the extraction model for structured action decisions, persists reviewable suggestion metadata with draft cards, and exposes the action/update/conflict context in admin review without modifying approved cards or exposing raw source material.

## Boundaries & Constraints

**Always:** Authorize operator/admin before source lookup, candidate comparison, model selection, provider call, usage write, audit write, or mutation. Require source kind `url` and readable stored `raw_source_material.rawText`; if URL fetching is not already supported, return a recoverable unsupported-material error rather than adding an external fetcher. Persist create/update/conflict suggestions as review-needed draft cards linked to the submitted source, with update/conflict target metadata and safe before/after summaries. Persist duplicate/no-action outcomes as non-retrievable review records or statuses with no approved/traveler-facing change. Compare against existing `draft` and `approved` cards using safe fields only, and keep confidence clamped by source metadata. Record AI usage and safe audit summaries for provider calls.

**Block If:** A required product decision cannot be represented with a small schema extension, such as a full approval workflow for applying updates, a source URL fetch/crawl provider choice, or a human-facing reject/duplicate taxonomy beyond create/update/conflict/duplicate/no-action.

**Never:** Do not approve cards, apply updates to approved cards, create embeddings, make any suggestion retrievable, expose raw source text/file metadata/storage keys/provider payloads, or let unauthenticated/traveler callers trigger comparison or mutation. Do not treat Facebook/community/copied content as official unless source metadata already supports that boundary.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Create suggestion | Operator runs suggestions for a URL source with readable text and no matching existing card | AI output creates one or more `draft`/`needsReview=true` cards with suggestion action `create`, primary source link, safe fields, usage event, and audit event | No error expected |
| Update suggestion | AI identifies newer or richer facts for an existing draft/approved card | A review-needed draft is created with suggestion action `update`, target card id, safe before/after summary, new source link, and no mutation to the target card | Existing card remains unchanged |
| Conflict suggestion | AI identifies conflicting facts against an existing card | A review-needed draft is created with suggestion action `conflict`, target card id, conflict summary, primary new source link, and target/source comparison visible only in admin review | Existing card and source links remain unchanged |
| Duplicate or no-action | AI classifies source content as duplicate or low-value | A non-retrievable duplicate/no-action record is persisted for audit/review trace, no approved card is created or changed, and the result is visible as an intake outcome | No traveler-facing knowledge changes occur |
| Unsupported URL | Source is not URL, does not exist, has no raw text, or extraction model is unavailable/fails | No knowledge card or target card mutation occurs | Operator sees a safe recoverable error; provider failures still record usage when available |
| Unauthorized caller | Traveler or unauthenticated caller invokes suggestion workflow | Authorization fails before lookup, validation, model/provider call, usage, audit, or mutation | No side effects occur |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- add durable suggestion fields or a compact proposal table for action type, target card, before/after/conflict summary, and review trace; keep DB checks aligned with non-retrievable duplicate/no-action states.
- `drizzle/migrations/*` -- add the schema migration for Story 4.4 proposal metadata and indexes.
- `src/features/ai/prompts.ts` -- add a source URL create/update suggestion prompt version that returns structured actions without raw snippets or provider metadata.
- `src/features/knowledge/extraction.ts` -- share or preserve extraction normalization/safety helpers where useful; keep existing draft extraction behavior compatible.
- `src/features/knowledge/suggestions.ts` -- implement server-only suggestion orchestration, safe candidate loading, model call, output parsing, persistence, usage, audit, and operational errors.
- `src/features/knowledge/review.ts` -- include safe suggestion metadata in queue/detail reads so operators can see create/update/conflict/duplicate/no-action context.
- `src/features/knowledge/actions.ts` -- expose protected service/action/form entrypoints for running source URL suggestions.
- `src/app/admin/knowledge/intake/page.tsx` -- add an operator-facing run-suggestions action and result/error messaging for URL sources.
- `src/app/admin/knowledge/drafts/page.tsx` -- show suggestion action labels in the review queue without raw material.
- `src/app/admin/knowledge/drafts/[draftId]/page.tsx` -- show safe update/conflict target context and before/after summary for review.
- `tests/knowledge-source-suggestions.test.ts` -- cover create/update/conflict/duplicate/no-action, authorization, provider failure, source support, privacy, audit, and usage behavior.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- move Story 4.4 through implementation statuses.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/*` -- add minimal persistent suggestion metadata for knowledge cards or source outcomes -- allow review and later approval stories to distinguish create/update/conflict/duplicate/no-action without mutating approved cards.
- [x] `src/features/ai/prompts.ts` -- add the Story 4.4 structured suggestion prompt and version -- make model output explicitly machine-parseable and privacy-bounded.
- [x] `src/features/knowledge/suggestions.ts` -- implement protected URL source suggestion orchestration with safe candidate comparison, parsing, normalization, confidence clamping, persistence, usage, audit, and idempotency guard -- centralize Story 4.4 business rules inside the knowledge boundary.
- [x] `src/features/knowledge/review.ts` -- load and return safe suggestion metadata with review queue/detail data -- let operators review proposed create/update/conflict decisions without raw source access.
- [x] `src/features/knowledge/actions.ts` and `src/app/admin/knowledge/intake/page.tsx` -- add server action and admin UI entry for URL source suggestions with safe success/error redirects -- make the workflow reachable from intake.
- [x] `src/app/admin/knowledge/drafts/page.tsx` and `src/app/admin/knowledge/drafts/[draftId]/page.tsx` -- render action badges plus update/conflict summaries and target card context -- support operator review of AI decisions.
- [x] `tests/knowledge-source-suggestions.test.ts` -- test the I/O matrix plus raw-source privacy and authorization-before-side-effects -- prevent regressions in the new suggestion flow.
- [x] `_bmad-output/implementation-artifacts/spec-4-4-ai-suggests-create-or-update-from-source-url.md` and `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update checkboxes, status, verification, notes, and file list as implementation progresses -- keep BMad artifacts aligned.

**Acceptance Criteria:**
- Given an operator runs suggestions for a readable URL source, when AI analyzes the source, then the system compares safe extracted facts against existing draft and approved knowledge and persists create/update/conflict/duplicate/no-action decisions for review.
- Given AI proposes a new useful fact, when persistence completes, then a source-linked review-needed draft exists and remains unapproved and non-retrievable.
- Given AI proposes an update or conflict for an existing card, when persistence completes, then the existing card is unchanged and the review draft records a safe target reference plus before/after or conflict summary.
- Given AI returns duplicate, low-value, invalid, or no useful knowledge, when the workflow completes or fails validation, then no approved/traveler-facing knowledge changes are made and the operator receives a safe outcome or recoverable error.
- Given an invalid source, unsupported URL without readable text, model failure, or unauthorized caller, when the workflow runs, then side effects are limited to allowed provider usage failure logging after authorization and no card mutation occurs.

## Spec Change Log

- 2026-07-08: Implemented Story 4.4 protected URL source suggestion workflow, durable suggestion metadata, admin review rendering, focused tests, and verification. No commit created per user instruction.

## Review Triage Log

- 2026-07-08: No deferred implementation findings. A parallel adjacent-test run hit shared test database contention; rerunning sequentially passed.

### 2026-07-08 — Follow-up code review
- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 0, medium 5, low 0)
- defer: 0
- dismiss: 6
- [x] [Review][Patch] Reject or explicitly handle over-limit suggestion arrays before persisting a partial run [`src/features/knowledge/suggestions.ts:339`] -- fixed by rejecting over-limit arrays before normalization/persistence and testing no partial writes.
- [x] [Review][Patch] Harden raw-source leak detection against punctuation-normalized and embedded copied snippets [`src/features/knowledge/suggestions.ts:463`] -- fixed by punctuation-normalized overlap checks plus sentence/window snippet detection.
- [x] [Review][Patch] Link conflict suggestion drafts to their new URL source as primary support, not conflicting support [`src/features/knowledge/suggestions.ts:177`] -- fixed by storing Story 4.4 suggestion draft source links as primary while conflict semantics stay in suggestion metadata.
- [x] [Review][Patch] Preserve provider usage telemetry for unexpected post-provider failures without masking the original operator error [`src/features/knowledge/suggestions.ts:215`] -- fixed by best-effort usage recording for any post-provider error.
- [x] [Review][Patch] Allow operators to rerun sources that only have trace-only duplicate/no-action outcomes or add a resolvable trace lifecycle [`src/features/knowledge/suggestions.ts:274`] -- fixed by blocking reruns only when reviewable create/update/conflict suggestions exist.

### 2026-07-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 9: (high 2, medium 6, low 1)
- defer: 0
- reject: 2: (high 0, medium 1, low 1)
- addressed_findings:
  - `[high]` `[patch]` Removed the 30-card candidate cap so Story 4.4 compares against all current draft/approved cards at MVP scale instead of silently missing older matches.
  - `[high]` `[patch]` Changed Story 4.4 source advisory locking to the same namespace as extraction so extraction and suggestion runs cannot race on the same source.
  - `[medium]` `[patch]` Required update suggestions to include before/after summaries and conflict suggestions to include conflict summaries in parsing and DB constraints.
  - `[medium]` `[patch]` Normalized and constrained action relationships so create/no-action cannot retain target cards, duplicate/no-action cannot retain suggested cards, and suggested/target cards cannot be the same row.
  - `[medium]` `[patch]` Added durable intake-page visibility for trace-only duplicate/no-action source suggestions.
  - `[medium]` `[patch]` Rechecked target card status inside the write transaction before inserting update/conflict/duplicate suggestions.
  - `[medium]` `[patch]` Made post-commit success usage writes best-effort so an already-persisted suggestion result is not reported as a false operator failure.
  - `[medium]` `[patch]` Extended raw-source privacy tests and validation to reject unsafe raw metadata values in suggestion summaries.
  - `[low]` `[patch]` Added DB relationship constraints and focused tests for malformed action relationships and missing required summaries.

## Design Notes

Use a compact first-class suggestion model instead of overloading free-text summaries. A suggested card can represent `create`, `update`, or `conflict`; `duplicate` and `no_action` can be persisted as non-review/review-trace outcomes, but they must not masquerade as approved knowledge. Keep later approval behavior out of scope: Story 4.4 prepares reviewable decisions only.

## Verification

**Commands:**
- `pnpm test:run tests/knowledge-source-suggestions.test.ts` -- expected: focused Story 4.4 suggestion coverage passes.
- `pnpm test:run tests/knowledge-draft-extraction.test.ts` -- expected: existing Story 4.2 extraction behavior remains compatible.
- `pnpm test:run tests/knowledge-draft-review.test.ts` -- expected: existing Story 4.3 review behavior remains compatible with suggestion metadata.
- `pnpm typecheck` -- expected: TypeScript strict checks pass.
- `pnpm lint` -- expected: no ESLint errors.
- `pnpm test:run` -- expected: full Vitest suite passes.
- `pnpm build` -- expected: production build succeeds.

**Results:**
- `pnpm typecheck` -- initially failed on nullable raw text in `src/features/knowledge/suggestions.ts`; fixed by narrowing after validation, reran, passed.
- `pnpm test:run tests/knowledge-source-suggestions.test.ts` -- initially failed because the manually added migration lacked Drizzle journal metadata; regenerated migration metadata with `pnpm db:generate`, reran, passed 5 tests. Expected provider-failure stderr appeared.
- `pnpm test:run tests/knowledge-draft-extraction.test.ts` -- first parallel run collided with another test process on the shared test database; reran sequentially, passed 13 tests. Expected provider-failure stderr appeared.
- `pnpm test:run tests/knowledge-draft-review.test.ts` -- first parallel run collided with another test process on the shared test database; reran sequentially, passed 11 tests.
- `pnpm lint` -- initially passed with 3 unused-import warnings; removed unused imports, reran, passed with no warnings.
- `pnpm test:run` -- passed; 14 files / 199 tests passed. Existing expected stderr appeared in AI Ask failure-path tests and provider-failure tests.
- `pnpm build` -- passed; Next.js production build completed successfully.
- Review patch verification: `pnpm typecheck` -- passed.
- Review patch verification: `pnpm test:run tests/knowledge-source-suggestions.test.ts` -- passed; 6 tests passed. Expected provider-failure stderr appeared.
- Review patch verification: `pnpm test:run tests/knowledge-draft-extraction.test.ts` -- passed; 13 tests passed. Expected provider-failure stderr appeared.
- Review patch verification: `pnpm test:run tests/knowledge-draft-review.test.ts` -- passed; 11 tests passed.
- Review patch verification: `pnpm lint` -- passed.
- Review patch verification: `pnpm test:run` -- passed; 14 files / 200 tests passed. Existing expected stderr appeared in AI Ask and provider-failure tests.
- Review patch verification: `pnpm build` -- passed.
- Follow-up review patch verification: `pnpm test:run tests/knowledge-source-suggestions.test.ts` -- passed; 7 tests passed. Expected provider-failure stderr appeared.
- Follow-up review patch verification: `pnpm typecheck` -- passed.
- Follow-up review patch verification: `pnpm lint` -- passed.

## Implementation Notes

- Added `knowledge_source_suggestions` as compact first-class proposal metadata linked to source, optional suggested draft card, optional target card, action, safe summaries, prompt/model, and actor.
- Added server-only URL suggestion orchestration that authorizes first, requires `kind=url` plus readable raw text, loads safe draft/approved candidates, calls the extraction model with a structured prompt, normalizes/clamps/sanitizes output, persists review-needed drafts for create/update/conflict, and persists duplicate/no-action trace rows without card mutation.
- Existing approved/draft target cards are never mutated by the suggestion workflow; approval, retrieval, and embeddings remain out of scope.
- Review queue/detail now returns and renders safe suggestion action, rationale, before/after/conflict summaries, and target card context without loading raw source material.
- Added intake form action and UI for running Story 4.4 suggestions from a source ID.
- Review fixes hardened candidate coverage, same-source concurrency, required update/conflict summaries, action relationship constraints, target revalidation, trace-only outcome visibility, raw metadata privacy checks, and post-commit usage failure behavior.
- Follow-up review fixes reject over-limit model output instead of partial persistence, harden copied raw-snippet detection, preserve conflict draft source links as primary support, make post-provider usage telemetry best-effort for all error types, and allow reruns after trace-only duplicate/no-action outcomes.

## Auto Run Result

Status: done

Summary: Implemented and review-hardened Story 4.4 end-to-end with durable suggestion metadata, structured prompt, protected orchestration, admin UI/review rendering, tests, migration metadata, and BMad tracking updates.

Acceptance criteria: complete. All create/update/conflict/duplicate/no-action, invalid source/model/provider failure, authorization-before-side-effects, privacy, audit, usage, and no-target-mutation paths are covered by focused tests.

Review findings breakdown: 9 patch findings fixed, 0 deferred, 2 rejected as non-blocking/noise. Follow-up review recommended: true because review-driven fixes touched data integrity, concurrency, schema constraints, privacy validation, and operator-visible workflow behavior.

Verification performed: focused Story 4.4 tests, adjacent Story 4.2 and 4.3 tests, typecheck, lint, full Vitest suite, and production build all passed after review fixes.

Residual risks: Applying update/conflict suggestions during approval remains intentionally deferred to later stories. URL fetching/crawling was not added; Story 4.4 requires existing stored readable raw text.

## File List

- `_bmad-output/implementation-artifacts/spec-4-4-ai-suggests-create-or-update-from-source-url.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0018_slow_betty_brant.sql`
- `drizzle/migrations/0019_nifty_gorilla_man.sql`
- `drizzle/migrations/meta/0018_snapshot.json`
- `drizzle/migrations/meta/0019_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/app/admin/knowledge/drafts/[draftId]/page.tsx`
- `src/app/admin/knowledge/drafts/page.tsx`
- `src/app/admin/knowledge/intake/page.tsx`
- `src/db/schema.ts`
- `src/features/ai/prompts.ts`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/review.ts`
- `src/features/knowledge/suggestions.ts`
- `tests/knowledge-source-suggestions.test.ts`
