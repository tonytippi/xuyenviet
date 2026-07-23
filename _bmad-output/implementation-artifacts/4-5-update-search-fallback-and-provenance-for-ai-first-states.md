# Story 4.5: Update Search Fallback and Provenance for AI-First States

---
baseline_commit: 06d0bc8935d44347124b59f7a77d9f76b0222bce
---

Status: review

## Story

As a traveler,
I want current external information when active knowledge is insufficient or risky,
so that changing road-trip details are handled honestly.

## Acceptance Criteria

1. Given active knowledge is absent, fewer than three relevant items answer a broad question, selected knowledge is freshness-sensitive, uncertain, or caveat-only, or evaluated candidates are excluded for conflict or verification risk, when the retrieval decision is made, provider-adapted web fallback runs with official/provider preference and results remain unverified.
2. Given web search succeeds, when response provenance is persisted, the retrieval decision and row-per-source provenance retain selected knowledge card IDs, use policies, state/verification/version snapshots, search reason, and persisted web result IDs; assistant message and provenance are transactionally consistent.
3. Given web search fails or results are low confidence, when an answer is generated, it explicitly says current information could not be verified and recommends user confirmation without inventing current facts.
4. Given the AI Ask model call completes or fails, when its assistant answer is finalized, usage persistence records the authenticated user/context, purpose, provider, selected catalog model, prompt version, latency, status, available provider token/request metadata, and cost estimate from effective model pricing. Missing pricing is stored as missing-cost metadata and never blocks a safe answer.

## Tasks / Subtasks

- [x] Update state-aware fallback decisions and web adapter inputs (AC: 1, 3)
   - [x] Refactor `decideWebSearchFallback` reasons and tests away from approved-only terminology.
   - [x] Carry safe evaluated-candidate policy counts and reason codes into the retrieval decision, including excluded conflict and verification-risk outcomes, without carrying excluded facts or unsafe source fields.
   - [x] Trigger from policy outcomes and current-state risk, not merely raw result count. An excluded conflict or verification-required candidate must trigger fallback without entering the traveler knowledge bundle. Preserve query minimization, provider timeouts, bounded normalization, official/provider preference, and unverified labels.
   - [x] Add a deterministic safe verification notice for failed/low-confidence external results, analogous to the existing freshness postprocessor.
- [x] Migrate persisted decision and provenance contracts (AC: 2)
   - [x] Update Drizzle schema through a forward-only migration so decisions/provenance retain policy, state/verification/version snapshots, selected card identifiers, fallback reason, and stable persisted `web_search_results` identifiers.
   - [x] Update `persistAssistantAnswerProvenance` and stream finalization to use the state-aware source-bundle snapshot; do not reconstruct policy from current rows after generation.
    - [x] Preserve atomic final persistence of assistant message, retrieval decision, row-per-source provenance, and answer usage. Record web capture linkage safely without raw provider content in usage/audit rows.
    - [x] Use the selected managed AI Gateway model pricing and provider usage metadata to estimate input, output, cache-read, cache-write, and total costs where pricing is available; preserve missing-cost metadata otherwise. Do not store raw prompts, responses, or provider payloads in usage events.
- [x] Add fallback, persistence, and usage-cost tests (AC: 1-4)
     - [x] Cover absent, sparse broad-question, freshness, uncertain, conflicted, caveat-only, successful, failed, and low-confidence search paths, including excluded-conflict and excluded-verification-required candidates that trigger fallback without exposing their facts.
     - [x] Prove stored records identify selected policy/state/version and persisted web IDs, and no raw source/provider data leaks into snapshots or usage events.
     - [x] Prove authenticated answer usage records the required model/context/status metadata and correctly derives configured pricing costs; prove absent pricing produces safe missing-cost metadata without failing answer finalization.

### Review Findings

- [x] [Review][Patch] Propagate excluded candidate policy outcomes into production fallback [src/features/retrieval/source-bundle.ts:119] — retrieval returns safe aggregate exclusion counts/reason codes and the production bundle passes them to `decideWebSearchFallback`.
- [x] [Review][Patch] Remove raw external content from provenance snapshots [src/features/retrieval/provenance.ts:160] — web provenance now persists only stable linkage and safe decision metadata.
- [x] [Review][Patch] Treat missing provider scores as low-confidence external results [src/features/retrieval/web-search.ts:177] — unscored provider results are rejected as low quality.
- [x] [Review][Patch] Trigger external fallback for selected uncertain or caveat-only knowledge [src/features/retrieval/source-bundle.ts:266] — added the safe `selected_knowledge_requires_verification` reason for selected caveat-only, uncertain, or verification-required cards; added schema/migration allowance and narrow-query regression coverage without exposing facts.
- [x] [Review][Patch] Classify incomplete selected-model pricing as missing pricing [src/features/usage/events.ts:74] — pricing completeness now checks the selected model's effective prices independently of valid provider usage; incomplete pricing is persisted as `missing_pricing`.
- [x] [Review][Patch] Replace unsupported current-fact answers after failed or low-quality web fallback [src/features/ai/answer-freshness.ts:13] — external-fallback failure now replaces model output before it can be streamed or persisted, and finalization is required for these paths.
- [x] [Review][Patch] Include the explicit external-verification failure notice in caveat-only fallback answers [src/features/ai/answer-freshness.ts:13] — the replacement includes the AC 3 external-verification failure notice and each caveat-only verification target.
- [x] [Review][Patch] Persist available AI Gateway request metadata for AI Ask usage events [src/features/ai/gateway.ts:361] — only bounded request identifiers from allowlisted headers or completion IDs are retained in `ai_usage_events`; raw payloads remain excluded.
- [x] [Review][Patch] Fail closed on unrepresentable computed usage costs [src/features/ai/models.ts:151] — arithmetic and aggregate costs outside PostgreSQL integer or JavaScript-safe bounds persist as nullable costs with `missing_cost`, without aborting assistant/provenance persistence.

