---
title: 'Publish versioned API contracts and migrate a protected read'
type: 'feature'
created: '2026-07-28'
status: 'done'
baseline_revision: '7736a1d6fd2770864ea4c1cb6c1dc87191d25e76'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings:
  - oversized
---

<intent-contract>

## Intent

**Problem:** The private API foundation has credentials and safe transport but no documented versioned platform surface or real protected capability. The ordinary conversation-summary list remains coupled to the root Next session and cannot prove the API/BFF boundary.

**Approach:** Extract the owner-scoped summary read through shared database/domain seams, publish health, version, readiness, OpenAPI, and protected `/v1` contracts in Nest, then route the root Next loader through a validated default-off BFF flag while preserving the legacy presentation contract.

## Boundaries & Constraints

**Always:** Preserve the exact legacy summary projection, deterministic ordering, owner isolation, Vietnamese preview fallback, and non-project scope. API timestamps are ISO-8601 UTC; the BFF deliberately maps them back to the page contract. Public liveness, readiness, and version routes are explicit; the conversation endpoint remains bearer-only, controller authorization derives solely from `RequestPrincipal`, and no CORS policy is enabled. Readiness must validate configuration, issuer keys, database access, and a recorded compatible schema version, while liveness never queries the database. The routing flag is strict and default-off, selects one owner before either executes, and never exposes credentials, cookies, private URLs, or claims. Use forward-only migrations and bounded serial database tests.

**Block If:** A real staging deployment cannot establish the API workload, private routing, migration-before-traffic order, response equivalence, and rollback evidence required to retire the legacy owner. Record this as deployment evidence rather than fabricating completion.

**Never:** Import Next/session/server-only/root-alias modules into Nest or the shared domain read. Do not migrate AI Ask, commands, trip-project conversations, full messages, pagination, a public API/CORS surface, generated SDK, permanent compatibility owner, destructive schema rollback, or a dual-write path.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Summary API | Valid BFF bearer for an owner | `200` bounded summaries `{ id, updatedAt ISO UTC, preview }` in `updatedAt DESC, id DESC` order | No cookies/session interpreted |
| Ownership | Valid bearer for another user | Only that owner’s non-project summaries | Empty list, never another owner’s row |
| Direct browser | Cookie/origin but no valid bearer | Protected API rejects and emits no CORS allow-origin | Safe error envelope only |
| Health/readiness | Database unavailable or schema record incompatible | Liveness remains process-only; readiness rejects admission | Safe readiness response without internal errors |
| Cutover | Flag false / true | Legacy only / BFF API only before request acceptance | Same presentation serialization; no credential exposure |

</intent-contract>

## Code Map

- `src/features/chat-trips/conversations.ts` -- legacy behavior reference and retained Next session adapter.
- `src/app/ai-ask/page.tsx` -- ordinary conversation-summary load selector; project loaders remain untouched.
- `src/server/bff-api-client.ts` and `src/server/bff-credentials.ts` -- established private BFF transport and credential minting.
- `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/auth/*`, `apps/api/src/common/*` -- Nest bootstrap, global safe boundary, and bearer principal guard.
- `packages/contracts/src/index.ts` and `packages/database/src/index.ts` -- shared contract and database seams.
- `src/db/schema.ts`, `drizzle/migrations/*`, `drizzle/meta/_journal.json` -- schema and forward migration authorities.
- `tests/ai-ask-sessions.test.ts`, `tests/api-request-principal.integration.test.ts`, `tests/bff-transport.test.ts` -- established query, Nest identity, and BFF test patterns.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/*`, `packages/domain/*`, `src/features/chat-trips/conversations.ts` -- create a Next-independent owner-scoped conversation-summary repository/domain contract and retain the session adapter -- Nest and Next share the same behavior without boundary violations.
- [x] `packages/contracts/src/index.ts`, `apps/api/src/health/*`, `apps/api/src/version/*`, `apps/api/src/conversations/*`, `apps/api/src/{main,app}.ts` -- publish explicit public health/version and protected versioned read contracts with OpenAPI, safe errors, and public-route handling -- proves the API platform surface without weakening global protection.
- [x] `src/db/schema.ts`, `drizzle/migrations/*`, `packages/database/*`, API readiness/release scripts -- record and admit checked-in compatible schema versions under an advisory lock -- prevents API traffic against an incompatible schema.
- [x] `src/server/*`, `src/features/chat-trips/*`, `src/app/ai-ask/page.tsx` -- add strict server-only cutover configuration and narrow BFF summary adapter, then select exactly one owner -- preserves browser presentation without exposing private transport details.
- [x] `tests/*` -- add focused domain, HTTP/OpenAPI, readiness, direct-browser, BFF serialization, and routing-switch coverage -- verifies all matrix cases and contract equivalence.
- [x] deployment/workspace configuration -- add only API build/start/health requirements necessary for the API workload -- makes API build and migration ordering executable; real staging evidence remains external.

**Acceptance Criteria:**
- Given the API service is deployed, when callers request `/health/live`, `/health/ready`, `/v1/version`, or the protected summary read, then OpenAPI documents versioning, authorization, ownership, safe errors, and deterministic bounded-list ordering, and contract tests validate documented responses and envelopes.
- Given the root traveler BFF loads conversation summaries, when it validates its host-only session and calls the private API, then the browser receives only the presentation response, while direct browser API requests are denied without CORS authorization or session interpretation.
- Given the cutover flag routes a summary request, when either state is exercised, then exactly one owner executes, response shape remains equivalent, and staging-safe comparison cannot affect browser behavior or form a permanent second owner.

## Spec Change Log

## Review Triage Log

### 2026-07-28 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 10 (high 1, medium 7, low 2)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Registered the release-schema migration with Drizzle metadata and preserved its generated snapshot so deployment executes the table creation.
  - `[medium] [patch]` Made the summary read select bounded conversations before selecting one user preview each, completed OpenAPI schemas/errors, enforced canonical UTC timestamps, and gated authenticated protected traffic on readiness.
  - `[medium] [patch]` Made schema admission track the currently recorded release, held the advisory lock across migration and version recording, and removed the standalone recorder admission bypass.
  - `[medium] [patch]` Deferred BFF dependency loading until the enabled route, and classify identity database outages as safe service-unavailable responses.

## Design Notes

Use an explicit public-route decorator consumed only by the existing resource guard rather than making the API globally public. Keep runtime validation in the existing parser-based boundary; OpenAPI metadata must describe that contract, not replace it. `release_schema_versions` is an API-foundation admission record: migration/release setup records the applied version while holding a PostgreSQL advisory lock; readiness compares it with a checked-in API compatibility declaration.

## Verification

**Commands:**
- `pnpm vitest run tests/ai-ask-sessions.test.ts tests/api-request-principal.integration.test.ts tests/bff-transport.test.ts tests/bff-session-route.test.ts tests/safe-api-exception.filter.test.ts tests/safe-validation.pipe.test.ts --maxWorkers=1` -- expected: focused contracts pass serially against configured `DATABASE_URL_TEST`.
- `pnpm lint` -- expected: no lint errors.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm build` -- expected: root production build passes.
- `pnpm --filter @xuyenviet/api build` -- expected: API workload compiles.
