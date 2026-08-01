# Story 13.2: Migrate Operator Capabilities and Retire Legacy Admin Ownership

Status: ready-for-dev

## Story

As an operator,
I want knowledge and operational workflows to remain available through the separate admin application,
so that legacy `/admin` no longer owns domain transport or mutations.

## Acceptance Criteria

1. **Given** an operator capability is selected for migration, **when** its API contract, authorization, BFF adaptation, and safe error handling are verified, **then** the separate admin application provides the capability without importing domain mutation code or using direct database access, **and** staging tests prove ownership scope, role enforcement, private networking, and safe responses.
2. **Given** a migrated operator capability is enabled, **when** requests are routed, **then** exactly one transport owner accepts its command or read, **and** the matching legacy `/admin` route/server-action owner is retired rather than dual-written.

## Readiness Gate

**Satisfied 2026-08-01.** Story 13.1 is `done` in both its authoritative record and `sprint-status.yaml` at commit `8b50b2ab43e7f22175132af4f4ab614adbed8067`. It provides the independent `apps/admin` host-only opaque session, API-owned OAuth/session handoff, isolated `xuyenviet-admin-bff` credential minting, private API transport, signed double-submit CSRF/origin enforcement, no-database configuration isolation, schema-release admission, and independent admin health/runtime boundaries.

This story's first capability remains fixed below. Adding or replacing a capability requires a separately reviewed story rather than an implementation-time decision. Preserve the completed Story 13.1 boundary: do not add a database path, root `src` import, legacy server-action proxy, browser bearer token, shared web/admin issuer key, or new admin session behavior to deliver the user-role cutover.

## Selected First Cutover: Exact-Admin User and Role Governance

| Item | Fixed requirement |
| --- | --- |
| Capability | Search/page the administrator user roster, then grant or revoke `operator` and `admin`. Every endpoint requires exact `admin`; an `operator` is forbidden. |
| Legacy owners | Retire `src/app/admin/users/page.tsx`, `src/features/admin/users.ts#listAdminUsers`, and `src/features/admin/actions.ts#grantAdminUserRole`, `revokeAdminUserRole`, and their form actions after the new owner is admitted. |
| API contract | `GET /v1/admin/users?cursor=&search=` returns a safe cursor page ordered by `name,email,id`, roles, and bounded aggregate usage counters. `POST /v1/admin/users/:userId/roles` and `DELETE /v1/admin/users/:userId/roles/:role` accept only `operator` or `admin` and return `{ targetUserId, role, operation, changed }`. All errors use the existing safe envelope. |
| Domain owner | Extract roster-query and existing `changeUserRole` ports into `@xuyenviet/domain`. The command retains locks, final-admin protection, atomic authorization-version increment, and audit writes. Controllers never query Drizzle or recreate policy. |
| BFF/UI owner | `apps/admin` owns protected BFF routes and the Vietnamese roster UI. It validates input, runs CSRF/origin checks before unsafe calls, mints only its own credential, and projects only API DTOs. |
| Routing/rollback | Select one owner before admission. After the new BFF/API owner accepts traffic, remove or disable every listed legacy owner. Rollback selects the verified legacy release before new-owner admission; it never dual-writes or re-enables a legacy handler alongside the new one. |
| Required evidence | Repository/routing and API/BFF integration prove one reachable owner, exact-admin enforcement, role-version invalidation, final-admin protection, and safe responses. Staging records private route/probe, selected-owner execution, role denial, and rollback. |

## Tasks / Subtasks

- [ ] Start only after Story 13.1 provides a safe independent admin BFF runtime (AC: 1, 2)
  - [ ] Confirm and link Story 13.1 evidence for the admin host-only session, admin issuer credential minting, API-side session/version verification, private transport, CSRF, config isolation, and readiness boundary before migrating the fixed user-role slice.
  - [ ] Do not add a temporary direct database path, root `src` import, legacy server-action proxy, or browser bearer token to bypass a missing Story 13.1 dependency.

- [ ] Execute the reviewed user-role governance cutover inventory (AC: 1, 2)
  - [ ] Implement only **Selected First Cutover: Exact-Admin User and Role Governance**. Its roster read and grant/revoke commands are one cutover unit; do not migrate another capability in this story.
  - [ ] Record its legacy owners, extracted domain ports, API endpoints, BFF routes, selected active owner, rollback release, repository retirement result, and staging evidence in one completed inventory row before marking the slice done.
  - [ ] Treat a command and its authoritative read model as one cutover unit where the UI cannot safely operate with split ownership. A migration may add read-only shadow comparison only if it cannot mutate or select a second command owner.

