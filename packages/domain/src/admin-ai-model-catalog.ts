import type { AdminAiGatewayModel, AdminAiGatewayModelInput, AdminAiGatewayModelUpdate, AdminAiPurposeAssignment, RequestPrincipal } from "@xuyenviet/contracts";

export type AdminAiModelCatalogPort = {
  list(): Promise<{ models: AdminAiGatewayModel[]; assignments: AdminAiPurposeAssignment[] }>;
  create(principal: RequestPrincipal, input: AdminAiGatewayModelInput): Promise<AdminAiGatewayModel>;
  update(principal: RequestPrincipal, id: string, input: AdminAiGatewayModelUpdate): Promise<AdminAiGatewayModel>;
  assignPurpose(principal: RequestPrincipal, input: AdminAiPurposeAssignment): Promise<AdminAiPurposeAssignment>;
  archive(principal: RequestPrincipal, id: string): Promise<AdminAiGatewayModel>;
};

export class AdminAiModelCatalogPolicyError extends Error {}

export async function createAdminAiGatewayModel(port: AdminAiModelCatalogPort, principal: RequestPrincipal, input: AdminAiGatewayModelInput) { validate(input); return port.create(principal, input); }
export async function updateAdminAiGatewayModel(port: AdminAiModelCatalogPort, principal: RequestPrincipal, id: string, input: AdminAiGatewayModelUpdate) { if (!validId(id)) throw new AdminAiModelCatalogPolicyError("AI Gateway model id is required."); validate(input); return port.update(principal, id, input); }
export async function assignAdminAiPurpose(port: AdminAiModelCatalogPort, principal: RequestPrincipal, input: AdminAiPurposeAssignment) { if (!validId(input.aiGatewayModelId)) throw new AdminAiModelCatalogPolicyError("AI Gateway model id is required."); return port.assignPurpose(principal, input); }
export async function archiveAdminAiGatewayModel(port: AdminAiModelCatalogPort, principal: RequestPrincipal, id: string) { if (!validId(id)) throw new AdminAiModelCatalogPolicyError("AI Gateway model id is required."); return port.archive(principal, id); }

function validId(id: string) { return id.trim().length > 0 && id.trim() === id && id.length <= 128; }
function validate(input: AdminAiGatewayModelInput | AdminAiGatewayModelUpdate) {
  const priced = [input.inputTokenPriceMicros, input.outputTokenPriceMicros, input.cacheReadTokenPriceMicros, input.cacheWriteTokenPriceMicros].some((value) => value !== undefined && value !== null);
  if (priced && "pricingCurrency" in input && !input.pricingCurrency) throw new AdminAiModelCatalogPolicyError("Pricing currency is required when any token price is configured.");
}
