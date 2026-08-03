import type { AdminQualityDashboard, AdminQualityQuery } from "@xuyenviet/contracts";

export type AdminQualityPort = { getQuality(input: AdminQualityQuery): Promise<AdminQualityDashboard> };
