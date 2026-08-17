---
title: 'Convert Eligible Chat Context Into A Reviewable Trip'
type: 'feature'
created: '2026-08-17'
status: 'ready-for-dev'
baseline_revision: 'f0db58c74625d3fc3764425f686a81eec3d5f109'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-epic-21/SPEC.md'
  - '_bmad-output/specs/spec-epic-21/story-contracts.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Vấn đề:** Cuộc trò chuyện đã trả lời xong ngoài Trip chưa có đường chuyển đổi an toàn thành một Trip để chủ sở hữu xem xét. Cơ chế recommendation hiện tại còn phụ thuộc vào trích xuất ngữ cảnh bất đồng bộ, không đảm bảo chỉ dùng giá trị lập kế hoạch rõ ràng từ câu trả lời hoàn tất.

**Cách tiếp cận:** Tái dùng aggregate recommendation, command nhận idempotent, endpoint và UI hiện có để chiếu đúng bốn trạng thái `eligible`, `accepted`, `dismissed`, `invalidated`. Khi nhận recommendation hợp lệ, cùng giao dịch tạo Trip, primary conversation và đúng một proposal typed đang `pending`; plan chỉ thay đổi khi chủ sở hữu Apply proposal hiện có.

## Ranh Giới Và Ràng Buộc

**Luôn:** Chỉ xét câu trả lời `unscoped` đã terminal thành công có ít nhất một giá trị lập kế hoạch explicit được hỗ trợ. Mỗi giá trị conversion phải có flat per-slot source-message-ID trong bounded planning session, bằng user message ID của current completed unscoped terminal turn; map chỉ lưu ID, không lưu transcript, prose trợ lý, prompt, giả định hay provider payload. Xác thực giá trị ánh xạ thành operation bằng seam thuộc database trong `traveler-proposal-commands.ts`; chèn proposal trong giao dịch accept hiện hữu, sau khi tạo Trip/primary conversation và trước terminal replay. Giữ owner scope, fence revision/fingerprint, khóa xóa, replay idempotency và endpoint `POST /v1/trip-recommendations/accept-creation` hiện có. Giữ `sprint-status.yaml` chỉ đọc.

**Chặn nếu:** Dữ liệu explicit đã terminal không thể được kiểm tra và ánh xạ thành proposal operation hợp lệ trong giao dịch accept mà không lưu/copy transcript, prose trợ lý hay payload nhà cung cấp, hoặc nếu một proposal `pending` không thể được tạo atomically cùng Trip và primary conversation.

**Không bao giờ:** Thêm workflow engine, bảng/lifecycle generic, run, queue, Worker/outbox event, migration, endpoint song song, hoặc pre-Apply mutation vào Trip/plan. Không sao chép transcript, nội dung assistant, prompt, giả định, provider payload hay dữ liệu unresolved vào Trip/proposal. Không di chuyển hay thiết kế lại worker proposal module, không sửa Story 21.6 hay story khác.

## Ma Trận I/O Và Biên

| Tình huống | Input / trạng thái | Kết quả / hành vi mong đợi | Xử lý lỗi |
|---|---|---|---|
| Eligible | Câu trả lời unscoped terminal có giá trị explicit được hỗ trợ, slot source-message ID khớp user message ID terminal hiện tại, và operation hợp lệ | Chiếu `eligible` với offer hiện có | Không đủ, source ID không khớp, assumption-only, hoặc ambiguous không tạo offer |
| Dismissed / invalidated | Decline cùng revision, hoặc context stale, đã xóa, scoped hay terminal không còn hợp lệ | Chiếu `dismissed` hoặc `invalidated`, không action được | Accept trả `refresh_required`, không tạo Trip |
| Accept idempotent | Owner accept một decision eligible cùng idempotency key | Một giao dịch tạo Trip, primary conversation và một proposal `pending`; replay trả kết quả cũ | Key dùng lại với request khác trả `key_reused` |
| Review boundary | Proposal pending vừa tạo | Không có `tripPlanItems`/constraints bị ghi trước Apply | Apply/dismiss dùng command review hiện có |
| Deletion race | Conversation/context bị xóa khi accept | Fence/replay scrub hiện có ngăn kết quả tái tạo được | Không lộ dữ liệu hoặc tạo orphan Trip/proposal |

</intent-contract>

## Code Map

