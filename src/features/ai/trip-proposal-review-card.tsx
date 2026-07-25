import type { PendingProposalAffectedItemRef, PendingProposalFocusInput } from "@/features/chat-trips/trip-home";
import { tripChangeProposalLabels } from "@/features/chat-trips/trip-home-labels";

// Story 7.5: the card stays presentational and data-free. The composer owns
// the server-action calls, pending state, and reconciliation. The card only
// invokes the optional onApply/onDismiss/onRefresh callbacks and renders the
// pending/terminal/refresh affordances from props.
// Q3: "transient-error" is a retryable outcome (transient DB/transport failure).
// Unlike the terminal outcomes and refresh-required, it does NOT hide the
// action row — the owner can tap Apply/Dismiss again to retry.
export type TripProposalTerminalOutcome = "applied" | "dismissed" | "expired" | "refresh-required" | "transient-error";

export type TripProposalReviewCardProps = {
  idPrefix: string;
  proposal: PendingProposalFocusInput;
  now: Date;
  onApply?: () => void;
  onDismiss?: () => void;
  onRefresh?: () => void;
  isPending?: boolean;
  pendingAction?: "apply" | "dismiss";
  terminalOutcome?: TripProposalTerminalOutcome | null;
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

function terminalOutcomeLabel(outcome: TripProposalTerminalOutcome): string {
  if (outcome === "applied") return tripChangeProposalLabels.applied;
  if (outcome === "dismissed") return tripChangeProposalLabels.dismissed;
  if (outcome === "expired") return tripChangeProposalLabels.expired;
  return tripChangeProposalLabels.refreshHint;
}

export function TripProposalReviewCard({ idPrefix, proposal, now, onApply, onDismiss, onRefresh, isPending, pendingAction, terminalOutcome }: TripProposalReviewCardProps) {
  const expired = isExpired(proposal, now);
  const expiryText = formatExpiry(proposal.expiresAt);
  const hasAlternatives = Boolean(proposal.hasAlternatives || (proposal.alternatives && proposal.alternatives.length > 0));
  const headingId = `${idPrefix}proposal-${proposal.id}-heading`;
  // Q3: "transient-error" is a retryable state, not a terminal one — the action
  // row must stay visible so the owner can retry. Only the true terminal
  // outcomes (applied/dismissed/expired) hide the action row.
  const isTerminal = Boolean(terminalOutcome) && terminalOutcome !== "transient-error";
  const isRefreshRequired = terminalOutcome === "refresh-required";
  // When a terminal outcome is set, the action row is hidden and the outcome
  // label is announced. The refresh-required outcome is NOT terminal in the
  // sense of "proposal is now terminal in the DB" — it means the apply/dismiss
  // attempt failed with refresh_required/expired/not_found and the card must
  // offer Làm mới đề xuất while preserving the proposal summary.
  const showActionRow = !isTerminal && !isRefreshRequired;
  const applyPending = isPending && pendingAction === "apply";
  const dismissPending = isPending && pendingAction === "dismiss";

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
        {expired || terminalOutcome === "expired" ? (
          <span className="rounded-full border border-[#D97706] bg-[#fff7e6] px-2 py-0.5 text-xs font-semibold text-[#92400e]">
            {tripChangeProposalLabels.expired}
          </span>
        ) : null}
        {isTerminal && terminalOutcome && terminalOutcome !== "expired" ? (
          <span className="rounded-full border border-[#1f5f46] bg-[#edf7f0] px-2 py-0.5 text-xs font-semibold text-[#14532d]">
            {terminalOutcomeLabel(terminalOutcome)}
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

      {isRefreshRequired ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs leading-5 text-[#92400e]">{tripChangeProposalLabels.refreshHint}</span>
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-11 rounded-2xl border border-[#1f5f46] bg-[#1f5f46] px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {tripChangeProposalLabels.refresh}
          </button>
        </div>
      ) : null}

      {showActionRow && !expired ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApply}
            disabled={isPending}
            className="min-h-11 rounded-2xl border border-[#1f5f46] bg-[#1f5f46] px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {applyPending ? tripChangeProposalLabels.applying : tripChangeProposalLabels.apply}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isPending}
            className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-white px-4 py-2 text-sm font-semibold text-[#17342c] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {dismissPending ? tripChangeProposalLabels.keepingPlan : tripChangeProposalLabels.keepPlan}
          </button>
          {hasAlternatives ? (
            <button
              type="button"
              className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-white px-4 py-2 text-sm font-semibold text-[#17342c] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45 disabled:cursor-not-allowed disabled:opacity-60"
              disabled
            >
              {tripChangeProposalLabels.viewAlternatives}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
