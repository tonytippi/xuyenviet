---
title: 'Restore operator-controlled Facebook and YouTube capture CLIs'
type: 'feature'
created: '2026-08-05'
status: 'done'
baseline_commit: '67f3f96'
review_loop_iteration: 0
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** `facebook:capture` and `youtube:capture` were removed with their root entrypoints during the legacy runtime retirement, although their package-owned capture logic, cache migration, persisted capture model, and operator workflows remain present. Operators currently have no supported command to process queued Facebook sources or YouTube videos.

**Approach:** Restore the two explicit, interactive operator CLIs and their package scripts using the retained implementation behavior, adapted only to current package ownership. Restore cache migration access and accurate operational documentation without moving capture into the continuous Worker.

## Boundaries & Constraints

**Always:** Preserve cache-first capture, immutable capture versions, existing system audit attribution, confirmation-by-default, separate `DATABASE_URL` and `CAPTURE_CACHE_DATABASE_URL`, and the existing bounded `--source-id`, `--limit`, and `--yes` CLI behavior. Keep Facebook headed and operator-controlled; keep Gemini and YouTube credentials server/operator-only. Restore commands with `node --conditions react-server --import tsx` so `server-only` contracts remain satisfied.

**Ask First:** Stop before adding a dependency, changing a migration/schema, changing capture semantics, enabling capture in the continuous Worker or a scheduler, or supporting a durable production database upgrade beyond the existing capture model.

**Never:** Do not add unattended Facebook scraping, browser credential storage, direct database writes outside the existing capture domain APIs, public/request-path capture endpoints, a Worker capture adapter, or compatibility fallbacks to retired root source modules.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Facebook operator capture | A queued Facebook source, initialized distinct capture cache, and an operator browser session | `pnpm facebook:capture` replays cache or opens a headed browser, asks before persistence unless `--yes`, then writes through the current capture API | Stops safely for login/checkpoint pages and records bounded source failures |
| YouTube operator capture | A queued canonical YouTube URL and initialized distinct cache | `pnpm youtube:capture` replays cache or obtains duration and analyzes bounded sequential video windows | Requires provider keys only on cache misses; records a bounded safe failure reason |
| Invalid command input | Unsupported argument or a limit outside 1-25 | Command rejects input before capture work starts | Emits a safe usage error and exits nonzero |
| Cache not initialized | Cache database lacks expected schema version | Both capture commands refuse to mutate product data | Operator runs `pnpm capture-cache:migrate` first |

</frozen-after-approval>

## Code Map

