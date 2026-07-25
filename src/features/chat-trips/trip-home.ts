import "server-only";

import type {
  TripPlanAnchorRole,
  TripPlanItemKind,
  TripPlanItemState,
  TripPlanItemType,
} from "@/db/schema";
import {
  tripHomeFocusKindLabels,
  tripHomeFocusNextActions,
  tripPlanAnchorRoleLabels,
  tripPlanItemKindLabels,
  tripPlanItemStateLabels,
  tripPlanItemTypeLabels,
} from "@/features/chat-trips/trip-home-labels";

export {
  tripHomeFocusKindLabels,
  tripHomeFocusNextActions,
  tripPlanAnchorRoleLabels,
  tripPlanItemKindLabels,
  tripPlanItemStateLabels,
  tripPlanItemTypeLabels,
};
export type { TripHomeFocusKind } from "@/features/chat-trips/trip-home-labels";

export type TripPlanItemProjection = {
  id: string;
  kind: TripPlanItemKind;
  anchorRole: TripPlanAnchorRole | null;
  type: TripPlanItemType | null;
  state: TripPlanItemState;
  label: string;
  notes?: string | null;
  plannedAt: Date | null;
  ordinal: number;
  parentItemId: string | null;
  backupTargetItemId?: string | null;
  transportOriginLabel: string | null;
  transportDestinationLabel: string | null;
  accommodationPlaceAreaLabel: string | null;
  createdAt: Date;
};

export type PendingProposalFocusInput = {
  id: string;
  expiresAt?: Date | null;
  createdAt: Date;
};

export type TripHomeFocus =
  | { kind: "pending-proposal-with-expiry"; proposalId: string; reason: string; sortKey: string }
  | { kind: "pending-proposal"; proposalId: string; reason: string; sortKey: string }
  | { kind: "confirmed-item-gap"; itemId: string; reason: string; sortKey: string }
  | { kind: "next-leg"; itemId: string; reason: string; sortKey: string }
  | { kind: "preparation"; reason: string; sortKey: string };

export type TripHomeFocusInput = {
  items: TripPlanItemProjection[];
  pendingProposals?: PendingProposalFocusInput[];
  now: Date;
};

const preparationFocus: TripHomeFocus = {
  kind: "preparation",
  reason: "Chuẩn bị cho chuyến đi",
  sortKey: `5|`,
};

const validKinds = new Set<TripPlanItemKind>(["anchor", "leg", "activity"]);
const validTypes = new Set<TripPlanItemType>(["transport", "visit", "food", "rest", "accommodation"]);
const validStates = new Set<TripPlanItemState>(["idea", "planned", "confirmed", "backup"]);
const validAnchorRoles = new Set<TripPlanAnchorRole>(["origin", "destination", "region", "required_stop", "accommodation"]);

function isValidItem(item: TripPlanItemProjection): boolean {
  if (!item || typeof item.id !== "string" || !item.id) return false;
  if (!validKinds.has(item.kind)) return false;
  if (!validStates.has(item.state)) return false;
  if (item.kind === "anchor") {
    if (!item.anchorRole || !validAnchorRoles.has(item.anchorRole) || item.type) return false;
  } else {
    if (!item.type || !validTypes.has(item.type) || item.anchorRole) return false;
  }
  if (!Number.isInteger(item.ordinal) || item.ordinal < 0) return false;
  if (!(item.createdAt instanceof Date) || Number.isNaN(item.createdAt.getTime())) return false;
  return true;
}

function isUnexpiredProposal(proposal: PendingProposalFocusInput, now: Date): boolean {
  if (!proposal || typeof proposal.id !== "string" || !proposal.id) return false;
  if (!(proposal.createdAt instanceof Date) || Number.isNaN(proposal.createdAt.getTime())) return false;
  if (!proposal.expiresAt) return true;
  if (!(proposal.expiresAt instanceof Date) || Number.isNaN(proposal.expiresAt.getTime())) return false;
  return proposal.expiresAt.getTime() > now.getTime();
}

function pad(value: number): string {
  // Negative-safe zero-padded numeric sort key segment. Date.getTime() can be
  // large; pad to 16 digits so ascending lexical order matches numeric order.
  if (value < 0) return `-${String(-value).padStart(16, "0")}`;
  return String(value).padStart(16, "0");
}

