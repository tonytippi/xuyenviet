import "server-only";

import { parseConversationSummaryListResponse, type ConversationSummaryListResponse } from "@xuyenviet/contracts";
import { getBffTransportConfig, type BffTransportConfig } from "@xuyenviet/config";

import { callPrivateApi } from "@/server/bff-api-client";
import { mintWebBffCredential } from "@/server/bff-credentials";

import type { OwnedConversationSummary } from "./conversations";

type Dependencies = {
  config: () => BffTransportConfig;
  mintCredential: () => Promise<string>;
  callApi: (input: Omit<Parameters<typeof callPrivateApi>[0], "parseResult"> & { parseResult: typeof parseConversationSummaryListResponse }) => Promise<ConversationSummaryListResponse>;
};

const defaults: Dependencies = { config: getBffTransportConfig, mintCredential: mintWebBffCredential, callApi: (input) => callPrivateApi(input) };

export async function listOwnedConversationSummariesFromApi(dependencies: Dependencies = defaults): Promise<OwnedConversationSummary[]> {
  const config = dependencies.config();
  const credential = await dependencies.mintCredential();
  const response = await dependencies.callApi({
    config,
    credential,
    correlationId: crypto.randomUUID(),
    path: "/v1/conversations/summaries",
    method: "GET",
    parseResult: parseConversationSummaryListResponse,
  });
  return response.summaries.map((summary) => ({ id: summary.id, updatedAt: new Date(summary.updatedAt), preview: summary.preview }));
}
