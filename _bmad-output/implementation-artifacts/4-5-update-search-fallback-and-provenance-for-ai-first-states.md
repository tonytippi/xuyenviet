# Story 4.5: Update Search Fallback and Provenance for AI-First States

Status: ready-for-dev

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

- [ ] Update state-aware fallback decisions and web adapter inputs (AC: 1, 3)
   - [ ] Refactor `decideWebSearchFallback` reasons and tests away from approved-only terminology.
   - [ ] Carry safe evaluated-candidate policy counts and reason codes into the retrieval decision, including excluded conflict and verification-risk outcomes, without carrying excluded facts or unsafe source fields.
   - [ ] Trigger from policy outcomes and current-state risk, not merely raw result count. An excluded conflict or verification-required candidate must trigger fallback without entering the traveler knowledge bundle. Preserve query minimization, provider timeouts, bounded normalization, official/provider preference, and unverified labels.
  - [ ] Add a deterministic safe verification notice for failed/low-confidence external results, analogous to the existing freshness postprocessor.
- [ ] Migrate persisted decision and provenance contracts (AC: 2)
  - [ ] Update Drizzle schema through a forward-only migration so decisions/provenance retain policy, state/verification/version snapshots, selected card identifiers, fallback reason, and stable persisted `web_search_results` identifiers.
  - [ ] Update `persistAssistantAnswerProvenance` and stream finalization to use the state-aware source-bundle snapshot; do not reconstruct policy from current rows after generation.
   - [ ] Preserve atomic final persistence of assistant message, retrieval decision, row-per-source provenance, and answer usage. Record web capture linkage safely without raw provider content in usage/audit rows.
   - [ ] Use the selected managed AI Gateway model pricing and provider usage metadata to estimate input, output, cache-read, cache-write, and total costs where pricing is available; preserve missing-cost metadata otherwise. Do not store raw prompts, responses, or provider payloads in usage events.
- [ ] Add fallback, persistence, and usage-cost tests (AC: 1-4)
   - [ ] Cover absent, sparse broad-question, freshness, uncertain, conflicted, caveat-only, successful, failed, and low-confidence search paths, including excluded-conflict and excluded-verification-required candidates that trigger fallback without exposing their facts.
   - [ ] Prove stored records identify selected policy/state/version and persisted web IDs, and no raw source/provider data leaks into snapshots or usage events.
   - [ ] Prove authenticated answer usage records the required model/context/status metadata and correctly derives configured pricing costs; prove absent pricing produces safe missing-cost metadata without failing answer finalization.

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

### File List
