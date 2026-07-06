---
title: 'Story 2.1: Authenticated AI Ask Chat Shell'
type: 'feature'
created: '2026-07-06'
status: 'done'
baseline_revision: '24238052f670d3023456c1f266dab6718e32cf44'
final_revision: '24238052f670d3023456c1f266dab6718e32cf44'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-0-introduce-test-framework-and-retroactive-epic-1-coverage.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** `/ai-ask` is authenticated but still a placeholder, so signed-in travelers do not yet have the Vietnamese chat shell needed for Epic 2 conversation work. The next stories need a stable, accessible shell with an empty state, composer contract, storage notice, and no premature persistence or AI behavior.

**Approach:** Replace the authenticated placeholder with a Vietnamese-first chat shell that keeps server-side auth gating, renders an empty-state message area, provides a non-blocking storage notice, and includes a composer wired only to the existing guarded `submitAiAsk` validation seam.

## Boundaries & Constraints

**Always:** Keep `/ai-ask` protected by `getAuthenticatedSession()` before rendering shell content. Preserve referral redirect behavior for unauthenticated users. Use current map-paper visual language, Route Green primary action, Guide Amber for examples/suggestions, readable mobile layout, 44px+ touch targets, labels, focus states, and polite status copy. The composer must support broad Vietnamese road-trip questions, show clear validation status, and avoid duplicate submit while a submission is pending. `submitAiAsk` must remain server-side authenticated and reject empty or over-2000-character questions.

**Block If:** Implementing keyboard/browser interaction requires adding a new client test stack or changing the existing Vitest runtime beyond this story's shell scope. Adding persistence, AI calls, retrieval, source provenance, or new database tables becomes necessary to satisfy the shell.

**Never:** Do not create conversations, messages, chat/trip context, retrieval jobs, usage events, web searches, provider calls, source chips, fake citations, fake assistant answers, booking/payment/referral reward UI, or admin controls. Do not rely on client-only auth checks. Do not introduce a generic UI framework or redesign the site away from the existing XuyenViet visual direction.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unauthenticated route access | `GET /ai-ask`, no valid session | Redirects to `/sign-in?next=%2Fai-ask`; protected shell copy is not rendered | Next redirect only; no side effects |
| Unauthenticated route with referral | `GET /ai-ask?ref=abc` | Redirect includes `next=/ai-ask` and `ref=abc` | Next redirect only; no side effects |
| Authenticated shell | Valid session with email | Renders Vietnamese AI Ask shell, account email, sign-out affordance, empty state, examples, storage notice, composer, and submit button | No error expected |
| Empty question | Composer submits whitespace | Client status explains the question is required; server seam still rejects if called directly | No conversation, AI, retrieval, or provider call |
| Too-long question | More than 2000 characters | Client status explains 2000-character limit; server seam rejects if called directly | No conversation, AI, retrieval, or provider call |
| Valid question in Story 2.1 | Non-empty question under 2000 chars | Existing server seam returns future-implementation status; UI says conversation saving/AI answer arrives in next stories | No fake assistant message or source output |

</intent-contract>

## Code Map

