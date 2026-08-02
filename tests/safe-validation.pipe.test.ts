import { describe, expect, test } from "vitest";

import { SafeValidationPipe } from "../apps/api/src/common/safe-validation.pipe";

describe("SafeValidationPipe", () => {
  test("projects body input through the declared DTO parser and removes undeclared values", () => {
    class CreateTripDto {
      static parse(value: unknown) {
        if (!value || typeof value !== "object" || typeof (value as { title?: unknown }).title !== "string") {
          return { ok: false as const, violations: [{ field: "title", code: "required", message: "Bắt buộc." }] };
        }
        return { ok: true as const, value: { title: (value as { title: string }).title } };
      }
    }

    expect(new SafeValidationPipe().transform({ title: "Da Nang", role: "admin" }, { type: "body", metatype: CreateTripDto })).toEqual({ title: "Da Nang" });
  });

  test("rejects bodies without a DTO parser and bounds returned violation details", () => {
    const pipe = new SafeValidationPipe();
    class InvalidDto {
      static parse() { return { ok: false as const, violations: Array.from({ length: 21 }, () => ({ field: "x", code: "invalid", message: "bad" })) }; }
    }

    expect(() => pipe.transform({}, { type: "body", metatype: undefined })).toThrow();
    try {
      pipe.transform({}, { type: "body", metatype: InvalidDto });
    } catch (error) {
      expect((error as { getResponse(): { violations: unknown[] } }).getResponse().violations).toHaveLength(20);
    }
  });

  test("rejects malformed parser results and successful results without a value", () => {
    const pipe = new SafeValidationPipe();
    const malformedResults = [null, undefined, {}, { ok: "true" }, { ok: true }, { ok: true, value: undefined }];

    for (const result of malformedResults) {
      class MalformedDto {
        static parse() { return result; }
      }
      expect(() => pipe.transform({}, { type: "body", metatype: MalformedDto })).toThrow();
    }
  });

  test("drops malformed runtime violations without converting a client error into an exception", () => {
    class InvalidDto {
      static parse() { return { ok: false as const, violations: [null, { field: "title", code: "required", message: "Bắt buộc." }] as unknown as never[] }; }
    }

    try {
      new SafeValidationPipe().transform({}, { type: "body", metatype: InvalidDto });
    } catch (error) {
      expect((error as { getResponse(): { violations: unknown[] } }).getResponse().violations).toEqual([{ field: "title", code: "required", message: "Bắt buộc." }]);
    }
  });
});
