import { Controller, Get } from "@nestjs/common";

import { PublicRoute } from "./auth/public-route.decorator";

@Controller()
export class OpenApiController {
  @Get("openapi.json")
  @PublicRoute()
  document() {
    return {
      openapi: "3.0.3",
      info: { title: "XuyenViet Private API", version: "v1" },
      paths: {
        "/health/live": { get: { summary: "Process liveness only; does not query dependencies.", responses: { "200": jsonResponse("Process is running", "Health") } } },
        "/health/ready": { get: { summary: "Configuration, issuer-key, database, and compatible-schema admission readiness.", responses: { "200": jsonResponse("Ready for assigned traffic", "Health"), "503": { $ref: "#/components/responses/SafeError" } } } },
        "/v1/version": { get: { summary: "API version and bounded conversation-summary list limit.", responses: { "200": jsonResponse("Version metadata", "ApiVersion") } } },
        "/v1/conversations/summaries": { get: { summary: "Owner-scoped ordinary conversation summaries. Ownership derives from the bearer principal; trip-project conversations are excluded. Results are bounded, unpaginated, and ordered by updatedAt DESC then id DESC.", security: [{ bearerAuth: [] }], responses: { "200": jsonResponse("Owner summaries", "ConversationSummaryList"), "401": { $ref: "#/components/responses/SafeError" }, "500": { $ref: "#/components/responses/SafeError" }, "503": { $ref: "#/components/responses/SafeError" } } } },
      },
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "ES256 JWT", description: "Private BFF credential only; browser cookies are not accepted." } },
        schemas: {
          Health: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["ok"] } } },
          ApiVersion: { type: "object", required: ["version", "conversationSummaryLimit"], properties: { version: { type: "string", enum: ["v1"] }, conversationSummaryLimit: { type: "integer", minimum: 1, maximum: 100 } } },
          ConversationSummary: { type: "object", required: ["id", "updatedAt", "preview"], properties: { id: { type: "string", minLength: 1, maxLength: 128 }, updatedAt: { type: "string", format: "date-time", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$", description: "Canonical ISO-8601 UTC timestamp." }, preview: { type: "string", maxLength: 61 } } },
          ConversationSummaryList: { type: "object", required: ["summaries"], properties: { summaries: { type: "array", maxItems: 100, items: { $ref: "#/components/schemas/ConversationSummary" } } } },
          SafeApiError: { type: "object", required: ["code", "message", "requestId"], properties: { code: { type: "string", enum: ["unauthorized", "forbidden", "validation_error", "csrf_invalid", "request_timeout", "internal_error"] }, message: { type: "string" }, requestId: { type: "string" }, violations: { type: "array", maxItems: 20, items: { type: "object", required: ["field", "code", "message"], properties: { field: { type: "string" }, code: { type: "string" }, message: { type: "string" } } } } } },
        },
        responses: { SafeError: { description: "Safe error envelope; never includes token, cookie, stack, SQL, or private configuration data.", content: { "application/json": { schema: { $ref: "#/components/schemas/SafeApiError" } } } } },
      },
    };
  }
}

function jsonResponse(description: string, schema: string) {
  return { description, content: { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } } };
}
