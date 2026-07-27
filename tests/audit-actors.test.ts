import { describe, expect, test, vi } from "vitest";

import {
  AuditActorValidationError,
  createSystemAuditActor,
  createUserAuditActor,
  getSystemAuditActorLabel,
  systemAuditActorCatalog,
  toUserAuditActor,
  validateAuditActor,
  validateUserAuditActor,
} from "@/features/audit/actors";
import { recordAuditEvent } from "@/features/audit/events";
import { recordPlanHistory } from "@/features/audit/history";

describe("audit actor boundary", () => {
  test("converts an authenticated session to an immutable user actor preserving its email snapshot", () => {
    const actor = toUserAuditActor({ userId: "user-1", email: "person@example.com" });

    expect(actor).toEqual({ kind: "user", userId: "user-1", email: "person@example.com" });
    expect(Object.isFrozen(actor)).toBe(true);
  });

  test("rejects a session runtime payload mixed with system fields", () => {
    expect(() => toUserAuditActor({
      userId: "user-1",
      email: "person@example.com",
      system: "system-trip-planning",
    } as never)).toThrow(AuditActorValidationError);
  });

  test.each([
    { userId: "user-1", email: "person@example.com", system: "system-trip-planning" },
    null,
    "user-1",
    1,
  ])("createUserAuditActor rejects invalid public input %#", (input) => {
    expect(() => createUserAuditActor(input)).toThrow(AuditActorValidationError);
  });

  test("constructs every cataloged system actor without a session", () => {
    const ids = systemAuditActorCatalog.map((entry) => entry.id);

    expect(ids).toEqual([
      "system-ai-orchestration",
      "system-knowledge-pipeline",
      "system-trip-planning",
      "system-facebook-capture",
      "system-youtube-capture",
    ]);
    expect(ids.map(createSystemAuditActor)).toEqual(ids.map((system) => ({ kind: "system", system })));
    expect(Object.isFrozen(systemAuditActorCatalog)).toBe(true);
    expect(Object.isFrozen(systemAuditActorCatalog[0])).toBe(true);
  });

  test("resolves only server-owned system labels", () => {
    expect(getSystemAuditActorLabel("system-trip-planning")).toBe("Lập kế hoạch chuyến đi");
    expect(getSystemAuditActorLabel("unknown-system")).toBeNull();
    expect(getSystemAuditActorLabel(" ")).toBeNull();
    expect(() => createSystemAuditActor("unknown-system")).toThrow(AuditActorValidationError);
  });

  test("rejects malformed, blank, and mixed runtime actor payloads", () => {
    expect(() => toUserAuditActor({ userId: "user-1", email: " " })).toThrow(AuditActorValidationError);
    expect(() => validateAuditActor({ kind: "user", userId: "user-1", email: "person@example.com", system: "system-trip-planning" })).toThrow(AuditActorValidationError);
    expect(() => validateAuditActor({ kind: "system", system: "system-trip-planning", email: "person@example.com" })).toThrow(AuditActorValidationError);
    expect(() => validateUserAuditActor({ kind: "system", system: "system-trip-planning" })).toThrow(AuditActorValidationError);
  });

  test("maps valid user and system event actors to exclusive persistence shapes", async () => {
    const insert = vi.fn();
    const values = vi.fn();
    insert.mockReturnValue({ values });
    const writer = { insert };

    await recordAuditEvent({
      actor: { kind: "user", userId: "user-1", email: "person@example.com" },
      operation: "create",
      targetType: "test",
    }, writer as never);
    await recordAuditEvent({
      actor: { kind: "system", system: "system-trip-planning" },
      operation: "create",
      targetType: "test",
    }, writer as never);

    expect(values).toHaveBeenNthCalledWith(1, expect.objectContaining({ actorClass: "user", actorUserId: "user-1", actorEmail: "person@example.com", actorSystem: null }));
    expect(values).toHaveBeenNthCalledWith(2, expect.objectContaining({ actorClass: "system", actorUserId: null, actorEmail: null, actorSystem: "system-trip-planning" }));
  });

  test("rejects malformed event actors before invoking its writer", async () => {
    const insert = vi.fn();

    await expect(recordAuditEvent({
      actor: { kind: "system", system: "untrusted-system" } as never,
      operation: "create",
      targetType: "test",
    }, { insert } as never)).rejects.toThrow(AuditActorValidationError);

    expect(insert).not.toHaveBeenCalled();
  });

  test("maps history actors through the supplied transaction while preserving caller payloads", async () => {
    const insert = vi.fn();
    const values = vi.fn();
    insert.mockReturnValue({ values });
    const transaction = { insert };
    const affectedItemReferences = [{ itemId: "item-1", operation: "update" }];
    const safeBeforeAfterSummary = { before: { title: "Old" }, after: { title: "New" } };

    await recordPlanHistory({
      actor: { kind: "user", userId: "owner-1", email: "owner@example.com" },
      tripProjectId: "project-1",
      userId: "owner-1",
      proposalId: "proposal-1",
      operationClass: "apply",
      affectedItemReferences,
      safeBeforeAfterSummary,
    }, transaction as never);
    await recordPlanHistory({
      actor: { kind: "system", system: "system-trip-planning" },
      tripProjectId: "project-1",
      userId: "owner-1",
      operationClass: "expire",
      affectedItemReferences,
      safeBeforeAfterSummary,
    }, transaction as never);

    expect(insert).toHaveBeenCalledTimes(2);
    expect(values).toHaveBeenNthCalledWith(1, expect.objectContaining({
      tripProjectId: "project-1",
      userId: "owner-1",
      proposalId: "proposal-1",
      actorClass: "user",
      actorUserId: "owner-1",
      actorSystem: null,
      affectedItemReferences,
      safeBeforeAfterSummary,
    }));
    expect(values).toHaveBeenNthCalledWith(2, expect.objectContaining({
      proposalId: null,
      actorClass: "system",
      actorUserId: null,
      actorSystem: "system-trip-planning",
      affectedItemReferences,
      safeBeforeAfterSummary,
    }));
  });

  test("rejects malformed history actors before invoking the supplied transaction", async () => {
    const insert = vi.fn();

    await expect(recordPlanHistory({
      actor: { kind: "system", system: "untrusted-system" } as never,
      tripProjectId: "project-1",
      userId: "owner-1",
      operationClass: "apply",
      affectedItemReferences: [],
      safeBeforeAfterSummary: {},
    }, { insert } as never)).rejects.toThrow(AuditActorValidationError);

    expect(insert).not.toHaveBeenCalled();
  });
});
