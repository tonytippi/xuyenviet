import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const readSource = (path: string) => readFileSync(path, "utf8");

describe("admin operator guide", () => {
  test("exposes the Vietnamese guide hub only through the deployed admin application", () => {
    const guide = readSource("apps/admin/app/guides/page.tsx");

    expect(existsSync("src/app/admin/layout.tsx")).toBe(false);
    expect(guide).toContain('href: "/guides/data-flow"');
    expect(guide).toContain("truy xuất và phần ngữ cảnh đưa vào prompt");
    expect(guide).toContain('href: "/guides/data-states"');
    expect(guide).toContain('href: "/guides/operating-routine"');
  });

  test("documents the critical distinction between lifecycle, evidence, and AI retrieval", () => {
    const guide = readSource("apps/admin/app/guides/page.tsx");
    const states = readSource("apps/admin/app/guides/data-states/page.tsx");

    expect(guide).toContain("Phê duyệt không phải xác minh");
    expect(guide).toContain("Xuất bản không chắc đã được AI dùng");
    expect(states).toContain("Vòng đời thẻ và chỉ mục AI");
    expect(states).toContain("Chưa index / Index cần refresh");
  });

  test("points operators to existing queues without promising unsupported manual actions", () => {
    const states = readSource("apps/admin/app/guides/data-states/page.tsx");
    const routine = readSource("apps/admin/app/guides/operating-routine/page.tsx");

    expect(states).toContain('href: "/knowledge/intake"');
    expect(states).toContain('href: "/knowledge/cards"');
    expect(states).toContain('href: "/knowledge/youtube-captures"');
    expect(states).toContain('href: "/knowledge/recommendations"');
    expect(routine).toContain('href: "/knowledge/facebook-captures?status=failed"');
    expect(routine).toContain('href: "/"');
    expect(routine).toContain("Không tự sửa dữ liệu, bỏ qua xác minh");
  });

  test("keeps lifecycle separate from active retrieval and links the distinct YouTube workflow", () => {
    const flow = readSource("apps/admin/app/guides/data-flow/page.tsx");
    const states = readSource("apps/admin/app/guides/data-states/page.tsx");

    expect(flow).toContain('href: "/knowledge/youtube-captures"');
    expect(states).toContain("Thẻ có thể được dùng khi bằng chứng còn đủ điều kiện");
    expect(states).toContain("Có thể được Trợ lý AI truy xuất");
  });

  test("explains fact extraction, metadata, and the current bounded prompt retrieval behavior accurately", () => {
    const flow = readSource("apps/admin/app/guides/data-flow/page.tsx");

    expect(flow).toContain("Fact và evidence");
    expect(flow).toContain("Thẻ tri thức");
    expect(flow).toContain("Truy xuất vào prompt");
    expect(flow).toContain("kho dữ liệu hiện chưa lưu vector embedding như một phần của thẻ");
  });

  test("keeps the guide route inventory in apps/admin without root guide presentation routes", () => {
    expect(() => readSource("src/app/admin/guides/page.tsx")).toThrow();
    expect(() => readSource("src/app/admin/guides/data-flow/page.tsx")).toThrow();
    expect(() => readSource("src/app/admin/guides/data-states/page.tsx")).toThrow();
    expect(() => readSource("src/app/admin/guides/operating-routine/page.tsx")).toThrow();
  });
});
