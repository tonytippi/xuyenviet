# Định Hướng Sản Phẩm Trip Project

## Trạng Thái

Định hướng đã thống nhất ngày 2026-07-22. Đây là tài liệu ghi nhận thảo luận sản phẩm để dùng khi cập nhật PRD, kiến trúc, epic và UX sau này. Đây không phải kế hoạch triển khai được phê duyệt và không mở rộng phạm vi MVP hiện tại.

## Mục Tiêu

Trip Project là không gian chuyến đi do người dùng sở hữu, giúp một gia đình đi road trip tại Việt Nam chuyển từ ý định mơ hồ thành những quyết định thực tế trước và trong chuyến đi.

XuyenViet không hướng đến một dashboard du lịch nhiều widget, ứng dụng bản đồ thay thế, hay một ứng dụng quản lý chi tiêu độc lập. Giá trị khác biệt là kết hợp chat AI, bối cảnh chuyến đi, dữ liệu địa phương, dữ liệu động và vị trí được người dùng cho phép để trả lời:

- Bây giờ gia đình nên làm gì tiếp theo?
- Kế hoạch hiện tại có còn thực tế với thời tiết, tiến độ và ràng buộc đã biết không?
- Gần đây có lựa chọn nào phù hợp với gia đình, xe, ngân sách và chặng tiếp theo không?
- Cần chuẩn bị gì hoặc thay đổi gì trước khi đi tiếp?

Nguyên tắc sản phẩm:

> Chat là bề mặt ra lệnh; Trip Project là bề mặt trạng thái đã được xác nhận.

## Người Dùng Và Kiểu Lập Kế Hoạch

Không ép người dùng chọn một chế độ cố định giữa "đi tự do" và "lập kế hoạch kỹ". Cùng một gia đình có thể bắt đầu linh hoạt, rồi chốt chi tiết dần khi gần ngày đi hoặc khi đang trên đường.

Trip Project cần đồng thời hỗ trợ:

- **Linh hoạt:** chỉ có hướng đi, khoảng ngày, vài điểm muốn đến; người dùng quyết định chỗ ở, ăn uống và hoạt động tại chỗ.
- **Chi tiết:** có chặng, nơi ở, hoạt động, giờ dự kiến và ngân sách rõ ràng.
- **Hỗn hợp:** có các điểm neo đã chốt, trong khi ngày hoặc hoạt động khác vẫn để mở.

Mỗi ngày, chặng hoặc lựa chọn nên có trạng thái rõ ràng:

- `ý tưởng`: có thể ghé hoặc thử nếu phù hợp.
- `dự kiến`: là phương án ưu tiên nhưng chưa cam kết.
- `đã chốt`: người dùng đã xác nhận hoặc đã có ràng buộc thực tế như nơi ở/giờ hẹn.
- `phương án B`: lựa chọn thay thế khi thời tiết, tiến độ hoặc sở thích thay đổi.

Một phần "để mở" là trạng thái hợp lệ, không tự động là lỗi hay việc bắt buộc phải xử lý.

## Nền Tảng Trip Plan

Trip Project trước hết cần trở thành một kế hoạch có cấu trúc, không chỉ là tập lịch sử chat:

- Điểm neo: điểm xuất phát, điểm đến, khu vực, nơi lưu trú hoặc điểm phải có mặt.
- Ngày/chặng dự kiến và các ràng buộc về thời gian.
- Hoạt động thuộc loại `di chuyển`, `tham quan`, `ăn uống`, `nghỉ`, `lưu trú`.
- Thời gian/quãng đường lái xe ước tính, cảnh báo, nguồn dữ liệu và thời điểm cập nhật khi có.
- Ràng buộc gia đình: số người, trẻ nhỏ, phương tiện, EV, sức chịu lái xe, ngân sách, sở thích và nơi cần tránh.
- Quyết định người dùng đã chấp nhận, đề xuất bị bỏ qua và lịch sử thay đổi có actor/thời điểm.

