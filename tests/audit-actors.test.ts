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

  test("rejects a system-shaped event actor before invoking its writer", async () => {
    const insert = vi.fn();
    const writer = { insert };

    await expect(recordAuditEvent({
      actor: { kind: "system", system: "system-trip-planning" } as never,
      operation: "create",
      targetType: "test",
    }, writer as never)).rejects.toThrow(AuditActorValidationError);

    expect(insert).not.toHaveBeenCalled();
  });
});
