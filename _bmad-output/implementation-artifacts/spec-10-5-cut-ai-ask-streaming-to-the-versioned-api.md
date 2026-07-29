---
title: 'Story 10.5: Cut AI Ask Streaming to the Versioned API'
type: 'feature'
created: '2026-07-29'
status: 'done'
baseline_revision: '945b619'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: '9259cab'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/10-5-cut-ai-ask-streaming-to-the-versioned-api.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The Next route is the sole AI Ask writer, so the protected versioned API cannot own the stream while preserving the browser's byte-compatible NDJSON protocol and the completed Story 10.1-10.4 persistence guarantees.

**Approach:** Extract one runtime-neutral AI Ask execution seam, expose it through protected Nest `POST /v1/ai-ask/stream`, and make the public Next route an authenticated CSRF-protected byte relay selected by an explicit capability cutover before command admission.

## Boundaries & Constraints

**Always:** Preserve existing command admission/replay, owner fences, atomic terminal assistant/provenance/usage/source-bundle completion, discarded/refresh-required, transactional outbox, and immutable consumer state through owning APIs only. Use validated `x-request-id` request/response headers and safe telemetry for correlation; retain legacy NDJSON event objects exactly, with UTF-8 `JSON.stringify(event) + "\n"` bytes and no request-ID member. Validate 1-2000-character normalized questions, 6 MiB request, and JPEG/PNG/WebP image rules before admission/provider work. Nest receives bearer principal only, never browser cookies; BFF validates host session, exact origin, and signed double-submit CSRF before minting its credential. Select exactly one writer before acceptance, never fall back, dual-stream, dual-write, shadow-execute, or buffer/re-serialize NDJSON.

**Block If:** Moving the use case requires a durable schema change or cannot preserve the existing fenced command/finalization/outbox ownership APIs without a second persistence implementation.

**Never:** Do not import root `src/`, Next, Auth.js, server-only, or route/action modules from Nest. Do not expose credentials, cookies, private origin, question/answer/image/prompt/source/provider content, SQL, stacks, idempotency keys, or terminal payload telemetry. Do not claim deployed routing/probe/migration/public rollback evidence owned by Epic 14.2, and do not modify another story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New authorized command | Valid BFF session/CSRF, bearer API request, multipart body, idempotency key | One selected API writer emits `preparing`, zero or more `delta`, and exactly one terminal byte-compatible event | API/BFF set NDJSON/no-store/request-ID headers without credentials |
| Pending or terminal replay | Same owner/scope/key/digest command exists | One retained `in_progress` or terminal event; no provider or persistence duplication | Safe persisted projection only |
| Validation/auth failure before stream | Missing/invalid credential, key, body, ownership, origin, or CSRF | Safe API envelope, locally projected Vietnamese BFF response | No credential minting/admission/provider work on BFF validation failure |
| Provider failure, caller abort, or stale fence | Execution has begun then terminalizes or disconnects | Existing atomic-or-absent terminal semantics; `refresh_required` clears transient content | Abort reaches supported work; post-start failure is one safe NDJSON terminal error |
| Capability disabled/enabled | Valid BFF request before admission | Disabled invokes only compatible legacy writer; enabled invokes only API relay | No retry or fallback to the other writer |

</intent-contract>

## Code Map

