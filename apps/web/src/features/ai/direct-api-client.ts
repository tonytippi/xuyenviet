"use client";

import { parseAcceptTripCreationRecommendationResult, parseAnnotationProposalActionCommand, parseAnnotationProposalActionResult, parseApplyTripChangeProposalResult, parseContinueInTripCommand, parseContinueInTripResult, parseConversationSummaryListResponse, parseCreateTripProjectCommand, parseCreateTripProjectResult, parseDeleteOwnedResourceResult, parseDismissTripChangeProposalResult, parsePlanningAnswerDetailResponse, parsePlanningContextResponse, parseRecommendationActionResult, parseRecommendationDecisionCommand, parseSafeApiError, parseSaveAnswerUsefulnessFeedbackCommand, parseSaveAnswerUsefulnessFeedbackResult, parseTravelerShellResponse, parseTripChangeProposalCommand, parseTripRecommendationResponse, type AiAskStreamEvent, type AnnotationProposalActionCommand, type CreateTripProjectCommand, type PlanningAnswerDetailResponse, type PlanningContextResponse, type TripChangeProposalCommand, type TravelerShellResponse } from "@xuyenviet/contracts";

let csrfToken: string | null = null;

export class DirectApiError extends Error {
  constructor(readonly code?: string, message = "Không thể kết nối với XuyenViet lúc này.") { super(message); }
}

async function readJson(response: Response) { return response.json().catch(() => null) as Promise<unknown>; }

async function directRead<T>(path: string, parse: (value: unknown) => T | null): Promise<T> {
  const response = await fetch(path, { credentials: "include", headers: { "x-request-id": crypto.randomUUID() } });
  const body = await readJson(response);
  const parsed = parse(body);
  if (!response.ok || !parsed) {
    const error = parseSafeApiError(body);
    throw new DirectApiError(error?.code, error?.message);
  }
  return parsed;
}

export function loadTravelerShell(conversationId?: string, tripProjectId?: string): Promise<TravelerShellResponse> {
  const query = new URLSearchParams();
  if (conversationId) query.set("conversationId", conversationId);
  if (tripProjectId) query.set("tripProjectId", tripProjectId);
  return directRead(`/v1/conversations/shell${query.size ? `?${query}` : ""}`, parseTravelerShellResponse);
}

export async function loadConversationSummaries() {
  return (await directRead("/v1/conversations/summaries", parseConversationSummaryListResponse)).summaries;
}

export function loadPlanningContext(tripProjectId: string): Promise<PlanningContextResponse> {
  return directRead(`/v1/conversations/planning-context/${encodeURIComponent(tripProjectId)}`, parsePlanningContextResponse);
}

export function loadAnswerDetail(conversationId: string, assistantMessageId: string): Promise<PlanningAnswerDetailResponse> {
  return directRead(`/v1/conversations/${encodeURIComponent(conversationId)}/answers/${encodeURIComponent(assistantMessageId)}`, parsePlanningAnswerDetailResponse);
}
export function loadTripRecommendations(conversationId: string) { return directRead(`/v1/conversations/${encodeURIComponent(conversationId)}/trip-recommendation`, parseTripRecommendationResponse); }

async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch("/auth/csrf", { credentials: "include" });
  const body = await readJson(response);
  if (!response.ok || !body || typeof body !== "object" || typeof (body as { csrfToken?: unknown }).csrfToken !== "string") throw new DirectApiError(parseSafeApiError(body)?.code);
  csrfToken = (body as { csrfToken: string }).csrfToken;
  return csrfToken;
}

