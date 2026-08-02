import { createServer, type Server } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Socket } from "node:net";

import postgres from "postgres";
import { readApprovedSchemaReleasePhasePolicy } from "@xuyenviet/config";
import { admitsSchemaReleasePhasePolicy, consoleOperationalTelemetrySink, correlationId, emitOperationalTelemetry, evaluateSchemaAdmission, schemaCompatibilityDeclarations, type OperationalTelemetrySink, type SchemaReleasePhasePolicy } from "@xuyenviet/contracts";

const adapterNames = ["knowledge-extraction", "knowledge-ingestion", "knowledge-indexing", "ai-ask-outbox"] as const;
type AdapterName = (typeof adapterNames)[number];

export type WorkerConfig = { databaseUrl: string; port: number; gracefulShutdownMs: number; pollIntervalMs: number };
export type WorkerAdapter = { name: AdapterName; run: (signal: AbortSignal) => Promise<void>; forceStop?: () => void };

export function readWorkerConfig(environment: { DATABASE_URL?: string; WORKER_PORT?: string; WORKER_GRACEFUL_SHUTDOWN_MS?: string; WORKER_SUPERVISOR_POLL_MS?: string } = process.env as { DATABASE_URL?: string; WORKER_PORT?: string; WORKER_GRACEFUL_SHUTDOWN_MS?: string; WORKER_SUPERVISOR_POLL_MS?: string }): WorkerConfig {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl || !isPostgresUrl(databaseUrl)) throw new Error("Worker configuration is invalid.");
  return {
    databaseUrl,
    port: boundedInteger(environment.WORKER_PORT, 3002, 1, 65535),
    gracefulShutdownMs: boundedInteger(environment.WORKER_GRACEFUL_SHUTDOWN_MS, 30_000, 1_000, 120_000),
    pollIntervalMs: boundedInteger(environment.WORKER_SUPERVISOR_POLL_MS, 5_000, 1_000, 60_000),
  };
}

// These are independently compiled adapter entrypoints. The supervisor never
// executes root TypeScript through tsx, so its lifecycle surface stays isolated.
export function createChildProcessAdapters(root = resolve(fileURLToPath(new URL("../../..", import.meta.url)))): WorkerAdapter[] {
  return [
    childAdapter("knowledge-extraction", ["node", "apps/worker/dist/adapters/extraction.mjs", "extraction", "--once", `--worker-id=worker-extraction-${process.pid}`], root),
    childAdapter("knowledge-ingestion", ["node", "apps/worker/dist/adapters/ingestion.mjs", "ingestion", "--once", `--worker-id=worker-ingestion-${process.pid}`], root),
    childAdapter("knowledge-indexing", ["node", "apps/worker/dist/adapters/indexing.mjs", "indexing", "--once", `--worker-id=worker-indexing-${process.pid}`], root),
    childAdapter("ai-ask-outbox", ["node", "apps/worker/dist/adapters/outbox.mjs", "outbox", "--once", `--worker-id=worker-outbox-${process.pid}`], root),
  ];
}

