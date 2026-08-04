# Story 15.3: Centralize Version-Fenced Lifecycle Transitions

Status: backlog

## Story

As an operator, I want valid lifecycle decisions to apply atomically through one command, so that card state, actionable work, audits, and search eligibility never diverge.

## Acceptance Criteria

1. Every Worker, API operator, source-removal, and sampling-containment lifecycle mutation calls `transitionKnowledgeCard` with trigger, actor, expected fences, and transaction; it locks required rows and returns `resolved`, `stale`, or `invalid`. No production direct writer remains.
2. A low-risk candidate with eligible support activates the card with `verification_requirement = none` and atomically records audit/index effects.
3. Verify-first, conflict, or new suppressed-card evidence yields `pending_operator` plus exactly one same-fence primary recommendation of the appropriate type.
4. Publish, suppress, edit/requeue, archive, and restore follow the transition matrix; stale/superseded work changes no card, evidence, audit, dirty marker, or projection.

## Tasks / Subtasks

- [ ] Do not start until Story 15.1 has merged the target schema, reset/reseed evidence, and target-only fixtures. (AC: 1-4)
- [ ] Define narrow lifecycle input/output types and a domain port; implement `transitionKnowledgeCard` in `packages/database` transactionally. (AC: 1)
- [ ] Require named trigger, `AuditActor`, expected card/evidence fence, and candidate/recommendation fence where relevant. Acquire existing advisory and row locks in established order. (AC: 1, 4)
- [ ] Implement matrix validation, typed stale/invalid outcomes, and atomic card/work/candidate/audit/index updates. (AC: 1-4)
- [ ] Inventory and migrate every direct lifecycle/work writer one path at a time: `knowledge-recommendations`, `knowledge-draft-review`, `admin-knowledge-intake`, ingestion pipeline, Worker recommendations, Worker source removal, Facebook/YouTube capture, review approval, sampling escalation, and indexing queue support. Delete each writer only after its replacement test passes. (AC: 1)
- [ ] Allow only the transition boundary to write lifecycle state, verification requirement, recommendation status/resolution, candidate-card association, lifecycle audit, or lifecycle-caused index invalidation. Explicitly inventory any permitted non-lifecycle content/evidence writer. (AC: 1)
- [ ] Add static enforcement that detects target-column `insert`, `update`, aliases, and raw SQL outside a small documented boundary allowlist. The check must reject Worker and database direct writers, not merely one Drizzle call spelling. (AC: 1)
- [ ] Test low-risk activation, verify-first, conflicts, every operator path, stale fences, stale Worker lease/CAS, concurrent resolvers, supersession, and rollback atomicity. Assert stale/invalid operations leave card, evidence, work, audit, dirty marker, and projection unchanged together. (AC: 2-4)

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
pnpm test:integration -- tests/knowledge-lifecycle-transition-matrix.test.ts
rg 'lifecycle_state|verification_requirement|knowledge_recommendations' packages apps
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
