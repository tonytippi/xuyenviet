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
      accept: { pending: expect.any(String), reconciling: "Đang kiểm tra kết quả thêm URL", submitted: "Đã thêm URL vào nguồn chờ xử lý. Bạn vẫn cần chạy YouTube Capture thủ công.", duplicate: "URL này đã có trong nguồn chờ xử lý hoặc đã được lưu trước đó.", failed: expect.any(String) },
    });
  });

  test("keeps local selection, ignores stale detail responses, gates and deduplicates pagination, and exposes Accept-only CSRF transport", async () => {
    const source = await readFile("apps/admin/app/knowledge/youtube-discovery-review/review.tsx", "utf8");
    expect(source).toContain('credentials: "include"');
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain('if (initial && queue.items[0] && selectedId.current === null && selectionAtStart === selectionGeneration.current) choose(queue.items[0], preserveStatus);');
    expect(source).toContain('onClick={() => choose(item)}');
    expect(source).toContain('const detailRequestId = useRef(0)');
    expect(source).toContain('const acceptRequestId = useRef(0)');
    expect(source).toContain('const queueGeneration = useRef(0)');
    expect(source).toContain('const selectionGeneration = useRef(0)');
    expect(source).toContain('recommendationId !== selectedId.current');
    expect(source).toContain('acceptRequestId.current += 1; selectionGeneration.current += 1; setIsAccepting(false);');
    expect(source).toContain('setDetail(null); setIsReconciling(item.actionAvailability === "reconciling"); void loadDetail(item.recommendationId, preserveStatus);');
    expect(source).toContain('const loadingMore = useRef(false)');
    expect(source).toContain('if (loadingMore.current || nextCursor !== cursor) return');
    expect(source).toContain('const generation = initial ? ++queueGeneration.current : queueGeneration.current;');
    expect(source).toContain('if (generation !== queueGeneration.current) return;');
    expect(source).toContain('selectedId.current === null && selectionAtStart === selectionGeneration.current');
    expect(source).toContain('async function load(nextCursor: string | null, initial = false, preserveStatus = false)');
    expect(source).toContain('void loadDetail(item.recommendationId, preserveStatus);');
    expect(source).toContain('if (!preserveStatus) setStatus(queue.items.length');
    expect(source).toContain('if (!preserveStatus) setStatus(`Đã chọn ${parsed.title ?? "ứng viên không có tiêu đề"}.`);');
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
    expect(source).toContain('method: "POST"');
    expect(source).toContain('body: "{}"');
    expect(source).toContain('x-xuyenviet-csrf');
    expect(source).toContain('actionAvailability === "reconciling"');
    expect(source).toContain('const [isReconciling, setIsReconciling] = useState(false)');
    expect(source).toContain('if (result.outcome === "reconciling") setIsReconciling(true);');
    expect(source).toContain('disabled={isAccepting || isReconciling || detail.actionAvailability === "reconciling"}');
    expect(source).toContain('youtubeDiscoveryReviewCopy.accept[result.outcome]');
    expect(source).toContain('await load(null, true, true);');
    expect(source).toContain('if (requestId !== acceptRequestId.current || recommendationId !== selectedId.current) return;');
    expect(source).toContain('if (requestId === acceptRequestId.current && recommendationId === selectedId.current) setIsAccepting(false);');
    expect(source).toMatch(/aria-label="Để sau, chưa khả dụng"[^>]*disabled/);
    expect(source).toMatch(/aria-label="Bỏ qua, chưa khả dụng"[^>]*disabled/);
    expect(source).not.toMatch(/defer\(|skip\(|youtube:capture|capture\//);
  });

  test("includes the Discovery review route in the admin shell navigation", async () => {
    const source = await readFile("apps/admin/app/admin-access-gate.tsx", "utf8");
    expect(source).toContain('{ href: "/knowledge/youtube-discovery-review", label: "Xem xét khám phá YouTube", eyebrow: "Discovery" }');
  });
});
