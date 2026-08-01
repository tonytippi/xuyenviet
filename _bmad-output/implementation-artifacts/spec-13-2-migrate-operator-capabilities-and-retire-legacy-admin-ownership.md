---
title: 'Migrate Operator Capabilities and Retire Legacy Admin Ownership'
type: 'feature'
created: '2026-08-01'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '3e821a7'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/13-2-migrate-operator-capabilities-and-retire-legacy-admin-ownership.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-13-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Exact-admin user roster and role governance remain directly owned by the root `/admin` Next route and Server Actions. That duplicates domain/database access outside the private API and prevents the separate admin application from being the sole transport owner.

**Approach:** Move the roster query and existing role-change command behind typed `@xuyenviet/domain` ports, expose the fixed `/v1/admin/users` API contract, and serve it only through protected `apps/admin` BFF routes and a Vietnamese exact-admin UI. Remove the matching legacy page, query, mutations, form actions, and navigation entry in the same cutover.

## Boundaries & Constraints

**Always:** Every roster and role endpoint uses `admin.role.governance`, which requires exact `admin` at both BFF admission and API capability authorization; `ResourceServerGuard` remains authentication-only. Preserve the role command's transaction advisory lock, actor/target locks, final-admin protection, changed-only authorization-version increment, and transaction-coupled audit write. List users with an explicit opaque stable cursor ordered by `name,email,id`; project only safe fields and bounded aggregate usage counters. The admin app validates browser input, validates CSRF/origin before unsafe calls, mints only its admin issuer credential, uses private API transport, preserves request IDs, and returns only safe errors. Browser output must not contain credentials, private configuration, domain/database access, or protected navigation/data before exact-admin authorization succeeds.

**Block If:** A stable nullable `name,email,id` cursor cannot be represented consistently by the API contract and PostgreSQL adapter without duplicate/omitted rows, or the existing role command invariants cannot be expressed through domain/database ports without altering their atomic transaction behavior.

**Never:** Add direct database access, Drizzle, root `src` imports, legacy Server Action proxies, browser bearer credentials, CORS, Nest cookie authentication, a generic admin CRUD/proxy endpoint, another migrated capability, a legacy fallback, dual writes, or a second active command/read owner. Do not claim external private-network, deployment, OAuth, selected-owner, rollback, or staging evidence as locally verified.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Exact-admin roster | Current exact-admin session and valid cursor/search | Private API returns a bounded page sorted by `name,email,id`; BFF projects it to the admin UI | Invalid cursor/search returns safe validation error; no direct browser API access |
| Grant/revoke role | Exact admin, CSRF/origin-valid mutation, `operator` or `admin` | API calls the owning command and returns `{ targetUserId, role, operation, changed }`; changed mutation increments authorization version and writes audit history atomically | Invalid role/input is safe validation error; operator/traveler/anonymous are non-disclosively denied |
| Final admin revoke | Target is the only admin | No role/version/audit mutation occurs | Safe non-disclosing API error through the existing envelope |
| Stale credential | Role change has invalidated a prior credential | Resource server rejects stale authorization version before controller work | Bearer-only safe unauthorized response, no CORS/cookie acceptance |
| Cutover routing | New API/BFF capability admitted | Only `apps/admin` BFF plus `/v1/admin/users` receive this capability; root `/admin/users` and matching actions are absent | Rollback selects the verified prior release rather than enabling both owners |

</intent-contract>

## Code Map

