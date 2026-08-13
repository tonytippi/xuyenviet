# Story 21.12: Retire The Legacy Card-Count Trigger Behaviorally

Status: backlog

## Story

As a traveler, I want web verification to respond to missing or changing planning needs rather than arbitrary card count, so that one exact answer is not over-searched and irrelevant cards cannot hide a gap.

## Acceptance Criteria

**Given** legacy or shadow behavior still contains the historical fewer-than-three rule
**When** a broad query has one sufficient exact contribution or at least three irrelevant contributions
**Then** count behavior affects only the legacy authoritative path or comparison telemetry, while `v6_active` uses uncovered/freshness-sensitive requirements, conflict, or explicit current verification
**And** count alone neither triggers web work nor suppresses a required gap in the v6 path.

**Given** Story 4.5 compatibility behavior is implemented or referenced
**When** the target contract is applied
**Then** its fewer-than-three trigger is explicitly subordinate compatibility behavior with RTA-10/AD-38 ownership
**And** no active epic, runtime policy, test, config, schema default, or operator procedure treats it as permanent v6 product behavior.

**Given** Story 21.15 has activated `v6_active` from Story 21.14's passing Product Owner-approved evidence report
**When** Product approves behavioral retirement
**Then** the cutover record names the retired policy and current rollback mode while required-need coverage becomes the sole v6 authority
**And** `COMP-01`, `COMP-02`, and non-regression evidence remain attached to the recorded decision.

**Given** physical target-count cleanup is requested
**When** G3 evaluates rollback safety
**Then** cleanup remains blocked for Story 21.16 until the profile-owned rollback window, `COMP-06`, a passing cleanup report, Product approval, and a retained known-safe `v6_active` rollback target exist
**And** behavioral retirement preserves the still-runnable compatibility path until that later cleanup completes.

**Given** Story 21.12 behavioral retirement is ready for completion and all earlier stories in the authoritative sequence have completed
**When** focused unit tests, serial PostgreSQL integration tests, immutable fixture/evaluation checks, `pnpm lint`, `pnpm typecheck`, and `pnpm build` run
**Then** every RTA-1..RTA-13, PCR-01..PCR-10, FR-61..65, SC-8..12, AC-28..33, and PJ-01..06 mapping has executable evidence
**And** any environmental blocker is recorded exactly rather than weakening or skipping a gate.

## Tasks / Subtasks

- [ ] `packages/database/src/source-bundle.ts` — update the actual post-Story-21.6 retrieval-decision seam to branch on the persisted read policy and exact requirement outcomes. In the current pre-Epic-21 code the seam is `decideWebSearchFallback(...)` at line 286, not `buildRetrievalDecision`; reconcile the final symbol from Story 21.6's File List before editing. Preserve count behavior only for `legacy` authority or `v6_shadow` comparison telemetry (AC: 1-2).
- [ ] `packages/database/src/schema.ts`, `packages/database/src/provenance.ts`, `packages/database/src/answer-freshness.ts`, and `packages/database/src/retrieval-read-policy.ts` — make `v6_active` interpretation independent of `approvedKnowledgeTargetCount` and `insufficient_active_knowledge`, while retaining those fields/reasons as runnable legacy compatibility until Story 21.16. Record retired policy/target-count fields, exact Story 21.14 evidence window/report, current rollback mode, `COMP-01`-`COMP-05`, and Product retirement approval in the cutover/retirement record (AC: 1-3).
- [ ] `scripts/retrieval-qualification.ts`, `scripts/retrieval-read-policy.ts`, and `package.json` — persist Product Owner behavioral-retirement approval with `pnpm retrieval:qualification -- report-approve --report-id "$RETRIEVAL_REPORT_ID" --review-role product-owner --decision behavioral-retirement --actor-user-id "$PRODUCT_OWNER_ACTOR_USER_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`, then run `pnpm retrieval:read-policy -- record-retirement --environment "$RETRIEVAL_TARGET_IDENTITY" --expected-policy-id "$ACTIVE_V6_POLICY_ID" --retired-policy-id "$LEGACY_POLICY_ID" --report-id "$RETRIEVAL_REPORT_ID" --product-approval-id "$RETIREMENT_APPROVAL_ID" --rollback-policy-id "$LEGACY_POLICY_ID" --actor-user-id "$RETIREMENT_ACTOR_USER_ID" --confirm-target "$RETRIEVAL_TARGET_IDENTITY"`. Neither command removes schema/code/config or names removed behavior as a rollback target (AC: 2-4).
- [ ] `tests/retrieval-required-needs.test.ts`, `tests/retrieval-read-policy.integration.test.ts`, and `tests/ai-ask-stream-execution.test.ts` — add legacy, `v6_shadow`, and `v6_active` cases for one sufficient contribution, three irrelevant contributions, `COMP-01`-`COMP-05`, and `COMP-06`. Prove a cleanup request is rejected and compatibility remains runnable until Story 21.16 gates pass (AC: 1-4).
- [ ] `_bmad-output/implementation-artifacts/21-12-epic-21-closure-evidence.md` (NEW) — record executable test/fixture/report IDs for RTA-1..13, PCR-01..10, FR-61..65, SC-8..12, AC-28..33, and PJ-01..06; every mapping names its test or persisted evidence record and contains no prose-only “covered” assertion (AC: 5).
- [ ] Run `pnpm test:unit -- tests/retrieval-required-needs.test.ts tests/ai-ask-stream-execution.test.ts`, `pnpm test:integration -- tests/retrieval-read-policy.integration.test.ts`, `pnpm retrieval:qualification -- read --report-id "$RETRIEVAL_REPORT_ID" --environment "$RETRIEVAL_TARGET_IDENTITY"`, `pnpm lint`, `pnpm typecheck`, and `pnpm build`; record exact environmental blockers (AC: 1-5).

## Dev Notes

- Depends on Story 21.15's Product Owner-approved cutover. This story records behavioral retirement; it does not independently collect the shadow window or activate `v6_active`.
- AD-38/RTA-10: current `approvedKnowledgeTargetCount = 3` branch is a compatibility baseline, not v6 authority. Do not add environment flags or runtime-policy overrides.
- This story does not alter Story 4.5 independently. It consumes required-need behavior and the persisted read-policy authority from 21.6/21.11.
- Story 21.16 owns physical cleanup. This story completes after behavioral retirement and its Product approval while retaining runnable compatibility behavior.
- Before physical cleanup, emergency rollback can name retained legacy compatibility. After cleanup, only the retained qualified `v6_active` target is runnable.

### Block If

- Story 21.15 is not `done`, or its active PostgreSQL policy, exact passing report, runnable legacy rollback target, and cutover record cannot be verified.
- Product Owner behavioral-retirement approval against the exact report is absent. `bmad-dev-auto` must not impersonate the approver.
- The post-Story-21.6 decision seam or post-Story-21.11 read-policy/retirement record path differs from the paths above and cannot be reconciled from completed upstream File Lists.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-21.12]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-38]
- [Source: packages/database/src/source-bundle.ts]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/evaluation-and-release-gates.md#Gates]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#v6.2-Trip-Aware-Planning-Addendum]

## Canonical Acceptance-Criteria Mapping

`epics.md#Story-21.12` is normative. Guide AC 1-3 map to behavioral retirement. Guide AC 4 maps to current executable proof that physical cleanup remains blocked and compatibility remains runnable; Story 21.16 owns the later cleanup execution and is not a prerequisite for completing Story 21.12.

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created. Physical cleanup remains conditional on external release gates.

### File List
