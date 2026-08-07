import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, ServiceUnavailableException } from "@nestjs/common";
import { parseAdminYoutubeDiscoveryCommand, parseAdminYoutubeDiscoveryQuery, parseAdminYoutubeDiscoveryQueryList, type RequestPrincipal } from "@xuyenviet/contracts";
import type { AdminYoutubeDiscoveryPort } from "@xuyenviet/domain";
import { AllowsAdminBrowserSession, RequiresAdminCapability } from "../auth/admin-capability.decorator";

export const ADMIN_YOUTUBE_DISCOVERY_PORT = Symbol("ADMIN_YOUTUBE_DISCOVERY_PORT");
@Controller("v1/admin/knowledge/youtube-discovery") @RequiresAdminCapability("admin.knowledge.write") @AllowsAdminBrowserSession()
export class AdminYoutubeDiscoveryController {
  constructor(@Inject(ADMIN_YOUTUBE_DISCOVERY_PORT) private readonly port: AdminYoutubeDiscoveryPort) {}
  @Get() async list() { try { const value = await this.port.list(); if (!parseAdminYoutubeDiscoveryQueryList(value)) throw unavailable(); return value; } catch (error) { if (error instanceof ServiceUnavailableException) throw error; throw unavailable(); } }
  @Post() @HttpCode(HttpStatus.CREATED) async create(@Body() body: unknown, @Req() request: { principal?: RequestPrincipal }) { const input = parseAdminYoutubeDiscoveryCommand(body, "create"); if (!input || !request.principal) throw invalid(); return call(() => this.port.create(request.principal!, input as { queryText: string; priority: number; cadenceMinutes: number })); }
  @Post(":id/text") async edit(@Param("id") id: string, @Body() body: unknown, @Req() request: { principal?: RequestPrincipal }) { const input = parseAdminYoutubeDiscoveryCommand(body, "edit"); if (!input || !request.principal || !validId(id)) throw invalid(); return call(() => this.port.edit(request.principal!, id, input.queryText!)); }
  @Post(":id/priority") async priority(@Param("id") id: string, @Body() body: unknown, @Req() request: { principal?: RequestPrincipal }) { const input = parseAdminYoutubeDiscoveryCommand(body, "priority"); if (!input || !request.principal || !validId(id)) throw invalid(); return call(() => this.port.reprioritize(request.principal!, id, input.priority!)); }
  @Post(":id/pause") async pause(@Param("id") id: string, @Req() request: { principal?: RequestPrincipal }) { if (!request.principal || !validId(id)) throw invalid(); return call(() => this.port.pause(request.principal!, id)); }
  @Post(":id/resume") async resume(@Param("id") id: string, @Req() request: { principal?: RequestPrincipal }) { if (!request.principal || !validId(id)) throw invalid(); return call(() => this.port.resume(request.principal!, id)); }
}
async function call(operation: () => Promise<unknown>) { try { const result = await operation(); if (!parseAdminYoutubeDiscoveryQuery(result)) throw invalid(); return result; } catch (error) { if (error instanceof BadRequestException) throw error; throw unavailable(); } }
function invalid() { return new BadRequestException({ code: "validation_error" }); }
function unavailable() { return new ServiceUnavailableException({ code: "internal_error" }); }
function validId(value: string) { return value.trim() === value && value.length > 0 && value.length <= 128; }
