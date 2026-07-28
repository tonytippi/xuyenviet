import "server-only";

import { randomUUID } from "node:crypto";

export function correlationId(value?: string | null): string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : randomUUID();
}
