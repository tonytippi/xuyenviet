# Story 21.13: Invalidate Planning Evidence On Conversation And Trip Deletion

Status: backlog

## Story

As a traveler, I want deleted planning data to stop influencing the system, so that a deleted conversation or Trip cannot leave reconstructable state behind.

## Acceptance Criteria

**Given** an ordinary conversation, primary conversation, or Trip is deleted
**When** Chat/Trips coordinates owner invalidator ports
**Then** every reconstructable clarification graph/session/claim/value, plan/extract attempt and payload, task digest, query plan, retrieval execution/run, web decision, manifest, conversion opportunity/manifest/nonterminal replay state, derived context, embedding, diagnostic, Trip snapshot, canonical route choice, Trip proposal, and production-evaluation membership is invalidated in one transaction
**And** ordinary-chat deletion leaves an unrelated Trip unchanged, while primary-conversation deletion replaces the primary conversation or deletes the Trip without orphaning it.

**Given** audit or aggregate evaluation remains after deletion
**When** it is inspected
**Then** it contains only approved non-content identity, actor/operation class, timestamp, or aggregate metrics
**And** it cannot reconstruct the question, answer, Trip state, route, source text, or planning context.

**Given** deletion races finalization, conversion, or evaluation work
**When** the transaction fences execute
**Then** stale work cannot restore or mutate deleted state
**And** `DEL-01` through `DEL-04`, `CLAR-10`, `CLAR-27`, FR-15, PCR-09, and AC-33 pass in serial integration tests.

## Tasks / Subtasks

- [ ] `packages/domain/src/planning-evidence-invalidation.ts` (NEW) — define transaction-aware Chat/Trips, AI Orchestration, Retrieval, Trip conversion, projection/embedding, and Feedback/Eval invalidator ports. Each owner receives only owner-scoped IDs plus the shared transaction and returns a bounded non-content result; no generic cross-owner table writer is allowed (AC: 1-3).
- [ ] `packages/database/src/ai-ask-commands.ts`, `packages/database/src/ai-ask-stream-execution.ts`, and `packages/database/src/planning-evidence-invalidation.ts` (NEW) — implement AI Orchestration and Retrieval invalidators for plan/extract attempts, task/query digests, executions/runs, web decisions, selection/would-render/prompt manifests, derived context, embeddings, reconstructable diagnostics, and production-evaluation membership that exists after Stories 21.1-21.10 (AC: 1-3).
- [ ] `packages/database/src/trip-recommendations.ts`, `packages/database/src/traveler-proposal-commands.ts`, and `packages/database/src/primary-conversation.ts` — invalidate conversion opportunities/manifests and nonterminal replay state created by Story 21.10 while retaining only bounded non-content replay/audit fields (AC: 1-3).
- [ ] `packages/database/src/index.ts` and `packages/domain/src/index.ts` — extend the existing `deleteConversation(...)` and `deleteTripProject(...)` command/port boundary to coordinate all owner invalidators in the existing PostgreSQL transaction. Preserve the current primary-conversation replacement behavior, unrelated Trip isolation, owner locks, lifecycle fences, and audit semantics at `packages/database/src/index.ts:202-247` (AC: 1-3).
- [ ] `packages/database/src/schema.ts`, `drizzle/migrations/`, and `drizzle/migrations/meta/_journal.json` — only if completed upstream schemas lack an owner/lifecycle fence, add the minimal next Drizzle-generated forward migration needed for atomic invalidation and run `pnpm db:generate`; do not create persistence for Story 21.11 tables early or edit historical migrations (AC: 1, 3).
- [ ] `tests/planning-evidence-invalidation.test.ts` (NEW) and `tests/planning-evidence-deletion.integration.test.ts` (NEW) — cover redaction, the complete owner map, ordinary/primary/Trip deletion, unrelated Trip isolation, non-reconstructable retained audit, finalization/conversion/evaluation races, `DEL-01`-`DEL-04`, `CLAR-10`, and `CLAR-27`; the integration file calls `resetTestDatabase()` locally (AC: 1-3).
- [ ] Run `pnpm test:unit -- tests/planning-evidence-invalidation.test.ts`, `pnpm test:integration -- tests/planning-evidence-deletion.integration.test.ts tests/trip-recommendations.integration.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` (AC: 1-3).

## Dev Notes

- Depends on Stories 21.8 and 21.10. Chat/Trips coordinates deletion; each owning module invalidates its own reconstructable state through a port.
- Keep only approved non-content audit and aggregate fields. Do not add a deletion worker or a deferred cleanup path.
- Story 21.11 must extend `packages/database/src/planning-evidence-invalidation.ts` for its new qualification, shadow, comparison, report-membership, and read-policy evidence rows and rerun the paired deletion coverage. Story 21.13 must not create fake future tables to claim that extension early.

### Invalidator Owner Map

| Owner | Transaction-aware port | Implementation path |
| --- | --- | --- |
| Chat/Trips coordinator | `deleteConversation(...)`, `deleteTripProject(...)` | `packages/database/src/index.ts` |
| AI Orchestration | `invalidateAiOrchestrationEvidence(...)` | `packages/database/src/ai-ask-commands.ts`, `packages/database/src/ai-ask-stream-execution.ts` |
| Retrieval | `invalidateRetrievalEvidence(...)` | `packages/database/src/planning-evidence-invalidation.ts` |
| Trip conversion | `invalidateTripConversionEvidence(...)` | `packages/database/src/trip-recommendations.ts`, `packages/database/src/traveler-proposal-commands.ts`, `packages/database/src/primary-conversation.ts` |
| Planning projections/embeddings | `invalidatePlanningProjections(...)` | `packages/database/src/planning-evidence-invalidation.ts` |
| Feedback/Eval membership | `invalidateEvaluationMembership(...)` | `packages/database/src/planning-evidence-invalidation.ts`; Story 21.11 extends this port for its new tables |

### Block If

- Stories 21.8 and 21.10 are not `done`, or their File Lists do not identify the finalization and conversion persistence that deletion must invalidate.
- Any owner invalidator cannot participate in the caller's PostgreSQL transaction, or the implementation would require direct cross-owner writes, a deferred worker, or a best-effort cleanup path.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.13]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-13-and-AD-36]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md#Deletion-Matrix]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Deletion-And-Ownership]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]
