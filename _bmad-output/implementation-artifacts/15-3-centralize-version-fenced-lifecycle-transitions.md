# Story 15.3: Centralize Version-Fenced Lifecycle Transitions

Status: ready-for-dev

## Story

As an operator, I want valid lifecycle decisions to apply atomically through one command, so that card state, actionable work, audits, and search eligibility never diverge.

## Acceptance Criteria

1. Every Worker, API operator, source-removal, and sampling-containment lifecycle mutation calls `transitionKnowledgeCard` with trigger, actor, expected fences, and transaction; it locks required rows and returns `resolved`, `stale`, or `invalid`. No production direct writer remains.
2. A low-risk candidate with eligible support activates the card with `verification_requirement = none` and atomically records audit/index effects.
3. Verify-first, conflict, or new suppressed-card evidence yields `pending_operator` plus exactly one same-fence primary recommendation of the appropriate type.
4. Publish, suppress, edit/requeue, archive, and restore follow the transition matrix; stale/superseded work changes no card, evidence, audit, dirty marker, or projection.

## Tasks / Subtasks

- [ ] Define narrow lifecycle input/output types and a domain port; implement `transitionKnowledgeCard` in `packages/database` transactionally. (AC: 1)
- [ ] Require named trigger, `AuditActor`, expected card/evidence fence, and candidate/recommendation fence where relevant. Acquire existing advisory and row locks in established order. (AC: 1, 4)
- [ ] Implement matrix validation, typed stale/invalid outcomes, and atomic card/work/candidate/audit/index updates. (AC: 1-4)
- [ ] Migrate current direct writers one path at a time: recommendation resolution, draft review, ingestion completion, source removal, and sampling escalation. Delete a direct writer only after replacement tests pass. (AC: 1)
- [ ] Add static enforcement/regression tests proving lifecycle, verification, and recommendation state are not updated outside this boundary. (AC: 1)
- [ ] Test low-risk activation, verify-first, conflicts, operator paths, stale fences, supersession, and rollback atomicity. (AC: 2-4)

## Dev Notes

- This is the Epic's mandatory writer boundary. Do not create a convenience helper while retaining independent writers in `knowledge-recommendations`, ingestion, source removal, or admin intake.
- The command owns lifecycle state, verification requirement, primary/sampling recommendation state, candidate-card association, lifecycle audit, and lifecycle-caused index invalidation. Draft wording edits remain separate but must delegate lifecycle/work effects here.
- Preserve existing lock ordering, source-removal/provenance fences, Worker lease/CAS rules, and sampling cohort locks. A stale outcome must have zero partial side effects.
- Use Audit-owned typed writers; feature modules must not directly insert audit rows.

### Project Structure Notes

- New/primary boundary: `packages/domain/src/knowledge-lifecycle.ts` and `packages/database/src/knowledge-lifecycle.ts`.
- Migrate callers from `packages/database/src/knowledge-recommendations.ts`, `knowledge-draft-review.ts`, `admin-knowledge-intake.ts`, Worker ingestion/recommendation/source-removal features, and indexing queue support.

### Verification

```bash
pnpm test:integration -- tests/knowledge-recommendation-queue.test.ts
pnpm test:integration -- tests/knowledge-ingestion-pipeline.test.ts
pnpm test:integration -- tests/knowledge-source-removal.test.ts
pnpm typecheck
rg 'update\(knowledgeCards\)|update\(knowledgeRecommendations\)' packages apps
```

### References

- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Transition Ownership]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Transition Matrix]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-7]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- _bmad-output/implementation-artifacts/15-3-centralize-version-fenced-lifecycle-transitions.md
