export function getSingleAiAskQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? undefined : value;
}

export function buildCanonicalAiAskUrl(conversationId?: string, tripProjectId?: string, historyConversationId?: string) {
  const searchParams = new URLSearchParams();

  if (conversationId) searchParams.set("conversationId", conversationId);
  if (tripProjectId) searchParams.set("tripProjectId", tripProjectId);
  if (historyConversationId) searchParams.set("historyConversationId", historyConversationId);

  const query = searchParams.toString();
  return query ? `/ai-ask?${query}` : "/ai-ask";
}
