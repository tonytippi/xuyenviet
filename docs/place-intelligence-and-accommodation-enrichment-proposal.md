# Đề Xuất Place Intelligence Và Enrich Dữ Liệu Lưu Trú

## Trạng Thái

Định hướng được ghi nhận ngày 2026-07-24 để xem xét khi cập nhật PRD, kiến trúc, UX, epic và story. Đây không phải kế hoạch triển khai được phê duyệt và không thay đổi phạm vi MVP hiện tại.

## Vấn Đề

Một câu hỏi phổ biến của người đi road trip là tìm chỗ ở, đặc biệt là homestay. OTA như Agoda có ích cho listing và tín hiệu booking, nhưng không bao phủ tốt các cơ sở nhỏ chỉ hoạt động qua Facebook, Zalo hoặc liên hệ trực tiếp. Ngược lại, Facebook và YouTube có nhiều trải nghiệm thực địa nhưng phân mảnh, có thể lỗi thời và không đủ để xác nhận tình trạng hiện tại.

XuyenViet không nên trả lời bằng danh sách OTA hoặc thứ hạng Google Maps đơn thuần. Mục tiêu là tạo shortlist ít lựa chọn nhưng phù hợp ràng buộc của chuyến đi, giải thích trade-off, hiển thị nguồn/thời điểm và chỉ ra điều người dùng cần xác nhận trước khi đặt.

## Định Hướng Sản Phẩm

```text
Trip context
  + Google Maps/Places: candidate, identity, location, contact, route/ETA
  + OTA: listing, giá/tồn phòng/chính sách khi có nguồn còn hiệu lực
  + XuyenViet knowledge: quan sát Facebook/YouTube có evidence và điều kiện
  + Web search: trang chính thức, Facebook Page, website, booking link
  -> shortlist theo trip-fit + hành động xác nhận/chốt
```

Ví dụ, thay vì nói "đây là homestay 4.8 sao", trợ lý cần có thể trả lời:

> Ba lựa chọn này ít lệch khỏi chặng ngày mai và có tín hiệu phù hợp gia đình. Một nơi được cộng đồng ghi nhận có chỗ đỗ ô tô nhưng đường vào dốc; hãy hỏi chủ nhà về xe 7 chỗ và điều kiện khi mưa trước khi đặt.

## Mô Hình Place Chung

`places` là canonical entity do XuyenViet sở hữu cho mọi địa điểm, không chỉ cho khách sạn hoặc homestay. Nó không phải bản sao listing của Google Maps hay OTA.

Một place có thể thuộc các nhóm sau:

- Lưu trú: homestay, hotel, resort, villa, camping.
- Tham quan: danh thắng, bảo tàng, di tích, bãi biển, điểm ngắm cảnh.
- Ăn uống: quán ăn, cafe, chợ, địa điểm đặc sản.
- Dịch vụ road trip: điểm nghỉ, bãi đỗ, trạm sạc EV, trạm nhiên liệu, gara.
- Hạ tầng/di chuyển: bến phà, trạm thu phí, nút giao.
- Khu vực: thị trấn, khu du lịch, phường/xã, vùng quanh một điểm.

Mô hình tối thiểu đề xuất:

```text
places
  id
  canonical_name
  place_kind          -- accommodation | attraction | food | service | transport | area
  place_type          -- homestay | hotel | museum | beach | ev_charger | ferry_terminal...
  normalized_address
  latitude, longitude
  parent_place_id     -- entity/khu vực cha khi phù hợp
  status

place_provider_references
  place_id
  provider            -- google_maps | agoda | official_site | facebook_page ...
  external_id
  canonical_url
  linked_at

place_provider_snapshots
  reference_id
  normalized_fields
  fetched_at
  valid_until
  attribution

place_knowledge_links
  place_id
  knowledge_card_id
  match_confidence
  link_state

trip_places
  trip_id
  place_id
  role
  status              -- idea | planned | confirmed | backup
  check_in_at, check_out_at
  user_notes
```

`parent_place_id` chỉ phục vụ hierarchy đơn giản, ví dụ Măng Đen là area cha của một homestay hoặc điểm tham quan. Cung đường, đèo hoặc đoạn đường dài không nên bị ép thành point place: chúng cần `route_segment` riêng với điểm đầu-cuối hoặc geometry. `trip_places` và itinerary là state riêng của Trip Project, không làm thay đổi place chung.

`place_observations` chưa nhất thiết là bảng riêng. Ban đầu nó có thể là projection từ knowledge cards và `place_knowledge_links`; chỉ tách khi cần filter, entity resolution và UX riêng theo observation.

## Hợp Nhất Nguồn

### Dữ Liệu Lưu Bền Vững

Lưu dữ liệu cần để nhận diện, liên kết và tái sử dụng place:

