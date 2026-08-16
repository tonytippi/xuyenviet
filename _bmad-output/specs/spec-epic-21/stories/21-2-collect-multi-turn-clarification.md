---
title: 'Collect Multi-Turn Clarification'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_revision: '6b47fb1b9409767b425cc3b853e8c6d8928aaaee'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/specs/spec-epic-21/SPEC.md'
  - '_bmad-output/specs/spec-epic-21/story-contracts.md'
  - '_bmad-output/project-context.md'
warnings: []
deferred:
  - summary: >-
      The pnpm integration-test wrapper does not forward a focused file filter and runs the full serial suite instead.
    evidence: |-
      `pnpm test:integration -- tests/planning-clarification.integration.test.ts` ran unrelated integration files, exposed pre-existing domain-outbox failures, and exceeded 120 seconds. The configured direct Vitest integration command passed the focused Story 21.2 test file.
    location: >-
      package.json:test:integration
    severity: medium
---

<intent-contract>

## Intent

**Problem:** AI Ask chưa thu thập có kiểm soát các giá trị lập kế hoạch quan trọng qua nhiều lượt. Một câu hỏi chưa đủ thông tin hiện có thể đi ngay vào retrieval, web search và câu trả lời chính thay vì chỉ hỏi một chi tiết cần thiết tiếp theo.

**Approach:** Dùng session phẳng và hàng rào terminal AI Ask hiện có để reducer xác định một giá trị còn thiếu, lưu câu trả lời rõ ràng của người dùng theo CAS, và kết thúc lượt bị chặn bằng câu hỏi hoặc hướng dẫn thử lại tiếng Việt trước mọi nhánh nguồn/cung cấp AI.

## Boundaries & Constraints

**Always:** Tuân thủ chính xác Story 21.2 trong `story-contracts.md`; Story 21.1 đã hoàn tất và migration `0073` là bất biến. Chỉ dùng reducer nhỏ, xác định được cho giá trị explicit, slot thiếu, hoàn tất, supersession và revision fence. Mỗi lượt profiled hỏi tối đa một câu ngắn; lượt bị chặn không có retrieval, web search, câu trả lời chính, annotation, recommendation hay proposal effect. Tái sử dụng command terminal/finalization fence, session owner-scoped CAS, event context-extraction hiện hữu, Usage hiện hữu và trạng thái/UI composer hiện hữu. `DATABASE_URL_TEST` là mục tiêu test disposable đã được phê duyệt; integration vẫn chạy tuần tự và mỗi test cần dữ liệu sạch tự gọi `resetTestDatabase()`.

**Block If:** Contract hiện hữu không xác định được profile, giá trị explicit hợp lệ, hoặc câu hỏi thiếu tiếp theo mà không phải tự suy đoán; hoặc session/CAS/fence không thể bảo đảm stale output không ghi đè revision mới.

**Never:** Thêm graph, claim engine, attempt table, workflow/state-machine framework, bảng/migration, sửa migration `0073`, dịch vụ, queue/event type mới, cache, Worker kind, provider call cho lượt bị chặn, hoặc thay đổi sprint status. Không lưu reasoning, prompt, provider payload, transcript copy, hay tự chọn giá trị mâu thuẫn theo độ mới.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Initial clarification | Yêu cầu planning được hỗ trợ thiếu giá trị material | Tạo session `collecting`, hỏi đúng một câu tiếng Việt cho slot thiếu tiếp theo, terminal hóa lượt | Không gọi assembly, retrieval, web hoặc provider câu trả lời chính |
| Partial reply | Người dùng trả lời rõ ràng một phần cho session `collecting` | Giữ slot tương thích, tăng revision và hỏi đúng một slot thiếu kế tiếp | Không ghi đè slot mâu thuẫn hoặc không rõ |
| Completion | Câu trả lời explicit hoàn tất các slot material | Session thành `ready`; lượt sau tiếp tục đường AI Ask hiện hữu | Không mang slot không tương thích sang intent khác |
| Intent change or contradiction | Intent mới hoặc giá trị cùng scope mâu thuẫn | Supersede session cũ hoặc đánh dấu slot thiếu và hỏi một câu sửa rõ ràng | Không chọn theo recency |
| Extraction/reducer failure or stale CAS | Preflight lỗi, retry, hoặc expected revision không còn khớp | Terminal result an toàn với hướng dẫn thử lại; Usage đúng một lần; session mới hơn giữ nguyên | Không có main-answer effect, không terminalize lần hai |
| Conversation deletion race | Conversation bị xóa khi clarification đang hoàn tất | Fenced command trả refresh-safe terminal state; session không được tái tạo | Không tạo assistant message hay session sau xóa |

