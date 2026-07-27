"use client";

import { type ChangeEvent, useRef } from "react";

import { SendIcon } from "@/components/ui/icons";

type PublicAskFormProps = {
  nextPath: string;
  referralCode?: string;
};

function resizeComposer(textarea: HTMLTextAreaElement) {
  textarea.style.height = "0px";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function PublicAskForm({ nextPath, referralCode }: PublicAskFormProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    resizeComposer(event.currentTarget);
  }

  return (
    <form
      action="/sign-in"
      aria-label="Hộp hỏi AI yêu cầu đăng nhập"
      className="mx-auto mt-8 grid w-full max-w-[680px] grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-2xl border border-[#d9d9d9] bg-white p-2 text-left shadow-[0_2px_10px_rgba(0,0,0,0.06)]"
      method="get"
    >
      <input name="next" type="hidden" value={nextPath} />
      {referralCode ? <input name="ref" type="hidden" value={referralCode} /> : null}
      <label className="sr-only" htmlFor="public-ask-draft">Câu hỏi chuyến đi</label>
      <textarea
        className="h-12 max-h-44 w-full resize-none rounded-xl border-0 bg-transparent px-3 py-3 text-[15px] leading-6 text-[#202020] outline-none placeholder:text-[#8a8a8a]"
        id="public-ask-draft"
        maxLength={500}
        name="draft"
        onChange={handleChange}
        placeholder="Bạn muốn đi đâu? Ví dụ: Hà Nội đi Huế 5 ngày cùng gia đình..."
        ref={textareaRef}
        rows={1}
      />
      <button
        aria-label="Đăng nhập để hỏi AI"
        className="grid size-12 place-items-center rounded-xl bg-[#202020] text-sm font-medium text-white transition hover:bg-[#383838] active:translate-y-px"
        type="submit"
      >
        <span className="sr-only">Đăng nhập để hỏi</span>
        <SendIcon className="size-4" />
      </button>
    </form>
  );
}
