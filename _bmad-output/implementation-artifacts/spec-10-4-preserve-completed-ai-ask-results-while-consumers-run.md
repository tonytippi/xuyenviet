---
title: 'Story 10.4: Preserve Completed AI Ask Results While Consumers Run'
type: 'feature'
created: '2026-07-29'
status: 'done'
baseline_revision: '58eac68'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/10-4-preserve-completed-ai-ask-results-while-consumers-run.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** A completed AI Ask result is durable and trustworthy, but optional outbox consumers have no safe traveler-facing status projection. The normal conversation read also performs provider-backed annotation backfill and persistence, bypassing the fenced, idempotent worker protocol.

**Approach:** Add a narrow owner-scoped, read-only consumer-status projection for completed commands and render it only beside the associated persisted assistant answer. Retire normal-read annotation backfill so optional enrichment remains exclusively on the durable consumer path.

## Boundaries & Constraints

**Always:** Query a command by server-derived owner plus command/message identity, then derive only matching owner outbox status. Map the three v1 events to `context_extraction`, `answer_annotation`, and `trip_proposal_draft`; normalize `pending`/`processing` to pending, preserve `failed` as generic failed, and omit completed/fenced-out rows. Do not expose IDs, payloads, errors, attempts, timestamps, claims, leases, fences, or diagnostics. Completed command/result, assistant content, provenance, and initial usage are immutable primary outcomes. Preserve the Story 10.3 outbox schema, claims, locks, CAS, effects, retries, and consumer writes. Keep Vietnamese-first, supplemental, accessible UI with no polling, worker call, submit/navigation block, or URL command authority.

**Block If:** The existing owner-scoped command/message data cannot associate a displayed assistant message with a completed command without browser-provided command or outbox identifiers.

**Never:** Do not add a generic queue API, post-consumer terminalization, provider/write side effect during shell reads, external queue, browser redrive, transport changes owned by Story 10.5, or Epic 11 annotation/provenance contract changes. Do not retain read-time annotation generation for outbox-governed AI Ask answers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Completed answer with queued work | Owned completed command and matching pending/processing event | Existing answer renders immediately with one mapped optional-pending category | No worker/provider/write is invoked |
| Consumer terminal failure | Owned completed command and matching failed event | Existing answer remains available with generic optional-failure category | Raw failure code and operational details are omitted |
| Completed or foreign work | Completed/fenced-out event, foreign owner, unrelated command, no project | No consumer indicator; no cross-owner/resource disclosure | Proposal category is omitted for project-less commands |
| Deleted/scrubbed command | Command or operational rows removed/scrubbed | No historic consumer state or deleted-content reference | Read returns no projection |
| Normal shell read | Assistant with provenance and no stored annotations | Stored annotations are sanitized and rendered only; no AI model/provider/persistence backfill | Durable worker remains the only enrichment writer |

</intent-contract>

## Code Map