function idKey(id: string): string {
  // Stable tie-breaker that does not depend on insertion order. UUID-style ids
  // sort deterministically by their hex characters.
  return id;
}

function compareByOrdinalThenId(a: { ordinal: number; id: string }, b: { ordinal: number; id: string }): number {
  const diff = a.ordinal - b.ordinal;
  if (diff !== 0) return diff;
  if (idKey(a.id) < idKey(b.id)) return -1;
  if (idKey(a.id) > idKey(b.id)) return 1;
  return 0;
}

export function findPendingProposalWithExpiry(
  proposals: PendingProposalFocusInput[],
  now: Date,
): PendingProposalFocusInput | null {
  const candidates = proposals.filter((proposal) => proposal.expiresAt && isUnexpiredProposal(proposal, now));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const aExpiry = a.expiresAt!.getTime();
    const bExpiry = b.expiresAt!.getTime();
    if (aExpiry !== bExpiry) return aExpiry - bExpiry;
    return idKey(a.id) < idKey(b.id) ? -1 : idKey(a.id) > idKey(b.id) ? 1 : 0;
  });
  return candidates[0];
}

export function findPendingProposalWithoutExpiry(
  proposals: PendingProposalFocusInput[],
  now: Date,
): PendingProposalFocusInput | null {
  const candidates = proposals.filter((proposal) => !proposal.expiresAt && isUnexpiredProposal(proposal, now));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const aCreated = a.createdAt.getTime();
    const bCreated = b.createdAt.getTime();
    if (aCreated !== bCreated) return aCreated - bCreated;
    return idKey(a.id) < idKey(b.id) ? -1 : idKey(a.id) > idKey(b.id) ? 1 : 0;
  });
  return candidates[0];
}

export function findConfirmedItemGap(items: TripPlanItemProjection[]): TripPlanItemProjection | null {
  const valid = items.filter(isValidItem).filter((item) => item.state === "confirmed");
  const gaps = valid.filter((item) => {
    if (item.type === "transport") {
      return item.plannedAt === null || item.transportOriginLabel === null || item.transportDestinationLabel === null;
    }
    if (item.type === "accommodation") {
      return item.plannedAt === null || item.accommodationPlaceAreaLabel === null;
    }
    return false;
  });
  if (gaps.length === 0) return null;
  // AD-29: null plannedAt sorts earliest so the most underspecified gap surfaces first.
  gaps.sort((a, b) => {
    const aTime = a.plannedAt === null ? -1 : a.plannedAt.getTime();
    const bTime = b.plannedAt === null ? -1 : b.plannedAt.getTime();
    if (aTime !== bTime) return aTime - bTime;
    const aCreated = a.createdAt.getTime();
    const bCreated = b.createdAt.getTime();
    if (aCreated !== bCreated) return aCreated - bCreated;
    return idKey(a.id) < idKey(b.id) ? -1 : idKey(a.id) > idKey(b.id) ? 1 : 0;
  });
  return gaps[0];
}

export function findNextFutureLeg(items: TripPlanItemProjection[], now: Date): TripPlanItemProjection | null {
  const nowMs = now.getTime();
  const valid = items.filter(isValidItem).filter((item) => {
    if (item.state !== "planned" && item.state !== "confirmed") return false;
    if (item.plannedAt === null) return false;
    return item.plannedAt.getTime() > nowMs;
  });
  if (valid.length === 0) return null;
  valid.sort((a, b) => {
    const aTime = a.plannedAt!.getTime();
    const bTime = b.plannedAt!.getTime();
    if (aTime !== bTime) return aTime - bTime;
    const aCreated = a.createdAt.getTime();
    const bCreated = b.createdAt.getTime();
    if (aCreated !== bCreated) return aCreated - bCreated;
    return idKey(a.id) < idKey(b.id) ? -1 : idKey(a.id) > idKey(b.id) ? 1 : 0;
  });
  return valid[0];
}

