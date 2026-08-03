import { afterEach, describe, expect, test, vi } from "vitest";

import nextConfig from "../next.config";

describe("local direct API transport", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  test("forwards only relative traveler API and auth paths to local Nest in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await expect(nextConfig.rewrites?.()).resolves.toEqual([
      { source: "/v1/:path*", destination: "http://127.0.0.1:3001/v1/:path*" },
      { source: "/auth/:path*", destination: "http://127.0.0.1:3001/auth/:path*" },
    ]);
  });

  test("does not install a development transport forwarder in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(nextConfig.rewrites?.()).resolves.toEqual([]);
  });
});
