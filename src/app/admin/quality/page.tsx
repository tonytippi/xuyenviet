import Link from "next/link";

import { getPublicMvpQualityDashboard, qualityDashboardRangeValues, type QualityDashboardRecentResult } from "@/features/feedback/quality-dashboard";
import { publicMvpEvaluationPromptTypeValues, type PublicMvpEvaluationPromptType } from "@/db/schema";

export const dynamic = "force-dynamic";

type QualityPageProps = {
  searchParams: Promise<{
    promptType?: string;
    range?: string;
  }>;
};

const promptLabels: Record<PublicMvpEvaluationPromptType | "all", string> = {
  all: "Tất cả prompt",
  magic_moment_family_trip: "Magic-moment gia đình",
  sparse_data: "Câu hỏi thiếu dữ liệu",
  freshness_sensitive: "Cần kiểm chứng mới",
  service_activity: "Dịch vụ / hoạt động",
  route_logistics: "Logistics cung đường",
};

const rangeLabels = {
  "7d": "7 ngày",
  "30d": "30 ngày",
  "90d": "90 ngày",
  all: "Tất cả",
};

const evaluationStatusLabels: Record<string, string> = {
  scored: "Đã chấm điểm",
  failed: "Thất bại",
  unscored: "Chưa chấm điểm",
};

const samplingOutcomeLabels: Record<string, string> = {
  passed: "Đạt",
  failed: "Không đạt",
  pending: "Đang chờ",
  unselected: "Chưa được chọn",
};

const cohortStateLabels: Record<string, string> = {
  active: "Đang hoạt động",
  escalated: "Đã chuyển cấp",
  suppressed: "Đã tạm dừng",
};

const safeActionLabels: Record<string, string> = {
  suppress_or_escalate: "Tạm dừng hoặc chuyển cấp",
  verify_before_use: "Xác minh trước khi sử dụng",
  stricter_sampling: "Lấy mẫu chặt chẽ hơn",
};

const categoryLabels: Record<string, string> = {
  current_accommodation: "Lưu trú hiện hành",
  current_activity: "Hoạt động hiện hành",
  current_food: "Ẩm thực hiện hành",
  current_place: "Địa điểm hiện hành",
  current_route: "Tuyến đường hiện hành",
  mixed_current_categories: "Nhiều nhóm hiện hành",
  missing_category: "Chưa xác định nhóm",
  community_observation: "Quan sát cộng đồng",
  independent_community_pattern: "Mẫu cộng đồng độc lập",
  conditional_high_risk_claim: "Tuyên bố rủi ro cao có điều kiện",
  conflict_exclusion: "Loại trừ thông tin mâu thuẫn",
  source_withdrawal: "Nguồn bị rút lại",
  web_fallback_unavailable: "Không có phương án dự phòng từ web",
};

const provenanceCategoryLabels: Record<string, string> = {
  trip_context: "Ngữ cảnh chuyến đi",
  chat_context: "Ngữ cảnh hội thoại",
  knowledge: "Tri thức",
  web: "Web",
  general: "Thông tin tổng quát",
};

function translateValue(labels: Record<string, string>, value: string) {
  return labels[value] ?? value;
}

