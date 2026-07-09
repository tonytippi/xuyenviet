---
title: 'Story 5.8: Validate Web Search Fallback Quality'
type: 'feature'
created: '2026-07-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-7-uncertainty-and-freshness-warnings.md'
warnings: []
baseline_revision: 'c14374b'
final_revision: 'c14374b'
---

<intent-contract>

## Intent

**Problem:** Web search fallback is implemented through a Tavily adapter, but the product has not yet captured an explicit, repeatable quality validation for Vietnamese corridor queries, official/provider preference, metadata availability, costs, limits, and safe failure behavior. Without that validation, the MVP could depend on weak or misleading external search results for freshness-sensitive travel answers.

**Approach:** Add a small reusable web-search quality evaluation seam with deterministic fixtures and a checked-in validation report. Use it to score provider/mechanism results for required metadata, official/provider preference, source safety, and operational risk without coupling answer grounding or source UI to Tavily-specific behavior.

## Boundaries & Constraints

**Always:** Keep web search behind the existing adapter; preserve all web confidence as `unverified`; keep official/provider preference as validation criteria rather than approved knowledge; use deterministic tests/fixtures instead of live provider calls for CI; document cost, limits, failure behavior, and MVP recommendation in BMad artifacts.

**Block If:** Satisfying the story requires a live Tavily/API key check in normal tests, a new provider contract, schema changes for persisted evaluation runs, or product decisions about paid provider adoption beyond a documented MVP recommendation.

**Never:** Do not treat web results as approved XuyenViet knowledge, expose raw provider payloads or secrets, make traveler UI depend on Tavily fields, add booking/payment/credit behavior, or weaken existing failure/privacy/source-label safeguards.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vietnamese corridor validation | Candidate results for Hanoi-HCMC route, Hue ticket, ferry/schedule, hotel availability, and weather/road-condition style queries | Evaluation records usable Vietnamese sources, titles, URLs, snippets/content, checked dates when available, provider score availability, source-type mix, and pass/fail notes | Missing metadata lowers score and appears in report findings |
| Official/provider preference | Result set contains official `.gov.vn`, provider-looking, general, and community/repost entries | Evaluation shows whether official/provider entries are preferred and confirms community/repost entries are not promoted to official | Spoofed URL/title official claims remain non-official and are flagged |
| Provider limits and failures | Candidate has missing API key, timeout, provider error, invalid response, low-quality result, cost/rate-limit risk | Evaluation documents safe failure behavior and operational risks without blocking normal answer generation | Existing warning-only fallback codes remain the runtime behavior |
| Provider independence | Chosen provider may change later | Validation output references provider-specific risks only in the report; runtime source bundle/provenance contracts stay generic | No UI/source display behavior depends on Tavily-only fields |

</intent-contract>

## Code Map

