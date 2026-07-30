import Link from "next/link";

const sections = [
  { title: "Nguồn và tác vụ xử lý", href: "/admin/knowledge/intake", action: "Mở nạp nguồn", states: [
    ["Đang chờ xử lý / Đang đọc nguồn", "Nguồn đã vào hệ thống hoặc đang được đọc.", "Chờ quy trình hoàn tất; không gửi lại cùng URL."],
    ["Đang trích xuất bằng AI", "Một tác vụ trích xuất đang hoạt động.", "Chờ tác vụ hoàn tất; không bấm trích xuất lại."],
    ["Xử lý thất bại", "Tác vụ không hoàn tất và có thể kèm tóm tắt lỗi.", "Kiểm tra URL hoặc lỗi ở chi tiết. Chỉ chạy lại khi màn hình cung cấp thao tác phù hợp."],
    ["Trùng lặp / Đã gỡ", "Nguồn đã tồn tại hoặc đã bị rút khỏi điều kiện sử dụng.", "Không dùng nguồn này làm dữ liệu mới; đối chiếu thẻ hoặc nguồn hiện có."],
  ] },
  { title: "Nguồn Facebook", href: "/admin/knowledge/facebook-captures", action: "Mở hàng đợi Facebook", states: [
    ["Đang sàng lọc, trích xuất, đánh giá hoặc đối chiếu", "Pipeline Facebook vẫn đang chạy.", "Chờ; không tạo thẻ thủ công để thay thế pipeline."],
    ["Cần vận hành kiểm tra", "Có nội dung cần xem trước khi quyết định sử dụng.", "Mở chi tiết, đối chiếu bằng chứng và xử lý theo luồng được hiển thị."],
    ["Cần xác minh trước", "Nội dung chưa đủ điều kiện sử dụng bình thường.", "Đối chiếu bằng chứng; chỉ chọn xuất bản khi có quyết định phù hợp trong UI."],
  ] },
  { title: "Nguồn YouTube", href: "/admin/knowledge/youtube-captures", action: "Mở hàng đợi YouTube", states: [
    ["Bằng chứng YouTube đã thu thập", "Video có bằng chứng giới hạn, mặc định là nguồn cộng đồng/chưa xác minh.", "Mở chi tiết để kiểm tra nội dung, mốc thời gian, độ tin cậy và độ mới trước khi trích xuất bản nháp."],
    ["Đang trích xuất bằng AI", "Một tác vụ trích xuất từ video đang hoạt động.", "Chờ tác vụ hoàn tất; không bấm trích xuất lại."],
  ] },
  { title: "Bản nháp AI", href: "/admin/knowledge/drafts", action: "Mở hàng đợi bản nháp", states: [
    ["Bản nháp", "AI đề xuất nội dung, chưa được phép dùng cho du khách.", "Kiểm tra nội dung, nguồn, độ tin cậy và độ mới trước khi phê duyệt hoặc từ chối."],
  ] },
  { title: "Xuất bản và chỉ mục AI", href: "/admin/knowledge/approved", action: "Mở tri thức đã phê duyệt", states: [
    ["Đã phê duyệt", "Vòng đời bản nháp đã hoàn tất, nhưng thẻ chưa chắc đang được xuất bản cho du khách.", "Hậu kiểm nguồn, độ tin cậy và thông tin cần cập nhật; phê duyệt không đồng nghĩa đã xác minh hoặc đang xuất bản."],
    ["Đã xuất bản", "Thẻ đang hoạt động, không còn cần duyệt và có thể xuất hiện trong thư viện tri thức.", "Kiểm tra trạng thái chỉ mục nếu cần Trợ lý AI truy xuất thẻ."],
    ["Đã index", "Chỉ mục AI hiện hành đã có cho thẻ.", "Có thể được Trợ lý AI truy xuất; vẫn theo dõi độ mới của nguồn."],
    ["Chưa index / Index cần refresh", "Chưa có chỉ mục hoặc chỉ mục cũ hơn phiên bản thẻ.", "Chờ worker đồng bộ; kiểm tra tiến trình và bằng chứng nếu kéo dài."],
    ["Chờ evidence; chưa thể index / Index không active", "Điều kiện bằng chứng hoặc chỉ mục chưa cho phép AI dùng thẻ.", "Kiểm tra nguồn, bằng chứng và khuyến nghị liên quan; không coi thẻ là sẵn sàng truy xuất."],
  ] },
  { title: "Khuyến nghị vận hành", href: "/admin/knowledge/recommendations", action: "Mở khuyến nghị", states: [
    ["Cần xử lý", "Khuyến nghị còn khớp với nội dung và bằng chứng hiện hành.", "Mở chi tiết, đối chiếu bằng chứng, rồi đưa ra quyết định theo các lựa chọn có sẵn."],
    ["Đã hoàn tất", "Khuyến nghị đã có kết quả xử lý.", "Hậu kiểm kết quả; không xử lý lại nếu không có khuyến nghị hiện hành."],
    ["Không còn hiệu lực", "Khuyến nghị đã bị thay thế hoặc không còn khớp phiên bản hiện tại.", "Không thao tác tiếp; tìm khuyến nghị hiện hành nếu cần."],
    ["Đã giữ lại, không xuất bản", "Kết quả không được công bố cho du khách.", "Không coi là tri thức dùng được; xem chi tiết nếu cần hiểu lý do."],
  ] },
];

export default function DataStatesGuidePage() {
  return <div><header><p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Hướng dẫn 02</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Trạng thái dữ liệu và việc cần làm</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-[#4f625a]">Dùng trang này để chọn thao tác an toàn. Nếu trạng thái không có hành động được hiển thị trong admin, không tự bỏ qua quy trình hoặc tạo thao tác ngoài luồng.</p></header><div className="mt-8 grid gap-6">{sections.map((section) => <section className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6" key={section.title}><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{section.title}</h2><Link className="font-semibold text-[#1f5f46] underline underline-offset-4" href={section.href}>{section.action}</Link></div><div className="mt-5 grid gap-3">{section.states.map(([state, meaning, next]) => <article className="rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4" key={state}><h3 className="font-semibold text-[#17342c]">{state}</h3><p className="mt-2 leading-6 text-[#4f625a]"><strong className="text-[#17342c]">Ý nghĩa: </strong>{meaning}</p><p className="mt-2 leading-6 text-[#4f625a]"><strong className="text-[#17342c]">Nên làm: </strong>{next}</p></article>)}</div></section>)}</div></div>;
}
