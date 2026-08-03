import { beforeEach, describe, expect, test } from "vitest";

import { normalizeConstraints } from "@xuyenviet/database";

describe("package trip planning safety", () => {
  beforeEach(() => undefined);

  test("rejects malformed child, preference, and avoid-item constraints", () => {
    expect(() => normalizeConstraints({ adultCount: 2, children: [{ ageMin: 1, ageMax: 2, comfortTags: ["unknown"], preferenceTags: [] }] })).toThrow("Invalid trip constraints children.");
    expect(() => normalizeConstraints({ adultCount: 2, preferenceTags: ["beach", "beach"] })).toThrow("Invalid trip constraints preferences.");
    expect(() => normalizeConstraints({ adultCount: 2, avoidItems: [{ category: "place", label: "x\ny" }] })).toThrow("Invalid trip constraints avoid items.");
  });

  test("accepts bounded structured constraints", () => {
    expect(normalizeConstraints({ adultCount: 2, childCount: 1, children: [{ ageMin: 3, ageMax: 5, comfortTags: ["car_seat"], preferenceTags: ["animals"] }], preferenceTags: ["family_friendly"], avoidItems: [{ category: "activity", label: "Leo núi" }] })).toMatchObject({ adultCount: 2, childCount: 1 });
  });
});
