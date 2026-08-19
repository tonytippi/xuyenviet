---
title: 'Rút ngắn thiết lập test integration'
type: 'refactor'
created: '2026-08-19'
status: 'done'
review_loop_iteration: 0
baseline_commit: '1670f9300e0c36375ca55e652ca6c1076bf8b7a9'
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Test integration dùng chung PostgreSQL chạy tuần tự, nhưng nhiều lần reset lại truy vấn metadata bảng và hai regression suite lặp lại migration, seed, hoặc reset không cần thiết. Điều này kéo dài vòng phản hồi mà không tăng độ bao phủ.

**Approach:** Giữ nguyên database dùng chung và isolation tường minh của từng test; chỉ loại bỏ công việc setup lặp lại đã được chứng minh dư thừa, sau đó đo lại unit và integration độc lập.

## Boundaries & Constraints

**Always:** Duy trì `fileParallelism: false` và `maxWorkers: 1`; mọi test cần dữ liệu sạch vẫn gọi `resetTestDatabase()` cục bộ; reset vẫn truncate toàn bộ bảng, reset identity và seed fixture địa lý; migration cutover vẫn kiểm thử cả đường thất bại lẫn thành công.

**Ask First:** Không áp dụng isolation bằng database/schema riêng cho worker hoặc thay đổi phạm vi command CI ngoài các script test được nêu trong spec.

**Never:** Không thêm global reset hook, không bật parallel integration, không bỏ test compiled worker process, không thay migration thật bằng mock, và không bỏ seed baseline mà assertions phụ thuộc.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reset bình thường | Schema migrated ổn định | Dùng danh sách bảng đã cache, truncate và seed fixture như trước | Không đổi hành vi DB lỗi |
| Schema bị dựng lại | Test drop/create `public` | Cache bị invalidated trước reset kế tiếp | Khám phá lại bảng hiện hữu |
| Story 8.6 nhiều case | Một suite có seed baseline cho mỗi case | Migrate một lần, mỗi case vẫn reset và seed độc lập | Giữ cleanup an toàn |
| Story 8.5 case kế tiếp | `beforeEach` luôn reset và seed | Không chạy thêm reset ở `afterEach` | Case sau vẫn có baseline sạch |

</frozen-after-approval>

## Code Map

- `tests/helpers/db.ts` -- `resetTestDatabase()` hiện discovery `information_schema` mỗi lần; thêm cache nội bộ và API invalidate tường minh.
- `tests/story-8-6-actor-isolation.test.ts` -- `beforeEach` đang drop schema, migrate và seed cho bốn case; tách migration một lần khỏi baseline reset/seed mỗi case.
- `tests/story-8-5-clean-break.test.ts` -- `beforeEach` đã reset trước seed, còn `afterEach` reset dư trước `beforeEach` kế tiếp.
- `tests/provenance-cutover-migration.test.ts` -- rebuild schema trong test migration; phải invalidate cache sau khi dựng schema.
- `tests/integration-global-setup.ts` -- migration suite-level hiện hữu, không thay đổi.
- `tests/worker-adapter-boundary.test.ts` -- compiled adapter process boundary; giữ nguyên như coverage có chủ đích.

## Tasks & Acceptance

**Execution:**
- [x] `tests/helpers/db.ts` -- cache danh sách public base tables sau discovery đầu tiên và export hàm invalidate; vẫn truncate, restart identity, cascade và seed fixture -- loại bỏ query metadata lặp lại mà vẫn xử lý schema rebuild tường minh.
- [x] `tests/story-8-6-actor-isolation.test.ts` -- chạy drop/create schema và migration một lần trong suite; reset, seed fixture đầy đủ cho từng case; invalidate table cache sau schema rebuild -- bỏ ba migration cycle nhưng giữ test isolation.
- [x] `tests/provenance-cutover-migration.test.ts` -- invalidate cache sau drop/create schema -- tránh reset kế tiếp dùng danh sách bảng cũ.
- [x] `tests/story-8-5-clean-break.test.ts` -- bỏ `afterEach` reset trùng lặp -- `beforeEach` vẫn thiết lập một database sạch và seeded cho mỗi case.
- [x] `package.json` -- thêm command hẹp để chạy compiled worker-boundary riêng nếu config hiện hữu cho phép tách mà không đổi coverage mặc định; không tách nếu làm thay đổi semantic của `test:integration`.
- [x] `tests/**/*` -- chạy test hẹp của các suite bị ảnh hưởng, rồi đo lại `pnpm test:unit` và `pnpm test:integration` theo thứ tự tuần tự.

