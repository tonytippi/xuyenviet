---
title: 'Phân biệt lỗi persistence của YouTube Discovery triage'
type: 'bugfix'
created: '2026-08-14'
status: 'in-review'
baseline_commit: 'a13b292566196b1a1da23d3778b06ba9455fc921'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Candidate job của YouTube Discovery thất bại trong triage với log và dữ liệu chỉ ghi `stage_transient`, dù triage trả về `contended`. Điều này che khuất lỗi tranh chấp hoặc persistence, khiến vận hành không thể phân biệt nó với lỗi stage không xác định.

**Approach:** Dùng mã lỗi an toàn có sẵn `persistence_contended` cùng stage `triage`, persist vào candidate job và hiển thị trong diagnostic/Health detail hiện có. Diagnostic event bổ sung `failurePoint` allowlist nội bộ để phân biệt triage bundle, model, Gateway, response và persistence mà không phát raw error hoặc payload.

## Boundaries & Constraints

**Always:** Chỉ lưu và phát ra mã lỗi an toàn; giữ nguyên raw provider payload, prompt, credential và nội dung candidate khỏi database/log; giữ state, retry và fencing hiện tại; đồng bộ TypeScript, database constraint, contract và Health projection.

**Ask First:** Dừng để hỏi trước nếu cần thay đổi retry policy, thay đổi semantics của lỗi ngoài triage, hoặc thêm dữ liệu/payload diagnostic mới.

**Never:** Không ghi raw exception/provider response; không bypass constraint bằng direct database write; không đổi schema bảng, thêm retry, hay gộp lỗi persistence ở enrichment/recommendation vào mã triage.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Triage persistence contention | Persist triage trả `contended` sau khi candidate job được claim | Candidate job vào retry/failed theo retry policy, `last_safe_stage` là `triage`, `safe_error_code` là `persistence_contended` | Diagnostic log chỉ chứa mã an toàn, stage và retry metadata |
| Gateway failure | AI Gateway lỗi và triage record được persist | Giữ `triage_transient` hiện có | Không đổi classification gateway |
| Health detail | Candidate job terminal thuộc incident Health | Contract chấp nhận và detail trả `persistence_contended` | Từ chối mọi mã không nằm trong allowlist |

</frozen-after-approval>

## Code Map

- `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- `runCandidateTriage`, `executeCandidateJob` và `candidateRetryCode` đang làm rơi sentinel `contended` về `stage_transient`.
- `packages/database/src/schema.ts` -- nguồn allowlist TypeScript cho candidate job `safe_error_code`; mã hiện có không cần thay đổi schema.
- `packages/database/src/youtube-discovery/index.ts` -- retry transition persist atomically `safeErrorCode` và `lastSafeStage`; không cần đổi transition ngoài mã mới.
- `packages/contracts/src/youtube-discovery/index.ts` -- union/validator cho Health incident detail.
- `packages/database/src/admin-youtube-discovery.ts` -- projection safe error code cho Health detail.
- `tests/youtube-discovery-execution.integration.test.ts` -- coverage execution-level cho triage errors và persisted job state.
- `tests/admin-youtube-discovery-contract.test.ts` -- contract allowlist cho Health candidate-job detail.

## Tasks & Acceptance

**Execution:**
- [x] `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- map riêng persistence contention tại triage sang `persistence_contended` -- bảo toàn nguyên nhân vận hành an toàn thay vì fallback generic.
- [x] `packages/database/src/schema.ts` -- xác nhận mã hiện có được candidate-job constraint chấp nhận -- không cần thay đổi database hoặc migration.
- [x] `packages/contracts/src/youtube-discovery/index.ts` và `packages/database/src/admin-youtube-discovery.ts` -- dùng projection Health detail hiện có -- operator nhìn được stage `triage` cùng diagnostic đã persist.
- [x] `tests/youtube-discovery-execution.integration.test.ts` và `tests/admin-youtube-discovery-contract.test.ts` -- cover triage contention và closed-world validation -- chống regression về `stage_transient` generic.
- [x] `packages/contracts/src/index.ts`, `packages/worker-domain/src/features/youtube-discovery/execution.ts` và `apps/worker/src/adapters.ts` -- phát `failurePoint` an toàn trong diagnostic triage và chỉ phát console telemetry cho retry/failure/contention -- phân biệt bundle với persistence, không tạo info log cho success/no-work.

**Acceptance Criteria:**
- Given một candidate job được claim và persist triage trả `contended`, when worker xử lý job, then retry/terminal state ghi `safe_error_code = persistence_contended` và `last_safe_stage = triage` theo retry policy.
- Given AI Gateway failure hoặc invalid output đã được phân loại hiện tại, when worker xử lý triage, then classification hiện có không đổi.
- Given Health incident detail chứa candidate job có `persistence_contended`, when contract parse response, then response hợp lệ và chỉ expose metadata an toàn.
- Given một mã lỗi không nằm trong allowlist, when Health contract parse response, then response bị từ chối.
- Given candidate retry transition persist `persistence_contended`, when PostgreSQL ghi job, then constraint hiện có chấp nhận mã mà không cần migration, thêm cột hoặc backfill.
- Given triage bundle bị contended, when worker retry job, then diagnostic event chứa `failurePoint = triage_bundle` cùng mã lỗi và stage an toàn.
- Given persist triage bị contended, when worker retry hoặc fail job, then diagnostic event chứa `failurePoint = triage_persist` cùng `persistence_contended` và `triage`.
- Given worker hoàn tất hoặc không có work, when adapter chạy, then không phát `operational_telemetry` console event.

## Design Notes

`contended` từ persistence triage là sentinel nội bộ, không phải provider diagnosis. `persistence_contended` cộng `last_safe_stage = triage` phân biệt nó với `triage_transient` (gateway/provider) và không làm taxonomy mã lỗi phình ra.

`failurePoint` chỉ là metadata log giới hạn theo nhánh thực thi: `triage_guard_before_bundle`, `triage_bundle_read`, `triage_model_select`, `triage_guard_before_gateway`, `triage_gateway_call`, `triage_guard_after_gateway`, `triage_persist_write`, `triage_response`, `triage_unclassified`. Nó không được persist hoặc expose qua public contract.

## Verification

**Commands:**
- `pnpm test:integration -- youtube-discovery-execution.integration.test.ts admin-youtube-discovery-contract.test.ts` -- expected: các regression test pass với test database migration.
- `pnpm typecheck` -- expected: không có lỗi TypeScript do union/contract allowlist mới.
- `pnpm test:unit -- worker-adapter-boundary.test.ts operational-telemetry.test.ts` -- expected: console telemetry và adapter boundary vẫn pass.
