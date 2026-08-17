---
title: Sprint Change Proposal - Operator-Guided Proactive Knowledge Discovery
status: approved
created: 2026-08-17
project: xuyenviet
change_scope: moderate
---

# Sprint Change Proposal: Operator-Guided Proactive Knowledge Discovery

## 1. Tóm tắt vấn đề

YouTube Discovery hiện đã có query proposal, scheduled execution, candidate processing, Vietnamese-first quality gate, operator review và Knowledge intake handoff. Tuy nhiên, đầu vào `coverage_gap` hiện chỉ xuất hiện khi một Knowledge Recommendation như `missing_context` đã được tạo từ quá trình ingestion của một nguồn có sẵn. Hệ thống vì vậy phản ứng sau khi có nguồn mới, thay vì chủ động giúp operator nhìn thấy những phần kho tri thức còn yếu.

Điều này làm funnel Discovery thường không có đầu vào hữu ích dù phần downstream đã hoạt động. Trang Coverage Needs có thể hiển thị đúng dữ liệu hiện có nhưng vẫn trống khi không có recommendation phát sinh tình cờ.

Thay đổi được thống nhất là một luồng operator-guided nhỏ:

1. Hệ thống thống kê coverage theo tỉnh/thành và chủ đề.
2. AI dùng thống kê an toàn và demand tổng hợp để đề xuất knowledge need cùng query YouTube tiếng Việt.
3. Operator xác nhận, sửa, bỏ qua hoặc tự tạo query.
4. Query được xác nhận được enqueue chạy ngay, không chờ lịch định kỳ tiếp theo.
5. Operator theo dõi trạng thái run và candidate processing.
6. Operator dùng review flow hiện có để chọn URL chuyển sang Knowledge intake.

Operator giữ đúng hai cổng quyết định nghiệp vụ: xác nhận query và xác nhận URL.

## 2. Bằng chứng và phân loại nguyên nhân

- PRD FR-66 yêu cầu query proposal bắt nguồn từ coverage gap, freshness risk, conflict và demand.
- Discovery architecture AD-4 giả định Knowledge/AI Ask cung cấp các signal an toàn đó.
- Story 18.3 xây cổng đọc signal, nhưng không có story nào sở hữu việc chủ động đánh giá coverage.
- Concrete Knowledge signal port hiện đọc các Knowledge Recommendation đang mở; nó không đánh giá toàn bộ phạm vi địa lý cần phục vụ.
- Dữ liệu địa lý hiện chủ yếu là free-text `locationName`; chưa có canonical province và alias để thống kê nhất quán qua thay đổi địa giới.

Đây là khoảng trống khi phân rã yêu cầu và ownership, không phải lỗi phạm vi của Epic 22. Epic 22 vẫn hoàn thành mục tiêu Vietnamese-first candidate quality và không cần rollback.

## 3. Phân tích tác động

### 3.1 Epic và story

- Epic 18-20: giữ nguyên phần đã hoàn thành; tái sử dụng proposal, run, processing, review và control-tower primitives.
- Epic 22: giữ nguyên và đóng; Vietnamese-first gates tiếp tục áp dụng cho mọi run mới.
- Epic 21: không đổi nội dung. Epic 23 được ưu tiên trước Epic 21 vì hoàn thiện funnel Discovery đang thiếu đầu vào.
- Thêm Epic 23 với ba story nhỏ, tuần tự.

### 3.2 PRD

UJ-6 và FR-66/67/69/AC-34 cần nói rõ:

- coverage proposal chủ động theo phạm vi tỉnh/thành;
- AI chỉ đề xuất, không tự chạy;
- operator có thể duyệt, sửa, bỏ qua hoặc tự tạo query;
- query được xác nhận tạo immediate run;
- operator theo dõi trạng thái đến khi candidate sẵn sàng.

MVP vẫn đạt được. Thay đổi này thu hẹp cơ chế chủ động về cấp tỉnh/thành, không mở rộng sang route segment, season hoặc coverage lifecycle tự động.

### 3.3 Architecture

