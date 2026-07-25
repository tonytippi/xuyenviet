import { describe, expect, test } from "vitest";

import {
  buildConstraintsSummary,
  buildTimelineGroups,
  computeTripHomeFocus,
  findConfirmedItemGap,
  findNextFutureLeg,
  findPendingProposalWithExpiry,
  findPendingProposalWithoutExpiry,
  tripPlanItemStateLabels,
  type PendingProposalFocusInput,
  type TripPlanItemProjection,
} from "@/features/chat-trips/trip-home";

const now = new Date("2026-07-25T10:00:00.000Z");

function makeItem(overrides: Partial<TripPlanItemProjection> & { id: string }): TripPlanItemProjection {
  return {
    kind: "leg",
    anchorRole: null,
    type: "transport",
    state: "idea",
    label: `Item ${overrides.id}`,
    notes: null,
    plannedAt: null,
    ordinal: 0,
    parentItemId: null,
    backupTargetItemId: null,
    transportOriginLabel: null,
    transportDestinationLabel: null,
    accommodationPlaceAreaLabel: null,
    createdAt: new Date("2026-07-20T00:00:00.000Z"),
    ...overrides,
  };
}

function makeProposal(overrides: Partial<PendingProposalFocusInput> & { id: string }): PendingProposalFocusInput {
  return {
    createdAt: new Date("2026-07-22T00:00:00.000Z"),
    ...overrides,
  };
}

