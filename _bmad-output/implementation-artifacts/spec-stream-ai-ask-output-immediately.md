---
title: 'Stream AI Ask Output Immediately'
type: 'bugfix'
created: '2026-08-07'
baseline_commit: '740b0d156fd5a7f90eb13ee649f02cb4273c3536'
status: 'done'
review_loop_iteration: 0
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AI Ask buffers model deltas whenever web fallback, conditional knowledge, or verification-related policy is present. The resulting silent connection can be closed by a browser or intermediary before the traveler sees useful content.

**Approach:** Stream model output immediately after retrieval context has been assembled. Trust the normalized source bundle and model prompt for traveler output; preserve terminal persistence and bounded warning construction without using them as a content-stream gate.

## Boundaries & Constraints

**Always:** Keep retrieval/source-bundle assembly before the provider call; preserve existing request ownership, command fencing, persistence, NDJSON event framing, and safe terminal error handling; reconcile the persisted final message as today; test both formerly-buffered and ordinary paths.

**Ask First:** Any change to the source bundle, knowledge policy/schema, API event contract, or client-visible provider error behavior.

**Never:** Add heartbeats, a new stream event type, new dependencies, database migrations, browser persistence, or a second AI request; replace source normalization with browser or post-hoc prose-derived policy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| General planning fallback | Missing/sparse knowledge or failed web fallback | First model delta is streamed immediately; final persisted answer keeps its bounded warning | Existing safe terminal failure applies if provider fails |
| Conditional or verification knowledge | Source bundle contains a policy-bearing normalized card | First model delta is streamed immediately | Existing final message persistence and warning projection remain intact |
| Ordinary answer | No finalization-prior policy state | Streaming behavior is unchanged | Existing fencing and terminal semantics remain intact |

</frozen-after-approval>

## Code Map

- `packages/database/src/ai-ask-stream-execution.ts` -- emits provider deltas, finalizes the command, and persists the final answer.
- `packages/database/src/answer-freshness.ts` -- constructs final persisted warning content from the assembled source bundle.
- `packages/database/src/gateway.ts` -- parses OpenAI-compatible streaming responses and treats clean EOF with content as terminal-compatible when provider metadata is omitted.
- `packages/database/src/knowledge-search.ts` -- retrieves and hydrates approved knowledge candidates without N+1 database round trips.
- `tests/ai-ask-stream-execution.test.ts` -- execution-level stream ordering and persisted-answer regressions.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/ai-ask-stream-execution.ts` -- remove the final-policy gate around provider delta emission while retaining final answer construction and persistence -- prevents an idle response stream after source assembly.
- [x] `tests/ai-ask-stream-execution.test.ts` -- prove previously finalization-gated web-fallback and dynamic source bundles emit their provider delta before completion while terminal persistence remains authoritative -- protects the intended experience.
- [x] `packages/database/src/ai-ask-stream-execution.ts` -- detach admitted generation from the browser relay abort signal -- preserves terminal persistence when the traveler reloads or changes conversation.
- [x] `tests/ai-ask-stream-execution.test.ts` -- abort the browser-side relay after `preparing` and verify the assistant answer and command completion are still persisted -- protects durable submit behavior.
- [x] `packages/database/src/gateway.ts` -- accept a clean provider SSE EOF after answer content when an OpenAI-compatible provider omits terminal metadata -- prevents valid streamed answers from being discarded.
- [x] `packages/database/src/knowledge-search.ts` -- batch-hydrate approved knowledge candidate cards/sources/evidence after lexical search -- preserves the 1.5s bounded retrieval budget without hiding N+1 round-trip latency behind a larger timeout.

**Acceptance Criteria:**
- Given AI Ask has completed retrieval/source-bundle assembly, when the provider emits a content delta, then the traveler receives that delta immediately regardless of web fallback or normalized knowledge policy state.
- Given final answer warning construction changes the persisted content, when the stream has already shown model text, then the existing terminal reconciliation continues to make the persisted message authoritative.
- Given an admitted AI Ask request, when the traveler reloads or navigates away, then the HTTP relay may close but the API process continues generation through gateway completion and stores the terminal answer for that conversation.
- Given approved knowledge search matches many active candidates, when retrieval evaluates candidate count and policy summary, then card/source/evidence hydration uses bounded batch queries rather than one or more database round trips per candidate.

## Verification

**Commands:**
- `pnpm test:unit -- tests/ai-ask-stream-execution.test.ts` -- expected: stream ordering and persistence regressions pass.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript checks pass.
- `pnpm build` -- expected: production build passes.

## Suggested Review Order

**Streaming Path**

- Emit provider deltas immediately; final persistence no longer controls response liveness.
  [`ai-ask-stream-execution.ts:183`](../../packages/database/src/ai-ask-stream-execution.ts#L183)

- Avoid appending a replacement fallback to already streamed model content.
  [`ai-ask-stream-execution.ts:262`](../../packages/database/src/ai-ask-stream-execution.ts#L262)

**Regression Coverage**

- Cover immediate output for fallback and dynamic scenarios, with persisted terminal reconciliation.
  [`ai-ask-stream-execution.test.ts:46`](../../tests/ai-ask-stream-execution.test.ts#L46)
