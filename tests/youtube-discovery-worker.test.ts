import { describe, expect, test } from "vitest";

import { isOperationalTelemetryEvent } from "@xuyenviet/contracts";
import { runWorkerAdapter } from "../packages/worker-domain/src/adapters";

describe("YouTube Discovery worker adapter", () => {
  test("accepts only the finite discovery poll and emits a safe no-work observation", async () => {
    const events: unknown[] = [];
    await runWorkerAdapter(["discovery", "--once", "--worker-id=discovery-test"], {
      telemetry: { emit(event) { events.push(event); } },
      runPoll: async () => ({ capability: "youtube.discovery", resultCode: "no_work", leaseRecovery: "none" }),
    });
    expect(events).toEqual([expect.objectContaining({ capability: "youtube.discovery", resultCode: "no_work", principalClass: "system", leaseRecovery: "none" })]);
    expect(events.every(isOperationalTelemetryEvent)).toBe(true);
    await expect(runWorkerAdapter(["discovery", "--loop", "--worker-id=discovery-test"])).rejects.toThrow("Usage:");
  });
});