AI có thể tạo nháp, gợi ý sắp xếp, thêm phương án B hoặc phát hiện kế hoạch không khả thi. AI không được tự sửa itinerary, booking, budget hoặc checklist bền vững. Mọi thay đổi persistent phải là đề xuất có cấu trúc và chỉ được áp dụng sau khi người dùng xác nhận.

Ví dụ đề xuất thay đổi trong chat:

```text
Đề xuất: Khởi hành Huế -> Đà Nẵng sớm hơn 2 giờ

Lý do: Dự báo dông tăng trong khoảng 14:00-18:00, trùng giờ đi dự kiến.
Ảnh hưởng: Chặng chuyển từ 12:30 sang 10:30; hoạt động ngoài trời buổi chiều chuyển thành phương án B; nơi ở đã chốt không đổi.

[Áp dụng] [Xem phương án khác] [Giữ kế hoạch]
```

## Vòng Đời Chuyến Đi Và Trip Home

Màn hình đầu tiên khi mở Trip Project phụ thuộc vào thời điểm của chuyến đi, không cố định là transcript chat hoặc dashboard.

| Trạng thái | Trọng tâm Trip Home | Mục tiêu |
|---|---|---|
| Đang hoàn thiện kế hoạch | Khung chuyến đi và composer | Chốt các điểm còn thiếu, tạo itinerary/phương án |
| Đang chuẩn bị | Các việc cần chốt, forecast, checklist | Tránh bỏ quên nơi ở, hành lý, phương án B |
| Đã bắt đầu | Quyết định tiếp theo hoặc kế hoạch hôm nay | Hỗ trợ tại chỗ: đi tiếp, nghỉ, ăn, ở, đổi hoạt động |
| Đã kết thúc | Tóm tắt và dữ liệu đã xác nhận | Xem lại, tái sử dụng cho chuyến sau |

Có thể suy ra trạng thái từ `startDate` và `endDate`, nhưng phải cho phép người dùng chỉnh khi ngày đi thay đổi hoặc không chắc chắn.

### Quy Tắc Ưu Tiên Trip Home

1. Hiển thị **quyết định cần xử lý** nếu nó có thời hạn hoặc tác động thực tế.
2. Nếu không có, hiển thị **kế hoạch hôm nay** khi chuyến đi đang diễn ra.
3. Nếu hôm nay không còn mục liên quan hoặc người dùng đang chuẩn bị, hiển thị **kế hoạch/chặng kế tiếp**.
4. Nếu chuyến đi còn xa, hiển thị **chuẩn bị trước chuyến đi**.

Tín hiệu quyết định cần xử lý nên chủ yếu tính bằng rule có cấu trúc, không phụ thuộc hoàn toàn vào LLM:

- Chỗ ở/chặng bắt buộc sắp diễn ra nhưng chưa có phương án đã chốt.
- Forecast còn hiệu lực mâu thuẫn với chặng hoặc hoạt động dự kiến.
- Chặng lái xe vượt ngưỡng đã biết như thời lượng lái, giờ đến muộn hoặc thiếu điểm nghỉ.
- Một đề xuất đã tạo nhưng sắp ảnh hưởng tới kế hoạch.
- Thiếu dữ kiện thiết yếu cho một quyết định cụ thể.

## Chat-First UX

Mỗi Trip Project có **một conversation chính**. Người dùng dùng conversation này để hỏi, sửa và điều chỉnh toàn bộ chuyến đi; không cần chọn nhiều chat session cho cùng một trip.

Tuy nhiên, mở Trip Project không mặc định hiển thị toàn bộ transcript. Trip Home cần hiển thị ngắn gọn trạng thái/phần việc quan trọng, sau đó đặt composer text/voice làm hành động trung tâm.

Luồng đề xuất:

1. Người dùng mở Trip Project.
2. Họ thấy quyết định cần xử lý hoặc kế hoạch hôm nay/kế tiếp tùy ngữ cảnh.
3. Composer xuất hiện rõ ràng với text và, khi khả dụng, voice input.
4. Các prompt gợi ý thay đổi theo ngữ cảnh như "Tìm phòng tối nay", "Nếu mưa thì làm gì?", "Có nên đi tiếp không?".
5. Khi người dùng bắt đầu hỏi, cùng conversation hiển thị câu hỏi, câu trả lời, nguồn dữ liệu và card đề xuất thay đổi nếu có.
6. Lịch sử chat cũ và lịch sử quyết định luôn truy cập được nhưng được thu gọn ban đầu.

