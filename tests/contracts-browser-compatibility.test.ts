import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("contracts browser compatibility", () => {
  test("loads without a Node stdout stream", async () => {
    vi.stubGlobal("process", Object.create(process, { stdout: { value: undefined } }));
    vi.resetModules();

    await expect(import("../packages/contracts/src/index")).resolves.toBeDefined();
  });
});
