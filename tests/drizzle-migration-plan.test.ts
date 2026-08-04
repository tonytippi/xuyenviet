import { describe, expect, it } from "vitest";

import { assertApprovedDrizzlePendingPlan, readDrizzlePendingPlan } from "../scripts/drizzle-migration-plan";

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

  it("admits the target knowledge lifecycle migration with its approved digest", async () => {
    const allPending = await readDrizzlePendingPlan({ unsafe: async () => [] });
    const target = { id: "0038_target_knowledge_lifecycle", digest: "6c1d20296a72e41a1370a4e07bd6fe09e4eedb50e8919acb8ea344fb1f9482d1" };

    expect(allPending).toContainEqual(target);
    await expect(assertApprovedDrizzlePendingPlan({
      unsafe: async () => allPending.filter((entry) => entry.id !== target.id).map((entry) => ({ hash: entry.digest })),
    }, { disposition: "forward_only", pending: [target] })).resolves.toBeUndefined();
  });
});