- Knowledge sở hữu coverage summary an toàn.
- Một reference dataset versioned ánh xạ tên tỉnh/thành cũ sang tỉnh/thành hiện hành.
- Tên xuất hiện trong nguồn được giữ nguyên; canonical current province được lưu/tham chiếu riêng.
- AI Gateway nhận thống kê tổng hợp, không nhận raw card/source/traveler content.
- Discovery API enqueue immediate run; Worker vẫn sở hữu execution, lease, fence và provider calls.
- Immediate và scheduled run dùng chung execution path.
- Safe read model chiếu trạng thái query run và tiến độ candidate processing cho operator.

Không thêm service, queue provider, scheduler hoặc GIS subsystem mới.

### 3.4 UX

Knowledge Mission hiện có được mở rộng, không tạo control tower mới:

- bảng coverage theo tỉnh/thành hiện hành;
- tìm/lọc bằng cả tên hiện hành và tên cũ;
- AI suggestions với lý do và query tiếng Việt;
- operator-created query;
- trạng thái `queued | running | completed | failed | cancelled`;
- thời gian chạy, số candidate, tiến độ processing, safe error/retry và link review.

Candidate review và Knowledge intake handoff giữ nguyên.

### 3.5 Kỹ thuật, dữ liệu và vận hành

- Cần migration/reference data nhỏ cho canonical province và alias.
- Danh mục 34 tỉnh/thành và mapping phải lấy từ nguồn hành chính chính thức, có version/ngày hiệu lực và fixture tests.
- Backfill chỉ mapping cấp tỉnh chắc chắn; dữ liệu mơ hồ giữ `unresolved`, không dùng AI phỏng đoán.
- Không thay đổi knowledge publication, evidence, capture hoặc traveler retrieval policy.
- Không có external service hay environment variable mới.

## 4. Hướng xử lý được chọn

### Direct Adjustment thông qua Epic 23

Đây là lựa chọn phù hợp nhất vì phần downstream đã tồn tại và có thể tái sử dụng. Rollback Epic 18-22 không đem lại đơn giản hóa. Việc xây coverage engine tự động đầy đủ cũng vượt nhu cầu MVP.

- Effort: Medium.
- Risk: Medium, tập trung vào geographic normalization và idempotent immediate-run admission.
- Phạm vi thay đổi: Moderate; cần điều chỉnh backlog và phối hợp Product Owner/Developer.

Các phương án không chọn:

- Chỉ đếm card với một ngưỡng cố định: không phản ánh khác biệt nhu cầu giữa các địa phương.
- Cho AI quét toàn bộ raw Knowledge Card: tốn kém, khó kiểm soát và không phát hiện tốt địa phương hoàn toàn vắng dữ liệu.
- Operator nhập toàn bộ gap/query thủ công: giữ được fallback nhưng không đáp ứng mục tiêu chủ động.
- Coverage target/scoring/lifecycle engine đầy đủ: quá phức tạp cho giai đoạn chưa có user thực tế.

## 5. Đề xuất chỉnh artifact cụ thể

### 5.1 PRD - UJ-6

**Cũ**

Operator thấy một coverage/freshness need; hệ thống hoặc operator tạo query; scheduled work tìm candidate; operator review và Accept URL.

**Mới**

1. Operator mở Knowledge Mission và xem coverage theo tỉnh/thành hiện hành, có tham chiếu tên cũ.
2. Hệ thống cung cấp thống kê coverage theo địa phương/chủ đề và safe aggregated demand khi có.
3. AI đề xuất knowledge need, lý do và query YouTube tiếng Việt.
4. Operator xác nhận, sửa, bỏ qua hoặc tự tạo query.
5. Query được xác nhận được enqueue chạy ngay khi Discovery bật.
6. Operator theo dõi run/candidate processing và mở review khi kết quả sẵn sàng.
7. Operator chọn URL phù hợp để chuyển sang Knowledge intake hiện có.

### 5.2 PRD - FR-66

**Cũ**

