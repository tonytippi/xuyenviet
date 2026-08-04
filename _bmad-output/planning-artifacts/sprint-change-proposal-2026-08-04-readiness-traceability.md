---
title: Readiness Traceability and Direct API Documentation Reconciliation
date: 2026-08-04
project: xuyenviet
status: approved
mode: batch
change_scope: moderate
source:
  - implementation-readiness-report-2026-08-04.md
  - epics.md
  - implementation-artifacts/sprint-status.yaml
  - implementation-artifacts/spec-14-4-complete-admin-direct-api-ownership.md
  - implementation-artifacts/spec-13-2-migrate-operator-capabilities-and-retire-legacy-admin-ownership.md
  - implementation-artifacts/spec-admin-ai-gateway-management.md
  - sprint-change-proposal-2026-08-03-direct-api-session-auth.md
---

# Sprint Change Proposal: Readiness Traceability and Direct API Documentation Reconciliation

## 1. Issue Summary

The 2026-08-04 implementation-readiness assessment correctly read the authoritative PRD, architecture, UX, and `epics.md`, but it did not account for implementation artifacts completed after the detailed Epic 14 headings were originally written. It consequently reported five direct-API stories as unready and three PRD requirements as unplanned.

Current implementation evidence changes that conclusion:

- `sprint-status.yaml` records Epic 14 Stories 14.1 through 14.6 as done.
- `spec-14-4-complete-admin-direct-api-ownership.md` documents direct Nest API and `apps/admin` delivery of the exact-admin roster, role governance, AI Gateway model catalog, and remaining admin ownership cutover.
- `spec-13-2-migrate-operator-capabilities-and-retire-legacy-admin-ownership.md` documents the roster's stable pagination, safe usage aggregates, exact-admin authorization, final-admin protection, audit, and cutover behavior.
- `spec-admin-ai-gateway-management.md` documents model creation/update/default/archive and exact-micros pricing behavior.
- `sprint-change-proposal-2026-08-03-direct-api-session-auth.md` and the approved Story 14.2 correction define the accepted direct API replacement for the prior BFF/Auth.js transport.

The problem is therefore documentation currency and requirements traceability, not missing product scope or an implementation gap. Leaving the readiness findings unreconciled would incorrectly block the next planning cycle and could cause duplicate stories to be created for completed behavior.

## 2. Impact Analysis

### Checklist Results

| Item | Status | Finding |
| --- | --- | --- |
| 1.1 Trigger | Done | `bmad-check-implementation-readiness` reported missing Epic 14 ACs and FR-45B, FR-45C, and FR-49A coverage. |
| 1.2 Core problem | Done | Requirements and completed implementation evidence are not fully reflected in the active epic traceability document. |
| 1.3 Evidence | Done | Sprint status, completed Story 13.2/14.4 specs, completed model-management spec, and current package/API contracts demonstrate the reported gaps are implemented. |
| 2.1 Epic 14 impact | Done | Epic 14 remains valid and completed; its detailed story headings need their approved, completed acceptance contracts restored or referenced. |
| 2.2 Epic-level changes | Done | No new epic is required. Update Epic 3, Epic 4, and Epic 14 coverage and status documentation. |
| 2.3 Remaining epic impact | Done | Epics 9-13 remain historical BFF/Auth.js evidence only, as already noted by the 2026-08-03 approved course correction and sprint status. |
| 2.4 Obsolescence/new work | Done | No implementation story is obsolete or newly required. Do not create duplicate FR-45B/45C/49A stories. |
| 2.5 Ordering | Done | No resequencing. Preserve completed stories and retain the public-launch external-evidence gate as the remaining launch concern. |
| 3.1 PRD conflict | Done | No PRD change. FR-45B, FR-45C, and FR-49A remain valid and are already implemented. |
| 3.2 Architecture conflict | Done | No architecture change. Direct API/session ownership is already authoritative and implemented. |
| 3.3 UX conflict | N/A | The active `EXPERIENCE.md` has no readiness-report source reference; no UX artifact update is required. |
| 3.4 Secondary artifacts | Action-needed | Reconcile the readiness report and `epics.md`; do not change code, deployment, or sprint statuses. |
| 4.1 Direct adjustment | Viable | Low effort, low risk. Documentation-only corrections restore traceability. |
| 4.2 Rollback | Not viable | No implementation rollback is justified; the implemented direct-API boundary is the approved target. |
| 4.3 MVP review | Not viable | MVP scope and goals remain unchanged. |
| 4.4 Selected path | Done | Direct documentation reconciliation. |

### Artifact Impact

