---
title: 'Story 2.3: Generate Vietnamese Initial AI Answer'
type: 'feature'
created: '2026-07-06'
status: 'done'
baseline_revision: '1cf3392c51efd3211e1da85a7762abd320678e61'
final_revision: '1cf3392c51efd3211e1da85a7762abd320678e61'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-create-conversation-and-send-first-message.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Valid AI Ask submissions currently create only a conversation and first user message, so travelers still do not receive useful planning guidance. Story 2.3 must introduce the first real AI Gateway call while preserving the existing auth, validation, and no-side-effect guarantees.

**Approach:** Extend the authenticated first-message flow to generate one Vietnamese initial assistant answer through the configured OpenAI-compatible AI Gateway, persist that answer only on successful generation, and record a minimal durable AI usage event for both success and failure attempts.

## Boundaries & Constraints

**Always:** Keep `/ai-ask` and `submitAiAsk` server-authenticated. Validate the question before any conversation, message, usage, or provider work. Use only `AI_GATEWAY_BASE_URL` and `AI_GATEWAY_API_KEY` through a small server-only adapter, never direct OpenAI calls. Send a Vietnamese-first planning prompt with explicit purpose, prompt version, model, and output-shape expectation. Persist the user conversation/message before the provider attempt, persist the assistant message only when non-empty answer text is returned, and record minimal usage with user ID, conversation/message IDs, purpose, provider/model, prompt version, timestamp, latency, success/failure status, and safe error code when relevant. Keep user-facing failure copy safe and do not expose provider payloads or secrets.

**Block If:** A product decision is required about streaming, retrieval/search/provenance rows, source/confidence rendering, follow-up conversation routes, model/provider selection beyond a reasonable default, or storing raw prompts/provider payloads. Block if a migration cannot preserve existing test/database behavior or if failure handling would require creating a misleading assistant message.

**Never:** Do not call an AI provider for unauthenticated, empty, malformed, or over-2000-character submissions. Do not create fake answers, fake citations, source chips, retrieval decisions, assistant provenance rows, web search records, trip project context, credit/reward behavior, or a new conversation detail route. Do not parse answer sources from model text or expose raw provider errors to the traveler.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Successful initial answer | Authenticated user submits `Đi Đà Nẵng 5 ngày cùng gia đình` and gateway returns Vietnamese text | Creates owned conversation, user message, assistant message, and successful usage event; returns IDs plus assistant content for UI display | No error expected |
| Missing trip details | Authenticated user submits a broad question with sparse details | Prompt asks the model to provide useful initial guidance plus concise follow-up questions in Vietnamese | No error expected |
| Provider failure | Authenticated user submits valid question but gateway request fails or returns invalid answer text | Conversation and user message remain; failed usage event is recorded; no assistant message is created; action returns safe retryable failure status | User sees safe Vietnamese failure copy and can retry from the same draft |
| Invalid question | Authenticated user submits empty, malformed, or over-limit question | Request is rejected before DB/provider side effects | No conversation, messages, usage event, or provider call |
| Unauthenticated submit | No valid session submits any question | Existing authenticated mutation guard rejects the request | No conversation, messages, usage event, or provider call |

</intent-contract>

## Code Map

- `src/db/schema.ts` -- add minimal append-only `ai_usage_events` table and exports without adding credit ledger behavior.
- `drizzle/migrations/*` -- generated migration for usage events.
- `src/features/ai/gateway.ts` -- new server-only OpenAI-compatible AI Gateway adapter with safe response parsing and latency/usage metadata.
- `src/features/ai/prompts.ts` -- new prompt constants for initial Vietnamese road-trip answer generation.
- `src/features/usage/events.ts` -- new server-only usage event writer owned by the usage feature.
- `src/features/ai/ask-gate.ts` -- extend valid first-message flow to call gateway, persist assistant message on success, and record usage on success/failure.
- `src/features/ai/ai-ask-composer.tsx` -- update pending/success/failure behavior and display returned user/assistant messages without fake content.
- `tests/ai-ask-shell.test.ts` -- update existing AI Ask integration tests for answer success, provider failure, and no-side-effect invalid/auth paths.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark Story 2.3 in progress during work and done after verification/review.

## Tasks & Acceptance

**Execution:**
- [x] `src/db/schema.ts` and `drizzle/migrations/*` -- add minimal usage event persistence for AI answer attempts -- satisfy Story 2.3 durable usage requirement without implementing billing or credits.
- [x] `src/features/ai/gateway.ts` and `src/features/ai/prompts.ts` -- implement the server-only gateway prompt/call seam -- ensure all provider access goes through the configured AI Gateway.
- [x] `src/features/usage/events.ts` -- add an explicit usage-event writer -- keep telemetry separate from audit and feature aggregates.
- [x] `src/features/ai/ask-gate.ts` -- generate and persist the first assistant answer after creating the user message, record usage for success/failure, and preserve no-provider-call behavior for invalid/auth failures -- implement the story behavior.
- [x] `src/features/ai/ai-ask-composer.tsx` -- render the submitted user message and returned assistant answer, with safe retryable failure copy -- make the generated answer visible without new routes.
- [x] `tests/ai-ask-shell.test.ts` -- cover success, provider failure, invalid input, unauthenticated input, persisted assistant message, and usage events -- verify the I/O matrix.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- keep Story 2.3 status aligned -- maintain BMad workflow state.

