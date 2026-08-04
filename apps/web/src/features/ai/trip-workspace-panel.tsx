import type { TripWorkspaceReadModel } from "@/features/chat-trips/types";
import { formatTripProjectLabel } from "@/features/chat-trips/labels";
import { tripChangeProposalLabels, tripHomeFocusKindLabels, tripHomeFocusNextActions, tripPlanAnchorRoleLabels } from "@/features/chat-trips/trip-home-labels";
import { TripProposalReviewCard, type TripProposalTerminalOutcome } from "@/features/ai/trip-proposal-review-card";
import {
  AccommodationIcon,
  AnchorIcon,
  BackupIcon,
  ConfirmedIcon,
  FoodIcon,
  IdeaIcon,
  PlannedIcon,
  RestIcon,
  TransportIcon,
  VisitIcon,
} from "@/components/ui/icons";

type TripWorkspaceHeader = {
  title: string;
  origin: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  travelers: string | null;
};

function getKindIcon(kind: string, type: string | null) {
  if (kind === "anchor") return AnchorIcon;
  if (type === "transport") return TransportIcon;
  if (type === "visit") return VisitIcon;
  if (type === "food") return FoodIcon;
  if (type === "rest") return RestIcon;
  if (type === "accommodation") return AccommodationIcon;
  return AnchorIcon;
}

function getStateIcon(state: string) {
  if (state === "idea") return IdeaIcon;
  if (state === "planned") return PlannedIcon;
  if (state === "confirmed") return ConfirmedIcon;
  if (state === "backup") return BackupIcon;
  return IdeaIcon;
}

function formatTripDates(startDate: string | null, endDate: string | null): string | null {
  if (!startDate && !endDate) return null;
  if (startDate && endDate) return `${startDate} → ${endDate}`;
  return startDate ?? endDate ?? null;
}

export type TripWorkspacePanelProps = {
  idPrefix: string;
  header: TripWorkspaceHeader;
  workspace: TripWorkspaceReadModel | null;
  // Story 7.5: presentational action callbacks + per-proposal pending/terminal
  // state. The composer owns the server-action calls; the panel only forwards
  // these to each TripProposalReviewCard.
  onApplyProposal?: (proposalId: string) => void;
  onDismissProposal?: (proposalId: string) => void;
  onRefreshProposal?: (proposalId: string) => void;
  proposalPending?: Record<string, { action: "apply" | "dismiss" } | undefined>;
  proposalTerminalOutcome?: Record<string, TripProposalTerminalOutcome | null>;
  // P9: plan history display variant. "inline" renders a collapsible <details>
  // section (desktop). "sheet-trigger" renders a button that opens a sheet
  // (mobile). The composer chooses the variant based on viewport.
  planHistoryVariant?: "inline" | "sheet-trigger";
  onOpenPlanHistory?: () => void;
};

