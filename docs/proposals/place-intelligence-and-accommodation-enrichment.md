# Đề Xuất Place Intelligence Và Enrich Dữ Liệu Lưu Trú

## Trạng Thái

Định hướng được ghi nhận ngày 2026-07-24 và cập nhật ngày 2026-07-26 để xem xét khi cập nhật PRD, kiến trúc, UX, epic và story. Đây không phải kế hoạch triển khai được phê duyệt và không thay đổi phạm vi MVP hiện tại. Google Maps, OTA/booking và partner flows đều là MVP non-goals trong PRD hiện hành.

## Vấn Đề

Một câu hỏi phổ biến của người đi road trip là tìm chỗ ở, đặc biệt là homestay. OTA như Agoda có ích cho listing và tín hiệu booking, nhưng không bao phủ tốt các cơ sở nhỏ chỉ hoạt động qua Facebook, Zalo hoặc liên hệ trực tiếp. Ngược lại, Facebook và YouTube có nhiều trải nghiệm thực địa nhưng phân mảnh, có thể lỗi thời và không đủ để xác nhận tình trạng hiện tại.

XuyenViet không nên trả lời bằng danh sách OTA hoặc thứ hạng Google Maps đơn thuần. Mục tiêu là tạo shortlist ít lựa chọn nhưng phù hợp ràng buộc của chuyến đi, giải thích trade-off, hiển thị nguồn/thời điểm và chỉ ra điều người dùng cần xác nhận trước khi đặt.

Sản phẩm cũng không cần cố thay người dùng tìm "giá cuối cùng" hay quyết định kênh đặt. Giá theo account Agoda, coupon, membership và giá gọi trực tiếp là dữ liệu cá nhân, thay đổi nhanh, và chỉ người dùng mới có thể xác nhận đáng tin cậy. Giá không là điều kiện để người dùng thêm nơi ở họ đã chọn vào Trip Project.

## Định Hướng Sản Phẩm

### Accommodation Decision Assistant

Đây là capability hỗ trợ một quyết định lưu trú, không phải màn hình OTA, booking engine, hay form thu thập giá. Khi Trip Project có một chặng/ngày nghỉ tại địa điểm rõ nhưng chưa có nơi ở, trợ lý chủ động hỏi một lần theo ngữ cảnh:

```text
Bạn sẽ nghỉ tại Đà Nẵng từ 12 đến 14/08 nhưng chưa có chỗ ở.
Bạn có muốn mình tìm vài lựa chọn phù hợp với gia đình không?

[Mình cần gợi ý phòng] [Tự tìm rồi báo bạn] [Để sau]
```

`Tự tìm rồi báo bạn` và `Để sau` là trạng thái hợp lệ. Không coi chỗ ở chưa chọn là lỗi và không lặp lại lời mời một cách gây phiền nhiễu.

Khi người dùng yêu cầu hỗ trợ, hệ thống dùng ngày ở, số khách/trẻ em, ràng buộc xe, ngân sách, ưu tiên khu vực và chặng tiếp theo đã có trong Trip Project. Nếu thiếu một dữ kiện làm shortlist kém hữu ích, chỉ hỏi một câu ngắn, ví dụ ưu tiên gần biển, trung tâm hay thuận tiện đi tiếp. Sau đó capability thực hiện:

```text
Trip context
  -> Agoda catalog + Search API: candidate và availability/rate còn hiệu lực
  -> Google Places: khớp đúng khách sạn, Maps link, rating/review signal, phone công khai
  -> trip-fit filtering/ranking và giải thích trade-off
  -> 3-5 accommodation decision cards
  -> người dùng tự kiểm tra Agoda, đọc review gốc hoặc gọi khách sạn
  -> người dùng báo lựa chọn trong chat
  -> typed Trip Change Proposal
  -> owner xác nhận
  -> Trip Project cập nhật nơi ở đã chọn
```

Mỗi card chỉ cần trả lời tại sao phù hợp với chuyến đi và dẫn người dùng tới nơi tự quyết định:

