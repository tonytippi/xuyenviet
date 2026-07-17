import { describe, expect, test } from "vitest";

import { captureCacheFirst, flushCachedArtifact } from "@/features/knowledge/capture-orchestration";

const artifact = { id: "artifact-1" } as never;

describe("capture cache import orchestration", () => {
  test("checks an ambiguous attempt by correlation token before retrying its stored artifact", async () => {
    const calls: string[] = [];
    await expect(flushCachedArtifact({
      artifact,
      sourceId: "source-1",
      prepareImport: async () => ({ correlationToken: "stable-token", outcome: "retryable", ownsLease: true, leaseOwner: "runner-1" }),
      importCommitted: async (token) => { calls.push(`lookup:${token}`); return true; },
      flush: async () => { calls.push("flush"); return "updated"; },
      finishImport: async (_token, _owner, outcome) => { calls.push(`finish:${outcome}`); },
    })).resolves.toBe("imported");
    expect(calls).toEqual(["lookup:stable-token", "finish:imported"]);
  });

  test("marks a failed production flush retryable without recapturing", async () => {
    const calls: string[] = [];
    await expect(flushCachedArtifact({
      artifact,
      sourceId: "source-1",
      prepareImport: async () => ({ correlationToken: "stable-token", outcome: "awaiting_flush", ownsLease: true, leaseOwner: "runner-1" }),
      importCommitted: async () => false,
      flush: async () => { calls.push("flush"); throw new Error("connection reset"); },
      finishImport: async (_token, _owner, outcome) => { calls.push(`finish:${outcome}`); },
    })).rejects.toThrow("production_flush_ambiguous");
    expect(calls).toEqual(["flush", "finish:retryable"]);
  });

  test("records terminal guarded-write outcomes per target while preserving the artifact", async () => {
    const outcomes: string[] = [];
    await expect(flushCachedArtifact({ artifact, sourceId: "recreated-source", prepareImport: async () => ({ correlationToken: "new-target", outcome: "awaiting_flush", ownsLease: true, leaseOwner: "runner-1" }), importCommitted: async () => false, flush: async () => "not_queued", finishImport: async (_token, _owner, outcome) => { outcomes.push(outcome); } })).resolves.toBe("not_queued");
    expect(outcomes).toEqual(["terminal"]);
  });

  test("replays a cache hit without invoking a provider", async () => {
    let providerCalls = 0;
    await expect(captureCacheFirst({ forceLive: false, cached: "cached", captureLive: async () => { providerCalls += 1; return "live"; }, admit: async (artifact) => artifact, flush: async (artifact) => artifact === "cached" ? "updated" : "not_queued" })).resolves.toEqual({ origin: "cache", result: "updated" });
    expect(providerCalls).toBe(0);
  });

  test("does not let a nonowner flush an active correlation token", async () => {
    const calls: string[] = [];
    await expect(flushCachedArtifact({ artifact, sourceId: "source-1", prepareImport: async () => ({ correlationToken: "active-token", outcome: "awaiting_flush", ownsLease: false, leaseOwner: null }), importCommitted: async () => false, flush: async () => { calls.push("flush"); return "updated"; }, finishImport: async () => { calls.push("finish"); } })).resolves.toBe("in_progress");
    expect(calls).toEqual([]);
  });

  test("observes a nonowner's production commit rather than flushing", async () => {
    let flushes = 0;
    await expect(flushCachedArtifact({ artifact, sourceId: "source-1", prepareImport: async () => ({ correlationToken: "active-token", outcome: "awaiting_flush", ownsLease: false, leaseOwner: null }), importCommitted: async () => true, flush: async () => { flushes += 1; return "updated"; }, finishImport: async () => undefined })).resolves.toBe("imported");
    expect(flushes).toBe(0);
  });

  test("does not flush production when cache admission fails", async () => {
    let flushes = 0;
    await expect(captureCacheFirst({ forceLive: false, cached: null, captureLive: async () => "live", admit: async () => { throw new Error("cache unavailable"); }, flush: async () => { flushes += 1; return "updated"; } })).rejects.toThrow("cache unavailable");
    expect(flushes).toBe(0);
  });

  test("force-live recapture bypasses cache and supersedes only after a valid flush", async () => {
    const calls: string[] = [];
    await expect(captureCacheFirst({ forceLive: true, cached: "stale", captureLive: async () => { calls.push("provider"); return "fresh"; }, admit: async (artifact) => { calls.push("admit"); return artifact; }, flush: async () => { calls.push("flush"); return "updated"; }, supersedePrevious: async () => { calls.push("supersede"); } })).resolves.toEqual({ origin: "live", result: "updated" });
    expect(calls).toEqual(["provider", "admit", "flush", "supersede"]);
  });

  test("does not supersede a default after terminal or ambiguous force-live flushes", async () => {
    const calls: string[] = [];
    await captureCacheFirst({ forceLive: true, cached: "stale", captureLive: async () => "fresh", admit: async (value) => value, flush: async () => "duplicate", supersedePrevious: async () => { calls.push("supersede"); } });
    expect(calls).toEqual([]);
  });
});
