import { redirect } from "next/navigation";
import { loadAnswerContext, serializeTripAnswerContext } from "@xuyenviet/database";
import { isPlanningReadApiEnabled } from "@xuyenviet/config";
import { parsePlanningAnswerDetailResponse, type PlanningContextResponse, type TripAnswerContextResponse } from "@xuyenviet/contracts";

import { AiAskComposer } from "@/features/ai/ai-ask-composer";
import { signOutCurrentUser } from "@/features/auth/actions";
import { normalizePublicAskDraft } from "@/features/auth/redirects";
import { getOwnedConversation, getOwnedConversationShell, listOwnedConversations } from "@/features/chat-trips/conversations";
import { loadOwnedConversationSummaries } from "@/features/chat-trips/conversation-summary-loader";
import { loadSelectedAnswerDetail, loadSelectedPlanningContext } from "@/features/chat-trips/planning-read-loader";
import { applyTripChangeProposalAction, createTripProjectFromForm, deleteConversationAction, deleteTripProjectAction, dismissTripChangeProposalAction, executeAnnotationAction } from "@/features/chat-trips/actions";
import { getOwnedTripProjectSummary, listOwnedTripProjects } from "@/features/chat-trips/trip-projects";
import { saveAnswerUsefulnessFeedbackAction } from "@/features/feedback/actions";
import { selectActiveAiGatewayModel } from "@/features/ai/models";
import { aiAskInitialAnswerPurpose } from "@/features/ai/prompts";
import { readOwnedCompletedAiAskConsumerStatuses } from "@/features/ai/ai-ask-commands";
import { getAuthenticatedSessionWithRoles, hasAdminAccess } from "@/server/auth";

type AiAskPageProps = {
  searchParams?: Promise<{
    ref?: string | string[];
    draft?: string | string[];
    conversationId?: string | string[];
    tripProjectId?: string | string[];
    historyConversationId?: string | string[];
  }>;
};

function getFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim());
  }

  return value;
}

function buildCanonicalAiAskUrl({
  conversationId,
  tripProjectId,
  historyConversationId,
  referralCode,
  draft,
}: {
  conversationId?: string;
  tripProjectId?: string;
  historyConversationId?: string;
  referralCode?: string;
  draft?: string;
}) {
  const searchParams = new URLSearchParams();

  if (conversationId) searchParams.set("conversationId", conversationId);
  if (tripProjectId) searchParams.set("tripProjectId", tripProjectId);
  if (historyConversationId) searchParams.set("historyConversationId", historyConversationId);
  if (referralCode) searchParams.set("ref", referralCode);
  if (draft) searchParams.set("draft", draft);

  const query = searchParams.toString();
  return query ? `/ai-ask?${query}` : "/ai-ask";
}

function hasCanonicalParam(value: string | string[] | undefined, expected: string | undefined) {
  if (!expected) {
    return value === undefined;
  }

  return typeof value === "string" && value === expected;
}

async function loadSelectedAssistantDetails(conversation: Awaited<ReturnType<typeof getOwnedConversationShell>> | Awaited<ReturnType<typeof getOwnedConversation>>, apiEnabled: boolean) {
  if (!conversation) return conversation;

  const messages = await Promise.all(conversation.messages.map(async (message) => {
    if (message.role !== "assistant") return message;
    const detail = apiEnabled
      ? await loadSelectedAnswerDetail({
        conversationId: conversation.id,
        assistantMessageId: message.id,
        // This branch must never load or reuse a legacy assistant response.
        legacy: async () => ({ detail: null }),
      })
      : await loadSelectedAnswerDetail({
        conversationId: conversation.id,
        assistantMessageId: message.id,
        legacy: async () => parsePlanningAnswerDetailResponse({
          detail: {
            conversationId: conversation.id,
            assistantMessageId: message.id,
            content: message.content,
            provenance: message.provenance,
            annotations: message.annotations,
          },
        }) ?? { detail: null },
      });

    // The API owns historic assistant content and optional planning enrichment.
    return detail.detail
      ? { ...message, content: detail.detail.content, provenance: detail.detail.provenance as typeof message.provenance, annotations: detail.detail.annotations as typeof message.annotations }
      : apiEnabled ? { ...message, provenance: [], annotations: [] } : message;
  }));

  return { ...conversation, messages };
}

