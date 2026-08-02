---
title: API-First Runtime and Launch Readiness Course Correction
date: 2026-07-28
project: xuyenviet
status: approved
mode: incremental
change_scope: major
source:
  - implementation-readiness-report-2026-07-28.md
  - prds/prd-xuyenviet-2026-07-04/prd.md
  - architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md
  - epics.md
  - ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md
approved_edit_proposals:
  - complete-prd-traceability
  - capability-cutover-epics
  - api-cutover-ux-recovery
  - owned-launch-gates
---

# Sprint Change Proposal: API-First Runtime and Launch Readiness

## 1. Issue Summary

The implementation-readiness assessment on 2026-07-28 found that the approved API-first architecture and public-launch requirements are not fully represented in the implementation plan. The PRD includes FR-51 through FR-60 and NFR-12 through NFR-18, but `epics.md` explicitly maps only FR-1 through FR-50 and inventories only NFR-1 through NFR-11.

This is planning drift, not a defect in the completed product baseline. The architecture now requires a NestJS-owned versioned API and worker runtime, BFF-only browser access, a separately deployed admin application, protected-domain authorization, safe contracts, single-writer migration, API-owned AI Ask streaming, and legacy transport retirement. Existing Epics 8-11 describe parts of this work but are framed as technical milestones rather than end-to-end capability cutovers.

## 2. Impact Analysis

### Epic Impact

| Area | Impact | Required Change |
| --- | --- | --- |
| Epics 1-7 | Remain valid as completed baseline or user-outcome product work. | Preserve; do not roll back. |
| Epic 6 | Launch prerequisites mix implementation work, operational evidence, and unresolved decisions. | Classify each prerequisite into backlog story, launch-evidence gate, or decision/blocker. |
| Epic 8 | Actor/audit migration remains required but is architecture enablement rather than a standalone customer outcome. | Keep bounded stories; classify as prerequisite enablement with operational exit criteria. |
| Epics 9-11 | Technical foundation stories omit complete BFF/API capability delivery and leave FR-51 through FR-60 unowned. | Replace active planned form with capability-cutover epics; preserve existing technical ACs inside the new stories. |
| New Epics 12-14 | Required for worker runtime, separate admin app, and public-launch decommissioning/evidence. | Add to backlog after approval. |

### Artifact Impact

| Artifact | Change |
| --- | --- |
| PRD | No scope change. FR-51 through FR-60 and NFR-12 through NFR-18 remain authoritative. Open decisions become tracked gates rather than implicit assumptions. |
| Architecture | No design reversal. The architecture is the source for API/BFF, worker, migration, and cutover invariants. New stories must trace to AD-1, AD-4, AD-6, AD-14 through AD-16, AD-33 through AD-36. |
| Epics | Extend requirements inventory and traceability; replace technical-only migration framing with capability cutovers; add explicit operational launch gates. |
| UX | Clarify Next.js as presentation/BFF runtime and add recovery states for idempotent retry, stale finalization, durable consumers, and safe API errors. |
| Sprint status | Add approved epics/stories as `backlog`; preserve existing completed status and do not renumber completed work. |
| Deployment/test/runbooks | Create contract, integration, streaming-protocol, worker lifecycle, migration compatibility, load, restore, and operational evidence work products through their owning stories. |

### No-Rollback Decision

No completed feature work is reverted. Existing Next.js functionality is treated as the legacy baseline to migrate one capability at a time. A capability routes to either legacy transport or API transport before it accepts a write; shadow checks may compare safe reads but must never dual-write.

## 3. Recommended Approach

**Selected approach: Hybrid direct adjustment.**

Add and reorganize backlog work without reducing the approved MVP or rolling back completed behavior. Build vertical slices that prove a protected traveler/operator capability through BFF, API, domain policy, persistence, deployment, and retirement of the matching legacy writer.

| Option | Assessment |
| --- | --- |
| Direct adjustment | Viable; high effort and medium-high risk. Required to preserve approved API-first scope. |
| Rollback | Not viable. Existing baseline behavior remains valuable and provides migration reference/verification. |
| Reduce MVP scope | Not recommended. It would reverse approved PRD and architecture decisions rather than correct planning drift. |