Hệ thống tạo/refresh query proposal từ coverage gaps, freshness risk, unresolved conflicts và aggregated demand.

**Mới**

Hệ thống còn phải cung cấp operator-guided proposal từ coverage summary theo tỉnh/thành và chủ đề. AI tạo knowledge-need/query suggestion có lý do từ dữ liệu tổng hợp an toàn; proposal không tự chạy trước khi operator xác nhận.

### 5.3 PRD - FR-67 và FR-69

**Cũ**

Operator quản lý query; query chạy theo lịch khi được policy cho phép.

**Mới**

Operator có thể xác nhận/sửa/bỏ qua AI proposal hoặc tự tạo query. Query được xác nhận tạo một immediate run và không chờ `nextRunAt`; scheduled recurrence chỉ tồn tại khi được cấu hình riêng. Operator có thể xem safe current/latest run status và candidate-processing progress.

### 5.4 PRD - AC-34

**Cũ**

Operator tạo hoặc quản lý query và scheduled run tạo canonical candidates.

**Mới**

Từ coverage summary theo tỉnh/thành, hệ thống tạo được AI proposal có lý do và query tiếng Việt. Sau khi operator xác nhận/sửa hoặc tự tạo query, một run được enqueue ngay, trạng thái được theo dõi đến khi candidate sẵn sàng, và candidate đi vào review/handoff hiện có.

### 5.5 Architecture - AD-3

**Cũ**

Worker sở hữu scheduled due-query execution.

**Mới**

Worker sở hữu cả `immediate` và `scheduled` run execution qua cùng lease/fence/provider/candidate-processing path. API chỉ enqueue. Read model an toàn chiếu run status và processing progress; API/admin không trực tiếp thực thi provider stage.

### 5.6 Architecture - AD-4 và geographic authority

**Cũ**

System proposal nhận bounded signals từ Knowledge/AI Ask; geography là nhãn tổng hợp.

**Mới**

Knowledge xuất coverage summary theo canonical current province, topic, count và freshness; AI Ask có thể bổ sung aggregated demand. Reference dataset versioned ánh xạ tên tỉnh/thành cũ sang current province. Raw/source label được giữ để truy vết và tìm kiếm; thống kê nhóm theo canonical current province. Mapping không chắc chắn là `unresolved`.

### 5.7 UX - Knowledge Mission

**Cũ**

Mission giả định coverage need/query đã tồn tại và query chủ yếu có `next run` theo lịch.

**Mới**

Mission có bảng coverage tỉnh/thành, alias cũ, topic/count/freshness; action tạo AI suggestions; edit/skip/run-now; operator-created query; và run status/progress. Số card là tín hiệu mô tả, không tự được trình bày như kết luận đủ/thiếu.

## 6. Epic 23 và stories

### Epic 23: Operator-Guided Proactive Knowledge Discovery

Operator có thể nhìn thấy mức độ phủ tri thức theo địa phương, nhận đề xuất query tiếng Việt từ AI, chạy query đã chọn ngay, theo dõi tiến độ và chọn URL qua review flow hiện có.

### Story 23.1: Chuẩn hóa tham chiếu tỉnh/thành cũ và mới

- Thêm reference dataset versioned cho tỉnh/thành hiện hành và alias cấp tỉnh cũ.
- Lưu/giữ source location label tách biệt với canonical current province.
- Backfill mapping chắc chắn; không đoán trường hợp mơ hồ.
- Cho phép tìm theo tên cũ và nhóm thống kê theo tỉnh/thành hiện hành.
- Kiểm chứng dataset bằng nguồn hành chính chính thức và fixture tests.

### Story 23.2: Hiển thị coverage và tạo AI query proposal

- Operator chọn phạm vi đánh giá.
- Hiển thị coverage theo địa phương, topic và freshness, kèm aggregated demand khi có.
- AI trả tối đa một tập đề xuất bounded gồm địa phương, knowledge need, lý do và query tiếng Việt.
- Operator sửa, bỏ qua, chọn chạy hoặc tự nhập query.
- Không gửi raw knowledge/source/traveler content và không tự chạy AI proposal.

