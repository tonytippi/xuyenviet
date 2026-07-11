import { validateAdminActionAccess } from "@/features/admin/actions";

const operations = [
  { label: "Nguồn tri thức", value: "Intake", detail: "Lưu metadata an toàn trước khi AI đọc." },
  { label: "Bản nháp AI", value: "Review", detail: "Duyệt create/update/conflict có kiểm soát." },
  { label: "Quality loop", value: "Signals", detail: "Theo dõi feedback, eval và provenance." },
];

const workstreams = [
  "Nạp nguồn đã kiểm chứng hoặc link cộng đồng cần phân loại.",
  "Duyệt bản nháp trước khi tri thức được dùng cho traveler.",
  "Theo dõi chất lượng MVP mà không lộ raw source material.",
];

export default function AdminPage() {
  return (
    <div className="grid gap-8">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#10251e] p-6 text-white shadow-[0_24px_70px_rgba(16,37,30,0.24)] sm:p-8 lg:p-10">
        <div className="absolute -right-20 -top-24 size-72 rounded-full bg-[#e5bd82]/25 blur-3xl" />
        <div className="absolute -bottom-24 left-10 size-80 rounded-full bg-[#1f5f46]/45 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_18rem] lg:items-end">
          <div>
            <p className="w-fit rounded-full border border-[#e5bd82]/30 bg-[#e5bd82]/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-[#e5bd82]">
              Khu vực vận hành
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
              Command center cho tri thức du lịch XuyenViet.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-[#c9d7d1]">
              Bảng quản trị tập trung các luồng nạp nguồn, duyệt tri thức và kiểm soát chất lượng câu trả lời AI mà không trộn lẫn với trải nghiệm traveler.
            </p>
          </div>

          <form action={validateAdminActionAccess} className="rounded-3xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
            <p className="text-sm font-semibold text-[#e5bd82]">Server guard</p>
            <p className="mt-2 text-sm leading-6 text-[#c9d7d1]">Xác minh quyền admin/operator trước khi thao tác vận hành.</p>
            <button
              className="mt-5 min-h-12 w-full rounded-2xl bg-white px-5 py-4 text-base font-semibold text-[#17342c] shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition hover:bg-[#fbf7ed] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]/40"
              type="submit"
            >
              Kiểm tra quyền
            </button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {operations.map((item) => (
          <article className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/80 p-5 shadow-[0_12px_36px_rgba(23,52,44,0.08)]" key={item.label}>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">{item.label}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#17342c]">{item.value}</h2>
            <p className="mt-2 leading-7 text-[#4f625a]">{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.75fr]">
        <div className="rounded-[1.75rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#8c4f13]">Luồng ưu tiên</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#17342c]">Từ nguồn thô đến câu trả lời đáng tin.</h2>
          <ul className="mt-5 grid gap-3">
            {workstreams.map((workstream, index) => (
              <li className="flex gap-4 rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4" key={workstream}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1f5f46] text-sm font-semibold text-white">{index + 1}</span>
                <p className="leading-7 text-[#4f625a]">{workstream}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-[1.75rem] border border-[#1f5f46]/20 bg-[#17342c] p-5 text-white sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#e5bd82]">Nguyên tắc an toàn</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Không có shortcut client-side.</h2>
          <p className="mt-4 leading-7 text-[#c9d7d1]">
            Admin UI chỉ là bề mặt thao tác. Dữ liệu nhạy cảm, quyền vai trò, raw source material và provenance vẫn được bảo vệ ở server boundary.
          </p>
        </div>
      </section>
    </div>
  );
}
