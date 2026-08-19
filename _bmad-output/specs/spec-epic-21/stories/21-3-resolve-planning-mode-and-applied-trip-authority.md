---
title: 'Resolve Planning Mode And Applied Trip Authority'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_revision: '2435f32d19c048077acd78c7ec4223f516866d0e'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/specs/spec-epic-21/SPEC.md'
  - '_bmad-output/specs/spec-epic-21/story-contracts.md'
  - '_bmad-output/project-context.md'
warnings: []
deferred:
  - summary: >-
      The package integration wrapper does not forward a focused file filter and runs unrelated serial integration tests instead.
    evidence: |-
      `pnpm test:integration -- <file>` uses a package-script separator that does not pass the file filter to Vitest. Focused Story 21.3 evidence therefore uses direct `pnpm exec vitest run --project integration <file>` commands.
    location: >-
      package.json:test:integration
    severity: medium
  - summary: >-
      The legacy full AI Ask stream integration file has unrelated harness failures outside Story 21.3's focused cases.
    evidence: |-
      `pnpm exec vitest run --project integration tests/ai-ask-stream-execution.test.ts` ran 28 tests with 19 passed and 9 failed. Failures predate the Story-specific cases and include nested asymmetric matcher assertions under `toEqual`, telemetry mocks cleared by shared setup, shared-state source/provenance expectations, and invalid idempotency keys containing `.`. The direct focused Story 21.3 proposal-race command passed 3 tests.
    location: >-
      tests/ai-ask-stream-execution.test.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Sau khi clarification hoàn tất, AI Ask chưa có một quyết định mode được pin rõ ràng để phân biệt kế hoạch Trip đã áp dụng, phương án giả định, proposal đang chờ, và câu hỏi riêng tư. Điều này có thể làm dữ liệu chat hoặc proposal bị hiểu là trạng thái Trip hiện hành.

**Approach:** Phân giải xác định đúng bốn mode từ scope URL đã xác thực owner, Trip đã chọn, proposal pending và intent lượt hiện tại; truyền reference đã pin vào source bundle, rồi dùng hàng rào finalization AI Ask hiện hữu để loại bỏ output stale.

## Boundaries & Constraints

**Always:** Tuân thủ chính xác Story 21.3 trong `story-contracts.md`; Story 21.2 đã hoàn tất. Chỉ trả một trong `current_plan`, `explore_change`, `validate_proposal`, hoặc `unscoped_answer`. Chỉ snapshot Trip đã applied, owner-scoped và đúng version là authority của `current_plan`. Dùng các aggregate/item/constraint version, proposal pending state và command terminal fence hiện hữu. Ambiguity hỏi đúng một clarification; thay đổi Trip/proposal/session pin trước finalization trả stale-safe result. `DATABASE_URL_TEST` đã được phê duyệt nếu focused integration evidence cần thiết.

**Block If:** Các seam hiện hữu không thể phân biệt owner-scoped Trip/proposal hợp lệ với scope mơ hồ mà không suy đoán; hoặc finalization fence hiện có không thể recheck pin để ngăn output stale được persist.

**Never:** Thêm mode thứ năm, schema/migration, bảng snapshot/run/attempt, graph/workflow, service/queue/Worker, provider call cho ambiguity, endpoint/UI mới, thay đổi migration `0073`, hoặc sửa `sprint-status.yaml`. Không dùng pending, hypothetical, foreign, chat-only, source metadata hay text model làm applied authority. Không thay đổi required-need/route/recommendation behavior của các Story sau.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Current Trip | Selected owner Trip, intent hỏi kế hoạch hiện tại | `current_plan`; bundle pin exact applied aggregate/item/constraint snapshot | Không có lỗi |
| Hypothetical change | Selected owner Trip, intent kiểu “Nếu ghé Quy Nhơn...” | `explore_change`; Trip applied chỉ là baseline, giả định không thành state | Không ghi Trip/proposal |
| Pending review | Một proposal `pending` owner-scoped được chỉ rõ | `validate_proposal`; proposal hiển thị/persist là pending | Proposal không mutate Trip |
| Private ask | Không có selected Trip hợp lệ | `unscoped_answer`; không nạp Trip/proposal riêng tư | Không leak existence/contents |
| Ambiguous or stale | Nhiều/mơ hồ scope hoặc pinned Trip/proposal/session đổi | Một clarification hoặc `refresh_required`; không persist completed answer | Không message/provenance/snapshot success stale |

