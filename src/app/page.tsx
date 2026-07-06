const routeSegments = ["Hà Nội", "Ninh Bình", "Đà Nẵng", "Đà Lạt", "TP. HCM"];

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-8 rounded-[2rem] border border-[#d8c9ad] bg-[#fbf7ed]/90 p-6 shadow-[0_24px_80px_rgba(41,33,18,0.14)] sm:p-8 lg:grid-cols-[1.04fr_0.96fr] lg:p-10">
        <div className="flex flex-col justify-between gap-12">
          <div>
            <p className="mb-7 inline-flex rounded-full border border-[#d8c9ad] bg-white/65 px-4 py-2 text-sm font-semibold text-[#1f5f46]">
              XuyenViet public MVP
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[#17342c] sm:text-6xl lg:text-7xl">
              Trợ lý AI cho những chuyến đi đường bộ khắp Việt Nam.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#4f625a] sm:text-xl">
              Lập lịch trình, hỏi điểm dừng chân, khách sạn, trạm sạc, cảnh báo độ tươi thông tin và điều chỉnh kế hoạch theo nhu cầu của bạn.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <a
              className="rounded-2xl bg-[#1f5f46] px-5 py-4 text-center text-base font-semibold text-white shadow-[0_12px_30px_rgba(31,95,70,0.28)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
              href="#ai-ask"
              aria-label="Mở cổng hỏi AI Ask, tính năng đang chuẩn bị"
            >
              Đăng nhập để hỏi AI
            </a>
            <a
              className="rounded-2xl border border-[#c47a24]/45 bg-[#fff8ec] px-5 py-4 text-center text-base font-semibold text-[#8c4f13] transition hover:bg-[#fff1d8] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
              href="#how-it-works"
            >
              Xem cách hoạt động
            </a>
          </div>
        </div>

        <div className="grid gap-5" id="how-it-works">
          <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Tuyến mẫu</p>
            <div className="mt-5 space-y-4">
              {routeSegments.map((segment, index) => (
                <div className="flex items-center gap-3" key={segment}>
                  <span className="flex size-9 items-center justify-center rounded-full bg-[#1f5f46] text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="h-px flex-1 bg-[#d8c9ad]" aria-hidden="true" />
                  <span className="min-w-24 text-right text-sm font-semibold text-[#17342c]">{segment}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-[1.5rem] border border-[#d8c9ad] bg-[#fff8ec] p-5">
              <h2 className="text-xl font-semibold text-[#17342c]">Hỏi theo hành trình</h2>
              <p className="mt-3 text-sm leading-6 text-[#5d6f67]">
                Nhập điểm đi, điểm đến, số ngày, phong cách di chuyển và các ràng buộc như trẻ em hoặc xe điện.
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5">
              <h2 className="text-xl font-semibold text-[#17342c]">Nguồn rõ ràng</h2>
              <p className="mt-3 text-sm leading-6 text-[#5d6f67]">
                Câu trả lời sẽ ưu tiên dữ liệu được duyệt, có nguồn tham khảo và cảnh báo khi thông tin có thể cũ.
              </p>
            </article>
          </div>

          <div className="rounded-[1.5rem] border border-dashed border-[#c47a24]/60 bg-[#fff8ec] p-5" id="ai-ask">
            <p className="text-sm font-semibold text-[#8c4f13]">Trạng thái MVP</p>
            <p className="mt-2 text-base leading-7 text-[#4f625a]">
              Đăng nhập Google và AI Ask sẽ được kích hoạt trong các story tiếp theo. Trang này là lối vào công khai không yêu cầu xác thực.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
