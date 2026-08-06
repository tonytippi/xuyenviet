import Link from "next/link";

const guideTopics = [
  {
    href: "/guides/data-flow",
    number: "01",
    title: "Dữ liệu đi qua hệ thống thế nào?",
    detail: "Từ URL đã đăng ký, lần thu thập và xử lý nền đến thẻ tri thức có thể truy xuất.",
  },
  {
    href: "/guides/data-states",
    number: "02",
    title: "Tra cứu trạng thái và việc cần làm",
    detail: "Phân biệt trạng thái nguồn, tác vụ kỹ thuật, ứng viên, thẻ và yêu cầu vận hành.",
  },
  {
    href: "/guides/operating-routine",
    number: "03",
    title: "Quy trình vận hành hằng ngày",
    detail: "Cách ưu tiên mức độ bao phủ, yêu cầu đang mở và các lỗi kỹ thuật cần chuyển tuyến.",
  },
];

export default function AdminGuidesPage() {
  return (
    <div className="grid gap-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#10251e] p-6 text-white shadow-[0_24px_70px_rgba(16,37,30,0.24)] sm:p-8 lg:p-10">
        <div className="absolute -right-20 -top-24 size-72 rounded-full bg-[#e5bd82]/25 blur-3xl" />
        <div className="absolute -bottom-24 left-10 size-80 rounded-full bg-[#1f5f46]/45 blur-3xl" />
        <div className="relative max-w-3xl">
          <p className="w-fit rounded-full border border-[#e5bd82]/30 bg-[#e5bd82]/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-[#e5bd82]">Sổ tay vận hành</p>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">Vận hành tri thức đúng trạng thái.</h1>
          <p className="mt-5 text-lg leading-8 text-[#c9d7d1]">Khu vực này giải thích hệ thống đang làm gì với dữ liệu, khi nào người vận hành cần can thiệp và khi nào nên chờ quy trình nền hoàn tất.</p>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Ba lưu ý khi vận hành</p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <Principle title="Nguồn đã xử lý chưa chắc đã dùng được" detail="Trạng thái này chỉ cho biết hệ thống đã đọc được nguồn. Hãy xem thẻ tri thức hoặc yêu cầu vận hành để biết có cần làm gì thêm không." />
          <Principle title="Chỉ thẻ đang hoạt động mới hỗ trợ câu trả lời" detail="Một thẻ cần đủ điều kiện trước khi Trợ lý AI dùng. Nếu thẻ đang chờ xử lý, hãy làm theo yêu cầu vận hành liên quan." />
          <Principle title="Chỉ xử lý yêu cầu đang mở" detail="Yêu cầu đã hoàn tất hoặc không còn hiệu lực không cần thao tác thêm. Hãy quay lại danh sách để tìm yêu cầu hiện hành." />
        </div>
      </section>

      <section>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Chọn nội dung cần xem</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {guideTopics.map((topic) => (
            <Link className="group rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 shadow-[0_12px_30px_rgba(41,33,18,0.08)] transition hover:-translate-y-0.5 hover:border-[#1f5f46]/40 hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/35" href={topic.href} key={topic.href}>
              <span className="text-sm font-semibold tracking-[0.16em] text-[#8c4f13]">{topic.number}</span>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">{topic.title}</h2>
              <p className="mt-3 leading-7 text-[#4f625a]">{topic.detail}</p>
              <span className="mt-5 inline-block font-semibold text-[#1f5f46] underline underline-offset-4">Mở hướng dẫn</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Principle({ title, detail }: { title: string; detail: string }) {
  return <article className="rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4"><h2 className="font-semibold text-[#17342c]">{title}</h2><p className="mt-2 leading-6 text-[#4f625a]">{detail}</p></article>;
}
