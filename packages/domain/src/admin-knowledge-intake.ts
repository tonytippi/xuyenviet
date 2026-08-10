import type { AdminKnowledgeIntake, AdminKnowledgeIntakeQuery, AdminKnowledgeSeedBatchRequest, AdminKnowledgeSeedBatchResponse, AdminKnowledgeSourceRemovalRequest, AdminKnowledgeSourceRemovalResponse, RequestPrincipal } from "@xuyenviet/contracts";

export type KnowledgeOneUrlHandoffOutcome = "submitted" | "duplicate" | "failed" | "reconciling";
export type KnowledgeOneUrlHandoff = { submit(input: { reference: string; canonicalUrl: string; actorUserId: string }): Promise<KnowledgeOneUrlHandoffOutcome>; lookup(reference: string): Promise<KnowledgeOneUrlHandoffOutcome | "missing">; };

export type AdminKnowledgeIntakePort = {
  list(input: AdminKnowledgeIntakeQuery): Promise<AdminKnowledgeIntake>;
  submitBatch(actor: RequestPrincipal, input: AdminKnowledgeSeedBatchRequest): Promise<AdminKnowledgeSeedBatchResponse>;
  removeSource(actor: RequestPrincipal, sourceId: string, input: AdminKnowledgeSourceRemovalRequest): Promise<AdminKnowledgeSourceRemovalResponse>;
  handoff: KnowledgeOneUrlHandoff;
};

export class AdminKnowledgeIntakePolicyError extends Error {}

export async function submitAdminKnowledgeSeedBatch(port: AdminKnowledgeIntakePort, actor: RequestPrincipal, input: AdminKnowledgeSeedBatchRequest) {
  if (!input.urls.length) throw new AdminKnowledgeIntakePolicyError("At least one URL is required.");
  return port.submitBatch(actor, input);
}

export async function removeAdminKnowledgeSource(port: AdminKnowledgeIntakePort, actor: RequestPrincipal, sourceId: string, input: AdminKnowledgeSourceRemovalRequest) {
  if (!validId(sourceId)) throw new AdminKnowledgeIntakePolicyError("Source id is required.");
  return port.removeSource(actor, sourceId, input);
}

function validId(value: string) { return value.trim() === value && value.length > 0 && value.length <= 128; }
