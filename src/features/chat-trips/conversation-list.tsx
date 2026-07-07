"use client";

import { useEffect, useState } from "react";

export type ChatSessionSummary = {
  id: string;
  updatedAt: Date | string;
  preview: string;
};

type ConversationListProps = {
  sessions: ChatSessionSummary[];
  activeConversationId?: string;
  isDisabled?: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
};

export function ConversationList({ sessions, activeConversationId, isDisabled = false, onSelect, onNewChat }: ConversationListProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="flex h-full flex-col gap-3 rounded-[1.5rem] border border-[#d8c9ad] bg-[#fffdf8]/80 p-3">
      <button
        type="button"
        onClick={onNewChat}
        disabled={isDisabled}
        className="min-h-11 w-full rounded-2xl bg-[#1f5f46] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(31,95,70,0.18)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f] disabled:cursor-not-allowed disabled:bg-[#8aa89b]"
      >
        Cuộc trò chuyện mới
      </button>

      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#d8c9ad] bg-white/60 p-4 text-sm leading-6 text-[#5d6f67]">
          Chưa có cuộc trò chuyện nào. Hãy đặt câu hỏi để bắt đầu kế hoạch chuyến đi.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 overflow-y-auto">
          {sessions.map((session) => {
            const isActive = session.id === activeConversationId;

            return (
              <li key={session.id}>
                <button
                  type="button"
                  onClick={() => onSelect(session.id)}
                  disabled={isDisabled}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "flex w-full flex-col gap-1 rounded-2xl border border-[#1f5f46]/45 bg-[#1f5f46]/10 p-3 text-left transition focus:outline-none focus:ring-4 focus:ring-[#8fb59f] disabled:cursor-not-allowed disabled:opacity-70"
                      : "flex w-full flex-col gap-1 rounded-2xl border border-transparent p-3 text-left transition hover:border-[#d8c9ad] hover:bg-[#f3ead8] focus:outline-none focus:ring-4 focus:ring-[#e5bd82] disabled:cursor-not-allowed disabled:opacity-70"
                  }
                >
                  <span className="flex items-center gap-2">
                    {isActive ? <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#1f5f46]" /> : null}
                    <span className={isActive ? "text-sm font-bold text-[#17342c]" : "text-sm font-semibold text-[#17342c]"}>
                      {session.preview}
                    </span>
                  </span>
                  <span className="text-xs font-medium uppercase tracking-[0.12em] text-[#7b8b84]" suppressHydrationWarning>
                    {formatRelativeTime(session.updatedAt, now)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function formatRelativeTime(value: Date | string, now: number | null): string {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "Ngày không rõ";
  }

  if (now === null) {
    return formatAbsoluteDate(date);
  }

  const diffMs = now - date.getTime();

  if (diffMs < 0) {
    return formatAbsoluteDate(date);
  }

  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) {
    return "Vừa xong";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} phút trước`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} giờ trước`;
  }

  const days = Math.floor(hours / 24);

  if (days === 1) {
    return "Hôm qua";
  }

  if (days < 7) {
    return `${days} ngày trước`;
  }

  const weeks = Math.floor(days / 7);

  if (weeks < 5) {
    return `${weeks} tuần trước`;
  }

  return formatAbsoluteDate(date);
}

function formatAbsoluteDate(date: Date): string {
  return date.toLocaleDateString("vi-VN", { day: "numeric", month: "numeric", year: "numeric" });
}