- `src/app/ai-ask/page.tsx` -- authenticated server route; replace placeholder with shell and keep redirect/referral/sign-out behavior.
- `src/features/ai/ask-gate.ts` -- existing server action seam; keep authenticated validation and current no-side-effect placeholder result.
- `src/features/ai/ai-ask-composer.tsx` -- new client composer for validation, keyboard submit, pending state, and accessible status.
- `tests/auth-gate.test.ts` -- update authenticated render assertions and keep unauthenticated redirect coverage.
- `tests/ai-ask-shell.test.ts` -- new shell/action tests for visible contract and guarded submission behavior.
- `src/app/globals.css` -- existing tokens and map-paper baseline; only touch if a tiny global affordance is unavoidable.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update Story 2.1 status through implementation.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/ai-ask-composer.tsx` -- add a small client composer with label, textarea, submit button, inline status, Enter submit, Shift+Enter newline, `/` focus shortcut, pending guard, and validation before calling `submitAiAsk` -- give the shell a usable interaction contract without persistence.
- [x] `src/app/ai-ask/page.tsx` -- replace placeholder page with responsive authenticated chat shell: header/account/sign-out, empty-state question prompt, example prompts, non-blocking storage notice, reserved message area, and composer -- satisfy Story 2.1 UX contract while preserving auth redirect.
- [x] `src/features/ai/ask-gate.ts` -- keep existing authenticated server validation; adjust result/copy only if needed for the shell status -- preserve no-side-effect future-story seam.
- [x] `tests/auth-gate.test.ts` -- update authenticated shell assertions and add referral redirect assertion -- protect route-gate behavior.
- [x] `tests/ai-ask-shell.test.ts` -- add render and server-action tests covering shell copy, no fake citations/sources, empty/too-long rejection, valid placeholder result, and unauthenticated rejection -- cover I/O matrix without browser test-stack expansion.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 2.1 `in-progress` during work and `done` after verification/review -- keep BMad state aligned.

**Acceptance Criteria:**
- Given an unauthenticated traveler opens `/ai-ask`, when the route resolves, then they are redirected to sign-in before protected shell content renders and any `ref` query is preserved.
- Given an authenticated traveler opens `/ai-ask`, when the page renders, then the shell shows Vietnamese empty-state guidance with a Vietnam road-trip example, account context, sign-out, storage notice, composer label, and submit action.
- Given the traveler submits an empty or over-limit question, when validation runs, then the UI/server seam rejects it with a safe message and creates no future-story side effects.
- Given the traveler submits a valid question in Story 2.1, when the server seam returns, then the UI communicates that conversation saving/AI answers arrive in the next stories rather than rendering fake assistant content.
- Given later Epic 2 stories add persistence and answers, when they extend this shell, then they can reuse the message area/composer contract without replacing route auth or visual structure.

## Spec Change Log

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 4, low 2)
- defer: 0
- reject: 2: (high 0, medium 1, low 1)
- addressed_findings:
  - `[medium]` `[patch]` Added a synchronous in-flight ref guard so rapid duplicate submit events cannot call `submitAiAsk` twice before React state re-renders.
  - `[medium]` `[patch]` Guarded Enter submit during IME composition so Vietnamese text composition is not submitted prematurely.
  - `[medium]` `[patch]` Hardened `submitAiAsk` against malformed direct payloads so missing/non-string `question` receives the same explicit validation error.
  - `[low]` `[patch]` Associated composer status/help text with the textarea via `aria-describedby`.
  - `[low]` `[patch]` Preserved the first non-empty repeated `ref` value on unauthenticated redirect.
  - `[medium]` `[patch]` Added targeted tests for malformed payload, repeated referral handling, and accessible status wiring.

## Design Notes

Story 2.1 intentionally stops at the shell/action seam. The valid-submit success copy should be explicit that no answer was generated yet, so users and tests do not confuse the placeholder status for a persisted conversation. Example prompts may prefill through client state, but they must stay editable and must not auto-submit.

## Verification

**Commands:**
- `pnpm test:run` -- expected: all tests pass; no external network calls.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Auto Run Result

Status: done

Summary: Implemented the authenticated Vietnamese AI Ask chat shell for Story 2.1. The page now keeps server-side auth/referral gating, renders a responsive empty conversation shell, account/sign-out controls, example road-trip prompts, a non-blocking storage notice, and a guarded client composer wired only to the existing no-side-effect server validation seam.

Files changed:
- `../../src/app/ai-ask/page.tsx` -- replaced placeholder with authenticated chat shell and improved repeated-ref preservation.
- `../../src/features/ai/ai-ask-composer.tsx` -- added client composer with validation, pending guard, keyboard shortcuts, IME-safe Enter handling, and accessible status wiring.
- `../../src/features/ai/ask-gate.ts` -- hardened malformed payload validation while preserving authenticated no-side-effect placeholder behavior.
- `../../tests/auth-gate.test.ts` -- updated authenticated shell assertions and referral redirect coverage.
- `../../tests/ai-ask-shell.test.ts` -- added shell/action contract tests.
- `sprint-status.yaml` -- marked Story 2.1 done.
- `spec-2-1-authenticated-ai-ask-chat-shell.md` -- created and completed this executable spec.

Review findings breakdown: 6 patches applied (4 medium, 2 low), 0 deferred, 2 rejected.

Follow-up review recommended: false. Review-driven fixes were localized to client-submit guarding, IME safety, validation hardening, accessibility wiring, and tests; no broad architecture, security model, or data behavior changed.

Verification performed:
- `pnpm test:run` -- passed, 5 test files, 56 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Residual risks:
- Composer browser interaction is covered by static/server tests and code review, not a jsdom/browser interaction suite. This was kept within Story 2.1 scope to avoid adding a new client test stack.
- Valid submissions still return the Story 2.1 future-implementation placeholder by design; persistence and AI answers are deferred to Stories 2.2 and 2.3.
- Changes were not committed because runtime developer instruction says to commit only when explicitly requested.
