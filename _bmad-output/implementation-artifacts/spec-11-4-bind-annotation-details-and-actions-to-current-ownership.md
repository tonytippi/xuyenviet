---
title: 'Bind Annotation Details and Actions to Current Ownership'
type: 'feature'
created: '2026-07-30'
status: 'done'
baseline_revision: '615ef9da17c81da1f6202562afc252f6d26d9088'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: 'PENDING_COMMIT'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/11-4-bind-annotation-details-and-actions-to-current-ownership.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Historic answer annotations are hostile persisted intent, not authority. Their details must not revive withdrawn source material, and their planning actions must never reveal or mutate a stale, foreign, or browser-selected proposal.

**Approach:** Extend the existing annotation sanitizer, owned conversation read model, proposal commands, and existing inspector UI so only bounded formatter-derived details and current server-derived proposal capabilities are exposed and executed.

## Boundaries & Constraints

**Always:** Keep `answer-annotations.ts` as the sole persisted-JSON validation boundary; provider proposals never create actions. Permit only forward `trip_change_proposal.apply` and `.dismiss` actions with normal final-message binding, a safe answer-anchored label, and exactly `arguments: {}`; legacy actions stay permanently non-executable. Rebuild source details only from scoped `formatAssistantMessageProvenance` output. Resolve action authority from the authenticated owner, owned conversation, assistant message, conversation-selected project, annotation ID, command, and exactly one current pending proposal matching `sourceAssistantMessageId`; browser and JSON never supply target IDs. Revalidate the same binding under existing locks immediately before mutation.

**Block If:** The supplied requirements cannot be met without changing the story or sprint-status artifacts, a migration, a public/API/BFF endpoint, or an unrelated direct proposal workspace path.

**Never:** Do not inspect raw snapshots/provider payloads, parse answer prose, create a generic entity/action transport/store, derive client routes or targets, add direct database mutation, call a provider on detail/action paths, or expose a withdrawn/foreign/ambiguous descriptor or capability.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Safe descriptor read | Valid stored descriptor and available scoped provenance | Only allowlisted safe fields and six trimmed 160-char facts render | Invalid fields/descriptors are omitted; answer remains |
| Current proposal action | Valid registered owner-context descriptor and one pending matching proposal | Read model returns only safe `{ command, label, available: true }`; action delegates to existing command | No proposal target leaves the server |
| Withdrawal or ambiguity | Withdrawn provenance, foreign/missing state, or zero/multiple matching pending proposals | No source detail/capability and no mutation | `not_found` without existence disclosure |
| Stale execution | Capability changes while acquiring command locks | Binding/current state is rechecked before write | Existing `refresh_required`/`expired` semantics; no partial mutation |

</intent-contract>

## Code Map