```text
[Tên khách sạn]
Phù hợp vì: gần bãi biển, có tín hiệu bãi đỗ xe, thuận tiện đi Hội An sáng hôm sau.
Google Maps: 4,4/5 từ 1.240 review; review gần đây khen vị trí, một số nhắc cách âm.

[Xem trên Agoda] [Mở Google Maps] [Gọi khách sạn]
```

Agoda rate/availability có thể hỗ trợ sàng lọc và hiển thị theo policy provider, nhưng không được khẳng định là giá tốt nhất, giá cuối cùng, hay phòng được giữ. Không truyền email người dùng sang Agoda Search API để cố lấy account-specific pricing: Demand Search contract công khai chỉ nhận criteria lưu trú, occupancy, locale/currency và `userCountry`, không có user-owned Agoda identity hoặc coupon field. Nếu người dùng muốn kiểm tra ưu đãi theo account, họ làm trên Agoda qua link chính thức.

Câu chốt của trợ lý sau shortlist phải rõ và nhẹ:

```text
Bạn có thể xem giá và ưu đãi theo tài khoản trên Agoda, đọc review gốc trên Google Maps,
hoặc gọi trực tiếp khách sạn. Khi chọn được nơi ở, chỉ cần nhắn cho mình, ví dụ
"Chốt khách sạn A, 12-14/08"; mình sẽ thêm vào Trip Project.
```

Người dùng không bị yêu cầu nhập giá Agoda, giá gọi trực tiếp, coupon, điều kiện hủy hay mã booking để lưu lựa chọn. Nếu họ chủ động cung cấp giá hoặc booking reference không nhạy cảm, đó là metadata tùy chọn với nhãn rõ là do người dùng cung cấp, không phải provider-verified fact.

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

Google Places không được giả định là có thể lọc hoặc xếp hạng review theo "Local Guide". Chỉ hiển thị/diễn giải thuộc tính reviewer nếu Google API và hợp đồng cho phép cung cấp rõ ràng. Nếu không, review signal chỉ dựa trên dữ liệu hợp lệ như rating, review count, độ mới và các chủ đề lặp lại trong phần review được phép hiển thị.

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

Mỗi shortlist card nên có lý do phù hợp, dữ liệu cần xác nhận, thời điểm kiểm tra gần nhất, nguồn/deep links và các hành động: xem trên Agoda, mở Maps, gọi/liên hệ nơi ở, hoặc xem thêm lựa chọn. Không biến card thành action ghi plan state. AI không tự thêm một nơi ở vào itinerary hoặc chuyển nó thành `confirmed`; chỉ khi người dùng nói họ đã chọn nơi ở thì hệ thống mới tạo proposal, và owner phải chấp nhận proposal đó.

Người dùng có thể trả lời bằng ngôn ngữ tự nhiên, chẳng hạn "Chốt khách sạn A, ở 12 đến 14/08". Hệ thống dùng candidate vừa hiển thị để resolve nơi ở; nếu nhiều place trùng tên hoặc confidence thấp, yêu cầu chọn đúng một nơi. Proposal tối thiểu chứa tên/khu vực, thời gian ở và trạng thái owner chọn (`planned`, `confirmed`, hoặc `backup`). `confirmed` vẫn chỉ là owner-confirmed decision, không khẳng định booking, availability, giá hoặc provider validation.

## Ranh Giới Và Invariant

