import { describe, expect, test } from "vitest";

import { parseAssistantProvenanceWithdrawalBackfillArgs, runAssistantProvenanceWithdrawalBackfill } from "../scripts/assistant-provenance-withdrawal-backfill";

describe("assistant provenance withdrawal backfill command", () => {
  test("requires explicit execution and bounds the batch size", () => {
    expect(() => parseAssistantProvenanceWithdrawalBackfillArgs([])).toThrow("requires --execute");
    expect(() => parseAssistantProvenanceWithdrawalBackfillArgs(["--execute", "--batch-size=501"])).toThrow("1 through 500");
    expect(parseAssistantProvenanceWithdrawalBackfillArgs(["--execute", "--retry-failed", "--batch-size=50"])).toEqual({ batchSize: 50, retryFailed: true });
  });

  test("runs sequential bounded batches to a safe terminal result", async () => {
    const calls: Array<{ batchSize?: number; retryFailed?: boolean }> = [];
    const backfill = async (input: { batchSize?: number; retryFailed?: boolean }) => {
      calls.push(input);
      return calls.length === 1 ? { status: "progressed" as const, scannedCount: 2 } : { status: "completed" as const, scannedCount: 0 };
    };

    await expect(runAssistantProvenanceWithdrawalBackfill({ batchSize: 2, retryFailed: true }, backfill as never)).resolves.toEqual({ status: "completed", batchCount: 2, scannedCount: 2 });
    expect(calls).toEqual([{ batchSize: 2, retryFailed: true }, { batchSize: 2, retryFailed: false }]);
  });

  test("returns only the safe failure code at a terminal backfill failure", async () => {
    const backfill = async () => ({ status: "failed" as const, failureCode: "unclassifiable_anchor" as const });

    await expect(runAssistantProvenanceWithdrawalBackfill({ retryFailed: false }, backfill as never)).resolves.toEqual({
      status: "failed",
      batchCount: 1,
      scannedCount: 0,
      failureCode: "unclassifiable_anchor",
    });
  });
});
