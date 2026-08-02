import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

const readSource = (path: string) => readFileSync(path, "utf8");

describe("admin operator guide", () => {
  test("exposes the Vietnamese guide hub through protected admin navigation", () => {
    const layout = readSource("src/app/admin/layout.tsx");
    const guide = readSource("src/app/admin/guides/page.tsx");

    expect(layout).toContain('href: "/admin/guides"');
    expect(layout).toContain('label: "Hướng dẫn"');
    expect(guide).toContain('href: "/admin/guides/data-flow"');
    expect(guide).toContain("truy xuất và phần ngữ cảnh đưa vào prompt");
    expect(guide).toContain('href: "/admin/guides/data-states"');
    expect(guide).toContain('href: "/admin/guides/operating-routine"');
  });

  test("documents the critical distinction between approval, publication, evidence, and AI retrieval", () => {
    const guide = readSource("src/app/admin/guides/page.tsx");
    const states = readSource("src/app/admin/guides/data-states/page.tsx");

    expect(guide).toContain("Phê duyệt không phải xác minh");
    expect(guide).toContain("Xuất bản không chắc đã được AI dùng");
    expect(states).toContain("Chờ evidence; chưa thể index / Index không active");
    expect(states).toContain("không coi thẻ là sẵn sàng truy xuất");
  });

  test("points operators to existing queues without promising unsupported manual actions", () => {
    const states = readSource("src/app/admin/guides/data-states/page.tsx");
    const routine = readSource("src/app/admin/guides/operating-routine/page.tsx");

    expect(states).toContain('href: "/admin/knowledge/intake"');
    expect(states).toContain('href: "/admin/knowledge/drafts"');
    expect(states).toContain('href: "/admin/knowledge/youtube-captures"');
    expect(states).toContain('href: "/admin/knowledge/approved"');
    expect(states).toContain('href: "/admin/knowledge/recommendations"');
    expect(routine).toContain('href: "/admin/knowledge/facebook-captures?status=failed"');
    expect(routine).toContain("Không tự sửa dữ liệu, bỏ qua xác minh");
  });

  test("keeps approval separate from active publication and links the distinct YouTube workflow", () => {
    const flow = readSource("src/app/admin/guides/data-flow/page.tsx");
    const states = readSource("src/app/admin/guides/data-states/page.tsx");

    expect(flow).toContain('href: "/admin/knowledge/youtube-captures"');
    expect(states).toContain("Vòng đời bản nháp đã hoàn tất, nhưng thẻ chưa chắc đang được xuất bản cho du khách.");
    expect(states).toContain("Đã xuất bản");
  });

  test("explains fact extraction, metadata, and the current bounded prompt retrieval behavior accurately", () => {
    const flow = readSource("src/app/admin/guides/data-flow/page.tsx");

    expect(flow).toContain("Fact và evidence");
    expect(flow).toContain("Thẻ tri thức");
    expect(flow).toContain("Truy xuất vào prompt");
    expect(flow).toContain("kho dữ liệu hiện chưa lưu vector embedding như một phần của thẻ");
  });
});
