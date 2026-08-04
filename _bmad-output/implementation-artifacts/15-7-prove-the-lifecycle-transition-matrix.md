# Story 15.7: Prove the Lifecycle Transition Matrix

Status: ready-for-dev

## Story

As a product owner, I want executable evidence that the lifecycle contract rejects invalid states and races, so that the clean-break migration remains safe as the pipeline evolves.

## Acceptance Criteria

1. Unit and serial integration suites cover every allowed/forbidden matrix transition; card/work cardinality, candidate immutability, technical completion, active-evidence eligibility, and target-only fixture validity.
2. Stale, concurrent, duplicate, superseded, source-withdrawal, and sampling-containment tests prove only valid same-fence transitions persist and all card/evidence/audit/recommendation/index effects are atomic or absent together.
3. Protected API and direct-admin tests prove only authorized principals resolve work and API requests cannot execute Worker-only ingestion/job claims.
4. Focused suites, unit, integration, lint, typecheck, build, and Drizzle check run; exact environmental blockers are recorded if any cannot run.

## Tasks / Subtasks

- [ ] Create a transition-matrix suite that enumerates every trigger/from/to/work/projection case in the approved matrix, including forbidden transitions. (AC: 1)
- [ ] Add database constraint/trigger/partial-index tests and target-only reset/reseed fixture validation. (AC: 1)
- [ ] Add serial PostgreSQL tests for stale fences, concurrent resolution, duplicate delivery, supersession, final-evidence removal, source withdrawal retry, delayed indexing, sampling selection, and containment cohort isolation. (AC: 2)
- [ ] Add Nest direct API authorization/CSRF/capability/non-disclosure coverage plus Worker-only claim boundary tests. (AC: 3)
- [ ] Run and record the full required command sequence. (AC: 4)

## Dev Notes

- This is evidence for the complete Epic, not permission to recreate production behavior in tests. Prefer focused files such as `tests/knowledge-lifecycle-transition-matrix.test.ts` plus updates to existing ingestion, recommendation, source-removal, indexing, retrieval, admin, and Worker suites.
- Database integration tests are serial and must use `DATABASE_URL_TEST`; each suite needing clean tables calls `resetTestDatabase()` locally. Keep pure policy tests in the unit project and register them according to the existing Vitest configuration.
- Verify both atomic success and atomic rejection: a stale/invalid/superseded operation must leave card, evidence, work, audit, dirty marker, and search projection unchanged together.
- Test direct Nest/admin contracts, not BFF/Auth.js behavior. `apps/admin` remains direct browser API presentation; Worker remains the only continuous claim owner.

### Verification

```bash
pnpm test:unit
pnpm test:integration
pnpm lint
pnpm typecheck
pnpm build
pnpm exec drizzle-kit check
```

### References

- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Verification]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Transition Matrix]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.7]
- [Source: _bmad-output/project-context.md#Testing Rules]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

- _bmad-output/implementation-artifacts/15-7-prove-the-lifecycle-transition-matrix.md