</intent-contract>

## Code Map

- `packages/contracts/src/planning-context.ts:27-54` -- parser session phẳng strict đang tồn tại; thêm export union bốn mode và execution reference tối thiểu, không đổi session payload authority.
- `packages/database/src/answer-context.ts:59-120` -- owner-scoped conversation/Trip join, aggregate/item/constraint snapshot và thứ tự authority hiện hữu; đây là seam phân giải mode deterministic.
- `packages/database/src/schema.ts:1015-1089,1128-1155` -- `tripProjects.aggregateVersion`, item/constraint versions, proposal owner/status/expected version, và composite conversation/Trip ownership là bằng chứng read-only cho authority.
- `packages/database/src/trip-plan-commands.ts:132-134` -- aggregate applied chỉ tiến version qua owner command; không sửa mutation path.
- `packages/database/src/traveler-proposal-commands.ts:28-75,100` -- apply/dismiss/lock proposal hiện hữu quyết định pending validity; chỉ dùng để đọc và pin, không đổi command behavior.
- `packages/database/src/source-bundle.ts:71-165,504-581,620-624` -- source bundle, prompt renderer, serialization/reference ledger và Trip render seam; thêm mode/reference đã resolve, giữ unscoped không render private Trip.
- `packages/database/src/ai-ask-stream-execution.ts:159-218,306-364` -- clarification precedes source assembly; resolve/recheck mode pin qua existing execution/finalization path trước persist.
- `packages/database/src/ai-ask-commands.ts:97-120,237-260` -- admission owner/aggregate pins và `finalizeAiAskCommand()` locks/version fences; mở rộng tối thiểu cho proposal/session pin nếu mode cần.
- `tests/ai-ask-stream-execution.test.ts:114-144,271-295` -- source-bundle ledger và aggregate/deletion stale fences hiện hữu để mở rộng race coverage.
- `tests/private-turn-answer-context.integration.test.ts:36-57` -- regression seam cho private/unscoped context isolation; chỉ chạy focused integration trực tiếp nếu Story test cần DB.

## Tasks & Acceptance

**Execution:**
- `packages/contracts/src/planning-context.ts` -- export union chính xác bốn planning mode và `PlanningExecutionRef` nhỏ chứa mode cùng Trip/proposal/session pin nullable -- giữ session JSON phẳng và không tạo authority persistence mới.
- `packages/database/src/answer-context.ts` -- resolve deterministic mode từ authenticated URL scope đã owner-validate, selected Trip, proposal pending hiện tại và bounded current-turn intent; trả clarification state khi ambiguity -- xác nhận chỉ applied snapshot cấp `current_plan` authority.
- `packages/database/src/source-bundle.ts` -- đưa resolved mode/reference vào bundle, serialization và prompt render; current plan chỉ render applied Trip, explore chỉ giữ applied baseline, validate chỉ label proposal pending, unscoped không nạp Trip -- ngăn reinterpret chat/proposal thành committed state.
- `packages/database/src/ai-ask-stream-execution.ts` và `packages/database/src/ai-ask-commands.ts` -- resolve trước source assembly và recheck exact Trip/proposal/session references trong transaction finalization hiện hữu; ambiguity terminalizes clarification, stale pins discard output -- không có terminal pipeline thứ hai hoặc completed side effects sau stale.
- `tests/planning-mode.test.ts` -- thêm unit matrix PM-01 đến PM-07, exhaustive four-mode union, ambiguity, foreign ownership, pending-only proposal, dismiss/apply re-resolution và exact applied authority -- pin deterministic resolver behavior không cần database.
- `tests/ai-ask-stream-execution.test.ts` -- cover bundle/prompt authority and finalization races for aggregate mutation, proposal dismiss/apply and session revision -- chứng minh no private leak/no stale message, provenance, snapshot or success Usage.
- `tests/private-turn-answer-context.integration.test.ts` hoặc focused Story integration mới khi unit seam không đủ -- dùng approved serial `DATABASE_URL_TEST`, `resetTestDatabase()` local nếu clean tables cần -- giữ direct focused Vitest evidence nếu wrapper không forward file argument.

