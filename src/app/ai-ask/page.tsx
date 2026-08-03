import { DirectShellLoader } from "@/features/chat-trips/direct-shell-loader";
import { normalizePublicAskDraft } from "@/features/auth/redirects";

type AiAskPageProps = {
  searchParams?: Promise<{
    ref?: string | string[];
    draft?: string | string[];
    conversationId?: string | string[];
    tripProjectId?: string | string[];
    historyConversationId?: string | string[];
  }>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? undefined : value;
}

export default async function AiAskPage({ searchParams }: AiAskPageProps) {
  const params = await searchParams;
  const publicDraft = normalizePublicAskDraft(getSingleParam(params?.draft));
  const requestedConversationId = getSingleParam(params?.conversationId)?.trim();
  const requestedTripProjectId = getSingleParam(params?.tripProjectId)?.trim();
  const historyConversationId = getSingleParam(params?.historyConversationId)?.trim();
  return <DirectShellLoader initialQuestion={publicDraft} conversationId={requestedConversationId} historyConversationId={historyConversationId} tripProjectId={requestedTripProjectId} />;
}
