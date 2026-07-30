"use client";

import { useState } from "react";

import { resolveKnowledgeRecommendationForm } from "@/features/knowledge/actions";

const actionLabels: Record<string, string> = {
  verify: "Xác nhận và xuất bản",
  edit: "Sửa fact",
  suppress: "Không xuất bản",
  resolve_relation: "Xác nhận quan hệ thẻ",
  accept_wording: "Chấp nhận cách diễn đạt",
  restore: "Khôi phục xuất bản",
  sampling_pass: "Mẫu đạt yêu cầu",
  sampling_fail: "Mẫu không đạt yêu cầu",
};

const samplingDispositionLabels: Record<string, string> = {
  confirmed: "Đã xác nhận",
  minor_issue: "Có lỗi nhỏ",
  insufficient_evidence: "Thiếu bằng chứng",
  stale_or_changed: "Thông tin đã cũ hoặc thay đổi",
  material_error: "Sai sót đáng kể",
  safety_risk: "Rủi ro an toàn",
};

type Props = {
  recommendationId: string;
  contentVersion: number;
  evidenceSetRevision: number;
  actions: string[];
  disabled: boolean;
};

export function RecommendationActionForm({ recommendationId, contentVersion, evidenceSetRevision, actions, disabled }: Props) {
  const [action, setAction] = useState(actions[0] ?? "");
  const isEdit = action === "edit";
  const isSampling = action === "sampling_pass" || action === "sampling_fail";

  return <form action={resolveKnowledgeRecommendationForm} className="mt-7 grid gap-4 rounded-2xl border border-[#d8c9ad] bg-white/75 p-5">
    <input name="recommendationId" type="hidden" value={recommendationId} />
    <input name="contentVersion" type="hidden" value={contentVersion} />
    <input name="evidenceSetRevision" type="hidden" value={evidenceSetRevision} />
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="font-semibold">Lệnh xử lý</legend>
      <div aria-label="Lệnh xử lý" className="grid gap-2 sm:grid-cols-3" role="radiogroup">
        {actions.map((value) => <label className={`min-h-12 cursor-pointer rounded-xl border px-4 py-3 text-sm font-semibold transition ${action === value ? "border-[#1f5f46] bg-[#edf7ef] text-[#17342c]" : "border-[#d8c9ad] bg-[#fbf7ed] text-[#4f625a] hover:border-[#8c4f13]"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`} key={value}>
          <input checked={action === value} className="sr-only" name="action" onChange={() => setAction(value)} type="radio" value={value} />
          {actionLabels[value] ?? value}
        </label>)}
      </div>
    </fieldset>
    {isEdit ? <label className="grid gap-2 font-semibold">Fact đã chỉnh sửa<textarea className="min-h-24 rounded-xl border border-[#d8c9ad] p-3" name="editSummary" placeholder="Chỉ giữ các thông tin được bằng chứng bên trên hỗ trợ." required /></label> : null}
    {isSampling ? <>
      <label className="grid gap-2 font-semibold">Kết quả lấy mẫu
        <select className="min-h-11 rounded-xl border border-[#d8c9ad] px-3" name="samplingDispositionReason" required>
          <option value="">Chọn kết quả bắt buộc</option>
          {Object.entries(samplingDispositionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="grid gap-2 font-semibold">Lý do bổ sung (tùy chọn, tối đa 500 ký tự)<textarea className="min-h-20 rounded-xl border border-[#d8c9ad] p-3" maxLength={500} name="samplingRationale" /></label>
      <label className="flex gap-2"><input name="highSeverity" type="checkbox" /> Lỗi lấy mẫu nghiêm trọng</label>
    </> : null}
    <button className="min-h-11 rounded-xl bg-[#1f5f46] px-4 font-semibold text-white disabled:opacity-50" disabled={disabled} type="submit">Lưu xử lý</button>
  </form>;
}
