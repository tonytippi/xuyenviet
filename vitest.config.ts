import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const unitTests = [
  "tests/ai-usage-events.test.ts",
  "tests/answer-annotations.test.ts",
  "tests/audit-actors.test.ts",
  "tests/capture-archive.test.ts",
  "tests/capture-orchestration.test.ts",
  "tests/env-guards.test.ts",
  "tests/facebook-capture-script.test.ts",
  "tests/facebook-seed-urls.test.ts",
  "tests/knowledge-state.test.ts",
  "tests/traveler-ui-foundation.test.ts",
  "tests/trip-home.test.ts",
  "tests/web-search-quality.test.ts",
  "tests/youtube-seed-urls.test.ts",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "server-only": resolve(__dirname, "tests/mocks/server-only.ts"),
    },
    tsconfigPaths: true,
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: unitTests,
          setupFiles: ["./tests/unit-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          fileParallelism: false,
          maxWorkers: 1,
          globalSetup: "./tests/integration-global-setup.ts",
          include: ["tests/**/*.test.ts"],
          exclude: unitTests,
          setupFiles: ["./tests/integration-setup.ts"],
        },
      },
    ],
  },
});