### Story 23.3: Chạy ngay và theo dõi query

- Query được operator xác nhận tạo immediate run idempotently khi Discovery bật.
- Không chờ scheduled `nextRunAt`.
- Hiển thị `queued | running | completed | failed | cancelled`, thời gian, candidate count, processing progress, safe error/retry.
- Completed result liên kết tới candidate review hiện có.
- Candidate confirmation và Knowledge intake handoff tái sử dụng Epic 19.

## 7. Tiêu chí thành công

1. Operator xem được coverage theo tỉnh/thành hiện hành mà không làm mất truy vết tên cũ.
2. Một nguồn dùng tên tỉnh cũ được tính vào đúng tỉnh/thành hiện hành khi mapping chắc chắn.
3. Operator nhận được AI suggestion có lý do và query tiếng Việt từ bounded aggregate data.
4. AI suggestion không tự gọi YouTube nếu chưa được operator xác nhận.
5. Query operator xác nhận hoặc tự tạo được enqueue ngay và không chờ 24 giờ.
6. Operator thấy trạng thái/progress và mở được candidate review khi sẵn sàng.
7. Operator xác nhận URL qua flow hiện có; Discovery không tự capture hoặc publish knowledge.

## 8. Handoff và thứ tự thực hiện

Phân loại: **Moderate**.

- Product Owner: chốt corrective backlog và ưu tiên Epic 23 trước Epic 21.
- Architect: cập nhật geographic authority, immediate-run admission và safe projection invariants.
- Developer: triển khai lần lượt 23.1, 23.2, 23.3 theo BMad story workflow.
- Reviewer/QA: kiểm tra alias fixtures, authorization, AI input boundary, immediate-run idempotency, global-disable fence và operator status UX.

Thứ tự:

1. Cập nhật PRD, architecture, UX và epics sau khi proposal được phê duyệt.
2. Cập nhật `sprint-status.yaml` với Epic 23 ở `backlog`, đặt trước Epic 21 về ưu tiên thực hiện.
3. Chạy implementation readiness cho Epic 23.
4. Tạo/validate/implement/review từng story tuần tự.

## 9. Change Navigation Checklist

- [x] 1.1 Trigger được xác định từ gap giữa Story 18.3/20.2 và hành vi sản phẩm mong muốn.
- [x] 1.2 Phân loại: misunderstanding/decomposition gap của yêu cầu gốc.
- [x] 1.3 Có bằng chứng PRD, architecture và concrete signal port.
- [x] 2.1 Epic 22 vẫn hoàn thành đúng phạm vi.
- [x] 2.2 Cần thêm Epic 23; không sửa/rollback epic đã hoàn thành.
- [x] 2.3 Epic 21 không đổi nội dung.
- [x] 2.4 Không có epic nào bị vô hiệu hóa.
- [x] 2.5 Ưu tiên Epic 23 trước Epic 21.
- [x] 3.1 PRD cần bổ sung proactive/operator-guided flow.
- [x] 3.2 Architecture cần geographic reference, coverage summary và immediate-run path.
- [x] 3.3 UX cần coverage, suggestions và run status.
- [x] 3.4 Migration/reference fixtures và tests cần bổ sung; không có hạ tầng mới.
- [x] 4.1 Direct Adjustment khả thi, effort/risk Medium.
- [x] 4.2 Rollback không khả thi/không có lợi.
- [x] 4.3 MVP vẫn khả thi với phạm vi thu gọn.
- [x] 4.4 Chọn Direct Adjustment qua Epic 23.
- [x] 5.1-5.5 Proposal, action plan và handoff đã được lập.
- [x] 6.1-6.2 Proposal đã được kiểm tra tính nhất quán.
- [x] 6.3 User phê duyệt proposal hoàn chỉnh ngày 2026-08-17.
- [x] 6.4 PRD, architecture, UX, epics và sprint status được đồng bộ sau phê duyệt.
- [x] 6.5 Handoff chính thức tới Product Owner/Architect/Developer cho Epic 23.
