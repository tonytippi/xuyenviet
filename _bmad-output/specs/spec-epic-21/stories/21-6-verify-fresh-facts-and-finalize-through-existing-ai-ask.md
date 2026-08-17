---
title: 'Verify Fresh Facts And Finalize Through Existing AI Ask'
type: 'feature'
created: '2026-08-17'
status: 'ready-for-dev'
baseline_revision: '06a0c397a721d9ac74c372f96d2e9d09f65d9cbe'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-epic-21/SPEC.md'
  - '_bmad-output/specs/spec-epic-21/story-contracts.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Web fallback currently sends the broad user question and can be triggered independently of Story 21.5 required-need outcomes. This can retrieve unrelated current facts, while terminal AI Ask evidence must remain one consistent fenced result.

**Approach:** Derive one bounded web query from the unresolved or verification-required need plus allowed location or selected canonical-route terms, preserve existing normalized result capture and Usage, and pass the rendered decision through the current AI Ask finalization closure.

## Boundaries & Constraints

**Always:** Treat Story 21.6 exactly; Story 21.5 is complete. Web admission is driven only by required-need outcomes for missing, changing/current, or conflicted facts. Query inputs contain need terms and only allowed place/selected route terms. Keep normalized captured web results, scope/freshness decisions, provider failure handling, Usage, provenance, snapshot, idempotency replay, and current terminal fences. Provider failure retains a safe practical verification warning.

**Block If:** The existing source-bundle and `finalizeAiAskCommand` seams cannot carry the bounded rendered retrieval decision without schema, migration, or a second persistence transaction.

**Never:** Add a run table, prepare/finalize abstraction, terminal state, service, queue, Worker, endpoint, cache, migration, schema change, compatibility mode, or card-count fallback. Do not modify Story 21.5 behavior outside required-need-to-web mapping. Do not use raw provider payloads as persistent authority.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Scoped need | Rendered required need is missing or requires verification | One minimized query uses that need and allowed place/selected canonical route terms; existing capture retains normalized results | No web call when every rendered need is satisfied |
| Provider failure | Scoped query has no key, times out, fails, or returns low-quality results | Existing web Usage records the attempt; final answer retains the gap and practical verification guidance | No unsafe current-fact claim or raw provider payload |
| Fenced terminal | Generation succeeds after web capture | Existing finalization atomically writes assistant message, context snapshot, provenance/retrieval decision, and answer Usage | A stale fence discards the answer-side writes and retains the existing refresh terminal |
| Replay | Same idempotency key is admitted again | Existing terminal projection is replayed and no duplicate answer-side finalization occurs | No second terminal state |

</intent-contract>

## Code Map

- `packages/database/src/source-bundle.ts:97-189,199-309` -- assembles the rendered required-need decision before web loading; replace broad-question query admission with bounded need/place/route input while retaining capture and best-effort web Usage.
- `packages/database/src/source-bundle.ts:311-430,776-819` -- owns required-need evaluation, selected canonical-route resolution, and rendered-manifest recomputation; derive all web reasons from these outcomes, not independent conflict/count heuristics.
- `packages/database/src/web-search.ts:60-146,156-233` -- accepts an already minimized query, normalizes bounded Tavily results, and captures only safe normalized fields under the existing user-message ownership check.
- `packages/database/src/ai-ask-stream-execution.ts:217-383` -- current source rendering, generation, warning derivation, and sole answer-side fenced transaction; preserve this closure and commit the same rendered retrieval decision to provenance.
- `packages/database/src/ai-ask-commands.ts:77-177,237-299` -- existing acquisition/replay and terminal fence; read-only reuse point, with no new terminalization path.
- `packages/database/src/provenance.ts:54-119,231-258` and `packages/database/src/answer-freshness.ts:3-75` -- persist stored normalized web provenance and derive safe freshness guidance from the committed source decision.
- `tests/required-need-retrieval.test.ts` and `tests/web-search-adapter.test.ts` -- extend direct unit evidence for need-driven query construction, no satisfied-need call, normalized capture, and provider failures.
- `tests/ai-ask-stream-execution.test.ts` and `tests/required-need-retrieval.integration.test.ts` -- preserve focused serial evidence for committed web provenance/snapshot, replay, stale fences, and duplicate terminalization using approved `DATABASE_URL_TEST` and local reset.

## Tasks & Acceptance

