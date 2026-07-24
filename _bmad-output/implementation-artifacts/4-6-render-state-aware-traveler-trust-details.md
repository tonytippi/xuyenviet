---
baseline_commit: 28baba2902e42b3f9a11fda07120855231dc2bdf
---

# Story 4.6: Render State-Aware Traveler Trust Details

Status: review

## Story

As a traveler,
I want sources and warnings to explain the state of information,
so that I can decide what to verify before acting.

## Acceptance Criteria

1. Given an answer uses active community knowledge, caveat-only knowledge, or web fallback, when source/confidence UI renders from persisted provenance, it shows appropriate community, conditional, freshness, and verification caveats with safe label, type, date, confidence, and URL metadata. Color is never the only signal.
2. Given a traveler opens a persisted annotation or detail panel, when source details resolve, its safe summary and quick facts reflect stored source/provenance snapshots and use policy without parsing answer prose.
3. Given Facebook-derived evidence is operator-only or lacks traveler display permission, when trust details render, raw post, quote, and link remain hidden. Traveler-visible quote/link appears only when explicit safe display policy permits it.

## Tasks / Subtasks

- [x] Extend persisted provenance DTOs and conversation read models (AC: 1-3)
  - [x] Surface Story 4.5 snapshots for policy, state, verification, conditions, freshness, safe source details, and permitted evidence display metadata.
  - [x] Maintain same-user/conversation ownership checks and only safe HTTP URLs.
  - [x] Do not live-query cards to reinterpret historical answer provenance or pass arbitrary source snapshot JSON to the client.
- [x] Update the existing source and detail UI (AC: 1-3)
  - [x] Extend `AssistantProvenanceBlock` and `AnswerDetailPanel` in `ai-ask-composer.tsx`; do not build a parallel citation system.
  - [x] Use concise Vietnamese text chips/callouts for community observation/pattern, conditional facts, verification-needed, freshness, and external unverified material. Preserve text labels alongside color.
  - [x] Keep the responsive detail-panel/sheet selection model, keyboard behavior, and persisted descriptor validation unchanged.
- [x] Add traveler-facing render and privacy coverage (AC: 1-3)
  - [x] Assert UI renders only persisted policy/state snapshots and never invents citations from answer text.
  - [x] Cover caveat-only and external-unverified messaging plus operator-only/Facebook hidden-source behavior.
  - [x] Verify accessible labels, focus behavior, readable Vietnamese copy, and mobile-safe presentation for any new icon-only controls.

### Review Findings

- [x] [Review][Patch] Fail closed for all Facebook-derived legacy evidence [src/features/retrieval/provenance.ts:398] — normalized `sourceType` before comparison and reject traveler-visible evidence with a non-empty URL that cannot be parsed safely. Case variants and malformed Facebook URLs cannot expose their raw quote, satisfying AC 3.
- [x] [Review][Patch] Render `do_not_use` as an action-blocking trust state [src/features/ai/ai-ask-composer.tsx:1793] — persisted `usePolicy: "do_not_use"` is terminal in source cards and detail descriptors, with an explicit no-action warning instead of a verified label, satisfying AC 1 and AC 2.
- [x] [Review][Patch] Normalize trailing-dot Facebook hosts before trust-detail filtering [src/features/retrieval/provenance.ts:354] — `facebook.com.`, `fb.me.`, and `fb.watch.` do not match the current host checks. A legacy `traveler_visible` evidence snapshot can therefore expose a Facebook quote and link, violating AC 3's raw Facebook exclusion.
- [x] [Review][Patch] Preserve historical provenance state vocabulary [src/features/retrieval/provenance.ts:359] — persisted answers created with the earlier `verified_fact` and `verified` snapshot vocabulary now format both values as `null`. This discards historical state/verification context instead of rendering the stored snapshot, violating AC 1 and AC 2.
- [x] [Review][Patch] Render terminal provenance states as warnings [src/features/ai/ai-ask-composer.tsx:1796] — snapshots with `verificationState: "failed"` or `knowledgeState: "conflicted"`/`"superseded"` can still show `đã xác minh` from their row-level status and have no warning label. A traveler can be misled by historical trust details, violating AC 1.

## Dev Notes

- Source/confidence UI is strictly provenance-driven. No answer-prose regex, text matching, inferred state, or client-side database policy may create a source claim.
- Use existing confidence chips and freshness warning visual patterns from the design spine. Green remains an action color, never evidence that a community fact is guaranteed.
- Entity descriptors use persisted offsets and provenance-row references. Preserve their validation and safe quick-fact allowlist; this story changes the read model/rendering data, not descriptor ownership.
- Facebook raw text/link stays hidden even if a legacy source row contains a URL. Do not expose operator-only evidence as a “more details” path.

