import { get } from "node:http";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { WorkerRuntime, readWorkerConfig, type WorkerAdapter } from "../apps/worker/src/runtime";
import { installShutdownHandlers } from "../apps/worker/src/main";
import { parseSchemaReleasePhasePolicy } from "@xuyenviet/contracts";

const config = { databaseUrl: "postgresql://worker:secret@localhost:5432/xuyenviet", port: 0, gracefulShutdownMs: 1_000, pollIntervalMs: 5_000 };

function adapter(name: WorkerAdapter["name"], run: WorkerAdapter["run"]): WorkerAdapter {
  return { name, run };
}

function request(url: string) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(body) }));
    }).once("error", reject);
  });
}

describe("WorkerRuntime", () => {
  it("keeps liveness independent and readiness fail-closed until all adapters complete a poll", async () => {
    let resolveExtraction: (() => void) | undefined;
    const waitExtraction = new Promise<void>((resolve) => { resolveExtraction = resolve; });
    const runtime = new WorkerRuntime(config, [
      adapter("knowledge-extraction", () => waitExtraction),
      adapter("knowledge-ingestion", async () => undefined),
      adapter("knowledge-indexing", async () => undefined),
      adapter("ai-ask-outbox", async () => undefined),
    ], async () => undefined, 3002, async () => true);
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const base = `http://127.0.0.1:${runtime.healthPort}`;
    expect((await request(`${base}/health/live`)).status).toBe(200);
    expect((await request(`${base}/health/ready`)).body).toEqual({ status: "not_ready", reason: "loop_uninitialized" });
    resolveExtraction?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await request(`${base}/health/ready`)).status).toBe(200);
    await runtime.drain();
  });

  it("remains live but not ready when configuration dependencies fail", async () => {
    const runtime = new WorkerRuntime(config, [], async () => { throw new Error("database url must not leak"); }, 3002, async () => true);
    await runtime.start();
    const base = `http://127.0.0.1:${runtime.healthPort}`;
    expect((await request(`${base}/health/live`)).status).toBe(200);
    expect((await request(`${base}/health/ready`)).body).toEqual({ status: "not_ready", reason: "database_unavailable" });
    await runtime.drain();
  });

  it("keeps liveness available and does not admit adapters when configuration is invalid", async () => {
    let admitted = false;
    const runtime = new WorkerRuntime(undefined, [adapter("knowledge-extraction", async () => { admitted = true; })], undefined, 0);
    await runtime.start();
    const base = `http://127.0.0.1:${runtime.healthPort}`;
    expect((await request(`${base}/health/live`)).status).toBe(200);
    expect((await request(`${base}/health/ready`)).body).toEqual({ status: "not_ready", reason: "configuration_invalid" });
    expect(admitted).toBe(false);
    await runtime.drain();
  });

  it("fails readiness when an adapter poll fails and retries database probes without overlap", async () => {
    let probes = 0;
    let concurrentProbes = 0;
    let maxConcurrentProbes = 0;
    const runtime = new WorkerRuntime({ ...config, pollIntervalMs: 5 }, [
      adapter("knowledge-extraction", async () => { throw new Error("failed poll"); }),
      adapter("knowledge-ingestion", async () => undefined),
      adapter("knowledge-indexing", async () => undefined),
      adapter("ai-ask-outbox", async () => undefined),
    ], async () => {
      concurrentProbes += 1;
      maxConcurrentProbes = Math.max(maxConcurrentProbes, concurrentProbes);
      probes += 1;
      await new Promise((resolve) => setTimeout(resolve, 1));
      concurrentProbes -= 1;
      if (probes === 1) throw new Error("temporarily unavailable");
    }, 3002, async () => true);
    await runtime.start();
    const base = `http://127.0.0.1:${runtime.healthPort}`;
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect((await request(`${base}/health/ready`)).body).toEqual({ status: "not_ready", reason: "loop_failed" });
    expect(probes).toBeGreaterThan(1);
    expect(maxConcurrentProbes).toBe(1);
    await runtime.drain();
  });

  it("marks readiness non-ready and admits no additional work after drain", async () => {
    let calls = 0;
    let resolveWork: (() => void) | undefined;
    const work = new Promise<void>((resolve) => { resolveWork = resolve; });
    const runtime = new WorkerRuntime(config, [
      adapter("knowledge-extraction", async () => { calls += 1; await work; }),
      adapter("knowledge-ingestion", async () => undefined),
      adapter("knowledge-indexing", async () => undefined),
      adapter("ai-ask-outbox", async () => undefined),
    ], async () => undefined, 3002, async () => true);
    await runtime.start();
    await vi.waitFor(() => expect(calls).toBe(1));
    const base = `http://127.0.0.1:${runtime.healthPort}`;
    const draining = runtime.drain();
    expect((await request(`${base}/health/ready`)).body).toEqual({ status: "not_ready", reason: "draining" });
    resolveWork?.();
    await draining;
    expect(calls).toBe(1);
  });

  it("escalates a non-exiting adapter at the graceful deadline", async () => {
    let forceStopped = false;
    let finish: (() => void) | undefined;
    const running = new Promise<void>((resolve) => { finish = resolve; });
    const runtime = new WorkerRuntime({ ...config, gracefulShutdownMs: 5 }, [
      { name: "knowledge-extraction", run: async () => running, forceStop: () => { forceStopped = true; finish?.(); } },
      adapter("knowledge-ingestion", async () => undefined),
      adapter("knowledge-indexing", async () => undefined),
      adapter("ai-ask-outbox", async () => undefined),
    ], async () => undefined, 3002, async () => true);
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await runtime.drain();
    expect(forceStopped).toBe(true);
  });

  it("returns from drain at the deadline even if a forced adapter never settles", async () => {
    let started = false;
    const forceStop = vi.fn();
    const runtime = new WorkerRuntime({ ...config, gracefulShutdownMs: 5 }, [
      { name: "knowledge-extraction", run: async () => { started = true; await new Promise<void>(() => undefined); }, forceStop },
      adapter("knowledge-ingestion", async () => undefined), adapter("knowledge-indexing", async () => undefined), adapter("ai-ask-outbox", async () => undefined),
    ], async () => undefined, 3002, async () => true);
    await runtime.start();
    await vi.waitFor(() => expect(started).toBe(true));
    await expect(runtime.drain()).resolves.toBeUndefined();
    expect(forceStop).toHaveBeenCalledTimes(1);
  });

  it("continues forced stops and closes health when an adapter force stop throws", async () => {
    let extractionStarted = false;
    let ingestionStarted = false;
    const throwingForceStop = vi.fn(() => { throw new Error("force stop failed"); });
    const remainingForceStop = vi.fn();
    const neverSettles = () => new Promise<void>(() => undefined);
    const runtime = new WorkerRuntime({ ...config, gracefulShutdownMs: 5 }, [
      { name: "knowledge-extraction", run: async () => { extractionStarted = true; await neverSettles(); }, forceStop: throwingForceStop },
      { name: "knowledge-ingestion", run: async () => { ingestionStarted = true; await neverSettles(); }, forceStop: remainingForceStop },
      adapter("knowledge-indexing", async () => undefined),
      adapter("ai-ask-outbox", async () => undefined),
    ], async () => undefined, 3002, async () => true);
    await runtime.start();
    await vi.waitFor(() => expect(extractionStarted && ingestionStarted).toBe(true));
    const healthUrl = `http://127.0.0.1:${runtime.healthPort}/health/live`;

    await expect(runtime.drain()).resolves.toBeUndefined();

    expect(throwingForceStop).toHaveBeenCalledTimes(1);
    expect(remainingForceStop).toHaveBeenCalledTimes(1);
    await expect(request(healthUrl)).rejects.toThrow();
  });

  it("makes concurrent callers wait for the same graceful drain", async () => {
    let started = false;
    let finish!: () => void;
    const running = new Promise<void>((resolve) => { finish = resolve; });
    const runtime = new WorkerRuntime(config, [
      { name: "knowledge-extraction", run: async () => { started = true; await running; } },
      adapter("knowledge-ingestion", async () => undefined),
      adapter("knowledge-indexing", async () => undefined),
      adapter("ai-ask-outbox", async () => undefined),
    ], async () => undefined, 3002, async () => true);
    await runtime.start();
    await vi.waitFor(() => expect(started).toBe(true));

    const firstDrain = runtime.drain();
    const secondDrain = runtime.drain();
    let secondCompleted = false;
    void secondDrain.then(() => { secondCompleted = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(secondCompleted).toBe(false);

    finish();
    await Promise.all([firstDrain, secondDrain]);
  });

  it("validates worker configuration without exposing the database URL", () => {
    expect(() => readWorkerConfig({ DATABASE_URL: "not-a-url" })).toThrow("Worker configuration is invalid.");
    expect(readWorkerConfig({ DATABASE_URL: "postgresql://worker:secret@localhost:5432/xuyenviet", WORKER_PORT: "3002" }).port).toBe(3002);
  });

  it("blocks every adapter until schema compatibility succeeds and stops future admissions when it is lost", async () => {
    let compatible = false;
    let calls = 0;
    const runtime = new WorkerRuntime({ ...config, pollIntervalMs: 5 }, [
      adapter("knowledge-extraction", async () => { calls += 1; }),
      adapter("knowledge-ingestion", async () => { calls += 1; }),
      adapter("knowledge-indexing", async () => { calls += 1; }),
      adapter("ai-ask-outbox", async () => { calls += 1; }),
    ], async () => undefined, 3002, async () => compatible);
    await runtime.start();
    const base = `http://127.0.0.1:${runtime.healthPort}`;
    await new Promise((resolve) => setTimeout(resolve, 1));
    expect((await request(`${base}/health/ready`)).body).toEqual({ status: "not_ready", reason: "schema_incompatible" });
    expect(calls).toBe(0);
    compatible = true;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toBeGreaterThanOrEqual(4);
    compatible = false;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await request(`${base}/health/ready`)).body).toEqual({ status: "not_ready", reason: "schema_incompatible" });
    const callsAfterLoss = calls;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toBe(callsAfterLoss);
    await runtime.drain();
  });

  it("does not start adapters or claim work when the release phase policy excludes worker", async () => {
    let calls = 0;
    const policy = parseSchemaReleasePhasePolicy({ releaseId: "schema-20260728.1-to-20260729.1", matrixPath: "20260728.1-to-20260729.1.json", matrixDigest: "a".repeat(64), target: { environment: "staging", identityClass: "durable", resolvedIdentity: "database=xuyenviet;host=10.0.0.1;port=5432" }, phase: "contract", workloads: {
      web: { workload: "web", minimumVersion: "20260728.1", maximumVersion: "20260729.1" },
      api: { workload: "api", minimumVersion: "20260728.1", maximumVersion: "20260729.1" },
      worker: { workload: "worker", minimumVersion: "20260729.1", maximumVersion: "20260729.1" },
      migration: { workload: "migration", minimumVersion: "20260728.1", maximumVersion: "20260729.1" },
      admin: { workload: "admin", minimumVersion: "20260728.1", maximumVersion: "20260729.1" },
    } });
    expect(policy).not.toBeNull();
    const runtime = new WorkerRuntime({ ...config, pollIntervalMs: 5 }, [
      adapter("knowledge-extraction", async () => { calls += 1; }),
      adapter("knowledge-ingestion", async () => { calls += 1; }),
      adapter("knowledge-indexing", async () => { calls += 1; }),
      adapter("ai-ask-outbox", async () => { calls += 1; }),
    ], async () => undefined, 3002, async () => false);
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toBe(0);
    expect(runtime.ready).toBe(false);
    await runtime.drain();
  });

  it("emits fresh safe lifecycle correlation IDs without allowing a failing sink to affect readiness", async () => {
    const events: unknown[] = [];
    const runtime = new WorkerRuntime(config, [], async () => undefined, 3002, async () => false, { emit(event) { events.push(event); throw new Error("sink unavailable"); } });
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: "worker.startup", principalClass: "system", resultCode: "success", correlationId: expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/) }),
      expect.objectContaining({ capability: "worker.schema", resultCode: "schema_incompatible", correlationId: expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/) }),
    ]));
    expect(new Set((events as Array<{ correlationId: string }>).map((event) => event.correlationId)).size).toBe(events.length);
    await runtime.drain();
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ capability: "worker.drain", resultCode: "draining" })]));
  });

  it("does not double-admit an active adapter when compatibility is restored", async () => {
    let compatible = true;
    let starts = 0;
    let release!: () => void;
    const running = new Promise<void>((resolve) => { release = resolve; });
    const runtime = new WorkerRuntime({ ...config, pollIntervalMs: 5 }, [
      adapter("knowledge-extraction", async () => { starts += 1; await running; }),
      adapter("knowledge-ingestion", async () => undefined),
      adapter("knowledge-indexing", async () => undefined),
      adapter("ai-ask-outbox", async () => undefined),
    ], async () => undefined, 3002, async () => compatible);
    await runtime.start();
    await vi.waitFor(() => expect(starts).toBe(1));
    compatible = false;
    await new Promise((resolve) => setTimeout(resolve, 10));
    compatible = true;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(starts).toBe(1);
    release();
    await runtime.drain();
  });

  it("waits for one graceful drain when SIGTERM and SIGINT arrive together", async () => {
    const signals = new EventEmitter();
    let finish!: () => void;
    const draining = new Promise<void>((resolve) => { finish = resolve; });
    const drain = vi.fn(() => draining);
    const exit = vi.fn();
    installShutdownHandlers({ drain }, signals, exit as never);

    signals.emit("SIGTERM");
    signals.emit("SIGINT");
    expect(drain).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
    finish();
    await draining;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(exit).toHaveBeenCalledWith(0);
  });

});
