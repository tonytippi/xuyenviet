import "server-only";

import type { OwnedConversationSummary } from "./conversations";

type ConversationSummaryEnvironment = {
  APP_ENV?: string;
  XV_CONVERSATION_SUMMARY_API_ENABLED?: string;
  XV_CONVERSATION_SUMMARY_SHADOW_COMPARE_ENABLED?: string;
};

type ComparisonLogger = Pick<Console, "info" | "warn">;

export async function loadOwnedConversationSummaries(input: {
  legacy: () => Promise<OwnedConversationSummary[] | null>;
  api?: (correlationId?: string) => Promise<OwnedConversationSummary[]>;
  environment?: ConversationSummaryEnvironment;
  correlationId?: string;
  logger?: ComparisonLogger;
}): Promise<OwnedConversationSummary[] | null> {
  const apiEnabled = isConversationSummaryApiEnabled(input.environment);
  const comparisonId = input.correlationId ?? crypto.randomUUID();
  const api = input.api ?? (async (correlationId?: string) => {
    const { listOwnedConversationSummariesFromApi } = await import("./conversation-summary-bff");
    return listOwnedConversationSummariesFromApi(undefined, correlationId);
  });
  const selected = apiEnabled ? () => api(comparisonId) : input.legacy;
  const unselected = apiEnabled ? input.legacy : () => api(comparisonId);
  const summaries = await selected();

  if (isShadowComparisonEnabled(input.environment)) {
    // The selected owner completes before this read begins; comparison is observability only.
    void compareSelectedAndUnselected({ selected: summaries, unselected, correlationId: comparisonId, logger: input.logger ?? console });
  }

  return summaries;
}

function isConversationSummaryApiEnabled(environment?: ConversationSummaryEnvironment): boolean {
  const value = environment ? environment.XV_CONVERSATION_SUMMARY_API_ENABLED : process.env.XV_CONVERSATION_SUMMARY_API_ENABLED;
  if (value === undefined || value === "") return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Invalid conversation-summary API cutover configuration.");
}

function isShadowComparisonEnabled(environment?: ConversationSummaryEnvironment): boolean {
  const enabled = environment ? environment.XV_CONVERSATION_SUMMARY_SHADOW_COMPARE_ENABLED : process.env.XV_CONVERSATION_SUMMARY_SHADOW_COMPARE_ENABLED;
  if (enabled === undefined || enabled === "" || enabled === "false") return false;
  if (enabled !== "true") throw new Error("Invalid conversation-summary shadow comparison configuration.");
  const appEnv = environment ? environment.APP_ENV : process.env.APP_ENV;
  return appEnv === "local" || appEnv === "staging";
}

async function compareSelectedAndUnselected(input: {
  selected: OwnedConversationSummary[] | null;
  unselected: () => Promise<OwnedConversationSummary[] | null>;
  correlationId: string;
  logger: ComparisonLogger;
}) {
  try {
    const unselected = await input.unselected();
    const equivalent = JSON.stringify(normalize(input.selected)) === JSON.stringify(normalize(unselected));
    input.logger.info("conversation_summary_shadow_comparison", { correlationId: input.correlationId, equivalent });
  } catch {
    input.logger.warn("conversation_summary_shadow_comparison_failed", { correlationId: input.correlationId });
  }
}

function normalize(summaries: OwnedConversationSummary[] | null) {
  return summaries?.map((summary) => ({ id: summary.id, updatedAt: summary.updatedAt.toISOString(), preview: summary.preview })) ?? null;
}
