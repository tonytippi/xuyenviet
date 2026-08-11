"use client";

import { useEffect, useRef, useState } from "react";

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
  onDelete?: (id: string) => Promise<boolean>;
  onNewChat: () => void;
};

export function ConversationList({ sessions, activeConversationId, isDisabled = false, onSelect, onDelete, onNewChat }: ConversationListProps) {
  const [conversationPendingDeletion, setConversationPendingDeletion] = useState<ChatSessionSummary | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setDeleting] = useState(false);
  const isDeletingRef = useRef(false);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationPendingDeletion) {
      setDeleteError(null);
      return;
    }

    const previousFocus = document.activeElement as HTMLElement | null;
    cancelDeleteRef.current?.focus();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!isDeletingRef.current) setConversationPendingDeletion(null);
        return;
      }
      if (event.key === "Tab") {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      previousFocus?.focus();
    };
  }, [conversationPendingDeletion]);

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
        <ul className="scrollbar-hidden flex flex-col gap-1 overflow-y-auto">
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
                        ? "min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 pr-12 text-left text-sm font-medium text-[#285c49] focus:outline-none focus:ring-2 focus:ring-[#167c5a] disabled:cursor-not-allowed disabled:opacity-70"
                        : "min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 pr-12 text-left text-sm font-medium text-[#303030] focus:outline-none focus:ring-2 focus:ring-[#167c5a] disabled:cursor-not-allowed disabled:opacity-70"
                  }
                >
                  {session.preview}
                </button>
                {onDelete ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleteError(null);
                      setConversationPendingDeletion(session);
                    }}
                    disabled={isDisabled}
                    aria-label={`Xoá cuộc trò chuyện: ${session.preview}`}
                    className="absolute right-1 top-1/2 z-10 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-md text-[#777] transition hover:bg-[#f1e6e4] hover:text-[#a33a32] focus:outline-none focus:ring-2 focus:ring-[#a33a32] disabled:cursor-not-allowed disabled:opacity-40"
                    title="Xoá cuộc trò chuyện"
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
      {conversationPendingDeletion ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#17342c]/35 p-4" onMouseDown={(event) => { if (!isDeleting && event.target === event.currentTarget) setConversationPendingDeletion(null); }} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="delete-conversation-title" aria-describedby="delete-conversation-description">
          <div className="w-full max-w-md rounded-2xl border border-[#d8c9ad] bg-[#fffdf8] p-5 shadow-[0_20px_60px_rgba(23,52,44,0.22)]">
            <div className="grid size-11 place-items-center rounded-full bg-[#f1e6e4] text-[#a33a32]">
              <TrashIcon className="size-5" />
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[#17342c]" id="delete-conversation-title">Xóa cuộc trò chuyện?</h2>
            <p className="mt-2 text-sm leading-6 text-[#4f625a]" id="delete-conversation-description">Tin nhắn, ảnh đính kèm và các chi tiết đã ghi nhớ từ cuộc trò chuyện này sẽ không còn được dùng để gợi ý.</p>
            <p className="mt-4 truncate rounded-xl border border-[#e6e6e6] bg-white px-3 py-2 text-sm font-medium text-[#17342c]" title={conversationPendingDeletion.preview}>{conversationPendingDeletion.preview}</p>
            {deleteError ? <p className="mt-3 rounded-xl bg-[#f1e6e4] px-3 py-2 text-sm leading-5 text-[#8a3831]" role="alert">{deleteError}</p> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="min-h-11 rounded-xl border border-[#d8c9ad] bg-white px-4 py-2 text-sm font-semibold text-[#17342c] transition hover:bg-[#fff8ec] focus:outline-none focus:ring-4 focus:ring-[#e5bd82] disabled:cursor-not-allowed disabled:opacity-60" disabled={isDeleting} onClick={() => setConversationPendingDeletion(null)} ref={cancelDeleteRef} type="button">Hủy</button>
              <button className="min-h-11 rounded-xl bg-[#a33a32] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#8d302a] focus:outline-none focus:ring-4 focus:ring-[#f0c8a0] disabled:cursor-not-allowed disabled:opacity-60" disabled={isDeleting}               onClick={async () => {
                if (!onDelete) return;
                isDeletingRef.current = true;
                setDeleting(true);
                setDeleteError(null);
                const deleted = await onDelete(conversationPendingDeletion.id);
                isDeletingRef.current = false;
                setDeleting(false);
                if (deleted) setConversationPendingDeletion(null);
                else setDeleteError("Không thể xóa cuộc trò chuyện lúc này. Vui lòng thử lại.");
              }} type="button">{isDeleting ? "Đang xóa..." : "Xóa trò chuyện"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
