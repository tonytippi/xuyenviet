# Story 15.7: Prove the Lifecycle Transition Matrix

Status: backlog

## Story

As a product owner, I want executable evidence that the lifecycle contract rejects invalid states and races, so that the clean-break migration remains safe as the pipeline evolves.

## Acceptance Criteria

1. Unit and serial integration suites cover every allowed/forbidden matrix transition; card/work cardinality, candidate immutability, technical completion, active-evidence eligibility, and target-only fixture validity.
2. Stale, concurrent, duplicate, superseded, source-withdrawal, and sampling-containment tests prove only valid same-fence transitions persist and all card/evidence/audit/recommendation/index effects are atomic or absent together.
3. Protected API and direct-admin tests prove only authorized principals resolve work and API requests cannot execute Worker-only ingestion/job claims.
4. Focused suites, unit, integration, lint, typecheck, build, and Drizzle check run; exact environmental blockers are recorded if any cannot run.

## Tasks / Subtasks

- [ ] Do not start until Stories 15.1-15.6 have completed and all fixtures are target-only. (AC: 1-4)
- [ ] Create `tests/knowledge-lifecycle-transition-matrix.test.ts` with an explicit case ID, trigger, runtime, from/to state, work effect, evidence/projection effect, fence expectation, and test assertion for each approved transition: low-risk completion, verify-first completion, primary publish, primary suppress, edit/requeue, conflict/invalidating evidence, new evidence for suppressed card, final-support removal, archive, restore/re-evaluate, and sampling failure. Include every forbidden trigger/from/to pair. (AC: 1)
- [ ] Add database constraint/trigger/partial-index tests and target-only reset/reseed fixture validation. Explicitly reject active cards with primary work, pending cards missing required primary work, sampling outside active/same-fence cards, terminal cards with open work, changed completed candidate outcomes, and failed candidates with business outcomes. (AC: 1)
- [ ] Add serial PostgreSQL tests for stale fences, concurrent resolution, stale Worker lease/CAS, duplicate delivery, supersession, final-evidence removal, source withdrawal partial failure/retry, delayed indexing, sampling selection, and containment cohort isolation. For each rejection, assert card/evidence/work/audit/dirty-marker/projection are unchanged together. (AC: 2)
- [ ] Add Nest direct API authorization, missing/invalid CSRF, capability, strict-parser non-disclosure, and Worker-only claim-boundary coverage. Inventory routes to prove no API endpoint claims/runs ingestion or indexing; UI tests prove only direct browser API transport with `credentials: "include"` and API-managed CSRF, never replace server-side authorization tests. (AC: 3)
- [ ] Rewrite or remove legacy fixtures/assertions in ingestion, recommendation, source-removal, indexing, retrieval, and admin suites. A suite that writes legacy lifecycle columns/enums cannot count as target evidence. (AC: 1-3)
- [ ] Run and record the full required command sequence. (AC: 4)

## Dev Notes

- This story is blocked until the complete Epic behavior exists. It is evidence for that behavior, not permission to recreate production behavior in tests. Prefer focused files such as `tests/knowledge-lifecycle-transition-matrix.test.ts` plus updates to existing ingestion, recommendation, source-removal, indexing, retrieval, admin, and Worker suites.
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