- `packages/database/src/trip-recommendations.ts:56-79,98-131` -- aggregate owner-scoped, lock/replay accept và context fingerprint hiện hữu; thay gate context-extraction bằng eligibility từ answer terminal unscoped có per-slot source-message ID khớp terminal user message hiện tại, giữ bốn trạng thái là projection nhỏ, và chèn proposal pending trong cùng transaction accept.
- `packages/database/src/traveler-proposal-commands.ts:28-58,104-131` -- ranh giới operation/Apply hiện hữu; expose helper database-owned tối thiểu để validate operation và tạo proposal row pending mà không gọi `executeOperation` hay ghi plan.
- `packages/database/src/ai-ask-stream-execution.ts:325-383` và `packages/database/src/ai-ask-commands.ts:237-299` -- callback terminal fenced thành công là điểm duy nhất refresh eligibility; reducer session đã persist per-slot source-message ID trong cùng bounded contract, không refresh trong failure, abort, clarification hoặc outbox extraction cũ.
- `packages/database/src/schema.ts:1048-1089,1500-1507` -- `tripChangeProposals` pending và recommendation persistence hiện có; không thêm schema/migration hay dữ liệu prose/transcript.
- `packages/contracts/src/index.ts:627-656` -- contract strict cho offer/accept; chỉ mở rộng response hiện hữu nếu cần công khai metadata proposal/destination, giữ request browser chỉ gồm decision/idempotency.
- `apps/api/src/conversations/traveler-commands.controller.ts:60-73` và `apps/api/src/openapi.controller.ts` -- giữ controller/route accept hiện có và cập nhật mô tả/schema cùng route, không thêm convert endpoint.
- `apps/web/src/features/ai/direct-api-client.ts:135-138` và `apps/web/src/features/ai/ai-ask-composer.tsx:1599-1647` -- client và UI action hiện hữu tái dùng route accept, pending dedup/idempotency/navigation; dùng proposal review/workspace hiện có sau navigation.
- `tests/trip-recommendations.test.ts`, `tests/trip-recommendations.integration.test.ts`, `tests/trip-recommendations-api.integration.test.ts`, `tests/traveler-ui-foundation.test.ts` -- bằng chứng focused cho four-state projection, owner/deletion/stale fences, pending proposal duy nhất, API cũ/UI cũ và không copy transcript/pre-Apply mutation.

## Tasks & Acceptance

**Thực hiện:**
- `packages/database/src/traveler-proposal-commands.ts` -- expose validation và insertion helper tối thiểu cho proposal pending typed; helper không được mutate `tripPlanItems`, constraints hay aggregate trước Apply.
- `packages/database/src/trip-recommendations.ts` -- derive eligibility từ completed unscoped terminal answer và explicit supported values chỉ khi per-slot source-message ID bằng terminal user message ID hiện tại; duy trì four-state projection/fence hiện hữu; trong accept transaction tạo Trip, primary conversation, proposal pending đã validate, rồi consume/replay/audit.
- `packages/database/src/ai-ask-commands.ts` và `packages/database/src/ai-ask-stream-execution.ts` -- refresh recommendation chỉ sau fenced terminal success; bỏ phụ thuộc của flow mới vào background context extraction mà không tạo pipeline thứ hai.
- `packages/contracts/src/index.ts`, `apps/api/src/conversations/traveler-commands.controller.ts`, `apps/api/src/openapi.controller.ts`, `apps/web/src/features/ai/direct-api-client.ts`, `apps/web/src/features/ai/ai-ask-composer.tsx` -- evolve typed contract, existing endpoint và Vietnamese UI state khi cần; không nhận operations/prose từ browser và không thêm endpoint/UI conversion song song.
- `tests/trip-recommendations.test.ts`, `tests/trip-recommendations.integration.test.ts`, `tests/trip-recommendations-api.integration.test.ts`, `tests/traveler-ui-foundation.test.ts` -- chứng minh eligibility/dismissal/invalidation, accept idempotent, exactly-one pending proposal, owner/deletion race, no transcript copy, no pre-Apply mutation, existing API/UI route.