- `packages/contracts/src/index.ts` -- shared safe user-role DTOs, parsers, and opaque cursor contract.
- `packages/domain/src/user-role-governance.ts` and `packages/domain/src/index.ts` -- framework-free roster and command ports; preserve role mutation invariants.
- `packages/database/src/index.ts` -- PostgreSQL roster and transaction-backed governance port adapters.
- `apps/api/src/admin/*`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/openapi.controller.ts` -- exact-admin controllers, dependency wiring, and documented `/v1` contract.
- `apps/admin/server/*` and `apps/admin/app/users/**` -- private BFF adapters/routes and Vietnamese exact-admin roster UI.
- `src/app/admin/users/page.tsx`, `src/features/admin/users.ts`, `src/features/admin/actions.ts`, `src/app/admin/layout.tsx` -- legacy capability owners/navigation to retire only for this slice.
- `tests/*admin*`, `tests/auth-role-governance.test.ts`, `tests/api-request-principal.integration.test.ts`, `tests/story-13-1-final-repair.test.ts` -- ownership, authorization, safe transport, and command regression coverage.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/contracts/src/index.ts` -- add exact parsers/types for a bounded safe cursor roster page, role body/path values, and role-operation result.
- [ ] `packages/domain/src/user-role-governance.ts`, `packages/domain/src/index.ts` -- extract the roster query and `changeUserRole` use case behind explicit ports without changing locks, final-admin, authorization-version, or audit semantics.
- [ ] `packages/database/src/index.ts` -- implement the domain ports with PostgreSQL/Drizzle only in the database package and canonical tuple cursor behavior.
- [ ] `apps/api/src/admin/*`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, `apps/api/src/openapi.controller.ts` -- publish and wire the three bearer-only exact-admin endpoints with DTO validation, capability guard, safe envelopes, and OpenAPI descriptions.
- [ ] `apps/admin/server/*`, `apps/admin/app/users/**` -- add exact-admin BFF read/mutation adapters and an accessible Vietnamese roster workflow using BFF contracts only.
- [ ] `src/app/admin/users/page.tsx`, `src/features/admin/users.ts`, `src/features/admin/actions.ts`, `src/app/admin/layout.tsx` -- remove the migrated legacy read/mutation/page/navigation owners without touching unrelated admin capabilities.
- [ ] `tests/**` -- prove contract validation/cursor ordering, exact-admin grants/revokes, operator/traveler/anonymous denial, final-admin protection, role-version invalidation, safe errors/correlation/no-CORS, BFF boundary/non-disclosure, and a single reachable owner.
- [ ] `docs/release-matrices/` and story record -- record the selected API/BFF owner, legacy retirement, compatible rollback release, and named external staging evidence still required.
- [ ] Verification -- run focused serial database integration suites, lint, typecheck, build, relevant runtime checks, and whitespace validation.

**Acceptance Criteria:**
- Given the selected user-role capability is deployed, when its API contract, authorization, BFF adaptation, and safe errors are used, then the separate admin application provides roster/grant/revoke without domain mutation imports or direct database access, and local evidence proves scope/role/private/safe boundaries while required staging evidence is explicitly recorded.
- Given the new API/BFF user-role capability admits traffic, when roster or role commands are requested, then it is the only reachable transport owner and the matching root `/admin` page/actions no longer accept reads or mutations; rollback is documented as release selection rather than concurrent ownership.

## Spec Change Log

### 2026-08-01 — Review-driven rederivation
- Trigger: the database adapter duplicated role-change business/transaction policy while `@xuyenviet/domain` exposed only a pass-through port.
- Amendment: make the domain module own the command algorithm and explicit transaction/audit persistence ports; database implements only those ports, and any remaining root callers must delegate rather than retain a second implementation.
- Avoids: divergent final-admin, authorization-version, lock, and audit behavior from two role-command owners.
- KEEP: preserve the API/BFF contract, exact-admin capability/issuer checks, safe private transport, legacy retirement, and non-fabricated external staging evidence.

## Review Triage Log

### 2026-08-01 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5 (high 1, medium 3, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Repaired CSRF token acquisition/header handling so mutations reach the selected BFF/API owner, with visible recovery after fetch failure.
  - `[medium] [patch]` Added accessible Vietnamese search and opaque cursor pagination to expose the complete selected capability.
  - `[medium] [patch]` Validate search, cursor, user ID, role, and operation before credential minting or private API transport.
  - `[medium] [patch]` Added selected-owner API, BFF, and PostgreSQL-port coverage for exact-admin authorization, safe rejection, final-admin protection, audit, and authorization-version behavior.

### 2026-08-01 — Follow-up review pass
- intent_gap: 0
- bad_spec: 1 (high 1)
- patch: 6 (medium 5, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [bad_spec]` Re-derive the role command as a domain-owned use case with database ports only, removing the remaining duplicate root/database command implementations.
  - `[medium] [patch]` Make BFF validation errors canonical safe envelopes with body/header correlation and exercise every roster/mutation API and BFF route.
  - `[medium] [patch]` Append cursor pages instead of replacing the visible roster, validate route-level input strictly, and honor caller aborts through private transport.
  - `[medium] [patch]` Record the concrete compatible rollback commit in the cutover inventory.

### 2026-08-01 — Final review passes
- intent_gap: 0
- bad_spec: 0
- patch: 11 (high 0, medium 10, low 1)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Preserved API safe envelopes and correlation through BFF mutations, including canonical timeout status mapping and complete response-body abort/timeout protection.
  - `[medium] [patch]` Added strict route body validation, OpenAPI/runtime status alignment, actual BFF route coverage, and PostgreSQL nullable tuple cursor regression coverage.
  - `[medium] [patch]` Prevented stale search/page and post-mutation responses from overwriting current roster state; cancellation during credential minting cannot invoke the private API.

### 2026-08-01 — Epic 13 repair review passes
- intent_gap: 0
- bad_spec: 0
- patch: 10 (medium 10)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium] [patch]` Classified only typed user-role policy failures as validation errors; unexpected list, transaction, persistence, audit, dependency HTTP, and absent-principal failures now return redacted retryable `503 internal_error` responses.
  - `[medium] [patch]` Parsed and correlated role-command responses before projection, kept `changed: false` state unchanged, then reconciled from the canonical roster without overwriting a failed refresh.
  - `[medium] [patch]` Bound roster API results to the normalized requested search and serialized UI role commands/search paging to prevent stale out-of-order state projection.
  - `[medium] [patch]` Added controller, Nest integration, command-parser, roster-projection, no-op, and response-echo regressions.

## Design Notes

The existing role command is the authority because its transaction includes an advisory lock, target-role lock, final-admin check, changed-only version increment, and audit write. Controllers must call it through a domain port, not copy any Drizzle or policy code. The roster needs an opaque encoding of the full declared ordering tuple so the page cannot silently become offset pagination or a split read owner.

## Verification

**Commands:**
- `DATABASE_URL_TEST=... pnpm vitest run --no-file-parallelism tests/auth-role-governance.test.ts tests/admin-user-management.test.ts tests/api-request-principal.integration.test.ts tests/story-13-1-final-repair.test.ts` -- exact-admin, final-admin, invalidation, API/BFF, and ownership coverage passes.
- `pnpm lint` -- no lint errors.
- `pnpm typecheck` -- all workspace TypeScript checks pass.
- `pnpm build` -- root, API, worker, and independent admin builds pass.
- `git diff --check` -- no whitespace errors.

**External evidence required:**
- Staging must record private-network route/probe, selected-owner execution, exact-admin and operator-denial responses, OAuth/session/version behavior, compatible rollback release selection, and safe-response proof. This workflow does not fabricate those results.

## Auto Run Result

- Status: done.
- Repaired API error classification so only explicit user-role policy errors become `400 validation_error`; unexpected roster, transaction, persistence, audit, dependency, and adapter-invariant failures produce a redacted retryable `503 internal_error` envelope.
- Repaired the admin roster to parse/correlate command results, avoid projecting no-op `changed: false` grants, reconcile them from the canonical roster, bind roster results to the requested search, and serialize mutations/search paging against stale projections.
- Final synchronous Blind Hunter, Edge Case Hunter, and Acceptance Auditor review layers found no actionable local findings after bounded repairs.
- Verification passed: serial four-file persistence/API/BFF suite (66 tests), `pnpm lint` (0 errors; 5 pre-existing unrelated warnings), `pnpm typecheck`, `pnpm build`, and `git diff --check`.
- Residual risk: deployment-owned staging proof remains required for private routing, selected-owner execution, exact-admin/operator denial, OAuth/session/version behavior, safe responses, and rollback selection. It is recorded in `../docs/release-matrices/20260801.1-admin-user-role-governance-cutover.md`.
