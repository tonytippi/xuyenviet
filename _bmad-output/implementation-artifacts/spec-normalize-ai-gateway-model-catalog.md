---
title: 'Chuẩn hóa catalog và mapping AI Gateway model'
type: 'feature'
created: '2026-08-19'
status: 'done'
review_loop_iteration: 0
baseline_commit: '5ba9d58005f719fa350b3d4ac0f6d93717189475'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-admin-ai-gateway-management.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `ai_gateway_models` đang đồng thời lưu catalog model, capability, giá và mục đích sử dụng. Một cùng gateway model phải lặp lại theo từng purpose, làm giá/cấu hình lệch nhau và khiến đổi model cho một công việc khó thao tác.

**Approach:** Chuẩn hóa `ai_gateway_models` thành catalog model dùng chung và thêm bảng `ai_purposes` để mỗi công việc (`purpose`) trỏ tới đúng một model đang được chọn. Cập nhật runtime selector, seed data và Admin để quản trị độc lập model/giá với việc gán model cho công việc.

## Boundaries & Constraints

**Always:** Giữ `ai_gateway_models.id` và mọi FK lịch sử (`ai_usage_events`, knowledge provenance, discovery triage và evaluation) không đổi; không hard-delete catalog model. Xóa `purpose` và `default_for_purpose` cùng các index/check chỉ phục vụ routing khỏi `ai_gateway_models`. Migration phải backfill `ai_purposes` từ từng row default hiện tại và fail nếu một purpose legacy có số default khác một; purpose chưa từng được cấu hình vẫn không có mapping để Admin gán sau. Selector chỉ chọn model active, được map và đáp ứng capability. `ai_purposes.purpose` là primary key, nên mỗi purpose đã gán có đúng một model; thay đổi mapping phải transaction, kiểm tra capability và được audit. Admin giữ route, xác thực, CSRF và Vietnamese-first UX hiện tại, nhưng tách rõ catalog model/giá khỏi bảng gán công việc-model. Mọi giá tiếp tục là decimal trên UI và integer micros cho 1,000,000 tokens khi lưu.

**Ask First:** Dữ liệu hiện có có nhiều row cùng `gateway_model_name` nhưng capability hoặc giá khác nhau. Không tự động hợp nhất, đổi ID lịch sử, hay chọn giá "đúng" khi dữ liệu mâu thuẫn; chỉ hợp nhất catalog nếu có một quy tắc dữ liệu được duyệt rõ ràng.

**Never:** Không lộ credentials hay payload provider; không browser-side gateway call; không đổi các caller runtime thành một routing API mới; không sửa migration lịch sử; không xóa hay làm null tham chiếu model lịch sử để làm sạch bản ghi trùng.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Forward migration | Catalog cũ chứa purpose/default và record được lịch sử tham chiếu | `ai_purposes` được backfill theo ID default cũ; catalog bỏ routing fields và selector mới trả cùng model trước migration. | Migration fail nguyên tử nếu một purpose không có hoặc có nhiều default cũ. |
| Đổi model công việc | Admin gán một catalog model active, đủ capability cho purpose | Mapping duy nhất của purpose chuyển sang model mới, được audit; lần chạy sau dùng model mới. | Model inactive hoặc thiếu capability bị từ chối, mapping cũ không đổi. |
| Cập nhật catalog | Admin sửa nhãn, capability hay giá | Catalog dùng chung được cập nhật một lần và mọi mapping hiển thị dữ liệu mới. | Không cho archive model còn đang được map; phải chuyển mapping trước. |
| Lịch sử | Usage/provenance tham chiếu catalog model cũ | ID và pricing snapshot lịch sử vẫn đọc được sau khi đổi mapping hay archive. | Xóa catalog bị DB/application từ chối. |

</frozen-after-approval>

## Code Map

