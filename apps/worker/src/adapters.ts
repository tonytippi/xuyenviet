import { runWorkerAdapter } from "@xuyenviet/worker-domain/adapters";
import { consoleOperationalTelemetrySink, type OperationalTelemetrySink } from "@xuyenviet/contracts";
import { closeDatabaseClient, createAiAskDiscoveryQuerySignalPort, createKnowledgeDiscoveryQuerySignalPort } from "@xuyenviet/database";
import { bindYoutubeDiscoveryPlanningPorts } from "@xuyenviet/worker-domain";
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
    bindYoutubeDiscoveryPlanningPorts(
      createKnowledgeDiscoveryQuerySignalPort(),
      createAiAskDiscoveryQuerySignalPort(),
    );
    await runWorkerAdapter(process.argv.slice(2), { telemetry: testTelemetryFileSink() ?? consoleOperationalTelemetrySink });
  } catch {
    console.error("Worker adapter failed");
    process.exitCode = 1;
  } finally {
    await closeDatabaseClient();
  }
}

await main();
