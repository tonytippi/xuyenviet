"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AiAskComposer, type DisplayMessage } from "@/features/ai/ai-ask-composer";
import { DirectApiError, applyDirectTripChangeProposal, createDirectTripProject, deleteDirectConversation, deleteDirectTripProject, directLogout, dismissDirectTripChangeProposal, executeDirectAnnotationProposalAction, loadAnswerDetail, loadConversationSummaries, loadPlanningContext, loadTravelerShell, loadTripProjectSidebarSummaries, saveDirectAnswerUsefulnessFeedback } from "@/features/ai/direct-api-client";
import type { TripWorkspaceReadModel } from "@/features/chat-trips/types";

export function DirectShellLoader({ initialQuestion, conversationId, historyConversationId, tripProjectId }: { initialQuestion?: string; conversationId?: string; historyConversationId?: string; tripProjectId?: string }) {
  const router = useRouter();
  const scopeKey = `${conversationId ?? ""}\u0000${tripProjectId ?? ""}\u0000${historyConversationId ?? ""}`;
  const [state, setState] = useState<{ scopeKey?: string; loading: boolean; expired: boolean; recoveryNotice?: string; shell?: Awaited<ReturnType<typeof loadTravelerShell>>; messages?: DisplayMessage[]; historyConversation?: { id: string; messages: DisplayMessage[] } | null; planningContext?: Awaited<ReturnType<typeof loadPlanningContext>>["context"]; summaries: Awaited<ReturnType<typeof loadConversationSummaries>>; projects: Awaited<ReturnType<typeof loadTripProjectSidebarSummaries>> }>({ loading: true, expired: false, summaries: [], projects: [] });
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, recoveryNotice: undefined }));
    void loadTravelerShell(conversationId, tripProjectId).then(async (shell) => {
       const [summaries, projects, historyShell] = await Promise.all([
         loadConversationSummaries().catch(() => []),
         loadTripProjectSidebarSummaries().catch(() => []),
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
       if (!conversation && (conversationId || tripProjectId)) {
         if (active) {
            setState({ scopeKey, loading: false, expired: false, recoveryNotice: "Không thể mở chuyến đi này. Bạn có thể chọn một chuyến đi khác hoặc tiếp tục hỏi XuyenViet.", shell: { shell: { conversation: null, tripProject: null, workspace: null } }, summaries, projects });
           router.replace("/ai-ask");
         }
         return;
       }
       if (active) setState({ scopeKey, loading: false, expired: false, shell, messages: conversation?.messages, historyConversation, planningContext, summaries, projects });
    }).catch((error: DirectApiError) => { if (active) setState({ scopeKey, loading: false, expired: error.code === "unauthorized" || error.code === "forbidden", summaries: [], projects: [] }); });
    return () => { active = false; };
  }, [conversationId, historyConversationId, refreshGeneration, router, scopeKey, tripProjectId]);
  if (state.loading || state.scopeKey !== scopeKey) return <main aria-live="polite" className="grid min-h-screen place-items-center text-[#4f625a]"><p>Đang mở hành trình của bạn...</p></main>;
  if (!state.shell) return <main className="grid min-h-screen place-items-center px-5 text-center"><div role="status"><p className="text-[#17342c]">{state.expired ? "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục." : "Chưa thể mở hành trình lúc này. Hãy thử lại sau ít phút."}</p><a className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-[#1f5f46] px-4 py-3 font-semibold text-white transition motion-reduce:transition-none focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45" href="/sign-in?next=/ai-ask">Đăng nhập lại</a></div></main>;
  const conversation = state.shell.shell.conversation;
  async function logout() {
    try {
      await directLogout();
    } finally {
       setState({ loading: false, expired: true, summaries: [], projects: [] });
      window.location.replace("/sign-in");
    }
  }
  return <main className="min-h-screen bg-white text-[#17342c]"><h1 className="sr-only">Hỏi trợ lý chuyến đi Việt Nam</h1><AiAskComposer initialQuestion={initialQuestion} initialConversationId={conversation?.id} initialMessages={state.messages ?? conversation?.messages ?? []} initialSessions={state.summaries} initialTripProjects={state.projects.map((project) => ({ ...project, origin: null, destination: null }))} selectedTripProject={state.shell.shell.tripProject} historyConversation={state.historyConversation} recoveryNotice={state.recoveryNotice} createTripProjectAction={async (title) => {
    const result = await createDirectTripProject({ title });
    return result.success ? { success: true, destination: { tripProjectId: result.project!.id } } : { success: false };
  }} deleteTripProjectAction={async (id) => {
    const result = await deleteDirectTripProject(id);
    return result.success ? { success: true } : { success: false, ...(result.reason === "not_found" ? { reason: "not_found" as const } : {}) };
  }} deleteConversationAction={async (id) => {
    const result = await deleteDirectConversation(id);
    return result.success ? { success: true } : { success: false, ...(result.reason === "not_found" ? { reason: "not_found" as const } : { error: "Không thể xoá cuộc trò chuyện lúc này. Vui lòng thử lại." }) };
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
  }} refreshShellAction={() => setRefreshGeneration((value) => value + 1)} signOutAction={logout} /></main>;
}
