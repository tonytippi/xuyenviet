---
title: 'Story 5.6: Render Source And Confidence Section'
type: 'feature'
created: '2026-07-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-5-persist-retrieval-decision-and-answer-provenance.md'
warnings: []
baseline_revision: 'fc3f668'
final_revision: 'fc3f668c9cc4edd13bac81b26647a46fa60de606'
---

<intent-contract>

## Intent

**Problem:** AI Ask now persists answer provenance, but travelers still cannot see which approved knowledge, web results, chat/trip context, or general reasoning influenced a displayed assistant answer. Without a provenance-backed source section, the UI risks either hiding trust details or relying on answer text that can contain fake or stale citations.

**Approach:** Load stored assistant provenance for owned conversations and render a compact Vietnamese `Nguồn và độ tin cậy` section under assistant answers. For newly streamed answers, return the persisted provenance DTO in the stream completion payload so the section appears immediately without parsing answer text.

## Boundaries & Constraints

**Always:** Render source/confidence from `assistant_response_provenance` rows or the same persisted row data returned by the stream route; keep ownership scoped by conversation and user; show title/label, source type, URL when available, checked/collected date when available, confidence or verification label, and freshness cue when available; distinguish general reasoning from sourced knowledge; keep rows keyboard-readable and not color-only.

**Block If:** The story requires exposing raw source material, operator-only notes, provider payloads, admin controls, or changing the persisted provenance schema to satisfy the UI.

**Never:** Do not parse assistant answer text for citations or source rows, do not fabricate citation numbers, do not mark web or general reasoning as verified/approved, and do not add booking, payment, credit, reward, or provider-specific UI behavior.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Stored sourced answer | Owned conversation has assistant provenance rows for knowledge or web | Assistant answer displays `Nguồn và độ tin cậy` with ordered provenance rows from storage | Missing optional fields are omitted or labeled as unavailable without hiding the row |
| General-only answer | Provenance has only `general` reasoning | Section clearly says the answer used general AI reasoning and is not verified sourced knowledge | No citation or fake source is shown |
| Answer text contains source-looking content | Assistant message content mentions a source that has no provenance row | UI does not create source rows from text | The normal answer text still renders as content |
| Cross-user provenance | Another user's rows reference other messages or conversations | Rows are not returned or rendered for the current user | Ownership filters keep the section empty |

</intent-contract>

## Code Map

- `src/features/retrieval/provenance.ts` -- Add a shared UI-safe provenance DTO formatter and return persisted rows from provenance persistence.
- `src/features/chat-trips/conversations.ts` -- Load and group provenance rows for owned assistant messages when rendering conversation history.
- `src/app/ai-ask/page.tsx` -- Pass assistant provenance through `initialMessages`.
- `src/features/ai/ai-ask-composer.tsx` -- Render the compact source/confidence section and accept streamed provenance DTOs.
- `src/app/api/ai-ask/stream/route.ts` -- Include persisted provenance DTOs in the stream `done` event after atomic assistant/provenance persistence.
- `tests/ai-ask-sessions.test.ts` -- Cover grouped, ordered, owned provenance loading.
- `tests/ai-ask-shell.test.ts` -- Cover UI rendering from provenance rather than answer text.
- `tests/answer-context.test.ts` -- Cover streamed done payload includes persisted provenance DTOs.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Keep Story 5.6 status aligned.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/retrieval/provenance.ts` -- Export `AssistantMessageProvenanceItem`, a safe formatter, and have `persistAssistantAnswerProvenance` return inserted provenance DTOs -- avoid duplicating snapshot parsing across server paths.
- [x] `src/features/chat-trips/conversations.ts` -- Query `assistant_response_provenance` for the owned conversation and attach rank-ordered DTOs to assistant messages -- render stored provenance on page load.
- [x] `src/app/api/ai-ask/stream/route.ts` -- Return assistant provenance in the `done` event from the same persisted provenance rows -- show sources immediately for new answers.
- [x] `src/app/ai-ask/page.tsx` and `src/features/ai/ai-ask-composer.tsx` -- Pass and render provenance under assistant answers with accessible Vietnamese labels -- satisfy traveler-facing source/confidence display.
- [x] `tests/ai-ask-sessions.test.ts`, `tests/ai-ask-shell.test.ts`, and `tests/answer-context.test.ts` -- Add regression coverage for loading, UI rendering, stream payloads, ownership, and answer-text non-parsing -- protect Story 5.6 acceptance.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 5.6 in progress/review/done as implementation advances -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given an answer uses approved knowledge or web search, when the answer is displayed, then it includes a compact `Nguồn và độ tin cậy` section rendered from stored provenance records and not parsed answer text.
- Given source metadata is available, when the source section is displayed, then it shows source label/title, source type, URL when available, collected/checked date when available, confidence label, and freshness warning when applicable.
- Given an answer uses general reasoning without supporting source, when the source section is displayed, then the answer clearly distinguishes that content from sourced knowledge and avoids fake citations.

## Spec Change Log

## Review Triage Log

### 2026-07-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 1, medium 1, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Stored provenance URLs could render unsafe non-HTTP schemes; DTO formatting now only exposes `http:` and `https:` URLs, with regression coverage for `javascript:` filtering.
  - `[medium]` `[patch]` Approved knowledge provenance omitted available source URL and collected date; knowledge snapshots now preserve traveler-safe source URL/date metadata and the DTO renders a representative URL/date when available.

## Design Notes

The UI section should be a simple list rather than citation chips. The persisted `rank` already defines display order, and the row category/verification status is more reliable than citation marks generated in answer text.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-sessions.test.ts tests/ai-ask-shell.test.ts tests/answer-context.test.ts` -- expected: Story 5.6 regression tests pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Added a UI-safe assistant provenance DTO and shared formatter for stored `assistant_response_provenance` rows.
- Loaded owned, rank-ordered assistant provenance with conversation history and passed it into AI Ask messages.
- Added a compact `Nguồn và độ tin cậy` block under assistant answers that renders from provenance only, labels web/general rows as unverified, links URLs when present, and shows freshness-sensitive guidance.
- Included persisted provenance DTOs in successful stream `done` events so newly created answers can show source/confidence details immediately.
- Added regression coverage for stored UI rendering, ordered/owned provenance loading, and stream payload provenance.

