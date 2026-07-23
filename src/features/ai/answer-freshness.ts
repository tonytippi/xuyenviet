import "server-only";

import type { assembleContextPrioritySourceBundle } from "@/features/retrieval/source-bundle";

export function ensureAiAskFreshnessWarning(content: string, sourceBundle: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>) {
  const freshnessWarningRequired = sourceBundle.retrievalDecision.freshnessRequired || sourceBundle.web.some((source) => isFreshnessSensitiveWebTrigger(source.triggerReason));
  const caveatWarningRequired = sourceBundle.knowledge.some((item) => item.policy === "caveat_only" || item.knowledgeState === "uncertain" || item.verificationState === "required");

  if (!freshnessWarningRequired && !caveatWarningRequired) {
    return { content, appendedWarning: "" };
  }

  const normalizedContent = content.normalize("NFC");
  const warningHeading = /cảnh báo cần kiểm tra/i.exec(normalizedContent);
  const warningBody = warningHeading ? normalizedContent.slice(warningHeading.index + warningHeading[0].length) : "";
  const hasFreshnessWarning = Boolean(warningHeading) && /(kiểm tra|xác minh|nguồn chính thức|nhà cung cấp)/i.test(warningBody);
  const hasCaveatWarning = Boolean(warningHeading)
    && /không dùng.{0,80}(?:chốt lịch trình|quyết định lịch trình|khuyến nghị đã được xác nhận)/i.test(warningBody)
    && /xác minh.{0,120}(?:tình trạng|điều kiện|khả năng phục vụ)/i.test(warningBody);

  if ((!freshnessWarningRequired || hasFreshnessWarning) && (!caveatWarningRequired || hasCaveatWarning)) {
    return { content, appendedWarning: "" };
  }

  const warnings = [];
  if (freshnessWarningRequired && !hasFreshnessWarning) {
    warnings.push("Thông tin về giá, lịch, tình trạng còn chỗ, đường sá, giờ mở cửa, thời tiết, dịch vụ hoặc khuyến mãi có thể thay đổi. Hãy kiểm tra lại với nguồn chính thức hoặc nhà cung cấp trước khi đi, hành động hoặc đặt dịch vụ.");
  }
  if (caveatWarningRequired && !hasCaveatWarning) {
    warnings.push("Không dùng thông tin này để chốt lịch trình. Hãy xác minh lại tình trạng, điều kiện áp dụng và khả năng phục vụ trước khi đi, hành động hoặc đặt dịch vụ.");
  }
  const appendedWarning = `\n\nCảnh báo cần kiểm tra\n${warnings.join(" ")}`;
  return { content: `${content.trimEnd()}${appendedWarning}`, appendedWarning };
}

function isFreshnessSensitiveWebTrigger(reason: string) {
  return reason === "freshness_sensitive_request" || reason === "approved_knowledge_may_be_stale";
}