export class WorkerRuntime {
  private readonly states = new Map<AdapterName, "uninitialized" | "ready" | "failed" | "stopped">();
  private readonly controller = new AbortController();
  private server: Server | undefined;
  private readonly sockets = new Set<Socket>();
  private draining = false;
  private databaseReady = false;
  private schemaReady = false;
  private schemaEpoch = 0;
  private drainPromise: Promise<void> | undefined;
  private running = new Set<Promise<void>>();
  private readonly activeAdapters = new Set<AdapterName>();
  private readonly scheduledAdapters = new Map<AdapterName, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly config: WorkerConfig | undefined,
    private readonly adapters: WorkerAdapter[],
    private readonly probeDatabase: () => Promise<void> = () => config ? probePostgres(config.databaseUrl) : Promise.reject(new Error("invalid configuration")),
    private readonly healthPortFallback = 3002,
    private readonly probeSchema: () => Promise<boolean> = () => config ? probeSchemaCompatibility(config.databaseUrl, readWorkerReleasePhasePolicy()) : Promise.resolve(false),
    private readonly telemetry: OperationalTelemetrySink = consoleOperationalTelemetrySink,
  ) {
    for (const adapter of adapters) this.states.set(adapter.name, "uninitialized");
  }

  async start() {
    this.server = createServer((request, response) => this.respondHealth(request.url, response));
    this.server.on("connection", (socket) => { this.sockets.add(socket); socket.once("close", () => this.sockets.delete(socket)); });
    await new Promise<void>((resolve, reject) => this.server!.once("error", reject).listen(this.config?.port ?? this.healthPortFallback, "0.0.0.0", resolve));
    this.emit("worker.startup", this.config ? "success" : "failure", Date.now());
    if (!this.config) return;
    void this.probeUntilReady();
  }

  drain() {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.drainInternal();
    return this.drainPromise;
  }

  private async drainInternal() {
    this.draining = true;
    this.emit("worker.drain", "draining", Date.now());
    this.controller.abort();
    for (const timer of this.scheduledAdapters.values()) clearTimeout(timer);
    this.scheduledAdapters.clear();
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const completed = await Promise.race([
      Promise.allSettled([...this.running]),
      new Promise<"deadline">((resolve) => { deadlineTimer = setTimeout(() => resolve("deadline"), this.config?.gracefulShutdownMs ?? 1_000); }),
    ]);
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (completed === "deadline") {
      for (const adapter of this.adapters) {
        try {
          adapter.forceStop?.();
        } catch {
          // A broken adapter cannot prevent sibling termination or health teardown.
        }
      }
      // Do not await forced work: a broken adapter must not defeat the graceful
      // deadline. Its persisted lease or stale-recovery protocol owns recovery.
    }
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()) ?? resolve());
  }

  get ready() {
    return Boolean(this.config) && !this.draining && this.databaseReady && this.schemaReady && this.adapters.length === adapterNames.length && this.adapters.every((adapter) => this.states.get(adapter.name) === "ready");
  }

  get healthPort() {
    const address = this.server?.address();
    return address && typeof address !== "string" ? address.port : undefined;
  }

  private admit(adapter: WorkerAdapter) {
    if (this.draining || !this.schemaReady || this.activeAdapters.has(adapter.name)) return;
    this.activeAdapters.add(adapter.name);
    const restarted = this.states.get(adapter.name) === "failed";
    const startedAt = Date.now();
    const epoch = this.schemaEpoch;
    const task = adapter.run(this.controller.signal)
      .then(() => { if (this.schemaReady && epoch === this.schemaEpoch) this.states.set(adapter.name, "ready"); })
      .catch(() => { if (epoch === this.schemaEpoch) this.states.set(adapter.name, "failed"); })
      .finally(() => {
        this.running.delete(task);
        this.activeAdapters.delete(adapter.name);
        if (restarted) this.emit("worker.restart", "restarted", startedAt);
        this.schedule(adapter);
      });
    this.running.add(task);
  }

  private schedule(adapter: WorkerAdapter) {
    if (this.draining || !this.schemaReady || this.activeAdapters.has(adapter.name) || this.scheduledAdapters.has(adapter.name)) return;
    const timer = setTimeout(() => {
      this.scheduledAdapters.delete(adapter.name);
      this.admit(adapter);
    }, this.config!.pollIntervalMs);
    this.scheduledAdapters.set(adapter.name, timer);
  }

  private respondHealth(url: string | undefined, response: import("node:http").ServerResponse) {
    if (url === "/health/live") return this.json(response, 200, { status: "ok" });
    if (url === "/health/ready") return this.json(response, this.ready ? 200 : 503, this.ready ? { status: "ok" } : { status: "not_ready", reason: this.readyReason() });
    this.json(response, 404, { status: "not_found" });
  }

  private readyReason() {
    if (this.draining) return "draining";
    if (!this.config) return "configuration_invalid";
    if (!this.databaseReady) return "database_unavailable";
    if (!this.schemaReady) return "schema_incompatible";
    if ([...this.states.values()].some((state) => state === "failed")) return "loop_failed";
    return "loop_uninitialized";
  }

  private async probeUntilReady() {
    while (!this.draining) {
      try {
        await this.probeDatabase();
        if (this.draining) return;
        this.databaseReady = true;
        let schemaReady = false;
        try { schemaReady = await this.probeSchema(); } catch { schemaReady = false; }
        if (this.draining) return;
        if (!schemaReady) {
          this.emit("worker.schema", "schema_incompatible", Date.now());
          if (this.schemaReady) {
            this.schemaEpoch += 1;
            for (const adapter of this.adapters) if (!this.activeAdapters.has(adapter.name)) this.states.set(adapter.name, "uninitialized");
          }
          this.schemaReady = false;
        } else if (!this.schemaReady) {
          this.schemaReady = true;
          for (const adapter of this.adapters) this.states.set(adapter.name, "uninitialized");
          for (const adapter of this.adapters) this.admit(adapter);
        }
      } catch {
        this.databaseReady = false;
        this.schemaReady = false;
      }
      await sleep(this.config!.pollIntervalMs, this.controller.signal);
    }
  }

  private json(response: import("node:http").ServerResponse, status: number, body: object) {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  }

  private emit(capability: string, resultCode: string, startedAt: number) {
    const workerCapability = ({ "knowledge-extraction": "knowledge.extraction", "knowledge-ingestion": "knowledge.ingestion", "knowledge-indexing": "knowledge.indexing", "ai-ask-outbox": "ai_ask.outbox" } as Record<string, string>)[capability] ?? capability;
    emitOperationalTelemetry(this.telemetry, { correlationId: correlationId(), capability: workerCapability, principalClass: "system", resultCode, latencyMs: Math.min(Date.now() - startedAt, 86_400_000) });
  }
}

