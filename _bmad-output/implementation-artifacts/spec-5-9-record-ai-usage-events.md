---
title: 'Story 5.9: Record AI Usage Events'
type: 'feature'
created: '2026-07-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-8-validate-web-search-fallback-quality.md'
warnings: []
baseline_revision: '543f557'
final_revision: '543f557'
---

<intent-contract>

## Intent

**Problem:** AI Ask, extraction, and suggestion paths already write usage rows, but usage semantics are spread across callers and Tavily web search provider calls are not recorded in `ai_usage_events`. Without one Usage-owned contract, future cost analysis can miss provider calls or persist unsafe/inconsistent metadata.

**Approach:** Harden the Usage module as the standard write boundary for provider usage events, preserve existing AI Gateway token/cost behavior, and add safe web-search usage events for Tavily attempts without duplicating prompts, answers, raw source material, or provider payloads.

## Boundaries & Constraints

**Always:** Record only authenticated provider calls with safe metadata: user/context IDs when available, purpose, provider, model/mechanism label, prompt version or request contract, timestamp, latency, success/failure status, error code when applicable, available token metadata, and calculable pricing snapshots. Preserve successful traveler answers when usage metadata or pricing is partial. Keep usage append-only and server-only.

**Block If:** Implementing the story requires adding billing/credit ledger behavior, showing usage/cost to travelers, changing `ai_usage_events` into raw prompt/response storage, or introducing live provider calls into normal tests.

**Never:** Do not store raw prompts, answer text, source snippets, raw provider payloads, secrets, credit balances, reward/ranking/payout state, request blocking for insufficient credits, or direct OpenAI calls outside the Gateway adapter.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Existing AI Gateway success | Authenticated AI Ask or extraction call returns provider model, latency, and token metadata | One `ai_usage_events` row stores linkage, purpose, provider/model, prompt version, success, token metadata, gateway model ID, pricing snapshot, and estimated cost where calculable | Missing provider token fields remain null and do not block the answer |
| Existing AI Gateway failure | Authenticated provider call fails after a model is selected | One failure usage row stores linkage, purpose, provider/model, latency, pricing snapshot, and safe error code | Failure row does not include raw request/response text and does not create a misleading assistant message |
| Web search provider success | Authenticated AI Ask triggers Tavily fallback and captures usable results | One usage row records provider `tavily`, model/mechanism `search`, purpose for web search fallback, prompt/request contract version, latency, success, context IDs, and no raw query/results | Web result rows remain the source of source metadata; usage row stores operational metadata only |
| Web search provider safe failure | Tavily key missing, timeout, provider error, invalid response, or low-quality results | One failure usage row records provider `tavily`, model/mechanism `search`, latency where measurable, status failure, and safe error code | Existing warning-only answer behavior remains; missing key or low-quality search does not block generation |
| Pricing unavailable | Provider usage exists but selected model pricing or cache pricing is absent | Usage row is still inserted with null unavailable cost fields and calculable fields where possible | Null pricing/cost fields are safe and do not cause request failure |

</intent-contract>

## Code Map

