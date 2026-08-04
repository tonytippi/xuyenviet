---
title: 'Move Traveler Presentation to apps/web'
type: 'refactor'
created: '2026-08-04'
status: 'done'
baseline_commit: '11cf14a'
review_loop_iteration: 0
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-03-direct-api-session-auth.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** The traveler Next.js presentation client remains rooted at `src/`, while admin, API, and Worker each have explicit applications under `apps/`. This obscures deploy ownership and lets a presentation client appear to own server/runtime code after the direct-API cutover.

**Approach:** Create `apps/web` as the dedicated traveler Next.js workspace and move its routes, client UI, direct API client, and presentation DTOs there. Keep database, domain, retrieval, and worker implementations outside the web application, replacing UI imports of those server modules with browser-safe types derived from existing direct API contracts.

## Boundaries & Constraints

**Always:** Preserve NestJS as the sole OAuth, browser-session, CSRF, and domain API owner. The web client calls the existing relative `/auth/*` and `/v1/*` direct API paths and must have no database credentials, server-only imports, server actions, Next route handlers, or BFF behavior. Preserve same-origin production routing and development rewrites. Keep the current root server/domain compatibility code working while moving presentation code; this refactor must not turn into a package-extraction rewrite.

**Ask First:** Halt if completing the move requires changing the documented production ingress/same-origin topology, adding a new deployment service, changing direct API response contracts, or moving remaining root database/domain/worker code into packages.

**Never:** Do not restore Auth.js, BFF credentials, proxy route handlers, direct database access from browser code, or a parallel traveler app. Do not delete root server modules merely because they are not presentation code. Do not introduce dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Local web development | `pnpm dev` | Starts `@xuyenviet/web`; `/auth/*` and `/v1/*` retain development forwarding to Nest | Existing API failures remain browser-visible safe errors |
| Production web build | Root `pnpm build` and Docker web runner | Builds `apps/web` and serves its standalone Next output on port 3000 | Build fails if web workspace or artifact paths are invalid |
| Direct traveler request | Browser session and relative API request | UI uses the existing Nest cookie/CSRF flow without a Next handler | Existing direct API error handling remains unchanged |
| Server test imports | Root unit/integration suites | Existing server/domain imports remain resolvable; traveler-specific tests target `apps/web/src` | Type or path failures identify stale references |

</frozen-after-approval>

## Code Map

- `src/app`, `src/components`, and selected client files under `src/features` -- current traveler routes and UI to move.
- `src/features/ai/direct-api-client.ts` and `src/features/chat-trips/direct-shell-loader.tsx` -- direct browser API transport and traveler shell; must reside in web.
- `src/features/ai/answer-annotations.ts`, `src/features/chat-trips/trip-home.ts`, and `src/features/retrieval/provenance.ts` -- server modules that currently leak UI type imports; their browser DTOs need local/contract-safe replacements.
- `package.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts` -- root Next application configuration to replace with web-workspace configuration.
- `Dockerfile` and `compose.yaml` -- web build/runtime artifact ownership.
- `vitest.config.ts` and traveler-focused tests -- test aliases and filesystem assertions bound to root `src`.
- `drizzle.config.ts` and `scripts/db-seed-data.ts` -- root paths that must use the canonical database package after the root `src` directory ceases to be the application location.
- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-03-direct-api-session-auth.md` -- authoritative direct-API architecture to preserve.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/next-env.d.ts` -- created a standalone Next workspace with its own `@/*` alias and local API development rewrites.
- [x] `apps/web/src/**` -- moved traveler routes, styles, components, direct API client, shell orchestration, and presentation helpers; replaced server/database type imports with browser-safe contract-derived types.
- [x] `apps/web/src/features/**` -- added presentation-local types and labels without `@xuyenviet/database` dependencies.
- [x] Root `package.json`, `tsconfig.json`, `next.config.ts`, and `next-env.d.ts` -- made the root an orchestrating workspace while retaining root server/domain aliases for existing tests.
- [x] `Dockerfile` and `compose.yaml` -- updated the web runner to use `apps/web` standalone output; Compose continues using the unchanged `runner` target.
- [x] `vitest.config.ts` and traveler-focused test files -- redirected direct imports and explicit source reads to `apps/web/src` while retaining root server/domain test resolution.
- [x] `drizzle.config.ts`, `scripts/db-seed-data.ts`, and affected documentation -- switched to the canonical database package schema and documented `apps/web` as the traveler presentation boundary.

