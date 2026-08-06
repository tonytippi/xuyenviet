import { DirectShellLoader } from "@/features/chat-trips/direct-shell-loader";
import { getSingleAiAskQueryValue } from "@/features/chat-trips/ai-ask-url";
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

export default async function AiAskPage({ searchParams }: AiAskPageProps) {
  const params = await searchParams;
  const publicDraft = normalizePublicAskDraft(getSingleAiAskQueryValue(params?.draft));
  const requestedConversationId = getSingleAiAskQueryValue(params?.conversationId)?.trim();
  const requestedTripProjectId = getSingleAiAskQueryValue(params?.tripProjectId)?.trim();
  const historyConversationId = getSingleAiAskQueryValue(params?.historyConversationId)?.trim();
  return <DirectShellLoader initialQuestion={publicDraft} conversationId={requestedConversationId} historyConversationId={historyConversationId} tripProjectId={requestedTripProjectId} />;
}