- `src/features/usage/events.ts` -- Usage-owned insertion boundary for `ai_usage_events`; centralize constants/helpers and keep normalization/cost estimation safe.
- `src/features/ai/models.ts` -- Existing model selection, pricing snapshot, and cost estimation; preserve nullable pricing semantics.
- `src/features/ai/gateway.ts` -- Existing OpenAI-compatible usage parsing for streaming and extraction; extend only if provider metadata shapes are missing.
- `src/app/api/ai-ask/stream/route.ts` -- AI Ask orchestration already writes success/failure/abort usage rows; should pass web-search usage context into source bundle assembly.
- `src/features/retrieval/source-bundle.ts` -- Web fallback orchestration; add authenticated usage context around `searchWebForSourceBundle`.
- `src/features/retrieval/web-search.ts` -- Tavily adapter; expose measured latency/status details without storing query/result bodies in usage events.
- `src/features/chat-trips/context-extraction.ts` -- Existing chat/trip extraction usage path; keep compatible with Usage module standard.
- `src/features/knowledge/extraction.ts` -- Existing knowledge draft extraction usage path; keep compatible with Usage module standard.
- `src/features/knowledge/suggestions.ts` -- Existing source suggestion usage path; keep compatible with Usage module standard.
- `tests/ai-usage-events.test.ts` -- Focused Usage helper tests for normalization, pricing, missing metadata, and non-content persistence.
- `tests/ai-ask-shell.test.ts` -- AI Ask end-to-end-ish coverage for generated answers and web fallback usage rows.
- `tests/web-search-adapter.test.ts` -- Adapter coverage for latency/status behavior if changed.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Mark Story 5.9 status as implementation advances.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/usage/events.ts` -- Add Usage-owned purpose/request-version constants or typed helpers for AI Ask, extraction, suggestion, and web search fallback; keep `writeAiUsageEvent` as the only insert helper -- standardize provider usage semantics.
- [x] `src/features/retrieval/web-search.ts` -- Return safe operational metadata for Tavily attempts, including latency and failure code, without exposing raw query/results beyond existing normalized web result storage -- enable provider event recording.
- [x] `src/features/retrieval/source-bundle.ts` -- Record `ai_usage_events` rows for authenticated web search fallback success and safe failure using Usage helper, conversation ID, user message ID, provider `tavily`, model/mechanism `search`, and no raw content -- close the provider-call coverage gap.
- [x] `src/app/api/ai-ask/stream/route.ts` -- Pass the selected user's usage context into source-bundle assembly and preserve current answer behavior if web search usage recording fails -- keep usage telemetry internal and non-blocking for traveler answers.
- [x] `tests/ai-usage-events.test.ts` -- Add focused tests for cost estimation/write normalization, missing token/pricing metadata, cache pricing null behavior, and no raw content fields -- protect the Usage module contract.
- [x] `tests/ai-ask-shell.test.ts` and/or `tests/web-search-adapter.test.ts` -- Add regressions that Tavily success/failure during AI Ask writes safe usage rows while existing web warnings/source capture still behave -- protect Story 5.9 provider coverage.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Move `5-9-record-ai-usage-events` through in-progress/review/done -- keep BMad tracking aligned.

**Acceptance Criteria:**
- Given earlier minimal usage events exist, when Story 5.9 is complete, then the Usage module remains compatible with the existing `ai_usage_events` schema and all current Gateway usage call sites still compile and persist rows through the standard helper.
- Given an authenticated user submits AI Ask and a model, extraction, or suggestion provider call runs, when the call succeeds or fails after provider selection, then a usage row records user/context linkage, purpose, provider/model, prompt/request version, latency, status, safe error code when applicable, available token metadata, and calculable cost snapshot fields.
- Given web search fallback is triggered during authenticated AI Ask, when Tavily succeeds, fails, times out, is missing an API key, or returns low-quality results, then a usage row records the provider attempt with safe metadata and does not store raw query text, result snippets, raw provider payloads, prompts, or answers.
- Given provider token metadata, cache token metadata, pricing, or cache pricing is unavailable, when usage is persisted, then missing fields remain null, calculable fields are stored where possible, and the user answer is not blocked.
- Given future credit billing is not part of MVP, when usage events are stored, then no credit balance, reward, ranking, payment obligation, or insufficient-credit request blocking behavior is added.

## Spec Change Log

## Review Triage Log

### 2026-07-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 3, low 0)
- defer: 1: (high 0, medium 1, low 0)
- reject: 1: (high 0, medium 0, low 1)
- addressed_findings:
  - `[medium]` `[patch]` Preserved partial cache token metadata when top-level prompt token metadata is unavailable, while still dropping impossible cache counts when prompt-token bounds are available.
  - `[medium]` `[patch]` Added explicit `client_aborted` web-search failure telemetry so caller cancellations do not inflate provider timeout counts.
  - `[medium]` `[patch]` Wrapped unexpected web-search adapter exceptions so web fallback remains warning-only instead of aborting answer generation.

## Design Notes

The existing schema and most AI Gateway paths are already in place. Treat this story as hardening and coverage completion, not a migration-heavy redesign. Web search is a provider call but not a model call; use a stable mechanism label such as `search` and a request contract version rather than inventing token/cost values.

## Verification

**Commands:**
- `pnpm test:run tests/ai-usage-events.test.ts tests/ai-ask-shell.test.ts tests/web-search-adapter.test.ts` -- expected: usage helper, AI Ask usage, and web-search regressions pass.
- `pnpm lint` -- expected: passes.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.

## Dev Agent Record

### Completion Notes

- Added Usage-owned constants for AI Ask, extraction, suggestion, and web-search fallback usage semantics while keeping `writeAiUsageEvent` as the single insert helper.
- Added Usage-owned token normalization before persistence/cost estimation so invalid token metadata and invalid related cache token metadata remain null.
- Added safe Tavily operational attempt metadata (`provider`, `mechanism`, `latencyMs`, `status`, `errorCode`) to the web-search adapter without adding raw query/result/provider payload data to usage events.
- Recorded authenticated web-search fallback success/failure rows from source-bundle assembly with provider `tavily`, model/mechanism `search`, request contract `web_search_fallback_v1`, conversation ID, and user message ID.
- Passed web-search usage context from the AI Ask stream route and kept usage recording warning-only/non-blocking for traveler answers.
- Added focused Usage helper tests and AI Ask/web-search adapter regressions for safe Tavily success/failure usage rows and no raw content in `ai_usage_events`.

### Verification Results

- `pnpm test:run tests/ai-usage-events.test.ts tests/ai-ask-shell.test.ts tests/web-search-adapter.test.ts` -- initially failed 1 Usage helper assertion; fixed related cache-token persistence normalization.
- `pnpm test:run tests/ai-usage-events.test.ts tests/ai-ask-shell.test.ts tests/web-search-adapter.test.ts` -- passed, 64 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed.
- `pnpm build` -- passed before review patches.
- `pnpm test:run tests/ai-usage-events.test.ts tests/ai-ask-shell.test.ts tests/web-search-adapter.test.ts` -- passed after review patches, 65 tests.
- `pnpm typecheck` -- passed after review patches.
- `pnpm lint` -- passed after review patches.
- `pnpm build` -- passed after review patches.

### Change Log

- 2026-07-09: Implemented Usage-owned AI usage semantics and safe Tavily web-search usage event recording with focused tests and sprint-status review update.
- 2026-07-09: Applied review patches for partial cache-token preservation, client-abort web-search telemetry, and unexpected adapter exception safety.

### File List

- `_bmad-output/implementation-artifacts/spec-5-9-record-ai-usage-events.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `src/app/api/ai-ask/stream/route.ts`
- `src/features/ai/prompts.ts`
- `src/features/retrieval/source-bundle.ts`
- `src/features/retrieval/web-search.ts`
- `src/features/usage/events.ts`
- `tests/ai-ask-shell.test.ts`
- `tests/ai-usage-events.test.ts`
- `tests/web-search-adapter.test.ts`