export default async function QualityDashboardPage({ searchParams }: QualityPageProps) {
  const params = await searchParams;
  const dashboard = await getPublicMvpQualityDashboard({ promptType: params.promptType, range: params.range });

  if (!dashboard.success) {
    return (
      <section className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#9b2f29]">Không có quyền</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#17342c]">Không thể tải dashboard chất lượng.</h1>
      </section>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Chất lượng MVP công khai</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Bảng điều khiển tín hiệu chất lượng câu trả lời.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Tổng hợp phản hồi, kết quả đánh giá, chỉ số đối trọng, quyết định truy xuất và thông tin nguồn an toàn. Màn hình này không chạy lượt đánh giá mới, không hiển thị tài liệu nguồn thô hoặc dữ liệu tải từ nhà cung cấp.
      </p>

      <form className="mt-8 grid gap-4 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:grid-cols-[1fr_1fr_auto]" action="/admin/quality">
        <label className="grid gap-2 text-sm font-semibold text-[#17342c]">
          Loại câu hỏi đánh giá
          <select className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base" name="promptType" defaultValue={dashboard.filters.promptType}>
            <option value="all">Tất cả prompt</option>
            {publicMvpEvaluationPromptTypeValues.map((promptType) => (
              <option key={promptType} value={promptType}>{promptLabels[promptType]}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#17342c]">
          Khoảng thời gian
          <select className="min-h-12 rounded-2xl border border-[#d8c9ad] bg-[#fbf7ed] px-4 text-base" name="range" defaultValue={dashboard.filters.range}>
            {qualityDashboardRangeValues.map((range) => (
              <option key={range} value={range}>{rangeLabels[range]}</option>
            ))}
          </select>
        </label>
        <button className="min-h-12 self-end rounded-2xl bg-[#1f5f46] px-5 py-3 font-semibold text-white transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]" type="submit">
          Lọc dashboard
        </button>
      </form>

      <dl className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Phản hồi hữu ích" value={`${dashboard.feedback.useful}/${dashboard.feedback.total}`} detail={dashboard.feedback.usefulRate === null ? "Chưa có phản hồi" : `${Math.round(dashboard.feedback.usefulRate * 100)}% hữu ích`} />
        <MetricCard label="Đã chấm điểm" value={`${dashboard.evaluation.scoredResults}/${dashboard.evaluation.totalResults}`} detail={`Thất bại: ${dashboard.evaluation.failedResults}`} />
        <MetricCard label="Điểm trung bình" value={dashboard.evaluation.averageScore === null ? "N/A" : `${dashboard.evaluation.averageScore}/10`} detail="Trung bình trên mọi tiêu chí chấm điểm" />
        <MetricCard label="Mức sẵn sàng" value={dashboard.readiness.status === "ready" ? "Sẵn sàng" : "Chưa đủ"} detail={dashboard.readiness.missingSignals.length === 0 ? "Đủ bằng chứng hiện hành" : `${dashboard.readiness.missingSignals.length} khoảng trống cần xử lý`} />
      </dl>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Mức sẵn sàng của MVP công khai</h2>
          <ul className="mt-5 grid gap-3">
            {dashboard.readiness.checks.map((check) => (
              <li key={check.key} className="rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <p className="font-semibold text-[#17342c]">{check.label}</p>
                  <span className={check.passed ? "rounded-full bg-[#edf7ef] px-3 py-1 text-sm font-semibold text-[#1f5f46]" : "rounded-full bg-[#fff3df] px-3 py-1 text-sm font-semibold text-[#8c4f13]"}>
                    {check.passed ? "Đạt" : "Thiếu tín hiệu"}
                  </span>
                </div>
                <p className="mt-2 leading-7 text-[#4f625a]">{check.message}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 leading-7 text-[#4f625a]">
            Mức sẵn sàng chỉ dùng tập dữ liệu hiện hành và bằng chứng an toàn trên toàn hệ thống, không dùng số thẻ đã duyệt trong lịch sử hoặc kết quả bị che bởi bộ lọc.
          </p>
          <div className="mt-4 grid gap-3 text-sm leading-6 text-[#4f625a]">
            <p>Chẩn đoán độ phủ không đặt ngưỡng theo nhóm: thiếu loại thẻ: {dashboard.readiness.diagnostics.zeroCountTypes.join(", ") || "không có"}.</p>
            <p>Nhóm tuyến/địa điểm có số lượng 0: {dashboard.readiness.diagnostics.zeroCountRoutes.join(", ") || "không có"}.</p>
            <p>Khoảng trống chất lượng không ở mức nghiêm trọng trong lượt đánh giá chuẩn: {dashboard.readiness.diagnostics.evaluationQualityGaps}. Các khoảng trống này vẫn được đánh giá theo mức cơ sở, không phải điều kiện chặn riêng có mức dung sai bằng không.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold text-[#1f5f46] underline underline-offset-4">
            <Link href="/admin/knowledge/progress">Theo dõi độ phủ</Link>
            <Link href="/admin/knowledge/recommendations">Xử lý khuyến nghị</Link>
            <Link href="/admin/knowledge/intake">Nạp nguồn an toàn</Link>
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Chỉ số đối trọng</h2>
          <dl className="mt-5 grid gap-3">
            <MiniMetric label="Tuyên bố thiếu căn cứ" value={dashboard.evaluation.counterMetrics.unsupportedClaims} />
            <MiniMetric label="Thiếu lưu ý về độ bất định/tính cập nhật" value={dashboard.evaluation.counterMetrics.missingUncertainty} />
            <MiniMetric label="Không tốt hơn trợ lý AI phổ thông" value={dashboard.evaluation.counterMetrics.noBetterThanGeneric} />
          </dl>
          <h3 className="mt-6 text-lg font-semibold text-[#17342c]">Bình luận phản hồi gần đây</h3>
          {dashboard.feedback.recentComments.length === 0 ? (
            <p className="mt-3 leading-7 text-[#4f625a]">Chưa có bình luận về mức độ hữu ích trong bộ lọc này.</p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm text-[#4f625a]">
              {dashboard.feedback.recentComments.map((comment, index) => <li key={`${index}:${comment}`} className="rounded-2xl bg-[#fbf7ed] p-3">{comment}</li>)}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Tín hiệu chính sách AI-first</h2>
        <p className="mt-2 max-w-3xl leading-7 text-[#4f625a]">
          Kết quả đánh giá hiển thị tuân theo bộ lọc hiện tại. Mức sẵn sàng vẫn dùng bằng chứng an toàn trên toàn bộ tập dữ liệu: thiếu bằng chứng lấy mẫu, nhóm bị tạm dừng/chuyển cấp, xác minh đang chờ hoặc lỗi đánh giá nghiêm trọng đều chặn tuyên bố sẵn sàng.
        </p>
        <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Lỗi căn cứ bằng chứng" value={dashboard.policySignals.evaluation.evidenceGroundingFailures} />
          <MiniMetric label="Vi phạm lưu ý bắt buộc" value={dashboard.policySignals.evaluation.caveatViolations} />
          <MiniMetric label="Lấy mẫu đạt" value={dashboard.policySignals.sampling.sampledPassed} />
          <MiniMetric label="Lấy mẫu không đạt" value={dashboard.policySignals.sampling.sampledFailed} />
          <MiniMetric label="Cần xác minh hiện tại" value={dashboard.policySignals.sampling.verificationRequiredCurrentCards} />
          <MiniMetric label="Lấy mẫu đang chờ" value={dashboard.policySignals.sampling.pendingMembers} />
          <MiniMetric label="Nhóm chưa được chọn" value={dashboard.policySignals.sampling.unselectedMembers} />
        </dl>
        {dashboard.policySignals.evaluation.missingSignal ? <p className="mt-5 rounded-2xl bg-[#fff3df] p-4 font-semibold text-[#8c4f13]">Thiếu tín hiệu chính sách trong kết quả đánh giá đã lọc. Mức sẵn sàng vẫn chặn an toàn nếu bằng chứng đánh giá trên toàn bộ tập dữ liệu chưa hoàn chỉnh.</p> : null}
        {dashboard.policySignals.sampling.missingSignal ? <p className="mt-3 rounded-2xl bg-[#fff3df] p-4 font-semibold text-[#8c4f13]">Thiếu nhóm lấy mẫu có đủ dữ liệu. Mức sẵn sàng không suy diễn đạt/không đạt từ dữ liệu bị giới hạn.</p> : null}
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <PolicyList title="Nhóm lấy mẫu" emptyLabel="Chưa có nhóm lấy mẫu đủ dữ liệu." items={dashboard.policySignals.cohorts.map((cohort) => `${cohort.cohortKey} · ${translateValue(categoryLabels, cohort.category)} · ${translateValue(cohortStateLabels, cohort.state)} · ${translateValue(safeActionLabels, cohort.recommendedSafeAction)}`)} />
          <PolicyList title="Kết quả lấy mẫu thẻ" emptyLabel="Chưa có thành viên lấy mẫu trong phạm vi đọc an toàn." items={dashboard.policySignals.sampling.members.map((member) => `${translateValue(categoryLabels, member.category)} · ${translateValue(samplingOutcomeLabels, member.samplingOutcome)} · ${translateValue(safeActionLabels, member.recommendedSafeAction)}`)} />
          <PolicyList title="Lỗi chính sách trong đánh giá" emptyLabel="Không có lỗi chính sách trong phạm vi đánh giá hiện tại." items={dashboard.policySignals.evaluation.diagnostics.map((diagnostic) => `${promptLabels[diagnostic.promptType]} · mô hình ${diagnostic.modelVersion} · ${translateValue(categoryLabels, diagnostic.category)} · mức độ không xác định · ${translateValue(safeActionLabels, diagnostic.recommendedSafeAction)}`)} />
        </div>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Chẩn đoán gần đây</h2>
        {dashboard.recentResults.length === 0 ? (
          <p className="mt-4 leading-7 text-[#4f625a]">Chưa có kết quả đánh giá phù hợp bộ lọc. Bảng điều khiển giữ trạng thái thiếu tín hiệu thay vì kết luận sẵn sàng.</p>
        ) : (
          <div className="mt-5 grid gap-4">
            {dashboard.recentResults.map((result) => <RecentResultCard key={result.id} result={result} range={dashboard.filters.range} />)}
          </div>
        )}
      </section>

      <p className="mt-8 text-sm leading-6 text-[#4f625a]">
          Cần chạy đánh giá mới? Dùng quy trình Story 6.5 hoặc điểm vào vận hành hiện có; trang này chỉ đọc dữ liệu đã lưu.
      </p>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#d8c9ad] bg-white/75 p-4">
      <dt className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8c4f13]">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17342c]">{value}</dd>
      <dd className="mt-1 text-sm text-[#4f625a]">{detail}</dd>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#fbf7ed] p-4">
      <dt className="font-semibold text-[#17342c]">{label}</dt>
      <dd className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-[#4f625a]">{value}</dd>
    </div>
  );
}

function PolicyList({ title, emptyLabel, items }: { title: string; emptyLabel: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4">
      <h3 className="font-semibold text-[#17342c]">{title}</h3>
      {items.length === 0 ? <p className="mt-3 text-sm leading-6 text-[#4f625a]">{emptyLabel}</p> : <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#4f625a]">{items.map((item) => <li key={item} className="rounded-xl bg-white p-3">{item}</li>)}</ul>}
    </div>
  );
}

function RecentResultCard({ result, range }: { result: QualityDashboardRecentResult; range: string }) {
  return (
    <article className="rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8c4f13]">{promptLabels[result.promptType]} · {translateValue(evaluationStatusLabels, result.status)}</p>
          <h3 className="mt-1 text-xl font-semibold text-[#17342c]">{result.averageScore === null ? "Chưa có điểm" : `Điểm ${result.averageScore}/10`}</h3>
        </div>
        <Link className="text-sm font-semibold text-[#1f5f46] underline-offset-4 hover:underline" href={`/admin/quality?promptType=${result.promptType}&range=${range}`}>
          Lọc prompt này
        </Link>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <MiniMetric label="Tri thức đã chọn" value={result.retrieval.approvedKnowledgeSelectedCount ?? 0} />
        <MiniMetric label="Tìm kiếm web" value={result.retrieval.webSearchTriggered ? 1 : 0} />
        <MiniMetric label="Lý luận tổng quát" value={result.retrieval.generalReasoningUsed ? 1 : 0} />
        <MiniMetric label="Vấn đề" value={result.likelyIssues.length} />
      </dl>
      <p className="mt-4 text-sm leading-6 text-[#4f625a]">
        Nhóm nguồn: {Object.entries(result.provenance).filter(([, used]) => used).map(([category]) => translateValue(provenanceCategoryLabels, category)).join(", ") || "không có thông tin nguồn"}.
        Mã an toàn: trợ lý {result.safeLinks.assistantMessageId ?? "N/A"}, truy xuất {result.safeLinks.retrievalDecisionId ?? "N/A"}, nguồn gốc {result.safeLinks.provenanceId ?? "N/A"}.
      </p>
      {result.likelyIssues.length > 0 ? <p className="mt-2 text-sm font-semibold text-[#8c4f13]">Vấn đề có thể có: {result.likelyIssues.join(", ")}</p> : null}
    </article>
  );
}