### Sequencing

1. Establish private API contracts and one end-to-end protected capability.
2. Cut AI Ask to the API/BFF path while preserving protocol and atomicity.
3. Migrate explainable planning context and provenance-dependent read paths.
4. Establish worker/runtime, deployment, telemetry, and schema-compatibility operations.
5. Move operator workflows to the separately deployed admin application.
6. Retire legacy writers and validate launch evidence.

## 4. Detailed Change Proposals

### 4.1 Complete PRD Traceability in `epics.md`

**Current state:** Functional inventory ends at FR-50, NFR inventory ends at NFR-11, and FR coverage has no entries for FR-51 through FR-60.

**Approved update:**

- Add FR-51 through FR-60 and NFR-12 through NFR-18 with authoritative PRD wording.
- Extend the FR Coverage Map and add an NFR Coverage Map.
- Map FR-51, FR-54 through FR-56 to API contracts/protected capability stories; FR-52 to BFF boundary migration; FR-53 to separate admin migration; FR-57 to worker runtime; FR-58 to capability cutovers; FR-59 to AI Ask streaming; and FR-60 to legacy retirement.
- Map NFR-12 through NFR-18 to deployment, readiness, telemetry, private networking, schema compatibility, worker proof, and launch-evidence stories.

**Rationale:** Restores full, auditable PRD-to-backlog coverage without claiming the requirements are already implemented.

### 4.2 Replace Technical Migration Framing With Capability Cutovers

**Current state:** Epics 9-11 are valuable architecture work but do not independently deliver end-to-end product capability. They omit complete API/BFF rollout, worker deployment, separate admin migration, and legacy retirement.

**Approved target epic sequence:**

| Epic | Outcome | Core Scope | Primary Coverage |
| --- | --- | --- | --- |
| 9. Trusted Private API Foundation | BFFs call documented, protected `/v1` APIs using validated principals. | Credential issuance/validation, role governance, safe error envelope, OpenAPI, health/version, first protected read capability. | FR-51, FR-52, FR-54, FR-55, FR-56; NFR-14, NFR-15 |
| 10. Reliable AI Ask API Cutover | Travelers use AI Ask through BFF and API with no duplicate provider work or stale final answer. | Command ledger, fences, outbox, consumer state, API NDJSON endpoint, protocol tests, legacy AI Ask writer retirement. | FR-58, FR-59; supports FR-51, FR-54 to FR-56; NFR-13, NFR-14 |
| 11. Explainable, Withdrawable Planning Context | API-served answers use canonical trip state and traveler-safe details remain correct after source removal. | TripAnswerContext, source bundles, withdrawal, annotations, ownership-bound detail/actions, legacy read migration. | FR-51, FR-54 to FR-56, FR-58; NFR-2 to NFR-4, NFR-10, NFR-11, NFR-14 |
| 12. Operable Worker and Migration Runtime | Background work runs in a separately deployable, observable, schema-compatible runtime. | Worker bootstrap, bounded sweeps, health/readiness/shutdown, lease/fencing tests, telemetry, compatibility checks, loop cutovers. | FR-57, FR-58; NFR-12 to NFR-17 |
| 13. Separate Operator Application Cutover | Operators use a separately deployed admin app via protected API without DB access. | Admin BFF/app deployment, capability migration, role enforcement, private networking, legacy `/admin` retirement. | FR-53 to FR-56, FR-58, FR-60; NFR-12, NFR-15 |
| 14. Public Launch Cutover and Operational Evidence | Every public domain capability has one transport owner and launch operations have approved proof. | Capability inventory, dual-write prohibition checks, legacy retirement, migration gates, Railway/backup/monitoring/on-call/load proof. | FR-58, FR-60; NFR-12, NFR-16 to NFR-18 |

Epic 8 remains a prerequisite architecture-enablement program. Its audit and system-actor stories retain their existing acceptance criteria and must produce a testable exit gate before dependent worker/API cutovers rely on them.

### 4.3 Update UX for API-Cutover Recovery

**Artifact:** `ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`

