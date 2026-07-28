import "server-only";

import type { OwnedConversationSummary } from "./conversations";

export async function loadOwnedConversationSummaries(input: {
  legacy: () => Promise<OwnedConversationSummary[] | null>;
  api?: () => Promise<OwnedConversationSummary[]>;
  environment?: { XV_CONVERSATION_SUMMARY_API_ENABLED?: string };
}): Promise<OwnedConversationSummary[] | null> {
  if (isConversationSummaryApiEnabled(input.environment)) {
    if (input.api) return input.api();
    const { listOwnedConversationSummariesFromApi } = await import("./conversation-summary-bff");
    return listOwnedConversationSummariesFromApi();
  }
  return input.legacy();
}

function isConversationSummaryApiEnabled(environment?: { XV_CONVERSATION_SUMMARY_API_ENABLED?: string }): boolean {
  const value = environment ? environment.XV_CONVERSATION_SUMMARY_API_ENABLED : process.env.XV_CONVERSATION_SUMMARY_API_ENABLED;
  if (value === undefined || value === "") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Invalid conversation-summary API cutover configuration.");
}
