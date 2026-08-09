---
title: 'Record AI Ask Source Attribution With Tool Calls'
type: 'feature'
created: '2026-08-07'
baseline_commit: '740b0d156fd5a7f90eb13ee649f02cb4273c3536'
status: 'done'
review_loop_iteration: 0
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AI Ask persists which knowledge cards and web results were rendered into the prompt, but it cannot distinguish sources merely available to the model from sources the model says materially informed its answer. `citedInAnswer` is always false, and the current secondary annotation model call is not the desired source-attribution mechanism.

**Approach:** Add one OpenAI-compatible server-only tool, `report_used_sources`, to the initial streamed answer request. The model streams ordinary Vietnamese answer text and reports source handles used in that same request. Server validates reported handles against the exact source bundle, maps them to final provenance rows, and persists `citedInAnswer` without exposing tool metadata to the browser or granting any data-access tool.

## Boundaries & Constraints

**Always:** Assemble the source bundle before the model request; issue deterministic bounded source handles only for rendered knowledge cards and web results; accept only one tool name and exact bounded arguments; map handles solely to same-turn provenance rows in the final transaction; preserve immediate answer streaming, direct API NDJSON contract, ownership, source-withdrawal behavior, and `usedInPrompt` semantics.

**Ask First:** Adding a model catalog capability/migration, making tool attribution mandatory for a completed answer, exposing citation taxonomy/IDs to travelers, allowing the model to retrieve/search data, or changing the existing annotation/proposal worker behavior.

**Never:** Add a browser-visible tool event, raw source material, arbitrary tool execution, SQL/query tool, second model call, worker dependency, schema migration, new API endpoint, or retry loop solely for source attribution. A missing/malformed/unsupported tool call must leave `citedInAnswer` false and must not fail or delay a valid answer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid attribution | Model streams answer then calls `report_used_sources` with issued handles | Browser receives answer text only; mapped provenance rows persist `citedInAnswer=true` | Ignore duplicate handles |
| No source used | Model calls tool with an empty handle list | Answer completes; all provenance remains uncited | No traveler error |
| Invalid metadata | Unknown handle, malformed arguments, wrong tool name, duplicate tool call, or no tool call | Answer completes; only valid handles from one valid call can be persisted | Do not persist unvalidated attribution or expose an error |
| General reasoning | No rendered knowledge/web/context handle is used | Answer completes with general provenance only | `citedInAnswer` remains false for sources not declared |

</frozen-after-approval>

## Code Map

- `packages/database/src/source-bundle.ts` -- owns exact rendered-source ledger and must provide deterministic tool handles for entries actually present in the prompt.
- `packages/database/src/prompts.ts` -- instructs the model to call the internal reporting tool after composing its answer.
- `packages/database/src/gateway.ts` -- sends the strict OpenAI-compatible tool schema and parses streamed `tool_calls` without forwarding metadata as text deltas.
- `packages/database/src/ai-ask-stream-execution.ts` -- carries validated reported handles into final answer persistence.
- `packages/database/src/provenance.ts` -- maps current-turn handles to inserted provenance rows and sets `citedInAnswer` only after server validation.
- `tests/ai-ask-stream-execution.test.ts` -- validates request shape, stream isolation, attribution persistence, and invalid-tool fallback.

## Product Contract Note

- `report_used_sources` updates only same-turn source attribution on `assistant_response_provenance.citedInAnswer`.
- It does not create `messages.answer_annotations`, text ranges, entity spans, or Trip Change Proposal action annotations.
- `messages.answer_annotations` remains post-answer worker/outbox enrichment owned by `ai_ask.answer_annotation.v1` and related proposal consumers.
- Traveler or operator UI that needs “source was available in the prompt” should use `usedInPrompt`; UI that needs “model explicitly reported material use” should use `citedInAnswer`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/source-bundle.ts` and `packages/database/src/prompts.ts` -- expose issued handles only for exact prompt-rendered knowledge cards and web results, and instruct the model to report materially used handles after answer text -- prevents attribution to omitted or invented data.
- [x] `packages/database/src/gateway.ts` -- add strict `report_used_sources` tool request schema and bounded streamed tool-call assembly/parser, returning valid raw handle candidates separately from answer text -- supports a single model request while keeping the browser stream text-only.
- [x] `packages/database/src/ai-ask-stream-execution.ts` and `packages/database/src/provenance.ts` -- validate model-reported handles against the rendered ledger and persist `citedInAnswer` during same-turn provenance insertion -- makes stored attribution queryable without adding an attribution-only write that could fail an answer.
- [x] `tests/ai-ask-stream-execution.test.ts` -- cover fragmented valid calls, request schema, browser-hidden metadata, and invalid/wrong/duplicate/malformed fallback behavior -- proves failure-safe attribution.

**Acceptance Criteria:**
- Given a rendered knowledge or web source materially informs an answer, when the model reports its issued handle through the internal tool call, then only its corresponding same-turn provenance row persists `citedInAnswer=true` while the answer streams normally.
- Given the model emits tool-call metadata, when the direct stream is consumed by the browser, then no handle, tool name, argument, source ID, or provider metadata is emitted as an answer delta.
- Given no valid attribution tool call is available, when a valid answer completes, then the answer persists successfully and all unconfirmed provenance remains `citedInAnswer=false`.
- Given post-answer annotation workers have not run, when source attribution has completed, then `citedInAnswer` may be populated independently while `messages.answer_annotations` can still be empty.

## Verification

**Commands:**
- `pnpm test:unit -- tests/ai-ask-stream-execution.test.ts` -- expected: source attribution and stream-isolation regressions pass.
- `pnpm test:integration -- tests/ai-ask-stream-execution.test.ts` -- expected: current-turn provenance mapping persists only validated citations.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript checks pass.
- `pnpm build` -- expected: production build passes.

## Suggested Review Order

**Tool Contract**

- Sends one strict internal reporting tool and accepts tool-call completion as terminal.
  [`gateway.ts:103`](../../packages/database/src/gateway.ts#L103)

- Reassembles bounded fragmented tool arguments without forwarding metadata as answer text.
  [`gateway.ts:423`](../../packages/database/src/gateway.ts#L423)

**Source Binding**

- Issues handles only for knowledge/web entries actually rendered into the final prompt.
  [`source-bundle.ts:538`](../../packages/database/src/source-bundle.ts#L538)

- Sets citations in the original provenance insert, avoiding an attribution-only rollback point.
  [`provenance.ts:162`](../../packages/database/src/provenance.ts#L162)

**Execution Evidence**

- Carries model-reported handles only into final same-turn persistence.
  [`ai-ask-stream-execution.ts:290`](../../packages/database/src/ai-ask-stream-execution.ts#L290)

- Exercises valid fragmented calls, invalid degradation, and browser stream isolation.
  [`ai-ask-stream-execution.test.ts:46`](../../tests/ai-ask-stream-execution.test.ts#L46)
