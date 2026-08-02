import "server-only";

import { parsePlanningAnswerDetailResponse, parsePlanningContextResponse, type PlanningAnswerDetailResponse, type PlanningContextResponse } from "@xuyenviet/contracts";
import { getBffTransportConfig, type BffTransportConfig } from "@xuyenviet/config";

import { callPrivateApi } from "@/server/bff-api-client";
import { mintWebBffCredential } from "@/server/bff-credentials";

type Dependencies = {
  config: () => BffTransportConfig;
  mintCredential: () => Promise<string>;
  callContext: (input: Omit<Parameters<typeof callPrivateApi>[0], "parseResult"> & { parseResult: typeof parsePlanningContextResponse }) => Promise<PlanningContextResponse>;
  callDetail: (input: Omit<Parameters<typeof callPrivateApi>[0], "parseResult"> & { parseResult: typeof parsePlanningAnswerDetailResponse }) => Promise<PlanningAnswerDetailResponse>;
};

const defaults: Dependencies = { config: getBffTransportConfig, mintCredential: mintWebBffCredential, callContext: (input) => callPrivateApi(input), callDetail: (input) => callPrivateApi(input) };

export async function loadOwnedPlanningContextFromApi(tripProjectId: string, dependencies: Dependencies = defaults, correlationId = crypto.randomUUID()) {
  const config = dependencies.config();
  return dependencies.callContext({ config, credential: await dependencies.mintCredential(), correlationId, path: `/v1/conversations/planning-context/${encodeURIComponent(tripProjectId)}`, method: "GET", parseResult: parsePlanningContextResponse });
}

export async function loadOwnedAnswerDetailFromApi(conversationId: string, assistantMessageId: string, dependencies: Dependencies = defaults, correlationId = crypto.randomUUID()) {
  const config = dependencies.config();
  return dependencies.callDetail({ config, credential: await dependencies.mintCredential(), correlationId, path: `/v1/conversations/${encodeURIComponent(conversationId)}/answers/${encodeURIComponent(assistantMessageId)}`, method: "GET", parseResult: parsePlanningAnswerDetailResponse });
}
