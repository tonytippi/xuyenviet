# Story 15.2: Complete Candidate Processing and Technical Job Accounting

Status: ready-for-dev

## Story

As an operator, I want ingestion jobs to report technical progress and candidate outcomes accurately, so that mixed candidate outcomes do not misrepresent a source's processing state.

## Acceptance Criteria

1. Terminal completed candidates persist immutable non-null `apply`, `needs_operator`, or `discard` disposition and reason; failed candidates persist neither.
2. A job cannot become `completed` until discovery is terminal and every persisted candidate is `completed` or `failed`.
3. A valid Worker completion records only technical `completed` status and transactional idempotent `candidateCount`, `completedCandidateCount`, `failedCandidateCount`, and `needsOperatorCandidateCount` projections.
4. Retry, duplicate delivery, or newer-capture stale work cannot mutate candidate/job outcomes or active cards.

## Tasks / Subtasks

- [ ] Update ingestion job/pipeline/worker logic for target technical status and checkpoint semantics. (AC: 2-4)
- [ ] Make candidate completion persist the target immutable outcome; keep failed outcomes business-null. (AC: 1)
- [ ] Derive or transactionally update the four counters idempotently from persisted candidate state, never using counters for lifecycle or retrieval decisions. (AC: 3)
- [ ] Preserve existing `FOR UPDATE SKIP LOCKED`, lease, fencing-token, expected-version, and capture-supersession checks. (AC: 4)
- [ ] Prevent job completion when discovery or any candidate remains non-terminal. (AC: 2)
- [ ] Replace job stage/counter projections in Worker-facing database adapters; defer admin serialization/UI work to Story 15.6. (AC: 3)
- [ ] Add mixed-outcome, retry, duplicate, stale-lease, and newer-capture integration coverage. (AC: 1-4)

## Dev Notes

- Start only after Story 15.1 target schema/contracts are ready. Story 15.3 owns the central card lifecycle transition; do not retain direct card/recommendation writers merely to complete this story. Wire candidate completion through the transition boundary where it changes card/work state.
- A job answers only execution state: `queued -> running -> completed | failed`. Discovery/extraction/judgment/relation detail remains checkpoint data, not operator business status.
- Candidate disposition records the immutable AI outcome. Later human resolution changes recommendation/card state and audit history, never the candidate disposition/reason.
- Worker remains the only continuous job claimer/processor. API requests and `apps/admin` must not claim jobs or execute ingestion loops.

### Project Structure Notes

- Primary paths: `packages/worker-domain/src/features/knowledge/ingestion-jobs.ts`, `ingestion-pipeline.ts`, `ingestion-worker.ts`, and `source-captures.ts`.
- Preserve compilation-safe ownership: Worker adapters use shared domain/database packages; browser applications import neither database code nor Worker loops.

### Verification

```bash
pnpm test:integration -- tests/knowledge-ingestion-jobs.test.ts
pnpm test:integration -- tests/knowledge-ingestion-pipeline.test.ts
pnpm test:integration -- tests/worker-runtime.test.ts
pnpm test:integration
```

### References

- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Ingestion Jobs Technical Execution Only]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Ingestion Candidates Immutable AI Outcome]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.2]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- _bmad-output/implementation-artifacts/15-2-complete-candidate-processing-and-technical-job-accounting.md