**Acceptance Criteria:**
- Given một schema không đổi, when nhiều test gọi `resetTestDatabase()`, then metadata bảng chỉ được discovery một lần nhưng mỗi reset vẫn tạo state fixture sạch tương đương.
- Given Story 8.6 chạy bốn case, when suite chạy, then migration chỉ chạy một lần và từng case vẫn bắt đầu từ seed data đầy đủ.
- Given Story 8.5 chuyển giữa hai case, when case sau bắt đầu, then operator và source fixture được seed lại dù không còn reset trong `afterEach`.
- Given một test dựng lại `public`, when reset được gọi sau đó, then helper không dùng cache stale.
- Given full test projects chạy tuần tự trong môi trường đã cài đủ dependencies và test database hợp lệ, when đo wall-clock, then unit và integration hoàn tất không có lỗi framework, và báo cáo nêu rõ thời lượng trước/sau.

## Design Notes

Cache bảng thuộc module test DB, không phải global hook. Invalidation tường minh ở hai test phá schema giữ đúng ownership hiện tại: test nào thay schema phải khai báo hậu quả với test infrastructure.

## Verification

**Commands:**
- `pnpm test:integration -- tests/story-8-5-clean-break.test.ts` -- expected: seed regression passes.
- `pnpm test:integration -- tests/story-8-6-actor-isolation.test.ts` -- expected: migration/seed isolation regression passes.
- `pnpm test:integration -- tests/provenance-cutover-migration.test.ts` -- expected: cutover rejection and admission pass.
- `pnpm test:unit` -- expected: all unit files pass without missing environment dependencies.
- `pnpm test:integration` -- expected: serialized PostgreSQL suite passes; record elapsed time.

## Kết quả Xác Minh

- `pnpm install --frozen-lockfile` -- khôi phục `happy-dom` đúng lockfile.
- `pnpm lint` -- thành công, không có lỗi; còn 64 cảnh báo có sẵn ngoài phạm vi thay đổi.
- `pnpm typecheck` -- thành công.
- `pnpm test:unit` -- 46 file, 392 test pass trong 3,67 giây.
- `pnpm test:integration` -- 74 file, 698 test pass; Vitest 153,11 giây, wall-clock 2 phút 34 giây.
- Fresh test database đã phát hiện migration `0073` dùng escape regex không hợp lệ với PostgreSQL. Migration được sửa cho fresh install và `0079` sửa constraint trên database đã có migration ledger.

## Suggested Review Order

**Reset Và Isolation**

- Cache discovery bảng, nhưng yêu cầu invalidate sau test dựng lại schema.
  [`db.ts:17`](../../../tests/helpers/db.ts#L17)

- Migrate một lần, còn mỗi case vẫn nhận baseline reset và seed độc lập.
  [`story-8-6-actor-isolation.test.ts:47`](../../../tests/story-8-6-actor-isolation.test.ts#L47)

- Đảm bảo cutover test luôn khôi phục database dùng chung khi assertion lỗi.
  [`provenance-cutover-migration.test.ts:12`](../../../tests/provenance-cutover-migration.test.ts#L12)

**Migration Fresh Và Upgrade**

- Fresh database dùng regex ngày PostgreSQL hợp lệ.
  [`0073_normalize_knowledge_province_references.sql:11`](../../../drizzle/migrations/0073_normalize_knowledge_province_references.sql#L11)

- Database đã migrate nhận cùng constraint qua migration forward.
  [`0079_fix_knowledge_province_reference_effective_date_check.sql:1`](../../../drizzle/migrations/0079_fix_knowledge_province_reference_effective_date_check.sql#L1)

**Regression Và Công Cụ**

- Bỏ reset hậu kỳ dư vì `beforeEach` đã dựng baseline cho từng case.
  [`story-8-5-clean-break.test.ts:45`](../../../tests/story-8-5-clean-break.test.ts#L45)

- So sánh fixture tỉnh thành không còn phụ thuộc database collation.
  [`knowledge-geography-normalization.integration.test.ts:84`](../../../tests/knowledge-geography-normalization.integration.test.ts#L84)

- Có command hẹp để chạy riêng worker boundary thực.
  [`package.json:17`](../../../package.json#L17)
