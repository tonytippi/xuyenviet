---
title: 'Story 2.7: Stream AI Ask Responses And Accept Traveler Image Input'
type: 'feature'
created: '2026-07-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'e1a7ed95ef9d9eee68eaf54db330c04f0e3df2ca'
final_revision: 'e1a7ed95ef9d9eee68eaf54db330c04f0e3df2ca'
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
- [x] `src/db/schema.ts` and `drizzle/migrations/*` -- add or reuse approved model capability/catalog and image attachment metadata only after the prerequisite decision is resolved -- avoid hard-coded, unowned multimodal behavior.
- [x] `src/features/ai/gateway.ts` -- add an OpenAI-compatible streaming adapter and multimodal request content type behind explicit capability checks -- keep provider access centralized and auditable.
- [x] `src/app/api/ai-ask/stream/route.ts` or an approved equivalent server boundary -- stream transient chunks, accumulate final text server-side, persist the assistant message only after successful completion, and record usage -- support progressive UI without losing persisted source-of-truth semantics.
- [x] `src/features/ai/ai-ask-composer.tsx` -- add image selection/removal UI and streamed transient assistant rendering that reconciles to persisted final messages -- improve responsiveness while preserving failure recovery.
- [x] `tests/ai-ask-shell.test.ts` or focused new tests under `tests/` -- cover streaming success/failure, invalid image fail-closed behavior, capability rejection, persisted final-message source of truth, and no fake sources -- verify all edge cases feasible without a browser E2E framework.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- update Story 2.7 status only when implementation actually begins and completes -- keep BMad status truthful.

**Acceptance Criteria:**
- Given the selected model supports streaming and required context/source/provenance inputs are prepared, when an authenticated user submits text, then assistant text streams progressively and the final rendered completed answer matches the persisted assistant message.
- Given streaming fails before completion, when the user is viewing partial text, then the UI shows a recoverable failure state and no misleading completed assistant message is created.
- Given an authenticated user attaches a supported image, when the message is submitted, then file type, size, ownership, and model image-input capability are validated before any provider call.
- Given an image is unsupported, too large, unauthenticated, attached to invalid text, or the selected model lacks image capability, when submission is attempted, then no message, usage event, or provider call is created unless an approved text-only fallback exists.
- Given an accepted image belongs to a conversation, when later deletion stories delete the owning chat/session, then the implementation has owner-scoped image metadata/files that can be removed or disabled according to the deletion contract.

## Spec Change Log

## Review Triage Log

### 2026-07-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 9: (high 2, medium 6, low 1)
- defer: 1: (high 0, medium 1, low 0)
- reject: 1
- addressed_findings:
  - `[high]` `[patch]` Malformed or partial provider streams could persist partial assistant content; streaming parser now fails malformed frames, missing `[DONE]`, and non-stop finish states, with regression tests.
  - `[high]` `[patch]` Spoofed image MIME types were trusted; route now validates PNG/JPEG/WebP magic bytes before persistence or Gateway forwarding, with regression tests.
  - `[medium]` `[patch]` Attachment metadata could cross-link a same-user message from another conversation; schema now adds a composite message/conversation/user invariant and migration.
  - `[medium]` `[patch]` Zero-byte images were treated as text-only submissions; route now rejects zero-byte image files before model selection or persistence.
  - `[medium]` `[patch]` Oversized multipart requests could be parsed before aggregate size checks; route now rejects `content-length` above 6MB before `formData()`.
  - `[medium]` `[patch]` Suspicious uploaded filenames were stored verbatim; route now strips control/path characters and caps stored filenames.
  - `[medium]` `[patch]` Client NDJSON parsing could throw on malformed lines; composer now guards malformed stream events and returns a recoverable failed state.
  - `[medium]` `[patch]` Loaded conversation history dropped persisted image metadata; owned conversation loading now includes attachment metadata per message.
  - `[low]` `[patch]` Client abort behavior could try to enqueue/close after disconnect; route now guards enqueue/close and records aborted streams as failed before final persistence.

### Review Findings

