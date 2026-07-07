---
title: 'Story 2.5: Continue Conversation With Context'
type: 'feature'
created: '2026-07-06'
status: 'done'
baseline_revision: '0f6b50091e28adc5cb0eaa9f620a9e036581b177'
review_loop_iteration: 0
followup_review_recommended: true
final_revision: '0f6b50091e28adc5cb0eaa9f620a9e036581b177'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-structured-road-trip-answer-format.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** AI Ask currently creates a new conversation for every submission and builds prompts from only the latest question, so travelers cannot refine a plan without repeating previous details. Story 2.5 needs the current thread to persist, reload, and be used as recent chat-session context.

**Approach:** Allow submissions to target an owned existing conversation, append the new user/assistant messages to that same conversation, include bounded prior user/assistant messages in the gateway prompt, and let the composer keep and continue the active thread.

## Boundaries & Constraints

**Always:** Require authenticated session before loading, exposing, or mutating conversation data. Only load and continue conversations owned by the current user. Preserve existing invalid-submit and provider-failure guarantees: invalid input creates no rows or AI call; provider failure creates no assistant message and records failed usage. Keep assistant content persisted as source of truth and rendered chronologically. Use current conversation messages plus general reasoning only.

**Block If:** Continuing a conversation requires a new conversation routing model, conversation list/sidebar, trip-project context, retrieval/source bundle, streaming, or persisted provenance/source tables to satisfy this story.

**Never:** Do not include another user's messages in prompts or UI. Do not introduce trip-project context priority, chat context extraction, approved-knowledge retrieval, web search fallback, source chips, fake citations, assistant_response_provenance rows, retrieval_decision rows, booking/payment/referral behavior, or a new app architecture.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Continue owned conversation | Authenticated user submits a follow-up with their existing conversation ID | New user and assistant messages append to that conversation; gateway prompt includes recent prior user/assistant turns plus the new message | No error expected |
| Reopen existing conversation | Authenticated owner opens AI Ask with an existing conversation ID | Persisted messages display in chronological order and the composer continues that conversation | Missing or unauthorized conversation is denied without exposing messages |
| Cross-user continuation | Authenticated user submits another user's conversation ID | Request is rejected server-side; no message, usage event, or provider call is created | Return a safe authorization/validation error |
| Follow-up provider failure | Owned conversation follow-up reaches provider and provider fails | User follow-up remains persisted, failed usage event is recorded, no assistant message is created, existing visible thread and retry draft remain usable | Return safe retryable failure copy |
| Invalid follow-up | Existing conversation ID with empty or too-long content | No conversation/message/usage/provider side effects are created | Return clear validation message |

</intent-contract>

## Code Map