### Verification Results

- `pnpm test:run tests/ai-ask-sessions.test.ts tests/ai-ask-shell.test.ts tests/answer-context.test.ts` -- passed, 95 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- initially failed when run concurrently with `pnpm build` because `.next/types` files were regenerated during TypeScript program loading; rerun standalone passed.
- `pnpm build` -- passed.
- `pnpm test:run tests/ai-ask-sessions.test.ts tests/ai-ask-shell.test.ts tests/answer-context.test.ts` -- passed, 95 tests after review patches.
- `pnpm lint` -- passed after review patches.
- `pnpm typecheck` -- passed after review patches.
- `pnpm build` -- passed after review patches.

### File List

- `_bmad-output/implementation-artifacts/epic-5-context.md`
- `_bmad-output/implementation-artifacts/spec-5-6-render-source-and-confidence-section.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/ai-ask/page.tsx`
- `src/app/api/ai-ask/stream/route.ts`
- `src/features/ai/ai-ask-composer.tsx`
- `src/features/chat-trips/conversations.ts`
- `src/features/retrieval/provenance.ts`
- `tests/ai-ask-shell.test.ts`
- `tests/answer-context.test.ts`

## Auto Run Result

Status: done

Summary: Implemented Story 5.6. AI Ask now loads stored assistant provenance, returns provenance DTOs in successful stream completion events, and renders a compact `Nguồn và độ tin cậy` section under assistant answers from stored provenance rather than parsed answer text.

Files changed:
- `_bmad-output/implementation-artifacts/epic-5-context.md` -- regenerated stale Epic 5 context from updated planning artifacts.
- `_bmad-output/implementation-artifacts/spec-5-6-render-source-and-confidence-section.md` -- recorded Story 5.6 spec, implementation notes, verification, review triage, and result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 5.6 done.
- `src/app/ai-ask/page.tsx` -- passes loaded assistant provenance into the composer initial message state.
- `src/app/api/ai-ask/stream/route.ts` -- includes persisted provenance DTOs in successful `done` stream events.
- `src/features/ai/ai-ask-composer.tsx` -- renders `Nguồn và độ tin cậy` from provenance rows with Vietnamese labels, safe links, source categories, confidence labels, dates, and freshness guidance.
- `src/features/chat-trips/conversations.ts` -- loads owned assistant provenance rows, groups them by assistant message, and preserves rank ordering.
- `src/features/retrieval/provenance.ts` -- returns safe UI provenance DTOs, filters unsafe URL schemes, and preserves approved-knowledge source URL/date metadata.
- `tests/ai-ask-shell.test.ts` -- covers persisted source/confidence rendering, non-parsing behavior, unsafe URL filtering, and owned ordered provenance loading.
- `tests/answer-context.test.ts` -- covers stream `done` payload provenance DTOs.

Review findings breakdown: 2 patch findings fixed (1 high, 1 medium), 0 deferred, 0 rejected.

Follow-up review recommendation: true, because the review patch touched security-sensitive URL handling and data exposure behavior for persisted provenance.

Verification performed:
- `pnpm test:run tests/ai-ask-sessions.test.ts tests/ai-ask-shell.test.ts tests/answer-context.test.ts` -- passed, 95 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Residual risks:
- Source details are rendered inline rather than in a drawer/sheet; this satisfies compact display for current scope but can be expanded in a future UX pass if long source lists become noisy.
- No commit was created because repository instructions require explicit approval before committing, even though the BMad auto-dev review step normally asks to commit.
