import "server-only";

import type { assembleContextPrioritySourceBundle } from "@/features/retrieval/source-bundle";

export function ensureAiAskFreshnessWarning(content: string, sourceBundle: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>) {
  const freshnessWarningRequired = sourceBundle.retrievalDecision.freshnessRequired || sourceBundle.web.some((source) => isFreshnessSensitiveWebTrigger(source.triggerReason));
  const caveatOnlyKnowledge = sourceBundle.knowledge.filter((item) => item.policy === "caveat_only" || item.knowledgeState === "uncertain" || item.verificationState === "required");
  const caveatWarningRequired = caveatOnlyKnowledge.length > 0;

  if (caveatWarningRequired && hasSettledItineraryRecommendation(content)) {
    const fallback = `Cảnh báo cần kiểm tra\nMình chưa thể dùng thông tin cần xác minh để chốt lịch trình. ${formatCaveatVerificationInstruction(caveatOnlyKnowledge)}`;
    return { content: fallback, appendedWarning: fallback, replacedUnsafeContent: true };
  }

  if (!freshnessWarningRequired && !caveatWarningRequired) {
    return { content, appendedWarning: "", replacedUnsafeContent: false };
  }

  const normalizedContent = content.normalize("NFC");
  const warningHeading = /cảnh báo cần kiểm tra/i.exec(normalizedContent);
  const warningBody = warningHeading ? normalizedContent.slice(warningHeading.index + warningHeading[0].length) : "";
  const hasFreshnessWarning = Boolean(warningHeading) && /(kiểm tra|xác minh|nguồn chính thức|nhà cung cấp)/i.test(warningBody);
  const hasCaveatWarning = Boolean(warningHeading)
    && /không dùng.{0,80}(?:chốt lịch trình|quyết định lịch trình|khuyến nghị đã được xác nhận)/i.test(warningBody)
    && caveatOnlyKnowledge.every((item) => warningBody.includes(getVerificationTarget(item)));

  if ((!freshnessWarningRequired || hasFreshnessWarning) && (!caveatWarningRequired || hasCaveatWarning)) {
    return { content, appendedWarning: "", replacedUnsafeContent: false };
  }

  const warnings = [];
  if (freshnessWarningRequired && !hasFreshnessWarning) {
    warnings.push("Thông tin về giá, lịch, tình trạng còn chỗ, đường sá, giờ mở cửa, thời tiết, dịch vụ hoặc khuyến mãi có thể thay đổi. Hãy kiểm tra lại với nguồn chính thức hoặc nhà cung cấp trước khi đi, hành động hoặc đặt dịch vụ.");
  }
  if (caveatWarningRequired && !hasCaveatWarning) {
    warnings.push(`Không dùng thông tin này để chốt lịch trình. ${formatCaveatVerificationInstruction(caveatOnlyKnowledge)}`);
  }
  const appendedWarning = `\n\nCảnh báo cần kiểm tra\n${warnings.join(" ")}`;
  return { content: `${content.trimEnd()}${appendedWarning}`, appendedWarning, replacedUnsafeContent: false };
}

function hasSettledItineraryRecommendation(content: string) {
  return /\b(?:nên|hãy|cần)\s+(?:đi|chọn|chốt|đặt|ưu tiên|theo)\b|(?:lịch trình|kế hoạch).{0,60}(?:đã chốt|nên chốt|chắc chắn)/i.test(content.normalize("NFC"));
}

function formatCaveatVerificationInstruction(items: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>["knowledge"]) {
  return `Hãy xác minh ${items.map(getVerificationTarget).join("; ")} trước khi đi, hành động hoặc đặt dịch vụ.`;
}

function getVerificationTarget(item: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>["knowledge"][number]) {
  const title = item.title.replace(/\s+/g, " ").trim();
  const condition = item.conditions[0]?.replace(/\s+/g, " ").trim();
  return condition ? `điều kiện "${condition}" của "${title}"` : `tình trạng hiện tại của "${title}"`;
}

function isFreshnessSensitiveWebTrigger(reason: string) {
  return reason === "freshness_sensitive_request" || reason === "approved_knowledge_may_be_stale";
}
