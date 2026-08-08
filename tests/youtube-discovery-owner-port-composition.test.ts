import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("YouTube Discovery owner-port composition", () => {
  test("the Worker binds the two owner-published ports directly", async () => {
    const adapter = await readFile(resolve(root, "apps/worker/src/adapters.ts"), "utf8");
    expect(adapter).toContain('import { closeDatabaseClient, createAiAskDiscoveryQuerySignalPort, createKnowledgeDiscoveryQuerySignalPort } from "@xuyenviet/database";');
    expect(adapter).toContain("createKnowledgeDiscoveryQuerySignalPort(),");
    expect(adapter).toContain("createAiAskDiscoveryQuerySignalPort(),");
    expect(adapter).not.toMatch(/read(?:Knowledge|AiAsk)DiscoveryQuerySignals/);
  });

  test("Discovery has no direct Knowledge or AI Ask persistence dependency", async () => {
    const discovery = await readFile(resolve(root, "packages/database/src/youtube-discovery/index.ts"), "utf8");
    expect(discovery).not.toMatch(/(?:knowledgeCards|knowledgeIngestion|messages|conversations|answerUsefulness|assistantResponseProvenance)/);
    expect(discovery).not.toMatch(/(?:knowledge-discovery-signals|ai-ask-discovery-signals)/);
  });
});
