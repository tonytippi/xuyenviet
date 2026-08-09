import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("YouTube Discovery owner-port composition", () => {
  test("the Worker binds the two owner-published ports directly", async () => {
    const adapter = await readFile(resolve(root, "apps/worker/src/adapters.ts"), "utf8");
    expect(adapter).toContain("createYoutubeCaptureEligibilityPort");
    expect(adapter).toContain("createKnowledgeDiscoveryQuerySignalPort(),");
    expect(adapter).toContain("createAiAskDiscoveryQuerySignalPort(),");
    expect(adapter).toContain("bindYoutubeDiscoveryExecutionPorts(createYoutubeCaptureEligibilityPort());");
    expect(adapter).not.toMatch(/read(?:Knowledge|AiAsk)DiscoveryQuerySignals/);
    const execution = await readFile(resolve(root, "packages/worker-domain/src/features/youtube-discovery/execution.ts"), "utf8");
    expect(execution).not.toMatch(/captureMethodVersion|payloadSchemaVersion|youtube-gemini-windowed/);
  });

  test("Discovery has no direct Knowledge or AI Ask persistence dependency", async () => {
    const discovery = await readFile(resolve(root, "packages/database/src/youtube-discovery/index.ts"), "utf8");
    expect(discovery).not.toMatch(/(?:knowledgeCards|knowledgeIngestion|messages|conversations|answerUsefulness|assistantResponseProvenance|sourceCaptureVersions|sources)/);
    expect(discovery).not.toMatch(/(?:knowledge-discovery-signals|ai-ask-discovery-signals)/);
  });

  test("AI Ask demand threshold counts distinct travelers, not repeated decisions", async () => {
    const port = await readFile(resolve(root, "packages/database/src/ai-ask-discovery-signals.ts"), "utf8");
    expect(port).toContain("count(distinct ${assistantRetrievalDecisions.userId})::int");
    expect(port).not.toContain("count(*)::int");
  });
});
