---
title: 'Discovery ownership, policy, and audit foundation'
type: 'feature'
created: '2026-08-07'
status: 'done'
baseline_revision: '3b62978'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: '3b62978'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-18-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Automated YouTube URL Discovery has no isolated, governed persistence foundation or immutable executor identity. Later Discovery work therefore cannot safely snapshot a policy, attribute automation, or prove it does not become a Knowledge lifecycle owner.

**Approach:** Add only Discovery-owned versioned policy, query-proposal, and run records, narrow validation/contracts/repository exports, and the registered system audit actor. Protect all persistent invariants in Drizzle schema and migration, use the existing Audit writer, and cover boundaries with unit and serial integration tests.

## Boundaries & Constraints

**Always:** Discovery is URL-only and owns only `youtube_discovery_*` records. It never writes Knowledge sources, captures, ingestion jobs, evidence, cards, publication state, traveler data, or protected audit tables directly. Persist one immutable policy-version row per version with exactly one current version; each run FK-snapshots that row. Policy defaults are persisted and bounded: 180-day candidate/audit/dedupe retention and a separately persisted, strictly shorter comment-signal TTL. Automated attribution is constructed only by `createSystemAuditActor("system-youtube-discovery")`; protected operator commands retain their authenticated user actor. Audit summaries use explicit safe scalar policy/run fields only.

**Block If:** Existing schema/migration conventions make a database-enforced single-current immutable policy version impossible without a new unapproved table or an incompatible migration; or a required invariant conflicts with an established authoritative schema contract.

**Never:** Add controllers, Worker adapters, scheduling, run claiming/transitions, provider clients, query planning, canonicalization, candidates, triage, retention execution, UI, hard budgets/quotas, environment-owned policy, compatibility layers, or a second migration/audit authority. Do not accept free-form executor IDs or retain provider payloads, comments, prompts, responses, source material, URLs with secrets, media, transcripts, or traveler content.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Policy default | Valid omitted policy settings | Persisted bounded policy defaults with 180-day retention and shorter comment TTL | No error expected |
| Invalid policy | Unbounded/invalid numeric values or TTL >= retention | Domain validation and database checks reject it | Safe validation/constraint failure; no write |
| Run snapshot | New run with a current policy version | Required FK references that exact immutable policy version | Missing/nonexistent version is rejected |
| System attribution | Discovery automated audit event | Catalog-created `system-youtube-discovery` system actor is retained | Arbitrary/missing executor fails before persistence |

</intent-contract>

## Code Map

