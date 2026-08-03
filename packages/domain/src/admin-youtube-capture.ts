import type { AdminYoutubeCaptureDetail, AdminYoutubeCaptureQueue } from "@xuyenviet/contracts";

/** Read-only projection for the current, valid YouTube capture evidence. */
export type AdminYoutubeCapturePort = {
  list(input: { page: number }): Promise<AdminYoutubeCaptureQueue>;
  detail(sourceId: string): Promise<AdminYoutubeCaptureDetail | null>;
};