async function directCommand<T>(path: string, method: "POST" | "DELETE", body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const token = await getCsrfToken();
  const response = await fetch(path, { method, credentials: "include", headers: { "Content-Type": "application/json", "X-XuyenViet-CSRF": token, "x-request-id": crypto.randomUUID(), ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await readJson(response);
  if (!response.ok) {
    const error = parseSafeApiError(payload);
    throw new DirectApiError(error?.code, error?.message);
  }
  return payload as T;
}

export async function createDirectTripProject(input: CreateTripProjectCommand) {
  const command = parseCreateTripProjectCommand(input);
  if (!command) return { success: false as const, reason: "invalid_input" as const };
  const result = await directCommand<unknown>("/v1/trip-projects", "POST", command);
  const parsed = parseCreateTripProjectResult(result); if (!parsed) throw new DirectApiError(); return parsed;
}

export async function deleteDirectConversation(conversationId: string) {
  const result = await directCommand<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}`, "DELETE");
  const parsed = parseDeleteOwnedResourceResult(result); if (!parsed) throw new DirectApiError(); return parsed;
}

export async function deleteDirectTripProject(tripProjectId: string) {
  const result = await directCommand<unknown>(`/v1/trip-projects/${encodeURIComponent(tripProjectId)}`, "DELETE");
  const parsed = parseDeleteOwnedResourceResult(result); if (!parsed) throw new DirectApiError(); return parsed;
}

export async function saveDirectAnswerUsefulnessFeedback(input: { assistantMessageId: string; rating: "useful" | "not_useful"; comment?: string | null }) {
  const command = parseSaveAnswerUsefulnessFeedbackCommand(input);
  if (!command) return { success: false as const, reason: "invalid_input" as const };
  const result = await directCommand<unknown>("/v1/answer-usefulness-feedback", "POST", command);
  const parsed = parseSaveAnswerUsefulnessFeedbackResult(result); if (!parsed) throw new DirectApiError(); return parsed;
}

export async function applyDirectTripChangeProposal(input: TripChangeProposalCommand) {
  const command = parseTripChangeProposalCommand(input);
  if (!command) return { success: false as const, reason: "not_found" as const };
  const result = await directCommand<unknown>("/v1/trip-change-proposals/apply", "POST", command);
  const parsed = parseApplyTripChangeProposalResult(result); if (!parsed) throw new DirectApiError(); return parsed;
}

export async function dismissDirectTripChangeProposal(input: TripChangeProposalCommand) {
  const command = parseTripChangeProposalCommand(input);
  if (!command) return { success: false as const, reason: "not_found" as const };
  const result = await directCommand<unknown>("/v1/trip-change-proposals/dismiss", "POST", command);
  const parsed = parseDismissTripChangeProposalResult(result); if (!parsed) throw new DirectApiError(); return parsed;
}

export async function executeDirectAnnotationProposalAction(input: AnnotationProposalActionCommand) {
  const command = parseAnnotationProposalActionCommand(input);
  if (!command) return { success: false as const, reason: "not_found" as const };
  const result = await directCommand<unknown>("/v1/trip-change-proposals/annotation-action", "POST", command);
  const parsed = parseAnnotationProposalActionResult(result); if (!parsed) throw new DirectApiError(); return parsed;
}
export async function declineDirectTripCreationRecommendation(input: { decisionId: string }) { const command = parseRecommendationDecisionCommand(input); if (!command) return { success: false as const, reason: "not_found" as const }; const parsed = parseRecommendationActionResult(await directCommand<unknown>("/v1/trip-recommendations/decline-creation", "POST", command)); if (!parsed) throw new DirectApiError(); return parsed; }
export async function chooseDirectPrivateTripRecommendation(input: { decisionId: string }) { const command = parseRecommendationDecisionCommand(input); if (!command) return { success: false as const, reason: "not_found" as const }; const parsed = parseRecommendationActionResult(await directCommand<unknown>("/v1/trip-recommendations/private", "POST", command)); if (!parsed) throw new DirectApiError(); return parsed; }
export async function continueDirectInTrip(input: { decisionId: string; tripProjectId: string }) { const command = parseContinueInTripCommand(input); if (!command) return { success: false as const, reason: "not_found" as const }; const parsed = parseContinueInTripResult(await directCommand<unknown>("/v1/trip-recommendations/continue", "POST", command)); if (!parsed) throw new DirectApiError(); return parsed; }
export async function acceptDirectTripCreationRecommendation(decisionId: string, idempotencyKey: string) { const parsed = parseAcceptTripCreationRecommendationResult(await directCommand<unknown>("/v1/trip-recommendations/accept-creation", "POST", { decisionId }, { "Idempotency-Key": idempotencyKey })); if (!parsed) throw new DirectApiError(); return parsed; }


export async function directLogout() {
  const token = await getCsrfToken();
  const response = await fetch("/auth/logout", { method: "POST", credentials: "include", headers: { "X-XuyenViet-CSRF": token } });
  if (!response.ok && response.status !== 204) throw new DirectApiError();
  csrfToken = null;
}

export async function submitDirectAiAskStream(input: { question: string; conversationId?: string; tripProjectId?: string; image: File | null; idempotencyKey: string; signal?: AbortSignal; onPreparing: () => void; onDelta: (content: string) => void }): Promise<AiAskStreamEvent[]> {
  const token = await getCsrfToken();
  const body = new FormData();
  body.set("question", input.question);
  if (input.conversationId) body.set("conversationId", input.conversationId);
  if (input.tripProjectId) body.set("tripProjectId", input.tripProjectId);
  if (input.image) body.set("image", input.image);
  const response = await fetch("/v1/ai-ask/stream", { method: "POST", body, signal: input.signal, credentials: "include", headers: { "X-XuyenViet-CSRF": token, "Idempotency-Key": input.idempotencyKey, "x-request-id": crypto.randomUUID() } });
  if (!response.ok || !response.body) throw new DirectApiError(parseSafeApiError(await readJson(response))?.code);
  const events: AiAskStreamEvent[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let phase: "initial" | "streaming" | "terminal" = "initial";
  while (true) {
    const { value, done } = await reader.read();
    buffered += decoder.decode(value, { stream: !done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parseAiAskStreamEvent(line);
      if (!event) throw new DirectApiError(undefined, "Luồng trả lời bị gián đoạn trước khi hoàn tất.");
      if (phase === "terminal" || event.type === "preparing" && phase !== "initial" || event.type === "delta" && phase !== "streaming" || (event.type === "done" || event.type === "error" || event.type === "in_progress") && phase !== "streaming") {
        throw new DirectApiError(undefined, "Luồng trả lời bị gián đoạn trước khi hoàn tất.");
      }
      phase = event.type === "preparing" || event.type === "delta" ? "streaming" : "terminal";
      events.push(event);
      if (event.type === "preparing") input.onPreparing();
      if (event.type === "delta") input.onDelta(event.content);
    }
    if (done) break;
  }
  if (buffered.trim()) throw new DirectApiError(undefined, "Luồng trả lời bị gián đoạn trước khi hoàn tất.");
  if (phase !== "terminal") throw new DirectApiError(undefined, "Luồng trả lời bị gián đoạn trước khi hoàn tất.");
  return events;
}

function parseAiAskStreamEvent(line: string): AiAskStreamEvent | null {
  try {
    const event = JSON.parse(line) as unknown;
    if (!event || typeof event !== "object" || Array.isArray(event)) return null;
    const record = event as Record<string, unknown>;
    if (record.type === "preparing") return hasOnlyKeys(record, ["type"]) ? { type: "preparing" } : null;
    if (record.type === "delta") return hasOnlyKeys(record, ["type", "content"]) && typeof record.content === "string" ? { type: "delta", content: record.content } : null;
    if (record.type === "in_progress") {
      if (!hasOnlyKeys(record, ["type", "conversationId", "userMessage"]) && !hasOnlyKeys(record, ["type", "conversationId"]) && !hasOnlyKeys(record, ["type", "userMessage"]) && !hasOnlyKeys(record, ["type"])) return null;
      return isOptionalIdentifier(record.conversationId) && isOptionalMessage(record.userMessage) ? { type: "in_progress", ...(record.conversationId ? { conversationId: record.conversationId } : {}), ...(record.userMessage ? { userMessage: record.userMessage } : {}) } : null;
    }
    if (record.type === "done") return hasOnlyKeys(record, ["type", "conversationId", "userMessage", "assistantMessage"]) && isIdentifier(record.conversationId) && isMessage(record.userMessage) && isAssistantMessage(record.assistantMessage) ? { type: "done", conversationId: record.conversationId, userMessage: record.userMessage, assistantMessage: record.assistantMessage } : null;
    if (record.type === "error") {
      if (!hasOnlyKeys(record, ["type", "code", "conversationId", "userMessage", "errorMessage"]) && !hasOnlyKeys(record, ["type", "conversationId", "userMessage", "errorMessage"]) && !hasOnlyKeys(record, ["type", "code", "errorMessage"]) && !hasOnlyKeys(record, ["type", "errorMessage"])) return null;
      return (record.code === undefined || record.code === "refresh_required") && isOptionalIdentifier(record.conversationId) && isOptionalMessage(record.userMessage) && typeof record.errorMessage === "string" ? { type: "error", ...(record.code ? { code: record.code } : {}), ...(record.conversationId ? { conversationId: record.conversationId } : {}), ...(record.userMessage ? { userMessage: record.userMessage } : {}), errorMessage: record.errorMessage } : null;
    }
    return null;
  } catch { return null; }
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function isIdentifier(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value; }
function isOptionalIdentifier(value: unknown): value is string | undefined { return value === undefined || isIdentifier(value); }
function isMessage(value: unknown): value is { id: string; content: string } { return Boolean(value) && typeof value === "object" && !Array.isArray(value) && hasOnlyKeys(value as Record<string, unknown>, ["id", "content"]) && isIdentifier((value as Record<string, unknown>).id) && typeof (value as Record<string, unknown>).content === "string"; }
function isOptionalMessage(value: unknown): value is { id: string; content: string } | undefined { return value === undefined || isMessage(value); }
function isAssistantMessage(value: unknown): value is { id: string; content: string; provenance?: unknown[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (hasOnlyKeys(record, ["id", "content"]) || hasOnlyKeys(record, ["id", "content", "provenance"]) && Array.isArray(record.provenance))
    && isIdentifier(record.id)
    && typeof record.content === "string";
}