**Acceptance Criteria:**
- Given an authenticated user submits a broad road-trip planning question, when the AI answer is generated, then the persisted assistant response and UI-visible answer are Vietnamese-first and provide useful initial guidance without requiring a long form first.
- Given important trip details are missing, when the prompt is sent to the AI Gateway, then the instructions require concise Vietnamese follow-up questions while still asking for initial planning direction.
- Given the AI provider call fails or returns unusable answer text, when the action completes, then no assistant message is created and the traveler receives safe retryable failure copy.
- Given an authenticated AI answer generation attempt starts, when it succeeds or fails, then a durable usage event records minimal context and status without storing raw provider payloads or creating credit/reward behavior.

## Spec Change Log

## Review Triage Log

### 2026-07-06 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 4, low 2)
- defer: 0
- reject: 4: (high 0, medium 0, low 4)
- addressed_findings:
  - `[medium]` `[patch]` Added a 30s abort signal for AI Gateway calls so hung providers cannot leave the server action pending indefinitely.
  - `[medium]` `[patch]` Added `max_tokens: 900` to bound initial answer generation and storage size.
  - `[medium]` `[patch]` Removed failed user-message rendering from the composer to avoid encouraging duplicate failed conversation retries while still keeping the draft text for retry.
  - `[medium]` `[patch]` Added `aria-live` to the generated-message section so newly displayed answers are announced more reliably.
  - `[low]` `[patch]` Classified malformed JSON/invalid successful responses as `invalid_gateway_response` rather than network errors.
  - `[low]` `[patch]` Added non-negative DB checks for usage token columns and regression coverage for invalid token values.

## Design Notes

Assistant content is persisted as the source of truth before being shown in the client. The UI may optimistically display the submitted user text after a successful server response, but it must not invent or edit the assistant answer outside the returned persisted content.

## Verification

**Commands:**
- `pnpm db:generate` -- expected: creates one Drizzle migration for `ai_usage_events`.
- `pnpm test:run` -- expected: all tests pass with mocked AI Gateway calls and no external network.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Auto Run Result

Status: done

Summary: Implemented and reviewed Story 2.3. Authenticated valid AI Ask submissions now create a conversation and user message, call the server-only OpenAI-compatible AI Gateway adapter with Vietnamese initial-answer prompt constants, persist an assistant message only on successful non-empty output, and record minimal AI usage events for success and provider failure. Invalid and unauthenticated submissions still create no conversation, messages, usage events, or provider calls. The composer now displays returned persisted user and assistant content on success, keeps retryable failure copy safe, and avoids fake source/provenance UI.

Files changed:
- `src/db/schema.ts`
- `drizzle/migrations/0005_spooky_strong_guy.sql`
- `drizzle/migrations/meta/0005_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `src/features/ai/gateway.ts`
- `src/features/ai/prompts.ts`
- `src/features/usage/events.ts`
- `src/features/ai/ask-gate.ts`
- `src/features/ai/ai-ask-composer.tsx`
- `tests/ai-ask-shell.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/spec-2-3-generate-vietnamese-initial-ai-answer.md`

Verification performed:
- `pnpm db:generate` -- passed; generated `drizzle/migrations/0005_spooky_strong_guy.sql` and `drizzle/migrations/meta/0005_snapshot.json` for `ai_usage_events`.
- `pnpm test:run` -- first run failed 2 stale tests; fixed stale shell copy assertion and added AI Gateway mock for owner conversation test.
- `pnpm test:run` -- passed, 5 test files, 58 tests.
- `pnpm lint` -- passed.
- `pnpm typecheck` -- first run failed due test union narrowing; added explicit success/failure guards.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.
- Review pass -- patched 6 findings: gateway timeout, gateway output cap, invalid JSON telemetry, token DB checks, duplicate failed-message display, and generated-message `aria-live`.
- `pnpm db:generate` -- passed after folding review-added checks into the uncommitted Story 2.3 migration; no schema changes remained.
- `pnpm test:run` -- passed after review fixes, 5 test files, 60 tests.
- `pnpm lint` -- passed after review fixes.
- `pnpm build` -- passed after review fixes.
- `pnpm typecheck` -- first rerun failed because it raced with `pnpm build` while `.next/types` were being regenerated; rerun after build passed.

Residual risks:
- No browser interaction suite exists for the composer; current coverage remains server/static render plus DB integration tests.
- AI Gateway behavior is tested through mocked `fetch`; no external provider call was made.
- Changes were not committed because explicit commit permission was not provided.
