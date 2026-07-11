import "server-only";

import type { assembleContextPrioritySourceBundle } from "@/features/retrieval/source-bundle";

export function ensureAiAskFreshnessWarning(content: string, sourceBundle: Awaited<ReturnType<typeof assembleContextPrioritySourceBundle>>) {
  const warningRequired = sourceBundle.retrievalDecision.freshnessRequired || sourceBundle.web.some((source) => isFreshnessSensitiveWebTrigger(source.triggerReason));

  if (!warningRequired) {
    return { content, appendedWarning: "" };
  }

  const normalizedContent = content.normalize("NFC");
  const warningHeading = /cảnh báo cần kiểm tra/i.exec(normalizedContent);
  const warningBody = warningHeading ? normalizedContent.slice(warningHeading.index + warningHeading[0].length) : "";
  const hasActionableWarning = Boolean(warningHeading) && /(kiểm tra|xác minh|nguồn chính thức|nhà cung cấp)/i.test(warningBody);

  if (hasActionableWarning) {
    return { content, appendedWarning: "" };
  }

  const appendedWarning = "\n\nCảnh báo cần kiểm tra\nThông tin về giá, lịch, tình trạng còn chỗ, đường sá, giờ mở cửa, thời tiết, dịch vụ hoặc khuyến mãi có thể thay đổi. Hãy kiểm tra lại với nguồn chính thức hoặc nhà cung cấp trước khi đi, hành động hoặc đặt dịch vụ.";
  return { content: `${content.trimEnd()}${appendedWarning}`, appendedWarning };
}

function isFreshnessSensitiveWebTrigger(reason: string) {
  return reason === "freshness_sensitive_request" || reason === "approved_knowledge_may_be_stale";
}