- `packages/contracts/src/index.ts` -- versioned validated stream input, event contract, and shared runtime-neutral types without event request IDs.
- `packages/domain/src/index.ts` and `packages/database/src/index.ts` -- approved cross-runtime use-case/port seam, if needed to keep Nest independent of root Next modules.
- `src/features/ai/ai-ask-commands.ts`, `src/features/ai/*` -- existing owned command, fenced finalization, source/retrieval/gateway/usage/outbox behavior to reuse behind the extracted execution adapter.
- `src/app/api/ai-ask/stream/route.ts` -- retain public BFF boundary, selecting the single writer then relaying or using the compatible disabled path.
- `src/server/bff-api-client.ts`, `src/server/bff-credentials.ts`, `src/server/csrf.ts`, `src/server/correlation-id.ts` -- private streaming client, credential and request-boundary enforcement.
- `apps/api/src/ai-ask/*`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts` -- bearer-only Nest controller and composition, using the global principal, request ID, safe filter, and workspace-only imports.
- `tests/api-platform-contract.test.ts`, `tests/api-request-principal.integration.test.ts`, `tests/bff-transport.test.ts`, `tests/ai-ask-shell.test.ts`, `tests/answer-context.test.ts` -- raw-byte API/BFF, security, routing, and persistence regression coverage.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/index.ts` and approved workspace seams -- define validated versioned multipart input and runtime-neutral stream execution interfaces while retaining the exact legacy event union -- allow both runtimes to share contract without a Nest-to-root import.
- [x] AI-owned execution modules and adapters -- extract the legacy orchestration into one principal/correlation/abort-driven use case that delegates to existing command, finalization, retrieval, provider, provenance, usage, and outbox owners -- preserve Stories 10.1-10.4 without duplicate SQL/persistence paths.
- [x] `apps/api/src/ai-ask/*`, `apps/api/src/app.module.ts`, and `apps/api/src/main.ts` -- register protected `POST /v1/ai-ask/stream`, validate bounded multipart input, adapt abort, and write raw NDJSON bytes/headers -- make Nest the enabled writer with safe pre/post-stream error behavior.
- [x] `src/server/bff-api-client.ts` and `src/app/api/ai-ask/stream/route.ts` -- add an abort-aware streaming private client and reduce the public route to session/CSRF/origin validation plus direct byte relay -- keep tokens/cookies/private origin out of browsers and remove enabled legacy orchestration.
- [x] `packages/config/src/index.ts` and routing seams -- add validated disabled-by-default capability selection and safe owner/correlation telemetry -- prove one writer accepts each request without fallback.
- [x] `tests/api-platform-contract.test.ts`, `tests/api-request-principal.integration.test.ts`, and `tests/bff-transport.test.ts` -- test bearer/no-CORS/request-ID/key/body validation, raw bytes and headers, streaming/abort/timeout, safe errors, and non-disclosure -- prove both protected boundaries.
- [x] `tests/ai-ask-shell.test.ts`, `tests/answer-context.test.ts`, and command/outbox suites -- migrate legacy-writer coverage to API/BFF seams and prove replay, provider failure, abort, fence discard, dispatch failure, atomicity, and enabled/disabled routing -- prevent duplicate effects and protocol regressions.
- [x] Story and sprint artifacts -- record actual implementation/review/verification evidence and synchronize only Story 10.5 to done after approved review -- retain authoritative BMad history.

**Acceptance Criteria:**
- Given an authenticated BFF request with a valid idempotency key, when it calls `POST /v1/ai-ask/stream`, then Nest owns the enabled stream and BFF forwards correlation, timeout, abort, and unmodified NDJSON without exposing its credential; events remain byte-compatible `preparing`, zero or more `delta`, then exactly one `done` or `error`.
- Given browser abort, provider failure, or context-extraction dispatch failure, when the command terminalizes, then supported provider work stops and terminal assistant/provenance/usage state is atomically persisted or absent; the BFF exposes only safe retry or `refresh_required` recovery.
- Given API stream protocol/integration coverage passes and the cutover is enabled, when the matching scope is invoked, then only the API writer accepts it; disabled routing invokes only the compatible legacy writer and no accepted request crosses writers.

## Spec Change Log

## Review Triage Log

### 2026-07-29 - Blocked before review
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- Blocking condition: the sole AI Ask execution remains root Next runtime code. Nest cannot import it under the authoritative dependency boundary, and implementing a second persistence path would violate the story.

### 2026-07-29 - Authorized coordinated extraction resumed
- The product owner explicitly authorized continuation on the existing dirty worktree and the coordinated extraction needed to move the transaction-owning execution and its dependencies into approved workspace boundaries.
- The former bounded-extraction blocking condition is superseded for this run. The implementation must still retain one atomic command/finalization persistence path, with no root `src/` import from `apps/api` and no new workspace package.