**Approved update:**

- Clarify that Next.js owns traveler/admin presentation and BFF behavior; NestJS owns protected domain API and worker transport.
- Add idempotency retry/reconnect behavior: reuse the original key and restore persisted command state rather than resubmitting.
- Add `refresh_required` recovery: explain in Vietnamese that the conversation or trip changed; do not imply partial text was saved.
- Add non-blocking durable-consumer pending/failed state after an answer completes; never turn an already completed answer into a failed answer.
- Project stable safe API error codes into recovery copy; never expose provider, token, SQL, or internal transport details.
- Update UX sources to include the current architecture/readiness materials.

### 4.4 Convert Launch Prerequisites Into Owned Work or Gates

**Current state:** Epic 6 narrative prerequisites lack consistent owner, evidence, and disposition.

**Approved classification:**

| Track | Scope | Required Result |
| --- | --- | --- |
| Backlog story | Pricing/search validation; usage/provenance coupling; unresolved idempotency/concurrency work; DB integration-test sequencing. | Owning epic story with acceptance criteria and named test harness. |
| Launch-evidence gate | OAuth/admin/referral smoke; private networking; migration ordering; worker health; load/concurrency; backup restore; monitoring/on-call. | Evidence record with owner and `complete`, `accepted_risk`, or `blocked` status. |
| Product/legal/operations decision | Gateway privacy and notice; Facebook reuse policy; source URL display; mobile auth server; Railway ownership. | Decision record or explicit blocker with owner, due date, and launch impact. |

**Hard gate:** Epic 14 cannot claim public-launch readiness while a mandatory item lacks an owner or evidence/disposition record.

## 5. Implementation Handoff

**Scope classification: Major.** The work changes planning structure and runtime/deployment execution while preserving the product scope and completed baseline.

| Recipient | Responsibility |
| --- | --- |
| Product Manager | Confirm that the API-first/public-launch scope remains MVP scope; own product/legal decisions and acceptance of any launch risks. |
| Solution Architect | Ratify new capability-cutover stories against architecture invariants; own migration, private-network, worker, and API contract decisions. |
| Product Owner / Developer | Update `epics.md`, create detailed stories in implementation order, revise sprint status, and maintain FR/NFR traceability. |
| UX Designer | Update the experience spine with API-cutover recovery and source references. |
| Developer / Platform Owner | Implement approved stories, provide automated test evidence, deployment/runbook evidence, and legacy-retirement checks. |

### Success Criteria

1. Every PRD FR-1 through FR-60 and NFR-1 through NFR-18 has an explicit epic/story or named launch-evidence owner.
2. Each API migration story identifies API contract, BFF adaptation, authorization, safe error behavior, single-writer cutover behavior, and verification harness.
3. UX specifies all user-visible API recovery states before API/BFF implementation begins.
4. Every mandatory public-launch prerequisite has an owner and a `complete`, `accepted_risk`, or `blocked` disposition backed by evidence.
5. A rerun of implementation-readiness finds no missing FR/NFR traceability for this scope.

## 6. Approval Record

The four detailed change proposals and the complete proposal were approved by Tony on 2026-07-28. The approved changes were applied to `epics.md`, `ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md`, and `implementation-artifacts/sprint-status.yaml`; Epics 9-14 and their stories are tracked as backlog.

## 7. Workflow Execution Log

- 2026-07-28: Readiness assessment identified planning drift for FR-51 through FR-60 and NFR-12 through NFR-18.
- 2026-07-28: Tony selected incremental review and approved all four edit proposals.
- 2026-07-28: Tony approved the complete Sprint Change Proposal.
- 2026-07-28: Product planning artifacts and sprint backlog were updated. No production code, completed-epic status, or historic sprint evidence was modified.
- 2026-07-28: Tony approved a follow-on sequencing clarification: Story 9.4 completion is limited to development and local contract proof. Its unavailable deployment, private-route/probe, migration-ordering, selected-owner, rollback, and legacy-retirement evidence is owned by Epic 14 Story 14.2. Epic 10 development may proceed after Epic 9 completes; Epic 14 remains the mandatory public-launch gate.