function childAdapter(name: AdapterName, [command, ...args]: string[], cwd: string): WorkerAdapter {
  let child: ChildProcess | undefined;
  return {
    name,
    run: (signal) => runChild(command, args, cwd, signal, (process) => { child = process; }),
    forceStop: () => child?.kill("SIGKILL"),
  };
}

function runChild(command: string, args: string[], cwd: string, signal: AbortSignal, onSpawn: (child: ChildProcess) => void) {
  return new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawn(command, args, { cwd, env: process.env, stdio: "inherit" });
    onSpawn(child);
    const stop = () => child.kill("SIGTERM");
    signal.addEventListener("abort", stop, { once: true });
    child.once("error", reject);
    child.once("exit", (code) => {
      signal.removeEventListener("abort", stop);
      if (signal.aborted || code === 0) resolve();
      else reject(new Error("Worker adapter exited."));
    });
  });
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

async function probePostgres(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try { await sql`select 1`; } finally { await sql.end({ timeout: 5 }); }
}

async function probeSchemaCompatibility(databaseUrl: string, policy?: SchemaReleasePhasePolicy | null) {
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    const rows = await sql<{ version: string | null; identity: string }[]>`select release_schema_versions.version, target.identity from (select 'database=' || current_database() || ';host=' || coalesce(host(inet_server_addr()), 'local') || ';port=' || coalesce(inet_server_port()::text, '5432') as identity) target left join release_schema_versions on true`;
    const target = rows[0]?.identity;
    const versions = rows.flatMap((row) => typeof row.version === "string" ? [{ version: row.version }] : []);
    return evaluateSchemaAdmission(schemaCompatibilityDeclarations.worker, versions).compatible && admitsSchemaReleasePhasePolicy(policy, "worker", versions, target);
  } finally { await sql.end({ timeout: 5 }); }
}

export function readWorkerReleasePhasePolicy(value = process.env.SCHEMA_RELEASE_PHASE_POLICY): SchemaReleasePhasePolicy | null | undefined {
  return readApprovedSchemaReleasePhasePolicy(value);
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error("Worker configuration is invalid.");
  return parsed;
}

function isPostgresUrl(value: string) {
  try { const url = new URL(value); return ["postgres:", "postgresql:"].includes(url.protocol) && Boolean(url.hostname) && url.pathname !== "/"; } catch { return false; }
}
