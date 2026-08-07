import { describe, expect, test } from "vitest";

import { defaultYoutubeDiscoveryPolicy, parseYoutubeDiscoveryPolicy, YoutubeDiscoveryPolicyValidationError } from "@xuyenviet/domain";
import { createSystemAuditActor, createUserAuditActor, createYoutubeDiscoveryPolicyVersion, createYoutubeDiscoveryQueryProposal } from "@xuyenviet/database";

describe("YouTube Discovery policy", () => {
  test("uses persisted-safe defaults with shorter comment signal retention", () => {
    expect(parseYoutubeDiscoveryPolicy({})).toEqual(defaultYoutubeDiscoveryPolicy);
    expect(defaultYoutubeDiscoveryPolicy.retentionDays).toBe(180);
    expect(defaultYoutubeDiscoveryPolicy.commentSignalTtlDays).toBeLessThan(defaultYoutubeDiscoveryPolicy.retentionDays);
  });

  test.each([
    { retentionDays: 180, commentSignalTtlDays: 180 },
    { cadenceMinutes: Infinity },
    { maxConcurrentRuns: 21 },
    { maxRetryAttempts: -1 },
    { unexpected: true },
  ])("rejects unbounded or invalid policy input %#", (input) => {
    expect(() => parseYoutubeDiscoveryPolicy(input)).toThrow(YoutubeDiscoveryPolicyValidationError);
  });

  test("rejects explicit null policy instead of applying defaults", async () => {
    expect(() => parseYoutubeDiscoveryPolicy(null)).toThrow(YoutubeDiscoveryPolicyValidationError);
    await expect(createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: false, policy: null, actor: createSystemAuditActor("system-youtube-discovery") }, { transaction: () => { throw new Error("policy validation should run before transaction"); } } as never)).rejects.toThrow(YoutubeDiscoveryPolicyValidationError);
  });

  test("rejects unrelated system actors for automated policy and query work before persistence", async () => {
    const database = { transaction: () => { throw new Error("actor validation should run before transaction"); } } as never;
    const unrelatedSystemActor = createSystemAuditActor("system-youtube-capture");

    await expect(createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: false, actor: unrelatedSystemActor }, database)).rejects.toThrow("Discovery system actor");
    await expect(createYoutubeDiscoveryQueryProposal({ origin: "system", reason: "coverage_gap", priority: 50, queryText: "Đà Lạt đường đèo", cadenceMinutes: 1440, actor: unrelatedSystemActor }, database)).rejects.toThrow("Discovery system actor");
    await expect(createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "coverage_gap", priority: 50, queryText: "Đà Lạt đường đèo", cadenceMinutes: 1440, actor: createSystemAuditActor("system-youtube-discovery") }, database)).rejects.toThrow("user actor");
  });

  test("rejects unsafe query proposal content before persistence", async () => {
    const database = { transaction: () => { throw new Error("query validation should run before transaction"); } } as never;
    const actor = createSystemAuditActor("system-youtube-discovery");

    await expect(createYoutubeDiscoveryQueryProposal({ origin: "system", reason: "coverage_gap", priority: 50, queryText: "https://example.com/?token=secret", cadenceMinutes: 1440, actor }, database)).rejects.toThrow("Invalid YouTube Discovery query proposal");
    await expect(createYoutubeDiscoveryQueryProposal({ origin: "system", reason: "unsafe_reason" as never, priority: 50, queryText: "Đà Lạt đường đèo", cadenceMinutes: 1440, actor }, database)).rejects.toThrow("Invalid YouTube Discovery query proposal");
  });

  test("accepts user policy commands and matching query proposal actors", async () => {
    let transactions = 0;
    const database = { transaction: async (callback: (transaction: never) => Promise<unknown>) => { transactions += 1; return callback({} as never); } } as never;
    const operator = createUserAuditActor({ userId: "operator", email: "operator@example.com" });

    await expect(createYoutubeDiscoveryPolicyVersion({ version: 2, isCurrent: false, actor: operator }, database)).rejects.toThrow();
    expect(transactions).toBe(1);
    await expect(createYoutubeDiscoveryQueryProposal({ origin: "operator", reason: "coverage_gap", priority: 50, queryText: "Đà Lạt đường đèo", cadenceMinutes: 1440, actor: operator }, database)).rejects.toThrow();
    expect(transactions).toBe(2);
    await expect(createYoutubeDiscoveryQueryProposal({ origin: "system", reason: "coverage_gap", priority: 50, queryText: "Đà Lạt đường đèo", cadenceMinutes: 1440, actor: createSystemAuditActor("system-youtube-discovery") }, database)).rejects.toThrow();
    expect(transactions).toBe(3);
  });
});