## Auto Run Result

Status: done

Summary: Implemented Story 5.9 AI usage event standardization. The Usage module now owns shared usage purpose/provider/mechanism/request-version constants and safer token normalization. AI Ask web-search fallback now records safe Tavily provider usage events for success and safe-failure attempts without storing raw query text, result snippets, prompts, answers, provider payloads, or billing/credit behavior.

Files changed:
- `_bmad-output/implementation-artifacts/spec-5-9-record-ai-usage-events.md` -- recorded spec, task completion, review triage, verification, file list, and auto-run result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 5.9 done.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- deferred the existing assistant/provenance/usage atomicity design question.
- `src/app/api/ai-ask/stream/route.ts` -- passes authenticated web-search usage context into source-bundle assembly.
- `src/features/ai/prompts.ts` -- reuses Usage-owned prompt/purpose constants for existing AI Gateway call sites.
- `src/features/retrieval/source-bundle.ts` -- records warning-only Tavily web-search usage rows and guards unexpected adapter failures.
- `src/features/retrieval/web-search.ts` -- returns safe operational attempt metadata and distinguishes caller abort from provider timeout.
- `src/features/usage/events.ts` -- centralizes usage constants and normalizes token/cache-token metadata before cost estimation and persistence.
- `tests/ai-ask-shell.test.ts` -- covers web-search fallback usage rows during AI Ask and absence of raw web content in usage rows.
- `tests/ai-usage-events.test.ts` -- covers Usage helper normalization, pricing snapshots, missing metadata, and safe web-search usage fields.
- `tests/web-search-adapter.test.ts` -- covers web-search attempt metadata and client-abort telemetry.

Review findings breakdown: 3 patch findings fixed (0 high, 3 medium, 0 low), 1 item deferred, 1 rejected.

Follow-up review recommendation: false, because review-driven changes were localized and fully covered by focused regressions.

Verification performed:
- `pnpm test:run tests/ai-usage-events.test.ts tests/ai-ask-shell.test.ts tests/web-search-adapter.test.ts` -- passed after review patches, 65 tests.
- `pnpm typecheck` -- passed after review patches.
- `pnpm lint` -- passed after review patches.
- `pnpm build` -- passed after review patches.

Residual risks:
- AI Ask assistant message/provenance persistence remains coupled to AI Gateway usage insert success by the existing Story 5.5 atomic transaction; this is deferred for an explicit future design decision.
- No commit was created because repository instructions require explicit user approval before committing.