Không được che hoặc làm mất lịch sử chat: người dùng vẫn cần kiểm tra những gì AI đã biết, quyết định trước đó, mã đặt chỗ hoặc phương án B. Nội dung quan trọng phải được trích thành trạng thái cấu trúc thay vì chỉ nằm trong transcript.

Voice input phù hợp cho on-trip use nhưng chỉ là cơ chế nhập liệu: chuyển giọng nói thành text để người dùng xem/sửa trước khi gửi, không tự gửi transcript, và không khuyến khích tương tác khi đang lái xe.

## Weather Là Dữ Liệu Động Cấp Một

Đích đến dài hạn là trợ lý chủ động cảnh báo khi người dùng đang đi. Giai đoạn đầu dùng weather để lập kế hoạch và đề xuất điều chỉnh có xác nhận.

XuyenViet chủ động tra weather khi có:

- Địa điểm đủ rõ: thành phố, khu vực, điểm dừng, khu lưu trú, cung đường hoặc điểm hoạt động.
- Thời gian đủ rõ: hiện tại, hôm nay, ngày mai, ngày cụ thể, khoảng ngày hoặc giờ đến dự kiến.
- Một quyết định có thể bị ảnh hưởng: lái xe, hoạt động ngoài trời, nơi ở, lịch tham quan, packing hoặc điều chỉnh chặng.

Không cần gọi weather khi thiếu địa điểm hoặc thời gian. Với chuyến đi xa ngoài cửa sổ dự báo, chỉ dùng thông tin khí hậu/mùa vụ nếu có nguồn phù hợp và không mô tả nó là forecast cụ thể.

### Contract Weather Bản Đầu

- Forecast tối thiểu 7 ngày khi provider hỗ trợ.
- Ngày trong cửa sổ forecast dùng dự báo thực; ngày xa hơn chỉ dùng thông tin mùa vụ có nhãn rõ.
- Mọi weather data phải có provider, khu vực áp dụng, thời gian áp dụng, `fetchedAt` và `validUntil`.
- Snapshot hết hạn không được dùng để đưa khuyến nghị như dữ liệu mới.
- Weather được hiển thị theo tác động đến kế hoạch, không chỉ là widget nhiệt độ chung.
- Weather có thể sinh cảnh báo, phương án thay thế và change proposal, nhưng không tự đổi itinerary hay booking.
- Không kết luận đường "an toàn" hoặc "nguy hiểm" chỉ từ forecast/ETA. Cảnh báo nghiêm trọng chỉ dùng wording an toàn khi có nguồn đáng tin cậy, ưu tiên nguồn chính thức.
- Khi thiếu dữ liệu hoặc provider lỗi, AI nói rõ không thể kiểm tra forecast mới và khuyến nghị người dùng xác nhận trước khi hành động.

Weather cần xuất hiện ở nơi ra quyết định:

- Tổng quan chuyến đi: ngày/chặng có rủi ro nổi bật.
- Itinerary: forecast liên quan trực tiếp đến chặng/hoạt động.
- Trip Home: tóm tắt thời tiết cho kế hoạch hôm nay hoặc quyết định gấp.
- Chat: AI tra forecast trước khi tư vấn nếu có địa điểm + thời gian.
- Packing list: gợi ý theo thời tiết thực tế của các khu vực trong plan.

Weather snapshot là dữ liệu tạm thời, không phải trip memory lâu dài. Cần tách:

- `trip_place`: điểm neo, điểm dừng, nơi ở, hoạt động hoặc khu vực liên quan.
- `weather_snapshot`: dữ liệu chuẩn hóa từ provider, phạm vi, thời gian lấy và hạn dùng.
- `weather_impact`: đánh giá snapshot ảnh hưởng itinerary item nào, thời gian nào và mức độ nào.
- `trip_change_proposal`: đề xuất thay đổi có lý do, tác động, phương án khác và hạn dùng.

