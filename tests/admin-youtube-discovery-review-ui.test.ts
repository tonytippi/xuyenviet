import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { youtubeDiscoveryReviewCopy } from "../apps/admin/app/knowledge/youtube-discovery-review/review-copy";

describe("admin YouTube Discovery review UI boundary", () => {
  test("maps every closed safe code to Vietnamese operator copy", () => {
    expect(youtubeDiscoveryReviewCopy).toEqual({
      recommendation: { consider: expect.any(String) },
      reason: { eligible_score_band: expect.any(String) },
      queryReason: { coverage_gap: expect.any(String), freshness_risk: expect.any(String), unresolved_conflict: expect.any(String), anonymized_demand: expect.any(String), operator_request: expect.any(String) },
      factor: { relevance: expect.any(String), expected_value: expect.any(String), freshness_fit: expect.any(String) },
      penalty: { commercial_risk: expect.any(String), duplicate_risk: expect.any(String) },
      signal: { recent_discussion: expect.any(String), stale_or_changed_warning: expect.any(String), practical_question_demand: expect.any(String), creator_responsiveness: expect.any(String), commercial_risk: expect.any(String), contradictory_discussion: expect.any(String) },
      priorCaptureOutcome: { eligible: expect.any(String), already_compatible: expect.any(String), unavailable: expect.any(String) },
    });
  });

  test("keeps local selection, ignores stale detail responses, gates and deduplicates pagination, safe reads, and inert accessible previews", async () => {
    const source = await readFile("apps/admin/app/knowledge/youtube-discovery-review/review.tsx", "utf8");
    expect(source).toContain('credentials: "include"');
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain('if (initial && queue.items[0])');
    expect(source).toContain('if (initial && queue.items[0]) choose(queue.items[0]);');
    expect(source).toContain('onClick={() => choose(item)}');
    expect(source).toContain('const detailRequestId = useRef(0)');
    expect(source).toContain('recommendationId !== selectedId.current');
    expect(source).toContain('setDetail(null); void loadDetail(item.recommendationId);');
    expect(source).toContain('const loadingMore = useRef(false)');
    expect(source).toContain('if (loadingMore.current || nextCursor !== cursor) return');
    expect(source).toContain('filter((item) => !new Set(current.map(({ recommendationId }) => recommendationId)).has(item.recommendationId))');
    expect(source).toContain('disabled={isLoadingMore}');
    expect(source).toContain('aria-pressed={selected === item.recommendationId}');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('lg:grid-cols-');
    expect(source).toContain('min-w-0');
    expect(source).toContain('Xem chi tiết đã chọn');
    expect(source).toContain('Quay lại hàng đợi');
    expect(source).toContain('detailHeading.current?.focus()');
    expect(source).toContain('selectedRow.current?.focus()');
    expect(source).toMatch(/aria-label="Chấp nhận, chưa khả dụng"[^>]*disabled/);
    expect(source).toMatch(/aria-label="Để sau, chưa khả dụng"[^>]*disabled/);
    expect(source).toMatch(/aria-label="Bỏ qua, chưa khả dụng"[^>]*disabled/);
    expect(source).not.toMatch(/method:\s*["']POST|accept\(|defer\(|skip\(|youtube:capture|capture\//);
  });

  test("includes the Discovery review route in the admin shell navigation", async () => {
    const source = await readFile("apps/admin/app/admin-access-gate.tsx", "utf8");
    expect(source).toContain('{ href: "/knowledge/youtube-discovery-review", label: "Xem xét khám phá YouTube", eyebrow: "Discovery" }');
  });
});
