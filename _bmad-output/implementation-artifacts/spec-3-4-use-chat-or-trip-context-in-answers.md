---
title: 'Use Chat Or Trip Context In Answers'
type: 'feature'
created: '2026-07-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
baseline_revision: '3a6a048aa5bfe676989127de3bc15f66f0d68ebb'
final_revision: 'UNCOMMITTED'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-3-extract-chat-and-trip-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 3.3 now persists chat/trip planning context, but the AI Ask answer prompt never reads it, so answers ignore the traveler's accumulated planning context and feel forgetful.

**Approach:** Before streaming an answer, load active chat-scoped context for the current conversation and, when a trip project is selected, project-scoped context for that project; merge with project priority and surface conflicts; inject a compact Vietnamese context section into the answer prompt so answers reuse relevant remembered context and never read other sessions.

## Boundaries & Constraints

**Always:**
- Load only `status='active'` `chat_context` rows owned by the authenticated user: scope `conversation` for the current conversation, and scope `trip_project` for the selected trip project when one is in scope. Never query other conversations or other projects.
- Assemble the context section before the answer stream begins; the gateway request must include it when non-empty.
- On a per-field conflict between project and conversation scope, prefer the project-scoped value and surface the conflict pair to the model so it can ask a concise clarification when the conflict materially affects the answer.
- Within one scope, when multiple active rows exist for the same field, the latest (`createdAt`, then `id`) wins.
- Context loading is best-effort: on failure, log server-side and continue the answer stream with no context section; the stream contract and failure/usage paths are unchanged.
- Bump the AI Ask initial answer prompt version and record the new version on every usage event.
- Cap the context section (max 30 facts and a small character budget) so the prompt stays bounded.

**Block If:**
- This work requires writing `assistant_response_provenance` rows or a retrieval decision record; provenance and retrieval are owned by Epic 5 (Story 5.5).
- The schema cannot filter active rows by owner/scope/status using the existing indexes.

**Never:**
- No provenance table, no retrieval/search, no source/confidence UI, no embeddings, no deletion UI, no correction UI, no project edit UI.
- No reading context for unauthenticated, cross-user, or project/conversation-mismatched requests.
- No persisting new context from this story; extraction persistence stays Story 3.3's job.
- No using context from sessions other than the current conversation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ordinary chat answer | Authenticated user asks in a conversation with prior conversation-scoped context, no project | Answer prompt includes the conversation context section; no other session's context loaded | No error expected |
| Project-scoped answer | Authenticated user asks inside an owned selected trip project with project + conversation context | Both scopes loaded; project value preferred per field; conflicts surfaced | No error expected |
| Project/chat conflict | Same field has differing project vs conversation values | Project value used as primary; conflict pair included so the model may ask a concise clarification | No error expected |
| Unrelated session | Another conversation or project has context rows | Those rows are not loaded or sent to the model | No error expected |
| Deleted context | Rows with `status='deleted'` exist for the current scope | Excluded from the context section | No error expected |
| Context load failure | DB error during context load | Answer stream still completes with no context section | Log server-side; stream continues |

</intent-contract>

## Code Map

- `src/features/chat-trips/answer-context.ts` -- new server-only module: load active owner-scoped chat/trip context, dedupe per scope (latest wins), merge with project priority, surface conflicts, and format the Vietnamese prompt section.
- `src/features/ai/prompts.ts` -- bump AI Ask initial answer prompt version; extend `buildAiAskMessages` with an optional `contextSection` appended to the system prompt; keep `buildInitialAiAskMessages` backward compatible.
- `src/app/api/ai-ask/stream/route.ts` -- after user-message persistence and before building gateway messages, call the loader for the current conversation and selected trip project, build the section, pass it to `buildAiAskMessages`; best-effort with try/catch.
- `tests/answer-context.test.ts` -- cover the I/O matrix and route integration (context appears in the gateway request body; stream completes when context load fails).

## Tasks & Acceptance

**Execution:**
- [x] `src/features/chat-trips/answer-context.ts` -- add `loadAnswerContext` and `buildAnswerContextPromptSection` -- owns read-side context assembly with project priority and conflict surfacing.
- [x] `src/features/ai/prompts.ts` -- bump prompt version and extend `buildAiAskMessages` with optional `contextSection` -- wires remembered context into the answer prompt with explicit versioning.
- [x] `src/app/api/ai-ask/stream/route.ts` -- assemble context before streaming and pass it to `buildAiAskMessages`, best-effort -- makes remembered context drive answers without changing the stream contract.
- [x] `tests/answer-context.test.ts` -- cover ordinary/project/conflict/unrelated/deleted/failure cases plus route integration -- verifies priority, scope isolation, and non-blocking behavior.

**Acceptance Criteria:**
- Given an authenticated user asks in a chat session with prior conversation context, when the assistant prepares an answer, then the answer prompt includes relevant context from that session and no context from other sessions.
- Given an authenticated user asks inside a selected owned trip project, when the assistant prepares an answer, then both project and chat context may be used and the project context has priority.
- Given project and chat context conflict on a field, when the assistant answers, then it prefers the project value or asks a concise clarification when the conflict materially affects the answer.
- Given context loading fails, when the request is handled, then the answer stream still completes and no provider call is blocked by context loading.

## Spec Change Log

Empty -- no bad_spec loopback occurred.

## Review Triage Log

