import type { AdminAiGatewayModel, AdminAiGatewayModelInput, AdminAiGatewayModelUpdate, RequestPrincipal } from "@xuyenviet/contracts";

export type AdminAiModelCatalogPort = {
  list(): Promise<AdminAiGatewayModel[]>;
  create(principal: RequestPrincipal, input: AdminAiGatewayModelInput): Promise<AdminAiGatewayModel>;
  update(principal: RequestPrincipal, id: string, input: AdminAiGatewayModelUpdate): Promise<AdminAiGatewayModel>;
  setDefault(principal: RequestPrincipal, id: string): Promise<AdminAiGatewayModel>;
  archive(principal: RequestPrincipal, id: string): Promise<AdminAiGatewayModel>;
};

export class AdminAiModelCatalogPolicyError extends Error {}

export async function createAdminAiGatewayModel(port: AdminAiModelCatalogPort, principal: RequestPrincipal, input: AdminAiGatewayModelInput) { validate(input); return port.create(principal, input); }
export async function updateAdminAiGatewayModel(port: AdminAiModelCatalogPort, principal: RequestPrincipal, id: string, input: AdminAiGatewayModelUpdate) { if (!validId(id)) throw new AdminAiModelCatalogPolicyError("AI Gateway model id is required."); validate(input); return port.update(principal, id, input); }
export async function setDefaultAdminAiGatewayModel(port: AdminAiModelCatalogPort, principal: RequestPrincipal, id: string) { if (!validId(id)) throw new AdminAiModelCatalogPolicyError("AI Gateway model id is required."); return port.setDefault(principal, id); }
export async function archiveAdminAiGatewayModel(port: AdminAiModelCatalogPort, principal: RequestPrincipal, id: string) { if (!validId(id)) throw new AdminAiModelCatalogPolicyError("AI Gateway model id is required."); return port.archive(principal, id); }

function validId(id: string) { return id.trim().length > 0 && id.trim() === id && id.length <= 128; }
function validate(input: AdminAiGatewayModelInput | AdminAiGatewayModelUpdate) {
  const priced = [input.inputTokenPriceMicros, input.outputTokenPriceMicros, input.cacheReadTokenPriceMicros, input.cacheWriteTokenPriceMicros].some((value) => value !== undefined && value !== null);
  if (priced && "pricingCurrency" in input && !input.pricingCurrency) throw new AdminAiModelCatalogPolicyError("Pricing currency is required when any token price is configured.");
  if (input.active === false && input.defaultForPurpose === true) throw new AdminAiModelCatalogPolicyError("Default AI Gateway model must be active.");
  if (input.defaultForPurpose && input.purpose === "ai_ask_initial_answer" && !input.supportsTextInput) throw new AdminAiModelCatalogPolicyError("Default AI Ask model must support text input.");
  if (input.defaultForPurpose && input.purpose === "extraction" && (!input.supportsTextInput || !input.supportsExtraction)) throw new AdminAiModelCatalogPolicyError("Default extraction model must support text input and extraction.");
  if (input.defaultForPurpose && input.purpose === "embeddings" && !input.supportsEmbeddings) throw new AdminAiModelCatalogPolicyError("Default embeddings model must support embeddings.");
  if (input.defaultForPurpose && input.purpose === "evaluation" && (!input.supportsTextInput || !input.supportsEvaluation)) throw new AdminAiModelCatalogPolicyError("Default evaluation model must support text input and evaluation.");
}
