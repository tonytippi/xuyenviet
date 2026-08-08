import type { DiscoveryQuerySignalPortResult, KnowledgeDiscoveryQuerySignalPort } from "@xuyenviet/domain";

// Knowledge owns this aggregate-only projection. Until it publishes a bounded
// signal, an available empty result accurately represents no current need.
export function createKnowledgeDiscoveryQuerySignalPort(): KnowledgeDiscoveryQuerySignalPort {
  return { async readSignals(): Promise<DiscoveryQuerySignalPortResult> {
    return { status: "available", signals: [] };
  } };
}
