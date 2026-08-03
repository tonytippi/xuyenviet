import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const readSource = (path: string) => readFileSync(path, "utf8");

describe("admin operator guide", () => {
  test("exposes the Vietnamese guide hub through the deployed admin navigation", () => {
    const layout = readSource("src/app/admin/layout.tsx");
    const guide = readSource("apps/admin/app/guides/page.tsx");

    expect(layout).toContain('href: "https://admin.xuyenviet.app/guides"');
    expect(layout).toContain('label: "Hướng dẫn"');
    expect(guide).toContain('href: "/guides/data-flow"');
    expect(guide).toContain("truy xuất và phần ngữ cảnh đưa vào prompt");
    expect(guide).toContain('href: "/guides/data-states"');
    expect(guide).toContain('href: "/guides/operating-routine"');
  });

  test("documents the critical distinction between approval, publication, evidence, and AI retrieval", () => {
    const guide = readSource("apps/admin/app/guides/page.tsx");
    const states = readSource("apps/admin/app/guides/data-states/page.tsx");

    expect(guide).toContain("Phê duyệt không phải xác minh");
    expect(guide).toContain("Xuất bản không chắc đã được AI dùng");
    expect(states).toContain("Chờ evidence; chưa thể index / Index không active");
    expect(states).toContain("không coi thẻ là sẵn sàng truy xuất");
  });

  test("points operators to existing queues without promising unsupported manual actions", () => {
    const states = readSource("apps/admin/app/guides/data-states/page.tsx");
    const routine = readSource("apps/admin/app/guides/operating-routine/page.tsx");

    expect(states).toContain('href: "/knowledge/intake"');
    expect(states).toContain('href: "/knowledge/drafts"');
    expect(states).toContain('href: "/knowledge/youtube-captures"');
    expect(states).toContain('href: "/knowledge/approved"');
    expect(states).toContain('href: "/knowledge/recommendations"');
    expect(routine).toContain('href: "/knowledge/facebook-captures?status=failed"');
    expect(routine).toContain('href: "/"');
    expect(routine).toContain("Không tự sửa dữ liệu, bỏ qua xác minh");
  });

  test("keeps approval separate from active publication and links the distinct YouTube workflow", () => {
    const flow = readSource("apps/admin/app/guides/data-flow/page.tsx");
    const states = readSource("apps/admin/app/guides/data-states/page.tsx");

    expect(flow).toContain('href: "/knowledge/youtube-captures"');
    expect(states).toContain("Vòng đời bản nháp đã hoàn tất, nhưng thẻ chưa chắc đang được xuất bản cho du khách.");
    expect(states).toContain("Đã xuất bản");
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
