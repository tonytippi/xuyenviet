---
title: 'Bound AI Ask API Stream Lifecycle'
type: 'bugfix'
created: '2026-08-07'
status: 'done'
baseline_commit: '4e7840e99715e219afe8abfb2ec4647267f87932'
review_loop_iteration: 0
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/spec-10-5-cut-ai-ask-streaming-to-the-versioned-api.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** An AI Ask API stream can remain open after it has emitted `preparing` or partial `delta` records when context preparation, the AI Gateway, or finalization never settles. The API then never reaches its recovery/finally logic, leaving the browser indefinitely in its temporary "Đang chuẩn bị câu trả lời" state.

**Approach:** Bound each API wait for the next execution chunk after stream admission. On deadline expiry, abort the execution signal, emit exactly one existing safe NDJSON `error` terminal record if the response remains writable, then close the response so the browser's established error/cleanup path runs.

## Boundaries & Constraints

**Always:** Preserve the strict NDJSON protocol, one logical submission/idempotency key, API request-disconnect abort behavior, and retry-safe retained input. Keep the API as the stream owner; use no new dependency, storage, route, configuration value, or persistence change. Use one fixed internal deadline for waiting on execution chunks, abort the existing execution controller on expiry, and write at most one safe terminal `error` record only after a valid `preparing` prefix. Ensure normal `done`, `error`, `in_progress`, caller disconnect, iterator failure, and response backpressure flows still close and clean up correctly.

**Ask First:** Expanding the fix into durable-command polling/replay UX, changing provider-specific timeout configuration, adding a public environment variable, or changing idempotency semantics.

**Never:** Do not issue a second command automatically, emit an `error` before a valid `preparing` prefix, emit an additional terminal after `done`, `error`, or `in_progress`, expose provider/transport detail, or modify unrelated browser/chat/trip UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal completion | Valid stream terminates with `done` before deadline | Persisted answer reconciles into UI, input clears, temporary card is removed | Existing completion behavior |
| Terminal stream failure | Valid `preparing` followed by `error` before deadline | Temporary card is removed and submitted question remains for retry | Existing safe Vietnamese failure copy |
| Stalled execution | API has sent `preparing` or `delta`, but its next execution chunk does not settle by the fixed deadline | API aborts execution, writes one safe `error` terminal, then ends the response; browser clears temporary state through its existing error flow | No provider, timeout, or internal detail reaches the browser |
| Caller disconnect | Browser closes response before deadline | Existing API abort path ends execution without attempting a recovery write | No terminal write to a closed response |

</frozen-after-approval>

## Code Map

- `apps/api/src/ai-ask/ai-ask.controller.ts` -- owns the execution iterator, API abort controller, raw NDJSON framing, safe recovery terminal, and response closure.
- `packages/database/src/ai-ask-stream-execution.ts` -- receives the API abort signal while preparing context, calling the AI Gateway, and finalizing the command.
- `packages/database/src/gateway.ts` -- propagates the execution abort signal to the AI Gateway request.
- `tests/ai-ask-api-adapter.test.ts` -- existing API adapter framing, abort, failure, and terminal-response coverage.
- `tests/ai-ask-direct-api.test.ts` -- browser protocol client coverage confirming the API terminal error reaches the normal recovery path.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/ai-ask/ai-ask.controller.ts` -- race each post-admission `iterator.next()` wait against one fixed server-side deadline; on deadline, abort the existing execution signal and transition into the current safe recovery/response-close path -- guarantees API terminalization even when upstream work never settles.
- [x] `apps/api/src/ai-ask/ai-ask.controller.ts` -- ensure timeout recovery writes exactly one existing safe `error` frame only after a valid `preparing` prefix, suppresses it after any terminal or caller disconnect, and always ends the response -- preserves wire contract and prevents duplicate terminal events.
- [x] `tests/ai-ask-api-adapter.test.ts` -- add fake-timer/deferred-execution coverage for a valid `preparing` prefix followed by a held `next()` promise -- prove abort propagation, one safe `error` frame, and response closure at deadline.
- [x] `tests/ai-ask-api-adapter.test.ts` -- cover timeout before a valid prefix and after an existing terminal -- prove no invalid/duplicate recovery terminal is written.

**Acceptance Criteria:**
- Given an API stream has emitted a valid `preparing` prefix and its execution does not provide the next chunk by the fixed deadline, when the deadline expires, then the API aborts the execution signal, sends exactly one existing safe `error` NDJSON record, and ends the HTTP response.
- Given an API stream has not emitted a valid `preparing` prefix, already emitted `done`, `error`, or `in_progress`, or its caller disconnected, when the deadline expires, then the API sends no recovery terminal record and performs no duplicate write.
- Given the API aborts the held execution after a valid prefix, when the browser receives the safe terminal `error`, then its existing client/composer error path removes temporary preparation UI and keeps the submitted question available for retry.
- Given a stream reaches any existing terminal state before the deadline, when response cleanup runs, then the deadline no longer can abort the completed execution or affect a later request.

## Design Notes

The deadline belongs in the API controller because it owns the admitted execution iterator and must uphold the streamed protocol's terminal guarantee. A fixed internal ceiling avoids adding operational configuration for a recovery path. The existing safe terminal frame is reused so browser code receives its established error event and handles UI cleanup without a new client-side state protocol.

## Verification

**Commands:**
- `pnpm exec vitest run --project unit --testNamePattern "AI Ask API adapter|direct traveler API client"` -- passed: 38 focused tests passed; 234 unrelated unit tests skipped by name filter.
- `pnpm typecheck` -- passed: root, web, admin, worker-domain, API, and worker TypeScript checks passed.
- `git diff --check` -- passed: no whitespace errors.

## Implementation Notes

- The API controller now bounds every execution iterator wait at 195 seconds, exceeding the AI Gateway's existing 180-second maximum timeout so it only recovers genuinely stalled execution.
- A timeout aborts the existing execution signal. If a complete valid `preparing` prefix was forwarded and no terminal was sent, the existing safe error frame is written before the response ends. Caller disconnects and incomplete/invalid prefixes still close silently.
- `tests/ai-ask-api-adapter.test.ts` is now part of the infrastructure-free Vitest unit project. It neither reads nor mutates PostgreSQL and previously failed to run because integration setup always attempted database migration.

## Suggested Review Order

**API Lifecycle**

- Bound each execution wait, abort stalls, and distinguish caller disconnects from API deadlines.
  [`ai-ask.controller.ts:30`](../../apps/api/src/ai-ask/ai-ask.controller.ts#L30)

- Write one safe terminal only for a valid connected stream and close promptly.
  [`ai-ask.controller.ts:97`](../../apps/api/src/ai-ask/ai-ask.controller.ts#L97)

- Race chunk progress, deadline, and caller abort while clearing timer/listener resources.
  [`ai-ask.controller.ts:116`](../../apps/api/src/ai-ask/ai-ask.controller.ts#L116)

**Regression Coverage**

- Verify stalled execution emits a safe terminal and propagates abort to upstream work.
  [`ai-ask-api-adapter.test.ts:135`](../../tests/ai-ask-api-adapter.test.ts#L135)

- Verify no terminal write and no blocked cleanup when callers disconnect during a stall.
  [`ai-ask-api-adapter.test.ts:199`](../../tests/ai-ask-api-adapter.test.ts#L199)

- Run the database-free adapter suite through the unit project.
  [`vitest.config.ts:25`](../../vitest.config.ts#L25)
