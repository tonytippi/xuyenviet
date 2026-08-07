import { parseDiscoveryQuerySignalPortResult, type AiAskDiscoveryQuerySignalPort, type DiscoveryQuerySignalPortResult, type KnowledgeDiscoveryQuerySignalPort } from "@xuyenviet/domain";

type OwnerPublishedSignalReader = () => Promise<unknown>;

// Knowledge and AI Ask own their aggregate projections. Discovery only adapts a
// supplied, validated port and never reads either aggregate's persistence.
function ownerPublishedPort(read: OwnerPublishedSignalReader): { readSignals(): Promise<DiscoveryQuerySignalPortResult> } {
  return { async readSignals() {
    try {
      const result = parseDiscoveryQuerySignalPortResult(await read());
      return result ?? { status: "unavailable", code: "source_invalid" };
    } catch { return { status: "unavailable", code: "source_unavailable" }; }
  } };
}

export function createKnowledgeDiscoveryQuerySignalPort(read: OwnerPublishedSignalReader): KnowledgeDiscoveryQuerySignalPort {
  return ownerPublishedPort(read);
}

export function createAiAskDiscoveryQuerySignalPort(read: OwnerPublishedSignalReader): AiAskDiscoveryQuerySignalPort {
  return ownerPublishedPort(read);
}