_Re-review pass run via `bmad-code-review` on 2026-07-07 against committed revision `67f7fe1` (baseline `e1a7ed9`). Three parallel layers: Blind Hunter, Edge Case Hunter, Acceptance Auditor. 23 raw findings, 4 dismissed as noise, 3 deferred (pre-existing/residual), 2 decision-needed resolved into patch, 16 patch — all 16 patches applied and verified. Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test:run` (6 files, 97 tests), and `pnpm build` all passed after the patches._

**Decision-needed (resolved):**

- [x] [Review][Patch] Streamed text lost when assistant persistence transaction fails — retry the assistant insert outside the transaction [src/app/api/ai-ask/stream/route.ts:217-255] — Resolved decision: on second-transaction failure, retry the assistant message insert (without usage) outside the transaction; if it succeeds, emit `done`. This preserves the persisted-message source-of-truth while accepting that the assistant message and usage event are no longer in one atomic write.
- [x] [Review][Patch] Legacy non-streaming `ask-gate.ts` server action is now dead code from the UI path — remove and migrate tests [src/features/ai/ask-gate.ts, src/features/ai/ai-ask-composer.tsx:182] — Resolved decision: delete `src/features/ai/ask-gate.ts` and migrate its remaining tests to the streaming route so there is a single centralized, auditable provider-call boundary.

**Patch (fix is unambiguous):**

- [x] [Review][Patch] Gateway fetch is not aborted when the client disconnects; provider tokens burn until the 30s timeout [src/features/ai/gateway.ts:153-160, src/app/api/ai-ask/stream/route.ts:157-167] — `streamInitialAiAskAnswer` uses a timeout-only `AbortController`; `request.signal` is only checked inside `onDelta` post-hoc. Pass a combined abort signal (e.g. `AbortSignal.any([timeoutSignal, request.signal])`) to the gateway `fetch` so a client disconnect cancels the upstream call promptly.
- [x] [Review][Patch] `finish_reason !== "stop"` discards valid streamed content for `length`-truncated completions [src/features/ai/gateway.ts:191] — With `max_tokens=900`, a long Vietnamese answer that hits the token limit returns `finish_reason: "length"` with valid partial content already streamed to the user; the whole result is then rejected, no assistant message is persisted, and the user sees the answer appear then vanish. Accept `"length"` (and persist the partial content) as a successful-but-truncated completion.
- [x] [Review][Patch] No conversation row lock; concurrent same-conversation requests interleave history [src/app/api/ai-ask/stream/route.ts:114-130] — The `SELECT` on the conversation has no `FOR UPDATE`. Two concurrent turns on the same conversation both read the same history, both insert user + assistant messages, interleaving the transcript and doubling gateway spend. Add `SELECT ... FOR UPDATE` on the conversation row inside the transaction to serialize turns per conversation.
- [x] [Review][Patch] `streamInitialAiAskAnswer` swallows the abort reason and logs it as a generic `gateway_network_error` [src/features/ai/gateway.ts:205-217] — When `onDelta` throws `client_aborted_stream` (or the fetch aborts), the catch logs `reason: "Error"` and records `gateway_network_error`, conflating client disconnects with provider network failures. Detect the abort case in the catch and return a distinct error code before the generic handler.
- [x] [Review][Patch] JPEG signature check validates only 3 bytes (`FF D8 FF`); trivially spoofable [src/app/api/ai-ask/stream/route.ts:296-298] — Any payload beginning with `FF D8 FF` passes the JPEG check and is forwarded to the gateway as an "image". PNG (8 bytes) and WebP (12 bytes) checks are stricter. Extend the JPEG check to validate the JFIF/Exif segment marker (`FF D8 FF E0` or `FF D8 FF E1`).
- [x] [Review][Patch] SSE `event:` field lines (e.g. provider keepalives) cause the entire stream to fail [src/features/ai/gateway.ts:356-394] — A line like `event: ping` is not a comment and not `data:`-prefixed, so it is parsed as raw JSON, `JSON.parse` throws, the line is marked `failed`, and the whole stream returns `gateway_stream_failed`. Skip non-`data:` lines (return an empty no-op result) instead of routing them through `JSON.parse`.
- [x] [Review][Patch] Stream without a `[DONE]` marker is treated as failure even when `finish_reason: "stop"` was received [src/features/ai/gateway.ts:191,366-368] — `done` is only set by `data: [DONE]`. Providers that send `finish_reason: "stop"` then close the connection without `[DONE]` are rejected as `invalid_gateway_response`. Treat `finishReason === "stop"` as a valid terminal state: change the final check to `(!streamResult.done && streamResult.finishReason !== "stop")`.
- [x] [Review][Patch] Token usage is not recorded on the client-abort-after-success path [src/app/api/ai-ask/stream/route.ts:194-210] — When the gateway returns `ok: true` with usage but `abortSignal.aborted` is true, the failure usage event omits `promptTokens`/`completionTokens`/`totalTokens`/`cachedPromptTokens`/`cacheWritePromptTokens` even though `gatewayResult.usage` is available. Pass the token fields into the aborted-stream failure usage event so cost can still be estimated.
- [x] [Review][Patch] Malformed multipart body throws unhandled, returning a 500 HTML instead of a clean JSON 400 [src/app/api/ai-ask/stream/route.ts:34] — `await request.formData()` is outside `streamAnswer`'s try/catch. A corrupted/truncated multipart body throws and surfaces as a Next.js default 500. Wrap `request.formData()` in a try/catch and return `Response.json({ error: "Invalid form data." }, { status: 400 })`.
- [x] [Review][Patch] No client-side abort on unmount/navigation during an active stream [src/features/ai/ai-ask-composer.tsx:388] — `fetch("/api/ai-ask/stream", ...)` passes no `signal`; on navigation the request keeps running until the browser closes the TCP connection and `request.signal` fires. Scope an `AbortController` to the component, pass `signal` to `fetch`, and abort in a `useEffect` cleanup so the server cancels the gateway call promptly.
- [x] [Review][Patch] Reloaded conversation UI silently drops persisted image attachment metadata [src/app/ai-ask/page.tsx:89-93, src/features/ai/ai-ask-composer.tsx:9-13] — `getOwnedConversation` loads `imageAttachments` per message (and tests verify the data layer), but `page.tsx` maps messages to `{ id, role, content }` and `DisplayMessage` has no `imageAttachments` field, so a reloaded conversation shows no trace of images. Extend `DisplayMessage` with an optional `imageAttachments` array, pass it through `page.tsx`, and render a compact non-interactive label (e.g. "Đã kèm ảnh: road.png") under user messages that have attachments — without implying provenance.
- [x] [Review][Patch] Selected image affordance shows no thumbnail or type/size summary [src/features/ai/ai-ask-composer.tsx:332-338] — The approved change proposal UX contract calls for a thumbnail/file row with type/size validation and an accessible label; the implementation shows only the filename + remove button. Render a small `<img>` thumbnail via `URL.createObjectURL(selectedImage)` (revoked on remove/clear) and append the MIME type and byte size to the label.
- [x] [Review][Patch] No streaming-route test for the "no streaming-capable model configured" rejection [tests/ai-ask-shell.test.ts] — Streaming tests cover image-capability rejection but not the case where the default `ai_ask_initial_answer` model has `supportsStreaming: false` (or no model exists). Add a test that seeds a model with `supportsStreaming: false`, submits valid text, and asserts `response.status` is 409, `fetchMock` not called, and zero conversations/messages/usage events.
- [x] [Review][Patch] Composer terminal-event handling lets a later `error` overwrite a prior `done` [src/features/ai/ai-ask-composer.tsx:422-428] — Both `done` and `error` use unconditional assignment. The server never sends both today, but the parser is not defensive against a trailing/corrupted error frame after a successful terminal event. Guard the `error` branch with `if (terminalResult?.status !== "answer-created")` so a confirmed success cannot be flipped to failure.

**Defer (real but not actionable now / pre-existing residual):**

- [x] [Review][Defer] Content-length guard bypassable via chunked/missing/non-numeric header; `request.formData()` buffers unbounded multipart body [src/app/api/ai-ask/stream/route.ts:28-32] — deferred, pre-existing — already tracked in `deferred-work.md`; spec residual risks defer aggregate body limits to the platform edge. App-level streaming multipart protection is the proper fix but is out of scope for this story.
- [x] [Review][Defer] Base64-embedding a 5MB image into the gateway JSON body creates large in-memory strings per request [src/app/api/ai-ask/stream/route.ts:281-289, src/features/ai/gateway.ts:165-172] — deferred, pre-existing — a streaming base64 body or gateway multipart/binary image upload would avoid the multi-copy cost but requires a gateway-protocol change; appended to `deferred-work.md`.
- [x] [Review][Defer] SSE parser assumes one `data:` line per event; multi-line `data:` fields would mis-parse [src/features/ai/gateway.ts:356-394] — deferred, pre-existing — not reachable with OpenAI/standard OpenAI-compatible gateways; revisit if a multi-line-emitting gateway/proxy is adopted; appended to `deferred-work.md`.

## Design Notes

The approved change proposal explicitly says Story 2.7 should be implemented after Story 5.0/model catalog unless the product/architecture owner explicitly approves a temporary hard-coded capability gate. The current codebase has a hard-coded model string, no model capability records, no image attachment metadata, and no upload/storage/deletion contract. Proceeding unattended would require inventing those decisions, which violates the ready-for-development standard.

## Verification

**Commands:**
- `pnpm test:run tests/ai-ask-shell.test.ts` -- expected: targeted AI Ask tests pass after implementation.
- `pnpm test:run` -- expected: full test suite passes after implementation.
- `pnpm lint` -- expected: passes after implementation.
- `pnpm typecheck` -- expected: passes after implementation.
- `pnpm build` -- expected: passes after implementation.

Performed:
- `pnpm db:generate` -- passed; generated migrations `0009_breezy_namorita.sql` and `0010_chilly_kronos.sql`.
- `pnpm test:run tests/ai-ask-shell.test.ts` -- passed, 35 tests.
- `pnpm test:run` -- passed, 6 test files, 98 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

## Auto Run Result

Status: blocked

Blocking condition: Story 2.7 depends on Story 5.0/model capability catalog unless a temporary hard-coded capability gate is explicitly approved. The current invocation did not approve that exception, and the codebase has no model capability catalog or owner-scoped image attachment/storage contract.

Evidence:
- `_bmad-output/planning-artifacts/epics.md` states: "Story 5.0 should provide the model capability catalog before Story 2.7 implementation unless a temporary hard-coded capability gate is explicitly approved for the story."
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-07-07-ai-gateway-models-streaming-multimodal.md` recommends implementing Story 5.0 first unless the temporary gate is explicitly approved.
- Current code has text-only messages, a non-streaming server action, a non-streaming Gateway adapter, hard-coded model selection, no image attachment metadata, and no upload/storage/deletion contract.

