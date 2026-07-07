---
title: 'Story 2.7: Stream AI Ask Responses And Accept Traveler Image Input'
type: 'feature'
created: '2026-07-07'
status: 'blocked'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-6-basic-chat-responsiveness-and-failure-states.md'
  - '{project-root}/_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-07-ai-gateway-models-streaming-multimodal.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** AI Ask is currently authenticated, text-only, and non-streaming. Story 2.7 asks for progressive streamed responses and image input so travelers can get faster perceived feedback and ask about screenshots or photos from inside chat.

**Approach:** Add streaming and image-input support only after the model capability decision is resolved. The implementation must preserve the existing persisted-message source-of-truth, fail-closed validation, authenticated ownership checks, and Vietnamese-first chat UX from Stories 2.2 through 2.6.

## Boundaries & Constraints

**Always:** Authenticate before reading conversations or accepting submissions; validate text and image inputs before provider calls; stream only transient partial text; persist only the final completed assistant message; keep failed streams recoverable without creating a completed assistant message; scope accepted images to the owning conversation/user; keep image deletion compatibility for later chat/session deletion stories; route all provider calls through the AI Gateway adapter.

**Block If:** Story 5.0/model capability catalog is not implemented and there is no explicit approval to use a temporary hard-coded capability gate for Story 2.7; image storage/retention cannot be represented with owner-scoped metadata; the selected Gateway model's streaming or image-input support is unknown; satisfying image input requires storing provider payloads blindly or bypassing deletion requirements.

**Never:** Do not direct-call OpenAI; do not stream before context/source/provenance inputs are prepared; do not treat partial streamed text as saved answer content; do not create fake citations or source chips; do not accept unauthenticated, oversized, unsupported, or invalid-image submissions; do not add image output, booking, payments, credits, referral rewards, or a new app architecture.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Text streaming | Authenticated user submits valid text and selected model supports streaming | UI receives progressive assistant text and reconciles to the final persisted assistant message after completion | If stream fails, show recoverable failure and do not persist a completed assistant message |
| Image input | Authenticated user submits valid text plus a supported image and selected model supports image input | Image is validated and owner-scoped before the Gateway request, then sent only through the approved adapter path | Provider failure preserves the user turn/failure state but no assistant message |
| Unsupported image | Unsupported MIME type, too-large file, unauthenticated user, invalid text, or model without image capability | Request is rejected before provider call | No message, usage event, or provider call is created unless a separately approved text-only fallback exists |
| Missing capability decision | No model catalog and no approved hard-coded capability gate | Implementation does not proceed | Auto-dev halts blocked with the missing decision recorded |

</intent-contract>

## Code Map

- `src/app/ai-ask/page.tsx` -- authenticated AI Ask page that loads owned conversation history and renders the composer.
- `src/features/ai/ai-ask-composer.tsx` -- client chat UI, pending/failure state, duplicate-submit guard, and message rendering; would need streamed transient assistant state and image attachment affordance.
- `src/features/ai/ask-gate.ts` -- current non-streaming server action that validates, persists user messages, calls the Gateway, persists final assistant messages, and records usage.
- `src/features/ai/gateway.ts` -- current non-streaming OpenAI-compatible Gateway adapter; would need a streaming parser/request path and multimodal content support.
- `src/features/ai/prompts.ts` -- current prompt purpose, prompt version, hard-coded model, and bounded history builder.
- `src/db/schema.ts` -- current text-only conversation/message and usage schema; image attachment metadata and model capability records are not present.
- `src/features/usage/events.ts` -- current usage-event writer; may need streaming/image metadata once model catalog is resolved.
- `tests/ai-ask-shell.test.ts` -- existing server/static AI Ask test suite and likely target for streaming parser, route, image validation, and persistence assertions.
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-07-ai-gateway-models-streaming-multimodal.md` -- approved change proposal that makes model catalog sequencing explicit.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- BMad sprint status; Story 2.7 remains blocked/backlog until the prerequisite decision is resolved.

## Tasks & Acceptance

**Execution:**
- [ ] `src/db/schema.ts` and `drizzle/migrations/*` -- add or reuse approved model capability/catalog and image attachment metadata only after the prerequisite decision is resolved -- avoid hard-coded, unowned multimodal behavior.
- [ ] `src/features/ai/gateway.ts` -- add an OpenAI-compatible streaming adapter and multimodal request content type behind explicit capability checks -- keep provider access centralized and auditable.
- [ ] `src/app/api/ai-ask/stream/route.ts` or an approved equivalent server boundary -- stream transient chunks, accumulate final text server-side, persist the assistant message only after successful completion, and record usage -- support progressive UI without losing persisted source-of-truth semantics.
- [ ] `src/features/ai/ai-ask-composer.tsx` -- add image selection/removal UI and streamed transient assistant rendering that reconciles to persisted final messages -- improve responsiveness while preserving failure recovery.
- [ ] `tests/ai-ask-shell.test.ts` or focused new tests under `tests/` -- cover streaming success/failure, invalid image fail-closed behavior, capability rejection, persisted final-message source of truth, and no fake sources -- verify all edge cases feasible without a browser E2E framework.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update Story 2.7 status only when implementation actually begins and completes -- keep BMad status truthful.

**Acceptance Criteria:**
- Given the selected model supports streaming and required context/source/provenance inputs are prepared, when an authenticated user submits text, then assistant text streams progressively and the final rendered completed answer matches the persisted assistant message.
- Given streaming fails before completion, when the user is viewing partial text, then the UI shows a recoverable failure state and no misleading completed assistant message is created.
- Given an authenticated user attaches a supported image, when the message is submitted, then file type, size, ownership, and model image-input capability are validated before any provider call.
- Given an image is unsupported, too large, unauthenticated, attached to invalid text, or the selected model lacks image capability, when submission is attempted, then no message, usage event, or provider call is created unless an approved text-only fallback exists.
- Given an accepted image belongs to a conversation, when later deletion stories delete the owning chat/session, then the implementation has owner-scoped image metadata/files that can be removed or disabled according to the deletion contract.

## Spec Change Log

## Review Triage Log

## Design Notes

The approved change proposal explicitly says Story 2.7 should be implemented after Story 5.0/model catalog unless the product/architecture owner explicitly approves a temporary hard-coded capability gate. The current codebase has a hard-coded model string, no model capability records, no image attachment metadata, and no upload/storage/deletion contract. Proceeding unattended would require inventing those decisions, which violates the ready-for-development standard.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-shell.test.ts` -- expected: targeted AI Ask tests pass after implementation.
- `pnpm test:run` -- expected: full test suite passes after implementation.
- `pnpm lint` -- expected: passes after implementation.
- `pnpm typecheck` -- expected: passes after implementation.
- `pnpm build` -- expected: passes after implementation.

## Auto Run Result

Status: blocked

Blocking condition: Story 2.7 depends on Story 5.0/model capability catalog unless a temporary hard-coded capability gate is explicitly approved. The current invocation did not approve that exception, and the codebase has no model capability catalog or owner-scoped image attachment/storage contract.

Evidence:
- `_bmad-output/planning-artifacts/epics.md` states: "Story 5.0 should provide the model capability catalog before Story 2.7 implementation unless a temporary hard-coded capability gate is explicitly approved for the story."
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-07-ai-gateway-models-streaming-multimodal.md` recommends implementing Story 5.0 first unless the temporary gate is explicitly approved.
- Current code has text-only messages, a non-streaming server action, a non-streaming Gateway adapter, hard-coded model selection, no image attachment metadata, and no upload/storage/deletion contract.