</intent-contract>

## Code Map

- `packages/contracts/src/planning-context.ts:1-61` -- bounded session payload/parser hiện hữu; chỉ reducer được phép tạo payload hợp lệ, không mở rộng shape.
- `packages/database/src/planning-context.ts:9-35` -- load owner-scoped và transactional expected-revision CAS; bổ sung reducer nhỏ cùng owner này và tái dùng kết quả `stale`/`not_found`.
- `packages/database/src/schema.ts:1193-1213` -- Story 21.1 đã tạo bảng session và cascade/revision guard; chỉ đọc, không sửa schema hoặc migration.
- `packages/database/src/ai-ask-commands.ts:58-150` -- admission tạo user message và luôn enqueue `ai_ask.context_extraction.v1`; blocked profiled turn phải bỏ qua đúng effect nền này, không thêm event mới.
- `packages/database/src/ai-ask-commands.ts:153-173,233-274` -- terminal và fenced finalization hiện hữu; clarification/retry phải dùng các hàng rào này, không tạo terminal pipeline khác.
- `packages/database/src/ai-ask-stream-execution.ts:16-31,165-193,271-335` -- dependency seam và thứ tự stream; chạy clarification sau `preparing` nhưng trước pricing/source bundle/provider, rồi return terminal khi blocked.
- `packages/database/src/domain-outbox.ts:49-93` -- enqueue idempotent hiện hữu; chỉ giữ nguyên đối với turn không bị clarification chặn.
- `apps/web/src/features/ai/ai-ask-composer.tsx:680-730,1115-1282,1317-1322,2001-2086` -- pending/preparing/recovery, replay-safe submit, Enter/Shift+Enter, focus và `aria-live` có sẵn để hiển thị clarification/retry tiếng Việt, không thêm state machine/component.
- `tests/planning-context.test.ts:1-37` và `tests/planning-context.integration.test.ts:1-35` -- parser/CAS/cascade tests Story 21.1 cần mở rộng reducer và làm mẫu isolation/reset.
- `tests/ai-ask-commands.test.ts:52-115,299-330,476-488` -- command replay, finalization, stale/deletion fences và outbox assertions cần tái sử dụng.
- `tests/ai-ask-stream-execution.test.ts:11-197` -- injectable source bundle seam và fenced stream tests; assert blocked turn không gọi source assembly/provider và không tạo answer-side records.
- `tests/traveler-ui-foundation.test.ts:57-120` -- source-inspection UI boundary tests cho Vietnamese copy, accessibility và mobile control constraints.
- `vitest.config.ts:6-105` -- unit allowlist và serial integration split. Không đưa test cần PostgreSQL vào unit; điều chỉnh chỉ khi cần để commands Story chạy đúng partition.

## Tasks & Acceptance

