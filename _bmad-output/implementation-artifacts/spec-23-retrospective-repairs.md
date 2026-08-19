---
title: 'Epic 23: Khắc phục phát hiện retrospective'
type: 'bugfix'
created: '2026-08-19'
status: 'done'
review_loop_iteration: 0
baseline_commit: '7e3acba4a49ec616e76f3eccde07e0a355216f12'
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-23-context.md'
  - '_bmad-output/implementation-artifacts/epic-23-retro-2026-08-19.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Retrospective Epic 23 từ chối hai tiêu chí đã công bố: response phủ sóng chỉ kiểm tra tập ID mà không buộc tên hiện hành/tên cũ đúng fixture chính thức, và giao diện lượt chạy ngay không chuyển `safeErrorCode` an toàn thành hướng dẫn phục hồi tiếng Việt có thể hành động.

**Approach:** Dùng một fixture geography thuần dữ liệu dùng chung tại contracts để parser fail-closed theo mapping ID chính thức, đồng thời hiển thị copy phục hồi giới hạn cho mọi mã lỗi đã allowlist trong progress của admin Mission.

## Boundaries & Constraints

**Always:** Coverage phải gồm đúng 34 ID được quản trị, mỗi item khớp tuyệt đối current name và danh sách legacy alias của fixture versioned; giữ response metadata-only. UI chỉ nhận union `safeErrorCode` đã qua contract, hiển thị tiếng Việt thực dụng theo trạng thái/retry, và không render mã thô, diagnostic, payload, hay nguyên nhân suy đoán.

**Ask First:** Bất kỳ thay đổi nào vào danh sách đơn vị/alias chính thức, version/provenance của reference, API shape, schema, hoặc chính sách retry.

**Never:** Thêm AI call, Discovery run mới, migration, persistence, raw provider diagnostics, hay thay đổi hành vi admission/Worker/cadence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Coverage hợp lệ | Đủ 34 ID với tên và alias fixture | Parser trả danh sách nguyên vẹn | N/A |
| Mapping sai | ID hợp lệ nhưng tên hoặc alias của đơn vị khác, thiếu/thừa/đổi alias | Parser trả `null`; API fail-closed | Không có dữ liệu sai đến UI/AI |
| Retry tạm thời | Progress có mã transient và `nextRetryAt` | Hiển thị trạng thái thử lại cùng hướng dẫn kiểm tra lại sau lần retry | Không hiện mã lỗi thô |
| Kết thúc không phục hồi tự động | `retry_exhausted`, `lease_retry_exhausted`, hoặc `policy_revoked` | Hiển thị hướng dẫn vận hành Việt ngữ phù hợp | Không lộ diagnostics |

</frozen-after-approval>

## Code Map

