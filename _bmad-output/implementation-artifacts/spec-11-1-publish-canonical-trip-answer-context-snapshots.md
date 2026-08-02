---
title: 'Publish Canonical TripAnswerContext Snapshots'
type: 'feature'
created: '2026-07-30'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '2847c3d87585033af95edc86c6f3d817ba976a43'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** AI Ask currently constructs a flat, legacy/chat-derived context and persists no exact record of the compacted Trip Project context sent to generation. This lets lower-priority data obscure confirmed structured state and makes the final answer's context unauditable.

**Approach:** Publish one owner-scoped `TripAnswerContext v1` from Chat/Trips, consume that exact instance in source-bundle rendering and proposal drafting, and persist its bounded post-compaction evidence only inside the existing terminal command fence.

## Boundaries & Constraints

**Always:** Preserve owner isolation, aggregate/conversation fencing, source priority, safe-warning and prompt-injection behavior, read-only generation, transactional outbox behavior, and deletion scrubbing. Structured anchors/items/constraints are canonical; legacy aliases and bounded chat may only fill explicitly absent fields. Use explicit deterministic orders and the exact post-compaction rendered prompt section for inclusion accounting and SHA-256.

**Block If:** Migration compatibility requires durable-data or overlapping-runtime support without an approved expand-migrate-contract path, or current schemas cannot represent a deletion-safe immutable reference topology.

**Never:** Create a second context assembler or AI-owned Trip Planning writer; expose a snapshot/read endpoint; persist transcript, provider, proposal, raw source, secret, dynamic/deferred data, or another module's mutable aggregate; reload Trip Project state during finalization; update the BMad story or sprint status.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Canonical project context | Owned selected project and matching primary/current conversation | Versioned aggregate, anchors, ordered items, constraints, primary ID, and bounded active facts | No error expected |
| Scope mismatch | Another owner or project/conversation mismatch | No context and no existence/data disclosure | Safe empty/no-scope result |
| Lower-priority conflict | Chat/legacy value materially disagrees with canonical structured state | Stable typed conflict; answer may clarify while proposal input remains canonical | Bounded conflict only |
| Compaction | Selected context exceeds prompt cap | Exact rendered references included; removed ones excluded with finite reason; digest matches final section | Retain existing safe minimal behavior |
| Stale/deleted fence | Aggregate, linkage, or lifecycle changes before completion | Existing discarded/refresh-required behavior and no snapshot or answer-side success state | Transaction rolls back callback writes |

</intent-contract>

## Code Map

- `packages/database/src/answer-context.ts` -- evolve flat digest into the sole v1 publisher contract and deterministic renderer inputs.
- `src/features/chat-trips/trip-projects.ts` -- provide owner-scoped structured aggregate reads, explicit ordering, and canonical proposal input.
- `packages/database/src/source-bundle.ts` -- consume v1 once and record exact context selection, exclusions, rendering, and digest.
- `packages/database/src/ai-ask-stream-execution.ts` -- carry generation-time bundle/section through fenced finalization.
- `packages/database/src/ai-ask-commands.ts`, `packages/database/src/provenance.ts`, `src/features/ai/evaluation-answer.ts` -- attach command/provenance/usage/evaluation to one immutable snapshot without changing fencing.
- `packages/database/src/schema.ts`, `drizzle/migrations/` -- add the smallest forward-only, deletion-safe snapshot/reference schema.
- `tests/answer-context.test.ts`, `tests/trip-projects.test.ts`, `tests/trip-change-proposals.test.ts`, `tests/ai-ask-commands.test.ts`, `tests/ai-ask-stream-execution.test.ts` -- prove canonicality, deterministic evidence, references, fences, and regressions.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/answer-context.ts` and Chat/Trips aggregate seam -- define and publish the bounded v1 contract, canonical precedence, stable typed conflicts, owner checks, and deterministic structured ordering.
- [x] `src/features/chat-trips/trip-projects.ts` and proposal draft seam -- reuse canonical structured state with deterministic plan ordering; preserve aggregate-version advancement and canonical-only proposal premises.
- [x] `packages/database/src/source-bundle.ts` -- render one v1 instance deterministically under the existing cap, emitting exact included/excluded context references and a SHA-256 over the final section.
- [x] `packages/database/src/schema.ts`, `drizzle/migrations/`, and terminal persistence seams -- atomically persist immutable bounded snapshot evidence and explicit bounded references behind `finalizeAiAskCommand`, with deletion-safe relationships.
- [x] Relevant tests -- add serial PostgreSQL coverage for all matrix cases, exact snapshot integrity/reference topology, and existing API/BFF execution behavior.

**Acceptance Criteria:**
- Given AI Ask reads an owned selected Trip Project, when Chat/Trips publishes v1, then it contains only the required canonical aggregate state and bounded current-conversation facts.
- Given structured, legacy, and chat data conflict, when context is assembled, then structured state wins, lower-priority gap fill is bounded, material disagreements are typed, and proposal drafting relies only on canonical structured state.
- Given generation persists a source bundle, when finalization succeeds behind its existing fence, then its immutable snapshot records deterministic exact post-compaction evidence and its digest, with provenance, usage, and evaluation explicitly referencing it.

## Design Notes

The source bundle is the sole selection ledger: the renderer decides reference inclusion before output, records every compaction exclusion, and hashes the final string. Provenance must consume that ledger rather than infer use from prompt substrings. The snapshot write stays inside the existing finalization callback, so stale/deleted fences cannot leave partial evidence.

## Verification

**Commands:**
- `pnpm vitest run tests/answer-context.test.ts tests/trip-projects.test.ts tests/trip-change-proposals.test.ts` -- expected: serial PostgreSQL canonical-context coverage passes.
- `pnpm vitest run tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts tests/domain-outbox.test.ts tests/chat-trip-context-extraction.test.ts` -- expected: fenced snapshot and regression coverage passes.
- `pnpm vitest run tests/ai-ask-api-adapter.test.ts tests/ai-ask-bff-api.integration.test.ts` -- expected: transport contracts remain byte-compatible and private.
- `pnpm typecheck && pnpm lint && pnpm build && git diff --check` -- expected: type, lint, build, and whitespace checks pass.

## Review Triage Log

### 2026-07-30 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 13 (high 0, medium 10, low 3)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Replaced inferred prompt inclusion with deterministic rendered-entry accounting, including full, compact, minimal, and essential paths.
  - `[medium] [patch]` Rendered bounded typed conflicts and complete structured item semantics; added primary-conversation snapshot evidence.
  - `[medium] [patch]` Bounded constraint/snapshot serialization and added explicit command, provenance, usage, and evaluation snapshot references with owner-safe composite relationships.
  - `[medium] [patch]` Repaired project deletion and retained-command scrub ordering, including the forward trigger replacement migration.

## Auto Run Result

Implemented canonical `TripAnswerContext v1`, deterministic source-bundle selection/digest evidence, and fenced immutable snapshot persistence. The final independent review reported no findings.

Files changed include the context/source-bundle/fenced execution/provenance/usage/schema seams, Chat/Trips deletion handling, evaluation persistence, migrations 0015-0017, and focused regression tests.

Verification passed serially: 206 canonical-context/trip/proposal tests, 79 command/execution/outbox/context-extraction tests, and 25 API/BFF tests. `pnpm typecheck`, `pnpm build`, `pnpm exec drizzle-kit check`, and `git diff --check` passed. `pnpm lint` completed with zero errors and five pre-existing unrelated warnings.

Follow-up review recommendation: false. Residual risk: migration deployment must follow the project release compatibility policy; no deployed overlap evidence was created in this story.
