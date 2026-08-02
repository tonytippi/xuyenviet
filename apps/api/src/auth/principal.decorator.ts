import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { RequestPrincipal } from "@xuyenviet/contracts";

export const Principal = createParamDecorator((_: unknown, context: ExecutionContext): RequestPrincipal => {
  return context.switchToHttp().getRequest<{ principal: RequestPrincipal }>().principal;
});