### 2026-07-29 - Final implementation and review
- intent_gap: 0
- bad_spec: 0
- patch: 13 (high 7, medium 6)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Moved the complete command, fenced finalization, retrieval, gateway, provenance, usage, and outbox closure to `@xuyenviet/database`, retaining root compatibility re-exports and a single transaction path.
  - `[high] [patch]` Repaired API abort lifecycle, bounded bridge/backpressure, strict multipart framing, pre-stream safe error classification, and exact terminal stream behavior.
  - `[medium] [patch]` Added BFF pre-header timeout behavior, safe selected-owner telemetry, session-before-minting, and shared CSRF/origin enforcement for both routing states.
  - `[medium] [patch]` Migrated API/BFF and legacy route tests to the package-owned execution seam and added raw-byte, routing, abort, timeout, and CSRF regressions.

### 2026-07-29 - Epic 10 completion-review targeted repair
- intent_gap: 0
- bad_spec: 0
- patch: 4 (high 2, medium 2)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Selected the disabled legacy owner before loading API-only private transport configuration, preserving shared CSRF validation without `XV_PRIVATE_API_URL`.
  - `[high] [patch]` Kept BFF timeout active through the stream lifetime and made API/BFF raw-frame relays produce exactly one safe terminal while cancelling upstream work on timeout.
  - `[medium] [patch]` Repaired API iterator/write truncation, incomplete-frame handling, root-terminal detection, and post-terminal byte suppression.
  - `[medium] [patch]` Added authenticated CSRF-valid BFF-to-live-Nest PostgreSQL integration coverage for byte relay, ordering/non-disclosure, abort, provider failure, stale fence, dispatch failure, atomic persistence, and replay.

## Auto Run Result

- Status: done
- Implementation: repaired the selected-owner boundary and raw NDJSON frame relays without changing the header-only `x-request-id` protocol or the one shared PostgreSQL execution/persistence path.
- Transport: disabled compatibility routing does not require API-only configuration; enabled BFF timeout covers the full response and cancels upstream work. API/BFF frame complete records, recognize only root `done`/`error` terminals, discard incomplete fragments and post-terminal bytes, and emit a canonical safe terminal exactly once where recovery is possible.
- Review: synchronous blind, edge-case, and acceptance reviews repaired all four Epic 10 completion-review findings. The final blocking reviews reported no actionable high or medium findings.
- Verification: serial focused suites passed: API/BFF 47 tests, command/outbox/context 169 tests, and shell/session 154 tests. `pnpm typecheck`, `pnpm build`, and `git diff --check` passed. `pnpm lint` had zero errors and five pre-existing warnings.

## Design Notes

The stream contract is intentionally header-correlated, not event-correlated. The API request-ID middleware is authoritative: BFF forwards its validated/generated ID upstream and returns the API response header, while the byte body remains opaque. The execution seam receives only validated domain input, `RequestPrincipal`, correlation ID, and `AbortSignal`; HTTP adapters own parsing and raw writes, and existing feature owners retain all mutation transactions.

## Verification

**Commands:**
- `pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/api-platform-contract.test.ts tests/api-request-principal.integration.test.ts tests/bff-transport.test.ts` -- expected: protected API/BFF raw-byte, request-ID, abort, and safe-boundary coverage passes.
- `pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/ai-ask-commands.test.ts tests/domain-outbox.test.ts tests/chat-trip-context-extraction.test.ts tests/answer-context.test.ts` -- expected: PostgreSQL command/fence/outbox and API execution invariants pass.
- `pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/ai-ask-shell.test.ts tests/ai-ask-sessions.test.ts` -- expected: public BFF URL, original-key replay, stream parsing, recovery, and routing coverage passes.
- `pnpm typecheck` -- expected: strict workspace TypeScript passes.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm build` -- expected: application and API build pass.
- `git diff --check` -- expected: no whitespace errors.
