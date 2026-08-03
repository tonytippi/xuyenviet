import type { AdminFacebookCaptureCommandResult, AdminFacebookCaptureDetail, AdminFacebookCaptureQueue, AdminFacebookCaptureQueueStatus, RequestPrincipal } from "@xuyenviet/contracts";

export type AdminFacebookCapturePort = {
  list(input: { status: AdminFacebookCaptureQueueStatus; page: number }): Promise<AdminFacebookCaptureQueue>;
  detail(reviewId: string): Promise<AdminFacebookCaptureDetail | null>;
  recapture(actor: RequestPrincipal, reviewId: string, reason: string): Promise<AdminFacebookCaptureCommandResult>;
  rerunIngestion(actor: RequestPrincipal, reviewId: string): Promise<AdminFacebookCaptureCommandResult>;
};
export class AdminFacebookCapturePolicyError extends Error {}
export async function recaptureAdminFacebookCapture(port: AdminFacebookCapturePort, actor: RequestPrincipal, reviewId: string, reason: string) { if (!validId(reviewId)) throw new AdminFacebookCapturePolicyError("Review id is required."); return port.recapture(actor, reviewId, reason); }
export async function rerunAdminFacebookCaptureIngestion(port: AdminFacebookCapturePort, actor: RequestPrincipal, reviewId: string) { if (!validId(reviewId)) throw new AdminFacebookCapturePolicyError("Review id is required."); return port.rerunIngestion(actor, reviewId); }
function validId(value: string) { return value.trim() === value && value.length > 0 && value.length <= 128; }
