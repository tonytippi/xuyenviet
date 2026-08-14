# Epic 22 Context: Chất lượng YouTube Discovery ưu tiên tiếng Việt

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic này điều chỉnh có mục tiêu luồng YouTube Discovery đã có để phục vụ đúng nhóm người dùng MVP: người Việt lập kế hoạch chuyến đi đường bộ trong nước. Discovery phải tạo truy vấn tự nhiên bằng tiếng Việt, chỉ đưa video có độ phù hợp ngôn ngữ và thời lượng hữu ích vào luồng ưu tiên, rồi cung cấp đủ siêu dữ liệu an toàn để operator đánh giá mức liên quan, độ phổ biến và độ mới. Đây là điều chỉnh tiến về phía trước cho các run dùng chính sách mới, không phải rollback hay xử lý lại dữ liệu cũ; nó giữ nguyên các ranh giới URL-only, Knowledge handoff, manual capture, Worker, audit và Usage đã hoàn thành.

## Stories

- Story 22.1: Tạo truy vấn Discovery ưu tiên tiếng Việt
- Story 22.2: Chặn ngôn ngữ và thời lượng hữu ích trước AI triage
- Story 22.3: Hiển thị bằng chứng video và chứng minh chất lượng ưu tiên tiếng Việt

## Requirements & Constraints

Discovery ưu tiên tính hữu ích với người dùng Việt, nội dung tiếng Việt và góc nhìn người đi đường địa phương; nội dung chỉ nói về Việt Nam không tự chứng minh phù hợp. Truy vấn do hệ thống tạo phải chuyển địa lý, taxonomy và nhu cầu thành tiếng Việt tự nhiên; không được gửi nguyên nhãn taxonomy tiếng Anh nội bộ tới provider. Việc làm mới truy vấn hệ thống phải idempotent, giữ target identity/digest, nguồn gốc, lịch và khả năng audit; tuyệt đối không ghi đè hoặc tự dịch văn bản truy vấn do operator tạo.

Chỉ sử dụng YouTube Data API đã được tài liệu hóa. Search có thể dùng các tranche `medium` và `long` trong giới hạn chính sách, nhưng kết quả phải hợp nhất tất định theo định danh video chuẩn và giữ provenance truy vấn/tranche. Bộ lọc search chỉ giảm lãng phí; duration chính xác sau enrichment mới là thẩm quyền quyết định.

Đối với run chính sách mới, phải đọc và lưu trong giới hạn dữ liệu an toàn duration chính xác, default language/audio language khi có, title, description, tags, channel, lượt xem và thời điểm phát hành. Phân loại `languageFit` là tập đóng `vi`, `likely_vi`, `unknown`, `non_vi`; metadata audio/ngôn ngữ rõ ràng được ưu tiên, còn thiếu metadata thì dùng classifier tất định, có version, trên title/description/tags. Không thêm dịch vụ, dependency, credential hay biến môi trường để nhận diện ngôn ngữ.

Chính sách PostgreSQL có version đặt `minimumUsefulDurationSeconds` ban đầu là 180. Video dưới ngưỡng là `too_short`; duration thiếu hoặc không hợp lệ là `duration_unknown`. `non_vi`, `unknown`, `too_short` và `duration_unknown` không được vào primary path. Các cổng này phải chạy trước channel enrichment, comment signals, AI triage, Usage, score-band ranking, recommendation và primary review; score, views, mức phổ biến, generic relevance hay model output không được vượt qua cổng thất bại.

Chỉ khi không có video tiếng Việt đủ điều kiện cho cùng normalized need, `unknown` hoặc `non_vi` hữu ích mới có thể là foreign fallback bị giới hạn, gắn provenance riêng. Fallback không lẫn vào primary ranking hay tử số đo chất lượng. Tối thiểu 80% recommendation `consider` của policy mới phải là `vi` hoặc `likely_vi`; `unknown` không được tính và fallback được báo cáo riêng. Không có `defer` hoặc `consider` nào của policy mới ngắn hơn ngưỡng duration cấu hình.

Mọi thay đổi chỉ áp dụng cho run có policy mới. Không backfill, reclassify, reconcile, supersede hoặc mutate candidate, appearance, recommendation, review state hay quyết định operator lịch sử. Bảo toàn Discovery URL-only: không tạo source, capture version, ingestion job, evidence, card hoặc publication state; Accept vẫn chỉ gọi Knowledge intake bằng canonical URL và không chạy hay lên lịch `youtube:capture`/Gemini.