**Execution:**
- `packages/database/src/source-bundle.ts` -- derive bounded query terms and web trigger reasons only from final required-need outcomes plus allowed location/selected route scope; retain existing capture, Usage, and rendered decision flow.
- `packages/database/src/web-search.ts` -- retain safe normalized capture and provider-failure attempt behavior; accept the scoped query without reintroducing broad-question authority.
- `packages/database/src/ai-ask-stream-execution.ts` and `packages/database/src/ai-ask-commands.ts` -- keep the current fenced terminal transaction as the only answer-side completion seam and preserve the same rendered snapshot/provenance inputs for success, stale, and replay paths.
- `packages/database/src/provenance.ts` and `packages/database/src/answer-freshness.ts` -- derive persisted web source/freshness behavior from the committed snapshot and stored provenance only.
- `tests/scoped-web-answer.test.ts`, `tests/scoped-web-answer.integration.test.ts`, and `tests/ai-ask-stream-execution.test.ts` -- cover WS-01 through WS-05: scoped need queries, satisfied-need suppression, provider failure guidance/Usage, committed normalized provenance, replay, stale fences, and duplicate terminalization; use direct focused Vitest commands if package wrappers expand scope.

**Acceptance Criteria:**
- Given a rendered need is missing, changing, conflicted, or explicitly current, when fallback runs, then it submits a minimized query for that need with only allowed place or selected canonical-route terms.
- Given all rendered required needs are satisfied, when fallback is decided, then no web search starts from a legacy count, broad-question, or unrelated policy trigger.
- Given the provider fails or returns unusable results, when the answer finalizes, then the persisted decision retains the gap and the traveler receives practical verification guidance without an unsupported current claim.
- Given a generated answer succeeds, when the existing finalization fence wins, then assistant message, Usage, normalized web provenance, and bounded retrieval/context snapshots commit in that one transaction.
- Given a fence is stale or the same idempotency key replays, when terminalization is attempted, then no duplicate answer-side records are written and the existing retained terminal projection is returned.

## Spec Change Log

### 2026-08-17 - Product-owner reconciliation

- Reconciled the prior concurrent-modification block. The prior conflict remains recorded below as history; it is not an active blocker.
- Product-owner direction designates the existing dirty changes in `packages/database/src/source-bundle.ts` and `tests/scoped-web-answer.test.ts` as intentional partial Story 21.6 work, not a conflicting writer.
- A bounded recovery is authorized to complete and verify only that existing Story 21.6 work within this story's stated boundaries. No source, test, sprint-status, migration, or other artifact changes are part of this reconciliation.

## Review Triage Log

## Design Notes

Web result capture and web-search Usage remain the existing pre-generation behavior tied to the user message. The atomicity requirement applies to the answer-side assistant message, snapshot, provenance/retrieval decision, and answer Usage in the existing fenced finalization closure; stale work must not create a second terminal state to compensate.

## Verification

**Commands:**
- `pnpm test:unit -- tests/scoped-web-answer.test.ts tests/ai-ask-stream-execution.test.ts` -- focused scoped-web and terminal transaction evidence passes; retain a direct focused command if the wrapper expands scope.
- `pnpm exec vitest run --project integration tests/scoped-web-answer.integration.test.ts` -- focused serial PostgreSQL evidence passes with approved `DATABASE_URL_TEST`.
- `pnpm typecheck` -- strict TypeScript passes.
- `pnpm build` -- production build passes.

## Reconciliation History

### 2026-08-17 - Prior blocked auto-run result

Status: blocked

Blocking condition: concurrent modification conflict in `packages/database/src/source-bundle.ts`.

The synchronous implementation agent applied a partial Story 21.6 change, then observed the same production file return to an earlier state before its next edit. The current worktree retains partial, incomplete changes: `source-bundle.ts` calls `requireVerificationForConflictedNeed` but has no implementation, and `tests/scoped-web-answer.test.ts` imports `buildScopedWebSearchQuery` before it exists. No verification command was run because the TypeScript source is intentionally left uncompiled rather than overwriting an active concurrent writer.

The created Story 21.6 spec and focused test remain in the worktree. `sprint-status.yaml` was not edited.

### 2026-08-17 - Reconciliation outcome

Status: ready-for-dev

Product-owner direction supersedes the concurrent-writer assumption for the two designated partial files. They are intentional Story 21.6 work, and the story may proceed through the bounded recovery recorded in the Spec Change Log.
