---
title: 'Story 22.3: Hiển thị bằng chứng video và chứng minh chất lượng ưu tiên tiếng Việt'
type: 'feature'
created: '2026-08-15'
status: 'done'
baseline_commit: 'b46f589461153e9f8d3a111889ba9ec4100e1677'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-22-context.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Control Tower hiện không hiển thị đủ metadata video an toàn để operator đánh giá relevance, reach và freshness cho người dùng Việt. Primary queue cũng chưa chứng minh được rằng chỉ nội dung Vietnamese-first hợp lệ được review, trong khi foreign fallback và gate failure phải được quan sát riêng.

**Approach:** Mở rộng projection read-only, contract typed và UI review/Mission/Health để hiển thị metadata video đã lưu, tách `foreign_fallback` khỏi primary review, và tạo measurement chỉ trên recommendation của policy Vietnamese-first. Không thay đổi lifecycle, worker hay dữ liệu lịch sử.

## Boundaries & Constraints

**Always:** Primary review và Action Required chỉ nhận recommendation `consider` có appearance new-policy `eligible_vietnamese`, `languageFit` là `vi` hoặc `likely_vi`; row/inspector hiển thị thumbnail an toàn, title, channel, duration, views định dạng `vi-VN`, publish timestamp chính xác + relative age, query snapshot, nhãn tiếng Việt và safe eligibility reason. `foreign_fallback` chỉ ở khu vực/read projection `Nguồn ngoại ngữ bổ sung`, không có primary review semantics và không vào Vietnamese-fit numerator. Mission/Health chỉ trả aggregate bounded cho `too_short`, `duration_unknown`, `non_vietnamese`, `language_unknown` và fallback. Measurement chọn duy nhất recommendation mang Vietnamese-first policy version: `vi|likely_vi` / `consider` >= 80%; `unknown` không vào tử số; `defer|consider` dưới minimum-duration snapshot bằng 0. Mọi projection read-only, role-protected, Vietnamese-first, responsive, keyboard/screen-reader accessible và không chỉ dùng màu để truyền trạng thái.

**Ask First:** Dừng để hỏi nếu cần migration, persistence mới, backfill/reclassify/reconcile historical rows, thay đổi ngưỡng hoặc mẫu đo 80%, đưa fallback vào primary queue/ranking, thêm provider/dependency/credential/env, hoặc thêm command/action cho fallback.

**Never:** Không expose description, tags, raw comments, prompt/response, provider payload, transcript, media, evidence span, capture internals hay credential. Không tạo source/capture/ingestion/evidence/card/publication state; không gọi hoặc schedule `youtube:capture` hay Gemini. Không làm mutation, audit, Usage, review state, Knowledge handoff, worker lease/fence/retry hoặc retention nào từ read projection.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Primary candidate | New-policy `consider`, `eligible_vietnamese`, `vi|likely_vi` | Primary queue/inspector có metadata safe, query snapshot, Vietnamese label và trust boundary | Thiếu metadata optional có fallback presentation an toàn, không lộ raw input |
| Gate failure | New-policy appearance `too_short`, `duration_unknown`, `non_vietnamese`, hoặc `language_unknown` | Không xuất hiện ở Action Required/primary queue; chỉ tăng aggregate reason tương ứng | Read chỉ select, không reconcile hay tạo work |
| Foreign fallback | Appearance đã là `foreign_fallback` | Chỉ hiển thị tách biệt dưới `Nguồn ngoại ngữ bổ sung`; không có primary action/ranking | Exclude khỏi primary numerator và Action Required |
| Quality evidence | New-policy `consider`/`defer` hỗn hợp, có legacy rows | Report policy-scoped tỷ lệ Vietnamese fit, fallback riêng, duration violation bằng 0 | Legacy bị loại khỏi query, không bị mutate |

</frozen-after-approval>

## Code Map