Chỉ quyết định người dùng như hoãn chặng, đổi hoạt động hoặc bỏ kế hoạch mới là dữ liệu bền vững của trip.

## Vị Trí Hiện Tại Và Google Maps Tương Lai

Vị trí hiện tại là dữ liệu ngữ cảnh cấp một cho trợ lý đồng hành, không chỉ là tiện ích bản đồ.

Ba mức sử dụng:

| Mức | Cách lấy | Giá trị | Mặc định riêng tư |
|---|---|---|---|
| Điểm dự kiến | Người dùng chọn hoặc AI trích xuất từ trip/chat | Lập kế hoạch, weather, itinerary | Không cần GPS |
| Vị trí hiện tại một lần | Người dùng bấm dùng vị trí hiện tại | Truy vấn gần đây, chỗ nghỉ/ăn/chơi/sạc, weather tức thời | Không lưu lịch sử mặc định |
| Chia sẻ khi đang đi | Người dùng chủ động bật theo Trip Project | Today/Next Decision, cảnh báo chủ động sau này | Có thời hạn, trạng thái bật rõ, tắt/xóa rõ |

Bản đầu tập trung vào điểm dự kiến và vị trí một lần theo request. Không tự bật vị trí, theo dõi nền hoặc lưu lịch sử tọa độ.

Khi tích hợp Google Maps sau này, Google Maps là adapter cho geocoding, place search, route, ETA, distance và deep link điều hướng. Nó không là nguồn chân lý của Trip Project. Trip Project vẫn sở hữu itinerary, điểm neo, quyết định đã chốt, phương án B và ràng buộc người đi; weather provider cung cấp weather; knowledge cards cung cấp kinh nghiệm địa phương và cảnh báo có nguồn.

### Contract Quyền Riêng Tư Vị Trí

- Chỉ đọc vị trí sau hành động cấp quyền rõ ràng của người dùng.
- Mặc định dùng một lần cho câu hỏi hiện tại, không lưu tọa độ chính xác.
- Chế độ on-trip sau này phải cho biết mục đích, thời hạn, trạng thái đang bật, cách tắt và cách xóa dữ liệu.
- Không dùng lịch sử vị trí cho quảng cáo, huấn luyện, chia sẻ mặc định hoặc AI memory.
- Không suy ra địa chỉ nhà, nơi làm việc hoặc thông tin đời sống không cần thiết cho chuyến đi.
- Khi có collaboration, mỗi thành viên phải opt-in riêng để chia sẻ vị trí; trip owner không tự động thấy vị trí của người khác.

## Budget, Checklist Và Travel Vault

Budget nên bắt đầu bằng dự toán liên kết với itinerary, không bắt đầu bằng split bill.

- Nhóm chi phí đầu: lưu trú, nhiên liệu/sạc EV, phí đường/phà/bãi đỗ, ăn uống, vé tham quan và dự phòng.
- AI đưa khoảng ước tính theo phong cách `tiết kiệm`, `cân bằng`, `thoải mái`; không tạo cảm giác chính xác giả.
- Mỗi khoản nêu rõ là ước tính hay chi thực tế, các giả định và yếu tố biến động.
- Theo dõi chi thực tế là bước sau; split bill là initiative riêng vì cần quy tắc chia, ứng trước, hoàn tiền và chi riêng/chung.

Smart Packing List có giá trị cao và nên là checklist AI tạo nháp từ thời tiết, vùng đi, mùa, phương tiện, loại hành trình, số trẻ và hoạt động. Người dùng kiểm soát danh sách cuối cùng.

Travel Vault cần ranh giới an toàn. Bản đầu chỉ nên lưu booking reference không nhạy cảm, tên chỗ ở, thời gian check-in, liên kết nhà cung cấp và ghi chú cần thiết. Không lưu ảnh CCCD/hộ chiếu, số định danh hoặc dữ liệu thanh toán. Lưu tệp vé/booking sau này cần một thiết kế bảo mật riêng gồm mã hóa, quyền owner-only, retention/xóa, audit, quét tệp và chính sách không dùng làm AI context mặc định.