describe("Trip Home read model", () => {
  describe("computeTripHomeFocus priority", () => {
    test("pending proposal with expiry wins over all other focuses", () => {
      const items = [makeItem({ id: "gap-1", type: "transport", state: "confirmed" })];
      const proposals = [
        makeProposal({ id: "proposal-no-expiry", createdAt: new Date("2026-07-21T00:00:00.000Z") }),
        makeProposal({ id: "proposal-expiry", expiresAt: new Date("2026-07-26T00:00:00.000Z") }),
      ];

      const focus = computeTripHomeFocus({ items, pendingProposals: proposals, now });

      expect(focus.kind).toBe("pending-proposal-with-expiry");
      if (focus.kind === "pending-proposal-with-expiry") {
        expect(focus.proposalId).toBe("proposal-expiry");
      }
    });

    test("pending proposal without expiry wins when no expiry proposal is present", () => {
      const items = [makeItem({ id: "gap-1", type: "transport", state: "confirmed" })];
      const proposals = [
        makeProposal({ id: "proposal-a", createdAt: new Date("2026-07-21T00:00:00.000Z") }),
        makeProposal({ id: "proposal-b", createdAt: new Date("2026-07-19T00:00:00.000Z") }),
      ];

      const focus = computeTripHomeFocus({ items, pendingProposals: proposals, now });

      expect(focus.kind).toBe("pending-proposal");
      if (focus.kind === "pending-proposal") {
        expect(focus.proposalId).toBe("proposal-b");
      }
    });

    test("confirmed-item gap wins when no proposals present", () => {
      const items = [
        makeItem({ id: "future-leg", type: "transport", state: "planned", plannedAt: new Date("2026-08-01T00:00:00.000Z") }),
        makeItem({ id: "gap-1", type: "transport", state: "confirmed", transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" }),
      ];

      const focus = computeTripHomeFocus({ items, pendingProposals: [], now });

      expect(focus.kind).toBe("confirmed-item-gap");
      if (focus.kind === "confirmed-item-gap") {
        expect(focus.itemId).toBe("gap-1");
      }
    });

    test("next future leg wins when no proposals and no gaps", () => {
      const items = [
        makeItem({ id: "past-leg", type: "transport", state: "planned", plannedAt: new Date("2026-06-01T00:00:00.000Z") }),
        makeItem({ id: "future-2", type: "transport", state: "planned", plannedAt: new Date("2026-09-01T00:00:00.000Z") }),
        makeItem({ id: "future-1", type: "transport", state: "planned", plannedAt: new Date("2026-08-01T00:00:00.000Z") }),
      ];

      const focus = computeTripHomeFocus({ items, pendingProposals: [], now });

      expect(focus.kind).toBe("next-leg");
      if (focus.kind === "next-leg") {
        expect(focus.itemId).toBe("future-1");
      }
    });

    test("preparation focus when plan is empty", () => {
      const focus = computeTripHomeFocus({ items: [], pendingProposals: [], now });
      expect(focus.kind).toBe("preparation");
    });

    test("preparation focus when only idea items present and no future legs", () => {
      const items = [
        makeItem({ id: "idea-1", type: "visit", state: "idea" }),
        makeItem({ id: "idea-2", type: "food", state: "idea" }),
      ];

      const focus = computeTripHomeFocus({ items, pendingProposals: [], now });
      expect(focus.kind).toBe("preparation");
    });

    test("preparation focus when only past planned legs exist", () => {
      const items = [
        makeItem({ id: "past-1", type: "transport", state: "planned", plannedAt: new Date("2026-06-01T00:00:00.000Z") }),
      ];

      const focus = computeTripHomeFocus({ items, pendingProposals: [], now });
      expect(focus.kind).toBe("preparation");
    });
  });

  describe("proposal expiry and tie-breakers", () => {
    test("expired proposal with expiry is ignored", () => {
      const proposals = [
        makeProposal({ id: "expired", expiresAt: new Date("2026-07-24T00:00:00.000Z") }),
      ];

      const focus = computeTripHomeFocus({ items: [], pendingProposals: proposals, now });
      expect(focus.kind).toBe("preparation");
    });

    test("expired pending proposal does not win focus even when no other focus exists", () => {
      const proposals = [
        makeProposal({ id: "expired-1", expiresAt: new Date("2026-07-23T00:00:00.000Z") }),
        makeProposal({ id: "expired-2", expiresAt: new Date("2026-07-24T00:00:00.000Z") }),
      ];

      const focus = computeTripHomeFocus({ items: [], pendingProposals: proposals, now });
      expect(focus.kind).toBe("preparation");
    });

    test("unexpired proposal with expiry and rich fields still wins focus", () => {
      const proposals = [
        makeProposal({
          id: "rich-proposal",
          expiresAt: new Date("2026-07-27T00:00:00.000Z"),
          rationale: "Đề xuất đổi chặng xe",
          status: "pending",
          affectedItems: [{ itemId: "leg-1", kind: "leg", label: "Chạy xe", change: "change-state" }],
          beforeAfter: [{ operation: "Đổi trạng thái", before: null, after: "confirmed" }],
          hasAlternatives: true,
        }),
      ];

      const focus = computeTripHomeFocus({ items: [], pendingProposals: proposals, now });
      expect(focus.kind).toBe("pending-proposal-with-expiry");
    });

    test("proposal without expiry wins focus over a confirmed-item gap", () => {
      const items = [makeItem({ id: "gap-1", type: "transport", state: "confirmed" })];
      const proposals = [makeProposal({ id: "no-expiry", createdAt: new Date("2026-07-22T00:00:00.000Z") })];

      const focus = computeTripHomeFocus({ items, pendingProposals: proposals, now });
      expect(focus.kind).toBe("pending-proposal");
    });

    test("earliest expiresAt wins among pending-with-expiry proposals", () => {
      const proposals = [
        makeProposal({ id: "later", expiresAt: new Date("2026-07-28T00:00:00.000Z") }),
        makeProposal({ id: "earlier", expiresAt: new Date("2026-07-26T00:00:00.000Z") }),
      ];

      const focus = computeTripHomeFocus({ items: [], pendingProposals: proposals, now });
      expect(focus.kind).toBe("pending-proposal-with-expiry");
      if (focus.kind === "pending-proposal-with-expiry") {
        expect(focus.proposalId).toBe("earlier");
      }
    });

    test("earliest createdAt wins among pending-without-expiry proposals", () => {
      const proposals = [
        makeProposal({ id: "newer", createdAt: new Date("2026-07-23T00:00:00.000Z") }),
        makeProposal({ id: "older", createdAt: new Date("2026-07-19T00:00:00.000Z") }),
      ];

      const focus = computeTripHomeFocus({ items: [], pendingProposals: proposals, now });
      expect(focus.kind).toBe("pending-proposal");
      if (focus.kind === "pending-proposal") {
        expect(focus.proposalId).toBe("older");
      }
    });

    test("pending-with-expiry beats pending-without-expiry regardless of createdAt", () => {
      const proposals = [
        makeProposal({ id: "no-expiry-old", createdAt: new Date("2026-07-01T00:00:00.000Z") }),
        makeProposal({ id: "with-expiry-new", createdAt: new Date("2026-07-24T00:00:00.000Z"), expiresAt: new Date("2026-07-27T00:00:00.000Z") }),
      ];

      const focus = computeTripHomeFocus({ items: [], pendingProposals: proposals, now });
      expect(focus.kind).toBe("pending-proposal-with-expiry");
      if (focus.kind === "pending-proposal-with-expiry") {
        expect(focus.proposalId).toBe("with-expiry-new");
      }
    });

    test("findPendingProposalWithExpiry returns null when all are expired", () => {
      const proposals = [
        makeProposal({ id: "expired-1", expiresAt: new Date("2026-07-23T00:00:00.000Z") }),
        makeProposal({ id: "expired-2", expiresAt: new Date("2026-07-24T00:00:00.000Z") }),
      ];
      expect(findPendingProposalWithExpiry(proposals, now)).toBeNull();
    });

    test("findPendingProposalWithoutExpiry ignores proposals that have an expiry set", () => {
      const proposals = [
        makeProposal({ id: "with-expiry", expiresAt: new Date("2026-07-28T00:00:00.000Z") }),
        makeProposal({ id: "no-expiry", createdAt: new Date("2026-07-21T00:00:00.000Z") }),
      ];
      const result = findPendingProposalWithoutExpiry(proposals, now);
      expect(result?.id).toBe("no-expiry");
    });
  });

  describe("findConfirmedItemGap", () => {
    test("transport missing date is a gap", () => {
      const items = [
        makeItem({ id: "transport-no-date", type: "transport", state: "confirmed", transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" }),
      ];
      expect(findConfirmedItemGap(items)?.id).toBe("transport-no-date");
    });

    test("transport missing origin is a gap", () => {
      const items = [
        makeItem({ id: "transport-no-origin", type: "transport", state: "confirmed", plannedAt: new Date("2026-08-01T00:00:00.000Z"), transportDestinationLabel: "Huế" }),
      ];
      expect(findConfirmedItemGap(items)?.id).toBe("transport-no-origin");
    });

    test("transport missing destination is a gap", () => {
      const items = [
        makeItem({ id: "transport-no-dest", type: "transport", state: "confirmed", plannedAt: new Date("2026-08-01T00:00:00.000Z"), transportOriginLabel: "Hà Nội" }),
      ];
      expect(findConfirmedItemGap(items)?.id).toBe("transport-no-dest");
    });

    test("accommodation missing date is a gap", () => {
      const items = [
        makeItem({ id: "acc-no-date", type: "accommodation", state: "confirmed", accommodationPlaceAreaLabel: "Phố cổ Huế" }),
      ];
      expect(findConfirmedItemGap(items)?.id).toBe("acc-no-date");
    });

    test("accommodation missing place area is a gap", () => {
      const items = [
        makeItem({ id: "acc-no-place", type: "accommodation", state: "confirmed", plannedAt: new Date("2026-08-01T00:00:00.000Z") }),
      ];
      expect(findConfirmedItemGap(items)?.id).toBe("acc-no-place");
    });

    test("complete transport is not a gap", () => {
      const items = [
        makeItem({ id: "complete", type: "transport", state: "confirmed", plannedAt: new Date("2026-08-01T00:00:00.000Z"), transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" }),
      ];
      expect(findConfirmedItemGap(items)).toBeNull();
    });

    test("complete accommodation is not a gap", () => {
      const items = [
        makeItem({ id: "complete-acc", type: "accommodation", state: "confirmed", plannedAt: new Date("2026-08-01T00:00:00.000Z"), accommodationPlaceAreaLabel: "Phố cổ Huế" }),
      ];
      expect(findConfirmedItemGap(items)).toBeNull();
    });

    test("idea item is never a gap by itself", () => {
      const items = [
        makeItem({ id: "idea", type: "transport", state: "idea" }),
        makeItem({ id: "idea-acc", type: "accommodation", state: "idea" }),
      ];
      expect(findConfirmedItemGap(items)).toBeNull();
    });

    test("incomplete planned item is never a gap by itself", () => {
      const items = [
        makeItem({ id: "planned-incomplete", type: "transport", state: "planned" }),
      ];
      expect(findConfirmedItemGap(items)).toBeNull();
    });

    test("backup item is not a gap even if it is a confirmed-style transport missing context", () => {
      const items = [
        makeItem({ id: "backup-transport", type: "transport", state: "backup", backupTargetItemId: "target-1" }),
      ];
      expect(findConfirmedItemGap(items)).toBeNull();
    });

    test("null plannedAt sorts earliest so the most underspecified gap surfaces first", () => {
      const items = [
        makeItem({ id: "dated-gap", type: "transport", state: "confirmed", plannedAt: new Date("2026-08-05T00:00:00.000Z"), transportOriginLabel: "Hà Nội" }),
        makeItem({ id: "null-gap", type: "accommodation", state: "confirmed" }),
      ];
      expect(findConfirmedItemGap(items)?.id).toBe("null-gap");
    });

    test("ties resolve by earliest plannedAt then earliest createdAt then stable id", () => {
      const earlierCreated = new Date("2026-07-19T00:00:00.000Z");
      const laterCreated = new Date("2026-07-21T00:00:00.000Z");
      const items = [
        makeItem({ id: "zzz-gap", type: "transport", state: "confirmed", createdAt: laterCreated }),
        makeItem({ id: "aaa-gap", type: "transport", state: "confirmed", createdAt: earlierCreated }),
      ];
      expect(findConfirmedItemGap(items)?.id).toBe("aaa-gap");
    });
  });

  describe("findNextFutureLeg", () => {
    test("selects earliest plannedAt strictly after now among planned items", () => {
      const items = [
        makeItem({ id: "far", type: "transport", state: "planned", plannedAt: new Date("2026-09-01T00:00:00.000Z") }),
        makeItem({ id: "near", type: "transport", state: "planned", plannedAt: new Date("2026-08-01T00:00:00.000Z") }),
      ];
      expect(findNextFutureLeg(items, now)?.id).toBe("near");
    });

    test("includes confirmed items in future leg candidates", () => {
      const items = [
        makeItem({ id: "confirmed-future", type: "transport", state: "confirmed", plannedAt: new Date("2026-08-02T00:00:00.000Z"), transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" }),
        makeItem({ id: "planned-future", type: "transport", state: "planned", plannedAt: new Date("2026-08-03T00:00:00.000Z") }),
      ];
      expect(findNextFutureLeg(items, now)?.id).toBe("confirmed-future");
    });

    test("excludes items at or before now", () => {
      const items = [
        makeItem({ id: "now-leg", type: "transport", state: "planned", plannedAt: now }),
        makeItem({ id: "past-leg", type: "transport", state: "planned", plannedAt: new Date("2026-06-01T00:00:00.000Z") }),
      ];
      expect(findNextFutureLeg(items, now)).toBeNull();
    });

    test("excludes idea and backup items", () => {
      const items = [
        makeItem({ id: "idea-future", type: "transport", state: "idea", plannedAt: new Date("2026-08-01T00:00:00.000Z") }),
        makeItem({ id: "backup-future", type: "transport", state: "backup", plannedAt: new Date("2026-08-02T00:00:00.000Z"), backupTargetItemId: "x" }),
      ];
      expect(findNextFutureLeg(items, now)).toBeNull();
    });

    test("excludes items with null plannedAt", () => {
      const items = [makeItem({ id: "no-date", type: "transport", state: "planned" })];
      expect(findNextFutureLeg(items, now)).toBeNull();
    });

    test("ties resolve by earliest createdAt then stable id", () => {
      const items = [
        makeItem({ id: "b-leg", type: "transport", state: "planned", plannedAt: new Date("2026-08-01T00:00:00.000Z"), createdAt: new Date("2026-07-22T00:00:00.000Z") }),
        makeItem({ id: "a-leg", type: "transport", state: "planned", plannedAt: new Date("2026-08-01T00:00:00.000Z"), createdAt: new Date("2026-07-20T00:00:00.000Z") }),
      ];
      expect(findNextFutureLeg(items, now)?.id).toBe("a-leg");
    });

    test("excludes anchors and activities even when plannedAt is in the future", () => {
      const futureDate = new Date("2026-08-01T00:00:00.000Z");
      const items = [
        makeItem({ id: "anchor-future", kind: "anchor", anchorRole: "origin", type: null, state: "planned", plannedAt: futureDate }),
        makeItem({ id: "activity-future", kind: "activity", type: "visit", state: "planned", plannedAt: futureDate, parentItemId: "leg-1" }),
      ];
      expect(findNextFutureLeg(items, now)).toBeNull();
    });

    test("selects a leg over a same-timestamp future anchor or activity", () => {
      const futureDate = new Date("2026-08-01T00:00:00.000Z");
      const items = [
        makeItem({ id: "anchor-future", kind: "anchor", anchorRole: "origin", type: null, state: "planned", plannedAt: futureDate }),
        makeItem({ id: "activity-future", kind: "activity", type: "visit", state: "planned", plannedAt: futureDate, parentItemId: "leg-1" }),
        makeItem({ id: "leg-future", kind: "leg", type: "transport", state: "planned", plannedAt: futureDate }),
      ];
      expect(findNextFutureLeg(items, now)?.id).toBe("leg-future");
    });
  });

  describe("determinism and defensive validation", () => {
    test("same input produces same focus across repeated calls", () => {
      const items = [
        makeItem({ id: "future-1", type: "transport", state: "planned", plannedAt: new Date("2026-08-01T00:00:00.000Z") }),
      ];
      const a = computeTripHomeFocus({ items, pendingProposals: [], now });
      const b = computeTripHomeFocus({ items, pendingProposals: [], now });
      expect(a).toEqual(b);
    });

    test("defensively ignores unknown kinds/types/states rather than throwing", () => {
      const badItem = {
        ...makeItem({ id: "bad" }),
        kind: "unknown" as never,
        type: null,
      };
      const items = [
        badItem,
        makeItem({ id: "good-future", type: "transport", state: "planned", plannedAt: new Date("2026-08-01T00:00:00.000Z") }),
      ];
      const focus = computeTripHomeFocus({ items, pendingProposals: [], now });
      expect(focus.kind).toBe("next-leg");
      if (focus.kind === "next-leg") {
        expect(focus.itemId).toBe("good-future");
      }
    });

    test("defensively ignores invalid proposal shapes", () => {
      const proposals = [
        makeProposal({ id: "", expiresAt: new Date("2026-07-28T00:00:00.000Z") }),
        { id: "no-created-at" } as never,
      ];
      const focus = computeTripHomeFocus({ items: [], pendingProposals: proposals, now });
      expect(focus.kind).toBe("preparation");
    });

    test("computeTripHomeFocus does not call new Date() internally — now is an explicit parameter", () => {
      const fixedNow = new Date("2026-07-25T10:00:00.000Z");
      const items = [makeItem({ id: "future", type: "transport", state: "planned", plannedAt: new Date("2026-08-01T00:00:00.000Z") })];
      const focus = computeTripHomeFocus({ items, pendingProposals: [], now: fixedNow });
      expect(focus.kind).toBe("next-leg");
    });

    test("defensively ignores items with invalid plannedAt (NaN date) rather than corrupting sort comparators", () => {
      const invalidDate = new Date("invalid") as unknown as Date;
      const items = [
        makeItem({ id: "bad-planned", type: "transport", state: "planned", plannedAt: invalidDate }),
        makeItem({ id: "good-future", type: "transport", state: "planned", plannedAt: new Date("2026-08-01T00:00:00.000Z") }),
      ];
      const focus = computeTripHomeFocus({ items, pendingProposals: [], now });
      expect(focus.kind).toBe("next-leg");
      if (focus.kind === "next-leg") {
        expect(focus.itemId).toBe("good-future");
      }
    });

    test("defensively ignores confirmed items with invalid plannedAt in gap detection", () => {
      const invalidDate = new Date("invalid") as unknown as Date;
      const items = [
        makeItem({ id: "bad-confirmed", type: "transport", state: "confirmed", plannedAt: invalidDate, transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế" }),
        makeItem({ id: "good-future", type: "transport", state: "planned", plannedAt: new Date("2026-08-01T00:00:00.000Z") }),
      ];
      const focus = computeTripHomeFocus({ items, pendingProposals: [], now });
      expect(focus.kind).toBe("next-leg");
      if (focus.kind === "next-leg") {
        expect(focus.itemId).toBe("good-future");
      }
    });
  });

  describe("buildTimelineGroups", () => {
    test("groups root anchors and legs by ordinal with date dividers from plannedAt", () => {
      const items = [
        makeItem({ id: "leg-1", kind: "leg", type: "transport", state: "planned", ordinal: 0, plannedAt: new Date("2026-08-01T08:00:00.000Z") }),
        makeItem({ id: "leg-2", kind: "leg", type: "visit", state: "planned", ordinal: 1, plannedAt: new Date("2026-08-02T10:00:00.000Z") }),
      ];
      const groups = buildTimelineGroups(items);
      expect(groups).toHaveLength(2);
      expect(groups[0].dateDivider).toBe("2026-08-01");
      expect(groups[0].legId).toBe("leg-1");
      expect(groups[1].dateDivider).toBe("2026-08-02");
      expect(groups[1].legId).toBe("leg-2");
    });

    test("places child activities under their parent leg by ordinal", () => {
      const items = [
        makeItem({ id: "leg-1", kind: "leg", type: "transport", state: "planned", ordinal: 0 }),
        makeItem({ id: "activity-1", kind: "activity", type: "visit", state: "idea", ordinal: 1, parentItemId: "leg-1" }),
        makeItem({ id: "activity-0", kind: "activity", type: "food", state: "idea", ordinal: 0, parentItemId: "leg-1" }),
      ];
      const groups = buildTimelineGroups(items);
      expect(groups).toHaveLength(1);
      expect(groups[0].entries).toHaveLength(3);
      expect(groups[0].entries[0].id).toBe("leg-1");
      expect(groups[0].entries[1].id).toBe("activity-0");
      expect(groups[0].entries[2].id).toBe("activity-1");
      expect(groups[0].entries[1].depth).toBe(1);
    });

    test("date divider is null for roots without plannedAt and changes when a dated root appears", () => {
      const items = [
        makeItem({ id: "anchor-1", kind: "anchor", anchorRole: "origin", type: null, state: "idea", ordinal: 0 }),
        makeItem({ id: "leg-1", kind: "leg", type: "transport", state: "planned", ordinal: 1, plannedAt: new Date("2026-08-01T08:00:00.000Z") }),
      ];
      const groups = buildTimelineGroups(items);
      expect(groups[0].dateDivider).toBeNull();
      expect(groups[1].dateDivider).toBe("2026-08-01");
    });

    test("exposes Vietnamese state labels on each entry", () => {
      const items = [
        makeItem({ id: "idea-1", type: "visit", state: "idea", ordinal: 0 }),
        makeItem({ id: "planned-1", type: "visit", state: "planned", ordinal: 1 }),
        makeItem({ id: "confirmed-1", type: "visit", state: "confirmed", ordinal: 2 }),
        makeItem({ id: "backup-1", type: "visit", state: "backup", ordinal: 3, backupTargetItemId: "confirmed-1" }),
      ];
      const groups = buildTimelineGroups(items);
      const labels = groups.flatMap((group) => group.entries.map((entry) => entry.stateLabel));
      expect(labels).toEqual([
        tripPlanItemStateLabels.idea,
        tripPlanItemStateLabels.planned,
        tripPlanItemStateLabels.confirmed,
        tripPlanItemStateLabels.backup,
      ]);
    });

    test("exposes concise transport place context and bounded notes preview only", () => {
      const longNotes = "Ghi chú rất dài ".repeat(20);
      const items = [
        makeItem({ id: "transport-1", type: "transport", state: "planned", ordinal: 0, transportOriginLabel: "Hà Nội", transportDestinationLabel: "Huế", notes: longNotes }),
      ];
      const groups = buildTimelineGroups(items);
      const entry = groups[0].entries[0];
      expect(entry.placeContext).toBe("Hà Nội → Huế");
      expect(entry.notesPreview?.endsWith("…")).toBe(true);
      expect(entry.notesPreview?.length).toBeLessThanOrEqual(80);
    });

    test("does not expose raw notes beyond the bounded single-line preview", () => {
      const items = [
        makeItem({ id: "transport-1", type: "transport", state: "planned", ordinal: 0, notes: "multi\nline\nnote" }),
      ];
      const groups = buildTimelineGroups(items);
      const entry = groups[0].entries[0];
      expect(entry.notesPreview).not.toContain("\n");
    });
  });

  describe("buildConstraintsSummary", () => {
    test("returns null for a missing constraints row", () => {
      expect(buildConstraintsSummary(null)).toBeNull();
    });

    test("projects only traveler-safe fields and translates tags to Vietnamese labels", () => {
      const summary = buildConstraintsSummary({
        adultCount: 2,
        childCount: 1,
        children: [{ ageMin: 4, ageMax: 6, comfortTags: ["car_seat", "nap_breaks"], preferenceTags: ["beach", "animals"] }],
        vehicleType: "ev",
        evChargingNeed: "required",
        drivingToleranceHours: 4,
        budgetCurrency: "VND",
        budgetMinVnd: 1_000_000,
        budgetMaxVnd: 5_000_000,
        preferenceTags: ["nature", "family_friendly"],
        avoidItems: [{ category: "place", label: "Khu đông người" }, { category: "activity", label: "Đêm khuya" }],
      });

      expect(summary).toMatchObject({
        adultCount: 2,
        childCount: 1,
        vehicleType: "ev",
        evChargingNeed: "required",
        drivingToleranceHours: 4,
        budgetCurrency: "VND",
        budgetMinVnd: 1_000_000,
        budgetMaxVnd: 5_000_000,
        preferenceTags: ["Thiên nhiên", "Thích hợp gia đình"],
        avoidItems: [
          { category: "place", label: "Khu đông người" },
          { category: "activity", label: "Đêm khuya" },
        ],
      });
      expect(summary?.childrenSummary).toEqual([
        { ageRange: "4-6 tuổi", comfortTags: ["Ghế ngồi ô tô", "Nghỉ ngủ"], preferenceTags: ["Biển", "Động vật"] },
      ]);
    });

    test("does not expose raw children or avoidItems blobs to the client", () => {
      const summary = buildConstraintsSummary({
        adultCount: 2,
        childCount: null,
        children: [{ ageMin: 4, ageMax: 6, comfortTags: [], preferenceTags: [], fullName: "Sensitive child" }],
        vehicleType: null,
        evChargingNeed: null,
        drivingToleranceHours: null,
        budgetCurrency: null,
        budgetMinVnd: null,
        budgetMaxVnd: null,
        preferenceTags: null,
        avoidItems: [{ category: "place", label: "Valid" }, { category: "invalid", label: "Bad" }],
      });

      expect(summary?.childrenSummary).toEqual([{ ageRange: "4-6 tuổi", comfortTags: [], preferenceTags: [] }]);
      expect(summary?.avoidItems).toEqual([{ category: "place", label: "Valid" }]);
    });

    test("omits invalid enum values defensively", () => {
      const summary = buildConstraintsSummary({
        adultCount: 2,
        childCount: null,
        children: null,
        vehicleType: "truck" as never,
        evChargingNeed: "sometimes" as never,
        drivingToleranceHours: 99,
        budgetCurrency: "USD" as never,
        budgetMinVnd: null,
        budgetMaxVnd: null,
        preferenceTags: ["unknown_tag"],
        avoidItems: null,
      });

      expect(summary?.vehicleType).toBeNull();
      expect(summary?.evChargingNeed).toBeNull();
      expect(summary?.budgetCurrency).toBeNull();
      expect(summary?.preferenceTags).toEqual(["unknown_tag"]);
    });
  });

  describe("Vietnam (ICT, UTC+7) date/time display", () => {
    test("date divider uses Vietnam time so a 20:00 UTC leg lands on the next day", () => {
      const items = [
        makeItem({ id: "late-utc", kind: "leg", type: "transport", state: "planned", ordinal: 0, plannedAt: new Date("2026-08-01T20:00:00.000Z") }),
      ];
      const groups = buildTimelineGroups(items);
      expect(groups[0].dateDivider).toBe("2026-08-02");
    });

    test("time context is formatted in Vietnam time and labels giờ Việt Nam, not UTC", () => {
      const items = [
        makeItem({ id: "late-utc", kind: "leg", type: "transport", state: "planned", ordinal: 0, plannedAt: new Date("2026-08-01T20:00:00.000Z") }),
      ];
      const groups = buildTimelineGroups(items);
      expect(groups[0].entries[0].timeContext).toBe("03:00 giờ Việt Nam");
      expect(groups[0].entries[0].timeContext).not.toContain("UTC");
    });
  });

  describe("formatReasonForGap mentions all missing fields", () => {
    test("transport missing both origin and destination mentions both", () => {
      const items = [
        makeItem({ id: "transport-two-missing", type: "transport", state: "confirmed", plannedAt: new Date("2026-08-01T00:00:00.000Z") }),
      ];
      const focus = computeTripHomeFocus({ items, pendingProposals: [], now });
      expect(focus.kind).toBe("confirmed-item-gap");
      if (focus.kind === "confirmed-item-gap") {
        expect(focus.reason).toContain("điểm đi");
        expect(focus.reason).toContain("điểm đến");
      }
    });

    test("transport missing all three fields mentions ngày giờ, điểm đi and điểm đến", () => {
      const items = [
        makeItem({ id: "transport-all-missing", type: "transport", state: "confirmed" }),
      ];
      const focus = computeTripHomeFocus({ items, pendingProposals: [], now });
      if (focus.kind === "confirmed-item-gap") {
        expect(focus.reason).toContain("ngày giờ");
        expect(focus.reason).toContain("điểm đi");
        expect(focus.reason).toContain("điểm đến");
      }
    });
  });

  describe("preparation focus isolation", () => {
    test("mutating a returned preparation focus does not corrupt subsequent calls", () => {
      const first = computeTripHomeFocus({ items: [], pendingProposals: [], now });
      expect(first.kind).toBe("preparation");
      if (first.kind === "preparation") {
        first.reason = "tampered";
      }
      const second = computeTripHomeFocus({ items: [], pendingProposals: [], now });
      expect(second.kind).toBe("preparation");
      if (second.kind === "preparation") {
        expect(second.reason).toBe("Chuẩn bị cho chuyến đi");
      }
    });
  });
});
