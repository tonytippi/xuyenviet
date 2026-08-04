# Story 15.4: Enforce Evidence-Safe Retrieval and Source Removal

Status: ready-for-dev

## Story

As a traveler, I want only supported current knowledge used in answers, so that withdrawn or unsupported facts cannot remain available through stale projections.

## Acceptance Criteria

1. A card without validated-span, eligible source/capture, and required retrieval metadata cannot become or remain retrievable; retrieval fails closed despite an old search document.
2. Losing final eligible supporting evidence atomically disables projection and transitions through the matrix, with follow-up work only where target state permits it.
3. Retryable source removal locks dependent evidence/cards, immediately removes traveler eligibility, re-evaluates every card, and completes only when removed evidence is not traveler eligible.
4. Indexing stays idempotent by card/version and delayed indexing cannot re-enable prohibited content.

## Tasks / Subtasks

- [ ] Replace legacy-state eligibility in retrieval/search/approved-knowledge paths with target lifecycle plus derived evidence/source predicates. (AC: 1)
- [ ] Route evidence invalidation and final-support loss through `transitionKnowledgeCard`; disable active projections in the same transaction. (AC: 2)
- [ ] Consolidate source-removal implementations on the retryable Knowledge command and preserve locking, tombstoning, provenance withdrawal/backfill, and safe retention behavior. (AC: 3)
- [ ] Update indexing queue/worker to re-check target eligibility and maintain card/version idempotency. (AC: 4)
- [ ] Add stale-projection, evidence removal, source withdrawal, retry, and delayed-index regressions. (AC: 1-4)

## Dev Notes

- Depends on Stories 15.1 and 15.3. Do not make `active` alone sufficient for retrieval: current eligible supporting evidence, validated span, source/capture eligibility, traveler-safe metadata, and required retrieval metadata remain mandatory.
- Preserve trust/ranking policy. This story normalizes state ownership and safety; it must not alter thresholds or make operator-only/raw evidence available.
- Existing source removal also performs provenance safety and payload cleanup. Preserve those behaviors while eliminating duplicate lifecycle writes.
- Retrieval is defensive even after correct mutation: it must join projections to current owner rows and exclude missing, stale, disabled, non-active, failed-verification, or unsupported content.

### Project Structure Notes

- Likely paths: `packages/database/src/knowledge-state.ts`, `knowledge-search.ts`, `approved-knowledge.ts`, `knowledge-indexing-queue.ts`; Worker `indexing-worker.ts` and `source-removal.ts`.

### Verification

```bash
pnpm test:integration -- tests/knowledge-search.test.ts
pnpm test:integration -- tests/knowledge-source-removal.test.ts
pnpm test:integration -- tests/knowledge-source-removal-action.test.ts
pnpm test:integration -- tests/knowledge-indexing-worker.test.ts
```

### References

- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Cross-Table Guarantees]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Clean-Break Migration]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#Retrieval]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- _bmad-output/implementation-artifacts/15-4-enforce-evidence-safe-retrieval-and-source-removal.md