## Collaboration

Đi gia đình thường là collaborative, nhưng collaboration không cần thuộc bản đầu.

Định hướng:

- Ban đầu một owner quản lý Trip Project.
- Mô hình dữ liệu không được khóa đường mở rộng sang `members` và vai trò.
- Khi triển khai: `owner` quản lý thành viên/xóa/chốt thay đổi; `editor` đề xuất/chỉnh kế hoạch; `viewer` xem và có thể tương tác trong phạm vi được phê duyệt.
- Không xây ngay real-time concurrent editing, chat nhóm độc lập, phân quyền quá chi tiết hay split bill.
- Có thể cung cấp link xem chỉ đọc hoặc bản xuất sau itinerary foundation; tuyệt đối loại trừ vị trí chính xác, dữ liệu nhạy cảm và booking reference.

Mọi thực thể quan trọng cần có quan hệ với Trip Project và lịch sử actor/thời gian để có thể mở rộng collaboration sau này: itinerary item, checklist item, expense, booking reference không nhạy cảm, AI proposal và change history.

## Kiến Trúc Nội Bộ: Chat-First Trip Agent

Người dùng chỉ tương tác với một trợ lý qua chat. "Skill" không là khái niệm UI hay các nút chức năng tách rời; đó là capability nội bộ có input/output rõ ràng, tool allowlist và policy áp dụng.

Luồng tổng quát:

```text
Tin nhắn người dùng
  -> Trip conversation controller
  -> tải Trip Context có giới hạn
  -> nhận diện intent và dữ kiện còn thiếu
  -> áp dụng policy deterministic
  -> chọn capability/tool nội bộ
  -> lấy dữ liệu động khi cần
  -> trả lời và/hoặc tạo proposal có cấu trúc
  -> chỉ ghi thay đổi sau khi người dùng chấp nhận
```

Nên bắt đầu ít capability, tránh tạo framework skill phức tạp quá sớm:

- `get-trip-context`
- `lookup-weather`
- `search-places`
- `get-route-estimate`
- `evaluate-itinerary-feasibility`
- `create-trip-change-proposal`
- `apply-approved-trip-change`
- `generate-packing-draft`
- `generate-budget-draft`

Sau khi một behavior phục vụ nhiều bề mặt và cần evaluation riêng, có thể tách thành skill nội bộ, ví dụ `weather-aware-planning`, `nearby-trip-assistant`, `select-trip-home-focus` hoặc `assess-trip-state`.

### Trách Nhiệm Và Ranh Giới

Trip Agent được phép đọc state, hiểu yêu cầu, chủ động tra weather khi đủ địa điểm + thời gian, dùng vị trí vừa được cấp quyền, gọi provider place/route và sinh câu trả lời hoặc proposal.

Trip Agent không được tự thay đổi persistent state, tự bật/lưu vị trí, dùng forecast stale, hay đưa ra kết luận an toàn/nguy hiểm không có nguồn phù hợp.

Chỉ server command được phép ghi dữ liệu, ví dụ:

```text
createTripChangeProposal(...)
applyApprovedTripChange(...)
dismissTripChangeProposal(...)
saveTripPlace(...)
updateTripPhase(...)
recordUserLocationConsent(...)
```

`applyApprovedTripChange` phải kiểm tra server-side quyền với Trip Project, proposal thuộc đúng trip, hạn dùng/staleness của dữ liệu nền, policy mutation, và ghi actor/thời gian/lịch sử.

## Policy Registry Và Rule Cứng

Authorization, privacy, persistence, mutation approval và safety phải được thực thi bằng schema constraints, server services, authorization checks và tests. Không được chỉ dựa vào system prompt hoặc skill prompt.

Nên version hóa policy để skill/orchestrator dùng nhất quán và có thể audit, ví dụ:

```text
weather-policy-v1
  - minimumForecastDays: 7
  - requirePlaceAndTime: true
  - staleSnapshotBehavior: do-not-recommend
  - severeAlertSource: official-only
  - itineraryMutation: user-confirmation-required

trip-home-policy-v1
  - urgentDecisionFirst: true
  - openItemsAreNotErrors: true
  - fallback: today-or-next-plan

location-policy-v1
  - oneTimeLocationDefault: true
  - persistentTracking: explicit-on-trip-consent-required
  - exactLocationRetention: none-by-default
```

Các rule cứng tối thiểu:

- Một Trip Project có một conversation chính.
- Mọi read/mutation được scope theo owner; collaboration là mở rộng quyền sau này.
- Vị trí chỉ được dùng sau consent rõ ràng; vị trí một lần không lưu lịch sử mặc định.
- Weather snapshot phải có nguồn, phạm vi, `fetchedAt`, `validUntil`; dữ liệu stale không dùng để khuyến nghị mới.
- AI không tự sửa persistent state; mọi mutation cần proposal được xác nhận.
- Cảnh báo an toàn nghiêm trọng chỉ dùng nguồn/cơ chế đã được phê duyệt.
- Weather snapshot không trở thành trip memory bền vững.
- Vị trí chính xác, booking reference hoặc dữ liệu nhạy cảm không được đưa vào link chia sẻ hay prompt/provider khi không cần.

## Lộ Trình Đề Xuất

1. **Trip planning foundation:** điểm neo, ràng buộc, ngày/chặng, activity có trạng thái ý tưởng/dự kiến/đã chốt/phương án B và một conversation chính.
2. **Trip Home và change proposal:** ưu tiên quyết định gấp rồi hôm nay/kế tiếp; chat-first composer; AI proposal có xác nhận và history.
3. **Weather-aware planning:** forecast tối thiểu 7 ngày theo địa điểm/thời gian, weather impact và đề xuất điều chỉnh; không tự mutation.
4. **One-time current location:** location theo request để hỗ trợ truy vấn gần đây, weather hiện tại, chỗ nghỉ/ăn/chơi/sạc; không lưu lịch sử.
5. **Google Maps integration:** geocoding, place search, route/ETA, deep link navigation và map như lớp hỗ trợ itinerary.
6. **Budget và preparation:** dự toán liên kết itinerary, packing list theo trip/weather; không ưu tiên split bill hoặc vault nhạy cảm.
7. **On-trip mode:** consent vị trí có thời hạn, Today/Next Decision theo vị trí, chặng kế tiếp, ETA và weather ngắn hạn.
8. **Proactive safety alerts:** chỉ sau khi đã xác minh nguồn weather/cảnh báo đường, cách xử lý provider outage, geofence, notification, độ trễ dữ liệu và wording an toàn.
9. **Collaboration:** members/roles, chia sẻ có kiểm soát, sau khi Trip foundation chứng minh giá trị.

## Câu Hỏi Cần Xác Nhận Trước Khi Triển Khai

- Provider weather nào phủ Việt Nam tốt, có forecast tối thiểu 7 ngày, dữ liệu theo giờ và điều khoản sử dụng phù hợp?
- Nguồn chính thức nào khả dụng cho cảnh báo thời tiết nghiêm trọng, tình trạng đường, sạt lở, ngập, đèo/phà và mức độ cập nhật của từng nguồn?
- Ngưỡng nào cấu thành chặng lái xe quá dài hoặc đến quá muộn theo cấu hình gia đình, và cái nào chỉ nên là cảnh báo mềm?
- Khi Trip Project chưa có ngày rõ ràng, UX nào giúp người dùng cung cấp thời gian mà không làm gián đoạn chat?
- Khi người dùng chỉ nói "khu này", thứ tự suy luận địa điểm sẽ là vị trí vừa cấp quyền, chặng/itinerary hiện tại, hay yêu cầu chọn khu vực?
- Google Maps sẽ được tích hợp ở phạm vi nào và thời điểm nào, bao gồm quota, chi phí, dữ liệu được lưu, attribution và fallback provider?
