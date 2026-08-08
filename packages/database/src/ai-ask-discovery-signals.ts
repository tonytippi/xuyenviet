import type { AiAskDiscoveryQuerySignalPort, DiscoveryQuerySignalPortResult } from "@xuyenviet/domain";

// AI Ask owns this aggregate-only projection. It exposes no traveler content.
export function createAiAskDiscoveryQuerySignalPort(): AiAskDiscoveryQuerySignalPort {
  return { async readSignals(): Promise<DiscoveryQuerySignalPortResult> {
    return { status: "available", signals: [] };
  } };
}
