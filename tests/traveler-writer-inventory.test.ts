import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

describe("traveler writer inventory", () => {
  test("removes root traveler writers while retaining the root-admin Auth.js sign-out boundary", () => {
    expect(existsSync(projectPath("src/features/referrals/attribution.ts"))).toBe(false);
    expect(existsSync(projectPath("src/features/chat-trips/trip-proposal-expiry-worker.ts"))).toBe(false);
    expect(existsSync(projectPath("src/features/chat-trips/context-extraction.ts"))).toBe(false);

    const travelerSources = [
      "src/app/ai-ask/page.tsx",
      "src/app/sign-in/page.tsx",
      "src/features/chat-trips/direct-shell-loader.tsx",
      "src/features/ai/direct-api-client.ts",
    ].map(readProjectSource).join("\n");

    expect(travelerSources).not.toContain("@/features/auth/actions");
    expect(travelerSources).not.toContain("@/features/referrals/attribution");

    const rootTravelerModules = [
      "src/features/chat-trips/conversations.ts",
      "src/features/chat-trips/trip-projects.ts",
      "src/features/chat-trips/trip-change-proposals.ts",
    ].map(readProjectSource);
    const retiredRootCommands = [
      "deleteOwnedConversation",
      "createTripProject",
      "deleteOwnedTripProject",
      "resolveOwnedPrimaryConversation",
      "createInternalTripPlanItem",
      "createTripPlanItemInTransaction",
      "upsertInternalTripProjectConstraints",
      "upsertInternalTripProjectConstraintsInTransaction",
      "updateInternalTripPlanItem",
      "updateTripPlanItemInTransaction",
      "deleteInternalTripPlanItem",
      "deleteTripPlanItemInTransaction",
      "reorderInternalTripPlanItem",
      "reorderTripPlanItemInTransaction",
      "changeInternalTripPlanItemStateInTransaction",
      "persistAiTripChangeProposalDraft",
      "persistAiTripChangeProposalDraftInTransaction",
      "processNextExpiredTripChangeProposal",
      "runTripChangeProposalExpiryWorkerLoop",
    ];
    for (const source of rootTravelerModules) {
      expect(source).not.toMatch(/\.(?:insert|update|delete)\s*\(/);
      expect(source).not.toContain(".transaction(");
      for (const command of retiredRootCommands) expect(source).not.toContain(`function ${command}`);
    }

    const adminLayout = readProjectSource("src/app/admin/layout.tsx");
    const authActions = readProjectSource("src/features/auth/actions.ts");
    expect(adminLayout).toContain("signOutCurrentUser");
    expect(authActions).toContain("signOutCurrentUser");
    expect(authActions).not.toContain("signInWithGoogle");
  });

  test("keeps worker entrypoints independent of retired root traveler writers", () => {
    const workerSources = [...sourceFiles(projectPath("apps/worker")), projectPath("scripts/trip-proposal-expiry.ts")].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(workerSources).not.toContain("@/features/chat-trips/conversations");
    expect(workerSources).not.toContain("@/features/chat-trips/trip-projects");
    expect(workerSources).not.toContain("@/features/referrals/attribution");
    expect(workerSources).not.toContain("@/features/chat-trips/trip-proposal-expiry-worker");
  });
});

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function projectPath(path: string) {
  return join(projectRoot, path);
}

function readProjectSource(path: string) {
  return readFileSync(projectPath(path), "utf8");
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}
