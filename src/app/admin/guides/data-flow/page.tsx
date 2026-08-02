import Link from "next/link";

const steps = [
  { number: "01", title: "Nạp nguồn", body: "Operator thêm URL. Hệ thống lưu nguồn để đọc, thu thập hoặc trích xuất theo luồng phù hợp; URL trùng hoặc đã gỡ không nên được nhập lại như một nguồn mới.", href: "/admin/knowledge/intake", action: "Mở nạp nguồn" },
  { number: "02", title: "Thu thập và xử lý nguồn Facebook", body: "Nguồn Facebook được thu thập thành bằng chứng có giới hạn. Pipeline có thể sàng lọc, trích xuất, đánh giá bằng chứng và đối chiếu thẻ liên quan.", href: "/admin/knowledge/facebook-captures", action: "Mở hàng đợi Facebook" },
  { number: "03", title: "Duyệt bằng chứng YouTube", body: "Video đã thu thập cần được kiểm tra nội dung, mốc thời gian, độ tin cậy và độ mới trước khi tạo bản nháp. Bằng chứng YouTube mặc định không phải thông tin đã xác minh.", href: "/admin/knowledge/youtube-captures", action: "Mở hàng đợi YouTube" },
  { number: "04", title: "Duyệt bản nháp AI", body: "Bản nháp là đề xuất, chưa phải tri thức dùng cho du khách. Kiểm tra claim, nguồn, độ tin cậy, điều kiện áp dụng và cờ thông tin có thể thay đổi theo thời gian trước khi quyết định.", href: "/admin/knowledge/drafts", action: "Mở bản nháp" },
  { number: "05", title: "Giải quyết khuyến nghị", body: "Các tín hiệu như rủi ro, bằng chứng yếu, mâu thuẫn, độ mới, xác minh và lấy mẫu nằm trong hàng đợi riêng. Chỉ xử lý khi khuyến nghị còn hiệu lực với phiên bản thẻ và bằng chứng hiện hành.", href: "/admin/knowledge/recommendations", action: "Mở khuyến nghị" },
  { number: "06", title: "Xuất bản, lập chỉ mục và theo dõi", body: "Thẻ đã phê duyệt chỉ được xem là tri thức hiện hành khi đang xuất bản và không còn cần duyệt. Chỉ mục AI vẫn cần đồng bộ và bằng chứng phải còn đủ điều kiện. Coverage chỉ đếm thẻ hiện hành có bằng chứng truy xuất được.", href: "/admin/knowledge/approved", action: "Mở tri thức đã phê duyệt" },
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
        <SystemStep number="01" title="Nguồn" detail="Facebook, YouTube, trang web hoặc URL do operator nhập." />
        <SystemStep number="02" title="Fact và evidence" detail="Hệ thống trích xuất fact có thể kiểm tra cùng bằng chứng và ngữ cảnh nguồn." />
        <SystemStep number="03" title="Đánh giá" detail="Pipeline hoặc operator đánh giá độ tin cậy, điều kiện, mâu thuẫn, độ mới và khả năng dùng." />
        <SystemStep number="04" title="Thẻ tri thức" detail="Fact được lưu thành thẻ với metadata như loại, địa điểm, tuyến đường, tag, trạng thái và evidence." />
        <SystemStep number="05" title="Truy xuất vào prompt" detail="Khi có câu hỏi, hệ thống chỉ chọn thẻ hiện hành đủ điều kiện, đưa một tập dữ liệu có giới hạn vào prompt rồi mới tạo câu trả lời." />
      </div>
      <div className="mt-5 rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4 text-sm leading-6 text-[#4f625a]">
        <p><strong className="text-[#17342c]">Về chỉ mục và vector:</strong> hiện tại thẻ được lập chỉ mục tìm kiếm cùng metadata và evidence để phục vụ truy xuất có kiểm soát. Hệ thống có cấu hình model cho embeddings, nhưng kho dữ liệu hiện chưa lưu vector embedding như một phần của thẻ; vì vậy operator không nên hiểu “đã index” là đã có vector.</p>
      </div>
    </section>
    <section className="mt-8 rounded-[1.5rem] border border-[#e5bd82]/60 bg-[#f4ead7] p-5 sm:p-6"><h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Điểm kiểm soát quan trọng</h2><p className="mt-3 leading-7 text-[#4f625a]">Không bỏ qua hàng đợi duyệt hoặc khuyến nghị bằng cách coi dữ liệu nguồn là tri thức đã tin cậy. Nguồn cộng đồng và bằng chứng YouTube/Facebook mặc định cần được xem xét theo ngữ cảnh, không phải sự thật đã xác minh.</p></section>
  </div>;
}

function GuideHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return <header><p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">{eyebrow}</p><h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{title}</h1><p className="mt-5 max-w-3xl text-lg leading-8 text-[#4f625a]">{body}</p></header>;
}

function SystemStep({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <article className="rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4"><span className="text-sm font-semibold tracking-[0.16em] text-[#8c4f13]">{number}</span><h3 className="mt-2 font-semibold text-[#17342c]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#4f625a]">{detail}</p></article>;
}