- Curated knowledge, dynamic provider snapshots và traveler memory là ba nhóm dữ liệu tách biệt.
- Chỉ knowledge card policy-eligible mới có thể trở thành knowledge dùng lại cho traveler; raw Facebook/YouTube, Google review text và search result không vào retrieval trực tiếp.
- Web/Maps result dùng để trả lời ngay phải có provenance, thời điểm kiểm tra và uncertainty riêng; không tự làm nhiễm knowledge lâu dài.
- Giá, availability, parking, phụ thu và booking policy không được khẳng định nếu không có nguồn provider thích hợp, còn hiệu lực hoặc xác nhận trực tiếp.
- AI chỉ tạo explanation/shortlist/proposal; mọi persistent trip mutation cần user confirmation và server-side policy checks.
- Provider snapshot, raw review text, request/response payload, account-specific offer, coupon và direct-call quote không là Trip Project memory mặc định. Chỉ user-confirmed accommodation decision mới là persistent state.
- Không yêu cầu giá để tạo accommodation proposal. Giá hoặc kênh đặt chỉ là metadata tùy chọn do owner chủ động cung cấp.
- Agoda integration bắt đầu bằng Online Affiliate/MSE model, Content API, Search API và provider-issued `landingUrl` nếu partner agreement cho phép. Không đưa Book API, payment, booking servicing, scrape hoặc dùng session/cookie Agoda của người dùng vào scope này.
- Google Maps, OTA, website, Facebook Page và từng evidence record có provenance riêng; không gán nhãn `official` cho toàn bộ domain/provider.
- Data retention, caching, attribution, quota và chi phí của từng provider là architecture/configuration concern, không hard-code trong prompt hay UI.

## Câu Hỏi Cần Xác Nhận Trước Khi Đưa Vào PRD

- Google Maps Platform API/SKU nào phù hợp, quota/chi phí ra sao, và điều khoản cho retention/attribution của từng field là gì?
- OTA/provider nào có API hoặc nguồn dữ liệu phù hợp cho availability/price mà không tạo dependency vào booking flow?
- Agoda có phê duyệt XuyenViet cho Online Affiliate/MSE model tại Việt Nam không; `metaSearch`/`landingUrl`, display, attribution, cache/TTL, quota và Search API certification áp dụng thế nào?
- Google Places API/SKU có trả review, contact/phone và attribution theo điều kiện nào; có bất kỳ supported field nào cho reviewer authority/Local Guide hay không?
- Canonical place identity và entity-resolution policy xử lý thế nào khi cùng một homestay đổi tên, có nhiều listing hoặc sai tọa độ?
- Những yêu cầu nào là hard constraint ban đầu cho family road trip: parking, xe 7 chỗ, EV, trẻ em, late check-in, ngân sách hay lệch route?
- TTL/refresh policy nào áp dụng cho Maps, OTA, route/ETA, contact và dữ liệu hoạt động?
- Khi nào một community observation đủ mạnh để ảnh hưởng ranking, và khi nào phải chỉ hiển thị như caveat?
- Gemini grounding with Google Maps có capability, citation và terms đủ rõ để dùng như discovery fallback không?
- UX nào cho phép người dùng xác nhận dữ kiện thiếu hoặc chuyển candidate thành `planned`/`confirmed` mà không biến AI thành booking agent?

## Thứ Tự Đề Xuất

1. Xác nhận PRD contract cho place identity, source classes, snapshot/provenance, user-confirmed trip state và uncertainty.
2. Thiết kế architecture cho Google Places/Routes adapter, provider terms, caching/attribution, entity resolution, quota/cost và server-side mutation policy.
3. Hoàn thành Trip Project structured planning và change-proposal UX làm nền cho một nơi ở user-chosen có thể được thêm an toàn.
4. Thêm accommodation-gap prompt có opt-in: hỏi owner có muốn shortlist hay tự tìm/để sau; không coi open accommodation là lỗi.
5. Xây Places discovery, entity match, Maps deep link/contact và deterministic trip-fit trước; dùng AI để giải thích sau khi filter/rank.
6. Thêm Agoda Online Affiliate/MSE Content/Search và `landingUrl` sau khi partnership, terms, cache/attribution và certification được xác nhận; không dùng Book API.
7. Liên kết knowledge cards Facebook/YouTube với canonical places bằng confidence có thể review, sau đó đánh giá Gemini Maps grounding như fallback discovery.

## Tài Liệu Liên Quan

- [Trip Project Product Direction](./trip-project-product-direction.md)
- [Knowledge Retrieval and Traveler Memory Roadmap](../roadmaps/knowledge-retrieval-and-traveler-memory.md)
- [AI-First YouTube Discovery Proposal](./ai-first-youtube-discovery.md)
- [Facebook Capture Operations](../runbooks/facebook-capture.md)
