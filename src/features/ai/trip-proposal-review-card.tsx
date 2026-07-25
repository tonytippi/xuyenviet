import type { PendingProposalAffectedItemRef, PendingProposalFocusInput } from "@/features/chat-trips/trip-home";
import { tripChangeProposalLabels } from "@/features/chat-trips/trip-home-labels";

export type TripProposalReviewCardProps = {
  idPrefix: string;
  proposal: PendingProposalFocusInput;
  now: Date;
};

function isExpired(proposal: PendingProposalFocusInput, now: Date): boolean {
  if (!proposal.expiresAt) return false;
  if (!(proposal.expiresAt instanceof Date) || Number.isNaN(proposal.expiresAt.getTime())) return false;
  return proposal.expiresAt.getTime() <= now.getTime();
}

function formatExpiry(expiresAt: Date | null | undefined): string | null {
  if (!expiresAt || !(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) return null;
  const ictMs = expiresAt.getTime() + 7 * 60 * 60 * 1000;
  const ict = new Date(ictMs);
  const year = ict.getUTCFullYear();
  const month = ict.getUTCMonth() + 1;
  const day = ict.getUTCDate();
  const hours = ict.getUTCHours();
  const minutes = ict.getUTCMinutes();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} giờ Việt Nam`;
}

const changeLabels: Record<PendingProposalAffectedItemRef["change"], string> = {
  create: "Tạo",
  update: "Cập nhật",
  remove: "Xoá",
  reorder: "Sắp xếp lại",
  "change-state": "Đổi trạng thái",
  "upsert-constraints": "Cập nhật ràng buộc",
};

export function TripProposalReviewCard({ idPrefix, proposal, now }: TripProposalReviewCardProps) {
  const expired = isExpired(proposal, now);
  const expiryText = formatExpiry(proposal.expiresAt);
  const hasAlternatives = Boolean(proposal.hasAlternatives || (proposal.alternatives && proposal.alternatives.length > 0));
  const headingId = `${idPrefix}proposal-${proposal.id}-heading`;

  return (
    <section
      aria-labelledby={headingId}
      aria-live="polite"
      className="rounded-2xl border-2 border-[#D97706] bg-white p-4"
      data-story="7.4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#D97706]">{tripChangeProposalLabels.badge}</p>
          <h3 id={headingId} className="mt-1 text-base font-semibold text-[#17342c]" tabIndex={-1}>
            {tripChangeProposalLabels.badge}
          </h3>
        </div>
        {expired ? (
          <span className="rounded-full border border-[#D97706] bg-[#fff7e6] px-2 py-0.5 text-xs font-semibold text-[#92400e]">
            {tripChangeProposalLabels.expired}
          </span>
        ) : null}
      </div>

      {proposal.rationale ? (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#6b7c75]">{tripChangeProposalLabels.rationale}</p>
          <p className="mt-1 text-sm leading-6 text-[#17342c]">{proposal.rationale}</p>
        </div>
      ) : null}

      {proposal.beforeAfter && proposal.beforeAfter.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#6b7c75]">{tripChangeProposalLabels.beforeAfter}</p>
          <ul className="mt-1 space-y-1">
            {proposal.beforeAfter.map((entry, index) => (
              <li key={index} className="text-sm leading-6 text-[#4f625a]">
                <span className="font-semibold text-[#17342c]">{entry.operation}</span>
                {entry.before || entry.after ? (
                  <span className="text-[#6b7c75]"> {entry.before ?? "—"} → {entry.after ?? "—"}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {proposal.affectedItems && proposal.affectedItems.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#6b7c75]">{tripChangeProposalLabels.affectedItems}</p>
          <ul className="mt-1 space-y-1">
            {proposal.affectedItems.map((item, index) => (
              <li key={index} className="text-sm leading-6 text-[#4f625a]">
                <span className="font-semibold text-[#17342c]">{changeLabels[item.change]}</span>
                {item.label ? <span className="text-[#6b7c75]"> · {item.label}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {expiryText ? (
        <p className="mt-3 text-xs leading-5 text-[#6b7c75]">
          {expired ? tripChangeProposalLabels.expired : "Hết hạn"}: {expiryText}
        </p>
      ) : null}

      {hasAlternatives && proposal.alternatives && proposal.alternatives.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#6b7c75]">{tripChangeProposalLabels.alternatives}</p>
          <ul className="mt-1 space-y-1">
            {proposal.alternatives.map((alt, index) => (
              <li key={index} className="text-sm leading-6 text-[#4f625a]">{alt.summary}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-5 text-[#6b7c75]">{tripChangeProposalLabels.suggestionNote}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {expired ? (
          <span className="text-xs leading-5 text-[#92400e]" data-story="7.5">{tripChangeProposalLabels.refreshHint}</span>
        ) : (
          <>
            <button
              type="button"
              aria-disabled="true"
              data-story="7.5"
              className="min-h-11 rounded-2xl border border-[#1f5f46] bg-[#1f5f46] px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {tripChangeProposalLabels.apply}
            </button>
            <button
              type="button"
              aria-disabled="true"
              data-story="7.5"
              className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-white px-4 py-2 text-sm font-semibold text-[#17342c] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {tripChangeProposalLabels.keepPlan}
            </button>
            {hasAlternatives ? (
              <button
                type="button"
                aria-disabled="true"
                data-story="7.5"
                className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-white px-4 py-2 text-sm font-semibold text-[#17342c] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {tripChangeProposalLabels.viewAlternatives}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
