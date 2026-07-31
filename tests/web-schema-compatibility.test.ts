import { describe, expect, it } from "vitest";

import { isWebDeploymentReady } from "@/server/web-schema-admission";

describe("web deployment schema admission", () => {
  it("becomes traffic eligible only for one compatible release record", async () => {
    const dependencies = {
      assertEnvironment() {},
      async probeDatabase() {},
      async readReleaseVersions() { return [{ version: "20260728.1" }]; },
    };
    await expect(isWebDeploymentReady(dependencies)).resolves.toBe(true);
    await expect(isWebDeploymentReady({ ...dependencies, async readReleaseVersions() { return []; } })).resolves.toBe(false);
    await expect(isWebDeploymentReady({ ...dependencies, async readReleaseVersions() { return [{ version: "bad" }]; } })).resolves.toBe(false);
    await expect(isWebDeploymentReady({ ...dependencies, async readReleaseVersions() { return [{ version: "20260728.1" }, { version: "20260728.1" }]; } })).resolves.toBe(false);
  });
});
