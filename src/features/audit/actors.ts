import "server-only";

import type { AuthenticatedSession } from "@/server/auth";

const systemAuditActorDefinitions = [
  { id: "system-ai-orchestration", label: "Điều phối AI" },
  { id: "system-knowledge-pipeline", label: "Xử lý tri thức" },
  { id: "system-trip-planning", label: "Lập kế hoạch chuyến đi" },
  { id: "system-facebook-capture", label: "Thu thập Facebook" },
  { id: "system-youtube-capture", label: "Thu thập YouTube" },
] as const;

export type SystemAuditActorId = (typeof systemAuditActorDefinitions)[number]["id"];

export type UserAuditActor = Readonly<{
  kind: "user";
  userId: string;
  email: string;
}>;

export type SystemAuditActor = Readonly<{
  kind: "system";
  system: SystemAuditActorId;
}>;

export type AuditActor = UserAuditActor | SystemAuditActor;

export class AuditActorValidationError extends Error {
  constructor() {
    super("Invalid audit actor.");
    this.name = "AuditActorValidationError";
  }
}

export const systemAuditActorCatalog: readonly Readonly<{ id: SystemAuditActorId; label: string }>[] = Object.freeze(
  systemAuditActorDefinitions.map((entry) => Object.freeze({ ...entry })),
);

function nonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
}

export function isSystemAuditActorId(value: unknown): value is SystemAuditActorId {
  return typeof value === "string" && systemAuditActorDefinitions.some((entry) => entry.id === value);
}

export function createUserAuditActor(input: unknown): UserAuditActor {
  if (!isRecord(input) || !hasOnlyKeys(input, ["userId", "email"]) || !nonBlankString(input.userId) || !nonBlankString(input.email)) {
    throw new AuditActorValidationError();
  }

  return Object.freeze({ kind: "user", userId: input.userId, email: input.email });
}

export function toUserAuditActor(session: AuthenticatedSession): UserAuditActor {
  if (!isRecord(session) || !hasOnlyKeys(session, ["userId", "email"])) {
    throw new AuditActorValidationError();
  }

  return createUserAuditActor(session);
}

export function createSystemAuditActor(system: unknown): SystemAuditActor {
  if (!isSystemAuditActorId(system)) {
    throw new AuditActorValidationError();
  }

  return Object.freeze({ kind: "system", system });
}

export function validateAuditActor(value: unknown): AuditActor {
  if (!isRecord(value) || !nonBlankString(value.kind)) {
    throw new AuditActorValidationError();
  }

  if (value.kind === "user" && hasOnlyKeys(value, ["kind", "userId", "email"])) {
    return createUserAuditActor({ userId: value.userId, email: value.email });
  }

  if (value.kind === "system" && hasOnlyKeys(value, ["kind", "system"])) {
    return createSystemAuditActor(value.system);
  }

  throw new AuditActorValidationError();
}

export function validateUserAuditActor(value: unknown): UserAuditActor {
  const actor = validateAuditActor(value);
  if (actor.kind !== "user") {
    throw new AuditActorValidationError();
  }
  return actor;
}

export function getSystemAuditActorLabel(system: unknown): string | null {
  if (!isSystemAuditActorId(system)) {
    return null;
  }
  return systemAuditActorDefinitions.find((entry) => entry.id === system)?.label ?? null;
}
