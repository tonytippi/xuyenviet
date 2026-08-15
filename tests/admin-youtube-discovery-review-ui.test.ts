import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { youtubeDiscoveryReviewCopy } from "../apps/admin/app/knowledge/youtube-discovery-review/review-copy";

describe("admin YouTube Discovery review UI boundary", () => {
  test("maps every closed safe code to Vietnamese operator copy", () => {
    expect(youtubeDiscoveryReviewCopy).toEqual({
      recommendation: { skip: expect.any(String), defer: expect.any(String), consider: expect.any(String) },
      reason: { eligible_score_band: expect.any(String), below_defer_band: expect.any(String), between_defer_and_consider_band: expect.any(String), already_compatible: expect.any(String), canonical_mismatch: expect.any(String), not_current_run_enriched: expect.any(String) },
      queryReason: { coverage_gap: expect.any(String), freshness_risk: expect.any(String), unresolved_conflict: expect.any(String), anonymized_demand: expect.any(String), operator_request: expect.any(String) },
      factor: { relevance: expect.any(String), expected_value: expect.any(String), freshness_fit: expect.any(String) },
      penalty: { commercial_risk: expect.any(String), duplicate_risk: expect.any(String) },
      signal: { recent_discussion: expect.any(String), stale_or_changed_warning: expect.any(String), practical_question_demand: expect.any(String), creator_responsiveness: expect.any(String), commercial_risk: expect.any(String), contradictory_discussion: expect.any(String) },
      priorCaptureOutcome: { eligible: expect.any(String), already_compatible: expect.any(String), unavailable: expect.any(String) },
       languageFit: { vi: expect.any(String), likely_vi: expect.any(String) }, eligibilityReason: { eligible_vietnamese: expect.any(String) }, fallbackLanguageFit: { non_vi: expect.any(String), unknown: expect.any(String) }, fallbackReason: { foreign_fallback: expect.any(String) },
       accept: { pending: expect.any(String), reconciling: "Đang kiểm tra kết quả thêm URL", submitted: "URL đã được gửi vào hàng đợi nạp Knowledge. Việc này chưa xác nhận trạng thái xử lý tiếp theo.", duplicate: "URL này đã có trong hàng đợi nạp Knowledge hoặc đã được lưu trước đó. Việc này chưa xác nhận trạng thái xử lý tiếp theo.", failed: expect.any(String) }, defer: { pending: expect.any(String), deferred: expect.any(String), failed: expect.any(String) }, skip: { pending: expect.any(String), skipped: expect.any(String), failed: expect.any(String) },
    });
  });

  test("keeps local selection, ignores stale detail responses, gates and deduplicates pagination, and exposes fenced decision transport", async () => {
    const source = await readFile("apps/admin/app/knowledge/youtube-discovery-review/review.tsx", "utf8");
    expect(source).toContain('credentials: "include"');
    expect(source).toContain('cache: "no-store"');
    expect(source).toContain('if (initial && queue.items[0] && !requestedRecommendationId && selectedId.current === null && selectionAtStart === selectionGeneration.current) choose(queue.items[0], preserveStatus);');
    expect(source).toContain('onClick={() => choose(item)}');
    expect(source).toContain('const detailRequestId = useRef(0)');
    expect(source).toContain('const decisionRequestId = useRef(0)');
    expect(source).toContain('const focusQueueAfterDecision = useRef(false)');
    expect(source).toContain('const [queueFocusToken, setQueueFocusToken] = useState(0)');
    expect(source).toContain('const queueGeneration = useRef(0)');
    expect(source).toContain('const selectionGeneration = useRef(0)');
    expect(source).toContain('recommendationId !== selectedId.current');
    expect(source).toContain('decisionRequestId.current += 1; selectionGeneration.current += 1; setIsAccepting(false); setIsDeciding(false);');
    expect(source).toContain('setDetail(null); setIsReconciling(retainReconciliation || item.actionAvailability === "reconciling"); void loadDetail(item.recommendationId, preserveStatus);');
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
    expect(source).toContain('disabled={isLoadingMore || isAccepting || isDeciding || isReconciling}');
    expect(source).toContain('aria-pressed={selected === item.recommendationId}');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('lg:grid-cols-');
    expect(source).toContain('min-w-0');
    expect(source).toContain('Xem chi tiết đã chọn');
    expect(source).toContain('Quay lại hàng đợi');
    expect(source).toContain('detailHeading.current?.focus()');
    expect(source).toContain('if (focusAfterDecision.current) { focusAfterDecision.current = false; setIsReconciling(true); setNeedsDecisionRefresh(true); detailHeading.current?.focus(); }');
    expect(source).toContain('if (focusSelectedRowAfterReturn.current) { focusSelectedRowAfterReturn.current = false; selectedRow.current?.focus(); }');
    expect(source).toContain('method: "POST"');
    expect(source).toContain('body: "{}"');
    expect(source).toContain('x-xuyenviet-csrf');
    expect(source).toContain('actionAvailability === "reconciling"');
    expect(source).toContain('const [isReconciling, setIsReconciling] = useState(false)');
    expect(source).toContain('const [needsDecisionRefresh, setNeedsDecisionRefresh] = useState(false)');
    expect(source).toContain('if (result.outcome === "reconciling") setIsReconciling(true);');
    expect(source).toContain('let dispatched = false;');
    expect(source).toContain('dispatched = true;');
    expect(source).toContain('if (!dispatched) { setStatus(youtubeDiscoveryReviewCopy.accept.failed); return; }');
    expect(source).toContain('setIsReconciling(true); setNeedsDecisionRefresh(true); setStatus(youtubeDiscoveryReviewCopy.accept.reconciling);');
    expect(source).toContain('void refreshAfterDecision(recommendationId, requestId, true).catch(() => setStatus("Không thể làm mới trạng thái quyết định."));');
    expect(source).toContain('const actionsDisabled = isAccepting || isDeciding || isReconciling || detail?.actionAvailability === "reconciling"');
    expect(source).toContain('youtubeDiscoveryReviewCopy.accept[result.outcome]');
    expect(source).toContain('const queue = await load(null, true, true);');
    expect(source).toContain('async function terminalDecision(action: "defer" | "skip")');
    expect(source).toContain('action === "defer" ? parseAdminYoutubeDiscoveryDeferReviewResult(body)');
    expect(source).toContain('onClick={() => void terminalDecision("defer")}');
    expect(source).toContain('onClick={() => void terminalDecision("skip")}');
    expect(source).toContain('const actionsDisabled = isAccepting || isDeciding || isReconciling');
    expect(source).toContain('if (!queue || requestId !== decisionRequestId.current || recommendationId !== selectedId.current) return;');
    expect(source).toContain('selectedId.current = null; selectionGeneration.current += 1; setSelected(null); setDetail(null);');
    expect(source).toContain('if (focusQueueAfterDecision.current) { focusQueueAfterDecision.current = false; queueHeading.current?.focus(); }');
    expect(source).toContain('if (focusSelectedRowAfterDecision.current) { focusSelectedRowAfterDecision.current = false; selectedRow.current?.focus(); }');
    expect(source).toContain('}, [items, selected, showDetail, queueFocusToken]);');
    expect(source).toContain('if (queue.items.length === 0) { setIsReconciling(false); setNeedsDecisionRefresh(false); focusQueueAfterDecision.current = true; setShowDetail(false); setQueueFocusToken((current) => current + 1); return; }');
    expect(source).toContain('if (!retainReconciliation) { focusSelectedRowAfterDecision.current = true; setShowDetail(false); }');
    expect(source).toContain('choose(queue.items[0], true, retainReconciliation);');
    expect(source).toContain('published(item.publishedAt)');
    expect(source).toContain('setIsReconciling(true); setNeedsDecisionRefresh(true); setStatus("Đang làm mới trạng thái quyết định."); void refreshAfterDecision(recommendationId, requestId, true).catch(() => setStatus("Không thể làm mới trạng thái quyết định."));');
    expect(source).toContain('{needsDecisionRefresh ? <button className="mt-4 min-h-11 rounded border px-4 font-semibold" onClick={() => void retryDecisionRefresh()} type="button">Làm mới trạng thái quyết định</button> : null}');
    expect(source).toContain('</div></div> : <p className="mt-4 text-slate-600">Chọn một ứng viên để xem chi tiết.</p>}{needsDecisionRefresh ?');
    expect(source).toContain('disabled={isAccepting || isDeciding || isReconciling}');
    expect(source).not.toMatch(/youtube:capture|capture\//);
    expect(source).toContain('const requestedRecommendationId = validRecommendationId(searchParams.get("recommendationId"))');
    expect(source).toContain('if (initial && queue.items[0] && !requestedRecommendationId');
    expect(source).toContain('async function admitDeepLink(recommendationId: string)');
    expect(source).toContain('if (!response.ok || !parsed || requestId !== detailRequestId.current) throw new Error("unavailable");');
    expect(source).toContain('Ứng viên trong liên kết không còn khả dụng.');
    expect(source).toContain('/v1/admin/knowledge/youtube-discovery/browse?${params}');
    expect(source).toContain('setBrowseFilter(filter)');
    expect(source).toContain('Chỉ đọc. Các quyết định chỉ áp dụng');
    expect(source).not.toContain('browse/${encodeURIComponent');
    expect(source).toContain('useState<AdminYoutubeDiscoveryBrowseFilter>("consider")');
    expect(source).toContain('if (loadingBrowseMore.current || nextCursor !== browseCursor) return;');
    expect(source).toContain('++browseGeneration.current; loadingBrowseMore.current = false; setBrowseItems([]); setBrowseCursor(null);');
    expect(source).toContain('Nguồn ngoại ngữ bổ sung');
    expect(source).toContain('/v1/admin/knowledge/youtube-discovery/fallback');
    expect(source).toContain('không thuộc hàng đợi ưu tiên, xếp hạng hoặc hành động xem xét');
    expect(source).toContain('item.thumbnailUrl ? <img alt="" className="h-16 w-24 rounded object-cover"');
  });

  test("uses the main Discovery route for URL review and exposes Health", async () => {
    const [nav, page, review] = await Promise.all([
      readFile("apps/admin/app/admin-access-gate.tsx", "utf8"),
      readFile("apps/admin/app/knowledge/youtube-discovery/page.tsx", "utf8"),
      readFile("apps/admin/app/knowledge/youtube-discovery-review/review.tsx", "utf8"),
    ]);
    expect(nav).toContain('{ href: "/knowledge/youtube-discovery", label: "Youtube Discovery", eyebrow: "Discovery" }');
    expect(nav).not.toContain('Việc cần xử lý Discovery');
    expect(page).toContain('import { YoutubeDiscoveryReview } from "../youtube-discovery-review/review";');
    expect(review).toContain('>Youtube Discovery</h1>');
    expect(review).toContain('href="/knowledge/youtube-discovery/health">Sức khỏe Discovery</Link>');
    expect(review).toContain('returnUrl: `${window.location.origin}/knowledge/youtube-discovery`');
  });

  test("validates opaque Mission and Health action IDs before rendering them", async () => {
    const [mission, health] = await Promise.all([
      readFile("apps/admin/app/knowledge/youtube-discovery/mission/[actionId]/page.tsx", "utf8"),
      readFile("apps/admin/app/knowledge/youtube-discovery/health/[actionId]/page.tsx", "utf8"),
    ]);
    expect(mission).toContain('/^mission-[a-f0-9]{32}$/.test(actionId)');
    expect(mission).toContain("Nhu cầu trong liên kết không khả dụng.");
    expect(health).toContain('try { groupId = decodeURIComponent(actionId); } catch');
    expect(health).toContain('/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}:(provider_rate_limited|triage_schema_invalid|execution_terminal)$/.test(groupId)');
    expect(health).toContain("Sự cố trong liên kết không khả dụng.");
  });

  test("renders action queue copy from closed local codes without adapter labels", async () => {
    const source = await readFile("apps/admin/app/knowledge/youtube-discovery/queue.tsx", "utf8");
    expect(source).toContain('mission_no_enabled_query: "Chưa có truy vấn đang bật"');
    for (const reason of ["review_pending", "review_aged", "mission_no_progress", "mission_disabled", "mission_no_enabled_query", "provider_rate_limited", "triage_schema_invalid", "execution_persistent_failure", "knowledge_risk", "knowledge_relation"]) expect(source).toContain(reason);
    expect(source).toContain("{reasonCopy[item.reason]}");
    expect(source).not.toContain("item.label");
    expect(source).toContain('const [unavailable, setUnavailable] = useState(false)');
    expect(source).toContain('Chưa thể tải việc cần xử lý');
    expect(source).toContain('Hãy thử lại trước khi kết luận không còn việc cần xử lý.');
  });
});