### Project Structure Notes

- Provenance formatting/read models: `src/features/retrieval/provenance.ts`, `src/features/chat-trips/conversations.ts`.
- Traveler UI: `src/features/ai/ai-ask-composer.tsx`, with annotations only through `src/features/ai/answer-annotations.ts` as needed.
- Preserve root tokens/primitives and existing responsive shell ownership; no new component library or alternate data loader.
- Add focused UI/read-model tests through `tests/ai-ask-shell.test.ts` and `tests/answer-context.test.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.6]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-11, AD-19, AD-20]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/DESIGN.md#Components]
- [Source: src/features/ai/ai-ask-composer.tsx]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Implement only after Story 4.5 persists the complete state-aware provenance snapshot.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Projected only bounded state-aware fields from persisted provenance snapshots: knowledge state, verification/use policy, conditions, and explicitly traveler-visible evidence.
- Added Vietnamese state labels and persisted quick facts to the existing source block/detail panel without changing descriptor ownership, focus, or responsive sheet behavior.
- Rejected Facebook host aliases and non-permitted evidence at provenance formatting, including legacy snapshots, so raw post links and quotes cannot reach traveler UI.
- Tests passed: `pnpm test:run` (49 files, 693 tests), `pnpm typecheck`, `pnpm lint` (3 pre-existing warnings), and `pnpm build`.
- 2026-07-23 repair: persisted evidence snapshots now retain `displayPolicy`; legacy rendering rejects `fb.me` aliases and unsafe quote material before URLs are sanitized; state allowlists match stored `conditional`/`confirmed` and `corroborated` values; caveat-only use policy is retained in bounded detail quick facts.
- Repair verification passed: `pnpm vitest run tests/answer-context.test.ts tests/ai-ask-shell.test.ts` (160 tests), `pnpm typecheck`, and `pnpm lint` (3 pre-existing warnings in `tests/knowledge-search.test.ts`).
- 2026-07-23 second-review repair: trailing-dot Facebook host aliases are rejected; historical `verified_fact` and `verified` snapshots preserve their current semantic states; failed, conflicted, and superseded snapshots render explicit action-blocking warnings rather than verified source labels.
- Second-review repair verification passed: `pnpm vitest run tests/answer-context.test.ts tests/ai-ask-shell.test.ts` (161 tests), `pnpm typecheck`, `pnpm lint` (3 pre-existing warnings in `tests/knowledge-search.test.ts`), and `git diff --check`.
- 2026-07-23 final-review repair: traveler evidence now fails closed for case-variant Facebook source types and malformed non-empty URLs; persisted `do_not_use` policy renders as an action-blocking warning in cards and detail descriptors.
- Final-review repair verification passed: `pnpm vitest run tests/answer-context.test.ts tests/ai-ask-shell.test.ts` (161 tests) and `pnpm typecheck`.
- 2026-07-24 shared provenance repair: commit `956357d5122b4756ce72c509f4b48545b9e3c0cb` preserves bounded safe web titles and validated non-Facebook HTTP(S) URLs in persisted web provenance snapshots. This resolves the shared finding affecting Stories 4.5, 4.6, and 4.7; Story 4.6 is returned to review.
- 2026-07-24 final Epic repair: commit `616faf235716af98000b6929e72b2b70da671467` rejects credential-bearing URLs through the shared provenance path and gives deterministic verification guidance for web fallback. This resolves the final shared review findings affecting Stories 4.5, 4.6, and 4.7; Story 4.6 is returned to review.

### File List

- `src/features/retrieval/provenance.ts`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/answer-context.test.ts`
- `tests/ai-ask-shell.test.ts`
- `_bmad-output/implementation-artifacts/4-6-render-state-aware-traveler-trust-details.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-07-23: Rendered state-aware traveler trust details from persisted provenance and added privacy/render coverage.
- 2026-07-23: Repaired persisted evidence policy/state rendering and legacy traveler-evidence privacy filtering.
- 2026-07-23: Second bounded review found three unresolved action items; story returned to in-progress.
- 2026-07-23: Resolved the second-review findings and returned the story to review.
- 2026-07-23: Resolved final-review findings and returned the story to review.
- 2026-07-23: Finalized as done after verification of repair commit 404fd804088b23368517eb6ccc84ee5d90e7fd44 and a clean worktree.
- 2026-07-24: Documented shared provenance repair commit 956357d5122b4756ce72c509f4b48545b9e3c0cb and returned Story 4.6 to review.
- 2026-07-24: Documented final shared repair commit 616faf235716af98000b6929e72b2b70da671467 and returned Story 4.6 to review.