- `packages/contracts/src/knowledge-geography.ts` -- fixture province/city browser-safe, version/provenance và mapping canonical ID sang tên hiện hành/alias; source of truth mới không phụ thuộc database.
- `packages/contracts/src/youtube-discovery/index.ts` -- `parseAdminKnowledgeProvinceCoverageList()` là response boundary; tái dùng mapping fixture để buộc name/alias chính xác.
- `packages/database/src/knowledge-geography.ts` -- tái xuất/tái dùng fixture contracts cho normalization hiện hành, tránh hai authoritative mapping và dependency ngược từ contracts sang database.
- `packages/database/src/admin-knowledge-coverage.ts` -- producer đã derive tên/alias fixture; chỉ đọc để xác nhận không đổi aggregate/query.
- `apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx` -- `ImmediateRuns` parse progress đã an toàn; thêm mapping copy recovery có exhaustive union và render gần thông tin tiến độ.
- `tests/story-23-2-province-coverage-contract.test.ts` -- tạo coverage hợp lệ từ fixture và cover mismatch tên/alias, alias thiếu/thừa.
- `tests/admin-youtube-discovery-mission-ui.test.ts` -- chứng minh từng nhóm recovery được render bằng copy tiếng Việt, không có safe error code thô.
- `tests/knowledge-geography-normalization.test.ts` và `tests/story-23-2-province-coverage.integration.test.ts` -- regression evidence cho normalization/producer, không mở rộng scope.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/knowledge-geography.ts`, `packages/contracts/src/index.ts`, và `packages/database/src/knowledge-geography.ts` -- chuyển reference thuần dữ liệu sang contracts và để database tái dùng export -- giữ một source of truth browser-safe.
- [x] `packages/contracts/src/youtube-discovery/index.ts` -- validate từng coverage item theo canonical ID, official current name và exact legacy aliases -- chặn mapping cross-layer sai ở response boundary.
- [x] `tests/story-23-2-province-coverage-contract.test.ts` -- dùng fixture tạo happy path và reject mismatch/mutation alias -- chứng minh parser fail-closed mà vẫn metadata-only.
- [x] `apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx` -- map toàn bộ safe error union sang copy recovery tiếng Việt bounded, ưu tiên retry timing và fallback an toàn -- giúp operator hành động mà không lộ diagnostics.
- [x] `tests/admin-youtube-discovery-mission-ui.test.ts` -- assert rendered copy cho transient, eligibility, exhausted và policy revocation; assert mã thô không render -- bảo vệ UX recovery thực tế.

**Acceptance Criteria:**
- Given coverage có đúng 34 canonical ID nhưng current name hoặc legacy aliases không đúng fixture ID đó, when contract parser nhận response, then nó trả `null`; response fixture-exact vẫn hợp lệ.
- Given một legacy alias bị thiếu, thêm hoặc đổi thứ tự so với fixture chính thức, when parser nhận response, then nó trả `null` và không thay đổi giới hạn metadata response.
- Given immediate progress có bất kỳ `safeErrorCode` hợp lệ nào, when Mission render progress, then operator thấy hướng dẫn phục hồi tiếng Việt theo nhóm retry/eligibility/exhausted/policy và không thấy mã lỗi thô hay diagnostic.
- Given progress đang chờ retry với `nextRetryAt`, when recovery được render, then copy không mô tả lượt chạy là thất bại cuối cùng.

## Design Notes

Fixture phải nằm ở `@xuyenviet/contracts`, không import từ database: database đã dùng contracts nên import ngược sẽ tạo cycle và kéo code database vào admin browser bundle. Exact alias ordering là intentional contract với fixture versioned; thay đổi official order phải là thay đổi fixture có chủ đích và được review.

## Verification

**Commands:**
- `pnpm test:unit -- tests/story-23-2-province-coverage-contract.test.ts tests/knowledge-geography-normalization.test.ts tests/admin-youtube-discovery-mission-ui.test.ts` -- tất cả test focused pass.
- `pnpm typecheck` -- TypeScript strict pass toàn workspace.
- `pnpm lint` -- không có lint error mới.
- `pnpm test:integration -- tests/admin-youtube-discovery-api.integration.test.ts tests/story-23-2-province-coverage.integration.test.ts` -- blocked: integration project bỏ qua file filters và chạy serial suite rộng; năm failure có sẵn tại `tests/planning-deletion.integration.test.ts` xảy ra trước khi hai test Epic 23 chạy.

## Suggested Review Order

**Geography Contract**

- Contracts own the versioned browser-safe fixture and private immutable coverage lookup.
  [`knowledge-geography.ts:16`](../../packages/contracts/src/knowledge-geography.ts#L16)

- Coverage parsing fails closed unless each ID's official mapping matches exactly.
  [`index.ts:96`](../../packages/contracts/src/youtube-discovery/index.ts#L96)

- Database normalization reuses the shared contract fixture without a reverse dependency.
  [`knowledge-geography.ts:1`](../../packages/database/src/knowledge-geography.ts#L1)

**Recovery UX**

- Exhaustive safe-code mapping provides bounded Vietnamese operator guidance.
  [`mission.tsx:109`](../../apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx#L109)

- Only a queued run with retry timing renders the automatic-retry state and guidance.
  [`mission.tsx:1306`](../../apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx#L1306)

**Regression Evidence**

- Contract tests build fixture-exact responses and reject mapping mutations.
  [`story-23-2-province-coverage-contract.test.ts:6`](../../tests/story-23-2-province-coverage-contract.test.ts#L6)

- UI tests verify recovery categories and absence of raw safe error codes.
  [`admin-youtube-discovery-mission-ui.test.ts:146`](../../tests/admin-youtube-discovery-mission-ui.test.ts#L146)

- API integration fixture follows official mappings and rejects a mismatched name.
  [`admin-youtube-discovery-api.integration.test.ts:53`](../../tests/admin-youtube-discovery-api.integration.test.ts#L53)
