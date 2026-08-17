import { describe, expect, test } from "vitest";

import { resolveRouteApplicability } from "@xuyenviet/database";

describe("canonical route authority", () => {
  test("resolves only selected paths and typed static coverage", () => {
    expect(resolveRouteApplicability({ canonicalRoutePathId: "hanoi-da-nang-national-1a", originLabel: "anything", destinationLabel: "anything" })).toEqual({ kind: "selected", pathId: "hanoi-da-nang-national-1a" });
    expect(resolveRouteApplicability({ canonicalRoutePathId: null, originLabel: "Hà Nội", destinationLabel: "Đà Nẵng" })).toEqual({ kind: "complete", pathIds: ["hanoi-da-nang-national-1a", "hanoi-da-nang-ho-chi-minh-road"] });
    expect(resolveRouteApplicability({ canonicalRoutePathId: null, originLabel: "Đà Nẵng", destinationLabel: "Quy Nhơn" })).toEqual({ kind: "partial", pathIds: ["da-nang-quy-nhon-coastal"] });
    expect(resolveRouteApplicability({ canonicalRoutePathId: null, originLabel: "Hà Nội", destinationLabel: "Hạ Long" })).toEqual({ kind: "ambiguous", pathIds: ["hanoi-ha-long-expressway", "hanoi-ha-long-national-18"] });
  });

  test("does not give labels route authority and preserves stale references", () => {
    expect(resolveRouteApplicability({ canonicalRoutePathId: null, originLabel: "Huế", destinationLabel: "Đà Lạt" })).toEqual({ kind: "unsupported" });
    expect(resolveRouteApplicability({ canonicalRoutePathId: "removed-path", originLabel: "Hà Nội", destinationLabel: "Đà Nẵng" })).toEqual({ kind: "stale", pathId: "removed-path" });
  });
});
