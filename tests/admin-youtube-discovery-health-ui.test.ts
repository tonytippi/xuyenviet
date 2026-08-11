import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("admin YouTube Discovery Health UI boundary", () => {
  test("uses typed safe Health responses and never renders route input", async () => {
    const [overview, detail] = await Promise.all([
      readFile("apps/admin/app/knowledge/youtube-discovery/health/health.tsx", "utf8"),
      readFile("apps/admin/app/knowledge/youtube-discovery/health/[actionId]/page.tsx", "utf8"),
    ]);
    expect(overview).toContain("parseAdminYoutubeDiscoveryHealthOverview");
    expect(overview).toContain('credentials: "include"');
    expect(overview).toContain("Tuổi để sau không khả dụng");
    expect(overview).toContain("Cảnh báo: lịch truy vấn đã quá nhịp.");
    expect(overview).toContain("Cảnh báo: dữ liệu sử dụng AI đã cũ.");
    expect(overview).toContain("Thiếu telemetry sử dụng AI trong 24 giờ qua.");
    expect(overview).toContain("Telemetry sử dụng AI chưa đầy đủ: thiếu số token.");
    expect(overview).toContain("Telemetry sử dụng AI chưa đầy đủ: thiếu chi phí.");
    expect(overview).toContain('usage.availability === "incomplete_usage"');
    expect(overview).toContain("Cập nhật lần cuối:");
    expect(overview).toContain('throughput.freshness === "unavailable"');
    expect(overview).toContain("Dữ liệu thông lượng chưa sẵn sàng.");
    expect(overview).toContain("Dữ liệu thông lượng có thể đã cũ.");
    expect(overview).toContain('health.querySchedule.enabled === false ? "Đang tắt"');
    expect(overview).toContain("Chính sách Discovery");
    expect(overview).toContain('enabled !== null');
    expect(overview).toContain('enabled ? "Đang bật" : "Đang tắt"');
    expect(overview).toContain("parseAdminYoutubeDiscoveryEnablementResult");
    expect(overview).toContain('youtube-discovery/enablement');
    expect(overview).toContain('/auth/csrf');
    expect(overview).toContain('"x-xuyenviet-csrf": csrfToken');
    expect(overview).toContain('Origin: window.location.origin');
    expect(overview).toContain('setHealth((current) => current ? { ...current, policy: { ...current.policy, enabled: result.enabled } } : current)');
    expect(overview).toContain('await load(true)');
    expect(overview).toContain("Trạng thái đã xác nhận được giữ nguyên");
    expect(overview).toContain('const [retryCommand, setRetryCommand] = useState<{ enabled: boolean } | null>(null)');
    expect(overview).toContain('setRetryCommand({ enabled });');
    expect(overview).toContain('if (await load(true)) setRetryCommand(null);');
    expect(overview).toContain('onClick={() => onChange(retryCommand.enabled, true)}');
    expect(overview).toContain('>Thử lại cập nhật Discovery</button>');
    expect(overview).toContain("Công việc khi Discovery tắt");
    expect(overview).toContain("Discovery đang tắt. Hệ thống sẽ không tìm hoặc triage video mới.");
    expect(overview).toContain("Nguồn Knowledge đang chờ xử lý và YouTube Capture thủ công không bị ảnh hưởng.");
    expect(overview).toContain("Đang dừng tác vụ");
    expect(overview).toContain("Đã hủy");
    expect(overview).toContain("Đã hoàn tất trước khi dừng");
    expect(overview).toContain('<Incidents incidents={health.incidents} />');
    expect(overview).toContain('incidents.length === 0');
    expect(overview).toContain("Không có sự cố cần xử lý.");
    expect(overview).toContain('href={`/knowledge/youtube-discovery/health/${encodeURIComponent(incident.actionId)}`}');
    expect(overview).toContain("min-h-11");
    expect(overview).toContain("Ưu tiên {incident.priority}. Ghi nhận:");
    const client = await readFile("apps/admin/app/knowledge/youtube-discovery/health/[actionId]/detail.tsx", "utf8");
    expect(client).toContain("parseAdminYoutubeDiscoveryHealthIncidentDetail");
    expect(client).toContain("Mã lần chạy:");
    expect(client).toContain("Trạng thái:");
    expect(client).toContain("Số lần thử lại:");
    expect(client).toContain("Danh mục:");
    expect(client).toContain("Giai đoạn:");
    expect(client).toContain("Pha vòng đời:");
    expect(client).toContain('value === "unavailable" ? "Không khả dụng"');
    expect(client).toContain("Thử lại lúc:");
    expect(client).not.toContain("providerPayload");
    expect(detail).toContain('/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}:(provider_rate_limited|triage_schema_invalid|execution_terminal)$/.test(actionId)');
    expect(detail).not.toContain("Mã tham chiếu: {actionId}");
  });
});
