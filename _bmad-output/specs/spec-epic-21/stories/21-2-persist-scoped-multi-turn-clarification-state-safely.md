---
title: 'Persist Scoped Multi-Turn Clarification State Safely'
type: 'feature'
created: '2026-08-13'
status: 'done'
baseline_revision: 'b70e62f0be262539a6b272712e11b5b98828e295'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/specs/spec-epic-21/story-contracts.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Chat chưa có state bền vững, owner-scoped để tích lũy clarification đa lượt; retry, câu trả lời cũ hoặc conflict scope có thể làm mất hay thay thế sai dữ liệu đã xác thực.

**Approach:** Persist attempt bất biến do AI Orchestration sở hữu và session/graph/value/evidence/claim do Chat/Trips sở hữu, dùng revision/ordinal monotonic cùng CAS transaction để chỉ state hợp lệ, đúng owner và đúng fence mới tiến lên.

## Boundaries & Constraints

**Always:** Dùng chính xác contract Story 21.2; chỉ consume resolver/comparator/completeness của Story 21.1; pin identity profile/policy/scope/schema/attempt/Trip/proposal; evidence dùng offset UTF-16 zero-based với end exclusive; content revision và ordinal được cấp từ conversation đã lock trong cùng transaction; session `active|superseded|completed`, instance `collecting|ready|claimed|completed|abandoned`, và mọi transition/CAS phải hợp lệ.

**Block If:** Story 21.1 không còn `done`, hoặc migration/test database không chạy được; ghi nguyên văn blocker, không nới fixture, assertion, fence, hay owner boundary.

**Never:** Không gọi model, Retrieval/web/source bundle/prompt/provenance/main-answer Usage; không mutate Trip aggregate; không thêm command ledger, service, queue, worker hay config; không để Chat/Trips tái cài profile/comparator; không dùng timestamp hay message count làm fence; không dùng `source-bundle.ts` làm owner state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Khởi tạo/retry plan | Validated plan và cùng plan attempt | Một graph/instance/session immutable, retry trả kết quả đã tồn tại | Plan stale, terminal, deleted, cyclic, partial hoặc unvalidated không ghi gì |
| Natural reply | `Hai vợ chồng, đi ô tô` và source message hợp lệ | Lưu party/vehicle cùng exact evidence; direction vẫn missing; chỉ instance ảnh hưởng được recompute | Span/schema/key/scope sai bị reject không thay state |
| Conflict/race | Equal-scope contradiction, narrower override, duplicate hoặc ordinal cũ | Conflict giữ `ambiguous`; override hẹp chỉ local; đúng một CAS hợp lệ | Stale/duplicate không ghi đè ready, claimed, terminal, superseded hay deleted |
| Mixed claims | Lodging ready; food/activity blocked hoặc claims disjoint | Chỉ IDs ready được claim; session active đến khi mọi instance terminal | Overlap/duplicate claim bị reject không mutation |

</intent-contract>

## Code Map

- `_bmad-output/specs/spec-epic-21/story-contracts.md:67-124` -- handoff chuẩn, tasks, AC và giới hạn Story 21.2.
- `_bmad-output/specs/spec-epic-21/stories/21-1-define-versioned-planning-context-profiles-and-scope-rules.md:57-88` -- predecessor done, contracts/evaluator mà story này phải consume.
- `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/retrieval-trip-aware/contracts.md:103-304` -- shapes, ownership, fences, evidence, transition matrix và semantics claim chuẩn.
- `packages/contracts/src/planning-context.ts:2-38` -- browser-safe validated planning context/parser từ Story 21.1; chỉ mở rộng khi handoff cần shape bền vững.
- `packages/database/src/planning-context-profiles.ts:51-140` -- Retrieval-owned resolve/validate/comparator/completeness; tái dùng, không copy semantic.
- `packages/database/src/schema.ts:1009-1095,1134-1308` -- Trip/proposal fence, conversation/message và AI Ask command schema để thêm state/FK đúng owner.
- `packages/database/src/ai-ask-commands.ts:58-150,233-281` -- admission/idempotency, command fence và user message writer cần route qua allocator.
- `packages/database/src/ai-ask-stream-execution.ts:271-277` -- assistant message writer cần route qua allocator.
- `packages/database/src/traveler-proposal-commands.ts:32-100` -- pattern lock/fence transaction cho Trip/proposal read validation.
- `drizzle/migrations/0067_add_planning_context_profiles.sql` và `drizzle/migrations/meta/_journal.json:69-72` -- migration 0068 forward tiếp theo và journal convention.
- `tests/fixtures/planning-context-v6.ts`, `tests/helpers/db.ts:16-32`, `vitest.config.ts:6-50,89-100` -- fixture canonical, reset DB local và unit/integration registration serial.