- `packages/database/src/schema.ts` -- `aiGatewayModels` đang trộn `purpose/defaultForPurpose`; thêm `aiPurposes`, xóa routing fields/index/check khỏi catalog và giữ catalog ID/FK lịch sử.
- `drizzle/migrations/` -- thêm migration tiến tới để backfill `ai_purposes` từ default cũ trước khi bỏ cột/index/check cũ; không chỉnh migration đã áp dụng hoặc đổi ID catalog.
- `packages/database/src/models.ts` -- `selectActiveAiGatewayModel` là selector trung tâm; join mapping và catalog nhưng giữ interface caller/pricing snapshot hiện tại.
- `packages/database/src/index.ts` -- adapter `createPostgresAdminAiModelCatalogPort` đang CRUD record gộp; tách list/catalog mutation và upsert `ai_purposes` trong exact-admin transaction, audit cả hai loại thay đổi.
- `packages/domain/src/admin-ai-model-catalog.ts` -- port/policy hiện validate default theo purpose; tách contract domain catalog và assignment, tái dùng capability policy cho mapping.
- `packages/contracts/src/index.ts` -- `AdminAiGatewayModel` và parser hiện chứa `purpose/defaultForPurpose`; định nghĩa DTO/parser riêng cho catalog và mapping.
- `apps/api/src/admin/admin-ai-models.controller.ts` -- mở rộng endpoint quản lý mapping, giữ protected browser-session/admin-capability boundary và lỗi an toàn.
- `apps/admin/app/ai-models/ai-model-catalog.tsx` -- client Admin hiện gộp model/purpose/default; tách Catalog model và bảng “Gán model cho công việc”, tiếp tục CSRF, redirect 401 và input giá hiện có.
- `apps/admin/app/ai-models/page.tsx` và `apps/admin/app/admin-access-gate.tsx` -- route/nav hiện hữu cho surface quản trị này.
- `scripts/db-seed-data.ts`, `scripts/story-20-5-fixture.ts`, `tests/**/*.test.ts` -- seed và test fixture insert trực tiếp purpose/default vào catalog; chuyển sang tạo catalog rồi mapping.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/schema.ts` và migration Drizzle mới -- thêm `ai_purposes` với `purpose` primary key và `ai_gateway_model_id`; backfill từ default record cũ, xóa `purpose/default_for_purpose` cùng routing index/check khỏi catalog và giữ toàn bộ historical FK theo catalog ID.
- [x] `packages/database/src/models.ts`, `scripts/db-seed-data.ts` và các fixture/seed phụ thuộc -- chọn active catalog model qua `ai_purposes`; tạo catalog trước rồi upsert purpose mapping trong seed/test data.
- [x] `packages/contracts/src/index.ts`, `packages/domain/src/admin-ai-model-catalog.ts`, `packages/database/src/index.ts`, `apps/api/src/admin/admin-ai-models.controller.ts` -- tách DTO, policy, endpoint và adapter transaction cho catalog CRUD và assign purpose-to-model có capability/audit.
- [x] `apps/admin/app/ai-models/ai-model-catalog.tsx` -- tách UI thành catalog model (metadata, capability, pricing, archive) và mapping công việc (model hiện dùng, capability, chọn model), không còn purpose/default trong form catalog.
- [x] `tests/` -- bổ sung/cập nhật regression cho migration/selector/mapping admin: một model dùng nhiều purpose, atomic remap, capability/inactive rejection, archive safety, historical model IDs/pricing snapshot; cập nhật fixture trực tiếp cũ.
- [x] `_bmad-output/implementation-artifacts/spec-normalize-ai-gateway-model-catalog.md` và `sprint-status.yaml` -- ghi trạng thái thực thi, kết quả verification, review và thay đổi phạm vi nếu có.

### Review Findings

- [x] [Review][Patch] Catalog model can still be hard-deleted after unmapping [drizzle/migrations/0081_prevent_ai_gateway_model_deletion.sql:1]
- [x] [Review][Patch] Required migration and administrative-remap regression coverage is absent [tests/ai-model-catalog-normalization.integration.test.ts:8]

**Acceptance Criteria:**
- Given các model-purpose record hiện có, when migration hoàn tất, then mọi purpose có một record `ai_purposes` trỏ tới model default trước đó, `ai_gateway_models` không còn routing fields, và mọi FK lịch sử vẫn trỏ đúng cùng catalog model ID.
- Given một catalog model active đáp ứng capability, when admin map model đó cho nhiều purpose, then mỗi purpose chọn model này ở runtime mà metadata và giá chỉ được lưu/quản trị một lần.
- Given admin đổi mapping của một purpose, when transaction thành công, then chỉ purpose đó dùng model mới, mapping trước bị thay thế nguyên tử và audit event ghi nhận thay đổi.
- Given model inactive hoặc thiếu capability, when admin cố map nó, then API/UI báo lỗi an toàn và mapping hợp lệ hiện có không đổi.
- Given model còn được mapping, when admin archive nó, then thao tác bị từ chối cho đến khi các purpose được remap; given model không còn map, when archive thành công, then lịch sử vẫn truy xuất được.
- Given admin mở trang AI Models, when catalog và mapping được tải, then họ có thể quản lý giá/capability riêng với thao tác chuyển model cho từng công việc, không thấy secrets.

## Design Notes

Giữ tên bảng `ai_gateway_models` cho catalog là cách ít rủi ro nhất vì mọi dữ liệu lịch sử đã dùng ID của bảng này. `ai_purposes` có `purpose` làm primary key, `ai_gateway_model_id` FK và timestamps; mỗi công việc vì thế có đúng một model đang được gán, không còn khái niệm default dư thừa. Bảng này là source of truth cho routing; pricing snapshot đã ghi vẫn độc lập với các lần remap sau này.

## Verification

**Commands:**
- `pnpm test:unit` -- expected: contract/domain/UI-client checks không cần PostgreSQL pass.
- `pnpm test:integration` -- expected: migration, selector, admin persistence và các consumer fixture PostgreSQL pass tuần tự.
- `pnpm typecheck` -- expected: contracts, selector, API và Admin compile strict-safe.
- `pnpm lint` -- expected: không có ESLint errors mới.
- `pnpm build` -- expected: Admin/API workspace production build pass.

## Spec Change Log

- Review phát hiện migration bị siết sai khi yêu cầu mọi purpose phải có legacy default, trong khi deployment có thể chưa cấu hình purpose mới. Migration giữ yêu cầu đúng một default cho mỗi purpose legacy đang tồn tại; purpose chưa cấu hình được Admin gán sau. Giữ catalog ID, mapping là routing source of truth, và seed đủ sáu purpose.

**Outcome:** `pnpm typecheck`, `pnpm test:unit` (46 files, 392 tests), `pnpm test:integration` (75 files, 701 tests, bao gồm migrate PostgreSQL từ đầu), và `pnpm build` đều pass. `pnpm lint` không có error mới nhưng báo các warning có sẵn ngoài phạm vi thay đổi, gồm quy tắc `<img>` trong Admin discovery review và unused symbols ở các module cũ.

## Suggested Review Order

**Schema and migration**

- Tách catalog khỏi routing nhưng giữ nguyên ID cho mọi provenance lịch sử.
  [`schema.ts:1538`](../../packages/database/src/schema.ts#L1538)

- Backfill mapping trước khi loại bỏ cột routing legacy.
  [`0080_normalize_ai_gateway_model_catalog.sql:1`](../../drizzle/migrations/0080_normalize_ai_gateway_model_catalog.sql#L1)

**Runtime and administration**

- Selector join mapping để caller runtime giữ interface hiện có.
  [`models.ts:56`](../../packages/database/src/models.ts#L56)

- Transaction bảo toàn capability của model đang được gán và audit remap.
  [`index.ts:454`](../../packages/database/src/index.ts#L454)

- API quản lý catalog và gán purpose qua boundary admin hiện hữu.
  [`admin-ai-models.controller.ts:16`](../../apps/api/src/admin/admin-ai-models.controller.ts#L16)

**Admin and regression coverage**

- UI tách form catalog khỏi bảng gán model cho công việc.
  [`ai-model-catalog.tsx:70`](../../apps/admin/app/ai-models/ai-model-catalog.tsx#L70)

- Seed dùng chung một catalog model cho nhiều purpose, đủ sáu purpose.
  [`db-seed-data.ts:15`](../../scripts/db-seed-data.ts#L15)

- Regression kiểm tra reuse model, capability gate và FK restrict.
  [`ai-model-catalog-normalization.integration.test.ts:8`](../../tests/ai-model-catalog-normalization.integration.test.ts#L8)