- Canonical name, loại, địa chỉ/tọa độ chuẩn hóa và quan hệ khu vực.
- Provider reference: ưu tiên Google Place ID khi dùng Google Maps, cùng OTA ID/URL, website chính thức hoặc Facebook Page khi có.
- Alias: tên cũ, cách viết khác, tên được nhắc trong post/video để hỗ trợ entity resolution.
- Liên kết evidence-grounded knowledge cards với confidence và trạng thái reviewable.
- Việc người dùng dùng place trong trip, bao gồm vai trò, trạng thái và ghi chú cá nhân.

### Snapshot Có Hạn Dùng

Không ghi các dữ liệu biến động thành fact lâu dài của place. Lưu tối thiểu dưới dạng provider snapshot có `fetched_at`, `valid_until`, source/provider và attribution theo điều khoản provider:

- Google Maps rating, review count, trạng thái hoạt động, contact hoặc website khi được phép.
- Giá, phụ thu, tồn phòng và booking policy từ OTA/provider.
- Giờ hoạt động, ETA, quãng đường, mức lệch route.
- Tình trạng parking, đường vào, thời tiết hoặc dịch vụ đang hoạt động.

Khi snapshot hết hạn, AI không được trình bày nó là thông tin hiện tại. Có thể nêu lần kiểm tra gần nhất và dẫn người dùng mở nguồn để kiểm tra lại.

### Facebook Và YouTube Là Quan Sát Có Điều Kiện

Facebook và YouTube bổ sung phần Google Maps/OTA thường không trả lời tốt: đường vào, xe phù hợp, mức yên tĩnh, không gian cho trẻ, cách host hỗ trợ, trải nghiệm mùa mưa hoặc các trade-off thực tế.

Chúng không ghi đè dữ liệu provider và không trở thành fact tuyệt đối. Một observation cần giữ:

```text
place_id
knowledge_card_id / source_id
observation_type
summary
conditions
observed_at hoặc source_published_at
knowledge_state / confidence
freshness_sensitive
```

Ví dụ: "Hai nguồn cộng đồng trong năm 2025 ghi nhận có chỗ đỗ ô tô và đường vào hơi dốc. Nếu đi xe 7 chỗ hoặc tới lúc mưa, hãy hỏi chủ nhà về chỗ quay đầu và điều kiện đường vào hiện tại."

Các claim như "có parking", "phòng family", "host nhận check-in muộn", "giá", "còn phòng" hoặc "đường vào dễ" chỉ trở thành điều kiện để hỏi xác nhận khi evidence chưa đủ mới hoặc chưa có nguồn chính thức phù hợp.

## Google Maps Và Gemini

Google Maps là adapter cho discovery và dữ liệu cấu trúc, không là source of truth của Trip Project. Nó phù hợp cho:

- Tìm candidate theo khu vực hoặc dọc route.
- Nhận diện/deduplicate place bằng Google Place ID.
- Lấy place details tối thiểu, canonical URL/deep link và dữ liệu contact được phép.
- Tính route, ETA, distance và mức lệch route.
- Đưa người dùng tới Google Maps để xem review mới, gọi điện hoặc điều hướng.

Gemini không nên là nguồn chân lý địa điểm. Hướng ưu tiên là server gọi Places/Routes API, chuẩn hóa một bundle nhỏ hợp lệ rồi để Gemini:

- Đối chiếu candidate với ràng buộc trip, gia đình, xe, ngân sách và chặng tiếp theo.
- Giải thích trade-off giữa các lựa chọn.
- Nhận diện dữ kiện thiếu và tạo câu hỏi xác nhận cho chủ nhà.
- Soạn shortlist và proposal để người dùng quyết định.

Gemini grounding with Google Maps, nếu được dùng và điều khoản cho phép, chỉ là discovery fallback có citation. Nó không thay thế Places/Routes adapter có schema, không tự xác nhận availability/price/parking, và output của model phải qua validation, dedupe và provenance policy.

Không scrape Google Maps hoặc Google Reviews. Trước khi persist bất kỳ field nào, cần xác nhận điều khoản của API/SKU cụ thể về caching, retention, attribution và hiển thị rating, contact, photos hoặc review content. Mặc định an toàn là lưu dài hạn provider identifier/deep link; lưu data provider thành snapshot có TTL; không copy review text/ảnh vào knowledge store; không biến rating/review Google thành evidence của knowledge card.

## Ranking Theo Trip-Fit

Google rating và review count là tín hiệu ranking yếu, không phải điểm chất lượng hay bảo đảm phù hợp. Hệ thống nên xếp theo `trip-fit` thay vì "homestay tốt nhất".

```text
trip-fit =
  hard constraints
  + route/ETA fit
  + family/vehicle fit signals
  + evidence-grounded community observations
  + provider completeness/freshness
  + rating confidence
  - unresolved risks
  - unconfirmed critical requirements
```

Hard constraints gồm số khách, trẻ em, xe, ngân sách, khoảng ngày, parking và mức chấp nhận lệch route. Không hiển thị một số điểm chính xác giả tạo như `8.7/10`; thay vào đó giải thích ngắn theo lý do và dữ kiện còn thiếu.

Ví dụ các nhãn UX:

