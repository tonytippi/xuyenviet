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

function getFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim());
  }

  return value;
}

export default async function AiAskPage({ searchParams }: AiAskPageProps) {
  const params = await searchParams;
  const publicDraft = normalizePublicAskDraft(getFirstParam(params?.draft));
  const requestedConversationId = getFirstParam(params?.conversationId)?.trim();
  const requestedTripProjectId = getFirstParam(params?.tripProjectId)?.trim();
  const historyConversationId = getFirstParam(params?.historyConversationId)?.trim();
  return <DirectShellLoader initialQuestion={publicDraft} conversationId={requestedConversationId} historyConversationId={historyConversationId} tripProjectId={requestedTripProjectId} />;
}
