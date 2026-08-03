import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { permitsAdminCapability, type AdminCapability, type RequestPrincipal } from "@xuyenviet/contracts";

import { ADMIN_BROWSER_SESSION, ADMIN_CAPABILITY } from "./admin-capability.decorator";

@Injectable()
export class AdminCapabilityGuard implements CanActivate {
  // esbuild does not preserve constructor metadata for external Nest dependencies.
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const capability = this.reflector.getAllAndOverride<AdminCapability>(ADMIN_CAPABILITY, [context.getHandler(), context.getClass()]);
    const allowsBrowserSession = this.reflector.getAllAndOverride<boolean>(ADMIN_BROWSER_SESSION, [context.getHandler(), context.getClass()]) === true;
    if (!capability) return true;
    const request = context.switchToHttp().getRequest<{ principal?: RequestPrincipal; requestId?: string }>();
    if (
      !request.principal ||
       !allowsBrowserSession ||
      !permitsAdminCapability(request.principal.roles, capability)
    ) {
      throw new ForbiddenException({ code: "forbidden", message: "Bạn không có quyền thực hiện thao tác này.", requestId: request.requestId ?? crypto.randomUUID() });
    }
    return true;
  }
}
