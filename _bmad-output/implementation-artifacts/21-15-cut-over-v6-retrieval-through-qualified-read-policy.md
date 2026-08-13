# Story 21.15: Cut Over V6 Retrieval Through Qualified Read Policy

Status: backlog

## Story

As a product owner, I want required-need retrieval activated only through a qualified read-policy decision, so that a failed gate or incident can safely retain or restore a known-safe authority.

## Acceptance Criteria

**Given** Story 21.14 provides a passing Product Owner-approved report with a runnable qualified rollback target
**When** `activateRetrievalReadPolicy(...)` performs its Retrieval-owned compare-and-swap cutover
**Then** `v6_active` becomes authoritative and every production run pins the committed PostgreSQL policy
**And** deployment configuration cannot override the row.

**Given** a safety, quality, deletion, latency, call-rate, cost, or stale-projection gate fails after cutover
**When** an authorized rollback runs
**Then** the CAS uses the incident/failing evidence and a previously qualified runnable target without waiting for a new passing report
**And** no traveler output is selected by the shadow path.

## Tasks / Subtasks

- [ ] `packages/domain/src/retrieval-read-policy.ts`, `packages/database/src/retrieval-read-policy.ts`, and `scripts/retrieval-read-policy.ts` — validate the exact Story 21.14 report, both approval records, expected current policy, target `v6_active` policy, runnable qualified rollback target, actor authorization, and explicit target database identity before calling `activateRetrievalReadPolicy(...)`; deployment configuration remains seed/cache only (AC: 1-3).
- [ ] `tests/retrieval-read-policy.integration.test.ts` and `tests/retrieval-shadow.integration.test.ts` — cover stale CAS, incomplete/failed report, approval/report mismatch, non-runnable target, unauthorized actor, production-run policy pinning, incident/failing-report rollback, and no shadow traveler authority. Run `pnpm test:integration -- tests/retrieval-read-policy.integration.test.ts tests/retrieval-shadow.integration.test.ts` (AC: 1-4).
- [ ] `scripts/retrieval-read-policy.ts` and `package.json` — expose an inspect-only preflight and an explicit transition command. Run preflight first with `pnpm retrieval:read-policy -- inspect --environment "$RETRIEVAL_TARGET_IDENTITY"`; invoke cutover only with `pnpm retrieval:read-policy -- transition --reason cutover --environment "$RETRIEVAL_TARGET_IDENTITY" --expected-policy-id "$EXPECTED_POLICY_ID" --target-policy-id "$TARGET_POLICY_ID" --report-id "$RETRIEVAL_REPORT_ID" --product-approval-id "$PRODUCT_APPROVAL_ID" --rollback-policy-id "$ROLLBACK_POLICY_ID" --actor-user-id "$CUTOVER_ACTOR_USER_ID" --confirm-target "$RETRIEVAL_TARGET_IDENTITY"` (AC: 1-3).
- [ ] `packages/database/src/retrieval-read-policy.ts` and `_bmad-output/implementation-artifacts/21-15-cut-over-v6-retrieval-through-qualified-read-policy.md` — persist and record the exact cutover row/transition ID, report and approval IDs, previous/next policy IDs, rollback target, actor, target identity, and command result. Never store credentials or traveler content in the story (AC: 1-4).
- [ ] Run `pnpm test:unit -- tests/retrieval-qualification.test.ts`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` (AC: 1-4).

## Dev Notes

- Depends on Story 21.14. A failed or incomplete report blocks this story; no deployment configuration or feature flag can bypass the database policy.

### Block If

- Story 21.14 is not `done`, or its exact passing report, Feedback/Eval review, Product Owner approval, expected policy, target policy, and qualified runnable rollback target cannot be verified in the target database.
- The target environment/database identity or authorized actor is absent or ambiguous. A development agent may complete and test the command but must not silently perform a production transition.
- A cutover command is not explicitly authorized for the named target. HALT before mutation and record the preflight result; never infer production authority from story assignment.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.15]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-37-and-AD-38]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
