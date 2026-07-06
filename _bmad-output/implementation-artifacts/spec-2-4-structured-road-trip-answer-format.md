---
title: 'Story 2.4: Structured Road-Trip Answer Format'
type: 'feature'
created: '2026-07-06'
status: 'done'
baseline_revision: 'ee1f044ea829570e6771028da27e23b5bff19c64'
final_revision: 'ee1f044ea829570e6771028da27e23b5bff19c64'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-generate-vietnamese-initial-ai-answer.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 2.3 generates a Vietnamese answer, but the answer format is still a loose prose instruction and the UI renders assistant output as one plain paragraph. Travelers need scannable road-trip guidance with practical sections while Epic 5 source/provenance work is still deferred.

**Approach:** Tighten the initial AI Ask prompt into a concise Vietnamese section contract and render returned assistant text as readable blocks when the model uses the requested headings. Keep the persisted assistant message as the source of truth and avoid adding structured-output schema, fake citations, provenance rows, or retrieval behavior.

## Boundaries & Constraints

**Always:** Keep AI Ask authenticated and preserve Story 2.3 validation, provider failure, assistant persistence, and usage-event behavior. Store the assistant answer as the exact text returned by the gateway. Prompt for relevant Vietnamese sections: suggested plan/options, rationale, practical tips, warnings/check-before-going, source/confidence contract, next steps, and 1-3 concise follow-up questions. Tell the model to omit irrelevant sections, stay readable on mobile, avoid overclaiming curated XuyenViet coverage outside Hanoi-to-HCMC, and never invent citations or source labels.

**Block If:** A real provider-specific structured output schema, first-class section database model, provenance/source tables, retrieval decisions, web-search source labels, trip-project context priority, or streaming UI is required to satisfy this story. Block if preserving exact persisted answer text conflicts with rendering sections.

**Never:** Do not create fake source chips, fake citations, source/confidence UI from parsed model claims, assistant_response_provenance rows, retrieval_decision rows, web_search_results, knowledge cards, trip context, follow-up conversation routes, or booking/payment/referral behavior. Do not parse model text into trusted provenance. Do not change auth or invalid-submit side-effect guarantees.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Structured initial answer | Authenticated user submits a broad road-trip question and gateway returns sectioned Vietnamese text | User and assistant messages are persisted; returned assistant content is unchanged; UI displays section headings and blocks readably | No error expected |
| Missing trip details | Prompt is built for an underspecified question | Gateway request includes instructions for useful initial guidance plus 1-3 concise follow-up questions | No error expected |
| Source/provenance not ready | Story 2.4 answer format reserves source/confidence contract | Prompt instructs no fake citations/source labels and UI does not render source chips or trusted provenance | No source/provenance rows or fake UI are created |
| Outside Hanoi-to-HCMC focus | User asks about a route outside current curated focus | Prompt instructs general guidance without claiming curated local coverage | No fake curated coverage claim is introduced by app code |
| Provider failure | Gateway fails or returns invalid answer | Existing Story 2.3 safe failure behavior remains: user message kept, failed usage recorded, no assistant message | User sees safe retryable failure copy |

</intent-contract>

## Code Map

- `src/features/ai/prompts.ts` -- prompt version and structured Vietnamese answer contract for initial AI Ask generation.
- `src/features/ai/ask-gate.ts` -- usage event prompt-version import and existing server action behavior that must remain unchanged except prompt version metadata.
- `src/features/ai/ai-ask-composer.tsx` -- render returned assistant text as section-aware readable blocks while preserving exact message content.
- `tests/ai-ask-shell.test.ts` -- integration tests for prompt contract, persistence, no fake source UI, and existing failure/no-side-effect behavior.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 2.4 in progress during work and done after verification/review.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/prompts.ts` -- update prompt version and system instructions for the structured road-trip answer contract -- make formatting explicit while staying provider-text compatible.
- [x] `src/features/ai/ai-ask-composer.tsx` -- add a small section-aware assistant renderer for heading-style text -- improve desktop/mobile readability without creating trusted provenance UI.
- [x] `tests/ai-ask-shell.test.ts` -- update prompt-version assertions and add structured-answer/no-fake-source coverage -- verify the I/O matrix with mocked gateway responses.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set Story 2.4 status to `in-progress` at start and `done` after implementation, verification, and review -- keep BMad workflow state aligned.

**Acceptance Criteria:**
- Given a user asks a trip-planning question, when the initial AI answer is generated, then the gateway prompt requests practical Vietnamese sections for plan/options, rationale, tips, warnings, and next steps while allowing irrelevant sections to be omitted.
- Given source/provenance features are not implemented yet, when the answer format is requested and rendered, then the app reserves a source/confidence contract but does not invent citations, source chips, source labels, retrieval rows, or provenance rows.
- Given the question is outside the Hanoi-to-HCMC focus, when the prompt is built, then it instructs the assistant to provide general guidance without claiming curated XuyenViet coverage.
- Given the gateway returns sectioned Vietnamese text, when the composer renders the returned persisted assistant message, then the answer is readable as scannable sections on desktop and mobile and the underlying content remains unchanged.

## Spec Change Log

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 2, low 2)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Strengthened success coverage to assert the assistant answer returned and persisted equals the exact gateway text.
  - `[medium]` `[patch]` Added section-heading normalization for common Markdown/list heading variants while keeping rendered text untrusted.
  - `[low]` `[patch]` Preserved original heading punctuation/markers in rendered output.
  - `[low]` `[patch]` Added prompt assertions for rationale and next-step section instructions.

## Design Notes

Story 2.4 deliberately stays text-compatible. The model may return headings such as `Kế hoạch gợi ý:` or `Câu hỏi tiếp theo:`; the UI may render those heading lines as section headers, but it must treat all assistant content as ordinary answer text, not as trusted source/provenance metadata.

## Verification

**Commands:**
- `pnpm test:run` -- expected: AI Ask tests and existing integration tests pass with mocked gateway calls.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Auto Run Result

Status: done

Summary: Implemented and reviewed Story 2.4. Initial AI Ask generation now uses prompt version `ai_ask_initial_v2` with a Vietnamese structured answer contract for plan/options, rationale, practical tips, warnings, source/confidence reservation, next steps, follow-up questions, no fake citations, and no overclaiming curated coverage outside the current focus. The AI Ask composer now renders recognized assistant heading lines as scannable sections while preserving exact persisted assistant text and avoiding source chips or trusted provenance UI.

Files changed:
- `src/features/ai/prompts.ts`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/ai-ask-shell.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/spec-2-4-structured-road-trip-answer-format.md`

Verification performed:
- `pnpm test:run` -- passed, 5 test files, 61 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- first parallel run failed because it raced with `pnpm build` while `.next/types` were being regenerated; sequential rerun passed.
- `pnpm build` -- passed.
- Review pass -- patched 4 findings: exact persisted-answer assertion, heading variant normalization, heading punctuation preservation, and missing prompt-section assertions.
- `pnpm test:run` -- passed after review fixes, 5 test files, 61 tests.
- `pnpm lint` -- passed after review fixes.
- `pnpm build` -- passed after review fixes.
- `pnpm typecheck` -- passed after sequential rerun.

Residual risks:
- Structured section compliance is still prompt-driven; no provider-specific structured-output schema is enforced in Story 2.4.
- No browser interaction suite exists for the composer; renderer coverage uses static React markup.
- Changes were not committed because explicit commit permission was not provided.
