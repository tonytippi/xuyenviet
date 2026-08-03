"use client";

import { useEffect, useState } from "react";

import { AiAskComposer, type DisplayMessage } from "@/features/ai/ai-ask-composer";
import { DirectApiError, createDirectTripProject, deleteDirectConversation, deleteDirectTripProject, directLogout, loadAnswerDetail, loadConversationSummaries, loadPlanningContext, loadTravelerShell, saveDirectAnswerUsefulnessFeedback } from "@/features/ai/direct-api-client";

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
  return <main className="min-h-screen bg-white text-[#17342c]"><h1 className="sr-only">Hỏi trợ lý chuyến đi Việt Nam</h1><AiAskComposer initialQuestion={initialQuestion} initialConversationId={conversation?.id} initialMessages={state.messages ?? conversation?.messages ?? []} initialSessions={state.summaries} selectedTripProject={state.shell.shell.tripProject} historyConversation={state.historyConversation} planningContext={state.planningContext} createTripProjectAction={async (_previous, formData) => {
    const text = (name: string) => { const value = formData.get(name); return typeof value === "string" ? value : null; };
    const title = text("title");
    if (title === null) return { error: "Dữ liệu dự án không hợp lệ. Vui lòng gửi lại bằng biểu mẫu." };
    const result = await createDirectTripProject({ title, origin: text("origin"), destination: text("destination"), startDate: text("startDate"), endDate: text("endDate"), travelers: text("travelers"), notes: text("notes") });
    if (!result.success) return { error: "Không thể tạo dự án chuyến đi. Vui lòng kiểm tra tên dự án và các trường ngày (định dạng YYYY-MM-DD)." };
    window.location.assign(`/ai-ask?tripProjectId=${encodeURIComponent(result.project!.id)}`);
    return undefined;
  }} deleteConversationAction={async (id) => {
    const result = await deleteDirectConversation(id);
    return result.success ? { success: true } : { success: false, ...(result.reason === "not_found" ? { reason: "not_found" as const } : { error: "Không thể xoá cuộc trò chuyện lúc này. Vui lòng thử lại." }) };
  }} deleteTripProjectAction={async (id) => {
    const result = await deleteDirectTripProject(id);
    return result.success ? { success: true } : { success: false, ...(result.reason === "not_found" ? { reason: "not_found" as const } : { error: "Không thể xoá dự án chuyến đi lúc này. Vui lòng thử lại." }) };
  }} saveAnswerUsefulnessFeedbackAction={async (input) => {
    const result = await saveDirectAnswerUsefulnessFeedback(input);
    return result.success && result.feedback ? { success: true, feedback: { ...result.feedback, updatedAt: new Date(result.feedback.updatedAt) } } : { success: false, reason: result.reason };
  }} signOutAction={logout} /></main>;
}
