import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import * as icons from "../apps/web/src/components/ui/icons";

const iconNames = [
  "AttachmentIcon",
  "SendIcon",
  "CloseIcon",
  "MenuIcon",
  "ChatIcon",
  "NewChatIcon",
  "ProjectIcon",
  "SourceIcon",
  "AccountIcon",
  "LoadingIcon",
] as const;

describe("traveler UI foundation", () => {
  test("loads Geist and keeps Vietnamese as the document language", () => {
    const source = readFileSync("apps/web/src/app/layout.tsx", "utf8");

    expect(source).toContain('import { Geist, Geist_Mono } from "next/font/google"');
    expect(source).toContain('subsets: ["latin", "latin-ext"]');
    expect(source).toContain('<html lang="vi">');
    expect(source).toContain("className={`${geist.variable} ${geistMono.variable}`}");
  });

  test("provides semantic palette, focus, and reduced-motion foundation tokens", () => {
    const source = readFileSync("apps/web/src/app/globals.css", "utf8");

    for (const token of ["--background", "--foreground", "--muted", "--focus-ring"]) {
      expect(source).toContain(token);
    }

    expect(source).toContain("background: var(--background)");
    expect(source).toContain(":focus-visible");
    expect(source).toContain("prefers-reduced-motion: reduce");
  });

  test("exports typed decorative SVG icons that preserve caller SVG props", () => {
    for (const name of iconNames) {
      const Icon = icons[name];
      const html = renderToStaticMarkup(createElement(Icon, { className: "traveler-icon", "aria-label": name, width: 24 }));

      expect(html).toContain("<svg");
      expect(html).toContain('class="traveler-icon"');
      expect(html).toContain(`aria-label="${name}"`);
      expect(html).toContain('width="24"');
    }

    expect(renderToStaticMarkup(createElement(icons.SendIcon))).toContain('aria-hidden="true"');
  });

  test("keeps answer, disclosure, feedback, and recovery surfaces practical and free of trust taxonomy", () => {
    const source = readFileSync("apps/web/src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain("Thông tin này có thể thay đổi. Kiểm tra lại trước khi đi hoặc đặt dịch vụ.");
    expect(source).toContain('const detailEntries = selectedEntity.quickFacts ?? [];');
    expect(source).toContain('item.sourceCategory !== "general"');
    expect(source).toContain("Chưa đúng ý");
    expect(source).toContain("motion-reduce:transition-none");
    expect(source).not.toContain('"Cảnh báo cần kiểm tra"');
    expect(source).not.toContain('"Nguồn và độ tin cậy"');
    expect(source).not.toContain('"Điều chưa chắc chắn"');
    expect(source).not.toContain("formatProvenanceSourceType");
    expect(source).not.toContain("getTrustLabels");
    expect(source).not.toContain("formatProvenanceUrl");
    expect(source).toContain("Một số chi tiết bổ sung chưa sẵn sàng. Bạn vẫn có thể dùng câu trả lời này và hỏi tiếp khi cần.");
    expect(source).toContain("Một số chi tiết bổ sung sẽ xuất hiện sau. Bạn vẫn có thể dùng câu trả lời này.");
  });

  test("keeps disclosure links safe and source URLs out of traveler quick facts", () => {
    const source = readFileSync("apps/web/src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain('const detailActionLabel = getSafeTravelerUrl(item.url) ? "Xem nguồn tham khảo" : "Cần kiểm tra gì?";');
    expect(source).toContain('const travelerUrl = getSafeTravelerUrl(item.url);');
    expect(source).toContain('Object.entries(detail).filter(([label]) => label !== "URL")');
    expect(source).toContain('href={travelerUrl}');
  });

  test("keeps stream failures, shell retries, and reduced-motion recovery controls bounded", () => {
    const composer = readFileSync("apps/web/src/features/ai/ai-ask-composer.tsx", "utf8");
    const shellLoader = readFileSync("apps/web/src/features/chat-trips/direct-shell-loader.tsx", "utf8");

    expect(composer).not.toContain("setStatus(`${result.errorMessage}");
    expect(composer).toContain('return { status: "answer-failed" };');
    expect(shellLoader).toContain("Thử mở lại");
    expect(shellLoader).toContain("motion-reduce:transition-none");
  });

  test("keeps feedback message-scoped, accessible, and clears negative-only comments on a useful rating", () => {
    const source = readFileSync("apps/web/src/features/ai/ai-ask-composer.tsx", "utf8");

    expect(source).toContain('onClick={() => onSubmit(messageId, "useful", null)}');
    expect(source).toContain('selectedRating === "not_useful"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("min-h-11");
    expect(source).toContain('min-h-11 min-w-11 cursor-pointer');
    expect(source).toContain("focus:ring-4");
  });

  test("keeps mobile conversation-sheet controls at the 44px target floor", () => {
    const source = readFileSync("apps/web/src/features/chat-trips/conversation-list.tsx", "utf8");

    expect(source).toContain('className="min-h-11 w-full rounded-lg');
    expect(source).toContain('className="absolute right-1 top-1/2 grid min-h-11 min-w-11');
  });

});
