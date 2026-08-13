# Story 21.16: Physically Remove Expired Legacy Card-Count Compatibility

Status: backlog

## Story

As a product owner, I want legacy card-count compatibility removed only after rollback safety expires, so that cleanup cannot strand the product without a known-safe recovery path.

## Acceptance Criteria

**Given** Story 21.12 behavioral retirement is complete
**When** physical cleanup is requested
**Then** it waits for rollback-window expiry, `COMP-06`, a passing Feedback/Eval cleanup report, no unresolved rollback incident, Product Owner approval, and a changed qualified known-safe `v6_active` rollback target
**And** failure preserves runnable compatibility behavior.

**Given** all physical-cleanup gates pass
**When** Retrieval performs the approved CAS cleanup
**Then** a repository-wide executable-reference check finds no active legacy card-count branch, schema default, config, runtime policy, test, or operator procedure
**And** only the retained qualified v6 target remains runnable.

## Tasks / Subtasks

- [ ] `scripts/retrieval-qualification.ts`, `packages/database/src/retrieval-qualification.ts`, and `scripts/retrieval-read-policy.ts` — inspect the retained release records and fail closed unless Story 21.12 is done, `minimumLegacyRollbackWindowHours` has elapsed, `COMP-06` passes, the cleanup report passes, no rollback incident is unresolved, Product Owner approved that exact report, and a different qualified runnable `v6_active` rollback target is recorded (AC: 1).
- [ ] `scripts/retrieval-qualification.ts` and `packages/database/src/retrieval-qualification.ts` — collect the cleanup report with `pnpm retrieval:qualification -- collect --gate cleanup --profile-id "$RETRIEVAL_PROFILE_ID" --read-policy-id "$EXPECTED_POLICY_ID" --source-report-id "$RETRIEVAL_REPORT_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`; then persist the designated Feedback/Eval and Product Owner approvals with `pnpm retrieval:qualification -- report-approve --report-id "$CLEANUP_REPORT_ID" --review-role feedback-eval --actor-user-id "$FEEDBACK_EVAL_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"` and `pnpm retrieval:qualification -- report-approve --report-id "$CLEANUP_REPORT_ID" --review-role product-owner --actor-user-id "$PRODUCT_OWNER_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`. Approval does not perform cleanup (AC: 1).
- [ ] `tests/retrieval-read-policy.integration.test.ts` — prove every failed or stale G3 prerequisite writes no cleanup transition and leaves legacy compatibility runnable; prove the approved cleanup CAS rejects stale expected policy and changes the rollback target before compatibility removal (AC: 1-2).
- [ ] `scripts/retrieval-read-policy.ts` and `_bmad-output/implementation-artifacts/21-16-physically-remove-expired-legacy-card-count-compatibility.md` — run `pnpm retrieval:read-policy -- transition --reason cleanup --environment "$RETRIEVAL_TARGET_IDENTITY" --expected-policy-id "$EXPECTED_POLICY_ID" --target-policy-id "$CLEANUP_TARGET_POLICY_ID" --report-id "$CLEANUP_REPORT_ID" --product-approval-id "$CLEANUP_PRODUCT_APPROVAL_ID" --rollback-policy-id "$V6_ROLLBACK_POLICY_ID" --actor-user-id "$CLEANUP_ACTOR_USER_ID" --confirm-target "$RETRIEVAL_TARGET_IDENTITY"` before removing compatibility. Record the admission/transition ID, report/approval IDs, previous/next/rollback policy IDs, actor, target identity, and CAS result without credentials or traveler content. Do not edit code unless this CAS has first changed the runnable rollback target to the qualified v6 target (AC: 1-2).
- [ ] `packages/database/src/source-bundle.ts`, `packages/database/src/answer-freshness.ts`, `packages/database/src/provenance.ts`, `packages/database/src/schema.ts`, `tests/ai-ask-stream-execution.test.ts`, and `tests/retrieval-required-needs.test.ts` — after the approved CAS succeeds, remove active `approvedKnowledgeTargetCount`, fewer-than-three branching/telemetry, `insufficient_active_knowledge` compatibility interpretation, target-count prompt rendering, schema/default/check usage, and tests that treat count as runnable authority (AC: 2).
- [ ] `drizzle/migrations/` and `drizzle/migrations/meta/_journal.json` — generate the next forward migration for active target-count schema/config cleanup. Preserve immutable historical SQL/snapshots for audit; never rewrite `drizzle/migrations/0000_baseline.sql` or prior `drizzle/migrations/meta/*_snapshot.json` files (AC: 2).
- [ ] Run the executable-source check `rg -n 'approvedKnowledgeTargetCount|approved_knowledge_target_count|insufficient_active_knowledge|knowledge\.length\s*<\s*3|approvedKnowledgeTargetCount\s*=\s*3' packages apps scripts tests package.json` and the active operator-procedure check `rg -n 'fewer than three|fewer-than-three|card-count|target count|approvedKnowledgeTargetCount|insufficient_active_knowledge' docs/runbooks`. Both must return no active legacy authority. `_bmad-output/**`, `docs/roadmaps/**`, planning/history documents, and immutable `drizzle/migrations/**` history are intentionally outside this executable check (AC: 2).
- [ ] `_bmad-output/implementation-artifacts/21-16-physically-remove-expired-legacy-card-count-compatibility.md` — append the forward migration name, deployment/verification revision, and both scoped reference-check outputs to Completion Notes, tied to the already persisted cleanup transition ID (AC: 1-2).
- [ ] Run `pnpm db:generate`, `pnpm test:unit -- tests/retrieval-required-needs.test.ts tests/ai-ask-stream-execution.test.ts`, `pnpm test:integration -- tests/retrieval-read-policy.integration.test.ts tests/drizzle-migration-plan.test.ts tests/schema-compatibility.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` (AC: 1-2).

## Dev Notes

- Depends on Story 21.12 and is intentionally time-gated. Do not start it merely because code and local tests pass.

### Block If

- Story 21.12 is not `done`, the rollback window has not expired, `COMP-06` or the cleanup report fails, any rollback incident remains unresolved, Product Owner approval is absent, or the changed qualified runnable `v6_active` rollback target is unavailable.
- The target environment/database identity or authorized cleanup actor is absent or ambiguous. A development agent must not silently mutate production.
- The scoped executable-reference checks find an active runtime/config/test/runbook reference. Historical migrations, snapshots, planning artifacts, and roadmaps may retain historical wording and must not be destructively rewritten.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.16]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-38]
