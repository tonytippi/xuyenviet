---
title: 'Story 23.2: Repair Coverage and Suggestion Review Findings'
type: 'bugfix'
created: '2026-08-17'
status: 'done'
review_loop_iteration: 0
baseline_commit: '88b756fd7ff9f60f5f90c14b7523294789b5b0cc'
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-23-context.md'
  - '_bmad-output/implementation-artifacts/spec-23-2-show-province-coverage-and-propose-vietnamese-queries.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Story 23.2's coverage parser accepts incomplete or duplicate province lists, and changing the selected province while a suggestion request is pending can leave the new selection disabled. The protected coverage route and interactive suggestion path lack regression tests.

**Approach:** Make the coverage response contract require the complete unique governed ID set, clear stale suggestion pending state on scope selection, align the model-catalog policy with the database policy, and add focused API and UI verification without expanding Discovery behavior.

## Boundaries & Constraints

**Always:** Keep the Story 23.2 aggregate-only, canonical-province boundary. Coverage must contain all 34 governed current units exactly once and retain its current official names/aliases from the existing producer. A stale response may never render for a newly selected province. Protected routes must fail closed. Existing scheduled-query-only behavior and no-run invariant remain intact.

**Ask First:** Moving or duplicating the official geography authority across packages. The user approved a minimal `happy-dom` test dependency for the province scope-switch interaction test.

**Never:** Add model calls, persistence, migrations, Discovery runs, candidates, capture work, Knowledge lifecycle writes, or any Story 23.3 immediate-run behavior. Do not relax contract validation merely to preserve partial coverage responses.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Coverage response | API port returns all 34 distinct governed canonical IDs | Controller returns validated coverage | N/A |
| Invalid coverage | Coverage omits or duplicates a governed ID | Parser rejects it and controller returns service unavailable | No partial list reaches UI |
| Scope switch | Suggestion for province A is pending and operator selects B | B can request its own suggestion immediately; A response is ignored | No stale suggestion or pending lock remains |
| Protected coverage route | Anonymous, traveler, query-bearing, or malformed port response | Authentication/capability or fail-closed response | Port is not called before rejected admission |

</frozen-after-approval>

## Code Map

- `packages/domain/src/admin-ai-model-catalog.ts` -- domain policy validation omits the new province-suggestion purpose while the database validation already requires extraction capabilities.
- `packages/contracts/src/youtube-discovery/index.ts` -- `parseAdminKnowledgeProvinceCoverageList` owns public coverage shape validation and `governedKnowledgeProvinceIds` provides the authoritative ID set at this boundary.
- `packages/database/src/admin-knowledge-coverage.ts` -- unchanged reference producer; already emits every official current unit and its aliases.
- `apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx` -- `ProvinceCoverage.choose` invalidates suggestion responses but must also reset the active pending state.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- `provinceCoverage` has the protected fail-closed route to exercise.
- `tests/story-23-2-province-coverage-contract.test.ts` -- focused parser and policy regression tests.
- `tests/admin-youtube-discovery-api.integration.test.ts` -- protected GET coverage admission and response tests.
- `tests/admin-youtube-discovery-mission-ui.test.ts` -- existing static UI/validation test boundary; use it for deterministic behavior possible without a new DOM harness.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/admin-ai-model-catalog.ts` and focused tests -- require text-input and extraction support when the new purpose is the default -- prevents an accepted but unusable model configuration.
- [x] `packages/contracts/src/youtube-discovery/index.ts` and `tests/story-23-2-province-coverage-contract.test.ts` -- reject incomplete or duplicate coverage IDs while accepting a complete governed set -- prevents partial coverage from crossing API/UI boundaries.
- [x] `apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx` and `tests/admin-youtube-discovery-mission-ui.test.ts` -- reset stale suggestion-pending state when selection changes and verify the request-version behavior through exported deterministic helpers if needed -- prevents scope-switch lockups without adding UI infrastructure.
- [x] `tests/admin-youtube-discovery-api.integration.test.ts` -- verify coverage route authorization, exact operator forwarding, query rejection, and invalid coverage fail-closed behavior -- protects the new API consumer boundary.
- [x] `package.json`, `pnpm-lock.yaml`, and `tests/admin-youtube-discovery-mission-ui.test.ts` -- add a file-scoped `happy-dom` harness and execute the province A-to-B scope-switch interaction -- proves the rendered control unlocks and stale output is ignored.

**Acceptance Criteria:**
- Given a default province-suggestion model lacks text input or extraction capability, when it is validated through the domain catalog, then it is rejected with the existing extraction-model policy error.
- Given coverage has fewer than 34 entries or repeats a canonical ID, when the contract parser receives it, then it returns `null`; a complete set of governed IDs remains valid.
- Given an operator selects province B while province A's suggestion request is pending, when the selection changes, then B's suggestion control is enabled and an eventual A response cannot alter B's suggestion state.
- Given the coverage endpoint is called, when the caller is unauthorized, sends query input, or the port output fails contract validation, then the endpoint rejects it before unsafe data reaches the Mission; a valid operator response is returned unchanged.

## Design Notes

The API already owns authorization and the database producer already owns official names and aliases. This repair deliberately enforces only the complete canonical ID set at the contracts boundary; validating every display name there would require moving the geography authority out of the database package, which is explicitly deferred for human approval.

## Verification

**Commands:**
- `pnpm test:unit -- tests/story-23-2-province-coverage-contract.test.ts tests/admin-youtube-discovery-mission-ui.test.ts` -- passed: 42 files and 369 tests; the file-scoped `happy-dom` interaction test passed.
- `pnpm test:integration -- tests/admin-youtube-discovery-api.integration.test.ts tests/story-23-2-province-coverage.integration.test.ts` -- blocked: the integration project ignored supplied file filters, ran its wider serial suite, and timed out after unrelated failures in `tests/youtube-discovery-mission.integration.test.ts` and `tests/admin-facebook-capture-rerun.test.ts` before these Story 23.2 files ran.
- `pnpm typecheck` -- passed across root, web, admin, worker-domain, API, and worker packages.
- `pnpm lint` -- passed with 0 errors; 61 pre-existing warnings remain outside this repair.
- `git diff --check` -- passed.

## Suggested Review Order

**Fail-Closed Boundaries**

- Require exactly the governed canonical coverage set before accepting a response.
  [`youtube-discovery/index.ts:88`](../../packages/contracts/src/youtube-discovery/index.ts#L88)

- Align province-suggestion model validation with the database catalog policy.
  [`admin-ai-model-catalog.ts:24`](../../packages/domain/src/admin-ai-model-catalog.ts#L24)

**Scope-Safe Interaction**

- Invalidate obsolete province work while immediately unlocking the new selected scope.
  [`mission.tsx:217`](../../apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx#L217)

- Guard query completion against a selection change while its request is pending.
  [`mission.tsx:249`](../../apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx#L249)

**Regression Evidence**

- Exercise authentication, invalid coverage, duplicate IDs, and adapter failures at the API boundary.
  [`admin-youtube-discovery-api.integration.test.ts:51`](../../tests/admin-youtube-discovery-api.integration.test.ts#L51)

- Reproduce a late province-A response after switching to province B in a DOM harness.
  [`admin-youtube-discovery-mission-ui.test.ts:34`](../../tests/admin-youtube-discovery-mission-ui.test.ts#L34)
