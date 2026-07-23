---
baseline_commit: 404fd804088b23368517eb6ccc84ee5d90e7fd44
---

# Story 4.7: Verify AI-First Retrieval and Answer Safety

Status: review

## Story

As a product owner,
I want automated evidence that retrieval and answers honor AI-first policy,
so that publication automation does not introduce silent traveler-safety regressions.

## Acceptance Criteria

1. Given fixtures cover active, suppressed, archived, superseded, uncertain, conflicted, verification-required, source-withdrawn, source-missing, stale-index, and operator-only cases, when retrieval and source-bundle tests run, only policy-eligible candidates enter traveler bundles with correct policy; stale projections, raw material, and unsafe evidence cannot bypass owner-row checks.
2. Given evaluation prompts exercise observation, pattern, conditional, high-risk, conflict, and web-search-failure cases, when answer-policy checks run, required caveats are present, conflicted claims never become itinerary premises, and low-confidence search produces verification guidance rather than invented facts.
3. Given migrated indexing and worker processes run under retries and concurrent claims, when stale/outdated work is simulated, a prior card version cannot become active after later suppression/removal and safe implementation-visible failure reasons are retained without raw/operator-only disclosure.

## Tasks / Subtasks

- [x] Build a consolidated policy fixture matrix and retrieval/source-bundle assertions (AC: 1)
  - [x] Reuse existing Knowledge fixture builders and state/source-removal suites; do not create a fake in-memory eligibility path.
  - [x] Assert exact `contextual_use`, `caveat_only`, and `exclude` outcomes and raw/privacy absence in search, bundle, snapshots, and traveler DTOs.
- [x] Add answer and web-fallback contract tests (AC: 2)
  - [x] Exercise server prompt/bundle instructions and deterministic warning guards for community, pattern, conditions, required verification, conflict, failure, and low-confidence web outcomes.
  - [x] Assert persisted retrieval decision/provenance includes the selected state-policy snapshot and stable web identifiers.
- [x] Verify versioned worker concurrency and operational safety (AC: 3)
  - [x] Simulate claimed stale/outdated dirty work after source withdrawal, suppression, and a newer card version.
  - [x] Assert it cannot reactivate a projection and that retry/failure records remain safe and bounded.
  - [x] Document the required DB-backed test sequencing where focused suites share migration/reset state.
- [x] Run the focused Epic 4 regression set and baseline checks (AC: 1-3)
  - [x] Run relevant sequential DB-backed tests, then `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
  - [x] Record exact commands and blockers in the completion notes if environment services prevent verification.

## Dev Notes

- This is a verification story, not a product-policy rewrite. Test the contracts established by Stories 4.1-4.6; fix defects in their owning modules rather than adding a test-only bypass.
- Existing high-value suites are `knowledge-search`, `knowledge-source-removal`, `knowledge-ingestion-pipeline`, `answer-context`, `web-search-adapter`, `ai-ask-shell`, and usage/evaluation suites. Extend them where ownership fits; add a dedicated state-aware policy/worker suite only for genuinely new coverage.
- Do not run shared DB-backed focused suites in unsafe parallel. Use explicit `DATABASE_URL_TEST`, do not use routine destructive resets, and ensure migration fixtures are isolated.
- Tests must prove safety against timing: projection search can return a stale candidate, but current card/evidence/source evaluation must still reject it before prompt inclusion.

### Project Structure Notes

- Tests remain in `tests/`; production changes belong to the owning Knowledge, Retrieval, AI, Search, and Usage modules discovered by a failed assertion.
- Preserve no-raw-data logging and server-only boundaries in test helpers as well as production paths.
- Update any operational test-sequencing documentation only if it is the canonical project location; do not introduce an alternate testing command system.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.7]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 4]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-16, AD-17, AD-26]
- [Source: tests/knowledge-search.test.ts]
- [Source: tests/answer-context.test.ts]
- [Source: tests/knowledge-source-removal.test.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Final Epic 4 safety gate. Fixtures should be established alongside earlier stories and consolidated here after contracts settle.
- `pnpm test:run -- tests/knowledge-search.test.ts tests/answer-context.test.ts` (all 49 test files / 705 tests passed; Vitest uses one worker and shared DB reset sequencing).
- `pnpm lint` (passed with three pre-existing unused-variable warnings in `tests/knowledge-search.test.ts`), `pnpm typecheck` (passed), `pnpm build` (passed).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Added a consolidated state/source eligibility matrix covering contextual, caveat-only, and excluded active/archive/conflict/supersession cases without raw material leakage.
- Persisted selected card state-policy snapshots in retrieval decisions and strengthened stable persisted web identifier/provenance assertions.
- Added claimed stale-version/source-withdrawal and safe bounded retry-record regressions. Documented serial `DATABASE_URL_TEST` execution in the canonical README testing guidance.
- Verification completed with no blockers. `pnpm lint` has only the three existing unused-variable warnings listed above.

### File List

- README.md
- src/features/retrieval/source-bundle.ts
- tests/answer-context.test.ts
- tests/knowledge-search.test.ts
- _bmad-output/implementation-artifacts/4-7-verify-ai-first-retrieval-and-answer-safety.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-07-24: Added AI-first retrieval, answer-policy, provenance, and versioned worker safety regression coverage; documented serial DB-backed test sequencing and moved the story to review.