**Tiêu chí chấp nhận:**
- Given một answer unscoped đã completed có giá trị planning explicit được hỗ trợ và per-slot source-message ID bằng terminal user message ID hiện tại, when recommendation được tải, then nó chiếu `eligible`; source ID không khớp, ambiguous, stale, unresolved và assumption-only không eligible.
- Given recommendation eligible được chủ sở hữu accept, when command idempotent thắng fence, then một giao dịch tạo đúng một Trip, primary conversation và proposal typed `pending` hợp lệ.
- Given proposal conversion vừa được tạo, when chưa Apply, then không có Trip plan item hay constraint nào thay đổi và nội dung chat/prose/provider không được copy vào Trip/proposal.
- Given decline, stale context, scoped conversation hoặc resource deletion, when recommendation/accept chạy, then trạng thái chiếu dismissed hoặc invalidated và mutation trả `refresh_required` không tạo resource mới.
- Given browser accept flow chạy, when client gửi lệnh, then nó dùng route accept recommendation hiện có với CSRF/idempotency và đến workspace review hiện có, không có endpoint song song.

## Spec Change Log

### 2026-08-17 - Approved minor course correction
- Product owner approved extending only the existing bounded planning-session JSON contract with a flat per-supported-slot source-message-ID map.
- The map stores only the user message ID that supplied an explicit slot. It authorizes conversion only when that ID equals the current completed unscoped terminal user message ID.
- Existing aggregate `sourceMessageIds` remains a bounded aggregate list. No transcript, assistant prose, prompt, assumptions, provider payload, graph, claim, workflow, table, migration, or other persistence is authorized.

## Review Triage Log

### 2026-08-17 - Final review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - blocked pending terminal-value provenance; resolved by the approved bounded planning-session per-slot source-message-ID correction recorded above.

## Design Notes

Bốn trạng thái là projection của recommendation aggregate hiện hữu, không phải persisted workflow mới. `accepted` dùng decision consumed kèm acceptance replay; `dismissed` dùng decline fence của revision hiện tại; `invalidated` là context/terminal/owner/deletion fence không còn actionable. Proposal là biên review duy nhất: conversion chỉ persist typed operation đã validate, Apply hiện hữu mới gọi đường mutation plan.

## Verification

**Lệnh:**
- `pnpm exec vitest run tests/trip-recommendations.test.ts tests/traveler-ui-foundation.test.ts` -- focused unit/UI evidence; dùng trực tiếp nếu wrapper mở rộng scope.
- `pnpm exec vitest run --project integration tests/trip-recommendations.integration.test.ts tests/trip-recommendations-api.integration.test.ts` -- serial PostgreSQL evidence với `DATABASE_URL_TEST` đã được phê duyệt.
- `pnpm lint` -- không có error mới trong scope Story 21.7.
- `pnpm typecheck` -- TypeScript strict pass.
- `pnpm build` -- production build pass.

## Auto Run Result

Status: ready-for-dev

Historical blocking condition: The current `PlanningContextSession` stored aggregate `sourceMessageIds`, but not a source message ID for each explicit slot. Therefore Story 21.7 could not prove that a mapped `origin`, `destination`, or `adults` value came from the latest completed unscoped terminal command without either extending the bounded session contract, restoring asynchronous `chat_context` extraction as authority, or parsing stored message content. Each option violated the exact Story 21.7 constraints.

Resolution: Product owner approved the minimal bounded-session correction: persist a flat per-supported-slot source-message-ID map containing only the user message ID that supplied each explicit slot. Story 21.7 may authorize conversion only when a slot ID equals the current completed unscoped terminal user message ID. Aggregate `sourceMessageIds` remains bounded aggregate-only; no transcript, prose, prompt, assumptions, provider payload, graph, claim, workflow, table, or migration is authorized.

Implemented before the block: recommendation eligibility is terminal/unscoped/owner fenced; existing accept atomically creates a Trip, primary conversation, and validated pending typed proposal; no pre-Apply plan mutation, workflow engine, transcript/provider copy, parallel endpoint, migration, Worker, or sprint change was introduced.

Focused verification completed before the final provenance finding: `pnpm exec vitest run tests/trip-recommendations.test.ts tests/traveler-ui-foundation.test.ts` passed (2 files, 16 tests); `pnpm exec vitest run --project integration tests/trip-recommendations.integration.test.ts tests/trip-recommendations-api.integration.test.ts` passed (2 files, 27 tests); `pnpm typecheck`, `pnpm lint` (0 errors, 64 existing warnings), `pnpm build`, and `git diff --check` passed.

No commit, push, or sprint-status edit was performed. HEAD remains `f0db58c74625d3fc3764425f686a81eec3d5f109`.