## Dev Notes

- Search remains provider-adapted (`Tavily` is provisional), server-only, and external/unverified. Never treat a preferred official/provider page as internal verified knowledge.
- The web result may be captured before response finalization because it is needed for context assembly. The final assistant message, decision, provenance, and answer usage must remain one transaction; do not save a completed assistant answer on failed stream finalization.
- Keep no provider calls for unauthenticated or invalid requests. Do not expose provider payloads, raw query content, or source material in errors, logs, telemetry, or traveler UI.
- Stable persisted web row IDs replace synthetic rank-only references for provenance integrity.

### Project Structure Notes

- Retrieval and Search: `src/features/retrieval/source-bundle.ts`, `web-search.ts`, and `provenance.ts`.
- Orchestration: `src/app/api/ai-ask/stream/route.ts`; preserve pre-stream context assembly.
- Persistence: `src/db/schema.ts` and generated `drizzle/migrations/` artifacts.
- Tests: `tests/answer-context.test.ts`, `tests/web-search-adapter.test.ts`, `tests/ai-usage-events.test.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.5]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-9, AD-11, AD-16]
- [Source: src/features/retrieval/web-search.ts]
- [Source: src/features/retrieval/provenance.ts]
- [Source: src/app/api/ai-ask/stream/route.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Implement after Story 4.3 source-bundle snapshots and Story 4.4 answer policy. Preserve persistence ownership and transaction boundaries.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Replaced approved-only fallback reason codes with active-knowledge reasons and persisted a safe state/policy snapshot, including selected card IDs and excluded policy counts.
- Captured stable `web_search_results` IDs before finalization and persisted those IDs in row-per-source web provenance without provider payload data.
- Added deterministic Vietnamese verification guidance for failed or low-quality web fallback and explicit missing-pricing usage metadata.
- Verified with `pnpm test:run` (684/684), `pnpm typecheck`, `pnpm lint` (3 pre-existing warnings only), and `pnpm build`.
- 2026-07-23: Repaired review findings: production retrieval now propagates only safe exclusion aggregates into fallback decisions, web provenance snapshots retain only stable linkage and safe metadata, and unscored provider results fail as low quality. Verified with `pnpm test:run tests/web-search-adapter.test.ts tests/answer-context.test.ts` (88/88) and `pnpm typecheck`.
- 2026-07-23: Repaired final permitted findings: selected caveat-only, uncertain, and verification-required knowledge now forces safe web fallback; incomplete selected-model pricing is classified as `missing_pricing`. Verified with `pnpm test:run tests/answer-context.test.ts tests/ai-usage-events.test.ts tests/web-search-adapter.test.ts` (96/96), `pnpm typecheck`, and `git diff --check`.
- 2026-07-23: Repaired the final AC 3/4 findings: failed or low-quality web fallback now replaces unsupported model claims before streaming/persistence, including caveat-only verification targets; AI Ask usage safely retains allowlisted provider request IDs; unrepresentable cost calculations persist as `missing_cost`. Verified with `pnpm test:run tests/answer-context.test.ts tests/ai-ask-shell.test.ts tests/ai-usage-events.test.ts tests/ai-models.test.ts tests/web-search-adapter.test.ts` (189/189), `pnpm typecheck`, and `git diff --check`.

### File List

- drizzle/migrations/0051_state_aware_search_provenance.sql
- drizzle/migrations/0052_accept_legacy_web_trigger_rows.sql
- drizzle/migrations/0053_selected_knowledge_verification_fallback.sql
- drizzle/migrations/0054_ai_usage_provider_request_metadata.sql
- drizzle/migrations/meta/_journal.json
- src/db/schema.ts
- src/features/ai/answer-freshness.ts
- src/features/retrieval/provenance.ts
- src/features/retrieval/source-bundle.ts
- src/features/retrieval/web-search.ts
- src/features/usage/events.ts
- tests/ai-ask-shell.test.ts
- tests/ai-usage-events.test.ts
- tests/answer-context.test.ts
- tests/web-search-adapter.test.ts
- _bmad-output/implementation-artifacts/4-5-update-search-fallback-and-provenance-for-ai-first-states.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-07-23: Implemented state-aware web fallback, persisted provenance/usage contract updates, migrations, and regression coverage; marked ready for review.
- 2026-07-23: Fixed the three actionable Story 4.5 review findings; status synchronized to review.
- 2026-07-23: Second repair review found two remaining actionable findings; status synchronized to in-progress.
- 2026-07-23: Fixed the final permitted Story 4.5 findings; status synchronized to review.
- 2026-07-23: Final permitted review found four actionable AC 3/4 safety and usage-persistence findings; status synchronized to in-progress for coordinator repair.
- 2026-07-23: Fixed the four final Story 4.5 findings; status synchronized to review.