function applyCurrentPlanningContext<T extends { id: string; origin: string | null; destination: string | null; startDate: string | null; endDate: string | null }>(project: T, context: TripAnswerContextResponse | null): T {
  if (!context || context.tripProjectId !== project.id) return project;
  const anchors = new Map(context.anchors.map((anchor) => [anchor.field, anchor.value]));
  // This current projection may refresh only matching project display anchors.
  // Historic messages and the broader workspace aggregate retain their own semantics.
  return { ...project, origin: anchors.get("origin") ?? project.origin, destination: anchors.get("destination") ?? project.destination, startDate: anchors.get("start_date") ?? project.startDate, endDate: anchors.get("end_date") ?? project.endDate };
}

export default async function AiAskPage({ searchParams }: AiAskPageProps) {
  const params = await searchParams;
  const referralCode = getFirstParam(params?.ref)?.trim() || undefined;
  const publicDraft = normalizePublicAskDraft(getFirstParam(params?.draft));
  const requestedConversationId = getFirstParam(params?.conversationId)?.trim();
  const requestedTripProjectId = getFirstParam(params?.tripProjectId)?.trim();
  const requestedHistoryConversationId = getFirstParam(params?.historyConversationId)?.trim();
  const session = await getAuthenticatedSessionWithRoles();

  if (!session) {
    const signInParams = new URLSearchParams({ next: "/ai-ask" });

    if (referralCode) {
      signInParams.set("ref", referralCode);
    }

    redirect(`/sign-in?${signInParams.toString()}`);
  }

  const planningReadApiEnabled = isPlanningReadApiEnabled({ APP_ENV: process.env.APP_ENV, XV_PLANNING_READ_API_ENABLED: process.env.XV_PLANNING_READ_API_ENABLED });
  // Choose the owner before any conversation read. API shells deliberately do
  // not select assistant prose, provenance, or persisted annotations.
  const loadConversationForPage = planningReadApiEnabled ? getOwnedConversationShell : getOwnedConversation;
  let loadedConversation = requestedConversationId ? await loadConversationForPage(requestedConversationId) : null;
  let selectedTripProject = requestedTripProjectId ? await getOwnedTripProjectSummary(requestedTripProjectId) : null;
  let historyConversation = requestedHistoryConversationId ? await loadConversationForPage(requestedHistoryConversationId) : null;

  // Enforce project scope alignment: reject a linked conversation whose project differs from the
  // selected project, reject an ordinary conversation shown under a selected project, and infer the
  // project scope when a linked conversation is opened directly without a selected project in the URL.
  if (loadedConversation?.tripProjectId) {
    if (selectedTripProject && selectedTripProject.id !== loadedConversation.tripProjectId) {
      loadedConversation = null;
    } else if (!selectedTripProject) {
      selectedTripProject = await getOwnedTripProjectSummary(loadedConversation.tripProjectId);
    }
  }

  if (loadedConversation && selectedTripProject && loadedConversation.tripProjectId !== selectedTripProject.id) {
    loadedConversation = null;
  }

  if (selectedTripProject) {
    loadedConversation = await loadConversationForPage(selectedTripProject.primaryConversation.id);
    if (!historyConversation || historyConversation.tripProjectId !== selectedTripProject.id || historyConversation.id === selectedTripProject.primaryConversation.id) {
      historyConversation = null;
    }
  } else {
    historyConversation = null;
  }

  const initialTripProjects = ((await listOwnedTripProjects()) ?? []).map((project) => ({
    id: project.id,
    title: project.title,
    origin: project.origin,
    destination: project.destination,
    updatedAt: project.updatedAt,
  }));
  const initialSessions = selectedTripProject ? selectedTripProject.historicChats : (await loadOwnedConversationSummaries({ legacy: listOwnedConversations })) ?? [];
  const imageInputModel = await selectActiveAiGatewayModel({
    purpose: aiAskInitialAnswerPurpose,
    requiredCapabilities: { textInput: true, streaming: true, imageInput: true },
  });
  const canonicalUrl = buildCanonicalAiAskUrl({
    conversationId: loadedConversation?.id,
    tripProjectId: selectedTripProject?.id,
    historyConversationId: historyConversation?.id,
    referralCode,
    draft: publicDraft,
  });

  if (
    Object.keys(params ?? {}).some((key) => !["conversationId", "tripProjectId", "historyConversationId", "ref", "draft"].includes(key)) ||
    !hasCanonicalParam(params?.conversationId, loadedConversation?.id) ||
    !hasCanonicalParam(params?.tripProjectId, selectedTripProject?.id) ||
    !hasCanonicalParam(params?.historyConversationId, historyConversation?.id) ||
    !hasCanonicalParam(params?.ref, referralCode) ||
    !hasCanonicalParam(params?.draft, publicDraft)
  ) {
    redirect(canonicalUrl);
  }

  if (selectedTripProject) {
    const selectedProject = selectedTripProject;
    const context = await loadSelectedPlanningContext({
      tripProjectId: selectedProject.id,
      legacy: async (): Promise<PlanningContextResponse> => ({
        context: serializeTripAnswerContext(await loadAnswerContext({ userId: session.userId, conversationId: selectedProject.primaryConversation.id, tripProjectId: selectedProject.id })),
      }),
    }).catch((): PlanningContextResponse => ({ context: null }));
    selectedTripProject = applyCurrentPlanningContext(selectedProject, context.context);
  }

  // The legacy full conversation owner remains available for the Story 11.4
  // mutation command, but never supplies API-mode planning enrichment.
  loadedConversation = await loadSelectedAssistantDetails(loadedConversation, planningReadApiEnabled);
  historyConversation = await loadSelectedAssistantDetails(historyConversation, planningReadApiEnabled);

  // Derive composer inputs after the selected current-context mapping so it
  // observes canonical anchors rather than the pre-context project snapshot.
  const selectedTripProjectForComposer = selectedTripProject
    ? {
        id: selectedTripProject.id,
        title: selectedTripProject.title,
        origin: selectedTripProject.origin,
        destination: selectedTripProject.destination,
        startDate: selectedTripProject.startDate,
        endDate: selectedTripProject.endDate,
        travelers: selectedTripProject.travelers,
        updatedAt: selectedTripProject.updatedAt,
      }
    : null;
  const tripWorkspaceForComposer = selectedTripProject
    ? {
        focus: selectedTripProject.tripHome,
        timelineGroups: selectedTripProject.timelineGroups,
        constraints: selectedTripProject.constraints,
        pendingProposals: selectedTripProject.pendingProposals,
        planHistory: selectedTripProject.planHistory,
      }
    : null;

  const consumerStatuses = await readOwnedCompletedAiAskConsumerStatuses(
    session.userId,
    [
      ...(loadedConversation?.messages ?? []),
      ...(historyConversation?.messages ?? []),
    ].filter((message) => message.role === "assistant").map((message) => message.id),
  );

  return (
    <main className="min-h-screen bg-white text-[#17342c]">
      <h1 className="sr-only">Hỏi trợ lý chuyến đi Việt Nam</h1>
      <AiAskComposer
            key={loadedConversation?.id || "new-conversation"}
            initialQuestion={publicDraft}
            initialConversationId={loadedConversation?.id}
            initialMessages={loadedConversation?.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content ?? "",
              imageAttachments: message.imageAttachments.map((attachment) => ({
                id: attachment.id,
                originalFileName: attachment.originalFileName,
                mimeType: attachment.mimeType,
                byteSize: attachment.byteSize,
              })),
              provenance: message.provenance,
              annotations: message.annotations,
               feedback: message.feedback,
               consumerStatuses: consumerStatuses.filter((status) => status.assistantMessageId === message.id).map(({ category, state }) => ({ category, state })),
            }))}
            initialSessions={initialSessions}
            historyConversation={historyConversation ? {
              id: historyConversation.id,
              messages: historyConversation.messages.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content ?? "",
                imageAttachments: message.imageAttachments,
                provenance: message.provenance,
                annotations: message.annotations,
                 feedback: message.feedback,
                 consumerStatuses: consumerStatuses.filter((status) => status.assistantMessageId === message.id).map(({ category, state }) => ({ category, state })),
              })),
            } : null}
            initialTripProjects={initialTripProjects}
            selectedTripProject={selectedTripProjectForComposer}
            tripWorkspace={tripWorkspaceForComposer}
            supportsImageInput={Boolean(imageInputModel)}
            userEmail={session.email}
            userName={session.name}
            userImage={session.image}
            canAccessAdmin={hasAdminAccess(session.roles)}
            createTripProjectAction={createTripProjectFromForm}
            deleteConversationAction={deleteConversationAction}
            deleteTripProjectAction={deleteTripProjectAction}
            applyTripChangeProposalAction={applyTripChangeProposalAction}
            dismissTripChangeProposalAction={dismissTripChangeProposalAction}
            executeAnnotationAction={executeAnnotationAction}
            saveAnswerUsefulnessFeedbackAction={saveAnswerUsefulnessFeedbackAction}
            signOutAction={signOutCurrentUser}
      />
    </main>
  );
}
