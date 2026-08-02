import "server-only";

import { correlationId as neutralCorrelationId } from "@xuyenviet/contracts";

export function correlationId(value?: string | null): string {
  return neutralCorrelationId(value);
}
