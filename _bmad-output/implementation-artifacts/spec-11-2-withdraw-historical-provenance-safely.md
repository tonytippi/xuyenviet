---
title: 'Withdraw Historical Provenance Safely'
type: 'feature'
created: '2026-07-30'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'a4bf89e19d3353488e55653bb47a0a29024c8781'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/11-2-withdraw-historical-provenance-safely.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Historic AI answer provenance can continue exposing source links, quotes, and derived details after Knowledge withdraws the source or evidence. Existing source removal, provenance persistence, reads, annotations, and delayed annotation delivery have no shared withdrawal/cutover guarantee.

**Approach:** Add a forward-only availability and cutover/backfill contract, make the existing provenance persistence boundary and Knowledge removal writers coordinate under one exact-anchor locking/remediation protocol, and make formatter/read/annotation/UI projections non-disclosing for withdrawn rows.

## Boundaries & Constraints

**Always:** Preserve Story 11.1 migrations `0017`/`0018`, terminal fences, immutable snapshots, and deletion cleanup. Use only exact parsed card/source/evidence anchors; never titles, URLs, quotes, mutable eligibility, or substring matching. Availability remains separate from verification status. Lock source IDs (namespace 44), evidence IDs (dedicated namespace), then card IDs (namespace 46), then provenance/message rows. Source/evidence withdrawal must fail closed until durable v1 historic backfill is complete. All traveler withdrawn output is exactly `{ id, rank, availability: "withdrawn", unavailableLabel: "Nguồn này không còn khả dụng.", usedInPrompt, citedInAnswer }`.

**Block If:** The approved migration/cutover path cannot establish old terminal/evaluation writer quiescence before cutover, or the current database contract cannot safely apply the required forward migration.

**Never:** Edit applied migrations, create a competing source-removal writer or a background scheduler, change non-destructive recommendation conflict/retention evidence removal into withdrawal, expose raw snapshots/audit data, bypass `persistAssistantAnswerProvenance`, or update the BMad story or sprint status.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Source/evidence withdrawal | Exact anchors match historic provenance | Atomically withdraw/redact rows, invalidate dependent annotations, then change Knowledge state/scrub | Roll back all changes on remediation failure; safe audit aggregates only |
| Historic cutover | Pre-cutover row has supported exact anchors | Bounded `(created_at, id)` backfill advances a durable compound checkpoint and marks matching rows withdrawn | Malformed/unresolvable anchors persist bounded failure, retain checkpoint, and block removals |
| Read/annotation delivery | Provenance or a final dependency is withdrawn | Only unavailable marker renders; dependent descriptor is omitted; valid source-free warning/trip fact remains | No URL, quote, title, fact, action, or cross-user disclosure |
| Removal/finalization race | Either transaction acquires shared locks first | No completed removal leaves a new available matching provenance or annotation | Writer emits redacted withdrawn variant or existing fence safely discards it |

</intent-contract>

## Code Map