- `Hợp chặng tiếp theo`: ít lệch route và ETA phù hợp.
- `Có tín hiệu phù hợp gia đình`: có nguồn về không gian/trẻ em, nhưng chưa xác nhận loại phòng.
- `Cần hỏi trước khi đặt`: parking, giá cuối tuần, phụ thu trẻ em, late check-in hoặc đường vào.
- `Phương án B`: phù hợp khi mưa, đến muộn hoặc nơi ưu tiên hết phòng.

## Trải Nghiệm Homestay Match

Đây là internal capability, không phải màn hình "hotel search" độc lập:

```text
search-homestay-candidates
  -> Places/OTA/web candidates theo khu vực hoặc route

enrich-homestay-candidates
  -> place details, route/ETA, official/contact links, knowledge links

evaluate-trip-fit
  -> deterministic constraints/ranking trước, AI explanation sau

generate-homestay-shortlist
  -> 3-5 lựa chọn, trade-off, evidence, dữ kiện thiếu, hành động tiếp theo
```

Mỗi shortlist card nên có lý do phù hợp, dữ liệu cần xác nhận, thời điểm kiểm tra gần nhất, nguồn/deep links và các hành động: mở Maps, liên hệ chủ nhà, xem nguồn, lưu như phương án B hoặc tạo Trip Change Proposal. AI không tự thêm một nơi ở vào itinerary hoặc chuyển nó thành `confirmed`; người dùng phải chấp nhận proposal và xác nhận booking.

## Ranh Giới Và Invariant

- Curated knowledge, dynamic provider snapshots và traveler memory là ba nhóm dữ liệu tách biệt.
- Chỉ knowledge card policy-eligible mới có thể trở thành knowledge dùng lại cho traveler; raw Facebook/YouTube, Google review text và search result không vào retrieval trực tiếp.
- Web/Maps result dùng để trả lời ngay phải có provenance, thời điểm kiểm tra và uncertainty riêng; không tự làm nhiễm knowledge lâu dài.
- Giá, availability, parking, phụ thu và booking policy không được khẳng định nếu không có nguồn provider thích hợp, còn hiệu lực hoặc xác nhận trực tiếp.
- AI chỉ tạo explanation/shortlist/proposal; mọi persistent trip mutation cần user confirmation và server-side policy checks.
- Google Maps, OTA, website, Facebook Page và từng evidence record có provenance riêng; không gán nhãn `official` cho toàn bộ domain/provider.
- Data retention, caching, attribution, quota và chi phí của từng provider là architecture/configuration concern, không hard-code trong prompt hay UI.

## Câu Hỏi Cần Xác Nhận Trước Khi Đưa Vào PRD

- Google Maps Platform API/SKU nào phù hợp, quota/chi phí ra sao, và điều khoản cho retention/attribution của từng field là gì?
- OTA/provider nào có API hoặc nguồn dữ liệu phù hợp cho availability/price mà không tạo dependency vào booking flow?
- Canonical place identity và entity-resolution policy xử lý thế nào khi cùng một homestay đổi tên, có nhiều listing hoặc sai tọa độ?
- Những yêu cầu nào là hard constraint ban đầu cho family road trip: parking, xe 7 chỗ, EV, trẻ em, late check-in, ngân sách hay lệch route?
- TTL/refresh policy nào áp dụng cho Maps, OTA, route/ETA, contact và dữ liệu hoạt động?
- Khi nào một community observation đủ mạnh để ảnh hưởng ranking, và khi nào phải chỉ hiển thị như caveat?
- Gemini grounding with Google Maps có capability, citation và terms đủ rõ để dùng như discovery fallback không?
- UX nào cho phép người dùng xác nhận dữ kiện thiếu hoặc chuyển candidate thành `planned`/`confirmed` mà không biến AI thành booking agent?

## Thứ Tự Đề Xuất

1. Xác nhận PRD contract cho place identity, source classes, snapshot/provenance, user-confirmed trip state và uncertainty.
2. Thiết kế architecture cho Google Places/Routes adapter, provider terms, caching/attribution, entity resolution, quota/cost và server-side mutation policy.
3. Bổ sung Trip Project structured planning và change-proposal UX làm nền cho shortlist có thể hành động.
4. Xây Places/Routes discovery, route-fit và deep link trước; dùng deterministic filtering/ranking trước khi thêm AI explanation.
5. Liên kết knowledge cards Facebook/YouTube với canonical places bằng confidence có thể review.
6. Thêm OTA/official-contact enrichment và confirmation flow; chỉ sau đó đánh giá Gemini Maps grounding như fallback discovery.

## Tài Liệu Liên Quan

- [Trip Project Product Direction](./trip-project-product-direction.md)
- [Knowledge Retrieval and Traveler Memory Roadmap](./knowledge-retrieval-and-memory-roadmap.md)
- [AI-First YouTube Discovery Proposal](./ai-first-youtube-discovery-proposal.md)
- [Facebook Capture Operations](./facebook-capture-operations.md)
