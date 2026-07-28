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

    expect(body).toEqual({ code: "unauthorized", message: "Unauthorized.", requestId: expect.any(String) });
    expect((body as { requestId: string }).requestId.length).toBeLessThanOrEqual(128);
    expect(response).toBeDefined();
  });
});
