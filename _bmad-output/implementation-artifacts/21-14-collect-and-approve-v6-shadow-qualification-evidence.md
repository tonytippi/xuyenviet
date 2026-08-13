# Story 21.14: Collect And Approve V6 Shadow Qualification Evidence

Status: backlog

## Story

As a product owner, I want a reviewed comparable shadow-evidence report, so that activation is based on one exact qualified window rather than local test success.

## Acceptance Criteria

**Given** Story 21.11 qualification infrastructure and all G0 prerequisites are complete
**When** a shadow evidence window is collected
**Then** one persisted report records its exact dependency tuple, cohorts, metric/threshold versions, failures, exclusions, deletion evidence, and qualified runnable rollback target/procedure
**And** a changed tuple member restarts the window rather than mixing incompatible observations.

**Given** the report has a passing complete evidence window
**When** Feedback/Eval and the Product Owner review it
**Then** their exact sign-off/decision is persisted against that report
**And** approval grants no direct cutover authority.

## Tasks / Subtasks

- [ ] `scripts/retrieval-qualification.ts`, `package.json`, and `packages/database/src/retrieval-qualification.ts` — run `pnpm retrieval:qualification -- collect --profile-id "$RETRIEVAL_PROFILE_ID" --read-policy-id "$RETRIEVAL_READ_POLICY_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"` against the Story 21.11-qualified `v6_shadow` cohort. The runner must resume only the same tuple, restart on any changed member, and persist run count/start/end timestamps, failures, exclusions, deletion evidence, and rollback procedure/target (AC: 1-2).
- [ ] `tests/retrieval-qualification.integration.test.ts` and `tests/retrieval-shadow.integration.test.ts` — add/execute report-integrity, tuple-restart, minimum-duration/run-count, deletion-membership, runnable-rollback-target, and no-shadow-side-effect cases. Run `pnpm test:integration -- tests/retrieval-qualification.integration.test.ts tests/retrieval-shadow.integration.test.ts` (AC: 1-2).
- [ ] `scripts/retrieval-qualification.ts` and `packages/database/src/retrieval-qualification.ts` — persist two attributable decisions against the exact passing report using `pnpm retrieval:qualification -- report-approve --report-id "$RETRIEVAL_REPORT_ID" --review-role feedback-eval --actor-user-id "$FEEDBACK_EVAL_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"` and then `pnpm retrieval:qualification -- report-approve --report-id "$RETRIEVAL_REPORT_ID" --review-role product-owner --actor-user-id "$PRODUCT_OWNER_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`. Validate each actor against the exact authority identity designated by the immutable gate profile/report; do not invent new application roles. Approval writes no read-policy transition (AC: 3-4).
- [ ] `_bmad-output/implementation-artifacts/21-14-collect-and-approve-v6-shadow-qualification-evidence.md` — record the exact profile/report/evidence-window IDs, tuple digest, rollback target/procedure, both approval record IDs, commands executed, and any external blocker under Completion Notes without copying traveler content (AC: 1-4).
- [ ] Run `pnpm test:unit -- tests/retrieval-qualification.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` after any runner/repository correction required by evidence collection (AC: 1-4).

## Dev Notes

- Depends on Story 21.11. This is an external evidence and approval gate, not a code-only completion.
- It cannot mutate the Retrieval read policy. Story 21.15 owns activation and rollback.

### Block If

- Story 21.11 is not `done`, G0/G1 is not passing, or the exact profile, read-policy, environment, corpus/fixture, and runnable rollback-target IDs are unavailable.
- The minimum run count or duration has not elapsed, any tuple member changes, any required cohort/gate fails, or deletion evidence is incomplete. Persist a failed/restarted report; do not shorten or merge the window.
- A current Feedback/Eval reviewer and Product Owner cannot be resolved and authorized from PostgreSQL. `bmad-dev-auto` must not impersonate either approver or fabricate their decision.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.14]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/fixtures.md#Compatibility-And-Cutover]