function formatReasonForGap(item: TripPlanItemProjection): string {
  if (item.type === "transport") {
    if (item.plannedAt === null && item.transportOriginLabel === null && item.transportDestinationLabel === null) {
      return "Chuyến xe đã chốt còn thiếu ngày, điểm đi và điểm đến.";
    }
    if (item.plannedAt === null) return "Chuyến xe đã chốt còn thiếu ngày giờ.";
    if (item.transportOriginLabel === null) return "Chuyến xe đã chốt còn thiếu điểm đi.";
    return "Chuyến xe đã chốt còn thiếu điểm đến.";
  }
  if (item.plannedAt === null && item.accommodationPlaceAreaLabel === null) {
    return "Lưu trú đã chốt còn thiếu ngày và khu vực.";
  }
  if (item.plannedAt === null) return "Lưu trú đã chốt còn thiếu ngày giờ.";
  return "Lưu trú đã chốt còn thiếu khu vực.";
}

function formatReasonForNextLeg(item: TripPlanItemProjection): string {
  if (item.type === "transport") return "Chặng xe tiếp theo trong kế hoạch.";
  if (item.type === "accommodation") return "Lưu trú tiếp theo trong kế hoạch.";
  if (item.type === "visit") return "Điểm tham quan tiếp theo trong kế hoạch.";
  if (item.type === "food") return "Bữa ăn tiếp theo trong kế hoạch.";
  return "Hoạt động tiếp theo trong kế hoạch.";
}

export function computeTripHomeFocus(input: TripHomeFocusInput): TripHomeFocus {
  const items = input.items.filter(isValidItem);
  const proposals = input.pendingProposals ?? [];
  const now = input.now;

  const withExpiry = findPendingProposalWithExpiry(proposals, now);
  if (withExpiry) {
    return {
      kind: "pending-proposal-with-expiry",
      proposalId: withExpiry.id,
      reason: "Có đề xuất đang chờ xem xét, sắp hết hạn.",
      sortKey: `1|${pad(withExpiry.expiresAt!.getTime())}|${idKey(withExpiry.id)}`,
    };
  }

  const withoutExpiry = findPendingProposalWithoutExpiry(proposals, now);
  if (withoutExpiry) {
    return {
      kind: "pending-proposal",
      proposalId: withoutExpiry.id,
      reason: "Có đề xuất đang chờ xem xét.",
      sortKey: `2|${pad(withoutExpiry.createdAt.getTime())}|${idKey(withoutExpiry.id)}`,
    };
  }

  const gap = findConfirmedItemGap(items);
  if (gap) {
    return {
      kind: "confirmed-item-gap",
      itemId: gap.id,
      reason: formatReasonForGap(gap),
      sortKey: `3|${pad(gap.plannedAt === null ? -1 : gap.plannedAt.getTime())}|${pad(gap.createdAt.getTime())}|${idKey(gap.id)}`,
    };
  }

  const nextLeg = findNextFutureLeg(items, now);
  if (nextLeg) {
    return {
      kind: "next-leg",
      itemId: nextLeg.id,
      reason: formatReasonForNextLeg(nextLeg),
      sortKey: `4|${pad(nextLeg.plannedAt!.getTime())}|${pad(nextLeg.createdAt.getTime())}|${idKey(nextLeg.id)}`,
    };
  }

   return preparationFocus;
 }

export type TimelineEntry = {
  id: string;
  kind: TripPlanItemKind;
  anchorRole: TripPlanAnchorRole | null;
  type: TripPlanItemType | null;
  state: TripPlanItemState;
  stateLabel: string;
  typeLabel: string;
  label: string;
  plannedAt: Date | null;
  timeContext: string | null;
  placeContext: string | null;
  notesPreview: string | null;
  parentItemId: string | null;
  ordinal: number;
  depth: number;
};

export type TimelineGroup = {
  dateDivider: string | null;
  legId: string | null;
  entries: TimelineEntry[];
};