- [ ] Publish the user-role API contract and authorization before enabling it (AC: 1)
  - [ ] Add the three contracts in **Selected First Cutover** to `@xuyenviet/contracts`, with an explicit stable cursor and `name,email,id` ordering. Project only the specified safe roster and usage fields.
  - [ ] Add Nest API controllers under `apps/api/src/admin/` and register them through `createApiModule`. Controllers call extracted owning domain commands/queries only; they never call Drizzle directly or recreate business/transaction policy.
  - [ ] Add the first API authorization-matrix entries: every user-role endpoint requires exact `admin`, current authorization version, and a non-disclosing forbidden response. `ResourceServerGuard` remains authentication only.
  - [ ] Update OpenAPI for each enabled endpoint with bearer security, validated input, response projection, safe error response, and the authorization contract. Keep `/v1` compatibility and use the existing request-ID/error filter/validation pipeline.

- [ ] Adapt the user-role API slice in the separate admin BFF (AC: 1)
  - [ ] Implement admin-local read and mutation adapters that validate/project browser input before credential minting; preserve correlation IDs, private API-only routing, timeout/abort behavior, declared idempotency keys only, CSRF/origin checks for mutations, and safe error mapping.
  - [ ] Build or move the corresponding UI under `apps/admin` using only the BFF contract. Do not import legacy root pages, `src/features/**` mutation/read modules, Drizzle, `server-only` code, or root Server Actions.
  - [ ] Preserve Vietnamese-first labels and accessible operational workflows: keyboard use, focus handling for dialogs, visible error/status information, and mobile/desktop readability. Do not expose a protected navigation item or data before server authorization succeeds.

- [ ] Make the user-role cutover single-owner and retire its matching legacy owner (AC: 2)
  - [ ] Select routing before command/read admission. Once the user-role capability is enabled in `apps/admin`, remove or disable `src/app/admin/users/page.tsx`, `listAdminUsers`, both role mutations, and both form actions so no root `/admin` route or Server Action accepts the same read or command.
  - [ ] Do not dual-write, race two action handlers, mirror mutations, or retain a legacy fallback after the new owner accepts traffic. Rollback selects a compatible previously verified owner before admission; it does not run both paths or roll back durable schema.
  - [ ] Remove/disable only the legacy surface belonging to the migrated slice. Keep unrelated `/admin` capabilities intact until their independently verified cutovers. Record the exact retirement evidence in the inventory.

- [ ] Verify the user-role cutover end-to-end (AC: 1, 2)
  - [ ] Add contract/API integration tests for valid exact-admin roster/grant/revoke access, traveler/anonymous/operator denial, final-admin protection, authorization-version invalidation, validation failures, safe-error projection, correlation propagation, and no CORS/cookie parsing/direct browser API acceptance.
  - [ ] Add admin BFF integration tests proving no protected response or navigation is disclosed before authorization, browser output has no credential/private configuration, and BFF code has no database/domain-mutation import path.
  - [ ] Add repository/routing tests proving exactly one owner is reachable for every migrated capability and its matching legacy route/action no longer accepts requests. Test any allowed read-only shadow path cannot write.
  - [ ] Run focused serial `DATABASE_URL_TEST` integration suites when a slice touches persistence, plus `pnpm lint`, `pnpm typecheck`, `pnpm build`, relevant container/runtime checks, and `git diff --check`. Document the external staging checks required for private networking, deployment selection, OAuth, role enforcement, and safe response proof without fabricating their results.

## Dev Notes

### Legacy Capability Inventory Baseline

| Capability family | Existing legacy owner | Required cutover condition |
| --- | --- | --- |
| User and role management | `src/app/admin/users/page.tsx`, `src/features/admin/users.ts`, `src/features/admin/actions.ts` | Exact `admin`, audited role mutation, authorization-version invalidation, API contract/BFF replacement, then retire matching root owner. |
| AI model catalog | `src/app/admin/ai-gateway/page.tsx`, `src/features/admin/ai-gateway.ts`, `src/features/admin/actions.ts` | Exact `admin`, API-owned catalog policy and safe projection, then retire matching root owner. |
| Knowledge operations | `src/app/admin/knowledge/**`, `src/features/knowledge/**` | Preserve source/evidence/review/audit/lease invariants via owning commands; API/BFF slice and retired matching legacy transport. |
| Quality/evaluation | `src/app/admin/quality/page.tsx`, `src/features/feedback/**` | Operator-scoped API read/mutation projection, safe diagnostics only, retired matching legacy owner. |

### Current State To Preserve

- The root `/admin` layout currently checks roles server-side and distinguishes operator/admin access. It is presentation plus direct legacy ownership, not an API contract to reuse.
- Existing API controllers cover health/version, conversation/planning reads, and AI Ask only. There are currently no operator/admin endpoints, DTOs, or API authorization matrix; every migrated slice must add them first.
- `ResourceServerGuard` validates only bearer credential/principal/session freshness. It must remain bearer-only and API-side; it is insufficient as a capability-role guard by itself.
- The shared BFF client rejects origin escapes, keeps a local timeout through JSON parsing, preserves caller aborts, maps only safe errors, and forwards an idempotency key only when declared. New admin adapters must retain these properties.
- Completed Stories 9-12 establish private BFF transport, independent workload schema readiness, one authoritative release ledger, and AD-32-style single-writer cutovers. Do not weaken them for an admin migration.