export function TripWorkspacePanel({ idPrefix, header, workspace, onApplyProposal, onDismissProposal, onRefreshProposal, proposalPending, proposalTerminalOutcome, planHistoryVariant = "inline", onOpenPlanHistory }: TripWorkspacePanelProps) {
  if (!workspace) return null;

  const { focus, timelineGroups, constraints, pendingProposals, planHistory } = workspace;
  const projectLabel = formatTripProjectLabel(header);
  const datesText = formatTripDates(header.startDate, header.endDate);
  const travelersText = header.travelers;
  const subtitleParts = [datesText, travelersText].filter(Boolean);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : null;
  const focusLabel = tripHomeFocusKindLabels[focus.kind];
  const focusNextAction = tripHomeFocusNextActions[focus.kind];
  const now = new Date();
  const historyEntries = planHistory ?? [];

  return (
    <section aria-label="Không gian dự án chuyến đi" className="flex flex-col gap-4">
      <div aria-live="polite" className="sr-only">
        {`Tiêu điểm Trip Home: ${focusLabel}. ${focus.reason}`}
      </div>

      <div className="rounded-2xl border border-[#d8c9ad] bg-white/80 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8c4f13]">Dự án chuyến đi</p>
        <h2 className="mt-1 text-base font-semibold text-[#17342c]">{projectLabel}</h2>
        {subtitle ? <p className="mt-1 text-sm leading-6 text-[#6b7c75]">{subtitle}</p> : null}
      </div>

      <div className="rounded-2xl border border-[#8fb59f] bg-[#edf7f0] p-4" aria-label="Tiêu điểm Trip Home">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f5f46]">Tiêu điểm</p>
        <h3 className="mt-1 text-base font-semibold text-[#17342c]">{focusLabel}</h3>
        <p className="mt-1 text-sm leading-6 text-[#4f625a]">{focus.reason}</p>
        <p className="mt-2 text-sm font-semibold text-[#1f5f46]">{focusNextAction}</p>
        {focus.kind === "confirmed-item-gap" || focus.kind === "next-leg" ? (
          <a className="mt-2 inline-block text-sm font-semibold text-[#1f5f46] underline decoration-[#8fb59f] underline-offset-4" href={`#${idPrefix}plan-item-${focus.itemId}`}>Xem trong dòng thời gian</a>
        ) : null}
      </div>

      {pendingProposals.length > 0 ? (
        <div aria-label="Đề xuất thay đổi kế hoạch" className="flex flex-col gap-3">
          {pendingProposals.map((proposal) => {
            const pending = proposalPending?.[proposal.id];
            const terminalOutcome = proposalTerminalOutcome?.[proposal.id] ?? null;
            return (
              <TripProposalReviewCard
                key={proposal.id}
                idPrefix={idPrefix}
                proposal={proposal}
                now={now}
                onApply={onApplyProposal ? () => onApplyProposal(proposal.id) : undefined}
                onDismiss={onDismissProposal ? () => onDismissProposal(proposal.id) : undefined}
                onRefresh={onRefreshProposal ? () => onRefreshProposal(proposal.id) : undefined}
                isPending={Boolean(pending)}
                pendingAction={pending?.action}
                terminalOutcome={terminalOutcome}
              />
            );
          })}
        </div>
      ) : null}

      {historyEntries.length > 0 ? (
        planHistoryVariant === "sheet-trigger" ? (
          // P9: mobile renders a button that opens the plan history sheet
          // (managed by the composer). The sheet coordinates with the existing
          // workspace sheet so only one aria-modal dialog is open at a time.
          <div className="rounded-2xl border border-[#d8c9ad] bg-white/70 p-4">
            <button
              type="button"
              onClick={onOpenPlanHistory}
              className="min-h-11 w-full rounded-2xl border border-[#1f5f46] bg-[#1f5f46] px-4 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45"
            >
              <span className="text-xs font-bold uppercase tracking-[0.16em]">{tripChangeProposalLabels.planHistory}</span>
            </button>
          </div>
        ) : (
          // P9: desktop renders an inline collapsible section.
          <details className="rounded-2xl border border-[#d8c9ad] bg-white/70 p-4" aria-label={tripChangeProposalLabels.planHistory}>
            <summary className="min-h-11 cursor-pointer list-none text-sm font-semibold text-[#17342c] focus:outline-none focus:ring-4 focus:ring-[#8fb59f]/45">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f5f46]">{tripChangeProposalLabels.planHistory}</span>
            </summary>
            <ul aria-live="polite" className="mt-3 space-y-3">
              {historyEntries.map((entry, index) => (
                <li key={`${entry.proposalId ?? "history"}-${index}`} className="rounded-xl border border-[#eadfc8] bg-[#fffdf8] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#8fb59f] bg-[#edf7f0] px-2 py-0.5 text-xs font-semibold text-[#14532d]">{entry.operationLabel}</span>
                    <span className="text-xs font-semibold text-[#6b7c75]">{entry.actorLabel}</span>
                    <span className="text-xs text-[#6b7c75]">{entry.timestampLabel}</span>
                  </div>
                  {entry.affectedItemLabels.length > 0 ? (
                    <p className="mt-2 text-sm leading-6 text-[#4f625a]">{entry.affectedItemLabels.join(", ")}</p>
                  ) : null}
                  {entry.beforeAfter.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {entry.beforeAfter.map((impact, impactIndex) => (
                        <li key={impactIndex} className="text-xs leading-5 text-[#4f625a]">
                          <span className="font-semibold text-[#17342c]">{impact.operation}</span>
                          {impact.before || impact.after ? (
                            <span className="text-[#6b7c75]"> {impact.before ?? "—"} → {impact.after ?? "—"}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        )
      ) : null}

      <div className="rounded-2xl border border-[#d8c9ad] bg-white/70 p-4" aria-label="Dòng thời gian kế hoạch">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f5f46]">Dòng thời gian</p>
            <h3 className="mt-1 text-base font-semibold text-[#17342c]">Kế hoạch chuyến đi</h3>
          </div>
          <span aria-hidden="true" className="mt-1 h-2 w-12 rounded-full bg-[#1f5f46]/30" />
        </div>
        <p className="mt-2 text-sm leading-6 text-[#6b7c75]">Yêu cầu thay đổi kế hoạch trong cuộc trò chuyện</p>
        {timelineGroups.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[#d8c9ad] bg-[#fffdf8] p-3 text-sm leading-6 text-[#6b7c75]">Chưa có mục kế hoạch. Bắt đầu bằng một câu hỏi trong cuộc trò chuyện.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l-2 border-[#1f5f46]/25 pl-4">
            {timelineGroups.map((group, groupIndex) => (
              <li key={`group-${groupIndex}`}>
                {group.dateDivider ? (
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[#6b7c75]">{group.dateDivider}</p>
                ) : null}
                <ul className="space-y-2">
                  {group.entries.map((entry) => {
                    const KindIcon = getKindIcon(entry.kind, entry.type);
                    const StateIcon = getStateIcon(entry.state);
                    const anchorLabel = entry.kind === "anchor" && entry.anchorRole ? tripPlanAnchorRoleLabels[entry.anchorRole] : null;
                    return (
                      <li className="flex flex-col gap-1 rounded-xl border border-[#eadfc8] bg-[#fffdf8] p-3" id={`${idPrefix}plan-item-${entry.id}`} key={entry.id}>
                        <div className="flex items-start gap-2">
                          <span aria-hidden="true" className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[#e8f3ec] text-sm text-[#14532d]"><KindIcon /></span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-[#17342c]">{entry.label}</p>
                            {anchorLabel ? <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6b7c75]">{anchorLabel}</p> : null}
                            {entry.placeContext ? <p className="mt-0.5 text-xs leading-5 text-[#4f625a]">{entry.placeContext}</p> : null}
                            {entry.timeContext ? <p className="mt-0.5 text-xs leading-5 text-[#6b7c75]">{entry.timeContext}</p> : null}
                            {entry.notesPreview ? <p className="mt-0.5 text-xs leading-5 text-[#6b7c75]">{entry.notesPreview}</p> : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span aria-hidden="true" className="grid h-4 w-4 place-items-center text-xs text-[#1f5f46]"><StateIcon /></span>
                          <span className="rounded-full border border-[#8fb59f] bg-[#edf7f0] px-2 py-0.5 text-xs font-semibold text-[#14532d]">{entry.stateLabel}</span>
                          <span className="text-xs font-semibold text-[#6b7c75]">{entry.typeLabel}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      {constraints ? (
        <div className="rounded-2xl border border-[#d8c9ad] bg-white/70 p-4" aria-label="Tóm tắt ràng buộc chuyến đi">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1f5f46]">Ràng buộc chuyến đi</p>
          <dl className="mt-3 space-y-2 text-sm leading-6">
            {constraints.adultCount !== null || constraints.childCount !== null ? (
              <div className="flex flex-col gap-1 rounded-xl bg-[#fffdf8] p-2">
                <dt className="text-xs font-bold uppercase tracking-[0.08em] text-[#6b7c75]">Người đi</dt>
                <dd className="font-semibold text-[#17342c]">
                  {[
                    constraints.adultCount !== null && constraints.adultCount > 0 ? `${constraints.adultCount} người lớn` : null,
                    constraints.childCount !== null && constraints.childCount > 0 ? `${constraints.childCount} trẻ em` : null,
                  ].filter(Boolean).join(", ") || "Chưa rõ"}
                </dd>
                {constraints.childrenSummary.length > 0 ? (
                  <dd className="text-xs leading-5 text-[#4f625a]">
                    {constraints.childrenSummary.map((child, index) => (
                      <span key={index}>
                        {index > 0 ? "; " : ""}
                        {child.ageRange}
                        {child.comfortTags.length > 0 ? ` (cần: ${child.comfortTags.join(", ")})` : ""}
                        {child.preferenceTags.length > 0 ? ` (thích: ${child.preferenceTags.join(", ")})` : ""}
                      </span>
                    ))}
                  </dd>
                ) : null}
              </div>
            ) : null}
            {constraints.vehicleType ? (
              <div className="flex flex-col gap-1 rounded-xl bg-[#fffdf8] p-2">
                <dt className="text-xs font-bold uppercase tracking-[0.08em] text-[#6b7c75]">Phương tiện</dt>
                <dd className="font-semibold text-[#17342c]">
                  {constraints.vehicleType === "car" ? "Ô tô" : constraints.vehicleType === "motorcycle" ? "Xe máy" : "Xe điện"}
                  {constraints.evChargingNeed === "required" ? " (cần sạc)" : constraints.evChargingNeed === "preferred" ? " (ưu tiên sạc)" : ""}
                </dd>
                {constraints.drivingToleranceHours !== null ? (
                  <dd className="text-xs leading-5 text-[#4f625a]">Lái xe tối đa {constraints.drivingToleranceHours} giờ/chặng</dd>
                ) : null}
              </div>
            ) : null}
            {constraints.budgetCurrency === "VND" && constraints.budgetMinVnd !== null && constraints.budgetMaxVnd !== null ? (
              <div className="flex flex-col gap-1 rounded-xl bg-[#fffdf8] p-2">
                <dt className="text-xs font-bold uppercase tracking-[0.08em] text-[#6b7c75]">Ngân sách</dt>
                <dd className="font-semibold text-[#17342c]">{constraints.budgetMinVnd.toLocaleString("vi-VN")} - {constraints.budgetMaxVnd.toLocaleString("vi-VN")} VND</dd>
              </div>
            ) : null}
            {constraints.preferenceTags.length > 0 ? (
              <div className="flex flex-col gap-1 rounded-xl bg-[#fffdf8] p-2">
                <dt className="text-xs font-bold uppercase tracking-[0.08em] text-[#6b7c75]">Thích</dt>
                <dd className="font-semibold text-[#17342c]">{constraints.preferenceTags.join(", ")}</dd>
              </div>
            ) : null}
            {constraints.avoidItems.length > 0 ? (
              <div className="flex flex-col gap-1 rounded-xl bg-[#fffdf8] p-2">
                <dt className="text-xs font-bold uppercase tracking-[0.08em] text-[#6b7c75]">Tránh</dt>
                <dd className="font-semibold text-[#17342c]">{constraints.avoidItems.map((item) => item.label).join(", ")}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </section>
  );
}
