# Story 15.5: Separate Actionable Work from Quality Sampling

Status: backlog

## Story

As a knowledge operator, I want review work and quality-control obligations modeled separately, so that sampling measures quality without becoming an accidental publication gate.

## Acceptance Criteria

1. Every completed `needs_operator` candidate creates exactly one immutable sampling obligation that is not actionable work and does not block later publication.
2. Sampling selection creates one fenced `sampling` recommendation only for an active same-version card; it cannot coexist with prohibited primary work or modify candidate AI disposition.
3. High-severity sampling containment persists exact cohort definition/membership before lifecycle mutation; remediable cards become pending with one risk item and unsafe cards are suppressed/de-indexed without successor work.
4. Containment is atomic/version-fenced and leaves unrelated cohorts/card versions unchanged.

## Tasks / Subtasks

- [ ] Do not start until Story 15.1 target schema and Story 15.3 transition boundary are complete. (AC: 1-4)
- [ ] Replace recommendation-coupled verify-first sampling with an immutable `knowledge_sampling_obligations` ledger. Create exactly one row per `needs_operator` candidate ID and completion fence under a database unique constraint; it must never create sampling recommendation work or block publication. (AC: 1)
- [ ] Replace legacy recommendation status/action/reason semantics with target work types, statuses, and resolutions. Do not retain `in_review`. (AC: 1-2)
- [ ] Update selection and resolution flows to use `transitionKnowledgeCard` for every lifecycle/work mutation. (AC: 2-4)
- [ ] Define remediable versus unsafe containment inputs. Persist the policy definition/digest and exact cohort card/version membership before any containment transition. (AC: 3)
- [ ] Resolve the triggering sampling item through `transitionKnowledgeCard`; for remediable cards supersede same-fence sampling work and atomically open exactly one risk item on `pending_operator`; for unsafe cards suppress/de-index without successor work. Do not alter completed candidate disposition/reason. (AC: 2-4)
- [ ] Add cardinality, obligation immutability/unique-key, containment ordering, remediable/unsafe, stale/concurrent containment, candidate immutability, and cohort-isolation tests. Assert card/evidence/work/audit/index effects commit or reject together. (AC: 1-4)

## Dev Notes

- This story is blocked until Stories 15.1 and 15.3 are complete. The current `requiredForSampling` recommendation coupling is explicitly prohibited.
- A sampling obligation is durable quality-control evidence, not an operator queue item and never a publication prerequisite. A recommendation is the only durable actionable operator work.
- At one card content/evidence fence, allow at most one open primary work item and one open sampling item. `active` may have sampling only; `pending_operator` may have one primary item; suppressed/archived/rejected retain no open work.
- Sampling and human resolution must never rewrite the candidate's completed AI disposition or reason.

### Project Structure Notes

- Start from `packages/database/src/knowledge-recommendations.ts`, `admin-quality.ts`, `admin-knowledge-coverage.ts`, target schema/contracts, and Worker candidate completion.

### Verification

```bash
pnpm test:integration -- tests/knowledge-recommendation-queue.test.ts
pnpm test:integration -- tests/admin-knowledge-coverage.test.ts
pnpm test:integration -- tests/public-mvp-quality-dashboard.test.ts
```

### References

- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Sampling]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Recommendations The Actionable Operator Work Queue]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.5]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- _bmad-output/implementation-artifacts/15-5-separate-actionable-work-from-quality-sampling.md
