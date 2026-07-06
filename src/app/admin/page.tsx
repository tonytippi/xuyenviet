import { validateAdminActionAccess } from "@/features/admin/actions";

export default function AdminPage() {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Khu vực vận hành</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">
        Bảng quản trị tách riêng khỏi trải nghiệm hỏi AI.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Các công cụ duyệt tri thức và thao tác vận hành sẽ được nối vào khu vực này trong các story sau.
      </p>
      <form action={validateAdminActionAccess} className="mt-8">
        <button
          className="min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(31,95,70,0.22)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
          type="submit"
        >
          Kiểm tra quyền thao tác quản trị
        </button>
      </form>
    </div>
  );
}
