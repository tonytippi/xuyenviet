import type { DiscoveryQuerySignalPortResult } from "@xuyenviet/domain";

// Knowledge owns this aggregate-only projection. Until it publishes a bounded
// signal, an available empty result accurately represents no current need.
export async function readKnowledgeDiscoveryQuerySignals(): Promise<DiscoveryQuerySignalPortResult> {
  return { status: "available", signals: [] };
}