| Artifact | Impact | Required action |
| --- | --- | --- |
| `epics.md` | Missing inventory/map entries and incomplete detailed Epic 14 story definitions make completed work appear unplanned. | Add explicit FR traceability; restore approved AC summaries and completed/historical boundaries. |
| `implementation-readiness-report-2026-08-04.md` | Its `NOT READY` conclusion relies on stale/incomplete planning evidence. | Add a dated reconciliation addendum that supersedes only the invalid findings and states the remaining launch-evidence constraint. |
| `ux-designs/.../EXPERIENCE.md` | No active readiness-report source reference exists. | No change required. |
| PRD and architecture | No conflict with actual implementation. | Do not edit. |
| `sprint-status.yaml` | Already records correct Epic 14 completion and the historical status of BFF/Auth.js decisions. | Do not edit. |

## 3. Recommended Approach

**Selected approach: Direct Adjustment.**

Update only documentation needed to make the current plan truthful and traceable. Do not add new stories, revise completed code, reopen completed epics, or alter sprint statuses.

This is a **moderate** documentation/backlog-reconciliation change because it modifies the source-of-truth epic traceability artifact and readiness conclusion, but carries **low implementation risk**. It prevents duplicate scope while preserving the single approved architecture: NestJS-owned direct browser API sessions, presentation-only browser clients, and no Auth.js/BFF runtime ownership.

The public launch remains blocked until the external evidence recorded in Story 14.6 is complete. That is a launch-evidence gate, not an unimplemented Epic 14 development story.

## 4. Detailed Change Proposals

### 4.1 `epics.md`: Requirements Inventory and FR Coverage Map

**Section:** Functional Requirements inventory and `FR Coverage Map`

**OLD:** FR-23C, FR-28A, FR-45B, FR-45C, and FR-49A are absent from the inventory/map. The readiness report identifies FR-45B, FR-45C, and FR-49A as unplanned.

**NEW:** Add explicit entries and mappings:

| Requirement | Epic/story evidence |
| --- | --- |
| FR-23C | Epic 15, Story 15.2 for technical ingestion job state/counters; Epic 14, Story 14.4 for safe direct admin capture queue projections, canonical status, filters, counts, and ordering. |
| FR-28A | Epic 3, Story 3.11 for aggregate-only evidence-grounded seed coverage; Epic 14, Story 14.4 for direct admin safe projection. |
| FR-45B | Epic 14, Story 14.4, with completed roster/role governance evidence from the historical Epic 13 Story 13.2 migration. |
| FR-45C | Epic 14, Story 14.4, with completed exact-admin paginated roster aggregates from historical Epic 13 Story 13.2. |
| FR-49A | Epic 14, Story 14.4, with completed direct model-catalog management and prior model-management feature evidence. |

**Rationale:** This reflects the implemented target ownership. Epic 13's BFF transport is historical evidence only; no BFF story becomes a future implementation path.

### 4.2 `epics.md`: Epic 3 and Epic 4 Coverage Lists

**Section:** Epic 3 and Epic 4 `FRs covered`

**OLD:** Epic 3 omits FR-28A; its detail does not reference FR-23C. Epic 4 omits the direct model-catalog completion path now owned by Epic 14.

**NEW:**

- Add FR-28A to Epic 3 and state that seed coverage is aggregate-only and excludes raw capture/evidence/provider data.
- Add a note under Epic 3 that FR-23C's technical ingestion semantics are finalized by Epic 15 and its admin surface is migrated by Epic 14 Story 14.4.
- Retain Epic 4 as the owner of model selection and cost estimation (FR-49/FR-50), while explicitly identifying Epic 14 Story 14.4 as the direct exact-admin model-catalog management path for FR-49A.

**Rationale:** Preserves capability ownership without falsely moving model selection/cost estimation out of AI Orchestration.

### 4.3 `epics.md`: Historical BFF/Auth.js Boundary

**Section:** Epics 9 through 13 and Epic 14 historical boundary

**OLD:** The only direct statement that Epics 9-13 are historical appears in Epic 14; the individual epics can be read as still-active BFF implementation plans.

**NEW:** Add a concise status notice before the detailed Epic 9 section:

```markdown
### Historical Transport Boundary

Epics 9 through 13 are completed historical evidence for API, Worker, and admin capability extraction. Their BFF/Auth.js browser transport requirements were superseded by the approved 2026-08-03 direct API/session course correction. They are not selectable for new implementation. Epic 14 is the authoritative completed direct-browser transport cutover; Story 14.6 remains the external public-launch evidence gate.
```

**Rationale:** Prevents a future story-preparation workflow from selecting superseded BFF work.

### 4.4 `epics.md`: Restore Detailed Epic 14 Acceptance Summaries

**Section:** Stories 14.2 through 14.6

**OLD:** These headings contain only title and role/value text. They lack acceptance criteria even though sprint status and implementation specs record completion.

