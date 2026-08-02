import { BadRequestException, Injectable, type ArgumentMetadata, type PipeTransform, type Type } from "@nestjs/common";

import type { SafeFieldViolation } from "@xuyenviet/contracts";

export type SafeRequestDto<T> = {
  parse(value: unknown): { ok: true; value: T } | { ok: false; violations?: SafeFieldViolation[] };
};

@Injectable()
export class SafeValidationPipe implements PipeTransform {
  constructor(private readonly explicitDto?: Type<unknown> & Partial<SafeRequestDto<unknown>>) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== "body") return value;
    const dto = this.explicitDto ?? metadata.metatype as (Type<unknown> & Partial<SafeRequestDto<unknown>>) | undefined;
    // esbuild erases parameter metadata for some bundled controller methods.
    // Those methods install an explicit SafeValidationPipe at the parameter.
    if (!this.explicitDto && (!dto || dto === Object)) return value;
    const parser = dto as Type<unknown> & SafeRequestDto<unknown>;
    if (typeof parser.parse !== "function") {
      throw invalid();
    }
    let result: ReturnType<SafeRequestDto<unknown>["parse"]>;
    try {
      result = parser.parse(value);
    } catch {
      throw invalid();
    }
    if (!result || typeof result !== "object" || (result.ok !== true && result.ok !== false)) throw invalid();
    if (!result.ok) throw invalid(result.violations);
    if (!("value" in result) || result.value === undefined) throw invalid();
    return result.value;
  }
}

function invalid(violations?: SafeFieldViolation[]) {
  return new BadRequestException({ code: "validation_error", violations: validViolations(violations) });
}

function validViolations(violations: unknown): SafeFieldViolation[] {
  if (!violations) return [];
  if (!Array.isArray(violations)) return [];
  return violations.filter((violation): violation is SafeFieldViolation => typeof violation === "object" && violation !== null
    && typeof (violation as SafeFieldViolation).field === "string" && (violation as SafeFieldViolation).field.length > 0 && (violation as SafeFieldViolation).field.length <= 128
    && typeof (violation as SafeFieldViolation).code === "string" && (violation as SafeFieldViolation).code.length > 0 && (violation as SafeFieldViolation).code.length <= 64
    && typeof (violation as SafeFieldViolation).message === "string" && (violation as SafeFieldViolation).message.length > 0 && (violation as SafeFieldViolation).message.length <= 256).slice(0, 20);
}
