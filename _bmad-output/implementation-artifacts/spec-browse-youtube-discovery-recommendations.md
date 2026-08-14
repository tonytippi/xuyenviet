---
title: 'Duyệt recommendation YouTube Discovery theo trạng thái'
type: 'feature'
created: '2026-08-14'
status: 'in-progress'
baseline_commit: '0c1cc865d07f0d92a63524ea65f87b2176804bfd'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trang YouTube Discovery hiện là hàng đợi quyết định chỉ dành cho recommendation `consider` có review state `pending`. Automation Health có thể cho biết candidate đã được recommend, nhưng operator không thể xem các URL `skip` hoặc `defer`, lý do, điểm và tiêu chí để đánh giá hoặc hiệu chỉnh Discovery.

**Approach:** Thêm một danh sách recommendation chỉ đọc trong cùng workspace, với các nút lọc `Tất cả`, `Skip`, `Defer`, `Consider`. Danh sách hiển thị URL và rationale an toàn, sắp xếp recommendation mới nhất trước; hàng đợi quyết định hiện tại và các command Accept/Để sau/Bỏ qua vẫn chỉ áp dụng cho review `consider` đang pending.

## Boundaries & Constraints

**Always:** Dùng endpoint/read model Discovery có type contract và keyset cursor riêng; chỉ expose metadata an toàn đã có (URL canonical, tiêu đề/kênh/ngày/duration, recommendation/reason, aggregate score, factors, penalties, signals, thời điểm tạo); thứ tự ổn định `createdAt DESC, recommendationId DESC`; giao diện tiếng Việt, accessible, responsive, có trạng thái tải/rỗng/lỗi và pagination rõ ràng.

**Ask First:** Dừng để hỏi trước nếu cần sửa policy/score band, thay đổi semantics của queue `consider`, expose thêm dữ liệu triage/provider/raw comment, thêm migration/index vì dữ liệu thực hoặc explain plan chứng minh cần thiết, hoặc cho phép quyết định operator trên `skip`/`defer`.

**Never:** Không thay đổi endpoint `/review` hoặc cursor `ydr2`; không suy luận review eligibility từ score; không tạo review state cho `skip`/`defer`; không expose raw comments, prompt/response, provider payload/diagnostic, ID nội bộ, capture/source/evidence/traveler data; không thêm Worker/provider/Knowledge write hay dependency mới.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Xem recommendation mới nhất | Filter `all`, có immutable recommendations | Trả URL/rationale an toàn của mọi status theo newest-first, phân trang không trùng/thiếu | Contract từ chối payload/cursor không hợp lệ |
| Lọc status | `skip`, `defer`, hoặc `consider` | Chỉ trả đúng status; đổi filter reset cursor, danh sách và selection cũ | Cursor không khớp filter trả validation error |
| Không có kết quả | Một status chưa có recommendation | UI hiển thị empty state rõ ràng, không gọi action/detail review | Không coi là lỗi vận hành |
| Bản ghi không actionable | `skip` hoặc `defer`, hoặc `consider` lịch sử | UI chỉ đọc, không render Accept/Để sau/Bỏ qua | Server action route hiện có tiếp tục là authoritative |

</frozen-after-approval>

## Code Map

- `packages/contracts/src/youtube-discovery/index.ts` -- contract/parsers strict cho queue review hiện tại; thêm browse filter, immutable recommendation item/page và cursor status-bound mới.
- `packages/domain/src/youtube-discovery/admin.ts` -- `AdminYoutubeDiscoveryPort`; thêm list read-only và cursor-validation error tách biệt để không đổi contract review.
- `packages/database/src/admin-youtube-discovery.ts` -- `listReview` là pending-consider action queue; thêm projection từ `youtubeDiscoveryRecommendations` + candidate/appearance, keyset newest-first, không join review state.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- namespace protected duy nhất; thêm GET strict-query cho browse endpoint, parse request/response và safe 400/503 envelopes.
- `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` -- workspace hiện hữu; thêm toolbar filter và browse list/detail read-only, giữ action queue và command transport tách riêng.
- `apps/admin/app/knowledge/youtube-discovery-review/review-copy.ts` -- hiện chỉ có copy `consider`; thêm exhaustive Vietnamese mapping cho closed recommendation/reason codes.
- `tests/admin-youtube-discovery-contract.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/youtube-discovery-review.integration.test.ts`, `tests/admin-youtube-discovery-review-ui.test.ts` -- mở rộng safety, authorization, keyset order/cursor, filter reset và no-actions tests.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/youtube-discovery/index.ts` và `packages/domain/src/youtube-discovery/admin.ts` -- định nghĩa browse API strict, all/status filter và cursor opaque mới -- tách immutable recommendation history khỏi action queue.
- [x] `packages/database/src/admin-youtube-discovery.ts` -- project safe immutable recommendation rows theo newest-first/keyset và filter -- cho phép xem `skip`, `defer`, `consider` mà không đổi review admission.
- [x] `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- thêm protected read route có strict status/cursor validation -- duy trì API safe envelope và authorization.
- [ ] `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` và `review-copy.ts` -- unify the candidate presentation under Consider (default), Defer, Skip, and All while preserving the pending Consider inspector/actions only -- filter/pagination fencing and read-only history behavior are in progress.
- [ ] `tests/admin-youtube-discovery-contract.test.ts`, `tests/admin-youtube-discovery-api.integration.test.ts`, `tests/youtube-discovery-review.integration.test.ts`, `tests/admin-youtube-discovery-review-ui.test.ts` -- cover parser safety, authorization, newest-first cursor, filter isolation/reset and action absence -- controller mismatch coverage added; database integration coverage remains in progress and the integration runner may block during database initialization.

**Acceptance Criteria:**
- Given operator mở YouTube Discovery, when browser list tải, then URL recommendation mới nhất hiển thị trước và mỗi item chỉ chứa safe metadata, reason, score, factors, penalties và signals.
- Given operator chọn `skip`, `defer`, `consider` hoặc `Tất cả`, when filter đổi, then danh sách chỉ chứa đúng status (hoặc mọi status), pagination/selection cũ bị reset và cursor không thể dùng chéo filter.
- Given rows có cùng creation timestamp, when phân trang, then thứ tự `recommendationId DESC` tạo tiếp nối ổn định không duplicate/omission.
- Given recommendation không phải pending `consider`, when render browser, then không có controls quyết định và không có browser write request.
- Given request/status/cursor/payload không hợp lệ, when API hoặc UI xử lý, then API fail closed với safe validation/unavailable behavior và UI không render dữ liệu unsafe.

## Design Notes

`defer` trong browser là outcome tự động, khác với operator review state `deferred`. Browse endpoint đọc immutable recommendation records; `/review` tiếp tục là action queue pending-consider có reconciliation side effects. Điều này bảo toàn route, cursor, action eligibility và semantics hiện hữu.

## Verification

**Commands:**
- `pnpm test:unit -- admin-youtube-discovery-contract.test.ts admin-youtube-discovery-review-ui.test.ts` -- expected: contract/UI parser, filter and safe display checks pass without database.
- `pnpm test:integration -- admin-youtube-discovery-api.integration.test.ts youtube-discovery-review.integration.test.ts` -- expected: protected browse API, newest-first keyset paging and immutable projection regressions pass serially.
- `pnpm typecheck` -- expected: strict contract/domain/admin UI types pass.
- `pnpm --filter @xuyenviet/admin build` -- expected: admin client builds.
- `git diff --check` -- expected: no whitespace errors.