**NEW:** Add concise, authoritative acceptance summaries derived from the approved Story 14.2 course correction and completed Story 14.4/14.5/14.6 specs:

- **14.2:** All traveler shell reads and commands, including AI Ask stream, conversation/trip creation/deletion, feedback, proposal terminal actions, annotation actions, and referral first touch use direct Nest browser-session APIs. Root traveler Auth.js/server-action writers are removed, direct shell client behavior is safe, and local same-origin forwarding contains no auth/domain behavior.
- **14.3:** Remaining traveler aggregate commands, context extraction, proposal persistence/expiry, and referral-cookie behavior have one Nest/package owner; root direct-DB/Auth.js writers are removed; worker paths retain correct package ownership.
- **14.4:** `apps/admin` uses direct Nest browser-session APIs for all admin capabilities. Exact-admin roster/role governance, safe usage aggregates, and model-catalog mutation are server-authorized, audited, and safely projected. Root admin/BFF owners are retired, and no direct DB/domain mutation imports remain in the app.
- **14.5:** Auth.js, BFF runtime, bearer admission, root admin, legacy server-action writers, and root direct database readiness are removed. Browser admission is Nest session/Origin/CSRF-only; historical session rows remain non-live historical data.
- **14.6:** A fail-closed launch-evidence runbook covers ingress topology, OAuth/session/CSRF/origin smoke, migration ordering, selected writer, rollback, API/Worker readiness, monitoring, backup/restore, and AI-stream concurrency. Public launch remains no-go until external staging/production evidence is supplied.

**Rationale:** Makes the source-of-truth epic plan suitable for a future readiness check without duplicating implementation-spec detail.

### 4.5 `implementation-readiness-report-2026-08-04.md`: Reconciliation Addendum

**Section:** New dated addendum after `Summary and Recommendations`

**OLD:** The report concludes `NOT READY` based on the apparent absence of Epic 14 ACs and three implementation paths.

**NEW:** Add an evidence-backed addendum stating:

- The report was reconciled against `sprint-status.yaml` and completed implementation specs.
- FR-45B, FR-45C, and FR-49A are implemented through completed Epic 14.4 and documented historical evidence; no new stories are required.
- Epic 14.2 through 14.6 are implemented and their detailed ACs will be restored in `epics.md`.
- Epics 9-13 are historical BFF/Auth.js evidence and not selectable for new development.
- The planning readiness status becomes **READY FOR NEXT STORY PLANNING**, while **PUBLIC LAUNCH REMAINS NO-GO** pending Story 14.6 external evidence and existing provider/Tavily action items.

**Rationale:** Preserves the original review's useful discovery history while preventing it from becoming an incorrect active gate.

### 4.6 UX Source Currency

**Result:** No change required. The current `EXPERIENCE.md` frontmatter does not reference a readiness report, so the initially identified stale source link is not present in the active artifact.

## 5. Implementation Handoff

**Scope classification: Moderate.** This is a source-of-truth planning-artifact correction, not application development.

| Recipient | Responsibility |
| --- | --- |
| Product Owner / Developer | Apply the approved `epics.md` and readiness-report edits exactly as specified. |
| Solution Architect | Verify restored Epic 14 summaries preserve direct API ownership and do not reintroduce BFF/Auth.js requirements. |
| Product Manager | Confirm no product scope change and retain public-launch evidence as an explicit release gate. |
| Developer | Do not create duplicate implementation stories; use the reconciled epic plan for subsequent story selection. |

### Success Criteria

1. Every current PRD FR, including FR-23C, FR-28A, FR-45B, FR-45C, and FR-49A, has an explicit map to current or historical-completed implementation.
2. `epics.md` makes the direct Nest browser API the only selectable transport direction.
3. Epic 14's detailed plan contains enough acceptance detail for a readiness reviewer to validate the completed cutover without consulting code.
4. The readiness report distinguishes story-planning readiness from the outstanding public-launch external-evidence gate.
5. No code, schema, deployment configuration, PRD requirement, architecture invariant, or sprint status is changed.

## 6. Approval Request

Approve this proposal to apply the documentation reconciliation exactly as described. After approval, the handoff is to the Product Owner / Developer for artifact edits, followed by a re-run of `bmad-check-implementation-readiness`.

## 7. Approval and Handoff

- 2026-08-04: Tony approved this proposal in batch mode.
- Applied artifacts: `epics.md` and `implementation-readiness-report-2026-08-04.md`.
- No UX edit was required because the cited stale readiness-report source was not present in the active UX artifact.
- No code, schema, deployment configuration, PRD requirement, architecture invariant, or `sprint-status.yaml` entry was changed.
- Handoff: use the reconciled plan for the next `bmad-create-story` workflow; retain Story 14.6 external evidence and provider/Tavily action items as public-launch gates.
