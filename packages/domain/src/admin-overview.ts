import type { AdminOverview } from "@xuyenviet/contracts";

/** Read-only operational overview. The adapter must return aggregates only. */
export type AdminOverviewPort = {
  getOverview(): Promise<AdminOverview>;
};
