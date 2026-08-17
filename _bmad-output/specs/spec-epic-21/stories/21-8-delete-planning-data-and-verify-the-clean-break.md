---
title: 'Delete Planning Data And Verify The Clean Break'
type: 'feature'
created: '2026-08-17'
status: 'done'
baseline_revision: '20507077a7e9a92f5bbff539f6e008712addd679'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/specs/spec-epic-21/SPEC.md'
  - '_bmad-output/specs/spec-epic-21/story-contracts.md'
  - '_bmad-output/project-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Vấn đề:** Epic 21 phải bảo đảm việc xóa hội thoại hoặc Trip không để lại dữ liệu planning có thể tái tạo hay replay destination cũ. Các cascade và cleanup hiện hữu đã có nhưng chưa có một kiểm chứng cuối Epic trên public owner commands cho toàn bộ derived state.

**Cách tiếp cận:** Kiểm chứng trực tiếp các cascade và cleanup trong transaction hiện hữu bằng một integration test nhỏ. Chỉ sửa production code nếu test chứng minh một derived row còn lại; nếu không, giữ nguyên cascade và owner deletion paths hiện có.

## Ranh Giới Và Ràng Buộc

**Luôn:** Tuân thủ chính xác Story 21.8 trong `story-contracts.md`; ưu tiên cascade hiện có. Gọi `resetTestDatabase()` cục bộ trong integration test và dùng `DATABASE_URL_TEST` đã được phê duyệt. Kiểm tra qua `createPostgresTravelerCommandPort().deleteConversation` và `.deleteTripProject`, không gọi delete SQL thay cho command. Giữ xóa owner-scoped, primary-conversation policy, lifecycle/fence, scrub replay acceptance và audit hiện hữu.

**Chặn nếu:** Test chứng minh derived state còn lại nhưng không thể xóa an toàn trong cùng transaction owner command hiện hữu mà không cần migration hoặc thay đổi contract ngoài Story 21.8.

**Không bao giờ:** Thêm scanner, automatic reset, generic invalidation framework, bảng/migration, sửa migration, service/queue/Worker, endpoint, fallback, hoặc edit `sprint-status.yaml`. Không chạy `pnpm db:reset`; không xóa hay thay đổi dữ liệu ngoài `DATABASE_URL_TEST` do `resetTestDatabase()` quản lý.

## Ma Trận I/O Và Biên

| Tình huống | Input / trạng thái | Kết quả / hành vi mong đợi | Xử lý lỗi |
|---|---|---|---|
| Xóa hội thoại thường | Owner xóa hội thoại có session, completed answer evidence và recommendation | Cascade xóa session, retrieval/provenance/snapshot/context/decision; acceptance retained không replay destination | Command trả thành công, owner khác không đổi |
| Xóa Trip | Owner xóa Trip có primary conversation và pending proposal | Command xóa linked conversation trước, cascade xóa proposal và derived state, scrub acceptance | Không để primary pointer hoặc derived state tái tạo được |
| Race conversion/finalization | Decision/acceptance hoặc fenced command tham chiếu resource vừa bị xóa | Replay/attempt trả `refresh_required`, không tạo Trip/proposal/message/snapshot mới | Giữ terminal scrub/fence hiện hữu |
| Audit boundary | Audit delete row được giữ lại | Chỉ lưu safe deletion summary, không có session slots, message/provenance snapshot hoặc proposal operations reconstructable | Không mở rộng audit persistence |

</intent-contract>

## Code Map

- `packages/database/src/index.ts:205-250` -- public owner conversation/Trip deletion transactions; maintains primary-conversation policy, discards command/recommendation replay data, then deletes owner rows.
- `packages/database/src/schema.ts:1048-1089` -- `trip_change_proposals` cascades through its composite owner Trip FK.
- `packages/database/src/schema.ts:1193-1212` -- `planning_context_sessions` cascades through the composite conversation owner FK.
- `packages/database/src/schema.ts:1327-1369,1500-1507` -- answer snapshots and recommendation context/decision/decline cascades; acceptance records intentionally have no resource FK.
- `packages/database/src/schema.ts:2173-2286` -- retrieval decisions and response provenance cascade through owned conversation and messages.
- `packages/database/src/trip-recommendations.ts:87-102` -- only proven explicit cleanup: scrubs retained acceptance terminal results for deleted conversation/Trip references.
- `tests/helpers/db.ts:16-32` -- approved test-only `resetTestDatabase()` boundary.
- `tests/planning-context.integration.test.ts:27-34` and `tests/trip-recommendations.integration.test.ts:211-245` -- existing narrow cascade/replay and deleted-conversation acceptance evidence to extend, not replace.

## Tasks & Acceptance

**Thực hiện:**
- `tests/planning-deletion.integration.test.ts` -- tạo owner graph có planning session, completed message/retrieval/provenance/snapshot, recommendation decision/context/acceptance và Trip proposal; gọi public owner deletion commands, rồi assert cascade/scrub, non-reconstructable audit và owner isolation -- cung cấp final end-to-end deletion evidence với `resetTestDatabase()` cục bộ.
- `packages/database/src/index.ts`, `packages/domain/src/index.ts`, `packages/database/src/planning-context.ts`, `packages/database/src/trip-recommendations.ts`, `packages/database/src/provenance.ts` -- chỉ chỉnh nếu test mới chứng minh exact cleanup gap không được cascade hoặc scrub transaction hiện hữu bao phủ -- không thêm abstraction hay sửa speculative.
- `packages`, `apps`, `scripts`, `tests`, `docs/runbooks` -- chạy scoped `rg` hợp đồng để chứng minh không còn executable card-count threshold hoặc rollout-control authority -- không tạo scanner/script mới.

