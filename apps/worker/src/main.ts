import { createChildProcessAdapters, readWorkerConfig, WorkerRuntime } from "./runtime";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

loadLocalEnvironment();

export function installShutdownHandlers(
  runtime: Pick<WorkerRuntime, "drain">,
  signals: { on(signal: NodeJS.Signals, listener: () => void): unknown } = process,
  exit: (code: number) => never = process.exit,
) {
  let shutdown: Promise<void> | undefined;
  const drain = () => {
    shutdown ??= runtime.drain().then(() => { exit(0); });
    return shutdown;
  };
  signals.on("SIGTERM", drain);
  signals.on("SIGINT", drain);
  return drain;
}

async function main() {
  if (process.argv.length !== 2) throw new Error("Worker does not accept command-line arguments.");
  let config;
  try { config = readWorkerConfig(); } catch { config = undefined; }
  const safePort = Number(process.env.WORKER_PORT);
  const runtime = new WorkerRuntime(config, config ? createChildProcessAdapters() : [], undefined, Number.isInteger(safePort) && safePort >= 1 && safePort <= 65535 ? safePort : 3002);
  installShutdownHandlers(runtime);
  await runtime.start();
}

function loadLocalEnvironment() {
  const sourceDirectory = dirname(fileURLToPath(import.meta.url));
  const environmentFile = resolve(sourceDirectory, "..", ".env.local");
  if (existsSync(environmentFile)) loadEnvFile(environmentFile);
}

if (process.argv[1]?.endsWith("main.ts") || process.argv[1]?.endsWith("main.mjs")) {
  main().catch(() => process.exit(1));
}
