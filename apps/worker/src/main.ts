import { createChildProcessAdapters, readWorkerConfig, WorkerRuntime } from "./runtime";

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

main().catch(() => process.exit(1));
