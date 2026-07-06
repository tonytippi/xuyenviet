import { describe, expect, test } from "vitest";

import { withEnv, validProductionEnv } from "./helpers/env";

describe("production environment guards", () => {
  test.each(["local", "staging"])("is a no-op when APP_ENV=%s", async (appEnv) => {
    const { assertProductionLaunchEnv } = await import("@/server/env");

    await withEnv({ APP_ENV: appEnv, AUTH_SECRET: undefined, DATABASE_URL: undefined }, () => {
      expect(() => assertProductionLaunchEnv()).not.toThrow();
    });
  });

  test.each(["AUTH_SECRET", "AUTH_URL", "DATABASE_URL"])("fails closed when %s is missing in production", async (name) => {
    const { assertProductionLaunchEnv, ServerEnvError } = await import("@/server/env");

    await withEnv(validProductionEnv({ [name]: undefined }), () => {
      expect(() => assertProductionLaunchEnv()).toThrow(ServerEnvError);
    });
  });

  test.each(["replace-with-real", "placeholder-value", "example-value", "changeme", "change-me"])(
    "fails closed on placeholder value %s in production",
    async (value) => {
      const { assertProductionLaunchEnv, ServerEnvError } = await import("@/server/env");

      await withEnv(validProductionEnv({ AUTH_SECRET: value }), () => {
        expect(() => assertProductionLaunchEnv()).toThrow(ServerEnvError);
      });
    },
  );

  test.each([
    "postgresql://user:pass@localhost:5432/xuyenviet",
    "postgresql://user:pass@127.0.0.1:5432/xuyenviet",
    "postgresql://user:pass@[::1]:5432/xuyenviet",
  ])("fails closed on local production database URL %s", async (databaseUrl) => {
    const { assertProductionLaunchEnv, ServerEnvError } = await import("@/server/env");

    await withEnv(validProductionEnv({ DATABASE_URL: databaseUrl }), () => {
      expect(() => assertProductionLaunchEnv()).toThrow(ServerEnvError);
    });
  });

  test("allows a complete non-placeholder production configuration", async () => {
    const { assertProductionLaunchEnv } = await import("@/server/env");

    await withEnv(validProductionEnv(), () => {
      expect(() => assertProductionLaunchEnv()).not.toThrow();
    });
  });

  test("rejects an unknown APP_ENV value", async () => {
    const { getAppEnv, ServerEnvError } = await import("@/server/env");

    await withEnv({ APP_ENV: "preview" }, () => {
      expect(() => getAppEnv()).toThrow(ServerEnvError);
    });
  });
});
