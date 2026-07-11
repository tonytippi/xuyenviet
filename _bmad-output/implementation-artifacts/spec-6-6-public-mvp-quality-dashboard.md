---
title: '6.6 Public MVP Quality Dashboard'
type: 'feature'
created: '2026-07-11'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'bb526b0b7b1016d986b83772e9001e8e30cfb603'
final_revision: 'uncommitted working tree based on bb526b0b7b1016d986b83772e9001e8e30cfb603'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-5-run-public-mvp-answer-evaluation-prompt-set.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** XuyenViet now stores traveler usefulness feedback, evaluation runs, rubric scores, counter-metric flags, retrieval decisions, and provenance, but operators have no safe dashboard to judge public MVP answer quality or readiness.

**Approach:** Add a protected admin/operator quality dashboard that aggregates existing Feedback/Eval signals, supports prompt-type and time-range filters, shows missing-signal states, and exposes safe retrieval/provenance diagnostics without raw source material or provider payloads.

## Boundaries & Constraints

**Always:** Use existing PostgreSQL tables and Drizzle queries; require admin/operator access before returning dashboard data; keep dashboard copy Vietnamese-first; show insufficient-data/missing-signal states instead of claiming readiness; trace quality issues through stored evaluation result links, assistant retrieval decisions, and assistant response provenance categories. Aggregate or truncate user comments safely.

**Block If:** Readiness thresholds require a product decision beyond the Epic 6/PRD success signals, or implementation would need to expose raw source material, operator-only notes, provider payloads, secrets, or traveler-only private conversation content beyond safe IDs/aggregates.

**Never:** Do not add new persistence tables, run live evaluation automatically on page load, create traveler-facing dashboard UI, expose raw source material, add rewards/credits, or treat evaluator scores as traveler usefulness feedback.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open dashboard with data | Admin/operator opens `/admin/quality` with feedback and evaluation rows | Shows usefulness totals/rates, evaluation score summaries, counter-metric counts, readiness progress, and recent result diagnostics | No error expected |
| Filter dashboard | Query has `promptType` and/or `range` | Evaluation aggregates and recent results are limited to the selected prompt type and time window; feedback uses the same time window | Invalid filters fall back to safe defaults |
| Missing signals | No feedback, no scored evals, or incomplete magic-moment data | Dashboard explicitly reports missing signals and does not claim readiness success | No error expected |
| Review provenance | Evaluated result links to assistant message, retrieval decision, and provenance rows | Recent result shows whether chat/trip context, approved knowledge, web search, and general reasoning were used plus likely retrieval/source issue signals | Missing links are labeled unavailable, not silently ignored |
| Unauthorized access | Traveler or unauthenticated user requests dashboard data | No dashboard data is returned from feature helper; admin layout blocks the route | Return unauthorized result from helper |

</intent-contract>

## Code Map

