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
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Public MVP quality</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Dashboard tín hiệu chất lượng câu trả lời.</h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Tổng hợp feedback, eval, counter-metric, retrieval decision và provenance an toàn. Màn hình này không chạy eval mới và không hiển thị raw source material hay provider payload.
      </p>

      <form className="mt-8 grid gap-4 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:grid-cols-[1fr_1fr_auto]" action="/admin/quality">
        <label className="grid gap-2 text-sm font-semibold text-[#17342c]">
          Prompt type
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
        <MetricCard label="Feedback useful" value={`${dashboard.feedback.useful}/${dashboard.feedback.total}`} detail={dashboard.feedback.usefulRate === null ? "Chưa có feedback" : `${Math.round(dashboard.feedback.usefulRate * 100)}% useful`} />
        <MetricCard label="Eval scored" value={`${dashboard.evaluation.scoredResults}/${dashboard.evaluation.totalResults}`} detail={`Failed: ${dashboard.evaluation.failedResults}`} />
        <MetricCard label="Điểm trung bình" value={dashboard.evaluation.averageScore === null ? "N/A" : `${dashboard.evaluation.averageScore}/10`} detail="Trung bình mọi rubric score" />
        <MetricCard label="Readiness" value={dashboard.readiness.status === "ready" ? "Ready" : "Chưa đủ"} detail={dashboard.readiness.missingSignals.length === 0 ? "Đủ tín hiệu" : `${dashboard.readiness.missingSignals.length} tín hiệu thiếu`} />
      </dl>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Readiness public MVP</h2>
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
        </div>

        <div className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Counter metrics</h2>
          <dl className="mt-5 grid gap-3">
            <MiniMetric label="Unsupported claims" value={dashboard.evaluation.counterMetrics.unsupportedClaims} />
            <MiniMetric label="Thiếu uncertainty/freshness" value={dashboard.evaluation.counterMetrics.missingUncertainty} />
            <MiniMetric label="Không hơn ChatGPT chung" value={dashboard.evaluation.counterMetrics.noBetterThanGeneric} />
          </dl>
          <h3 className="mt-6 text-lg font-semibold text-[#17342c]">Comment feedback gần đây</h3>
          {dashboard.feedback.recentComments.length === 0 ? (
            <p className="mt-3 leading-7 text-[#4f625a]">Chưa có comment usefulness trong bộ lọc này.</p>
          ) : (
            <ul className="mt-3 grid gap-2 text-sm text-[#4f625a]">
              {dashboard.feedback.recentComments.map((comment, index) => <li key={`${index}:${comment}`} className="rounded-2xl bg-[#fbf7ed] p-3">{comment}</li>)}
            </ul>
          )}
        </div>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Recent diagnostics</h2>
        {dashboard.recentResults.length === 0 ? (
          <p className="mt-4 leading-7 text-[#4f625a]">Chưa có kết quả eval phù hợp bộ lọc. Dashboard giữ trạng thái thiếu tín hiệu thay vì kết luận sẵn sàng.</p>
        ) : (
          <div className="mt-5 grid gap-4">
            {dashboard.recentResults.map((result) => <RecentResultCard key={result.id} result={result} range={dashboard.filters.range} />)}
          </div>
        )}
      </section>

      <p className="mt-8 text-sm leading-6 text-[#4f625a]">
        Cần chạy eval mới? Dùng workflow Story 6.5 hoặc entrypoint vận hành hiện có; trang này chỉ đọc dữ liệu đã lưu.
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

function RecentResultCard({ result, range }: { result: QualityDashboardRecentResult; range: string }) {
  return (
    <article className="rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#8c4f13]">{promptLabels[result.promptType]} · {result.status}</p>
          <h3 className="mt-1 text-xl font-semibold text-[#17342c]">{result.averageScore === null ? "Chưa có score" : `Score ${result.averageScore}/10`}</h3>
        </div>
        <Link className="text-sm font-semibold text-[#1f5f46] underline-offset-4 hover:underline" href={`/admin/quality?promptType=${result.promptType}&range=${range}`}>
          Lọc prompt này
        </Link>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <MiniMetric label="Knowledge selected" value={result.retrieval.approvedKnowledgeSelectedCount ?? 0} />
        <MiniMetric label="Web search" value={result.retrieval.webSearchTriggered ? 1 : 0} />
        <MiniMetric label="General reasoning" value={result.retrieval.generalReasoningUsed ? 1 : 0} />
        <MiniMetric label="Issues" value={result.likelyIssues.length} />
      </dl>
      <p className="mt-4 text-sm leading-6 text-[#4f625a]">
        Source categories: {Object.entries(result.provenance).filter(([, used]) => used).map(([category]) => category).join(", ") || "không có provenance"}.
        Safe IDs: assistant {result.safeLinks.assistantMessageId ?? "N/A"}, retrieval {result.safeLinks.retrievalDecisionId ?? "N/A"}, provenance {result.safeLinks.provenanceId ?? "N/A"}.
      </p>
      {result.likelyIssues.length > 0 ? <p className="mt-2 text-sm font-semibold text-[#8c4f13]">Likely issues: {result.likelyIssues.join(", ")}</p> : null}
    </article>
  );
}
