"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { submitAiAsk } from "./ask-gate";

const maxQuestionLength = 2_000;

type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const assistantSectionHeadings = new Set([
  "Kế hoạch gợi ý",
  "Vì sao nên đi như vậy",
  "Lưu ý thực tế",
  "Cảnh báo cần kiểm tra",
  "Nguồn và độ tin cậy",
  "Bước tiếp theo",
  "Câu hỏi tiếp theo",
]);

function normalizeAssistantHeading(line: string) {
  return line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/:$/, "")
    .trim();
}

function splitAssistantContent(content: string) {
  const sections: { heading?: string; body: string[] }[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const heading = normalizeAssistantHeading(trimmed);

    if (assistantSectionHeadings.has(heading)) {
      sections.push({ heading: trimmed, body: [] });
      continue;
    }

    if (sections.length === 0) {
      sections.push({ body: [] });
    }

    sections[sections.length - 1].body.push(line);
  }

  return sections.map((section) => ({
    ...section,
    body: section.body.join("\n").trim(),
  })).filter((section) => section.heading || section.body);
}

export function AssistantMessageContent({ content }: { content: string }) {
  const sections = splitAssistantContent(content);

  if (sections.length <= 1 && !sections[0]?.heading) {
    return <p className="whitespace-pre-wrap text-base leading-7">{content}</p>;
  }

  return (
    <div className="space-y-4">
      {sections.map((section, index) => (
        <section className="rounded-2xl border border-[#eadfc8] bg-white/70 p-4" key={`${section.heading || "intro"}-${index}`}>
          {section.heading ? <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#1f5f46]">{section.heading}</h3> : null}
          {section.body ? <p className="mt-2 whitespace-pre-wrap text-base leading-7">{section.body}</p> : null}
        </section>
      ))}
    </div>
  );
}

export function AiAskComposer() {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState("Nhập câu hỏi về chuyến đi đường bộ của bạn.");
  const [isPending, setIsPending] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
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
      const result = await submitAiAsk({ question: trimmedQuestion });

      if (result.status === "answer-failed") {
        setMessages([]);
        setStatus(result.errorMessage);
        return;
      }

      setMessages([
        { id: result.userMessage.id, role: "user", content: result.userMessage.content },
        { id: result.assistantMessage.id, role: "assistant", content: result.assistantMessage.content },
      ]);
      setQuestion("");
      setStatus("Đã tạo câu trả lời đầu tiên cho chuyến đi của bạn.");
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
    <div className="space-y-4">
      {messages.length > 0 ? (
        <section aria-label="Tin nhắn vừa tạo" aria-live="polite" className="mx-auto max-w-[760px] space-y-4">
          {messages.map((message) => (
            <article
              className={
                message.role === "assistant"
                  ? "rounded-[1.5rem] border border-[#d8c9ad] bg-[#fffdf8] p-5 text-[#17342c] shadow-[0_16px_40px_rgba(41,33,18,0.08)]"
                  : "ml-auto rounded-[1.25rem] bg-[#1f5f46] p-4 text-white shadow-[0_12px_30px_rgba(31,95,70,0.18)] sm:max-w-[80%]"
              }
              key={message.id}
            >
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] opacity-75">
                {message.role === "assistant" ? "Trợ lý XuyenViet" : "Bạn"}
              </p>
              {message.role === "assistant" ? <AssistantMessageContent content={message.content} /> : <p className="whitespace-pre-wrap text-base leading-7">{message.content}</p>}
            </article>
          ))}
        </section>
      ) : null}

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
    </div>
  );
}