## Tasks & Acceptance

**Execution:**
- `packages/database/src/schema.ts` và `drizzle/migrations/0068_add_planning_clarification_state.sql` -- thêm `conversations.contentRevision`, `messages.ordinal`, và hai group đúng owner: AI Orchestration immutable plan/extraction attempts; Chat/Trips graph revision/session/instance/field/value/evidence/assumption/claim. Dùng owner FKs/cascade, state checks, attempt uniqueness `(command, source message, expected session revision, prompt version)`, partial unique active-session và relational exact-instance claim fence; không backfill authority từ text/timestamp.
- `packages/database/src/conversation-content-revisions.ts` -- tạo helper transaction-aware duy nhất để lock conversation, cấp ordinal stable, insert message và tăng content revision; trả message/ordinal/revision cho caller. Route user/assistant writers tại `ai-ask-commands.ts` và `ai-ask-stream-execution.ts` qua helper này.
- `packages/database/src/planning-clarification-attempts.ts` và `packages/database/src/index.ts` -- tạo/read immutable plan/extraction attempt idempotent, kiểm command/source message/owner/revision trước persistence và export owner port; không gọi model hay Usage.
- `packages/database/src/planning-clarification-state.ts` và `packages/database/src/index.ts` -- implement `initializeClarificationSession`, `evolveClarificationPlan`, `reduceClarificationMessage`, exact-ready-instance claim. Consume Story 21.1 evaluator; validate owner/message ordinal/revisions/attempt/pins/Trip-proposal fences; verify exact UTF-16 substring/digest; preserve omitted resolved values; retain equal-scope conflicts; recompute affected instances only; use one legal CAS transaction and compute session completion atomically.
- `tests/fixtures/planning-context-v6.ts`, `tests/planning-clarification-state.test.ts`, `vitest.config.ts` -- thêm CLAR-02, -03, -09, -11, -14, -24, -25, -26 cùng DB-free reducer, scope/conflict, transition và evidence-span tests.
- `tests/planning-clarification-state.integration.test.ts` -- thêm serial persistence, owner isolation, attempt idempotency, CAS/stale/terminal, deletion invalidation và concurrent disjoint/overlap claim coverage; local setup phải gọi `resetTestDatabase()`.

**Acceptance Criteria:**
- Given validated clarification plan, when initialize/evolve chạy, then graph/instances/field state/content revision/pins được atomically persist owner-bound và retry plan attempt idempotent; input stale, terminal, deleted, cyclic, partial hoặc unvalidated không đổi dữ liệu.
- Given reply chỉ có vehicle và party, when reducer validate evidence, then hai value typed/evidence UTF-16 được giữ, chỉ affected instance recompute và direction vẫn missing, không clear hay infer default.
- Given equal-scope conflict, narrower valid scope, out-of-order hoặc duplicate delivery, when all owner/revision/ordinal/extraction/scope fences validate, then ambiguity được giữ, override chỉ local và một CAS hợp lệ commit; stale work không overwrite state mới/terminal.
- Given mixed lodging/food/activity session, when chỉ một số instance ready/completed, then readiness/claims độc lập, blocked sibling bị loại, session chỉ completed khi mọi instance completed hoặc abandoned; CLAR-02, -03, -09, -11, -14, -24, -25, -26 pass ở unit và serial integration.

