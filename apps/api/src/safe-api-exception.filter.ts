import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";

import type { SafeApiError } from "@xuyenviet/contracts";

@Catch()
export class SafeApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{ status(code: number): { json(body: SafeApiError): void } }>();
    const request = host.switchToHttp().getRequest<{ headers: { "x-request-id"?: string | string[] } }>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const body: SafeApiError = {
      code: status === 401 ? "unauthorized" : "internal_error",
      message: status === 401 ? "Unauthorized." : "Unable to process the request.",
      requestId: requestIdFor(request.headers["x-request-id"]),
    };
    response.status(status).json(body);
  }
}

function requestIdFor(value: string | string[] | undefined): string {
  return typeof value === "string" && value.length > 0 ? value.slice(0, 128) : crypto.randomUUID();
}