- `src/features/retrieval/web-search.ts` -- Existing Tavily adapter, normalization, source classification, privacy minimization, and safe failure codes; expose reusable quality evaluation types/functions here or in a sibling retrieval module.
- `src/features/retrieval/web-search-quality.ts` -- New server-only quality evaluator for normalized candidate results and operational metadata.
- `tests/web-search-adapter.test.ts` -- Existing adapter coverage for normalization, failures, privacy, source capture, and spoofing.
- `tests/web-search-quality.test.ts` -- New deterministic validation coverage for Story 5.8 scenarios.
- `_bmad-output/implementation-artifacts/web-search-fallback-quality-report.md` -- Checked-in validation report and MVP recommendation.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep Story 5.8 status aligned.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/retrieval/web-search-quality.ts` -- Add deterministic provider/mechanism quality evaluator with query/result metadata scoring, official/provider preference checks, source-safety flags, and operational risk summary -- make validation repeatable without live provider calls.
- [x] `tests/web-search-quality.test.ts` -- Cover Vietnamese corridor metadata scoring, official/provider preference, spoofed/community source handling, failure/cost/rate-limit documentation, and provider-independent output -- protect Story 5.8 behavior.
- [x] `_bmad-output/implementation-artifacts/web-search-fallback-quality-report.md` -- Record validation scope, fixture-based findings, Tavily MVP recommendation/risks, cost/limits assumptions, and fallback behavior -- satisfy product validation artifact requirement.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 5.8 in progress/review/done as implementation advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given web search fallback validation runs against Vietnamese corridor query fixtures, when the evaluator completes, then it records usable source language, title, URL, snippet/content, checked-date availability, provider score/ranking signal availability, and metadata gaps.
- Given candidate results include official/provider, general, and community/repost sources, when validation scores source preference, then official/provider-looking results are preferred where available and reposted or unattributed community sources are not treated as official.
- Given provider limits, cost, or failures are part of the validation input, when the report is generated, then it documents rate-limit/pricing concerns, failure behavior, fallback behavior, operational risks, and a recommended MVP provider or fallback approach.
- Given provider implementation may change later, when Story 5.8 is complete, then existing answer grounding, source display, unverified labels, and runtime fallback behavior remain provider-independent.

## Spec Change Log

## Review Triage Log

### Review Findings

- [x] [Review][Patch] Unsafe community/spoofed source flags can still pass validation [src/features/retrieval/web-search-quality.ts:117]
- [x] [Review][Patch] Evaluation output does not expose per-candidate metadata needed to audit source language and metadata availability [src/features/retrieval/web-search-quality.ts:47]
- [x] [Review][Patch] Invalid checked-at values count as available freshness metadata [src/features/retrieval/web-search-quality.ts:100]

### 2026-07-09 — Follow-up review patch
- patch: 3 fixed (medium 3)
- addressed_findings:
  - `[medium]` `[patch]` Unsafe community-promoted or spoofed-official source flags now block query pass status instead of only lowering the score.
  - `[medium]` `[patch]` Query evaluations now include per-candidate metadata availability and detected source-language audit fields.
  - `[medium]` `[patch]` `checkedAt` metadata now counts only valid `Date` or parseable date-string values.

### 2026-07-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 9: (high 0, medium 7, low 2)
- defer: 0
- reject: 10: (high 0, medium 4, low 6)
- addressed_findings:
  - `[medium]` `[patch]` Empty validation runs can no longer pass; overall pass now requires at least one evaluated query.
  - `[medium]` `[patch]` Unranked candidate order is now preserved so the evaluator does not invent official/provider preference by re-sorting provider output.
  - `[medium]` `[patch]` Top-community and spoof flags now evaluate the preserved/ranked order, with regression coverage for unranked community-first output.
  - `[medium]` `[patch]` Rank now counts as a valid ranking signal when provider scores are unavailable.
  - `[medium]` `[patch]` `expectedLanguage` now affects source usability scoring for Vietnamese, English, and mixed fixtures.
  - `[medium]` `[patch]` Vietnamese usability now handles unaccented Vietnam place-name/travel signals and NFC-normalized text.
  - `[medium]` `[patch]` Query-level provider failure codes now force query failure even when candidate metadata is otherwise strong.
  - `[low]` `[patch]` Spoofed official-claim detection now includes snippet/content and flags provider-typed official claims unless the source is actually official.
  - `[low]` `[patch]` The validation output and report now include explicit source-type counts instead of overstating source mix from only top source type.

## Design Notes

Story 5.8 is a validation story, not a runtime provider migration. The smallest useful implementation is a deterministic evaluator plus report that can be rerun or extended when live provider data is available. Runtime search remains warning-only on failure and traveler-facing trust labels continue to come from generic web result/provenance fields.

## Verification

**Commands:**
- `pnpm test:run tests/web-search-quality.test.ts tests/web-search-adapter.test.ts` -- expected: Story 5.8 and existing adapter regressions pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Added a deterministic server-only web-search fallback quality evaluator for normalized candidate metadata, source preference, source-safety flags, operational risks, and MVP recommendation text.
- Added fixture-based regression tests for Vietnamese corridor metadata scoring, official/provider preference, spoofed/community source handling, safe failures/cost/rate limits, and provider-independent output.
- Added a checked-in validation report documenting fixture scope, Tavily MVP recommendation, risks, cost/limits assumptions, and warning-only fallback behavior.

### Verification Results

- `pnpm test:run tests/web-search-quality.test.ts tests/web-search-adapter.test.ts` -- passed, 12 tests.
- `pnpm typecheck` -- passed.
- `pnpm test:run tests/web-search-quality.test.ts tests/web-search-adapter.test.ts` -- passed, 14 tests after first review patch.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed after first review patch.
- `pnpm build` -- passed.
- `pnpm test:run tests/web-search-quality.test.ts tests/web-search-adapter.test.ts` -- passed, 16 tests after final review patch.
- `pnpm lint` -- passed after final review patch.
- `pnpm typecheck` -- passed after final review patch.
- `pnpm build` -- passed after final review patch.
- `pnpm test:run tests/web-search-quality.test.ts tests/web-search-adapter.test.ts` -- passed, 18 tests after follow-up review patch.
- `pnpm lint` -- passed after follow-up review patch.
- `pnpm typecheck` -- initially failed when run concurrently with `pnpm build` because `.next/types` files were regenerated during TypeScript program loading; rerun standalone passed.
- `pnpm build` -- passed after follow-up review patch.

### Change Log

- 2026-07-09: Implemented deterministic web-search fallback quality evaluator, fixture tests, validation report, and sprint-status review update.
- 2026-07-09: Applied review patches for empty-run pass behavior, provider-order preservation, ranking-signal handling, language scoring, spoof/failure handling, source-type counts, and full verification.
- 2026-07-09: Applied follow-up review patches for unsafe source pass blocking, per-candidate metadata audit output, and checked-date validation.

### File List

- `_bmad-output/implementation-artifacts/spec-5-8-validate-web-search-fallback-quality.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/web-search-fallback-quality-report.md`
- `src/features/retrieval/web-search-quality.ts`
- `tests/web-search-quality.test.ts`

## Auto Run Result

Status: done

Summary: Implemented Story 5.8 web-search fallback quality validation. Added a deterministic server-only evaluator for Vietnamese corridor/provider fixture quality, metadata completeness, source preference, source-safety flags, operational risk, and MVP recommendation text. Added a checked-in validation report recommending Tavily only as an unverified, warning-only MVP fallback behind the existing adapter.

Files changed:
- `_bmad-output/implementation-artifacts/spec-5-8-validate-web-search-fallback-quality.md` -- recorded spec, task completion, review triage, verification, file list, and auto-run result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 5.8 done.
- `_bmad-output/implementation-artifacts/web-search-fallback-quality-report.md` -- documented validation scope, fixture findings, source preference, operational risks, MVP recommendation, and verification command.
- `src/features/retrieval/web-search-quality.ts` -- added deterministic quality evaluator with provider-order preservation, language-aware usability scoring, ranking-signal metadata, source-type counts, safe-failure handling, and operational recommendation output.
- `tests/web-search-quality.test.ts` -- added fixture regressions for metadata scoring, source preference/safety, failures, provider independence, empty runs, rank-only metadata, unaccented place names, unranked order, expected-language behavior, per-candidate audit output, unsafe source pass blocking, and invalid checked dates.

Review findings breakdown: 9 patch findings fixed (0 high, 7 medium, 2 low), 0 deferred, 10 rejected.

Follow-up review recommendation: true, because review-driven changes materially corrected evaluator pass/fail semantics and provider-order handling.

Verification performed:
- `pnpm test:run tests/web-search-quality.test.ts tests/web-search-adapter.test.ts` -- passed, 16 tests final.
- `pnpm lint` -- passed final.
- `pnpm typecheck` -- passed final.
- `pnpm build` -- passed final.

Residual risks:
- The validation report is deterministic fixture-based; live Tavily quality, cost, and rate-limit behavior still need operational monitoring before public scale.
- No commit was created because repository instructions require explicit user approval before committing.