- `src/features/ai/prompts.ts` -- prompt versioning and gateway message builder; add history-aware prompt construction while keeping Story 2.4 answer contract.
- `src/features/ai/ask-gate.ts` -- server action that validates auth/input, creates or loads conversations, persists messages, calls gateway, and records usage.
- `src/features/ai/ai-ask-composer.tsx` -- client composer and message renderer; track active conversation ID, append messages, preserve loaded history and retry draft.
- `src/app/ai-ask/page.tsx` -- authenticated AI Ask page; load owned conversation by query parameter and pass initial messages to composer.
- `src/features/chat-trips/conversations.ts` -- owned conversation loader used to enforce access and chronological history.
- `tests/ai-ask-shell.test.ts` -- integration/static tests for continuation, prompt context, ownership denial, persisted history, and failure behavior.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 2.5 in progress/done as workflow state changes.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/prompts.ts` -- add a history-aware AI Ask message builder using bounded prior user/assistant messages and the existing structured Vietnamese answer contract -- ensure follow-ups consider current chat context without adding retrieval or provenance.
- [x] `src/features/ai/ask-gate.ts` -- accept optional `conversationId`, load owned conversations for follow-ups, append messages to the same conversation, update conversation recency, and keep success/failure usage semantics -- support both first and continuation submissions safely.
- [x] `src/app/ai-ask/page.tsx` -- read an optional conversation query parameter, load only owned history, and pass initial conversation/messages to the composer -- allow reopened conversations to render persisted history.
- [x] `src/features/ai/ai-ask-composer.tsx` -- initialize from persisted messages, retain active conversation ID after first success, send it on follow-up, append returned messages chronologically, and preserve existing thread/draft on failure -- make the UI continue one thread instead of replacing it.
- [x] `tests/ai-ask-shell.test.ts` -- add coverage for all I/O matrix scenarios with mocked gateway calls -- prove ownership, prompt-history, chronology, and no-side-effect guarantees.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set Story 2.5 to `in-progress` at implementation start and `done` after verification/review -- keep BMad status aligned.

**Acceptance Criteria:**
- Given an authenticated user has an existing conversation, when they submit a follow-up message, then the system loads prior owned messages and the gateway prompt includes recent conversation context.
- Given a conversation has multiple messages, when the owner reopens AI Ask with that conversation, then the message history displays in chronological order and the next submission continues the same thread.
- Given a user attempts to load or continue another user's conversation, when the request is made, then access is denied server-side and no messages are exposed or appended.
- Given a continuation attempt succeeds or fails at the provider, when persistence completes, then the displayed answer state is derived from persisted messages and no misleading assistant message is created on failure.

## Spec Change Log

## Review Triage Log

### 2026-07-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 4, low 4)
- defer: 1: (high 0, medium 1, low 0)
- reject: 2
- addressed_findings:
  - `[medium]` `[patch]` Persisted failed follow-up user messages were hidden in the client until refresh; appended failed user messages to visible thread while preserving retry draft.
  - `[medium]` `[patch]` Continuation prompt history was bounded only by message count; added a character budget for recent-history prompt construction and test coverage.
  - `[medium]` `[patch]` Prompt version could not distinguish new continuation-history behavior; bumped usage prompt version to `ai_ask_initial_v3` and updated assertions.
  - `[medium]` `[patch]` Client composer could keep stale conversation state if App Router reused the component for a different query conversation; keyed composer by loaded conversation ID.
  - `[low]` `[patch]` Loaded-conversation message read filtered only by conversation ID after owner check; added user ID filter as defense in depth.
  - `[low]` `[patch]` Loaded-conversation aria label still described waiting for first question; made the label match loaded-history state.
  - `[low]` `[patch]` Page copy implied conversation continuation was future work; updated it to describe current continuation behavior.
  - `[low]` `[patch]` Added static rendering coverage for refreshed failed user-only turns so persisted history remains visible.
  - `[medium]` `[defer]` Concurrent submissions from two tabs can read stale history before either sees the other in-flight turn; deferred conversation-level locking/serialization.

## Design Notes

History passed to the gateway should remain bounded and ordinary chat-session text. A simple recent-turn slice is sufficient for Epic 2; durable extracted context, unrelated sessions, selected trip projects, source bundles, and provenance are later epic responsibilities.

## Verification

**Commands:**
- `pnpm test:run` -- expected: continuation tests and existing integration tests pass with mocked gateway calls.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Auto Run Result

Status: done

Summary: Implemented Story 2.5. AI Ask can now continue an owned conversation, include bounded recent user/assistant history in the gateway prompt, render loaded conversation history in chronological order, and reject cross-user load/continue attempts without exposing or mutating protected messages. Failed follow-up sends now keep the persisted user turn visible while preserving the retry draft and avoiding misleading assistant messages.

Files changed:
- `src/features/ai/prompts.ts` -- added history-aware prompt construction with message and character bounds; bumped prompt version to `ai_ask_initial_v3`.
- `src/features/ai/ask-gate.ts` -- accepted optional `conversationId`, enforced owned continuation, appended messages to the same conversation, and preserved usage/failure semantics.
- `src/features/ai/ai-ask-composer.tsx` -- initialized from persisted history, retained active conversation ID, appended continuation turns, and preserved thread visibility on failure.
- `src/app/ai-ask/page.tsx` -- loaded optional owned conversation history by query param and passed it to the composer with updated continuation copy and accessibility labels.
- `src/features/chat-trips/conversations.ts` -- strengthened message loading with user ID filtering.
- `tests/ai-ask-shell.test.ts` -- added coverage for loaded history, cross-user access denial, continuation prompt history, failed follow-up behavior, and prompt history bounds.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 2.5 done.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- added concurrent continuation hardening follow-up.
- `_bmad-output/implementation-artifacts/spec-2-5-continue-conversation-with-context.md` -- recorded implementation, review, verification, and result.

Review findings breakdown: 8 patch findings fixed, 1 medium follow-up deferred, 2 findings rejected as out of scope/noise.

Verification performed:
- `pnpm test:run tests/ai-ask-shell.test.ts` -- passed, 19 tests.
- `pnpm test:run` -- passed, 5 test files, 68 tests.
- `pnpm lint` -- passed.
- `pnpm build` -- passed.
- `pnpm typecheck` -- first parallel run failed because it raced with `pnpm build` while `.next/types` were regenerated; sequential rerun passed.

Residual risks:
- Concurrent follow-up submissions from multiple tabs can still produce stale-context assistant replies; recorded in deferred work.
- There is still no full browser interaction test harness for composer submission behavior; server/static rendering tests cover persistence and rendering contracts.
- Changes were not committed because explicit commit permission was not provided.