- `packages/database/src/schema.ts`, `drizzle/migrations/` -- provenance availability, v1 cutover state, constraints/indexes, and a new forward migration only.
- `packages/database/src/provenance.ts` -- discriminated formatter and sole coordinated persistence boundary.
- `packages/database/src/assistant-provenance-withdrawal.ts` -- exact-anchor classifier, sorted locking, remediation, admission, and bounded maintenance backfill.
- `packages/database/src/ai-ask-stream-execution.ts`, `src/features/ai/evaluation-answer.ts` -- retain both writer paths through the shared persistence boundary.
- `src/features/knowledge/source-removal.ts` -- extend existing source command and add explicit destructive evidence withdrawal.
- `src/features/chat-trips/conversations.ts`, `src/features/ai/answer-annotations.ts`, `src/features/ai/domain-outbox-worker.ts`, `src/features/ai/ai-ask-composer.tsx` -- availability-aware read, delayed-work, descriptor, and UI seams.
- `tests/knowledge-source-removal.test.ts`, `tests/ai-ask-shell.test.ts`, `tests/chat-trip-context-extraction.test.ts`, `tests/answer-context.test.ts`, `tests/domain-outbox.test.ts` -- source/evidence/backfill, projection, annotation, and concurrency regressions.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/schema.ts`, `drizzle/migrations/0019_*.sql`, and migration metadata -- add `available | withdrawn`, bounded withdrawal metadata, deterministic scan support, and singleton v1 state initialized with one `transaction_timestamp()` while holding the required advisory and table locks -- fixes the historic population before destructive admission.
- [x] `packages/database/src/assistant-provenance-withdrawal.ts` and `packages/database/src/provenance.ts` -- implement exact parsed anchor extraction/classification, global lock ordering, current-owner checks, redacted withdrawal projection, exact annotation dependency invalidation, admission state, and synchronous deterministic checkpointed backfill -- makes persistence/remediation race-safe and fail closed.
- [x] `packages/database/src/ai-ask-stream-execution.ts` and `src/features/ai/evaluation-answer.ts` -- use the mandatory transaction-local boundary without alternate direct provenance writes -- prevents late available inserts from bypassing removal/backfill.
- [x] `src/features/knowledge/source-removal.ts` -- gate destructive source removal on completed backfill, remediate before state changes/scrubbing, verify remediation before `already_completed`, add `withdrawKnowledgeEvidence`, and retain safe idempotent audit aggregates -- preserves the Knowledge-owned transaction while covering source/evidence paths.
- [x] `src/features/chat-trips/conversations.ts`, `src/features/ai/answer-annotations.ts`, `src/features/ai/domain-outbox-worker.ts`, and `src/features/ai/ai-ask-composer.tsx` -- select availability, narrow the union, omit descriptors with withdrawn required dependencies, revalidate delayed work, and render unavailable provenance as non-interactive text only -- closes every active traveler read/annotation seam.
- [x] Focused existing/new tests -- cover source/evidence/card matching, unrelated preservation, rollback/idempotency/audit safety, v1 classifier/checkpoint/failure/admission behavior, legacy available compatibility, owner-scoped unavailable reads, source-free annotations, delayed delivery, retention/conflict non-withdrawal, and both finalization races -- proves ACs without altering unrelated domains.

**Acceptance Criteria:**
- Given Knowledge removes or destructively withdraws a source or evidence, when its retryable command commits, then all exact linked provenance is atomically withdrawn/redacted with safe metadata, only required annotations are invalidated, audits contain safe aggregates, and retry is idempotent.
- Given a historic provenance row is withdrawn, when a traveler read, annotation sanitizer, outbox retry, or UI consumes it, then only the exact localized unavailable marker remains and no source detail or executable capability is recoverable.
- Given cutover backfill has not completed or has an unclassifiable failure, when destructive withdrawal is requested, then it changes no eligibility, evidence, card, payload, provenance, annotation, or completion audit state; once completed, the command safely remediates historic rows and concurrent persistence cannot reintroduce availability.

## Design Notes

The formatter is the authoritative traveler non-disclosure boundary; consumers narrow on `availability` rather than nullable fields. The shared helper is the sole cross-aggregate protocol: provenance writers use it before insertion and Knowledge uses it before state transitions or payload scrubbing. The migration's fixed pre-cutover population plus compound checkpoint makes random UUID provenance IDs safe to resume.

## Verification

**Commands:**
- `pnpm vitest run tests/knowledge-source-removal.test.ts tests/knowledge-search.test.ts` -- expected: serial source/evidence withdrawal and preservation coverage passes.
- `pnpm vitest run tests/ai-ask-shell.test.ts tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts` -- expected: projection, formatter, annotation, and delayed-delivery coverage passes.
- `pnpm vitest run tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts tests/domain-outbox.test.ts` -- expected: fenced writer and race regressions pass.
- `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check` -- expected: baseline quality checks pass.
- Applicable PostgreSQL migration/schema verification under the approved quiescent compatibility path -- expected: forward migration validates without modifying prior migrations.

## Review Triage Log

### 2026-07-30 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 8, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Enforced source, evidence, and card lock ordering before row/provenance work in both withdrawal commands.
  - `[medium] [patch]` Repaired owner-relation card classification, completed-with-failure admission, batch rollback/checkpoint retry, and idempotent remediation.
  - `[medium] [patch]` Re-evaluated evidence-withdrawn cards and re-sanitized annotations against final locked provenance state.

### 2026-07-30 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 6, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Registered the terminal-state migration and restored eligible ownership fixtures for available provenance.
  - `[medium] [patch]` Added backfill checkpoint/admission regressions and aligned backfill, evidence matching, and outbox lock ordering.

### 2026-07-30 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3: (high 0, medium 3, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Restored the completed-cutover fixture for an existing source-removal test.
  - `[medium] [patch]` Failed closed malformed/anchorless insertion provenance and required every declared source anchor to resolve exactly.

### 2026-07-30 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 2, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Acquired the source advisory lock before discovering and locking dependent withdrawal anchors.
  - `[medium] [patch]` Added an explicit guarded synchronous backfill operator command and documented the quiescent run-to-completion release procedure.

### 2026-07-30 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (high 0, medium 1, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Narrowed withdrawal row locks to exact indexed and structured source, evidence, or card candidates before parsed verification.

### 2026-07-30 - Final confirmation
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

## Auto Run Result

Implemented safe historical provenance withdrawal with forward migrations `0019` and `0020`, an availability-aware provenance boundary, a fixed-population checkpointed backfill, source/evidence remediation, and read-time non-disclosure.

Changed schema, migrations, shared provenance/backfill coordination, source removal, finalization/read/annotation/outbox/UI seams, an explicit guarded maintenance command, release instructions, and focused regressions. The authoritative BMad story and sprint status were not modified.

Independent blind and edge reviews ran synchronously through four repair passes. Repairs covered source/evidence/card lock ordering, exact owner anchors, atomic retryable backfill, admission/idempotency, annotation delivery races, migration registration, operator cutover procedure, and narrowed provenance candidate locks. Final confirmation found no remaining actionable findings.

Verification passed serially with PostgreSQL migration application: 58 source/backfill/search tests, 266 shell/context tests, and 57 command/stream/outbox tests. `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm lint` had zero errors and five pre-existing unrelated warnings.

Follow-up review recommendation: false. Residual operational requirement: production must quiesce old provenance writers, apply the forward migrations, and run `pnpm knowledge:assistant-provenance-withdrawal-backfill --execute` to terminal completion before admitting destructive withdrawal.
