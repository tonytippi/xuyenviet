---
title: 'Story 5.7: Uncertainty And Freshness Warnings'
type: 'feature'
created: '2026-07-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-6-render-source-and-confidence-section.md'
warnings: []
baseline_revision: 'fe66e59'
final_revision: 'fe66e59'
---

<intent-contract>

## Intent

**Problem:** AI Ask can retrieve approved knowledge, web results, and stored provenance, but answer generation and source display do not yet enforce Story 5.7 warnings strongly enough for changing or unverified travel details. Travelers could over-trust prices, schedules, availability, road conditions, opening hours, weather, service status, promotions, web results, or community/Facebook-derived material.

**Approach:** Strengthen the source-bundle and answer prompts so freshness-sensitive or web-derived details require clear Vietnamese verification guidance, and make the provenance UI labels explicit that web/community items are external or community information rather than approved official knowledge.

## Boundaries & Constraints

**Always:** Keep warnings Vietnamese-first and traveler-readable; preserve the context priority order; label all web search facts as external/unverified unless they come from approved knowledge provenance; warn users to verify before acting or booking when freshness-sensitive cards or web results influence changing details; keep community/Facebook-derived content distinct from official/provider sources unless metadata explicitly supports official/provider status.

**Block If:** Implementation requires changing retrieval/provenance table schema, exposing raw source material or operator-only notes, adding a new web provider, or deciding a new trust taxonomy beyond the existing source category/source type/verification status fields.

**Never:** Do not parse assistant answer text to infer warnings, do not mark web search as verified or approved, do not promote community/Facebook content to official from URL text alone, and do not add booking, payment, credit, reward, or provider-specific UI behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Freshness-sensitive answer | Retrieval decision has `freshnessRequired: true` because the question asks about price, schedule, availability, road condition, opening hours, weather, service status, or promotion, or selected approved cards are freshness-sensitive | Source-bundle prompt requires a concise `Cảnh báo cần kiểm tra`-style warning to verify before acting or booking | If web has no usable data, answer must say current details cannot be verified instead of inventing freshness claims |
| Web result used | Web source rows appear in the source bundle or provenance | Prompt and UI identify web data as external/unverified and not approved XuyenViet knowledge | Low-quality or failed web search keeps the no-fabrication warning |
| Web source type looks official | A web result has `sourceType: official` or `provider` but `sourceCategory: web` | UI may show the source type, but still labels trust as external/unverified and does not imply approved official knowledge | Existing unverified confidence behavior remains intact |
| Community/Facebook-derived content used | A web or source provenance item has `sourceType: community` | UI labels it as community material and not official unless metadata explicitly marks official/provider through an approved source path | No automatic trust upgrade occurs |

</intent-contract>

## Code Map

