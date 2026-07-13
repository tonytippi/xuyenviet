"use client";

import { useFormStatus } from "react-dom";

export function ApproveAllSubmitStatus() {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className="min-h-12 rounded-2xl bg-[#9b2f29] px-5 py-3 font-semibold text-white transition hover:bg-[#7d261f] focus:outline-none focus:ring-4 focus:ring-[#d99a93] disabled:cursor-not-allowed disabled:bg-[#9b2f29]/65"
      disabled={pending}
      type="submit"
    >
      {pending ? "Đang trích xuất và phê duyệt..." : "Trích xuất và phê duyệt tất cả"}
    </button>
  );
}
