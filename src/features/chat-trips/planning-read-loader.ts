import "server-only";

import type { PlanningAnswerDetailResponse, PlanningContextResponse } from "@xuyenviet/contracts";
import { isPlanningReadApiEnabled } from "@xuyenviet/config";

type Environment = { APP_ENV?: string; XV_PLANNING_READ_API_ENABLED?: string; XV_PLANNING_READ_SHADOW_COMPARE_ENABLED?: string };
type Logger = Pick<Console, "info" | "warn">;

export async function loadSelectedPlanningContext(input: { tripProjectId: string; legacy: () => Promise<PlanningContextResponse>; api?: (correlationId: string) => Promise<PlanningContextResponse>; environment?: Environment; correlationId?: string; logger?: Logger }) {
  const apiEnabled = isApiEnabled(input.environment);
  const correlationId = input.correlationId ?? crypto.randomUUID();
  const api = input.api ?? (async (id: string) => (await import("./planning-read-bff")).loadOwnedPlanningContextFromApi(input.tripProjectId, undefined, id));
  const selected = apiEnabled ? () => api(correlationId) : input.legacy;
  const unselected = apiEnabled ? input.legacy : () => api(correlationId);
  const result = await selected();
  shadow({ result, unselected, environment: input.environment, correlationId, logger: input.logger });
  return result;
}

export async function loadSelectedAnswerDetail(input: { conversationId: string; assistantMessageId: string; legacy: () => Promise<PlanningAnswerDetailResponse>; api?: (correlationId: string) => Promise<PlanningAnswerDetailResponse>; environment?: Environment; correlationId?: string; logger?: Logger }) {
  const apiEnabled = isApiEnabled(input.environment);
  const correlationId = input.correlationId ?? crypto.randomUUID();
  const api = input.api ?? (async (id: string) => (await import("./planning-read-bff")).loadOwnedAnswerDetailFromApi(input.conversationId, input.assistantMessageId, undefined, id));
  const selected = apiEnabled ? () => api(correlationId) : input.legacy;
  const unselected = apiEnabled ? input.legacy : () => api(correlationId);
  const result = apiEnabled
    ? await selected().then((response) => matchingDetail(response, input)).catch(() => ({ detail: null }))
    : matchingDetail(await selected(), input);
  shadow({ result, unselected, environment: input.environment, correlationId, logger: input.logger });
  return result;
}

function isApiEnabled(environment?: Environment) {
  return isPlanningReadApiEnabled(environment ?? { APP_ENV: process.env.APP_ENV, XV_PLANNING_READ_API_ENABLED: process.env.XV_PLANNING_READ_API_ENABLED });
}
function matchingDetail(response: PlanningAnswerDetailResponse, input: { conversationId: string; assistantMessageId: string }): PlanningAnswerDetailResponse {
  const detail = response.detail;
  if (!detail || detail.conversationId !== input.conversationId || detail.assistantMessageId !== input.assistantMessageId) return { detail: null };
  return response;
}
function shadow<T>(input: { result: T; unselected: () => Promise<T>; environment?: Environment; correlationId: string; logger?: Logger }) {
  const enabled = input.environment ? input.environment.XV_PLANNING_READ_SHADOW_COMPARE_ENABLED : process.env.XV_PLANNING_READ_SHADOW_COMPARE_ENABLED;
  const appEnv = input.environment ? input.environment.APP_ENV : process.env.APP_ENV;
  if (enabled !== "true" || !["local", "staging"].includes(appEnv ?? "")) return;
  void input.unselected().then((other) => (input.logger ?? console).info("planning_read_shadow_comparison", { correlationId: input.correlationId, equivalent: JSON.stringify(input.result) === JSON.stringify(other) })).catch(() => (input.logger ?? console).warn("planning_read_shadow_comparison_failed", { correlationId: input.correlationId }));
}
