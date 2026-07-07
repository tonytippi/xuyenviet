---
title: 'Story 2.6: Basic Chat Responsiveness And Failure States'
type: 'feature'
created: '2026-07-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: '3a5a5aa7e196ff8c9d6110ddb462bc2cdffc6f6a'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-continue-conversation-with-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** AI Ask can persist and continue conversations, but the user experience during slow generation is still mostly a disabled form plus status text. During public MVP testing, travelers need to see that their request is being handled, understand long waits, avoid accidental duplicate sends, and recover from failures without seeing assistant content that was never persisted.

**Approach:** Add explicit in-thread pending/progress/failure presentation in the existing composer, keep duplicate submission guarded while a request is active, preserve the current server guarantee that only persisted user/assistant messages render as durable chat turns, and expand tests around failure and source-of-truth behavior.

## Boundaries & Constraints

**Always:** Require authenticated server actions for every submission; reject invalid input before creating rows or provider calls; keep assistant messages displayed from persisted server results only; keep failed provider attempts as persisted user-only turns with a clear retry-oriented failure state; keep Vietnamese-first copy, accessible `aria-live` state changes, mobile-safe touch targets, and no fake sources/provenance.

**Block If:** Satisfying the story appears to require new database columns/tables for idempotency, streaming tokens, conversation-level locks, a browser E2E framework, trip-project context, retrieval/source bundles, or source/provenance rendering.

**Never:** Do not create client-only assistant messages, fake citations, web search, source chips, booking/payment/referral behavior, rewards/credits, cross-user chat access, or a new app architecture. Do not remove the existing persisted failed user-turn behavior from Story 2.5 unless a later product decision changes retry semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First request pending | Authenticated user submits a valid first question | UI immediately shows the user's request is being prepared, disables duplicate send, and announces pending state | No error expected |
| Long-running answer | Request remains pending past the progress threshold | UI updates progress copy without implying completion or sources were checked | Pending state remains recoverable until server resolves |
| Successful answer | Server returns persisted user and assistant messages | UI renders the returned persisted assistant content and clears pending/progress indicators | No client-only assistant content is created |
| Provider failure | Server returns `answer-failed` with a persisted user message and no assistant message | UI shows the persisted user turn plus an inline failure/retry state, keeps the draft available, and does not show an assistant bubble | Usage failure remains server-recorded |
| Duplicate submit | User presses Enter/clicks submit repeatedly while pending | Only one server submission is initiated from the mounted composer and controls communicate that sending is in progress | Later duplicate requests from other tabs are out of scope and remain deferred |
| Invalid input | Empty or overlong text is submitted | Client shows validation copy and focuses input; server-side validation still protects direct calls | No rows, usage event, or provider call are created |

</intent-contract>

## Code Map

- `src/features/ai/ai-ask-composer.tsx` -- owns client-side pending, progress, failure, duplicate-send, draft, and chat rendering behavior.
- `src/features/ai/ask-gate.ts` -- server action already preserves persisted source-of-truth and failure semantics; adjust only if response shape/copy needs clearer failure metadata.
- `src/features/ai/gateway.ts` -- gateway timeout/error mapping; inspect if failure copy requires timeout-specific behavior, but avoid expanding provider architecture.
- `tests/ai-ask-shell.test.ts` -- existing server/static test suite for AI Ask; extend with static coverage for pending/failure UI contracts and server source-of-truth guarantees.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- keep Story 2.6 workflow status aligned.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/ai-ask-composer.tsx` -- add an explicit in-thread pending/progress/failure presentation driven by submission state, including delayed progress copy and polite announcements -- make slow AI generation feel active without fabricating assistant output.
- [x] `src/features/ai/ai-ask-composer.tsx` -- harden duplicate-send UX by keeping the existing ref guard, disabling controls, and rendering clear Vietnamese sending copy while a request is active -- prevent repeated sends from the same mounted composer.
- [x] `src/features/ai/ai-ask-composer.tsx` -- clarify failure and retry copy when the provider fails after the user turn is persisted -- avoid implying that an assistant answer exists or that persisted chat content is only local draft state.
- [x] `tests/ai-ask-shell.test.ts` -- add or update static/server tests for pending/failure rendering contracts, persisted user-only failed turns, no assistant bubble on failure, and unchanged invalid-input/no-side-effect guarantees -- cover all I/O matrix scenarios that are feasible without a browser E2E framework.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set Story 2.6 to `in-progress` at implementation start and `done` after verification/review -- keep BMad status aligned.

**Acceptance Criteria:**
- Given a user submits a message, when the system is generating an answer, then the UI shows a pending state and duplicate submission from the same mounted composer is prevented or safely ignored.
- Given response generation takes longer than the progress threshold, when the user is waiting, then the UI communicates continued progress in Vietnamese without implying completion, retrieval, sources, or web search.
- Given the provider fails after the user message is saved, when the UI renders the result, then it shows the persisted user message and a safe retryable failure state without creating a misleading assistant message.
- Given the assistant answer is saved, when the UI renders the response, then displayed assistant content comes from the returned persisted assistant message and no client-only answer state becomes the source of truth.

## Spec Change Log

## Review Triage Log

### 2026-07-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 2, low 0)
- defer: 0
- reject: 2
- addressed_findings:
  - `[medium]` `[patch]` Failed-turn recovery was only transient client state; added loaded-history inference for trailing unanswered user turns and rendered the retry notice after refresh/remount.
  - `[medium]` `[patch]` A later success cleared the previous failed-turn marker; changed failure tracking from one nullable ID to per-message failed ID tracking so historical failed turns keep their inline context.

## Design Notes

Keep this story as a UX hardening layer on top of the Story 2.5 persistence model. True cross-tab idempotency, request reuse, and conversation-level locking are separate backend concerns already deferred from Story 2.5 and should not be solved with ad hoc client-only identifiers in this story.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-shell.test.ts` -- expected: targeted AI Ask tests pass.
- `pnpm test:run` -- expected: full test suite passes.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Auto Run Result

Status: done

Summary: Implemented Story 2.6. AI Ask now renders an explicit in-thread pending card while generation is active, updates to delayed progress copy after the threshold, keeps duplicate submits guarded by the existing mounted-composer ref and disabled controls, and shows retry-oriented failed-turn notices without creating client-only assistant content. Review fixes made failed-turn notices survive refresh/remount for trailing unanswered user turns and survive later successful messages.

Files changed:
- `src/features/ai/ai-ask-composer.tsx` -- added pending/progress/failure UI state, Vietnamese aria-live copy, stronger pending button copy, persisted failed-turn inline messaging, and loaded-history failed-turn inference.
- `tests/ai-ask-shell.test.ts` -- added static contract tests for pending/progress/failure/duplicate-submit behavior, persisted failed-turn rendering after reload, and an assertion that provider failure results do not include assistant messages.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 2.6 done.
- `_bmad-output/implementation-artifacts/spec-2-6-basic-chat-responsiveness-and-failure-states.md` -- recorded implementation status and verification.

Verification performed:
- `pnpm test:run tests/ai-ask-shell.test.ts` -- passed, 22 tests.
- `pnpm test:run` -- passed, 5 test files, 71 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Review findings breakdown: 2 medium patch findings fixed, 0 deferred, 2 rejected as workflow/test-strategy noise.

Follow-up review recommendation: false.

Commit status: not committed because explicit commit permission was not provided.

Residual risks:
- No browser E2E framework exists by design, so duplicate-click/Enter behavior is covered by source-level static assertions rather than a real browser interaction test.
