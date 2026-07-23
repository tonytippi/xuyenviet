import "server-only";

import type { assembleContextPrioritySourceBundle } from "@/features/retrieval/source-bundle";

export function ensureAiAskFreshnessWarning(content: string, sourceBundle: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>) {
  const freshnessWarningRequired = sourceBundle.retrievalDecision.freshnessRequired || sourceBundle.web.some((source) => isFreshnessSensitiveWebTrigger(source.triggerReason));
  const caveatOnlyKnowledge = sourceBundle.knowledge.filter((item) => item.policy === "caveat_only" || item.knowledgeState === "uncertain" || item.verificationState === "required");
  const conditionalKnowledge = sourceBundle.knowledge.filter((item) => item.policy === "contextual_use" && item.knowledgeState === "conditional" && item.conditions.length > 0);
  const caveatWarningRequired = caveatOnlyKnowledge.length > 0;
  const externalVerificationRequired = sourceBundle.retrievalDecision.webSearchTriggered
    && (sourceBundle.warnings.includes("web_search_load_failed") || sourceBundle.warnings.includes("web_search_low_quality"));

  if (caveatWarningRequired) {
    const fallback = `Cảnh báo cần kiểm tra\nMình chưa thể dùng thông tin cần xác minh để chốt lịch trình. ${formatCaveatVerificationInstruction(caveatOnlyKnowledge)}`;
    return { content: fallback, appendedWarning: fallback, replacedUnsafeContent: true };
  }

  if (conditionalKnowledge.some((item) => !hasEveryMaterialCondition(content, item.conditions))) {
    const fallback = `Điều kiện cần giữ\nMình chưa thể dùng thông tin có điều kiện để khuyến nghị hoặc chốt lịch trình khi thiếu điều kiện vật chất. ${formatConditionalUseInstruction(conditionalKnowledge)}`;
    return { content: fallback, appendedWarning: fallback, replacedUnsafeContent: true };
  }

  if (!freshnessWarningRequired && !caveatWarningRequired && !externalVerificationRequired) {
    return { content, appendedWarning: "", replacedUnsafeContent: false };
  }

  const normalizedContent = content.normalize("NFC");
  const warningHeading = /cảnh báo cần kiểm tra/i.exec(normalizedContent);
  const warningBody = warningHeading ? normalizedContent.slice(warningHeading.index + warningHeading[0].length) : "";
  const hasFreshnessWarning = Boolean(warningHeading) && /(kiểm tra|xác minh|nguồn chính thức|nhà cung cấp)/i.test(warningBody);
  const hasCaveatWarning = Boolean(warningHeading)
    && /không dùng.{0,80}(?:chốt lịch trình|quyết định lịch trình|khuyến nghị đã được xác nhận)/i.test(warningBody)
    && caveatOnlyKnowledge.every((item) => warningBody.includes(getVerificationTarget(item)));

  if ((!freshnessWarningRequired || hasFreshnessWarning) && (!caveatWarningRequired || hasCaveatWarning) && !externalVerificationRequired) {
    return { content, appendedWarning: "", replacedUnsafeContent: false };
  }

  const warnings = [];
  if (freshnessWarningRequired && !hasFreshnessWarning) {
    warnings.push("Thông tin về giá, lịch, tình trạng còn chỗ, đường sá, giờ mở cửa, thời tiết, dịch vụ hoặc khuyến mãi có thể thay đổi. Hãy kiểm tra lại với nguồn chính thức hoặc nhà cung cấp trước khi đi, hành động hoặc đặt dịch vụ.");
  }
  if (caveatWarningRequired && !hasCaveatWarning) {
    warnings.push(`Không dùng thông tin này để chốt lịch trình. ${formatCaveatVerificationInstruction(caveatOnlyKnowledge)}`);
  }
  if (externalVerificationRequired) {
    warnings.push("Mình chưa thể xác minh thông tin hiện tại từ nguồn bên ngoài. Hãy xác nhận trực tiếp với nguồn chính thức hoặc nhà cung cấp trước khi đi, hành động hoặc đặt dịch vụ.");
  }
  const appendedWarning = `\n\nCảnh báo cần kiểm tra\n${warnings.join(" ")}`;
  return { content: `${content.trimEnd()}${appendedWarning}`, appendedWarning, replacedUnsafeContent: false };
}

function formatCaveatVerificationInstruction(items: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>["knowledge"]) {
  return `Hãy xác minh ${items.map(getVerificationTarget).join("; ")} trước khi đi, hành động hoặc đặt dịch vụ.`;
}

function getVerificationTarget(item: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>["knowledge"][number]) {
  const title = item.title.replace(/\s+/g, " ").trim();
  const conditions = item.conditions.map(normalizeMaterialCondition).filter(Boolean);
  if (conditions.length === 1) return `điều kiện "${conditions[0]}" của "${title}"`;
  if (conditions.length > 1) return `mọi điều kiện ${conditions.map((condition) => `"${condition}"`).join(", ")} của "${title}"`;
  return `tình trạng hiện tại của "${title}"`;
}

export function requiresAiAskAnswerFinalization(sourceBundle: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>) {
  return sourceBundle.knowledge.some((item) => item.policy === "caveat_only" || item.knowledgeState === "uncertain" || item.verificationState === "required" || (item.policy === "contextual_use" && item.knowledgeState === "conditional" && item.conditions.length > 0));
}

function hasEveryMaterialCondition(content: string, conditions: string[]) {
  const normalizedContent = normalizeMaterialCondition(content).toLocaleLowerCase("vi");
  return conditions.map(normalizeMaterialCondition).filter(Boolean).every((condition) => normalizedContent.includes(condition.toLocaleLowerCase("vi")));
}

function formatConditionalUseInstruction(items: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>["knowledge"]) {
  return `Chỉ cân nhắc ${items.map((item) => `"${item.title.replace(/\s+/g, " ").trim()}" khi nêu đầy đủ ${item.conditions.map(normalizeMaterialCondition).filter(Boolean).map((condition) => `"${condition}"`).join(", ")}`).join("; ")}.`;
}

function normalizeMaterialCondition(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function isFreshnessSensitiveWebTrigger(reason: string) {
  return reason === "freshness_sensitive_request" || reason === "active_knowledge_may_be_stale";
}