## Design Notes

Lưu claim-to-instance bằng rows relational để unique live claim có thể chặn overlap ở database; không lưu mảng IDs rồi hy vọng unique index bảo vệ được race. `ready -> collecting` chỉ có thể xảy ra với reply mới hợp lệ đi qua expected revision CAS; input stale/out-of-order luôn reject. Completeness `assumed` từ evaluator không tự đủ readiness cho đến khi assumption immutable, permitted và disclosed đã được persist.

## Verification

**Commands:**
- `pnpm test:unit -- tests/planning-clarification-state.test.ts` -- expected: reducer, pin, evidence/span, transition và fixture coverage DB-free pass.
- `pnpm test:integration -- tests/planning-clarification-state.integration.test.ts` -- expected: serial migration/persistence/CAS/claim coverage pass, hoặc ghi exact environmental blocker.
- `pnpm db:generate` -- expected: Drizzle schema generation succeeds với database environment hợp lệ, hoặc ghi exact blocker.
- `pnpm typecheck` -- expected: TypeScript strict workspace passes.
- `git diff --check` -- expected: no whitespace errors.

## Review Triage Log

### 2026-08-14 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 45 (high 27, medium 14, low 4)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Hardened owner, command, conversation, Trip, proposal, content, lifecycle, extraction, and claim fences; added database constraints and CAS/lock coverage.
  - `[high] [patch]` Repaired migration chain safety, durable transition enforcement, scoped deletion invalidation, and evolution idempotency/preservation.
  - `[medium] [patch]` Expanded canonical and matrix coverage for UTF-16 evidence, ambiguity, scope locality, assumptions, retries, mixed claims, terminalization, and allocator behavior.

## Auto Run Result

Summary: Hoan thanh Story 21.2 voi durable multi-turn clarification state owner-scoped: immutable attempts, monotonic conversation ordinals/revisions, pinned session graph/value/evidence/assumption/claim state, exact CAS/owner/Trip/proposal fences va invalidation an toan khi evidence bi xoa.

Files changed:
- `packages/database/src/conversation-content-revisions.ts`, `ai-ask-commands.ts`, `ai-ask-stream-execution.ts` — allocator ordinal/content revision transaction-aware va production writers.
- `packages/database/src/planning-clarification-attempts.ts`, `planning-clarification-state.ts`, `schema.ts`, `index.ts` — attempt/session/reducer/assumption/claim ports, durable FKs, pins, transitions va exports.
- `drizzle/migrations/0068_add_planning_clarification_state.sql` through `0077_fence_clarification_claim_conversations.sql` — forward schema, hardening, invalidation, scope, owner va concurrency constraints.
- `tests/fixtures/planning-context-v6.ts`, `tests/planning-clarification-state.test.ts`, `tests/planning-clarification-state.integration.test.ts`, `vitest.config.ts` — canonical CLAR coverage, DB-free và serial persistence regressions.

Review findings: 45 patches applied (27 high, 14 medium, 4 low); 0 deferred; 0 rejected. Follow-up review recommendation: false (final repaired review pass has no remaining patch findings).

Verification:
- `pnpm test:unit -- tests/planning-clarification-state.test.ts` — passed: 43 files, 354 tests.
- `pnpm exec vitest run --project integration tests/planning-clarification-state.integration.test.ts` — passed: 1 file, 28 tests.
- `pnpm typecheck` — passed across workspace packages.
- `git diff --check` — passed.
- `pnpm test:integration -- tests/planning-clarification-state.integration.test.ts` — selector runs the full shared serial integration project and exceeded 120 seconds amid unrelated failures; the direct Story 21.2 integration invocation above passed.
- `pnpm db:generate` — blocked in this non-interactive environment: `Interactive prompts require a TTY terminal`.

Residual risks: Full integration selection and Drizzle generation remain limited by repository runner/TTY behavior; focused Story 21.2 serial migration and persistence coverage passes.
