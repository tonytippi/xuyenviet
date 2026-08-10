import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from "@nestjs/common";

import { parseSafeApiError, type SafeApiError } from "@xuyenviet/contracts";

@Catch()
export class SafeApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{ status(code: number): { json(body: SafeApiError): void } }>();
    const request = host.switchToHttp().getRequest<{ requestId?: string; headers: { "x-request-id"?: string | string[] } }>();
    const supplied = exception instanceof HttpException ? safeDetails(exception.getResponse()) : null;
    const code = supplied?.code ?? codeFor(exception instanceof HttpException ? exception.getStatus() : 500);
    const status = exception instanceof HttpException && [404, 503].includes(exception.getStatus()) && code === "internal_error" ? exception.getStatus() : statusFor(code);
    const body: SafeApiError = {
      code,
      message: messageFor(code),
      requestId: requestIdFor(request.requestId) ?? requestIdFor(request.headers["x-request-id"]) ?? crypto.randomUUID(),
      ...(supplied?.violations ? { violations: supplied.violations } : {}),
    };
    response.status(status).json(body);
  }
}

function codeFor(status: number): SafeApiError["code"] {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400) return "validation_error";
  return "internal_error";
}

function statusFor(code: SafeApiError["code"]): number {
  if (code === "unauthorized") return 401;
  if (code === "forbidden" || code === "csrf_invalid") return 403;
  if (code === "not_found") return 404;
  if (code === "validation_error") return 400;
  if (code === "request_timeout") return 408;
  return 500;
}

function messageFor(code: SafeApiError["code"]): string {
  if (code === "unauthorized") return "Không được phép truy cập.";
  if (code === "forbidden") return "Bạn không có quyền thực hiện thao tác này.";
  if (code === "not_found") return "Không tìm thấy tài nguyên yêu cầu.";
  if (code === "validation_error") return "Dữ liệu yêu cầu không hợp lệ.";
  if (code === "csrf_invalid") return "Yêu cầu không hợp lệ. Vui lòng tải lại trang và thử lại.";
  if (code === "request_timeout") return "Yêu cầu đã hết thời gian chờ.";
  return "Không thể xử lý yêu cầu.";
}

function safeDetails(value: unknown): Pick<SafeApiError, "code" | "violations"> | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.code !== "string" || !["unauthorized", "forbidden", "not_found", "validation_error", "csrf_invalid", "request_timeout", "internal_error"].includes(candidate.code)) return null;
  const parsed = parseSafeApiError({ code: candidate.code, message: "ignored", requestId: "ignored", violations: candidate.violations });
  const code = candidate.code as SafeApiError["code"];
  return { code, ...(code === "validation_error" && parsed?.violations ? { violations: parsed.violations } : {}) };
}

function requestIdFor(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}
