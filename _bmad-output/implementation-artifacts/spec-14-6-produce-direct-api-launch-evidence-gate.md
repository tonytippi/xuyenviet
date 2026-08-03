---
title: 'Produce the direct API launch evidence gate'
type: 'chore'
created: '2026-08-04'
status: 'done'
baseline_revision: '815ac1b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-14-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The direct API cutover has local and static evidence, but public-launch evidence is fragmented across code, tests, and runbooks. No artifact can distinguish verified repository foundations from required staging/production proof, so a launch could be incorrectly approved from completed-story counts.

**Approach:** Add a fail-closed direct-API launch-evidence gate that names every required proof, its accountable owner, safe evidence to retain, pass criteria, and blocking state. Keep repository verification automated where possible; leave platform execution explicitly blocked until it is actually performed.

## Boundaries & Constraints

**Always:** Preserve the direct Nest browser-session model, one writer per aggregate, forward-only migration policy, safe telemetry boundaries, and no-credential evidence handling. A gate item can be `passed` only with specific current-environment evidence; local/unit/integration evidence must be labeled repository-only. Record safe URLs, revisions, timestamps, command output locations, request IDs, and redacted results only.

**Block If:** The selected public topology, accountable release operator, actual environment, approved release matrix, deployed revision, or safe retained evidence is unavailable for a required platform gate. Leave the gate blocked; do not infer, substitute, or fabricate a pass.

**Never:** Do not add ingress infrastructure, secrets, production configuration, database reset/down migration, dual-write or legacy fallback. Do not record cookies, OAuth codes/tokens, CSRF proofs, credentials, database URLs, raw provider payloads, or unredacted request headers in the evidence artifact.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Repository verification | Current source and focused launch-gate tests | Gate records local foundations with exact commands and revisions | A failed local check keeps its gate blocked and names the safe failure reference |
| Staging/prod proof present | Approved target, deployed revision, redacted evidence, and accountable operator | Required gate is marked passed with timestamp and evidence reference | Missing any required fact leaves it blocked |
| Sensitive operational material | Cookies, tokens, database URLs, credentials, or raw request headers | Artifact stores only redacted outcome, correlation ID, and safe reference | Reject the material from the artifact and retain it only in the approved secret-safe system |
| Rollback or capacity drill | Compatible forward-only rollback target or controlled concurrent direct streams | Artifact records measured outcome and explicit go/no-go threshold | Do not claim launch readiness from component tests or an unexecuted drill |

</intent-contract>

## Code Map

- `docs/runbooks/direct-api-launch-evidence.md` -- canonical fail-closed launch-gate record and operator procedure for direct API deployment.
- `docs/runbooks/schema-release-matrix.md` -- approved migration matrix and selected-writer constraints that launch evidence must reference.
- `docs/runbooks/worker-operations.md` -- Worker readiness, drain, telemetry, and alert evidence requirements.
- `docs/release-matrices/README.md` -- admissible release-matrix artifact and owner-inventory requirements.
- `tests/direct-api-launch-evidence.test.ts` -- static contract coverage for mandatory gates, blocked default state, and secret-safe record rules.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Story 14.6 lifecycle and launch-gate blocking outcome.

## Tasks & Acceptance

**Execution:**
- [x] `docs/runbooks/direct-api-launch-evidence.md` -- added the canonical launch gate with one explicit entry each for ingress/topology, OAuth/session/origin/CSRF smoke, migration-before-traffic and selected writer, deployed legacy retirement, rollback drill, API/Worker readiness, monitoring/alerts, backup/restore, and AI-stream concurrency; unresolved platform evidence defaults to blocked.
- [x] `docs/runbooks/direct-api-launch-evidence.md` -- defined safe evidence fields, accountable roles, staging-before-production order, pass/block rules, and the final public-launch no-go rule.
- [x] `tests/direct-api-launch-evidence.test.ts` -- added static assertions for mandatory gate identifiers, blocked defaults, sensitive-evidence prohibitions, and repository-only status; added the file to the explicit unit-test allowlist in `vitest.config.ts`.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marked Story 14.6 in progress and recorded the exact external evidence categories that remain blocked after repository work.

**Acceptance Criteria:**
- Given the direct API release is being assessed, when an operator opens the launch-evidence runbook, then it can execute every required proof in staging and production with an accountable owner, safe retained evidence, explicit pass criteria, and a named no-go condition.
- Given only repository/static/local integration evidence is available, when the gate is evaluated, then it remains blocked for public launch and does not claim deployed ingress, OAuth, migration, rollback, monitoring, restore, Worker, or capacity proof.
- Given an operator supplies a launch-evidence update, when it includes secret-bearing material or lacks the environment, deployed revision, timestamp, owner, and safe evidence reference, then the relevant gate cannot be marked passed.
- Given all gate entries pass in production, when the final gate is evaluated, then it verifies the selected direct API owner, forward-only migration order, legacy retirement, operational recovery, and stream capacity evidence before declaring launch go.

## Design Notes

Use stable gate identifiers and a compact status table so an operator updates evidence without rewriting policy. The runbook is an execution record template, not infrastructure configuration or an approval substitute. Preserve the existing schema-release matrix and Worker runbooks as detailed sources rather than duplicating their technical controls.

## Review Triage Log

### 2026-08-04 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 3, medium 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Ordered migration and selected-writer verification before every dependent staging or production gate and blocked production until all staging gates pass.
  - `[high] [patch]` Required rollback evidence to switch to the matrix-selected legacy writer only, retain `dualWrite: false`, and prove the replaced writer accepts no commands.
  - `[high] [patch]` Required every staging and production gate to pass before public launch.
  - `[medium] [patch]` Expanded static coverage to require every safe record field, status/environment constraints, and a recorded safe outcome.

## Verification

**Commands:**
- `pnpm vitest run --project unit tests/direct-api-launch-evidence.test.ts` -- expected: the launch-gate contract is complete, fail-closed, and secret-safe without database configuration.
- `pnpm typecheck` -- expected: all workspaces continue to compile.
- `git diff --check` -- expected: no whitespace errors.

## Auto Run Result

### Summary

- Added a canonical, fail-closed direct API launch-evidence gate with nine required platform proofs.
- Kept every staging and production platform gate blocked until accountable operators execute and retain safe evidence; public launch remains no-go until all required gates pass.

### Files Changed

- `docs/runbooks/direct-api-launch-evidence.md` -- launch procedure, evidence-record rules, gate definitions, and no-go policy.
- `tests/direct-api-launch-evidence.test.ts` -- static contract coverage for the required fail-closed controls.
- `vitest.config.ts` -- registers the static launch-gate test in the unit project.
- `_bmad-output/implementation-artifacts/epic-14-context.md` -- regenerated current Epic 14 implementation context.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- records the Story 14.6 evidence state and external blockers.

### Review Outcome

- Patches applied: 4. Migration/selected-writer proof now precedes dependent traffic, production requires successful staging gates, rollback proves exactly one approved writer, and the static test enforces every safe evidence field.
- Deferred: 0.
- Rejected: 0.
- Follow-up review recommended: false. The repairs are localized documentation-order and static-contract assertions, and focused verification passed.

### Verification

- Passed: `pnpm vitest run --project unit tests/direct-api-launch-evidence.test.ts` (4 tests), `pnpm typecheck`, and `git diff --check`.

### Residual Risk

- Public-launch evidence remains unavailable: ingress/topology, OAuth/session/origin/CSRF smoke, approved migration and writer selection, deployed legacy retirement, rollback, API/Worker readiness, monitoring/alerts, backup/restore, and direct AI-stream capacity drills require accountable staging and production execution.
