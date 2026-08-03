"use client";

import { useEffect, useState } from "react";

import { AiAskComposer, type DisplayMessage } from "@/features/ai/ai-ask-composer";
import { DirectApiError, directLogout, loadAnswerDetail, loadConversationSummaries, loadPlanningContext, loadTravelerShell } from "@/features/ai/direct-api-client";

export function DirectShellLoader({ initialQuestion, conversationId, historyConversationId, tripProjectId }: { initialQuestion?: string; conversationId?: string; historyConversationId?: string; tripProjectId?: string }) {
  const [state, setState] = useState<{ loading: boolean; expired: boolean; shell?: Awaited<ReturnType<typeof loadTravelerShell>>; messages?: DisplayMessage[]; historyConversation?: { id: string; messages: DisplayMessage[] } | null; planningContext?: Awaited<ReturnType<typeof loadPlanningContext>>["context"]; summaries: Awaited<ReturnType<typeof loadConversationSummaries>> }>({ loading: true, expired: false, summaries: [] });
  useEffect(() => {
    let active = true;
    void Promise.all([loadTravelerShell(conversationId, tripProjectId), loadConversationSummaries(), historyConversationId ? loadTravelerShell(historyConversationId) : Promise.resolve(undefined)]).then(async ([shell, summaries, historyShell]) => {
      const enrich = async (candidate: typeof shell.shell.conversation) => {
        if (!candidate) return null;
        const details = await Promise.all(candidate.messages.map(async (message) => message.role === "assistant" ? loadAnswerDetail(candidate.id, message.id).catch(() => ({ detail: null })) : { detail: null }));
        return { id: candidate.id, messages: candidate.messages.map((message, index) => {
          const detail = details[index]?.detail;
          return detail && detail.conversationId === candidate.id && detail.assistantMessageId === message.id ? { ...message, content: detail.content, provenance: detail.provenance, annotations: detail.annotations } : message;
        }) as DisplayMessage[] };
      };
      const [conversation, historyConversation, planningContext] = await Promise.all([
        enrich(shell.shell.conversation),
        historyConversationId ? enrich(historyShell?.shell.conversation ?? null) : Promise.resolve(null),
        shell.shell.tripProject ? loadPlanningContext(shell.shell.tripProject.id).then((response) => response.context).catch(() => null) : Promise.resolve(null),
      ]);
      if (active) setState({ loading: false, expired: false, shell, messages: conversation?.messages, historyConversation, planningContext, summaries });
    }).catch((error: DirectApiError) => { if (active) setState({ loading: false, expired: error.code === "unauthorized" || error.code === "forbidden", summaries: [] }); });
    return () => { active = false; };
  }, [conversationId, historyConversationId, tripProjectId]);
  if (state.loading) return <main className="grid min-h-screen place-items-center text-[#4f625a]"><p>Đang tải hành trình của bạn...</p></main>;
  if (!state.shell) return <main className="grid min-h-screen place-items-center px-5 text-center"><div><p className="text-[#17342c]">{state.expired ? "Phiên đăng nhập đã hết hạn." : "Không thể tải hành trình lúc này."}</p><a className="mt-4 inline-block rounded-xl bg-[#1f5f46] px-4 py-3 font-semibold text-white" href="/sign-in?next=/ai-ask">Đăng nhập lại</a></div></main>;
  const conversation = state.shell.shell.conversation;
  async function logout() {
    await directLogout();
    setState({ loading: false, expired: true, summaries: [] });
    window.location.replace("/sign-in");
  }
  return <main className="min-h-screen bg-white text-[#17342c]"><h1 className="sr-only">Hỏi trợ lý chuyến đi Việt Nam</h1><AiAskComposer initialQuestion={initialQuestion} initialConversationId={conversation?.id} initialMessages={state.messages ?? conversation?.messages ?? []} initialSessions={state.summaries} selectedTripProject={state.shell.shell.tripProject} historyConversation={state.historyConversation} planningContext={state.planningContext} signOutAction={logout} /></main>;
}
