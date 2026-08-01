import {
  processAiAskDomainOutboxBatch,
  runApprovedKnowledgeIndexingWorkerLoop,
  runKnowledgeExtractionWorkerLoop,
  runKnowledgeIngestionWorkerLoop,
} from "./index";
import { correlationId, emitOperationalTelemetry, isOperationalTelemetryEvent, type OperationalTelemetrySink, type WorkerPollObservation } from "@xuyenviet/contracts";

export function parseWorkerArguments(argv: string[]) {
  if (argv.length !== 3 || !["extraction", "ingestion", "indexing", "outbox"].includes(argv[0]) || argv[1] !== "--once" || !argv[2].startsWith("--worker-id=")) {
    throw new Error("Usage: <extraction|ingestion|indexing|outbox> --once --worker-id=<safe-id>");
  }
  const workerId = argv[2].slice("--worker-id=".length);
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(workerId)) throw new Error("Worker ID is invalid.");
  return { kind: argv[0] as "extraction" | "ingestion" | "indexing" | "outbox", workerId };
}

export async function runWorkerAdapter(argv: string[], options: { telemetry?: OperationalTelemetrySink; runPoll?: (kind: "extraction" | "ingestion" | "indexing" | "outbox", workerId: string) => Promise<WorkerPollObservation | WorkerPollObservation[]> } = {}) {
  const { kind, workerId } = parseWorkerArguments(argv);
  const startedAt = Date.now();
  try {
    const observation = options.runPoll ? await options.runPoll(kind, workerId) : await runPoll(kind, workerId);
    for (const item of Array.isArray(observation) ? observation : [observation]) emitPoll(options.telemetry, item, startedAt);
    return Array.isArray(observation) ? observation.at(-1)! : observation;
  } catch (error) {
    emitPoll(options.telemetry, { capability: capabilityFor(kind), resultCode: "failure" }, startedAt);
    throw error;
  }
}

function emitPoll(sink: OperationalTelemetrySink | undefined, observation: WorkerPollObservation, startedAt: number) {
  if (!sink) return;
  const event = {
    correlationId: correlationId(), capability: observation.capability, principalClass: "system", resultCode: observation.resultCode,
    latencyMs: Math.min(Date.now() - startedAt, 86_400_000), ...(observation.durableId ? { durableId: observation.durableId } : {}),
    ...(observation.jobLagMs === undefined ? {} : { jobLagMs: Math.min(Math.max(0, Math.trunc(observation.jobLagMs)), 31_536_000_000) }), ...(observation.retryCount === undefined ? {} : { retryCount: observation.retryCount }),
    ...(observation.leaseRecovery ? { leaseRecovery: observation.leaseRecovery } : {}),
    ...(observation.leaseRecoveryCount === undefined ? {} : { leaseRecoveryCount: observation.leaseRecoveryCount }),
  };
  if (!isOperationalTelemetryEvent(event)) return;
  emitOperationalTelemetry(sink, event);
}

async function runPoll(kind: "extraction" | "ingestion" | "indexing" | "outbox", workerId: string): Promise<WorkerPollObservation | WorkerPollObservation[]> {
  // Each feature owns its observation and derives it while its claim/recovery
  // facts are still available. This adapter only selects the continuous loop.
  const observations: WorkerPollObservation[] = [];
  const observe = (value: WorkerPollObservation) => { observations.push(value); };
  if (kind === "extraction") await runKnowledgeExtractionWorkerLoop({ once: true, workerId, onObservation: observe });
  else if (kind === "ingestion") await runKnowledgeIngestionWorkerLoop({ once: true, workerId, onObservation: observe });
  else if (kind === "indexing") await runApprovedKnowledgeIndexingWorkerLoop({ once: true, workerId, onObservation: observe });
  else await processAiAskDomainOutboxBatch({ workerId, onObservation: observe });
  if (!observations.length) throw new Error("Worker poll completed without an observation.");
  return observations.length === 1 ? observations[0]! : observations;
}

function capabilityFor(kind: "extraction" | "ingestion" | "indexing" | "outbox"): WorkerPollObservation["capability"] {
  return ({ extraction: "knowledge.extraction", ingestion: "knowledge.ingestion", indexing: "knowledge.indexing", outbox: "ai_ask.outbox" } as const)[kind];
}