- `src/features/ai/answer-annotations.ts` -- persisted descriptor sanitizer, source-detail projection, and forward action schema.
- `src/features/chat-trips/conversations.ts` -- authenticated conversation/provenance read and current proposal-capability resolution.
- `src/features/chat-trips/actions.ts` -- typed server-action boundary and safe result projection.
- `src/features/chat-trips/trip-change-proposals.ts` -- locked, owner-confirmed proposal mutation commands.
- `src/features/ai/ai-ask-composer.tsx` -- transient selected-detail UI and server-resolved action consumer.
- `tests/answer-annotations.test.ts`, `tests/ai-ask-shell.test.ts`, `tests/trip-change-proposals.test.ts` -- security, read, UI, and execution regressions.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/ai/answer-annotations.ts` -- define exact forward action and bounded safe-detail schemas; reject unknown commands, non-empty arguments, stored targets/routes/capabilities/raw fields, unsafe URLs, and executable legacy guidance while preserving provider-action rejection and formatted-provenance-only reconstruction.
- [x] `src/features/chat-trips/conversations.ts` -- resolve safe details and at most one current capability from the existing owned conversation, formatted provenance, selected project, annotation binding, and proposal `sourceAssistantMessageId`; fail closed for withdrawal, ownership, and ambiguity.
- [x] `src/features/chat-trips/actions.ts` and `src/features/chat-trips/trip-change-proposals.ts` -- add one annotation-action entrypoint accepting only conversation/message/annotation/command and enforce descriptor/provenance/project/proposal binding before and under existing mutation locks before delegating only apply/dismiss.
- [x] `src/features/ai/ai-ask-composer.tsx` and existing page wiring -- render controls only from resolved safe capabilities, invoke the fixed server entrypoint, and retain selected-detail, keyboard, focus, and mobile behavior without client-derived authority.
- [x] `tests/answer-annotations.test.ts`, `tests/ai-ask-shell.test.ts`, and `tests/trip-change-proposals.test.ts` -- cover allowlists, action shape, legacy compatibility, ownership/withdrawal/ambiguity, target substitution, lock-time stale state, ordinary prose, and inspector accessibility boundaries.

**Acceptance Criteria:**
- Given persisted descriptors, when a safe detail projection is built, then it contains only the authoritative allowlist and no more than six trimmed non-empty 160-character quick facts; raw/provider/operator fields and unsafe URLs are absent.
- Given a registered annotation action, when its owning read model resolves it for the current traveler, then only a current uniquely bound safe capability is exposed and its command validates typed input, authorization, ownership, provenance eligibility, and binding before mutation.
- Given unknown, legacy, client-targeted, withdrawn, foreign, stale, or ambiguous action state, when it is read or executed, then it is non-interactive or rejected without existence disclosure or partial mutation while completed answer prose remains intact.

## Spec Change Log

## Review Triage Log

### 2026-07-30 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 14 (high 5, medium 9, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Bound executable actions to feature-owned fixed annotation IDs and revalidated descriptors, provenance, ownership, source message, status, and expiry under proposal locks.
  - `[high]` `[patch]` Aligned annotation-action lock order with withdrawal and prevented expired annotation dismissals from mutating proposals.
  - `[medium]` `[patch]` Preserved typed expired results, authenticated at the action boundary, used the rendered conversation scope, and made inspector execution single-flight.
  - `[medium]` `[patch]` Added both registered actions, deterministic UTF-16 code-point-safe marker allocation, reserved descriptor capacity, hostile marker collision handling, and historic-review action suppression.

### 2026-07-30 — Final approval
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none

## Auto Run Result

**Summary:** Implemented the owner-bound annotation detail/action path without adding a new store, transport, migration, or direct browser target. Persisted descriptors remain hostile intent; both proposal actions are feature-owned fixed markers with empty arguments, and all executable targets are derived from current owner-scoped state.

**Files changed:**
- `src/features/ai/answer-annotations.ts` -- validates exact forward-action schemas and preserves safe/legacy descriptor behavior.
- `src/features/ai/domain-outbox-worker.ts` -- writes two bounded, UTF-16-safe feature-owned action markers after proposal drafting and preserves them through delivery ordering.
- `src/features/chat-trips/conversations.ts` -- returns only current, unexpired, uniquely bound safe capabilities.
- `src/features/chat-trips/actions.ts` -- provides the typed annotation-action server boundary with authentication and safe result semantics.
- `src/features/chat-trips/trip-change-proposals.ts` -- revalidates annotation action binding under existing locks before apply/dismiss.
- `src/features/ai/ai-ask-composer.tsx` and `src/app/ai-ask/page.tsx` -- render and invoke only resolved capabilities while retaining read-only historic surfaces.
- `tests/answer-annotations.test.ts`, `tests/ai-ask-shell.test.ts`, `tests/domain-outbox.test.ts`, and `tests/trip-change-proposals.test.ts` -- cover descriptor safety, marker/capacity behavior, UI boundaries, ownership, withdrawal, expiry, and locked mutation races.

**Review:** Synchronous Blind Hunter and Edge Case Hunter reviews were run repeatedly after repairs. Final signoff was approved by both layers with no actionable findings.

**Verification:**
- `pnpm vitest run tests/answer-annotations.test.ts tests/chat-trip-context-extraction.test.ts tests/ai-ask-shell.test.ts --maxWorkers=1 --no-file-parallelism` -- passed, 198 tests.
- `pnpm vitest run tests/trip-change-proposals.test.ts --maxWorkers=1 --no-file-parallelism` -- passed, 76 tests.
- `pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts --maxWorkers=1 --no-file-parallelism` -- passed, 62 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed with 0 errors and five pre-existing unrelated warnings.
- `pnpm build` -- passed.
- `git diff --check` -- passed.

**Residual risks:** Actions remain intentionally unavailable if a completed answer has no usable, non-overlapping final-text ranges after deterministic provider-descriptor eviction. The pending proposal remains safely available through its established Trip Workspace controls; no stale or target-bearing annotation action is exposed.

## Design Notes

The conversation's existing selected/linked `tripProjectId` is the server-owned project member of the binding tuple; the annotation-action browser input intentionally cannot choose a project or proposal. Both registered commands are narrow owner-context proposal commands and may be provenance-free, while source-backed descriptors remain subject to current formatted-provenance availability.

## Verification

**Commands:**
- `pnpm vitest run tests/answer-annotations.test.ts tests/chat-trip-context-extraction.test.ts tests/ai-ask-shell.test.ts --maxWorkers=1 --no-file-parallelism` -- expected: serial annotation/read/UI coverage passes.
- `pnpm vitest run tests/trip-change-proposals.test.ts --maxWorkers=1 --no-file-parallelism` -- expected: binding and mutation coverage passes.
- `pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts --maxWorkers=1 --no-file-parallelism` -- expected: durable AI behavior remains intact.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm lint` -- expected: no new errors.
- `pnpm build` -- expected: production build passes.
- `git diff --check` -- expected: no whitespace errors.
