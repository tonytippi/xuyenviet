import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const unitTests = [
  "tests/ai-usage-events.test.ts",
  "tests/answer-annotations.test.ts",
    "tests/audit-actors.test.ts",
    "tests/facebook-capture-script.test.ts",
    "tests/capture-orchestration.test.ts",
    "tests/contracts-browser-compatibility.test.ts",
  "tests/env-guards.test.ts",
  "tests/facebook-seed-urls.test.ts",
  "tests/admin-facebook-capture-contract.test.ts",
    "tests/knowledge-state.test.ts",
    "tests/knowledge-lifecycle-writer-boundary.test.ts",
    "tests/admin-knowledge-views-ui-boundary.test.ts",
  "tests/knowledge-target-vocabulary-boundary.test.ts",
  "tests/knowledge-ingestion-prompt.test.ts",
  "tests/admin-operator-guide.test.ts",
  "tests/direct-api-launch-evidence.test.ts",
  "tests/traveler-ui-foundation.test.ts",
  "tests/trip-recommendations.test.ts",
  "tests/ai-ask-api-adapter.test.ts",
  "tests/ai-ask-direct-api.test.ts",
  "tests/direct-shell-proposal-actions.test.ts",
  "tests/legacy-auth-retirement.test.ts",
  "tests/local-direct-transport.test.ts",
  "tests/planning-context-profiles.test.ts",
  "tests/trip-home.test.ts",
  "tests/traveler-writer-inventory.test.ts",
  "tests/web-search-quality.test.ts",
    "tests/youtube-seed-urls.test.ts",
    "tests/youtube-discovery-policy.test.ts",
    "tests/youtube-discovery-recommendations.test.ts",
    "tests/youtube-discovery-ownership.test.ts",
    "tests/youtube-discovery-worker.test.ts",
    "tests/youtube-discovery-execution.test.ts",
    "tests/youtube-discovery-planning.test.ts",
    "tests/youtube-discovery-owner-port-composition.test.ts",
    "tests/youtube-discovery-runtime-config.test.ts",
    "tests/youtube-discovery-search.test.ts",
    "tests/youtube-discovery-enrichment.test.ts",
    "tests/youtube-video.test.ts",
    "tests/admin-youtube-discovery-contract.test.ts",
    "tests/admin-youtube-discovery-review-ui.test.ts",
    "tests/admin-youtube-discovery-health-ui.test.ts",
    "tests/admin-youtube-discovery-mission-ui.test.ts",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "server-only": resolve(__dirname, "tests/mocks/server-only.ts"),
      "@xuyenviet/config": resolve(__dirname, "packages/config/src/index.ts"),
      "@xuyenviet/contracts": resolve(__dirname, "packages/contracts/src/index.ts"),
      "@xuyenviet/database": resolve(__dirname, "packages/database/src/index.ts"),
      "@xuyenviet/domain": resolve(__dirname, "packages/domain/src/index.ts"),
      "@xuyenviet/worker-domain/features/knowledge/capture-cache": resolve(__dirname, "packages/worker-domain/src/features/knowledge/capture-cache.ts"),
      "@xuyenviet/worker-domain/features/knowledge/capture-orchestration": resolve(__dirname, "packages/worker-domain/src/features/knowledge/capture-orchestration.ts"),
      "@xuyenviet/worker-domain/features/knowledge/capture-identity": resolve(__dirname, "packages/worker-domain/src/features/knowledge/capture-identity.ts"),
      "@xuyenviet/worker-domain/features/knowledge/facebook-capture": resolve(__dirname, "packages/worker-domain/src/features/knowledge/facebook-capture.ts"),
      "@xuyenviet/worker-domain/features/knowledge/youtube-capture": resolve(__dirname, "packages/worker-domain/src/features/knowledge/youtube-capture.ts"),
      "@xuyenviet/worker-domain": resolve(__dirname, "packages/worker-domain/src/index.ts"),
      "@/db": resolve(__dirname, "packages/database/src"),
      "@/features": resolve(__dirname, "packages/worker-domain/src/features"),
      "@/server": resolve(__dirname, "packages/worker-domain/src/server"),
    },
    tsconfigPaths: true,
  },
  test: {
    server: {
      deps: {
        inline: ["@xuyenviet/worker-domain"],
      },
    },
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