**Acceptance Criteria:**
- Given the refactor is complete, when a developer runs `pnpm dev`, then the traveler Next application runs from `apps/web` and development direct API rewrites still work.
- Given a traveler opens sign-in, AI Ask, or a Trip workspace, when its browser calls an existing endpoint, then the request stays a relative direct `/auth/*` or `/v1/*` API request with no BFF route, Next server action, or database access in the web import graph.
- Given CI or Docker runs the root build, when it creates presentation artifacts, then it builds and serves `apps/web` rather than a root Next application.
- Given existing database, API, and Worker tests run, when they import root server/domain modules, then they remain unaffected by the presentation move.
- Given traveler-focused tests inspect source files, when they run, then they resolve moved paths under `apps/web/src` and continue to validate the intended UI/direct-API behavior.

## Design Notes

The existing root `src` directory is not purely traveler frontend. Its remaining database, retrieval, AI orchestration, audit, knowledge, and worker compatibility modules should remain in place for this narrowly scoped move. The web workspace may duplicate only browser-facing type declarations where no existing shared direct-API contract exports the type; extracting all server modules is separate work.

The web Docker runner should follow the existing admin pattern using Next standalone output. The web application’s production API paths intentionally remain relative because Nest’s cookie and CSRF policy relies on same-origin ingress; this refactor preserves rather than implements that deployment routing.

## Spec Change Log

- Review patch: Migration regression tests were excluded from `test:unit`. Classified the direct API, rewrite, moved-path, and writer-boundary regressions as unit tests, avoiding database-backed test setup for these infrastructure-free checks. Root-domain Vitest aliases remain intentionally separate from the web workspace; web import resolution is validated by the web typecheck and production build.

## Verification

**Commands:**
- `pnpm --filter @xuyenviet/web typecheck` -- expected: web source is type-safe without server/database imports.
- `pnpm test:unit` -- expected: traveler-focused and root infrastructure-free tests pass.
- `pnpm typecheck` -- expected: root, web, admin, API, Worker, and packages type-check.
- `pnpm build` -- expected: web, admin, API, and Worker production builds succeed.
- `git diff --check` -- expected: no whitespace errors.

## Suggested Review Order

**Web Application Boundary**

- Defines the traveler as an explicit, standalone Next workspace.
  [`apps/web/package.json:1`](../../apps/web/package.json#L1)

- Owns the web alias, Next type scope, and contract-only compilation boundary.
  [`apps/web/tsconfig.json:1`](../../apps/web/tsconfig.json#L1)

- Retains local direct-API development rewrites without production proxy behavior.
  [`apps/web/next.config.ts:1`](../../apps/web/next.config.ts#L1)

- Replaces server-derived UI types with contract-derived browser-safe types.
  [`types.ts:1`](../../apps/web/src/features/chat-trips/types.ts#L1)

**Runtime And Build Ownership**

- Makes root scripts orchestrate the new web workspace.
  [`package.json:5`](../../package.json#L5)

- Serves the web standalone artifact from the existing traveler runner target.
  [`Dockerfile:14`](../../Dockerfile#L14)

- Moves Drizzle schema resolution to its canonical database package.
  [`drizzle.config.ts:67`](../../drizzle.config.ts#L67)

**Regression Coverage**

- Runs direct API, moved-path, rewrite, and writer-boundary checks without database setup.
  [`vitest.config.ts:6`](../../vitest.config.ts#L6)

- Verifies the direct browser transport remains relative and cookie-authenticated.
  [`ai-ask-direct-api.test.ts:1`](../../tests/ai-ask-direct-api.test.ts#L1)

- Confirms development-only API rewrites moved with the web workspace.
  [`local-direct-transport.test.ts:1`](../../tests/local-direct-transport.test.ts#L1)
