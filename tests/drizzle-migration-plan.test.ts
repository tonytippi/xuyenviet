import { describe, expect, it } from "vitest";

import { assertApprovedDrizzlePendingPlan } from "../scripts/drizzle-migration-plan";

describe("Drizzle migration plan preflight", () => {
  it("rejects a pending migration not declared in the approved manifest", async () => {
    await expect(assertApprovedDrizzlePendingPlan({ unsafe: async () => [] }, { disposition: "forward_only", pending: [] })).rejects.toThrow("Approved migration plan");
  });

  it("rejects a changed digest without interpreting migration SQL", async () => {
    await expect(assertApprovedDrizzlePendingPlan({ unsafe: async () => [] }, {
      disposition: "forward_only",
      pending: [{ id: "0000_baseline", digest: "0".repeat(64) }],
    })).rejects.toThrow("Approved migration plan");
  });
});