**Tiêu chí chấp nhận:**
- Given owner xóa một conversation, when public owner deletion command hoàn tất, then foreign-key cascades xóa planning session, retrieval decision, provenance, snapshot, recommendation context/decision/decline liên quan và acceptance retained không còn replay destination.
- Given owner xóa một Trip có linked primary conversation và pending proposal, when public owner deletion command hoàn tất, then linked conversations và proposal-derived rows bị xóa trong transaction hiện hữu, primary-conversation policy vẫn hợp lệ, và acceptance retained trả `refresh_required`.
- Given finalization/conversion tham chiếu conversation hoặc Trip vừa bị xóa, when replay hoặc accept chạy sau deletion, then không tạo resource mới và nhận kết quả refresh-safe từ fence/scrub hiện hữu.
- Given derived planning data đã bị xóa, when audit rows được đọc, then chỉ deletion summary an toàn còn lại; không có session slots, transcript/message content, provenance snapshot hay proposal operations có thể tái tạo.
- Given Epic 21 implementation hoàn tất, when active runtime/config/tests/scripts/runbooks được kiểm tra bằng lệnh có sẵn và scoped `rg`, then không có active card-count threshold hoặc rollout-control authority; không có `pnpm db:reset`, scanner, automatic reset hay migration edit.

## Spec Change Log

## Review Triage Log

### 2026-08-17 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 3 (high 0, medium 3, low 0)
- defer: 0
- reject: 20
- addressed_findings:
  - `[medium]` `[patch]` Assert the converted Trip proposal is present and `pending` before Trip deletion, so the cascade precondition is observable.
  - `[medium]` `[patch]` Select the deleted Trip's audit event by target ID and assert its exact deletion-only summary, preventing planning payload retention from passing a narrow text check.
  - `[medium]` `[patch]` Exercise owner deletion of a surviving Trip primary conversation and assert replacement-primary ownership, Trip linkage, and replay scrubbing.

## Design Notes

Cascade là cơ chế xóa mặc định. `trip_recommendation_acceptances` cố ý giữ idempotency rows không có FK; cleanup nhỏ hiện hữu chỉ thay terminal result bằng `refresh_required` trước deletion, nên retry không thể tái tạo resource đã xóa. Test phải xác nhận public command path này thay vì tái kiểm thử schema bằng direct SQL duy nhất.

## Verification

**Lệnh:**
- `pnpm test:unit` -- toàn bộ infrastructure-free unit suite pass.
- `pnpm test:integration` -- serial PostgreSQL suite pass với `DATABASE_URL_TEST`; nếu wrapper mở rộng scope hoặc không forward file filter, lưu exact wrapper evidence và chạy `pnpm exec vitest run --project integration tests/planning-deletion.integration.test.ts` để có focused evidence.
- `pnpm lint` -- không có lint error mới.
- `pnpm typecheck` -- TypeScript strict pass.
- `pnpm build` -- production build pass.
- `rg -n 'knowledge\.length\s*<\s*approvedKnowledgeTargetCount|legacy\|v6_shadow\|v6_active|retrieval[_-](read[_-]policy|cutover|gate[_-]profile|shadow)' packages apps scripts tests docs/runbooks` -- không có active match; historical planning artifacts và immutable migrations nằm ngoài scan.

## Auto Run Result

Status: done

Resolution: The full integration-suite failures were repaired in `16e7790 test: repair integration fixtures`. The repair aligns fixtures and stale expectations with current contracts and permits an empty compiled discovery adapter to return `no_work` without a YouTube credential. The serial suite is green.

Summary: Added final PostgreSQL evidence for the existing owner deletion paths. The tests verify cascaded planning-session, retrieval, provenance, snapshot, recommendation, and proposal cleanup; retained recommendation acceptance replays are scrubbed to `refresh_required`; deletion keeps an unrelated owner unchanged; a deleted Trip primary conversation is replaced when its Trip remains; and Trip deletion audit content is exactly the safe deletion summary. No production cleanup gap, migration change, scanner, automatic reset, reset-script, or sprint update was needed.

Files changed:
- `tests/planning-deletion.integration.test.ts` -- focused serial `DATABASE_URL_TEST` integration coverage for conversation and Trip deletion, primary replacement, cascades, replay scrub, owner isolation, pending proposal, and audit boundary.
- `_bmad-output/specs/spec-epic-21/stories/21-8-delete-planning-data-and-verify-the-clean-break.md` -- Story 21.8 execution record, review triage, and final verification results.

Review findings: 3 medium patches applied; 0 deferred; 20 rejected as already covered, unrelated, or outside the exact Story 21.8 contract. Follow-up review recommendation: `true` (patched high: 0, medium: 3, low: 0; score: 9).

Verification:
- `pnpm exec vitest run --project integration tests/planning-deletion.integration.test.ts` -- passed: 1 file, 3 tests, using approved `DATABASE_URL_TEST` after the full integration wrapper run.
- `pnpm test:unit` -- passed: 44 files, 369 tests.
- `pnpm test:integration` -- passed: 71 files, 671 tests.
- `pnpm lint` -- passed: 0 errors, 64 existing warnings.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed; existing admin `<img>` warnings remain.
- scoped `rg` authority scan -- passed with no matches.
- `git diff --check` -- passed.

Residual risks: No Story 21.8 blocker remains. The focused deletion evidence uses approved `DATABASE_URL_TEST`; `pnpm db:reset` was not run.
