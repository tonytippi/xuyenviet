---
title: 'Story 22.1: Tạo truy vấn Discovery ưu tiên tiếng Việt'
type: 'feature'
created: '2026-08-14'
status: 'in-review'
baseline_commit: '45cd2bb9004f26497f8aaa87928a2789900bc06e'
review_loop_iteration: 0
context:
  - '_bmad-output/implementation-artifacts/epic-22-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** System-owned YouTube Discovery proposals hiện gửi geography ghép với taxonomy tiếng Anh nội bộ, nên candidate pool nghiêng về nội dung ngoại ngữ về Việt Nam thay vì nội dung hữu ích cho người Việt đi đường bộ trong nước. Một search request duy nhất cũng không chủ động bao phủ video medium và long, là các video có xác suất cung cấp ngữ cảnh thực tế hơn video ngắn.

**Approach:** Tạo query builder tất định có version, biến normalized geography, taxonomy và reason thành truy vấn tiếng Việt tự nhiên với các biến thể có chủ đích như `hành trình`, `chuyến đi`, `đi tự lái` và `đi ô tô`. Giữ identity/schedule của proposal hệ thống, và thực hiện hai documented YouTube searches `medium` rồi `long`, tối đa 25 kết quả mỗi tranche, với provenance tranche tối giản trên appearance.

## Boundaries & Constraints

**Always:** Giữ nguyên target digest từ normalized target identity; refresh system proposal phải idempotent và không ghi đè hay tự dịch query operator. Query provider không được chứa taxonomy nội bộ/chưa dịch, gồm các nhãn dạng snake_case và các nhãn tiếng Anh `route note`, `cost note`, `general travel tip`. Taxonomy hỗ trợ phải được map tất định sang từ ngữ road-user tiếng Việt; taxonomy không được nhận diện dùng diễn đạt an toàn `kinh nghiệm du lịch tự lái`, không chuyển nguyên nhãn nội bộ ra provider. Query builder có version được snapshot trong policy version hiện hành, và proposal hệ thống được tạo/refresh/validate bằng cùng version đó. Search gọi `medium` trước rồi `long`, mỗi request giữ các tham số an toàn hiện có và giới hạn 25 kết quả. Một video chỉ tạo một canonical candidate, appearance và candidate job trong cùng run; appearance giữ một `search_tranche` là `medium` hoặc `long`. Nếu provider trả trùng trái với phân loại duration, giữ `medium` theo thứ tự xử lý tất định. Duy trì lease, fence, enablement, retry, canonicalization, candidate-job, audit, Usage và query-to-run provenance hiện có.

**Ask First:** Dừng để hỏi nếu việc triển khai yêu cầu thêm provider, dependency, credential, biến môi trường, service/queue mới; thay đổi chính sách duration authoritative, classifier ngôn ngữ hoặc primary/fallback admission; backfill/mutate dữ liệu Discovery lịch sử; hoặc thay đổi giới hạn 25 kết quả cho mỗi tranche đã được phê duyệt.

**Never:** Không thêm AI/language-detection call, không chạy `youtube:capture`, Gemini hay Knowledge intake từ Discovery search. Không đổi URL-only boundary, không tạo duplicate candidate/job cho video lặp, không nhân bản raw query text lên appearance, không mở lại/mutate candidate, appearance, recommendation hay quyết định operator lịch sử. Không thực hiện language/duration eligibility gate thuộc Story 22.2.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| System mapping | `Da Lat` + `route note` từ safe signal | Query tiếng Việt tự nhiên về cung đường/đi ô tô; version builder kèm policy; digest target giữ ổn định | Taxonomy lạ dùng cụm generic tiếng Việt, không lộ nhãn nội bộ |
| Proposal refresh | System proposal cùng target digest, builder version mới | Cùng proposal/schedule/origin được cập nhật query theo builder; operator proposal giữ nguyên text | Claim/fence cũ vẫn fail-safe như hiện tại |
| Two tranches | Provider trả tối đa 25 valid video cho mỗi `medium`, `long` | Hai request thứ tự cố định; tối đa 50 distinct input results, ordinal deterministic | Response lỗi/malformed ở bất kỳ request nào giữ lỗi transient hiện có |
| Defensive duplicate | Cùng video ID xuất hiện ở cả tranches | Một candidate, appearance, job; appearance ghi `medium` | ID invalid/duplicate trong tranche bị bỏ qua |

</frozen-after-approval>

## Code Map

