"use client";

import { useEffect, useRef, useState } from "react";

import { submitKnowledgeSeedUrlBatchForm } from "@/features/knowledge/actions";

export function IntakeUrlModal() {
  const [isOpen, setIsOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    textareaRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        openButtonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  function closeModal() {
    setIsOpen(false);
    openButtonRef.current?.focus();
  }

  return (
    <>
      <button
        ref={openButtonRef}
        className="mt-5 min-h-12 w-fit rounded-2xl bg-[#1f5f46] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(31,95,70,0.22)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        Thêm URL
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="intake-url-modal-title">
          <button className="absolute inset-0 cursor-default bg-[#17342c]/45" type="button" aria-label="Đóng form thêm URL" onClick={closeModal} />
          <div className="relative w-full max-w-2xl rounded-[1.5rem] border border-[#d8c9ad] bg-[#fffdf8] p-5 shadow-[0_24px_80px_rgba(41,33,18,0.24)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="intake-url-modal-title" className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">
                  Thêm URL nguồn
                </h3>
                <p className="mt-2 leading-7 text-[#4f625a]">Dán một hoặc nhiều URL, mỗi dòng một URL.</p>
              </div>
              <button className="rounded-full border border-[#d8c9ad] px-3 py-2 text-sm font-semibold text-[#4f625a] transition hover:bg-[#fbf7ed] focus:outline-none focus:ring-4 focus:ring-[#e5bd82]" type="button" onClick={closeModal}>
                Đóng
              </button>
            </div>
            <form action={submitKnowledgeSeedUrlBatchForm} className="mt-5 grid gap-4">
              <div className="grid gap-2">
                <label className="font-semibold text-[#17342c]" htmlFor="batchUrls">
                  URL nguồn
                </label>
                <textarea
                  ref={textareaRef}
                  className="min-h-44 rounded-2xl border border-[#d8c9ad] bg-white/80 px-4 py-3 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]"
                  id="batchUrls"
                  name="batchUrls"
                  placeholder="https://example.com/dia-diem-1&#10;https://example.com/dia-diem-2"
                  required
                />
              </div>
              <button
                className="min-h-12 w-fit rounded-2xl bg-[#1f5f46] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(31,95,70,0.22)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
                type="submit"
              >
                Thêm URL
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