- `src/features/ai/prompts.ts` -- AI Ask system prompt; add explicit uncertainty/freshness/web/community answer rules.
- `src/features/retrieval/source-bundle.ts` -- Source-bundle prompt; make freshness-required and unverified web instructions direct in all bundle sizes.
- `src/features/ai/ai-ask-composer.tsx` -- Provenance UI; render safer Vietnamese labels for web, official/provider-looking web, and community source types.
- `src/features/retrieval/provenance.ts` -- Provenance DTO freshness mapping; ensure web provenance reflects freshness-required decisions when applicable without schema changes.
- `tests/answer-context.test.ts` -- Regression tests for source-bundle freshness warnings and web unverified instructions.
- `tests/ai-ask-shell.test.ts` -- Regression tests for traveler-facing provenance labels and freshness warning display.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep Story 5.7 status aligned.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/prompts.ts` -- Add explicit Story 5.7 answer rules for freshness-sensitive details, web unverified labeling, and community/Facebook official-source limits -- prevent model overclaiming.
- [x] `src/features/retrieval/source-bundle.ts` -- Add direct freshness-required and unverified-web instructions to full, compacted, and minimal prompt paths -- ensure warnings survive context compaction.
- [x] `src/features/retrieval/provenance.ts` -- Mark web provenance freshness-sensitive when the retrieval decision requires freshness, while preserving web `unverified` confidence -- make UI warnings consistent with answer context.
- [x] `src/features/ai/ai-ask-composer.tsx` -- Replace raw source-type display with safe Vietnamese labels that distinguish web external/unverified, official/provider-looking web, and community sources -- avoid trust ambiguity.
- [x] `tests/answer-context.test.ts` and `tests/ai-ask-shell.test.ts` -- Add regression coverage for all matrix scenarios -- protect Story 5.7 behavior.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 5.7 in progress/review/done as implementation advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given an answer includes price, schedule, availability, road condition, opening hours, weather, service status, or promotion details from freshness-sensitive cards or web search, when the answer is generated and displayed, then it warns the user in Vietnamese to verify before acting or booking.
- Given information comes from web search, when it appears in prompt context or source display, then it is labeled external/unverified unless it has been approved into knowledge cards.
- Given Facebook-derived or community content is used, when it appears in source display, then it is not presented as official unless source metadata identifies an official/provider page.

## Spec Change Log

## Review Triage Log

### 2026-07-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 1, low 2)
- defer: 0
- reject: 4: (high 0, medium 2, low 2)
- addressed_findings:
  - `[high]` `[patch]` Prompt-only warning enforcement could let a model omit required freshness warnings; stream finalization now appends a deterministic `Cảnh báo cần kiểm tra` section when freshness/web context requires it and the model omitted it.
  - `[medium]` `[patch]` Prompt wording conflicted around source disclosure and web-search claims; AI Ask prompt now allows source discussion only from provided source-bundle data and forbids claiming web lookup when web data is absent.
  - `[low]` `[patch]` Non-web provenance labels could render raw chat/trip field names as source types; UI now labels chat/trip context as user-provided context.
  - `[low]` `[patch]` Community label matching only handled exact `community`; UI label formatter now also handles `facebook` and `cộng đồng` defensively.

## Design Notes

Story 5.6 already renders provenance from stored rows, so Story 5.7 should not add a second warning system based on answer text. The durable signal remains retrieval/provenance metadata; answer content is guided by prompt instructions and UI trust labels come from provenance DTO fields.

## Verification

**Commands:**
- `pnpm test:run tests/answer-context.test.ts tests/ai-ask-shell.test.ts` -- expected: Story 5.7 targeted regressions pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Added answer prompt rules requiring Vietnamese freshness verification warnings for changing details, explicit web external/unverified treatment, and community/Facebook official-source limits.
- Added deterministic stream finalization so required freshness warnings are persisted even when the model omits the warning section.
- Strengthened source-bundle instructions in full, compacted, and minimal prompt paths so freshness and unverified-web warnings survive context compaction.
- Marked web provenance as freshness-sensitive whenever the retrieval decision requires freshness while keeping web confidence unverified.
- Replaced raw traveler-facing source-type display with safer Vietnamese labels for external web, official/provider-looking web, community sources, and general reasoning.
- Added regression coverage for freshness warning prompt text, compacted source-bundle warnings, freshness-required web provenance, and safer provenance labels.

### Verification Results

- `pnpm test:run tests/answer-context.test.ts tests/ai-ask-shell.test.ts` -- passed, 88 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

### File List

- `_bmad-output/implementation-artifacts/spec-5-7-uncertainty-and-freshness-warnings.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/api/ai-ask/stream/route.ts`
- `src/features/ai/prompts.ts`
- `src/features/retrieval/source-bundle.ts`
- `src/features/retrieval/provenance.ts`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/answer-context.test.ts`
- `tests/ai-ask-shell.test.ts`

## Auto Run Result

Status: done

Summary: Implemented Story 5.7 freshness and uncertainty handling. AI Ask prompts now require verification guidance for freshness-sensitive/web-influenced details, source-bundle prompts preserve those warnings through compaction, web provenance exposes freshness warnings when retrieval requires them, and the UI labels web/community provenance without implying approved official knowledge.

Files changed:
- `_bmad-output/implementation-artifacts/spec-5-7-uncertainty-and-freshness-warnings.md` -- recorded task completion, verification, file list, and auto-run result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 5.7 done.
- `src/features/ai/prompts.ts` -- added explicit Vietnamese answer rules for freshness, unverified web, and community/Facebook limits.
- `src/app/api/ai-ask/stream/route.ts` -- appends a deterministic freshness warning before persistence when freshness/web context requires it and the model omitted it.
- `src/features/retrieval/source-bundle.ts` -- added freshness and unverified-web instructions to full, compacted, and minimal source-bundle prompts.
- `src/features/retrieval/provenance.ts` -- carries retrieval-level freshness-required decisions into web provenance DTO freshness warnings.
- `src/features/ai/ai-ask-composer.tsx` -- renders safe Vietnamese provenance source labels instead of raw ambiguous source types.
- `tests/answer-context.test.ts` -- added source-bundle and provenance regressions for Story 5.7.
- `tests/ai-ask-shell.test.ts` -- added UI regression assertions for web official-looking and community labels.

Review findings breakdown: 4 patch findings fixed (1 high, 1 medium, 2 low), 0 deferred, 4 rejected.

Follow-up review recommendation: true, because the review patch added deterministic answer-content mutation on the streaming persistence path.

Verification performed:
- `pnpm test:run tests/answer-context.test.ts tests/ai-ask-shell.test.ts` -- passed, 88 tests before review patch.
- `pnpm test:run tests/answer-context.test.ts tests/ai-ask-shell.test.ts` -- passed, 89 tests after review patch.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- initially failed when run concurrently with `pnpm build` because `.next/types` files were regenerated during TypeScript program loading; rerun standalone passed.
- `pnpm build` -- passed.

Residual risks:
- Prompt compliance still depends on model behavior; tests verify prompt contracts and provenance/UI behavior, not live model output wording.
- No commit was created because repository instructions require explicit user approval before committing.
