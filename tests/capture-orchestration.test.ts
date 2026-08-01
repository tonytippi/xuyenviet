import { describe, expect, test } from "vitest";

import { CaptureImportError, captureCacheFirst, flushCachedArtifact } from "@/features/knowledge/capture-orchestration";
import { SourceCaptureValidationError } from "@/features/knowledge/source-captures";

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
    })).rejects.toThrow("capture_import_flush_failed");
    expect(calls).toEqual(["flush", "finish:retryable"]);
  });

  test("preserves safe validation and PostgreSQL codes from a production flush", async () => {
    const input = { artifact, sourceId: "source-1", prepareImport: async () => ({ correlationToken: "stable-token", outcome: "awaiting_flush" as const, ownsLease: true, leaseOwner: "runner-1" }), importCommitted: async () => false, finishImport: async () => undefined };
    await expect(flushCachedArtifact({ ...input, flush: async () => { throw new SourceCaptureValidationError("raw provider response must not leak"); } })).rejects.toThrow("capture_import_flush_validation_failed");
    await expect(flushCachedArtifact({ ...input, flush: async () => { throw new SourceCaptureValidationError("Capture metadata field model is unsafe."); } })).rejects.toThrow("capture_import_flush_metadata_failed");
    await expect(flushCachedArtifact({ ...input, flush: async () => { throw new SourceCaptureValidationError("Captured readable material exceeds the 120000-character limit."); } })).rejects.toThrow("capture_import_flush_evidence_failed");
    await expect(flushCachedArtifact({ ...input, flush: async () => { const error = new Error("detail must not leak") as Error & { code: string }; error.code = "23514"; throw error; } })).rejects.toThrow("capture_import_flush_postgres_23514");
  });

  test("reports a safe stage when checking an existing production import fails", async () => {
    await expect(flushCachedArtifact({ artifact, sourceId: "source-1", prepareImport: async () => ({ correlationToken: "stable-token", outcome: "awaiting_flush", ownsLease: true, leaseOwner: "runner-1" }), importCommitted: async () => { throw new Error("database credentials must not leak"); }, flush: async () => "updated", finishImport: async () => undefined })).rejects.toBeInstanceOf(CaptureImportError);
    await expect(flushCachedArtifact({ artifact, sourceId: "source-1", prepareImport: async () => ({ correlationToken: "stable-token", outcome: "awaiting_flush", ownsLease: true, leaseOwner: "runner-1" }), importCommitted: async () => { throw new Error("database credentials must not leak"); }, flush: async () => "updated", finishImport: async () => undefined })).rejects.toThrow("capture_import_commit_check_failed");
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
