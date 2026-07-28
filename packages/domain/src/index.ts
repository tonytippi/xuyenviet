import { conversationSummaryLimit, type ConversationSummary } from "@xuyenviet/contracts";
import type { ConversationSummaryRepository } from "@xuyenviet/database";

const newConversationPreview = "Hội thoại mới";
const previewMaxLength = 60;

export type OwnedConversationSummary = { id: string; updatedAt: Date; preview: string };

export async function listOwnedConversationSummaries(repository: ConversationSummaryRepository, userId: string): Promise<OwnedConversationSummary[]> {
  const rows = await repository.listOwnedConversationSummaryRows(userId, conversationSummaryLimit);
  const seen = new Set<string>();
  const summaries: OwnedConversationSummary[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    summaries.push({ id: row.id, updatedAt: row.updatedAt, preview: formatPreview(row.messageContent) });
    if (summaries.length === conversationSummaryLimit) break;
  }
  return summaries;
}

export function serializeConversationSummaries(summaries: OwnedConversationSummary[]): ConversationSummary[] {
  return summaries.map((summary) => ({ id: summary.id, updatedAt: summary.updatedAt.toISOString(), preview: summary.preview }));
}

function formatPreview(content: string | null): string {
  if (!content) return newConversationPreview;
  const trimmed = content.trim();
  return trimmed.length <= previewMaxLength ? trimmed : `${trimmed.slice(0, previewMaxLength).trimEnd()}…`;
}
