"use client";

import { TrashIcon } from "@/components/ui/icons";

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
  onDelete?: (id: string) => void;
  onNewChat: () => void;
};

export function ConversationList({ sessions, activeConversationId, isDisabled = false, onSelect, onDelete, onNewChat }: ConversationListProps) {
  return (
    <section className="flex h-full flex-col gap-3" aria-labelledby="conversation-list-heading">
      <button
        type="button"
        onClick={onNewChat}
        disabled={isDisabled}
        className="min-h-11 w-full rounded-lg bg-[#202020] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#383838] active:translate-y-px disabled:cursor-not-allowed disabled:bg-[#a3a3a3]"
      >
        Trò chuyện mới
      </button>

      <h2 className="px-2 text-[11px] font-medium text-[#777]" id="conversation-list-heading">Trò chuyện</h2>

      {sessions.length === 0 ? (
        <p className="px-2 text-sm leading-6 text-[#858585]">
          Chưa có cuộc trò chuyện.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 overflow-y-auto">
          {sessions.map((session) => {
            const isActive = session.id === activeConversationId;

            return (
              <li className="group relative" key={session.id}>
                <div className={isActive ? "flex rounded-lg bg-[#e5eeea]" : "flex rounded-lg transition hover:bg-[#ededed]"}>
                <button
                  type="button"
                  onClick={() => onSelect(session.id)}
                  disabled={isDisabled}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 pr-10 text-left text-sm font-medium text-[#285c49] focus:outline-none focus:ring-2 focus:ring-[#167c5a] disabled:cursor-not-allowed disabled:opacity-70"
                      : "min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 pr-10 text-left text-sm font-medium text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#167c5a] disabled:cursor-not-allowed disabled:opacity-70"
                  }
                >
                  {session.preview}
                </button>
                {onDelete ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Xoá cuộc trò chuyện “${session.preview}”? Tin nhắn, ảnh đính kèm và các chi tiết chuyến đi đã ghi nhớ từ cuộc trò chuyện này sẽ bị xoá khỏi giao diện thông thường và không còn được dùng để gợi ý trong tương lai.`)) {
                        onDelete(session.id);
                      }
                    }}
                    disabled={isDisabled}
                    aria-label={`Xoá cuộc trò chuyện: ${session.preview}`}
                    className="absolute right-1 top-1/2 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-md bg-[#fafafa] text-[#777] opacity-0 transition hover:bg-[#f1e6e4] hover:text-[#a33a32] focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#a33a32] group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <TrashIcon className="size-4" />
                    <span className="sr-only">Xoá</span>
                  </button>
                ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
