"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { submitAiAsk } from "./ask-gate";

const maxQuestionLength = 2_000;

export function AiAskComposer() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("Nhập câu hỏi về chuyến đi đường bộ của bạn.");
  const [isPending, setIsPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        textareaRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmittingRef.current) {
      return;
    }

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion) {
      setStatus("Vui lòng nhập câu hỏi trước khi gửi.");
      textareaRef.current?.focus();
      return;
    }

    if (trimmedQuestion.length > maxQuestionLength) {
      setStatus("Câu hỏi tối đa 2000 ký tự. Hãy rút gọn trước khi gửi.");
      textareaRef.current?.focus();
      return;
    }

    isSubmittingRef.current = true;
    setIsPending(true);
    setStatus("Đang kiểm tra câu hỏi...");

    try {
      await submitAiAsk({ question: trimmedQuestion });
      setStatus("Câu hỏi hợp lệ. Lưu hội thoại và câu trả lời AI sẽ được nối ở các story tiếp theo.");
    } catch {
      setStatus("Không thể gửi câu hỏi lúc này. Hãy kiểm tra đăng nhập và thử lại.");
    } finally {
      isSubmittingRef.current = false;
      setIsPending(false);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/80 p-4 shadow-[0_16px_40px_rgba(41,33,18,0.08)]" onSubmit={handleSubmit} ref={formRef}>
      <label className="text-sm font-semibold text-[#17342c]" htmlFor="ai-ask-question">
        Câu hỏi của bạn
      </label>
      <textarea
        className="mt-3 min-h-32 w-full resize-y rounded-2xl border border-[#d8c9ad] bg-[#fffdf8] px-4 py-3 text-base leading-7 text-[#17342c] outline-none transition placeholder:text-[#7b8b84] focus:border-[#1f5f46] focus:ring-4 focus:ring-[#8fb59f]/45"
        disabled={isPending}
        aria-describedby="ai-ask-status ai-ask-shortcuts"
        id="ai-ask-question"
        maxLength={maxQuestionLength + 1}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ví dụ: Hà Nội đi Đà Nẵng 7 ngày cùng gia đình nên dừng ở đâu?"
        ref={textareaRef}
        value={question}
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className="text-sm leading-6 text-[#4f625a]" id="ai-ask-status">
          {status}
        </p>
        <button
          className="min-h-12 rounded-2xl bg-[#1f5f46] px-5 py-3 text-base font-semibold text-white shadow-[0_12px_30px_rgba(31,95,70,0.24)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f] disabled:cursor-not-allowed disabled:bg-[#8aa89b]"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Đang gửi..." : "Gửi câu hỏi"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#6b7c75]" id="ai-ask-shortcuts">Enter để gửi, Shift+Enter để xuống dòng, nhấn / để focus ô nhập.</p>
    </form>
  );
}