### Architecture Compliance and Guardrails

- One aggregate command/query has one owning domain module and one active transport owner. API controllers and admin BFF UI are adapters, not domain/database owners.
- Preserve the existing PostgreSQL transaction, locking, lease, fencing, idempotency, audit, provenance, retention, and authorization-version semantics by calling extracted owners. Do not reimplement them in a controller, browser, or BFF.
- Do not create generic CRUD endpoints, expose tables, duplicate feature logic in `apps/admin`, or use broad admin-only bypasses. Define contracts per capability and fail closed for unknown input/role/state.
- Keep normal traveler denial server-side and non-disclosing. The browser must not learn operator navigation, protected identifiers, source material, model/provider details, audit content, role data, or whether a protected object exists.
- No direct browser-to-Nest connection, CORS enablement, cookie acceptance in Nest, database credential in admin, or shared cross-subdomain session cookie.
- External staging deployment/routing/probe/rollback evidence is required by the epic but cannot be inferred from repository tests. Record it as a named evidence requirement; Epic 14 owns the full public-launch evidence gate.

### Project Structure Notes

- Shared contract types/parsers: `packages/contracts/src/index.ts`; shared config only where neutral and needed by both BFFs: `packages/config/src/index.ts`.
- API transport adapters: add focused files beneath `apps/api/src/admin/`; register them in `apps/api/src/app.module.ts` and document through `apps/api/src/openapi.controller.ts`.
- Separate admin presentation/BFF adapters: `apps/admin/src/**`. Root `src/app/admin/**` and `src/features/**` are legacy surfaces to delete/disable slice by slice, never import dependencies.
- Tests should extend existing API principal/platform, BFF credentials/transport, role-management, knowledge/capture, and schema/runtime suites rather than adding a parallel test framework.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 13.2: Migrate Operator Capabilities and Retire Legacy Admin Ownership`]
- [Source: `13-1-establish-the-separately-deployed-admin-bff-application.md`]
- [Source: `docs/proposals/nestjs-api-and-separated-admin.md#API Contract`]
- [Source: `docs/proposals/nestjs-api-and-separated-admin.md#Admin Tách Riêng`]
- [Source: `docs/proposals/nestjs-api-and-separated-admin.md#Giai Đoạn 5: Full Pre-Launch API Cutover`]
- [Source: `_bmad-output/project-context.md#Framework-Specific Rules`]
- [Source: `src/app/admin/layout.tsx`]
- [Source: `apps/api/src/app.module.ts`]
- [Source: `apps/api/src/auth/resource-server.guard.ts`]
- [Source: `src/server/bff-api-client.ts`]
- [Source: `src/server/protected-bff-adapter.ts`]
- [Source: `tests/admin-roles.test.ts`]
- [Source: `tests/admin-user-management.test.ts`]
- [Source: `tests/bff-credentials.test.ts`]
- [Source: `tests/bff-transport.test.ts`]

## Story Validation

- [x] Both Epic 13.2 acceptance criteria are reproduced and mapped to slice-level API, BFF, retirement, and verification tasks.
- [x] Story 13.1 dependencies, explicit capability authorization, API-first contract creation, and no-direct-DB/no-domain-import boundaries are clear.
- [x] The legacy admin capability inventory and exact retirement/single-owner rule prevent accidental broad deletion or dual writes.
- [x] Existing API/BFF security, schema-release, audit/transaction, and test patterns are preserved.
- [x] External staging proof is required but not fabricated; Epic 14 scope is kept separate.

### Validation Outcome

**PASS - ready for development.** Story 13.1 now provides the verified independent admin BFF boundary. This story retains one fixed exact-admin user-role governance slice with explicit API, ownership, retirement, rollback, and evidence requirements.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Debug Log References

- Story preparation and validation only. No application code, database, deployment, test, or external environment action was performed.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Created from the Epic 13 source, separated-admin proposal, Story 13.1 prerequisite analysis, current legacy root admin inventory, API/BFF/security patterns, completed release/cutover work, test conventions, sprint status, and recent Git history.
- Scope remains capability-by-capability: no generic proxy, no dual writer, and no claim of full legacy or public-launch retirement before verified evidence exists.
- 2026-08-01 validation correction: status changed to `backlog`; the first cutover is exact-admin user-role governance, not an implementation-time capability selection.
- 2026-08-01 dependency revalidation: Story 13.1 completed in commit `8b50b2ab43e7f22175132af4f4ab614adbed8067` with the independent session handoff, isolated admin issuer, private BFF transport, CSRF/origin, config isolation, and readiness evidence required here. This story is ready only for the fixed exact-admin user-role governance cutover.

### File List

- `_bmad-output/implementation-artifacts/13-2-migrate-operator-capabilities-and-retire-legacy-admin-ownership.md`
