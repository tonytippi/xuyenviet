import { BadRequestException, Controller, Get, Inject, Param, Query, ServiceUnavailableException } from "@nestjs/common";
import { parseAdminYoutubeCaptureDetail, parseAdminYoutubeCaptureQueue, parseAdminYoutubeCaptureQueueQuery } from "@xuyenviet/contracts";
import type { AdminYoutubeCapturePort } from "@xuyenviet/domain";
import { AllowsAdminBrowserSession, RequiresAdminCapability } from "../auth/admin-capability.decorator";

export const ADMIN_YOUTUBE_CAPTURE_PORT = Symbol("ADMIN_YOUTUBE_CAPTURE_PORT");
@Controller("v1/admin/knowledge/youtube-captures")
@RequiresAdminCapability("admin.knowledge.write")
@AllowsAdminBrowserSession()
export class AdminYoutubeCapturesController {
  constructor(@Inject(ADMIN_YOUTUBE_CAPTURE_PORT) private readonly captures: AdminYoutubeCapturePort) {}
  @Get()
  async list(@Query() query: Record<string, unknown>) { const input = parseAdminYoutubeCaptureQueueQuery(query); if (!input) throw invalid(); try { const result = parseAdminYoutubeCaptureQueue(await this.captures.list(input)); if (!result) throw new Error("unsafe projection"); return result; } catch { throw unavailable(); } }
  @Get(":sourceId")
  async detail(@Param("sourceId") sourceId: string) { if (!validId(sourceId)) throw invalid(); try { const result = await this.captures.detail(sourceId); if (!result) throw unavailable(); const parsed = parseAdminYoutubeCaptureDetail(result); if (!parsed) throw new Error("unsafe projection"); return parsed; } catch { throw unavailable(); } }
}
function validId(value: string) { return value.trim() === value && value.length > 0 && value.length <= 128; }
function invalid() { return new BadRequestException({ code: "validation_error" }); }
function unavailable() { return new ServiceUnavailableException({ code: "internal_error" }); }
