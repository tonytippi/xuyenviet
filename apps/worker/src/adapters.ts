import { runWorkerAdapter } from "@xuyenviet/worker-domain/adapters";
import { consoleOperationalTelemetrySink, type OperationalTelemetrySink, type WorkerPollObservation } from "@xuyenviet/contracts";
import { closeDatabaseClient, createAiAskDiscoveryQuerySignalPort, createKnowledgeDiscoveryQuerySignalPort, createPostgresAdminKnowledgeIntakePort, createYoutubeCaptureEligibilityPort } from "@xuyenviet/database";
import { bindYoutubeDiscoveryExecutionPorts, bindYoutubeDiscoveryKnowledgeHandoff, bindYoutubeDiscoveryPlanningPorts } from "@xuyenviet/worker-domain";
import { closeSync, constants, openSync, writeSync } from "node:fs";
import { extname, isAbsolute, normalize, resolve, sep } from "node:path";

function testTelemetryFileSink(environment = process.env): OperationalTelemetrySink | undefined {
  const path = environment.XV_WORKER_TELEMETRY_FILE;
  const workspace = `${resolve(process.cwd())}${sep}`;
  if (environment.NODE_ENV !== "test" || !path || path.includes("\0") || !isAbsolute(path) || normalize(path) !== path || !path.startsWith(workspace) || extname(path) !== ".jsonl") return undefined;
  return {
    emit(event) {
      // Worker-domain validates and sanitizes this event before invoking its sink.
      try {
        const descriptor = openSync(path, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
        try { writeSync(descriptor, `${JSON.stringify(event)}\n`, null, "utf8"); } finally { closeSync(descriptor); }
      } catch {
        process.stderr.write("Worker telemetry file unavailable\n");
      }
    },
  };
}

async function main() {
  try {
    const youtubeDataApiKey = process.env.YOUTUBE_DATA_API_KEY?.trim();
    if (process.argv[2] === "discovery" && !youtubeDataApiKey) throw new Error("Worker YouTube Discovery configuration is invalid");
    bindYoutubeDiscoveryPlanningPorts(
      createKnowledgeDiscoveryQuerySignalPort(),
      createAiAskDiscoveryQuerySignalPort(),
    );
    bindYoutubeDiscoveryExecutionPorts(createYoutubeCaptureEligibilityPort(), undefined, youtubeDataApiKey);
    bindYoutubeDiscoveryKnowledgeHandoff(createPostgresAdminKnowledgeIntakePort().handoff);
    const observation = await runWorkerAdapter(process.argv.slice(2), { telemetry: testTelemetryFileSink() ?? actionableTelemetrySink });
    writeDiscoveryDiagnostic(observation);
  } catch {
    console.error("Worker adapter failed");
    process.exitCode = 1;
  } finally {
    await closeDatabaseClient();
  }
}

const actionableTelemetrySink: OperationalTelemetrySink = {
  emit(event) {
    if (["retry", "failure", "contended"].includes(event.resultCode)) return consoleOperationalTelemetrySink.emit(event);
  },
};

function writeDiscoveryDiagnostic(observation: WorkerPollObservation) {
  if (observation.capability !== "youtube.discovery" || !observation.durableId || !observation.diagnosticCode || !observation.diagnosticStage) return;
  const event = { capability: observation.capability, executionKind: observation.executionKind ?? "query_run", durableId: observation.durableId, resultCode: observation.resultCode, safeErrorCode: observation.diagnosticCode, lastStage: observation.diagnosticStage, ...(observation.diagnosticFailurePoint ? { failurePoint: observation.diagnosticFailurePoint } : {}), ...(observation.diagnosticFailureDetail ? { failureDetail: observation.diagnosticFailureDetail } : {}), retryCount: observation.retryCount ?? 0, leaseRecovery: observation.leaseRecovery ?? "none" };
  process.stderr.write(`youtube_discovery_diagnostic ${JSON.stringify(event)}\n`);
}

await main();