**Acceptance Criteria:**
- Given ready turns cover an applied Trip, a hypothetical change, a specific pending proposal, and no selected Trip, when mode resolves, then it returns exactly `current_plan`, `explore_change`, `validate_proposal`, or `unscoped_answer` respectively and current-plan content uses only the exact applied Trip snapshot.
- Given an exploration or pending proposal, when source context is rendered and persisted, then it remains explicitly hypothetical/pending and cannot update or become authority for a later current-plan answer before the existing owner Apply succeeds.
- Given no valid owner-selected Trip or proposal exists, when an unscoped/private turn assembles context, then it loads no Trip/proposal data and does not disclose foreign-resource existence.
- Given scope is ambiguous, when planning mode is requested, then the command produces one concise clarification and does not enter source/provider generation.
- Given pinned Trip aggregate, relevant item/constraint, pending proposal status/version, or planning session revision changes after assembly, when finalization runs, then it discards stale output as `refresh_required` and creates no completed assistant message, provenance, retrieval snapshot, or success Usage.
- Given a pending proposal is dismissed, when the owner asks again, then it cannot resolve `validate_proposal` and current-plan authority is unchanged; given it is applied, the next current-plan turn pins the advanced applied aggregate version.

## Spec Change Log

## Review Triage Log

### 2026-08-16 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 9 (high 3, medium 5, low 1)
- defer: 2 (medium 2)
- reject: 10
- addressed_findings:
  - `[high]` `[patch]` Resolve unscoped turns before proposal/change interpretation, require a specifically identified pending proposal for validation, make zero-pending clarification actionable, and constrain exploration detection to conditional change constructions.
  - `[high]` `[patch]` Fence the exact locked Trip project/aggregate, locked planning-session revision, and pending proposal timestamp/state; use the reference for ambiguity clarification finalization and prevent stale generated deltas from reaching the client.
  - `[high]` `[patch]` Persist bounded planning execution/proposal identity through the existing source-bundle ledger and serialization, retain mode policy in every fallback renderer, and add direct ownership, authority, fallback, proposal-update, dismissal/application, and stale-race coverage.
  - `[medium]` `[patch]` Report a discarded finalization as failure telemetry rather than answer success.
  - `[medium]` `[patch]` Remove unused resolver imports and retain the narrow Story 21.2 candidate-routing correction only for generic-request regression prevention.

### 2026-08-16 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (high 1, medium 1)
- defer: 0
- reject: 13
- addressed_findings:
  - `[high]` `[patch]` Propagate only the resolved owner-validated Trip ID to source assembly and web usage, so an invalid selected scope remains fully unscoped downstream.
  - `[medium]` `[patch]` Exclude expired pending proposals from validation-mode resolution and cover the expired-row regression with focused integration evidence.

## Design Notes

Mode is a request-scoped, replayable decision rather than a second persisted aggregate. `current_plan` consumes the Trip snapshot already protected by aggregate/item/constraint versions. `explore_change` retains that snapshot only as a committed baseline, while `validate_proposal` pins a still-pending proposal. Every other value remains transient and cannot cross the finalization fence as applied state.

## Verification

**Commands:**
- `pnpm test:unit -- tests/planning-mode.test.ts tests/ai-ask-stream-execution.test.ts` -- expected: PM-01 through PM-07, ambiguity, isolation and stale pins pass without database access.
- `pnpm exec vitest run --project integration <focused-story-test>` -- expected: only if persistent owner/fence evidence is added, serial focused test passes with approved `DATABASE_URL_TEST`; preserve this direct evidence if `pnpm test:integration -- <file>` runs unrelated tests.
- `pnpm typecheck` -- expected: strict TypeScript passes.

## Auto Run Result

Status: done

Implemented exactly four request-scoped planning modes and made the exact owner-applied Trip snapshot the sole `current_plan` authority. The source bundle now carries and persists a bounded mode/reference decision; exploration and pending proposal views remain explicitly non-applied, and unscoped turns cannot load private Trip/proposal context. Existing AI Ask finalization now rejects changed Trip, session, or proposal pins before completed answer-side persistence or stale client disclosure.

