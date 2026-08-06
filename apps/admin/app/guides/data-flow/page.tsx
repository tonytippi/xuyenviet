import Link from "next/link";

const steps = [
  { number: "01", title: "Đăng ký URL tại Nạp nguồn", body: "Người vận hành nhập URL sạch và xem loại nguồn cùng việc đã có nội dung thu thập hiện hành hay chưa. “Đã xử lý” ở đây chỉ nghĩa là đã có phiên bản nội dung thu thập, không phải đã được xuất bản hoặc AI đang dùng.", href: "/knowledge/intake", action: "Mở nạp nguồn" },
  { number: "02", title: "Kiểm tra bằng chứng YouTube", body: "YouTube hiển thị bằng chứng có cấu trúc từ lần thu thập, gồm mốc thời gian, độ tin cậy và điều kiện. Bằng chứng này không tự trở thành tri thức đã xác minh hoặc thẻ đang hoạt động.", href: "/knowledge/youtube-captures", action: "Mở hàng đợi YouTube" },
  { number: "03", title: "Theo dõi xử lý kỹ thuật", body: "Mỗi lần thu thập có một tác vụ xử lý kỹ thuật: chờ, đang chạy, hoàn thành hoặc lỗi. Số ứng viên đã xử lý cho biết tiến độ; một tác vụ hoàn thành vẫn có thể có các kết quả khác nhau.", href: "/knowledge/facebook-captures", action: "Mở tác vụ Facebook" },
  { number: "04", title: "Xem ứng viên và thẻ độc lập", body: "Ứng viên giữ trạng thái xử lý và quyết định AI riêng. Thẻ tri thức có vòng đời, phân loại cộng đồng và yêu cầu xác minh riêng; không suy ra trạng thái thẻ chỉ từ trạng thái tác vụ hoặc ứng viên.", href: "/knowledge/cards", action: "Mở thẻ tri thức" },
  { number: "05", title: "Giải quyết yêu cầu hiện hành", body: "Hàng đợi chỉ chứa công việc rủi ro, xác minh, quan hệ, thiếu ngữ cảnh hoặc lấy mẫu. Chỉ thao tác với yêu cầu đang mở; yêu cầu đã hoàn tất hoặc không còn hiệu lực không được dùng để đổi thẻ hiện tại.", href: "/knowledge/recommendations", action: "Mở yêu cầu" },
  { number: "06", title: "Truy xuất và mức độ bao phủ", body: "Chỉ thẻ đang hoạt động, không cần xác minh và còn bằng chứng/nguồn hợp lệ mới được dùng để trả lời. Chỉ mục tìm kiếm là phần kỹ thuật; mức độ bao phủ chỉ đếm thẻ đang hoạt động có bằng chứng hợp lệ và đủ thông tin truy xuất.", href: "/knowledge/progress", action: "Mở mức độ bao phủ" },
];

export default function DataFlowGuidePage() {
  return <div>
    <GuideHeader eyebrow="Hướng dẫn 01" title="Luồng dữ liệu: từ nguồn thô đến câu trả lời AI" body="Hệ thống tách việc thu thập, đánh giá và xuất bản để tri thức chưa đủ điều kiện không bị dùng nhầm cho du khách." />
    <ol className="mt-8 grid gap-4">
      {steps.map((step) => <li className="grid gap-4 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 shadow-[0_12px_30px_rgba(41,33,18,0.08)] sm:grid-cols-[4rem_1fr_auto] sm:items-start" key={step.number}><span className="flex size-12 items-center justify-center rounded-full bg-[#1f5f46] font-semibold text-white">{step.number}</span><div><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{step.title}</h2><p className="mt-3 leading-7 text-[#4f625a]">{step.body}</p></div><Link className="min-h-11 rounded-xl border border-[#8fb59f] px-4 py-3 text-center font-semibold text-[#1f5f46] transition hover:bg-[#edf7ef] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" href={step.href}>{step.action}</Link></li>)}
    </ol>
    <section className="mt-8 scroll-mt-6 rounded-[1.75rem] border border-[#d8c9ad] bg-white/75 p-5 shadow-[0_12px_30px_rgba(41,33,18,0.08)] sm:p-6" id="tro-ly-ai-dung-tri-thuc">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Cách Trợ lý AI dùng tri thức</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#17342c]">Từ dữ liệu nguồn đến phần ngữ cảnh trong prompt</h2>
      <div className="mt-6 grid gap-3 lg:grid-cols-5">
        <SystemStep number="01" title="Nguồn và lần thu thập" detail="URL được đăng ký; phiên bản thu thập giữ nội dung chỉ dành cho vận hành hoặc bằng chứng có cấu trúc." />
        <SystemStep number="02" title="Xử lý và ứng viên" detail="Tiến trình nền phát hiện ứng viên, kiểm tra bằng chứng và ghi kết quả kỹ thuật/AI cho từng ứng viên." />
        <SystemStep number="03" title="Thẻ và bằng chứng" detail="Một ứng viên hợp lệ tạo hoặc cập nhật thẻ cùng bằng chứng có đoạn trích được kiểm chứng." />
        <SystemStep number="04" title="Vòng đời và yêu cầu" detail="Vòng đời, phân loại, xác minh và yêu cầu vận hành là các phần độc lập, được kiểm tra trước khi thay đổi." />
        <SystemStep number="05" title="Dữ liệu dùng để trả lời" detail="Chỉ thẻ đang hoạt động với bằng chứng/nguồn còn hợp lệ được chọn trước khi tạo câu trả lời." />
      </div>
      <div className="mt-5 rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4 text-sm leading-6 text-[#4f625a]"><p><strong className="text-[#17342c]">Về chỉ mục tìm kiếm:</strong> thẻ được lập chỉ mục cùng thông tin mô tả và bằng chứng để phục vụ việc tìm kiếm có kiểm soát. Vì vậy, “đã lập chỉ mục” chỉ cho biết thẻ đã sẵn sàng cho bước tìm kiếm, không thay thế các điều kiện an toàn khác.</p></div>
    </section>
    <section className="mt-8 rounded-[1.5rem] border border-[#e5bd82]/60 bg-[#f4ead7] p-5 sm:p-6"><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Điểm kiểm soát quan trọng</h2><p className="mt-3 leading-7 text-[#4f625a]">Không suy diễn kết quả xuất bản từ trạng thái nguồn, lần thu thập hay tác vụ xử lý. Nguồn cộng đồng và bằng chứng YouTube/Facebook cần được dùng theo vòng đời, bằng chứng và yêu cầu xác minh của thẻ hiện hành.</p></section>
  </div>;
}

function GuideHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <header><p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">{eyebrow}</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-[#4f625a]">{body}</p></header>;
}

function SystemStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <article className="rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4"><span className="text-sm font-semibold tracking-[0.16em] text-[#8c4f13]">{number}</span><h3 className="mt-2 font-semibold text-[#17342c]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#4f625a]">{detail}</p></article>;
}
