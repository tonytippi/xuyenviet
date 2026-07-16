---
title: 'Present Scannable Answer Content'
type: 'feature'
created: '2026-07-16'
status: 'done'
baseline_revision: '3694577'
final_revision: '8dec0ae'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Persisted assistant answers can be visually split into recognized sections, but travelers cannot quickly navigate a long answer, and uncertainty has no explicit section contract. This makes plans, cautions, and next actions slower to scan on small screens.

**Approach:** Add an answer-scoped, horizontally scrollable section navigation row and restrained semantic answer surfaces for recognized Vietnamese sections, including uncertainty. Keep the rendered answer, persisted provenance, annotations, optional feedback, and stream lifecycle as their existing independent source-of-truth contracts.

## Boundaries & Constraints

**Always:** Use the final persisted assistant message ID to namespace in-answer targets so repeated headings in different messages never collide. Chips navigate only within their own answer with visible labels, keyboard focus, logical DOM reading order, and reduced-motion-safe behavior. Continue rendering source facts, confidence, URLs, freshness, and detail controls exclusively from stored provenance; continue rendering annotations only from persisted validated ranges; keep feedback optional and after answer/provenance content.

**Block If:** The current final assistant message cannot provide a stable ID to namespace section targets without changing persisted message identity or server ownership.

**Never:** Do not change database schema, routes, AI stream behavior, canonical URL selection, feedback persistence, provenance/annotation validation, source ownership, or the Story 7.7 detail-inspector contract. Do not infer sections, sources, or entities from unrecognized prose, add fake citations/source chips, or make provisional streamed text look like a saved structured answer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Structured persisted answer | One or more recognized headings, including uncertainty when relevant | A labeled, horizontally scrollable chip row precedes answer sections; each chip links to its namespaced section and sections retain readable hierarchy. | Unknown headings remain ordinary answer text. |
| Unstructured answer | No recognized heading | One readable answer body without an empty navigation row. | No navigation target is emitted. |
| Repeated headings | Multiple assistant messages contain the same section heading | Every chip target is unique to its assistant message and navigates within that answer only. | No duplicate DOM IDs. |
| Stored source/feedback content | Provenance, annotations, and/or feedback accompany an answer | Existing safe provenance/detail controls and optional feedback retain their reading order and data contracts. | No source facts are derived from answer prose. |

</intent-contract>

## Code Map

- `src/features/ai/ai-ask-composer.tsx` -- Splits final assistant content, renders assistant articles, safe provenance, and optional feedback; add answer-scoped section navigation and structured section semantics here.
- `src/features/ai/prompts.ts` -- Guides model output headings; add the explicit uncertainty heading to the narrow canonical set.
- `tests/ai-ask-shell.test.ts` -- Server-render regression coverage for answer section rendering, annotations, safe provenance, feedback, and composer contracts.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/ai-ask-composer.tsx` -- Add the explicit uncertainty heading to the recognized allowlist, render a labeled horizontally scrollable in-answer nav only for structured persisted answers, generate message-namespaced section IDs, and pass the assistant message ID into the renderer -- makes practical answer sections scannable without changing data.
- [x] `src/features/ai/prompts.ts` -- Include the uncertainty heading in the existing Vietnamese heading guidance -- allows the existing model contract to emit a renderer-supported uncertainty section when useful.
- [x] `tests/ai-ask-shell.test.ts` -- Cover structured section navigation, uncertainty, absence of navigation for unstructured content, unique repeated-heading targets, and preserved no-fake-source/annotation contracts -- prevents accessibility and persistence regressions.

**Acceptance Criteria:**
- Given an active persisted assistant answer has relevant plan/options, rationale, tips, warnings, source/confidence, uncertainty, or next-step sections, when rendered, then each section is visibly and semantically scannable and relevant chips navigate only within that answer.
- Given source, warning, or feedback UI is rendered, when used with keyboard or assistive technology, then labels accompany semantic color, focus follows answer then provenance then optional feedback order, and no interaction requires hover.
- Given assistant content is unstructured or contains unknown headings, when rendered, then it remains readable without empty section navigation or inferred structure.

## Design Notes

Keep heading detection an explicit Vietnamese allowlist. `Điều chưa chắc chắn` is the canonical uncertainty label; warning and stored-provenance sections remain distinct and do not become parsed source claims.

## Review Triage Log

### 2026-07-16 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-shell.test.ts` -- expected: answer rendering and adjacent persistence contracts pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: production build succeeds.
- `git diff --check` -- expected: no whitespace errors.

## Auto Run Result

**Summary:** Made final persisted AI answers easier to scan and navigate with answer-local section chips while preserving existing source, annotation, feedback, and streaming boundaries.

**Files changed:**
- `src/features/ai/ai-ask-composer.tsx` -- Adds a narrow uncertainty heading, answer-scoped section navigation, and unique persisted-message section targets.
- `src/features/ai/prompts.ts` -- Adds the uncertainty heading to canonical Vietnamese answer guidance.
- `tests/ai-ask-shell.test.ts` -- Covers section navigation, uncertainty, unstructured-answer fallback, and repeated-heading target isolation.
- `sprint-status.yaml` -- Records Story 7.6 as done.
- `spec-7-6-present-scannable-answer-content.md` -- Records the plan, review triage, verification, and result.

**Review findings:** Independent adversarial and edge-case reviews found no actionable issues.

**Verification:** `pnpm test:run tests/ai-ask-shell.test.ts` passed (74 tests). `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. The focused test run emitted expected rejected-authorization stream logs and the existing Vite tsconfig-path deprecation notice.

**Residual risks:** Visual behavior at 200% zoom and touch/keyboard horizontal chip scrolling remains a manual browser check.