- `scripts/facebook-capture.ts` -- restored operator-facing Playwright capture entrypoint, adapted from the pre-retirement implementation to package imports.
- `scripts/youtube-capture.ts` -- restored Gemini/YouTube operator capture entrypoint, adapted from the pre-retirement implementation to package imports.
- `scripts/capture-cache-migrate.ts` -- retained cache-schema migration entrypoint that must again be callable from root scripts.
- `scripts/db-env.ts` -- shared environment and distinct-database safeguards used by both restored CLIs.
- `packages/worker-domain/package.json` -- explicit public subpath exports for retained capture domain modules consumed by the root CLIs.
- `package.json` -- root commands for Facebook capture, YouTube capture, and cache migration.
- `tests/facebook-capture-script.test.ts`, `tests/youtube-capture.test.ts`, `vitest.config.ts` -- restored focused behavior coverage and correct unit/integration classification.
- `docs/runbooks/facebook-capture.md`, `docs/runbooks/youtube-capture.md`, `.env.example` -- active operator instructions and required configuration, replacing retirement claims.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/facebook-capture.ts` and `scripts/youtube-capture.ts` -- restored the prior operator CLI behavior using current package-owned database and capture module imports -- restores supported operations without duplicating domain logic.
- [x] `packages/worker-domain/package.json` -- exposed the five capture-domain modules required by the root CLI entrypoints -- preserves an explicit package boundary rather than importing package internals.
- [x] `package.json` -- restored `facebook:capture`, `youtube:capture`, and `capture-cache:migrate` with the prior React-server runtime condition -- makes restored entrypoints safely invokable.
- [x] `tests/facebook-capture-script.test.ts`, `tests/youtube-capture.test.ts`, and `vitest.config.ts` -- restored focused regression coverage and classified database-backed YouTube tests as integration -- proves command parsing and capture behavior without weakening database test boundaries.
- [x] `docs/runbooks/facebook-capture.md`, `docs/runbooks/youtube-capture.md`, and `.env.example` -- replaced obsolete retirement instructions with prerequisites, command usage, operator boundaries, and cache initialization; `.env.example` already contained accurate active configuration -- prevents unsupported operational substitutions.

**Acceptance Criteria:**
- Given an operator has configured distinct PostgreSQL product and cache databases and migrated the cache, when they invoke either restored command with valid bounded options, then the CLI uses the existing package capture APIs and retains cache-first, confirmation-by-default behavior.
- Given a capture command is run without cache initialization, provider configuration needed for a cache miss, or valid CLI arguments, when it reaches the relevant prerequisite, then it fails safely without direct ad-hoc product database writes or secret disclosure.
- Given the bundled Worker is started, when operator capture commands are restored, then the Worker still owns only extraction, ingestion, indexing, sampling, and outbox work; it does not acquire capture loops.
- Given an operator follows either runbook, when they set up and run capture, then documentation names the exact supported command, the separate cache migration prerequisite, and the no-unattended-capture boundary.

## Design Notes

The prior CLI source is the behavioral baseline. Its imports must move from the retired root feature tree to explicit `@xuyenviet/database` and `@xuyenviet/worker-domain/features/knowledge/*` exports. This is a boundary migration, not a reimplementation of capture behavior.

The root CLIs deliberately remain outside `apps/worker`: Facebook needs a local headed persistent browser profile and both CLIs are intentional, bounded operator commands. The existing Worker has no capture adapter and must not gain one as part of this restoration.

## Verification

**Commands:**
- `pnpm test:unit -- tests/facebook-capture-script.test.ts` -- expected: capture argument, pacing, and safe stop behavior passes without database configuration.
- `pnpm test:integration -- tests/youtube-capture.test.ts` -- expected: serial database-backed YouTube capture behavior passes with `DATABASE_URL_TEST`.
- `pnpm typecheck` -- expected: restored entrypoints and exported capture modules compile across workspaces.
- `pnpm lint` -- expected: no new lint errors in restored scripts or documentation-adjacent code.
- `git diff --check` -- expected: no whitespace errors.

## Completion Notes

- Restored the explicit Facebook and YouTube operator commands plus capture-cache migration access. The continuous Worker remains unchanged and does not own capture work.
- Review repairs require confirmation before every cache replay or product write, select a permalink-matched Facebook post where available, use visible `innerText` only, and reject oversized cache strings rather than truncating capture content.

## Verification Limitations

- `pnpm test:integration -- tests/youtube-capture.test.ts` could not run because integration global setup fails while `pnpm exec drizzle-kit migrate` applies the configured test database migrations. Vitest exits before test discovery. Unit, typecheck, lint, CLI `--help`, and diff checks passed.

## Review Triage Log

### 2026-08-05 - Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 5 repaired: confirmation for Facebook and YouTube aggregate cache replays; no live YouTube segment-cache write before confirmation; target-permalink Facebook selection; visible-only Facebook text selection; oversized cache-string rejection.
- defer: 2: production-only dependency placement for `tsx`/Playwright, and ambiguous Gemini timestamp convention in a nonzero video window. Both predate this restoration and require separate dependency/provider-contract decisions.
- reject: 2: Facebook failure durability is existing domain behavior, and a YouTube Data API key in the provider-required request URL cannot be moved without a provider/API contract change.

## Suggested Review Order

**Operator Entry Points**

- Restore explicit bounded commands without making capture a Worker responsibility.
  [`package.json:21`](../../package.json#L21)

- Facebook confirms every persistence path and captures visible target content only.
  [`facebook-capture.ts:513`](../../scripts/facebook-capture.ts#L513)

- YouTube delays live cache writes until the operator confirms evidence.
  [`youtube-capture.ts:257`](../../scripts/youtube-capture.ts#L257)

**Domain Boundary**

- Export capture modules explicitly instead of importing worker-domain internals.
  [`package.json:5`](../../packages/worker-domain/package.json#L5)

- Reject oversized artifacts rather than silently truncating captured source material.
  [`capture-cache.ts:82`](../../packages/worker-domain/src/features/knowledge/capture-cache.ts#L82)

**Operational Guidance And Tests**

- Document cache setup, manual browser operation, and no-scheduler constraints.
  [`facebook-capture.md:3`](../../docs/runbooks/facebook-capture.md#L3)

- Keep lightweight Facebook behavior checks separate from database-backed YouTube coverage.
  [`facebook-capture-script.test.ts:5`](../../tests/facebook-capture-script.test.ts#L5)
