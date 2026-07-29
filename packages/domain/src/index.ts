import { conversationSummaryLimit, type AiAskStreamEvent, type AiAskStreamInput, type ConversationSummary, type RequestPrincipal } from "@xuyenviet/contracts";

export type ConversationSummaryRepository = {
  listOwnedConversationSummaryRows(userId: string, limit: number): Promise<Array<{ id: string; updatedAt: Date; messageContent: string | null }>>;
};

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

export type AiAskStreamExecution = {
  execute(input: AiAskStreamInput, principal: RequestPrincipal, correlationId: string, signal: AbortSignal): AsyncIterable<Uint8Array>;
};

/** A rejected admission is safe to project as a client validation failure. */
export class AiAskAdmissionValidationError extends Error {}

export function encodeAiAskStreamEvent(event: AiAskStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export type AiAskStreamAdmission =
  | { kind: "admitted"; execution: AsyncIterable<AiAskStreamEvent> }
  | { kind: "replay"; event: AiAskStreamEvent };

export type AiAskStreamExecutionPort = {
  admit(input: AiAskStreamInput, principal: RequestPrincipal, correlationId: string, signal: AbortSignal): Promise<AiAskStreamAdmission>;
};

const streamFailure: AiAskStreamEvent = {
  type: "error",
  errorMessage: "Không thể hoàn tất luồng trả lời lúc này. Hãy thử lại sau.",
};

/**
 * The application seam deliberately exposes bytes, not event objects, so HTTP
 * adapters cannot accidentally add correlation data or reserialize NDJSON.
 */
export function createAiAskStreamExecution(port: AiAskStreamExecutionPort): AiAskStreamExecution {
  return {
    async *execute(input, principal, correlationId, signal) {
      const admission = await port.admit(input, principal, correlationId, signal);
      if (admission.kind === "replay") {
        yield encodeAiAskStreamEvent(admission.event);
        return;
      }
      let preparing = false;
      let terminal = false;
      try {
        for await (const event of admission.execution) {
          if (terminal || (event.type === "preparing" && preparing) || (event.type === "delta" && !preparing) || (event.type !== "preparing" && event.type !== "delta" && !preparing)) {
            if (!terminal) yield encodeAiAskStreamEvent(streamFailure);
            return;
          }
          if (event.type === "preparing") preparing = true;
          if (event.type === "done" || event.type === "error") terminal = true;
          yield encodeAiAskStreamEvent(event);
          if (terminal) return;
        }
      } catch {
        if (!terminal) {
          if (!preparing) yield encodeAiAskStreamEvent({ type: "preparing" });
          yield encodeAiAskStreamEvent(streamFailure);
        }
        return;
      }
      if (!terminal) {
        if (!preparing) yield encodeAiAskStreamEvent({ type: "preparing" });
        yield encodeAiAskStreamEvent(streamFailure);
      }
    },
  };
}

function formatPreview(content: string | null): string {
  if (!content) return newConversationPreview;
  const trimmed = content.trim();
  return trimmed.length <= previewMaxLength ? trimmed : `${trimmed.slice(0, previewMaxLength).trimEnd()}…`;
}