function formatDateDivider(date: Date): string {
  // Use a stable, locale-independent YYYY-MM-DD divider so grouping is deterministic.
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeContext(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes} UTC`;
}

function buildPlaceContext(item: TripPlanItemProjection): string | null {
  if (item.type === "transport") {
    const parts = [item.transportOriginLabel, item.transportDestinationLabel].filter(Boolean) as string[];
    if (parts.length === 0) return null;
    return parts.join(" → ");
  }
  if (item.type === "accommodation") {
    return item.accommodationPlaceAreaLabel;
  }
  return null;
}

function buildNotesPreview(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  if (!trimmed) return null;
  // Bounded single-line preview; never expose raw notes beyond a short snippet.
  const singleLine = trimmed.replace(/\s+/g, " ");
  if (singleLine.length <= 80) return singleLine;
  return `${singleLine.slice(0, 77).trimEnd()}…`;
}

function toTimelineEntry(item: TripPlanItemProjection, depth: number): TimelineEntry {
  const typeLabel = item.type ? tripPlanItemTypeLabels[item.type] : tripPlanItemKindLabels[item.kind];
  return {
    id: item.id,
    kind: item.kind,
    anchorRole: item.anchorRole,
    type: item.type,
    state: item.state,
    stateLabel: tripPlanItemStateLabels[item.state],
    typeLabel,
    label: item.label,
    plannedAt: item.plannedAt,
    timeContext: item.plannedAt ? formatTimeContext(item.plannedAt) : null,
    placeContext: buildPlaceContext(item),
    notesPreview: buildNotesPreview(item.notes),
    parentItemId: item.parentItemId,
    ordinal: item.ordinal,
    depth,
  };
}

export function buildTimelineGroups(items: TripPlanItemProjection[]): TimelineGroup[] {
  const valid = items.filter(isValidItem);
  // Roots: anchors and legs (parentItemId null). Children: activities under a leg.
  const roots = valid
    .filter((item) => item.parentItemId === null)
    .sort(compareByOrdinalThenId);
  const childrenByParent = new Map<string, TripPlanItemProjection[]>();
  for (const item of valid) {
    if (item.parentItemId === null) continue;
    const list = childrenByParent.get(item.parentItemId) ?? [];
    list.push(item);
    childrenByParent.set(item.parentItemId, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort(compareByOrdinalThenId);
  }

  const groups: TimelineGroup[] = [];
  let lastDivider: string | null = null;

  for (const root of roots) {
    const rootDate = root.plannedAt;
    const divider = rootDate ? formatDateDivider(rootDate) : null;
    if (divider !== lastDivider) {
      lastDivider = divider;
    }
    const legId = root.kind === "leg" ? root.id : null;
    const entries: TimelineEntry[] = [toTimelineEntry(root, 0)];
    const children = childrenByParent.get(root.id) ?? [];
    for (const child of children) {
      entries.push(toTimelineEntry(child, 1));
    }
    groups.push({ dateDivider: divider, legId, entries });
  }

  return groups;
}

export type ConstraintsProjection = {
  adultCount: number | null;
  childCount: number | null;
  childrenSummary: { ageRange: string | null; comfortTags: string[]; preferenceTags: string[] }[];
  vehicleType: "car" | "motorcycle" | "ev" | null;
  evChargingNeed: "none" | "preferred" | "required" | null;
  drivingToleranceHours: number | null;
  budgetCurrency: "VND" | null;
  budgetMinVnd: number | null;
  budgetMaxVnd: number | null;
  preferenceTags: string[];
  avoidItems: { category: "place" | "activity"; label: string }[];
};

type ConstraintsRow = {
  adultCount: number | null;
  childCount: number | null;
  children: unknown;
  vehicleType: string | null;
  evChargingNeed: string | null;
  drivingToleranceHours: number | null;
  budgetCurrency: string | null;
  budgetMinVnd: number | null;
  budgetMaxVnd: number | null;
  preferenceTags: unknown;
  avoidItems: unknown;
};

const comfortTagLabels: Record<string, string> = {
  car_seat: "Ghế ngồi ô tô",
  stroller: "Xe đẩy",
  nap_breaks: "Nghỉ ngủ",
  short_drive_blocks: "Chia chặng ngắn",
  quiet_time: "Thời gian yên tĩnh",
};

const preferenceTagLabels: Record<string, string> = {
  animals: "Động vật",
  beach: "Biển",
  culture: "Văn hoá",
  food: "Ẩm thực",
  nature: "Thiên nhiên",
  outdoor: "Ngoài trời",
  playground: "Sân chơi",
};

const tripPreferenceTagLabels: Record<string, string> = {
  beach: "Biển",
  culture: "Văn hoá",
  family_friendly: "Thích hợp gia đình",
  food: "Ẩm thực",
  nature: "Thiên nhiên",
  quiet: "Yên tĩnh",
  road_trip: "Chuyến đường dài",
  scenic_route: "Tuyến đường đẹp",
};

function isChildSummary(value: unknown): value is { ageMin: number; ageMax: number; comfortTags: string[]; preferenceTags: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const child = value as { ageMin?: unknown; ageMax?: unknown; comfortTags?: unknown; preferenceTags?: unknown };
  return (
    Number.isInteger(child.ageMin) &&
    Number.isInteger(child.ageMax) &&
    (child.ageMin as number) >= 0 &&
    (child.ageMax as number) <= 17 &&
    (child.ageMin as number) <= (child.ageMax as number) &&
    Array.isArray(child.comfortTags) &&
    child.comfortTags.every((tag) => typeof tag === "string") &&
    Array.isArray(child.preferenceTags) &&
    child.preferenceTags.every((tag) => typeof tag === "string")
  );
}

function isAvoidItem(value: unknown): value is { category: "place" | "activity"; label: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as { category?: unknown; label?: unknown };
  return (item.category === "place" || item.category === "activity") && typeof item.label === "string" && item.label.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function translateChild(child: { ageMin: number; ageMax: number; comfortTags: string[]; preferenceTags: string[] }): { ageRange: string | null; comfortTags: string[]; preferenceTags: string[] } {
  const ageRange = child.ageMin === child.ageMax ? `${child.ageMin} tuổi` : `${child.ageMin}-${child.ageMax} tuổi`;
  return {
    ageRange,
    comfortTags: child.comfortTags.map((tag) => comfortTagLabels[tag] ?? tag).filter(Boolean),
    preferenceTags: child.preferenceTags.map((tag) => preferenceTagLabels[tag] ?? tag).filter(Boolean),
  };
}

export function buildConstraintsSummary(row: ConstraintsRow | null): ConstraintsProjection | null {
  if (!row) return null;
  // Project only traveler-safe fields. Never expose raw JSONB blobs or child identity.
  const childrenRaw = Array.isArray(row.children) ? row.children.filter(isChildSummary) : [];
  const avoidRaw = Array.isArray(row.avoidItems) ? row.avoidItems.filter(isAvoidItem) : [];
  const preferenceTagsRaw = isStringArray(row.preferenceTags) ? row.preferenceTags : [];

  const vehicleType = row.vehicleType === "car" || row.vehicleType === "motorcycle" || row.vehicleType === "ev" ? row.vehicleType : null;
  const evChargingNeed = row.evChargingNeed === "none" || row.evChargingNeed === "preferred" || row.evChargingNeed === "required" ? row.evChargingNeed : null;
  const budgetCurrency = row.budgetCurrency === "VND" ? "VND" : null;

  return {
    adultCount: Number.isInteger(row.adultCount) ? row.adultCount : null,
    childCount: Number.isInteger(row.childCount) ? row.childCount : null,
    childrenSummary: childrenRaw.map(translateChild),
    vehicleType,
    evChargingNeed,
    drivingToleranceHours: Number.isInteger(row.drivingToleranceHours) ? row.drivingToleranceHours : null,
    budgetCurrency,
    budgetMinVnd: Number.isInteger(row.budgetMinVnd) ? row.budgetMinVnd : null,
    budgetMaxVnd: Number.isInteger(row.budgetMaxVnd) ? row.budgetMaxVnd : null,
    preferenceTags: preferenceTagsRaw.map((tag) => tripPreferenceTagLabels[tag] ?? tag).filter(Boolean),
    avoidItems: avoidRaw.map((item) => ({ category: item.category, label: item.label.trim() })),
  };
}

export type TripWorkspaceReadModel = {
  focus: TripHomeFocus;
  timelineGroups: TimelineGroup[];
  constraints: ConstraintsProjection | null;
};

export function buildTripWorkspaceReadModel(input: TripHomeFocusInput): TripWorkspaceReadModel {
  const items = input.items.filter(isValidItem);
  return {
    focus: computeTripHomeFocus(input),
    timelineGroups: buildTimelineGroups(items),
    constraints: null,
  };
}

export function buildTripWorkspaceReadModelWithConstraints(
  input: TripHomeFocusInput,
  constraintsRow: ConstraintsRow | null,
): TripWorkspaceReadModel {
  const items = input.items.filter(isValidItem);
  return {
    focus: computeTripHomeFocus(input),
    timelineGroups: buildTimelineGroups(items),
    constraints: buildConstraintsSummary(constraintsRow),
  };
}