---

Status: done

Summary: Implemented Story 2.7 after Story 5.0 resolved the model capability prerequisite. AI Ask now submits through an authenticated streaming route, selects a streaming/image-capable AI Gateway model from the catalog, streams transient deltas to the UI, persists only the final successful assistant message, records usage success/failure, and accepts validated traveler image input with owner-scoped attachment metadata. Invalid images, capability mismatches, malformed streams, truncated streams, unauthenticated submissions, and oversized submissions fail before provider calls or final assistant persistence as appropriate.

Files changed:
- `src/app/api/ai-ask/stream/route.ts` -- added authenticated NDJSON streaming route with text/image validation, model capability checks, owner-scoped persistence, usage recording, stream integrity handling, and client-abort guards.
- `src/features/ai/gateway.ts` -- added OpenAI-compatible streaming adapter, multimodal request content support, SSE parsing, usage/model parsing, malformed stream detection, and terminal-state validation.
- `src/features/ai/ai-ask-composer.tsx` -- added image selection/removal UI, client-side image validation, streamed transient assistant rendering, NDJSON parsing, and final persisted-message reconciliation.
- `src/db/schema.ts` -- added `message_image_attachments` metadata table and composite ownership/consistency constraints.
- `src/features/chat-trips/conversations.ts` -- included image attachment metadata when loading owned conversation history.
- `drizzle/migrations/0009_breezy_namorita.sql` and metadata -- created attachment metadata table and owner indexes/constraints.
- `drizzle/migrations/0010_chilly_kronos.sql` and metadata -- added message/conversation/user composite constraint for attachment consistency.
- `tests/ai-ask-shell.test.ts` -- added streaming success/failure, image validation, capability rejection, attachment metadata, malformed/truncated stream, and no-side-effect regression coverage.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 2.7 and Epic 2 done.
- `_bmad-output/implementation-artifacts/spec-2-7-stream-ai-ask-responses-and-accept-traveler-image-input.md` -- recorded implementation, review triage, and verification.

Verification performed:
- `pnpm db:generate` -- passed.
- `pnpm test:run tests/ai-ask-shell.test.ts` -- passed, 35 tests.
- `pnpm test:run` -- passed, 6 test files, 98 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.

Review findings breakdown: 9 patch findings fixed, 1 deferred, 1 rejected as not required for this story.

Follow-up review recommendation: false.

Commit status: not committed because explicit commit permission was not provided.

Residual risks:
- The route uses `content-length` for aggregate multipart rejection; deployments/proxies should still enforce request body limits at the platform edge.
- Image bytes are forwarded to the configured AI Gateway as data URLs and only metadata is persisted; future durable file storage, if added, must preserve the same owner/deletion contract.
