import type { AdminKnowledgeCoverage } from "@xuyenviet/contracts";

/** Aggregate-only coverage for the direct admin API. */
export type AdminKnowledgeCoveragePort = {
  getCoverage(): Promise<AdminKnowledgeCoverage>;
};