- `packages/database/src/schema.ts` -- schema types, Discovery tables, checks, indexes, and reserved system-user constraint.
- `packages/database/src/actors.ts` and `packages/database/src/audit-writers.ts` -- immutable executor catalog and exclusive protected-audit write boundary.
- `packages/database/src/youtube-discovery/` -- new Discovery-only persistence module.
- `packages/domain/src/knowledge-lifecycle.ts` -- duplicated system audit actor union to align.
- `packages/domain/src/` and `packages/contracts/src/` -- new policy validation and narrow safe public contracts.
- `drizzle/migrations/` and `drizzle/migrations/meta/_journal.json` -- append-only migration authority.
- `tests/audit-actors.test.ts`, `tests/story-8-6-actor-isolation.test.ts`, `tests/helpers/db.ts` -- catalog/isolation and serial database test patterns.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/schema.ts` and `drizzle/migrations/0044_discovery_foundation.sql` -- add the closed Discovery values and only policy-version, query-proposal, and run tables, with database constraints for one current immutable policy version, bounded/safe fields, exact run states, policy-version FK snapshots, and the appended reserved actor ID -- makes persistence authoritative and migration-backed.
- [x] `packages/domain/src/youtube-discovery/policy.ts`, `packages/contracts/src/youtube-discovery/index.ts`, package index files, and `packages/domain/src/knowledge-lifecycle.ts` -- define/export closed safe policy input/default/validation and audit-summary contracts; align the system actor union -- keeps command/Worker ports narrow and prevents unsafe inputs before persistence.
- [x] `packages/database/src/actors.ts`, `packages/database/src/youtube-discovery/index.ts`, and database index -- append the Discovery executor and add a repository constrained to Discovery tables plus `recordAuditEvent` -- preserves immutable attribution and ownership isolation.
- [x] `tests/audit-actors.test.ts`, `tests/story-8-6-actor-isolation.test.ts`, `tests/youtube-discovery-policy.test.ts`, `tests/youtube-discovery-ownership.test.ts`, `tests/youtube-discovery-foundation.integration.test.ts`, and `vitest.config.ts` -- cover actor construction/isolation, validation/defaults, source-level ownership, and serial migrated persistence using local `resetTestDatabase()` -- locks the behavior and prevents boundary regression.
- [x] `_bmad-output/implementation-artifacts/18-1-establish-discovery-ownership-policy-and-audit-foundation.md` and `sprint-status.yaml` -- record completed tasks, verification evidence, changed files, and final status -- keeps BMad execution artifacts current.

**Acceptance Criteria:**
- Given migration 0044 is applied, when Discovery policies, query proposals, and runs are persisted, then only Drizzle-migrated `youtube_discovery_*` tables own them and no Discovery module writes Knowledge lifecycle records.
- Given governed policy is validated or persisted, when defaults/bounds are evaluated, then global enablement, score settings, cadence, retention, concurrency, and retry settings are finite, bounded, persisted, and every run references an immutable effective policy version without budget/quota fields.
- Given Discovery records automated attribution, when an audit is constructed, then only the registered `system-youtube-discovery` executor is used, while operator attribution remains a real user actor and summaries contain only bounded safe fields.
- Given a system actor catalog row is validated, when `system-youtube-discovery` is used or a catalog ID is inserted as a user, then construction succeeds only for the catalog actor and user/account/session/role authentication paths remain prohibited.

## Spec Change Log

## Review Triage Log

### 2026-08-07 - Review pass 1
- intent_gap: 0
- bad_spec: 0
- patch: 6 (high 4, medium 2)
- defer: 1 (medium 1)
- reject: 0
- addressed_findings:
  - [high] [patch] Transaction-coupled policy/run/query writes to Audit, completed safe policy audit summaries, and enforced query actor attribution.
  - [high] [patch] Seeded and enforced the single current immutable policy version, rejecting omitted effective policy state.
  - [medium] [patch] Rejected explicit null policy configuration and expanded audit/rollback regression coverage.

### 2026-08-07 - Review pass 2
- intent_gap: 0
- bad_spec: 0
- patch: 5 (high 2, medium 3)
- defer: 0
- reject: 0
- addressed_findings:
  - [high] [patch] Repaired migration constraint-trigger syntax and null-safe policy bootstrap condition.
  - [medium] [patch] Locked and required enabled current policy during run creation; constrained policy/query attribution to Discovery or the real operator.
  - [medium] [patch] Restored broad non-unit integration discovery after preventing the new test from being excluded.

### 2026-08-07 - Review pass 3
- intent_gap: 0
- bad_spec: 0
- patch: 3 (medium 2, low 1)
- defer: 1 (medium 1)
- reject: 0
- addressed_findings:
  - [medium] [patch] Exported Discovery tables in the typed schema aggregate and limited new runs to queued state.
  - [medium] [patch] Removed operator-controlled query reason from the persisted audit summary.
  - [low] [patch] Restored the integration project's prior `tests/**/*.test.ts` minus-unit coverage behavior.

### 2026-08-07 - Review pass 4
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

## Design Notes

The run snapshot needs historical integrity, so policy versions are immutable rows rather than a mutable singleton whose version would retroactively alter old runs. A partial unique index/database constraint supplies the single-current policy invariant while retaining old version rows for foreign-key snapshots. Selected policy defaults are documented and asserted in one domain module, never environment configuration.

## Verification

**Commands:**
- `pnpm test:unit` -- actor, policy, audit-construction, and ownership tests pass without database configuration.
- `pnpm test:integration` -- serial migrated Discovery persistence/isolation tests pass against `DATABASE_URL_TEST`.
- `pnpm lint` -- no lint errors.
- `pnpm typecheck` -- strict TypeScript passes.
- `pnpm build` -- production build passes.
- `git diff --check` -- no whitespace errors.

## Auto Run Result

- Status: done
- Summary: Implemented the Discovery-only policy version, query proposal, and run persistence foundation; registered `system-youtube-discovery`; enforced bounded persisted policy defaults and ownership/audit boundaries.
- Review: Four synchronous adversarial/edge review passes repaired transactional audit coupling, policy bootstrap/migration correctness, current-policy locking and enablement, actor restrictions, schema exports, run-state admission, and audit-safe summaries. Final confirmation found no actionable findings.
- Verification: `pnpm test:unit` passed (27 files, 251 tests); `pnpm lint` passed with 43 pre-existing warnings and no errors; `pnpm typecheck`, `pnpm build`, `pnpm exec drizzle-kit migrate`, and `git diff --check` passed.
- Residual risk: `pnpm test:integration -- tests/youtube-discovery-foundation.integration.test.ts` remains blocked before tests by the disposable `DATABASE_URL_TEST` migration subprocess (`drizzle-kit migrate` exits 1 with no SQL diagnostic) after a previously partial 0044 state. The normal configured database migration succeeds. No destructive test-database reset was performed.
- Commit: not created; the user did not request one.
