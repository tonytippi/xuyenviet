import type { DiscoveryQuerySignalPortResult } from "@xuyenviet/domain";

// AI Ask owns this aggregate-only projection. It exposes no traveler content.
export async function readAiAskDiscoveryQuerySignals(): Promise<DiscoveryQuerySignalPortResult> {
  return { status: "available", signals: [] };
}
