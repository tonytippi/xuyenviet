import { existsSync, readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const readSource = (path: string) => readFileSync(path, "utf8");

describe("admin operator guide", () => {
  test("exposes the Vietnamese guide hub only through the deployed admin application", () => {
    const guide = readSource("apps/admin/app/guides/page.tsx");

    expect(existsSync("src/app/admin/layout.tsx")).toBe(false);
    expect(guide).toContain('href: "/guides/data-flow"');
    expect(guide).toContain("lần thu thập và xử lý nền đến thẻ tri thức có thể truy xuất");
    expect(guide).toContain('href: "/guides/data-states"');
    expect(guide).toContain('href: "/guides/operating-routine"');
  });

  test("documents the critical distinction between lifecycle, evidence, and AI retrieval", () => {
    const guide = readSource("apps/admin/app/guides/page.tsx");
    const states = readSource("apps/admin/app/guides/data-states/page.tsx");

    expect(guide).toContain("Nguồn đã xử lý chưa chắc đã dùng được");
    expect(guide).toContain("Chỉ thẻ đang hoạt động mới hỗ trợ câu trả lời");
    expect(states).toContain("Vòng đời thẻ và chỉ mục");
    expect(states).toContain("Chỉ mục cũ hoặc chưa có");
  });

  test("points operators to existing queues without promising unsupported manual actions", () => {
    const states = readSource("apps/admin/app/guides/data-states/page.tsx");
    const routine = readSource("apps/admin/app/guides/operating-routine/page.tsx");

    expect(states).toContain('href: "/knowledge/intake"');
    expect(states).toContain('href: "/knowledge/cards"');
    expect(states).toContain('href: "/knowledge/youtube-captures"');
    expect(states).toContain('href: "/knowledge/recommendations"');
    expect(routine).toContain('href: "/knowledge/facebook-captures"');
    expect(routine).toContain('href: "/"');
    expect(routine).toContain("Không tự sửa dữ liệu, bỏ qua quy trình an toàn");
  });

  test("keeps lifecycle separate from active retrieval and links the distinct YouTube workflow", () => {
    const flow = readSource("apps/admin/app/guides/data-flow/page.tsx");
    const states = readSource("apps/admin/app/guides/data-states/page.tsx");

    expect(flow).toContain('href: "/knowledge/youtube-captures"');
    expect(states).toContain("Thẻ chỉ được AI truy xuất khi bằng chứng/nguồn còn hợp lệ");
    expect(states).toContain("không cần xác minh thêm");
  });

  test("explains fact extraction, metadata, and the current bounded prompt retrieval behavior accurately", () => {
    const flow = readSource("apps/admin/app/guides/data-flow/page.tsx");

    expect(flow).toContain("Xử lý và ứng viên");
    expect(flow).toContain("Thẻ và bằng chứng");
    expect(flow).toContain("Dữ liệu dùng để trả lời");
    expect(flow).toContain("đã lập chỉ mục");
  });

  test("keeps the guide route inventory in apps/admin without root guide presentation routes", () => {
    expect(() => readSource("src/app/admin/guides/page.tsx")).toThrow();
    expect(() => readSource("src/app/admin/guides/data-flow/page.tsx")).toThrow();
    expect(() => readSource("src/app/admin/guides/data-states/page.tsx")).toThrow();
    expect(() => readSource("src/app/admin/guides/operating-routine/page.tsx")).toThrow();
  });
});