- `packages/domain/src/youtube-discovery/planning.ts` -- sở hữu safe signal normalization, opaque target digest và `deriveDiscoveryQueries()`; thay interpolation taxonomy bằng builder tiếng Việt/version nhưng không đổi identity digest.
- `packages/domain/src/youtube-discovery/policy.ts` -- parser/default/contract cho Discovery policy version; bổ sung bounded `queryBuilderVersion` để planning dùng snapshot rõ ràng.
- `packages/database/src/schema.ts` -- `youtubeDiscoveryPolicyVersions` và `youtubeDiscoveryAppearances`; thêm version builder và closed appearance tranche tại đúng aggregate owner.
- `drizzle/migrations/` -- migration forward-only theo convention Discovery, không backfill hoặc rewrite rows cũ.
- `packages/database/src/youtube-discovery/index.ts` -- create/validate/refresh system proposal và `persistYoutubeDiscoveryCandidates()`; dùng builder của claimed policy, giữ operator text, persist tranche mà không phá canonical dedupe/job fencing.
- `packages/worker-domain/src/features/youtube-discovery/youtube-search.ts` -- YouTube documented search adapter; thực hiện hai request medium/long, merge/dedupe tất định và trả tranche cùng result.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- seam gọi search và persist candidate; chỉ điều chỉnh typed handoff cần thiết, không đổi worker ownership/lifecycle.
- `tests/youtube-discovery-planning.test.ts` -- unit mapping/version, target digest và assertion taxonomy nội bộ không thể thành query provider.
- `tests/youtube-discovery-search.test.ts` -- hai request exact, giới hạn 25/tranche, deterministic ordinal và defensive cross-tranche dedupe.
- `tests/youtube-discovery-foundation.integration.test.ts`, `tests/youtube-discovery-execution.integration.test.ts`, `tests/youtube-discovery-candidates.integration.test.ts` -- PostgreSQL contract cho policy refresh, operator isolation, appearance tranche và one-job-per-appearance.

## Tasks & Acceptance

**Execution:**
- [x] `packages/domain/src/youtube-discovery/planning.ts` và `policy.ts` -- thêm Vietnamese query builder/version và policy contract bounded -- system queries phải diễn đạt nhu cầu road-trip Việt Nam mà identity target không đổi.
- [x] `packages/database/src/schema.ts`, `drizzle/migrations/`, `packages/database/src/youtube-discovery/index.ts` -- persist/snapshot builder version và appearance tranche; regenerate chỉ proposal system -- bảo toàn audit, scheduling, canonical dedupe và lịch sử.
- [x] `packages/worker-domain/src/features/youtube-discovery/youtube-search.ts` và `execution.ts` -- gọi và merge `medium`/`long` theo thứ tự cố định -- tăng độ phủ video hữu ích mà không đổi downstream ownership.
- [x] `tests/youtube-discovery-planning.test.ts`, `tests/youtube-discovery-search.test.ts` và integration suites liên quan -- thêm regression cho mapping, provider boundary, refresh/idempotency, operator isolation, 25/tranche và provenance -- chứng minh các invariant trên ở unit và PostgreSQL serial tests.

**Acceptance Criteria:**
- Given một normalized coverage, freshness, conflict hoặc demand signal, when system proposal được tạo hay refresh, then provider-facing query dùng Vietnamese road-user language có version và không chứa nhãn taxonomy tiếng Anh nội bộ chưa chuyển đổi.
- Given builder version thay đổi, when system planning refreshes cùng target, then target digest, origin, schedule ownership và auditability được giữ; operator-authored query không đổi.
- Given Discovery enabled và system query đến hạn, when YouTube search chạy, then adapter gọi chính xác `medium` rồi `long`, tối đa 25 kết quả mỗi tranche, giữ documented safe parameters và merge canonical result tất định.
- Given valid/invalid/duplicate provider video IDs hoặc provider duplicate bất thường giữa tranche, when results persist, then canonical candidate/job semantics không đổi và appearance chỉ giữ tranche thắng theo thứ tự `medium`, rồi `long`.

## Design Notes

Query text là adapter-facing display intent, không phải normalized identity. Ví dụ mapping có thể tạo `Đà Lạt kinh nghiệm cung đường ô tô`, `Hà Nội Đà Nẵng chi phí hành trình`, hoặc `Việt Nam kinh nghiệm chuyến đi tự lái`; builder chọn biến thể cố định theo taxonomy/reason để tránh cùng một cụm lặp lại mà vẫn tái lập được. `videoDuration` là filter YouTube search để giảm video ngắn; kiểm tra duration chính xác 180 giây vẫn thuộc Story 22.2.

## Verification

**Commands:**
- `pnpm test:unit -- tests/youtube-discovery-planning.test.ts tests/youtube-discovery-search.test.ts` -- expected: toàn bộ mapping và adapter contract pass mà không cần database.
- `pnpm test:integration -- tests/youtube-discovery-foundation.integration.test.ts tests/youtube-discovery-execution.integration.test.ts tests/youtube-discovery-candidates.integration.test.ts` -- expected: serial PostgreSQL persistence/fence/dedupe regressions pass.
- `pnpm lint` -- expected: không có ESLint error mới.
- `pnpm typecheck` -- expected: strict TypeScript pass.
- `pnpm build` -- expected: production build pass.