- `src/features/ai/ai-ask-commands.ts` -- owner-scoped command identity/finalization boundary; host the safe completed-command consumer-status read.
- `src/features/chat-trips/conversations.ts` -- remove provider-backed annotation generation and persistence from normal owned-conversation reads while retaining stored annotation sanitation.
- `src/app/ai-ask/page.tsx` -- derive associated statuses from server-loaded displayed assistant messages and pass display-only data to the composer.
- `src/features/ai/ai-ask-composer.tsx` -- render Vietnamese supplemental pending/failed status beside persisted assistant content without changing submission or done state.
- `tests/ai-ask-commands.test.ts`, `tests/domain-outbox.test.ts` -- PostgreSQL owner/status/deletion/immutability coverage.
- `tests/chat-trip-context-extraction.test.ts`, `tests/ai-ask-shell.test.ts` -- immediate terminal result, no-read-backfill, and shell non-regression coverage.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/ai-ask-commands.ts` -- add a server-only owner-scoped completed-command projection keyed by server-derived assistant-message identity; return only stable category/state pairs -- preserve terminal immutability and avoid operational disclosure.
- [x] `src/features/chat-trips/conversations.ts` -- remove read-time model selection, annotation generation, and message persistence; retain sanitation of stored annotations -- make normal conversation reads read-only and worker-owned enrichment exclusive.
- [x] `src/app/ai-ask/page.tsx` and `src/features/ai/ai-ask-composer.tsx` -- associate safe statuses only with rendered completed assistant messages and display accessible Vietnamese optional-work copy -- preserve answer/provenance/feedback and existing original-key replay UX.
- [x] `tests/ai-ask-commands.test.ts` and `tests/domain-outbox.test.ts` -- cover category mapping, pending/failed normalization, omission, owner/project isolation, non-disclosure, deletion/scrubbing, and terminal snapshot stability under consumer outcomes -- prove the safe read boundary.
- [x] `tests/chat-trip-context-extraction.test.ts` and `tests/ai-ask-shell.test.ts` -- cover immediate done behavior through delayed/retried/fenced/failed delivery, no shell provider/write backfill, and supplemental UI states -- protect consumer isolation and UI behavior.
- [x] Story and sprint artifacts -- record implementation/review/verification evidence; set only Story 10.4 and its exact sprint entry to done after final approved review -- preserve authoritative BMad state.

**Acceptance Criteria:**
- Given a terminal AI Ask command is completed, when optional consumers are delayed, retried, fenced out, or fail, then command and terminal assistant/provenance/usage state remain unchanged and the owner sees only relevant safe pending/failed consumer status.
- Given a stale owner fence, dedupe guard, or lease token reaches a consumer, when it attempts delivery, then it makes no mutation or duplicate effect and records only the existing safe operational outcome.
- Given an ambiguous browser reconnect uses the original key, when the shell reloads persisted command/conversation state, then it never creates a replacement command/key and reconciles to the existing terminal or in-progress view.

## Spec Change Log

## Review Triage Log

### 2026-07-29 — Review passes
- intent_gap: 0
- bad_spec: 0
- patch: 10 (high 0, medium 6, low 4)
- defer: 0
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Bounded and deduplicated status categories, with failed precedence for conflicting durable rows.
  - `[medium]` `[patch]` Added immutable terminal-result worker outcome, deletion/scrubbing, exact project proposal mapping, and shell omission regressions.
  - `[medium]` `[patch]` Isolated optional-status live announcements to actual post-load transitions and retained clearing announcements.
  - `[medium]` `[patch]` Capped server input collection before allocation/query and excluded unsupported event types.

## Auto Run Result

- Status: done
- Summary: Added a bounded owner-scoped consumer-status projection, removed normal-read annotation backfill, and rendered safe supplemental consumer state in the URL-owned AI Ask shell.
- Review: Synchronous Blind Hunter, Edge Case Hunter, and acceptance layers completed. Final review reported no findings and acceptance was clean after bounded repairs.
- Verification: Serial PostgreSQL suites passed 49 + 130 + 176 tests; typecheck and build passed; lint had zero errors and five pre-existing warnings; diff check passed.
- Residual risk: Worker deployment, scheduling, and operational rollout evidence remain Story 12 scope.

## Design Notes

The projection returns only status pairs, not a second terminal-result shape: `getOwnedConversation` already supplies the safe persisted answer, provenance, annotations, and feedback for the URL-owned shell. The page derives message identity from that server-owned read, and the command helper validates ownership and completed command state before selecting only `event_type` and durable status. This minimizes browser authority and operational data exposure.

## Verification

**Commands:**
- `pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts` -- expected: consumer read and immutable terminal state integration coverage passes.
- `pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/chat-trip-context-extraction.test.ts tests/ai-ask-sessions.test.ts tests/answer-context.test.ts` -- expected: worker and immediate route behavior pass.
- `pnpm vitest run --no-file-parallelism --maxWorkers=1 tests/ai-ask-shell.test.ts tests/bff-transport.test.ts tests/api-platform-contract.test.ts tests/api-request-principal.integration.test.ts` -- expected: shell and protected transport regressions pass.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm build` -- expected: production build passes.
- `git diff --check` -- expected: no whitespace errors.