**Execution:**
- `packages/database/src/planning-context.ts` -- thêm reducer thuần, bounded cho profile/explicit slot values/missing slot/completion/supersession và revision tiếp theo; dùng load/CAS owner-scoped hiện hữu để stale result không thể ghi đè session mới -- giữ logic phẳng, xác định và không có graph/claim/attempt persistence.
- `packages/database/src/ai-ask-commands.ts` -- xác định và chặn context-extraction background effect hiện hữu cho turn profiled còn thiếu slot, đồng thời giữ admission/replay/idempotency hiện tại cho turn không bị chặn -- một blocked turn không phát sinh effect nền không liên quan.
- `packages/database/src/ai-ask-stream-execution.ts` -- gọi clarification preflight ngay sau `preparing`, trước pricing/source assembly; terminalize clarification/retry qua fence hiện hữu và return trước retrieval/web/provider/follow-up branches -- bảo đảm assistant clarification, Usage và terminal projection nhất quán, stale/deletion thắng an toàn.
- `apps/web/src/features/ai/ai-ask-composer.tsx` -- dùng pending/preparing/recovery/live-region và message terminal hiện hữu để trình bày câu hỏi clarification hoặc retry ngắn, tiếng Việt; bảo toàn focus, Enter/Shift+Enter, keyboard/touch và mobile layout -- không lộ extraction, provider hay trạng thái nội bộ.
- `tests/planning-context.test.ts` -- kiểm tra initial/partial/completion, mâu thuẫn, intent change/supersession, giới hạn và revision reducer -- pin deterministic reducer behavior mà không cần DB.
- `tests/ai-ask-commands.test.ts` và `tests/ai-ask-stream-execution.test.ts` -- kiểm tra blocked admission không enqueue context extraction, preflight terminal trước source assembly/provider, replay/Usage một lần, stale CAS và deletion fence -- chứng minh không có main-answer/retrieval effects cho lượt bị chặn.
- `tests/traveler-ui-foundation.test.ts` -- kiểm tra copy clarification/retry tiếng Việt, `aria-live`, focus/keyboard, touch target và không có thuật ngữ nội bộ -- giữ surface đáp ứng desktop/mobile hiện hữu.
- `tests/planning-clarification.integration.test.ts` -- dùng `resetTestDatabase()` local và `DATABASE_URL_TEST` approved để kiểm tra initial, partial, completion, intent change, failure/retry, stale output và deletion -- xác minh owner isolation/CAS/terminal behavior trên PostgreSQL tuần tự.
- `vitest.config.ts` -- chỉ cập nhật danh sách test nếu cần để đúng unit/integration boundary đã có; DB-backed tests không được biến thành unit tests -- giữ hạ tầng test hiện hữu và một integration worker.

**Acceptance Criteria:**
- Given một planning request hỗ trợ thiếu giá trị material, when clarification preflight chạy, then nó persist session phẳng và hỏi đúng một giá trị thiếu tiếp theo bằng tiếng Việt, và không retrieval evidence, search web hoặc generate main answer.
- Given người dùng trả lời explicit qua nhiều lượt, when reducer xử lý session hiện tại, then nó giữ slot tương thích, cập nhật missing slots/revision và chỉ chuyển `ready` sau khi đủ giá trị material.
- Given cùng scope có giá trị mâu thuẫn hoặc intent thay đổi, when reducer chạy, then nó hỏi correction hoặc supersede session cũ và không tự chọn giá trị theo recency hay mang slot không tương thích.
- Given extraction/preflight lỗi, retry hoặc stale output, when existing AI Ask command terminalizes, then terminal result cho hướng dẫn thử lại an toàn và Usage được ghi đúng một lần, while stale result không thay session revision mới hơn.
- Given lượt bị clarification chặn, when stream execution bắt đầu, then source assembly, retrieval, web, main provider answer, annotations, recommendations và proposals không chạy.
- Given conversation bị xóa hoặc version fence thay đổi trong clarification, when finalization kiểm tra hàng rào, then command trả safe refresh result và không tạo lại session hoặc completed assistant answer.
- Given composer nhận clarification/retry terminal result, when render trên keyboard, touch và mobile, then người dùng nhận copy Việt ngắn qua UI state hiện hữu với focus và accessibility không thoái lui.

## Spec Change Log

## Review Triage Log