- `src/features/feedback/quality-dashboard.ts` -- New server-only read model for quality dashboard authorization, filters, aggregates, readiness, and safe recent-result diagnostics.
- `src/app/admin/quality/page.tsx` -- New admin/operator dashboard route with Vietnamese-first filter UI, aggregate cards, readiness/missing-signal states, counter metrics, and recent diagnostics.
- `src/app/admin/layout.tsx` -- Add the quality dashboard to admin navigation.
- `src/db/schema.ts` -- Existing feedback/evaluation/retrieval/provenance tables to query; no schema changes expected.
- `tests/public-mvp-quality-dashboard.test.ts` -- New coverage for authorization, filters, aggregates, readiness missing-signal behavior, and safe provenance/retrieval diagnostics.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 6.6 in-progress/review/done as work advances.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/feedback/quality-dashboard.ts` -- Add `getPublicMvpQualityDashboard(input)` with admin/operator guard, prompt/time filters, feedback aggregates, evaluation score averages, counter-metric counts, readiness calculations, missing-signal messages, and safe recent result diagnostics -- provides a testable server read model.
- [x] `src/app/admin/quality/page.tsx` -- Render the dashboard from the read model with GET filters for prompt type and range, aggregate cards, readiness section, counter metrics, and recent result/source diagnostics -- gives operators a usable protected surface.
- [x] `src/app/admin/layout.tsx` -- Add a navigation link to `/admin/quality` -- makes the dashboard discoverable in the existing admin shell.
- [x] `tests/public-mvp-quality-dashboard.test.ts` -- Cover the edge-case matrix with test DB fixtures for feedback, evaluation results/scores, retrieval decisions, provenance categories, unauthorized access, filter behavior, and no raw payload leakage -- verifies dashboard behavior without provider calls.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- Keep Story 6.6 status, verification, file list, and auto-run result aligned -- preserves BMad workflow state.

**Acceptance Criteria:**
- Given user feedback and evaluation runs exist, when an admin opens the quality dashboard, then they can see usefulness ratings, evaluation scores, and counter-metric flags, and results are filterable by prompt type or time range.
- Given provenance and retrieval decisions exist for evaluated answers, when quality results are reviewed, then the admin can inspect whether answers used chat/trip context, approved knowledge, web search, or general reasoning, and low-quality answers can be traced to likely retrieval/source issues.
- Given public MVP success criteria are checked, when the dashboard calculates readiness, then it reports progress against Epic 6 thresholds and identifies missing signals instead of claiming success without enough data.
- Given a traveler or unauthenticated actor attempts to load dashboard data, when the read helper runs, then it returns unauthorized and does not expose aggregates or diagnostics.
- Given automated tests run, when dashboard behavior is verified, then no real AI provider, web-search provider, or live database outside the configured test database is required.

## Spec Change Log

- 2026-07-11 -- Implemented public MVP quality dashboard read model, admin UI, nav link, and focused tests. Status moved to in-review.

## Review Triage Log

### 2026-07-11 — Code review pass 2
- decision_needed: 1 resolved
- patch: 2: (high 0, medium 2, low 0), both applied
- defer: 0
- dismissed: 5
- addressed_findings:
  - `[medium]` `[patch]` Applied Tony's decision to require readiness usefulness feedback to be linked to magic-moment evaluated answers instead of global answer feedback.
  - `[medium]` `[patch]` Counted provenance categories as used only when stored provenance was used in the prompt or cited in the answer.

### Review Findings
- [x] [Review][Decision] Decide whether readiness must require magic-moment-specific usefulness feedback — Resolved by Tony: require magic-moment-specific usefulness feedback. Implemented in `src/features/feedback/quality-dashboard.ts` with regression coverage.
- [x] [Review][Patch] Count provenance categories as used only when provenance was actually used or cited [src/features/feedback/quality-dashboard.ts:257]

### 2026-07-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 4, low 2)
- defer: 1: (high 0, medium 0, low 1)
- reject: 2
- addressed_findings:
  - `[medium]` `[patch]` Applied prompt-type filtering to feedback by intersecting feedback assistant messages with filtered evaluation results, preventing prompt-specific dashboards from showing global feedback totals/comments.
  - `[medium]` `[patch]` Replaced unbounded score loading with score queries limited to filtered scored result IDs.
  - `[medium]` `[patch]` Limited averages/readiness score inputs to scored results and required complete rubric dimensions for readiness sample counts.
  - `[medium]` `[patch]` Preserved the active range in recent-result prompt quick-filter links.
  - `[low]` `[patch]` Avoided duplicate React keys for repeated feedback comments.
  - `[low]` `[patch]` Added time-range and prompt-linked feedback coverage to dashboard tests.

## Design Notes

Readiness should be conservative: magic-moment score should not pass until scored magic-moment results exist; feedback threshold should not pass until at least 10 usefulness feedback rows exist; generic comparison should not pass until at least 10 evaluated results exist. If counts are below those sample sizes, report the current progress and missing sample count.

## Verification

**Commands:**
- `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` -- expected: dashboard read-model tests pass.
- `pnpm typecheck` -- expected: TypeScript passes.
- `pnpm lint` -- expected: ESLint passes.
- `pnpm build` -- expected: production build passes.

**Results:**
- `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` -- passed, 4 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.
- Review patch: `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` -- first run failed because the expected readiness message changed after complete-score wording; fixed the assertion.
- Review patch: `pnpm typecheck` -- first run failed because the readiness score-row type omitted `dimension`; fixed the type annotation.
- Review patch: `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` -- passed, 5 tests.
- Review patch: `pnpm typecheck` -- passed.
- Review patch: `pnpm lint` -- passed.
- Review patch: `pnpm build` -- passed.
- Code review pass 2 patch: `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` -- first run failed because one existing missing-signal assertion still expected the old generic usefulness message; fixed the assertion.
- Code review pass 2 patch: `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` -- passed, 7 tests.
- Code review pass 2 patch: `pnpm typecheck` -- first two attempts failed because they were run in parallel with `pnpm build` before `.next/types` existed; reran after successful build.
- Code review pass 2 patch: `pnpm lint` -- passed.
- Code review pass 2 patch: `pnpm build` -- passed.
- Code review pass 2 patch: `pnpm typecheck` -- passed after `.next/types` were regenerated by build.

## Dev Agent Record

### Completion Notes

- Added a server-only `getPublicMvpQualityDashboard` read model with admin/operator authorization, safe filter normalization, usefulness feedback aggregates, evaluation score/counter-metric summaries, conservative readiness checks, and safe recent diagnostics over retrieval/provenance links.
- Added `/admin/quality` as a protected admin route using existing admin shell styling and Vietnamese-first copy, with prompt/range filters, aggregate cards, readiness states, counter metrics, feedback comments, and recent result diagnostics.
- Added the admin navigation link for the MVP quality dashboard.
- Added focused DB-backed tests for unauthorized access, aggregation/readiness, prompt/range filter behavior, missing-signal states, retrieval/provenance diagnostics, and raw payload leakage guardrails.
- Review patches tightened prompt-specific feedback filtering, bounded score reads, complete-score readiness math, quick-filter range preservation, duplicate comment keys, and time-range test coverage.
- Code review pass 2 patches tightened readiness to require magic-moment-linked usefulness feedback and made provenance diagnostics count only actually used or cited source rows.
- No schema changes or migrations were needed.
- No commit was created because repository rules require explicit user approval before committing.

### File List

- `src/features/feedback/quality-dashboard.ts`
- `src/app/admin/quality/page.tsx`
- `src/app/admin/layout.tsx`
- `tests/public-mvp-quality-dashboard.test.ts`
- `_bmad-output/implementation-artifacts/spec-6-6-public-mvp-quality-dashboard.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/deferred-work.md`

## Auto Run Result

Status: done

Summary: Implemented Story 6.6 by adding a protected public MVP quality dashboard read model, admin dashboard route, navigation entry, review patches, and focused automated coverage over existing feedback/evaluation/retrieval/provenance tables.

Files changed:
- `src/features/feedback/quality-dashboard.ts` -- New server-only read model with authorization, filters, aggregates, readiness, missing-signal states, and safe recent diagnostics.
- `src/app/admin/quality/page.tsx` -- New admin route UI for dashboard filters, metrics, readiness, counter metrics, comments, and diagnostics.
- `src/app/admin/layout.tsx` -- Added `/admin/quality` nav link.
- `tests/public-mvp-quality-dashboard.test.ts` -- Added focused DB-backed dashboard tests, including prompt-linked feedback and time-range coverage.
- `tests/public-mvp-quality-dashboard.test.ts` -- Added focused DB-backed dashboard tests, including prompt-linked feedback, magic-moment readiness feedback, unused provenance handling, and time-range coverage.
- `_bmad-output/implementation-artifacts/spec-6-6-public-mvp-quality-dashboard.md` -- Recorded implementation, verification, file list, and status.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Marked Story 6.6 done.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- Recorded future PII-aware feedback-comment redaction/classification hardening.

Review findings breakdown: 6 patches applied, 1 low-priority item deferred conceptually to future privacy hardening, 2 rejected. Follow-up review recommendation: false.

Verification performed:
- `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` -- passed, 5 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.

Residual risks: Readiness thresholds follow the spec's conservative sample-size rules and existing Epic 6 signals; final product threshold semantics can still be tuned later without schema changes. Feedback comments are truncated and admin-only but not PII-classified beyond existing feedback validation.