## Technical Decisions

Giữ Discovery trong modular monolith hiện có: PostgreSQL và Drizzle sở hữu schema/migration; Worker đã đăng ký sở hữu scheduled run và candidate job; API admin chỉ thực thi command được role-protect, audit và trả read model; `apps/admin` chỉ là typed presentation client. Query run tạo canonical candidate/immutable appearance, enqueue candidate job độc lập, rồi hoàn thành mà không chờ enrichment hoặc triage. Mỗi candidate job tiếp tục dùng lease, fencing, retry, cancellation, policy snapshot và provenance tuple bất biến hiện có; kiểm tra global enablement trước provider call, Discovery write và retry/requeue vẫn bắt buộc.

Policy Discovery là một record PostgreSQL có version, được thay đổi bằng admin command có audit. Ngoài các giá trị vận hành hiện có, policy sở hữu version query builder, version language classifier, ngưỡng duration và hành vi fallback giới hạn; mỗi run/job snapshot policy hiệu lực. Lưu các reference version này cùng `languageFit`, `durationFit` và reason đóng: `eligible_vietnamese`, `too_short`, `duration_unknown`, `non_vietnamese`, `language_unknown`, `foreign_fallback`.

Chỉ primary-eligible candidate mới đi qua AI Gateway triage hiện có và Usage attribution `youtube_discovery_triage`. Không dùng Gemini video-analysis path. Triage nhận metadata/signal an toàn có giới hạn, output được schema-validate như input vận hành không đáng tin; deterministic policy vẫn tái kiểm canonical URL, public-video eligibility, dedupe, Knowledge-owned prior-capture lookup và score band trước khi tạo `skip`, `defer`, `consider`.

Chỉ lưu metadata vận hành bị giới hạn, các safe reason/error, score factors, audit summary và sanitized derived comment signals. Không lưu raw comments, prompt/response, provider payload, transcript, media, credentials, cookies, raw source material, evidence span hoặc traveler content. Retention hiện hữu vẫn do policy kiểm soát.

## UX & Interaction Patterns

Mở rộng candidate row và inspector của control tower hiện có, không thiết kế lại bề mặt. Primary review hiển thị thumbnail, title, channel, duration, lượt xem được định dạng theo locale, ngày phát hành chính xác kèm tuổi tương đối, truy vấn gốc, safe eligibility reason và nhãn `Nội dung tiếng Việt` hoặc `Có khả năng là tiếng Việt`. Các số liệu views, freshness, channel, comment signals và AI factors chỉ là ngữ cảnh review, không là chứng cứ đúng đắn, capture hay publication.

Foreign fallback nằm trong phần riêng, có nhãn `Nguồn ngoại ngữ bổ sung`, cùng metadata an toàn nhưng không được xen vào primary ranking hoặc tạo cảm giác là đề xuất ưu tiên cao hơn. Candidate thất bại language/duration không hiện trong Action Required hay primary Review Queue. Mission và Health chỉ hiển thị aggregate có giới hạn với nhãn tiếng Việt cho video quá ngắn, không xác định được thời lượng, không phải nội dung tiếng Việt và chưa xác định được ngôn ngữ, cùng số liệu fallback riêng.

Giữ control tower desktop-first với queue và inspector; ở màn hình hẹp vẫn reflow tuần tự mà không mất chức năng được ủy quyền. Hỗ trợ keyboard, visible focus, status không phụ thuộc màu, live announcement và copy vận hành tiếng Việt trực tiếp; không lộ raw comments, model output, diagnostics, provider payload hoặc capture internals.

## Cross-Story Dependencies

Thực hiện tuần tự `22.1 -> 22.2 -> 22.3`, trước khi tiếp tục Epic 21. Story 22.1 cung cấp Vietnamese query builder, version và query/tranche provenance cho policy mới. Story 22.2 dựa trên đầu vào đó để persist và áp cổng language/duration trước downstream work, đồng thời cô lập fallback. Story 22.3 dùng projection và version policy từ hai story trước để hiển thị metadata/reason, loại primary-ineligible khỏi queue và đo release quality chỉ trên recommendation mới.

Epic phụ thuộc vào nền tảng Epics 18-20: canonicalizer dùng chung, query/candidate/run/appearance/job model, policy snapshot, Worker leases/fences/retries, AI Gateway/Usage, audit, control-tower read models và Knowledge-owned safe prior-capture lookup. Các ranh giới đó không được thay đổi bởi Epic 22.
