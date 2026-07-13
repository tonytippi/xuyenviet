import Link from "next/link";

import { submitKnowledgeSeedUrlBatchForm } from "@/features/knowledge/actions";
import { listRecentKnowledgeSeedBatches } from "@/features/knowledge/batch-intake";
import { listKnowledgeUrlSources } from "@/features/knowledge/sources";

type KnowledgeIntakePageProps = {
  searchParams: Promise<{
    error?: string;
    batchDuplicate?: string;
    batchError?: string;
    batchFailed?: string;
    batchId?: string;
    batchPending?: string;
    batchTotal?: string;
    success?: string;
    sourceId?: string;
  }>;
};

export default async function KnowledgeIntakePage({ searchParams }: KnowledgeIntakePageProps) {
  const params = await searchParams;
  const [sources, recentBatches] = await Promise.all([listKnowledgeUrlSources(), listRecentKnowledgeSeedBatches()]);

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">Nạp nguồn tri thức</p>
      <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        Quản lý các URL nguồn đã nhập.
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f625a]">
        Admin/operator chỉ cần dán URL nguồn. Hệ thống lưu danh sách URL để các bước đọc, capture và xử lý tri thức chạy sau.
      </p>

      {params.error || params.batchError ? (
        <p className="mt-6 rounded-2xl border border-[#d99a93] bg-[#fff0ee] px-4 py-3 font-semibold text-[#9b2f29]" role="alert">
          {params.error ?? params.batchError}
        </p>
      ) : null}
      {params.batchId ? (
        <div className="mt-6 rounded-2xl border border-[#8fb59f] bg-[#edf7ef] px-4 py-3 font-semibold text-[#1f5f46]" role="status">
          <p>
            Đã thêm {params.batchPending ?? 0} URL. {params.batchFailed ?? 0} lỗi, {params.batchDuplicate ?? 0} trùng trong {params.batchTotal ?? 0} dòng.
          </p>
        </div>
      ) : null}

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5 sm:p-6">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Thêm URL nguồn</h2>
        <p className="mt-3 max-w-2xl leading-7 text-[#4f625a]">Dán một hoặc nhiều URL, mỗi dòng một URL. Không cần nhập nhãn, publisher, ngày, nội dung thô hoặc metadata ảnh.</p>
        <form action={submitKnowledgeSeedUrlBatchForm} className="mt-5 grid gap-4">
          <div className="grid gap-2">
            <label className="font-semibold text-[#17342c]" htmlFor="batchUrls">
              URL nguồn
            </label>
            <textarea
              className="min-h-44 rounded-2xl border border-[#d8c9ad] bg-white/80 px-4 py-3 text-base outline-none focus:ring-4 focus:ring-[#e5bd82]"
              id="batchUrls"
              name="batchUrls"
              placeholder="https://example.com/dia-diem-1&#10;https://example.com/dia-diem-2"
              required
            />
          </div>
          <button
            className="min-h-12 w-fit rounded-2xl bg-[#1f5f46] px-5 py-4 text-base font-semibold text-white shadow-[0_12px_30px_rgba(31,95,70,0.22)] transition hover:bg-[#194d39] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]"
            type="submit"
          >
            Thêm URL
          </button>
        </form>
      </section>

      <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-[#fbf7ed] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Tất cả URL đã nhập</h2>
            <p className="mt-2 text-sm leading-6 text-[#4f625a]">Hiển thị nguồn loại URL và Facebook, mới nhất trước.</p>
          </div>
          <p className="text-sm font-semibold text-[#1f5f46]">{sources.length} nguồn</p>
        </div>
        {sources.length > 0 ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-[#8c4f13]">
                <tr>
                  <th className="px-3 py-2 font-semibold">URL</th>
                  <th className="px-3 py-2 font-semibold">Tiêu đề</th>
                  <th className="px-3 py-2 font-semibold">Loại</th>
                  <th className="px-3 py-2 font-semibold">Capture</th>
                  <th className="px-3 py-2 font-semibold">Extract</th>
                  <th className="px-3 py-2 font-semibold">Ngày thêm</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id} className="rounded-2xl bg-white/80 text-[#17342c]">
                    <td className="max-w-[42rem] break-all rounded-l-2xl px-3 py-3 font-semibold">
                      {getExternalUrl(source.canonicalUrl ?? source.url) ? (
                        <a className="text-[#1f5f46] underline underline-offset-4" href={getExternalUrl(source.canonicalUrl ?? source.url) ?? undefined} rel="noreferrer" target="_blank">
                          {formatDisplayUrl(source.canonicalUrl ?? source.url)}
                        </a>
                      ) : (
                        formatDisplayUrl(null)
                      )}
                    </td>
                    <td className="px-3 py-3 font-semibold">{source.displayTitle}</td>
                    <td className="px-3 py-3 text-[#4f625a]">{source.kind === "facebook" ? "Facebook" : "URL"}</td>
                    <td className="px-3 py-3 text-[#4f625a]">
                      {source.facebookCaptureReviewId ? (
                        <Link className="font-semibold text-[#1f5f46] underline underline-offset-4" href={`/admin/knowledge/facebook-captures/${encodeURIComponent(source.facebookCaptureReviewId)}`}>
                          Đã capture
                        </Link>
                      ) : (
                        getCaptureLabel(source.kind)
                      )}
                    </td>
                    <td className="px-3 py-3 text-[#4f625a]">{getExtractionLabel(source.linkedKnowledgeCardCount, source.facebookCaptureStatus)}</td>
                    <td className="rounded-r-2xl px-3 py-3 text-[#4f625a]">{formatDate(source.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-[#d8c9ad] bg-white/70 px-4 py-5 text-[#4f625a]">Chưa có URL nguồn nào. Dán URL ở form bên trên để bắt đầu.</p>
        )}
      </section>

      {recentBatches.length > 0 ? (
        <section className="mt-8 rounded-[1.5rem] border border-[#d8c9ad] bg-white/70 p-5 sm:p-6">
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[#17342c]">Lần thêm gần đây</h2>
          <div className="mt-4 grid gap-4">
            {recentBatches.map((batch) => (
              <article key={batch.id} className="rounded-2xl border border-[#e2d3ba] bg-[#fbf7ed] p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-[#17342c]">Lần thêm URL</p>
                    <p className="mt-1 text-xs text-[#4f625a]">{batch.id}</p>
                  </div>
                  <p className="text-sm font-semibold text-[#1f5f46]">
                    Pending {batch.counts.pending} · Review {batch.counts.needs_review} · Approved {batch.counts.approved} · Lỗi/trùng {batch.counts.failed + batch.counts.duplicate + batch.counts.rejected}
                  </p>
                </div>
                <div className="mt-3 grid gap-2">
                  {batch.items.map((item) => (
                    <div key={item.id} className="rounded-xl border border-[#e2d3ba] bg-white/70 p-3 text-sm">
                      <p className="break-all font-semibold text-[#17342c]">
                        Dòng {item.lineNumber}: {item.canonicalUrl ?? item.submittedUrl}
                      </p>
                      <p className="mt-1 uppercase tracking-[0.12em] text-[#8c4f13]">{item.status}</p>
                      {item.errorSummary ? <p className="mt-1 text-[#9b2f29]">{item.errorSummary}</p> : null}
                      {item.sourceId ? <p className="mt-1 text-xs text-[#4f625a]">Source: {item.sourceId}</p> : null}
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function formatDisplayUrl(value: string | null) {
  if (!value) {
    return "URL không có sẵn";
  }

  try {
    const url = new URL(value);
    for (const key of Array.from(url.searchParams.keys())) {
      if (isSensitiveQueryParam(key)) {
        url.searchParams.set(key, "[ẩn]");
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function getExternalUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(formatDisplayUrl(value)).toString();
  } catch {
    return null;
  }
}

function isSensitiveQueryParam(key: string) {
  const normalized = key.toLowerCase();
  return normalized.includes("token") || normalized.includes("secret") || normalized === "code" || normalized === "key" || normalized === "signature" || normalized === "password";
}

function getCaptureLabel(kind: string) {
  return kind === "facebook" ? "Chưa capture" : "Không áp dụng";
}

function getExtractionLabel(linkedKnowledgeCardCount: number, facebookCaptureStatus: string | null) {
  if (linkedKnowledgeCardCount > 0 || facebookCaptureStatus === "extracted" || facebookCaptureStatus === "extracted_approved") {
    return "Đã extract";
  }

  return "Chưa extract";
}
