import { HttpException } from "@nestjs/common";
import { describe, expect, test } from "vitest";

import { SafeApiExceptionFilter } from "../apps/api/src/safe-api-exception.filter";

describe("SafeApiExceptionFilter", () => {
  test("uses a bounded string request ID when a duplicated header is represented as an array", () => {
    const response = { status: () => ({ json: (body: unknown) => body }) };
    let body: unknown;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: () => ({ json: (value: unknown) => { body = value; } }) }),
        getRequest: () => ({ headers: { "x-request-id": ["first", "second"] } }),
      }),
    };

    new SafeApiExceptionFilter().catch(new HttpException("Unauthorized.", 401), host as never);

    expect(body).toEqual({ code: "unauthorized", message: "Không được phép truy cập.", requestId: expect.any(String) });
    expect((body as { requestId: string }).requestId.length).toBeLessThanOrEqual(128);
    expect(response).toBeDefined();
  });

  test("uses only approved messages while retaining a valid code, violations, and middleware request ID", () => {
    let body: unknown;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: () => ({ json: (value: unknown) => { body = value; } }) }),
        getRequest: () => ({ requestId: "middleware-request", headers: {} }),
      }),
    };

    new SafeApiExceptionFilter().catch(new HttpException({ code: "validation_error", message: "database password leaked", requestId: "attacker", violations: [{ field: "title", code: "required", message: "Bắt buộc." }, { field: "x".repeat(129), code: "invalid", message: "bad" }] }, 400), host as never);

    expect(body).toEqual({ code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: "middleware-request" });
  });

  test("uses the safe code's canonical status when it conflicts with an HTTP exception status", () => {
    let status: number | undefined;
    let body: unknown;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: (value: number) => { status = value; return { json: (response: unknown) => { body = response; } }; } }),
        getRequest: () => ({ requestId: "middleware-request", headers: {} }),
      }),
    };

    new SafeApiExceptionFilter().catch(new HttpException({ code: "validation_error" }, 401), host as never);

    expect(status).toBe(400);
    expect(body).toEqual({ code: "validation_error", message: "Dữ liệu yêu cầu không hợp lệ.", requestId: "middleware-request" });
  });

  test("does not expose field violations outside validation errors", () => {
    let body: unknown;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: () => ({ json: (value: unknown) => { body = value; } }) }),
        getRequest: () => ({ requestId: "middleware-request", headers: {} }),
      }),
    };

    new SafeApiExceptionFilter().catch(new HttpException({ code: "forbidden", violations: [{ field: "role", code: "denied", message: "not applicable" }] }, 403), host as never);

    expect(body).toEqual({ code: "forbidden", message: "Bạn không có quyền thực hiện thao tác này.", requestId: "middleware-request" });
  });

  test("replaces fallback request IDs outside the middleware's canonical character set", () => {
    let body: unknown;
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: () => ({ json: (value: unknown) => { body = value; } }) }),
        getRequest: () => ({ headers: { "x-request-id": "unsafe request id" } }),
      }),
    };

    new SafeApiExceptionFilter().catch(new Error("internal"), host as never);

    expect(body).toEqual({ code: "internal_error", message: "Không thể xử lý yêu cầu.", requestId: expect.stringMatching(/^[A-Za-z0-9_-]{1,128}$/) });
  });
});
