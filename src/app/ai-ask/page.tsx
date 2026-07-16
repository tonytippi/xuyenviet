import { redirect } from "next/navigation";

import { AiAskComposer } from "@/features/ai/ai-ask-composer";
import { signOutCurrentUser } from "@/features/auth/actions";
import { normalizePublicAskDraft } from "@/features/auth/redirects";
import { getOwnedConversation, listOwnedConversations } from "@/features/chat-trips/conversations";
import { createTripProjectFromForm, deleteConversationAction, deleteTripProjectAction } from "@/features/chat-trips/actions";
import { getOwnedTripProjectSummary, listOwnedTripProjects } from "@/features/chat-trips/trip-projects";
import { saveAnswerUsefulnessFeedbackAction } from "@/features/feedback/actions";
import { getAuthenticatedSessionWithRoles, hasAdminAccess } from "@/server/auth";

type AiAskPageProps = {
  searchParams?: Promise<{
    ref?: string | string[];
    draft?: string | string[];
    conversationId?: string | string[];
    tripProjectId?: string | string[];
  }>;
};

function getFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim());
  }

  return value;
}

export default async function AiAskPage({ searchParams }: AiAskPageProps) {
  const params = await searchParams;
  const referralCode = getFirstParam(params?.ref);
  const publicDraft = normalizePublicAskDraft(getFirstParam(params?.draft));
  const requestedConversationId = getFirstParam(params?.conversationId)?.trim();
  const requestedTripProjectId = getFirstParam(params?.tripProjectId)?.trim();
  const session = await getAuthenticatedSessionWithRoles();

  if (!session) {
    const signInParams = new URLSearchParams({ next: "/ai-ask" });

    if (referralCode) {
      signInParams.set("ref", referralCode);
    }

    redirect(`/sign-in?${signInParams.toString()}`);
  }

  let loadedConversation = requestedConversationId ? await getOwnedConversation(requestedConversationId) : null;
  let selectedTripProject = requestedTripProjectId ? await getOwnedTripProjectSummary(requestedTripProjectId) : null;

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

  const initialTripProjects = ((await listOwnedTripProjects()) ?? []).map((project) => ({
    id: project.id,
    title: project.title,
    origin: project.origin,
    destination: project.destination,
    updatedAt: project.updatedAt,
  }));
  const initialSessions = selectedTripProject ? selectedTripProject.relatedChats : (await listOwnedConversations()) ?? [];
  const selectedTripProjectForComposer = selectedTripProject
    ? {
        id: selectedTripProject.id,
        title: selectedTripProject.title,
        origin: selectedTripProject.origin,
        destination: selectedTripProject.destination,
        updatedAt: selectedTripProject.updatedAt,
      }
    : null;

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
              content: message.content,
              imageAttachments: message.imageAttachments.map((attachment) => ({
                id: attachment.id,
                originalFileName: attachment.originalFileName,
                mimeType: attachment.mimeType,
                byteSize: attachment.byteSize,
              })),
              provenance: message.provenance,
              annotations: message.annotations,
              feedback: message.feedback,
            }))}
            initialSessions={initialSessions}
            initialTripProjects={initialTripProjects}
            selectedTripProject={selectedTripProjectForComposer}
            userEmail={session.email}
            canAccessAdmin={hasAdminAccess(session.roles)}
            createTripProjectAction={createTripProjectFromForm}
            deleteConversationAction={deleteConversationAction}
            deleteTripProjectAction={deleteTripProjectAction}
            saveAnswerUsefulnessFeedbackAction={saveAnswerUsefulnessFeedbackAction}
            signOutAction={signOutCurrentUser}
      />
    </main>
  );
}
