"use client";

import { useEffect, useState } from "react";

import { AiAskComposer, type DisplayMessage } from "@/features/ai/ai-ask-composer";
import { DirectApiError, applyDirectTripChangeProposal, createDirectTripProject, deleteDirectConversation, deleteDirectTripProject, directLogout, dismissDirectTripChangeProposal, executeDirectAnnotationProposalAction, loadAnswerDetail, loadConversationSummaries, loadPlanningContext, loadTravelerShell, saveDirectAnswerUsefulnessFeedback } from "@/features/ai/direct-api-client";
import type { TripWorkspaceReadModel } from "@/features/chat-trips/types";

export function DirectShellLoader({ initialQuestion, conversationId, historyConversationId, tripProjectId }: { initialQuestion?: string; conversationId?: string; historyConversationId?: string; tripProjectId?: string }) {
  const [state, setState] = useState<{ loading: boolean; expired: boolean; shell?: Awaited<ReturnType<typeof loadTravelerShell>>; messages?: DisplayMessage[]; historyConversation?: { id: string; messages: DisplayMessage[] } | null; planningContext?: Awaited<ReturnType<typeof loadPlanningContext>>["context"]; summaries: Awaited<ReturnType<typeof loadConversationSummaries>> }>({ loading: true, expired: false, summaries: [] });
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    void loadTravelerShell(conversationId, tripProjectId).then(async (shell) => {
      const [summaries, historyShell] = await Promise.all([
        loadConversationSummaries().catch(() => []),
        historyConversationId ? loadTravelerShell(historyConversationId).catch(() => undefined) : Promise.resolve(undefined),
      ]);
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
  }, [conversationId, historyConversationId, tripProjectId, refreshGeneration]);
  if (state.loading) return <main className="grid min-h-screen place-items-center text-[#4f625a]"><p>Đang tải hành trình của bạn...</p></main>;
  if (!state.shell) return <main className="grid min-h-screen place-items-center px-5 text-center"><div><p className="text-[#17342c]">{state.expired ? "Phiên đăng nhập đã hết hạn." : "Không thể tải hành trình lúc này."}</p><a className="mt-4 inline-block rounded-xl bg-[#1f5f46] px-4 py-3 font-semibold text-white" href="/sign-in?next=/ai-ask">Đăng nhập lại</a></div></main>;
  const conversation = state.shell.shell.conversation;
  async function logout() {
    try {
      await directLogout();
    } finally {
      setState({ loading: false, expired: true, summaries: [] });
      window.location.replace("/sign-in");
    }
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
   }} applyTripChangeProposalAction={async (input) => {
     try { const result = await applyDirectTripChangeProposal(input); if (result.success) setRefreshGeneration((value) => value + 1); return result.success ? result : result.reason === "refresh_required" ? { success: false, reason: "refresh_required" as const, error: "Kế hoạch đã thay đổi — vui lòng làm mới đề xuất." } : { success: false, reason: result.reason === "expired" ? "expired" as const : "not_found" as const, error: "Đề xuất không còn khả dụng." }; } catch { return { success: false, reason: "transient" as const, error: "Lỗi tạm thời — vui lòng thử lại." }; }
   }} dismissTripChangeProposalAction={async (input) => {
     try { const result = await dismissDirectTripChangeProposal(input); if (result.success) setRefreshGeneration((value) => value + 1); return result.success ? result : { success: false, reason: result.reason === "expired" ? "expired" as const : "not_found" as const, error: "Đề xuất không còn khả dụng." }; } catch { return { success: false, reason: "transient" as const, error: "Lỗi tạm thời — vui lòng thử lại." }; }
   }} tripWorkspace={state.shell.shell.workspace ? { ...state.shell.shell.workspace, focus: state.shell.shell.workspace.focus.kind === "preparation" ? state.shell.shell.workspace.focus : { ...state.shell.shell.workspace.focus, proposalId: state.shell.shell.workspace.focus.proposalId! }, timelineGroups: state.shell.shell.workspace.timelineGroups.map((group) => ({ ...group, entries: group.entries.map((entry) => ({ ...entry, plannedAt: entry.plannedAt ? new Date(entry.plannedAt) : null })) })), planHistory: state.shell.shell.workspace.planHistory, pendingProposals: state.shell.shell.workspace.pendingProposals.map((proposal) => ({ ...proposal, createdAt: new Date(proposal.createdAt), expiresAt: proposal.expiresAt ? new Date(proposal.expiresAt) : null })) } as TripWorkspaceReadModel : null} executeAnnotationAction={async (input) => {
     try {
       const result = await executeDirectAnnotationProposalAction(input as Parameters<typeof executeDirectAnnotationProposalAction>[0]);
       if (result.success) { setRefreshGeneration((value) => value + 1); return result.proposalStatus === "applied" ? { success: true, aggregateVersion: result.aggregateVersion, proposalStatus: "applied" as const } : { success: true, proposalStatus: "dismissed" as const }; }
       if (result.reason === "refresh_required") return { success: false, reason: "refresh_required" as const, error: "Kế hoạch đã thay đổi — vui lòng làm mới đề xuất." };
       return { success: false, reason: result.reason === "expired" ? "expired" as const : "not_found" as const, error: "Đề xuất không còn khả dụng." };
     } catch { return { success: false, reason: "transient" as const, error: "Lỗi tạm thời — vui lòng thử lại." }; }
   }} saveAnswerUsefulnessFeedbackAction={async (input) => {
    const result = await saveDirectAnswerUsefulnessFeedback(input);
     return result.success ? { success: true, feedback: { ...result.feedback, updatedAt: new Date(result.feedback.updatedAt) } } : { success: false, reason: result.reason };
  }} signOutAction={logout} /></main>;
}