### 2026-08-16 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 8 (high 2, medium 5, low 1)
- defer: 1 (medium 1)
- reject: 7
- addressed_findings:
  - `[high]` `[patch]` Prevent arbitrary or invalid free text, dates, and party counts from filling planning slots; reducer now accepts only bounded explicit values and leaves ambiguous values missing.
  - `[high]` `[patch]` Revoke a context-extraction outbox row inside the existing fenced clarification terminal transaction so a session change between admission and preflight cannot retain a blocked-turn effect.
  - `[medium]` `[patch]` Record one local failure Usage event and existing safe telemetry for clarification retry terminalization.
  - `[medium]` `[patch]` Remove question-mark content inference from the composer so ordinary answers with a follow-up question are not labeled as clarification.
  - `[medium]` `[patch]` Read the retained command terminal projection after clarification finalization and emit safe local clarification telemetry.
  - `[medium]` `[patch]` Add focused tests for no-model blocked clarification, partial admission/outbox suppression, retry Usage, deletion fence, stale CAS, and admission-to-preflight race cleanup.
  - `[low]` `[patch]` Preserve concise Vietnamese completion copy through existing composer state without introducing a clarification-specific client state machine.

## Auto Run Result

Status: done

Implemented bounded multi-turn planning clarification with the existing owner-scoped planning session, AI Ask command fence, and composer state. Blocked planning turns ask one Vietnamese question, persist only explicit valid values, write Usage once, and return before model selection, retrieval, web search, provider generation, annotations, recommendations, or proposals.

Files changed:
- `packages/database/src/planning-context.ts` -- deterministic bounded reducer, explicit-value validation, CAS-backed preparation, and test seam.
- `packages/database/src/ai-ask-commands.ts` -- suppresses and fenced-revokes the existing context-extraction outbox effect for blocked clarification terminals.
- `packages/database/src/ai-ask-stream-execution.ts` -- executes clarification before model/source work, terminalizes through the existing fence, records local Usage and telemetry.
- `apps/web/src/features/ai/ai-ask-composer.tsx` -- preserves safe generic completion messaging without content-based clarification inference.
- `tests/planning-context.test.ts` -- reducer, invalid-value, conflict, supersession, and readiness tests.
- `tests/ai-ask-commands.test.ts` -- admission/outbox clarification coverage.
- `tests/ai-ask-stream-execution.test.ts` -- no-model, blocked-turn, retry, deletion, and session-race coverage.
- `tests/planning-clarification.integration.test.ts` -- serial persistent multi-turn and stale-CAS coverage.
- `tests/traveler-ui-foundation.test.ts` -- safe UI boundary coverage.

Review findings: 8 patches applied (high 2, medium 5, low 1); 1 item deferred; 7 findings rejected as duplicates, overly broad profile expansion, or non-story concerns. Follow-up review recommendation: `true` because this pass applied two high-severity patches (score: 16).

Verification:
- `pnpm test:unit -- tests/planning-context.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts tests/traveler-ui-foundation.test.ts` -- passed, 43 files and 366 tests.
- `pnpm exec vitest run --project integration tests/planning-clarification.integration.test.ts` -- passed, 1 file and 2 tests, using approved `DATABASE_URL_TEST`.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed; pre-existing admin `<img>` optimization warnings remain.

Residual risks:
- The deterministic profile intentionally recognizes a narrow set of explicit origin/destination, ISO date, and adult-count forms; broader natural-language extraction is not inferred or delegated to a provider in this story.
- The `pnpm test:integration -- <file>` argument-forwarding defect remains deferred; the focused configured Vitest project command is the accepted integration evidence.

## Design Notes

Reducer chỉ nhận các giá trị mà người dùng nói rõ. Một intent mới supersede session cũ; cùng scope mâu thuẫn giữ slot ở trạng thái thiếu thay vì chọn câu trả lời mới nhất. Lượt bị chặn dùng command finalization có sẵn để lưu assistant clarification ngắn và Usage một lần, sau đó trả về trước khi source bundle được lắp ráp.

## Verification

**Commands:**
- `pnpm test:unit -- tests/planning-context.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts tests/traveler-ui-foundation.test.ts` -- expected: focused infrastructure-free tests pass; DB-backed files remain in their configured integration project rather than being forced into unit.
- `pnpm test:integration -- tests/planning-clarification.integration.test.ts` -- expected: serial PostgreSQL verification passes using approved `DATABASE_URL_TEST`; if the script fails to forward the focus argument, record the exact command and run the equivalent configured Vitest project command only as evidence.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm build` -- expected: production build passes.