Files changed:
- `packages/contracts/src/planning-context.ts` -- adds the exact planning-mode union and bounded transient execution reference.
- `packages/database/src/answer-context.ts` -- owner-validates deterministic mode resolution and removes project-chat fallback as applied Trip authority.
- `packages/database/src/source-bundle.ts` -- carries mode/proposal references through prompt fallbacks and existing snapshot ledger/serialization.
- `packages/database/src/ai-ask-commands.ts` -- rechecks locked mode references in the existing terminal fence.
- `packages/database/src/ai-ask-stream-execution.ts` -- handles ambiguous mode safely and buffers scoped output until fences pass.
- `packages/database/src/planning-context.ts` -- narrows clarification candidacy so ordinary generic prompts do not enter the blocked planning path.
- `tests/planning-mode.test.ts` -- exercises PM-01 through PM-07, unscoped wording, ambiguity, authority prompt behavior, and fallback persistence.
- `tests/planning-mode.integration.test.ts` -- proves foreign isolation, applied-over-project-chat authority, proposal dismissal, and post-apply aggregate pinning.
- `tests/ai-ask-stream-execution.test.ts` -- covers session and proposal state/content stale races with no completed answer-side effects.
- `tests/planning-context.test.ts` -- protects the generic-prompt clarification-routing regression.

Review findings: 9 patches applied (high 3, medium 5, low 1); 2 pre-existing test-wrapper/harness items deferred; 10 findings rejected as duplicates, already covered, or outside the exact Story contract. Follow-up review recommendation: `true` (high-severity patches present; score 16).

Verification:
- `pnpm test:unit -- tests/planning-mode.test.ts tests/ai-ask-stream-execution.test.ts` -- passed: 43 files, 366 tests. The unit project does not collect the named Story files, so this is baseline unit evidence only.
- `pnpm exec vitest run --project integration tests/planning-mode.test.ts` -- passed: 1 file, 9 tests, using approved `DATABASE_URL_TEST`.
- `pnpm exec vitest run --project integration tests/planning-mode.integration.test.ts` -- passed: 1 file, 3 tests, using approved `DATABASE_URL_TEST`.
- `pnpm exec vitest run --project integration tests/ai-ask-stream-execution.test.ts -t "pinned proposal becomes"` -- passed: 1 file, 3 tests, 25 skipped, using approved `DATABASE_URL_TEST`.
- `pnpm typecheck` -- passed across root, web, admin, API, worker-domain, and worker.
- `git diff --check` -- passed.

Residual risks:
- Full `tests/ai-ask-stream-execution.test.ts` continues to expose nine pre-existing integration-harness failures; focused Story 21.3 cases pass and the defect is recorded above.
- The package integration wrapper still fails to forward focused file arguments; direct configured Vitest project commands are preserved as Story evidence.

### 2026-08-16 — Follow-up review result

Follow-up review repaired two verified defects: invalid selected Trip scope could reach downstream source/web usage after resolution to `unscoped_answer`, and an expired row retaining `pending` status could be selected for `validate_proposal`. The resolver now supplies only its owner-validated reference to downstream assembly, and proposal selection matches the existing non-expired pending semantics.

Files changed in follow-up:
- `packages/database/src/ai-ask-stream-execution.ts` -- passes resolved Trip scope into source assembly and usage context.
- `packages/database/src/source-bundle.ts` -- applies resolved scope consistently to answer-context and web-search usage paths.
- `packages/database/src/answer-context.ts` -- filters expired proposals from pending validation candidates.
- `tests/planning-mode.integration.test.ts` -- covers expired pending proposal exclusion.

Review findings: 2 patches applied (high 1, medium 1); 0 items deferred; 13 items rejected as duplicate, non-defect, or verification-only suggestions. Follow-up review recommendation: `true` (high 1, medium 1; score 4).

Verification:
- `pnpm exec vitest run --project integration tests/planning-mode.test.ts` -- passed: 1 file, 9 tests, using approved `DATABASE_URL_TEST`.
- `pnpm exec vitest run --project integration tests/planning-mode.integration.test.ts` -- passed: 1 file, 4 tests, using approved `DATABASE_URL_TEST`.
- `pnpm exec vitest run --project integration tests/ai-ask-stream-execution.test.ts -t "pinned proposal becomes"` -- passed: 1 file, 3 tests, 25 skipped, using approved `DATABASE_URL_TEST`.
- `pnpm typecheck` -- passed across root, web, admin, API, worker-domain, and worker.
- `git diff --check` -- passed.

Residual risks remain unchanged: the package integration wrapper does not forward focused file arguments, and the full legacy AI Ask stream harness retains its documented unrelated failures. Focused direct integration evidence remains accepted for Story 21.3.