- `packages/contracts/src/youtube-discovery/index.ts` -- mở rộng strict typed parsers/read models cho review, Mission và Health bằng metadata/aggregate an toàn; reject mọi raw/provider/capture field.
- `packages/domain/src/youtube-discovery/admin.ts` -- giữ port read-only, bổ sung projection typed cần thiết mà không đổi command Accept/Defer/Skip.
- `packages/database/src/admin-youtube-discovery.ts` -- `listReview`, `getReview`, `candidateActionFrontier`, `missionFunnel`, `healthOverview` và projection helpers; tái dùng appearance provenance đã có, lọc primary theo immutable new-policy eligibility và tạo select-only aggregate/measurement.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- expose các read contracts role-protected hiện có hoặc endpoint GET read-only riêng nếu fallback projection không thuộc queue contract.
- `apps/admin/app/knowledge/youtube-discovery-review/review.tsx` -- mở rộng desktop queue/inspector và narrow reflow bằng metadata formatted, trust copy, fallback section tách biệt, live/focus behavior hiện có.
- `apps/admin/app/knowledge/youtube-discovery-review/review-copy.ts` -- ánh xạ closed reason/language sang tiếng Việt có dấu; không render internal codes.
- `apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx` và `apps/admin/app/knowledge/youtube-discovery/health/health.tsx` -- render aggregate và measurement/fallback riêng bằng copy Vietnamese-first.
- `tests/admin-youtube-discovery-contract.test.ts`, `tests/youtube-discovery-review.integration.test.ts`, `tests/youtube-discovery-action-required.integration.test.ts`, `tests/youtube-discovery-mission.integration.test.ts` -- contract safe-field, primary isolation, immutable query provenance, select-only aggregate và measurement policy scoped.
- `tests/admin-youtube-discovery-review-ui.test.ts`, `tests/admin-youtube-discovery-mission-ui.test.ts`, `tests/admin-youtube-discovery-health-ui.test.ts` -- metadata formatting, Vietnamese copy, fallback separation, responsive/accessibility và no-raw-data boundary.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/youtube-discovery/index.ts`, `packages/domain/src/youtube-discovery/admin.ts`, `apps/api/src/admin/admin-youtube-discovery.controller.ts` -- định nghĩa và expose read-only typed contracts cho primary metadata, fallback và bounded quality aggregates -- giữ transport safe và role-protected.
- [x] `packages/database/src/admin-youtube-discovery.ts` -- project safe appearance metadata; đồng nhất filter primary queue/Action Required; thêm fallback/aggregate/quality queries chỉ đọc và policy scoped -- ngăn legacy, gate failure và fallback lẫn vào primary.
- [x] `apps/admin/app/knowledge/youtube-discovery-review/review.tsx`, `review-copy.ts`, `mission/mission.tsx`, `health/health.tsx` -- hiển thị Vietnamese-first metadata, trust boundary, fallback riêng và aggregate accessible -- giúp operator đánh giá mà không nhầm tín hiệu với evidence Knowledge.
- [x] `tests/admin-youtube-discovery-contract.test.ts`, `tests/youtube-discovery-review.integration.test.ts`, `tests/youtube-discovery-action-required.integration.test.ts`, `tests/youtube-discovery-mission.integration.test.ts`, `tests/admin-youtube-discovery-review-ui.test.ts`, `tests/admin-youtube-discovery-mission-ui.test.ts`, `tests/admin-youtube-discovery-health-ui.test.ts` -- cover contract boundary, policy isolation, measurement, no-write and accessibility behavior -- chứng minh AC và không mutate history.

### Review Findings

- [x] [Review][Dismiss] Foreign fallback projection is never rendered [apps/admin/app/knowledge/youtube-discovery-review/review.tsx:221] -- dismissed after reinspection; the existing rendered section consumes `fallbackItems` and `fallbackStatus`.
- [x] [Review][Patch] Primary queue rows omit the required thumbnail [apps/admin/app/knowledge/youtube-discovery-review/review.tsx:221]
- [x] [Review][Patch] Quality measurement includes non-primary `consider` recommendations [packages/database/src/admin-youtube-discovery.ts:257]
- [x] [Review][Patch] Review metadata projection lacks persisted-data integration coverage [tests/youtube-discovery-review.integration.test.ts:100]
- [x] [Review][Patch] Gate-failure quality aggregates lack projection-boundary coverage [tests/youtube-discovery-action-required.integration.test.ts:76]
- [x] [Review][Patch] Move persisted Accept reconciliation to a Worker or explicit server-command lifecycle while keeping `listReview()` and `getReview()` select-only; restore submitted/duplicate/failed recovery and the 12 reconciliation integration cases [packages/database/src/admin-youtube-discovery.ts:24]
- [x] [Review][Patch] Activate query-builder version 2 for the current/default Vietnamese-first policy and execute-test the upgrade path so valid candidates can enter primary projections [drizzle/migrations/0070_discovery_vietnamese_eligibility.sql:24]
- [x] [Review][Patch] Read YouTube `snippet.defaultAudioLanguage` and correct the adapter fixture so explicit foreign audio is gated before downstream work [packages/worker-domain/src/features/youtube-discovery/youtube-enrichment.ts:36]
- [x] [Review][Patch] Use every new-policy `consider` recommendation as the Vietnamese-fit denominator instead of filtering numerator and denominator identically [packages/database/src/admin-youtube-discovery.ts:257]
- [x] [Review][Patch] Require real Vietnamese-language evidence instead of admitting a video from one accented character or a Vietnam place name [packages/domain/src/youtube-discovery/policy.ts:103]
- [x] [Review][Patch] Prevent foreign-fallback finalization after failed/cancelled jobs or revoked policy writes [packages/database/src/youtube-discovery/index.ts:312]
- [x] [Review][Patch] Recheck the active run/policy before the second `long` YouTube search tranche [packages/worker-domain/src/features/youtube-discovery/youtube-search.ts:10]
- [x] [Review][Patch] Deduplicate foreign fallback by canonical candidate before limiting results and rendering URL-keyed cards [packages/database/src/admin-youtube-discovery.ts:42]

**Acceptance Criteria:**
- Given một new-policy `vi` hoặc `likely_vi` candidate vào primary review, when operator xem row và inspector, then metadata/label/query/reason safe được hiển thị bằng tiếng Việt và nêu rõ metrics chỉ là review context, không là correctness/evidence/capture/publication proof.
- Given gate failures hoặc `foreign_fallback`, when Action Required, primary queue, Mission và Health render, then failures không là review work, fallback chỉ ở `Nguồn ngoại ngữ bổ sung`, và primary ranking/numerator không chứa fallback.
- Given release-quality evidence, when query giới hạn immutable Vietnamese-first policy rows, then tỷ lệ `consider` Vietnamese fit >= 80%, `unknown` không tính, fallback báo cáo riêng, không có `defer|consider` dưới snapshot minimum duration, và legacy không bị đọc để xử lý hay mutate.
- Given focused contract, PostgreSQL integration, protected API và admin UI/accessibility suites chạy, when boundary assertions kiểm tra response và UI, then raw/provider/capture data, new mutation, URL-only/Knowledge/Usage/audit/worker regressions đều không xuất hiện.

## Design Notes

`youtube_discovery_appearances` đã là ranh giới provenance run-scoped của Story 22.2. Story này chỉ đọc các fields bounded đã tồn tại; không migration, không “sửa” legacy rows. Các aggregate mới phải theo Mission select-only pattern, không tái dùng bất kỳ path review nào có reconcile write.

## Verification

**Commands:**
- `pnpm test:unit -- tests/admin-youtube-discovery-contract.test.ts tests/admin-youtube-discovery-review-ui.test.ts tests/admin-youtube-discovery-mission-ui.test.ts tests/admin-youtube-discovery-health-ui.test.ts` -- expected: typed safe projections và UI/accessibility boundaries pass không cần PostgreSQL.
- `pnpm test:integration -- tests/youtube-discovery-review.integration.test.ts tests/youtube-discovery-action-required.integration.test.ts tests/youtube-discovery-mission.integration.test.ts` -- expected: serial policy isolation, aggregate/measurement và no-historical-mutation evidence pass.
- `pnpm lint` -- expected: không có ESLint error mới.
- `pnpm typecheck` -- expected: strict TypeScript pass.
- `pnpm build` -- expected: production build pass.

## Suggested Review Order

**Primary Admission And Measurement**

- Cohort predicate keeps legacy, fallback, and failed gates out of primary work.
  [`admin-youtube-discovery.ts:252`](../../../packages/database/src/admin-youtube-discovery.ts#L252)

- Read-only projections assemble safe metadata, fallback, and quality measurements.
  [`admin-youtube-discovery.ts:25`](../../../packages/database/src/admin-youtube-discovery.ts#L25)

- Mission candidates use the same primary cohort before exposing review availability.
  [`admin-youtube-discovery.ts:359`](../../../packages/database/src/admin-youtube-discovery.ts#L359)

**Typed Protected Transport**

- Fallback is a separate protected GET projection without review command semantics.
  [`admin-youtube-discovery.controller.ts:12`](../../../apps/api/src/admin/admin-youtube-discovery.controller.ts#L12)

**Operator Presentation**

- Queue, inspector, and supplemental sources render bounded metadata and explicit trust boundaries.
  [`review.tsx:218`](../../../apps/admin/app/knowledge/youtube-discovery-review/review.tsx#L218)

- Health exposes policy-scoped sample, threshold, gate, fallback, and duration evidence.
  [`health.tsx:74`](../../../apps/admin/app/knowledge/youtube-discovery/health/health.tsx#L74)

- Mission mirrors quality evidence without turning failures into review work.
  [`mission.tsx:67`](../../../apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx#L67)

**Verification**

- Integration coverage proves fallback and quality isolation at the database projection boundary.
  [`youtube-discovery-action-required.integration.test.ts:58`](../../../tests/youtube-discovery-action-required.integration.test.ts#L58)

- SSR tests prove the Health quality panel renders threshold and bounded aggregate evidence.
  [`admin-youtube-discovery-health-ui.test.ts:73`](../../../tests/admin-youtube-discovery-health-ui.test.ts#L73)

- SSR tests prove the Mission quality panel renders the same release-quality evidence.
  [`admin-youtube-discovery-mission-ui.test.ts:21`](../../../tests/admin-youtube-discovery-mission-ui.test.ts#L21)