### 2026-07-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 5, low 1)
- defer: 0
- reject: 7
- addressed_findings:
  - `[medium]` `[patch]` `src/features/chat-trips/answer-context.ts` — `buildAnswerContextPromptSection` now truncates at the last complete line within the 2000-char budget and only appends the conflicts block when it fits entirely, so the model never receives a mid-line cut or a bare conflict header promising conflicts it cannot read.
  - `[medium]` `[patch]` `src/features/chat-trips/answer-context.ts` — added a Vietnamese data-only guard prefix to the context section so the answer model treats extracted values as data, not instructions, hardening the self-targeted prompt-injection vector introduced by interpolating user-derived context values into the system prompt.
  - `[medium]` `[patch]` `src/features/chat-trips/answer-context.ts` — `loadAnswerContext` now runs the conversation and project queries concurrently via `Promise.all` and skips the project query entirely when no trip project is selected, removing a serial two-round-trip time-to-first-token regression on the streaming critical path.
  - `[medium]` `[patch]` `tests/answer-context.test.ts` — added a test verifying project-scoped context is shared across conversations of the same project (loads a fact seeded via conversation A when answering in conversation B), pinning the headline cross-conversation project-context behavior.
  - `[medium]` `[patch]` `tests/answer-context.test.ts` — added a cross-user isolation test asserting a second user gets an empty digest even when supplied with the first user's conversation and project ids, pinning the owner-scoped filter.
  - `[low]` `[patch]` `tests/answer-context.test.ts` — the context-load-failure route test now also asserts the gateway answer request body does not contain the context section header, confirming the error path sends the bare system prompt.

## Design Notes

- `loadAnswerContext` returns `{ facts: Array<{ field, value, source }>, conflicts: Array<{ field, projectValue, conversationValue }> }`. `facts` is one entry per field (project-sourced on conflict, otherwise whichever scope has it); `conflicts` lists differing pairs so the formatter can surface them to the model.
- The prompt section is appended to the system prompt only when facts exist. It reuses the raw field names (`origin`, `destination`, `budget`, ...) that the extraction prompt already emits, avoiding a label map that could drift from the allowlist.
- Context from the current turn is not expected to appear in that same answer, because extraction runs via `after()` after the response is sent (Story 3.3). Accumulated context from prior turns drives later answers, which matches "use relevant context from that chat session."

## Verification

**Commands:**
- `pnpm test:run tests/answer-context.test.ts` -- expected: all Story 3.4 tests pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: no type errors.
- `pnpm test:run` -- expected: all tests pass.
- `pnpm build` -- expected: production build succeeds.

## Auto Run Result

**Summary:** Implemented Story 3.4 -- Use Chat Or Trip Context In Answers. Added a Chat/Trips-owned, server-only read path that loads active owner-scoped chat/trip context, merges it with selected-trip-project priority, surfaces per-field conflicts, and injects a compact, injection-hardened Vietnamese context section into the AI Ask answer prompt before streaming. The stream route assembles context best-effort (non-blocking) so the answer contract is unchanged, and the answer prompt version bumped v3 -> v4 for usage tracking.

**Files changed:**
- `src/features/chat-trips/answer-context.ts` -- new `loadAnswerContext` (concurrent, owner-scoped, active-only, project-priority merge with conflict surfacing) and `buildAnswerContextPromptSection` (data-only guard, line-safe truncation, conflicts-block budget guard).
- `src/features/ai/prompts.ts` -- bumped `aiAskInitialAnswerPromptVersion` to `ai_ask_initial_v4` and extended `buildAiAskMessages` with an optional `contextSection` appended to the system prompt (backward compatible).
- `src/app/api/ai-ask/stream/route.ts` -- assembles answer context after user-message persistence and before building gateway messages, best-effort with try/catch, and passes the section to `buildAiAskMessages`.
- `tests/answer-context.test.ts` -- 10 tests covering ordinary/project/conflict/unrelated/deleted/dedup/cross-conversation/cross-user cases plus route integration (context appears in the gateway body; stream completes and sends no context section when context load fails).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 3.4 done.

**Review findings breakdown:**
- Patches applied: 6 (0 high, 5 medium, 1 low).
- Items deferred: 0.
- Items rejected: 7 (unbounded rows -- low consequence for MVP, correct fix disproportionate; UUID latest-wins tiebreak -- ties across turns practically impossible; prompt-version constant test -- brittle, low consequence; raw error in `console.warn` -- follows established project convention; one-turn context staleness -- intended and documented in Design Notes; future-writer newline break -- speculative, current writer sanitizes; duplicate privileged value in conflicts block -- intentional per spec).

**Follow-up review recommendation:** true -- the review pass applied 5 medium patches including a prompt-injection hardening guard and a correctness fix to prompt assembly (affecting every answer), plus a streaming TTFT change; an independent follow-up review would add confidence on the injection-guard adequacy and truncation edge cases.

**Verification performed:**
- `pnpm test:run tests/answer-context.test.ts` -- passed; 10 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `pnpm test:run` -- passed; 10 files, 135 tests.
- `pnpm build` -- passed; 8 pages generated.

**Residual risks:**
- The prompt-injection guard is a soft model instruction, not a hard sandbox; a determined user could still attempt injection via their own context. Impact is bounded because context is owner-scoped (self-targeted only, no cross-user path).
- Context freshness is one turn stale by design: extraction runs via `after()` after the response is sent (Story 3.3), so accumulated context from prior turns drives later answers.
- Per-scope deduplication runs in JS over fetched rows rather than `DISTINCT ON` server-side; acceptable for MVP conversation lengths but could be revisited if conversations grow very long.
- Context accumulation still depends on an active default extraction-capable model being configured (carried over from Story 3.3).

**Blockers:** None.
