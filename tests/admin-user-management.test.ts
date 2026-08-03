import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, test, vi } from "vitest";

import { encodeAdminUserRosterCursor, parseAdminKnowledgeIntake, parseAdminKnowledgeSeedBatchRequest, parseAdminUserRosterCursor, parseAdminUserRosterPage, parseAdminUserRosterQuery, parseUserRoleCommand, parseUserRoleCommandResult, type AiGatewayModelPurpose } from "@xuyenviet/contracts";
import { type AdminAiModelCatalogPort, type AdminKnowledgeIntakePort, type AdminOverviewPort, UserRoleGovernancePolicyError } from "@xuyenviet/domain";
import { AdminUsersController } from "../apps/api/src/admin/admin-users.controller";
import { AdminAiModelsController } from "../apps/api/src/admin/admin-ai-models.controller";
import { AdminOverviewController } from "../apps/api/src/admin/admin-overview.controller";
import { AdminKnowledgeIntakeController } from "../apps/api/src/admin/admin-knowledge-intake.controller";
import { AdminCapabilityGuard } from "../apps/api/src/auth/admin-capability.guard";
import { decimalToMicros } from "../apps/admin/app/ai-models/ai-model-catalog";
import { parseExpectedUserRoleCommand, projectUserRoleCommand } from "../apps/admin/app/users/user-roster";

describe("admin user-role governance direct API cutover", () => {
  test("uses a bounded opaque full ordering cursor and rejects malformed browser input", () => {
    const cursor = encodeAdminUserRosterCursor({ name: null, email: "a@example.com", id: "user-a" });
    expect(parseAdminUserRosterCursor(cursor)).toEqual({ name: null, email: "a@example.com", id: "user-a" });
    expect(parseAdminUserRosterQuery({ search: "Nguyen", cursor })).toEqual({ search: "Nguyen", cursor });
    expect(parseAdminUserRosterQuery({ page: "1" })).toBeNull();
    expect(parseUserRoleCommand({ targetUserId: "u", role: "traveler", operation: "grant" })).toBeNull();
    expect(parseUserRoleCommand({ targetUserId: "u", role: "admin", operation: "grant" })).toEqual({ targetUserId: "u", role: "admin", operation: "grant" });
    expect(parseUserRoleCommandResult({ targetUserId: "u", role: "admin", operation: "grant", changed: true })).toEqual({ targetUserId: "u", role: "admin", operation: "grant", changed: true });
  });

  test("accepts only safe roster projections", () => {
    expect(parseAdminUserRosterPage({ items: [{ id: "u", name: null, email: null, image: null, emailVerified: null, roles: ["admin"], usage: { aiRequestCount: "0", inputTokens: "0", outputTokens: "0" } }], nextCursor: null, search: "" })).not.toBeNull();
    expect(parseAdminUserRosterPage({ items: [{ id: "u", email: "private@example.com" }], nextCursor: null, search: "" })).toBeNull();
  });

  test("admits role governance only for current exact-admin browser sessions", () => {
    const guard = new AdminCapabilityGuard({ getAllAndOverride: (key: string) => key === "admin-capability" ? "admin.role.governance" : true } as unknown as Reflector);
    for (const principal of [undefined, { transport: "browser_session", roles: ["operator"] }, { transport: "bff_bearer", issuer: "xuyenviet-web-bff", roles: ["admin"] }]) {
      const context = { getHandler: () => () => {}, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ principal, requestId: "governance" }) }) } as never;
      expect(() => guard.canActivate(context)).toThrow();
    }
    for (const principal of [{ transport: "browser_session" as const, roles: ["admin" as const] }]) {
      const context = { getHandler: () => () => {}, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ principal, requestId: "governance" }) }) } as never;
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  test("controller validates query and command input before invoking its governance port", async () => {
    const transaction = { lockRoleGovernance: vi.fn(), loadLiveExactAdmin: vi.fn(async () => ({ userId: "admin", email: "admin@example.com" })), requireTargetUser: vi.fn(), lockTargetRoles: vi.fn(), listAdministratorUserIds: vi.fn(async () => ["admin"]), grantRole: vi.fn(async () => true), revokeRole: vi.fn(async () => true), incrementAuthorizationVersion: vi.fn(), recordRoleAudit: vi.fn() };
    const governance = { listUsers: vi.fn(async () => ({ items: [], nextCursor: null, search: "An" })), withinRoleGovernanceTransaction: vi.fn(async (operation) => operation(transaction)) };
    const controller = new AdminUsersController(governance);
    await expect(controller.list({ search: "An" })).resolves.toEqual({ items: [], nextCursor: null, search: "An" });
    await expect(controller.list({ cursor: "invalid" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.grant("target", { role: "operator" } as never, { principal: { userId: "admin", sessionId: "session", roles: ["admin"], authorizationVersion: 1, transport: "browser_session" } })).resolves.toMatchObject({ changed: true });
    await expect(controller.revoke("", "admin", { principal: undefined })).rejects.toBeInstanceOf(BadRequestException);
  });

  test("controller maps only explicit role policy errors to validation", async () => {
    const principal = { userId: "admin", sessionId: "session", roles: ["admin" as const], authorizationVersion: 1, transport: "browser_session" as const };
    const governance = { listUsers: vi.fn(), withinRoleGovernanceTransaction: vi.fn().mockRejectedValueOnce(new UserRoleGovernancePolicyError("Cannot revoke the final administrator role.")).mockRejectedValueOnce(new Error("audit insert failed: private database detail")) };
    const controller = new AdminUsersController(governance);
    await expect(controller.revoke("target", "admin", { principal })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.grant("target", { role: "operator" } as never, { principal })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  test("retires matching admin BFF routes and calls Nest with the session CSRF convention", () => {
    expect(existsSync(join(process.cwd(), "apps/admin/app/api/users/route.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "apps/admin/app/api/users/[userId]/roles/route.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "apps/admin/app/api/users/[userId]/roles/[role]/route.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "apps/admin/server/users.ts"))).toBe(false);
    const source = readFileSync(join(process.cwd(), "apps/admin/app/users/user-roster.tsx"), "utf8");
    expect(source).toContain("${apiOrigin()}/v1/admin/users?");
    expect(source).toContain("${apiOrigin()}/auth/csrf");
    expect(source).toContain("${apiOrigin()}/auth/google?");
    expect(source).toContain('"X-XuyenViet-CSRF": csrf');
    expect(source).toContain("if (csrfResponse.status === 401) { signInToApi(); return; }");
    expect(source).not.toContain("/api/users");
    expect(source).not.toContain("/api/auth/csrf");
  });

  test("user roster parses command results and does not project stale no-op grants", () => {
    const page = { items: [{ id: "user", name: null, email: null, image: null, emailVerified: null, roles: ["admin" as const], usage: { aiRequestCount: "0", inputTokens: "0", outputTokens: "0" } }], nextCursor: null, search: "" };
    expect(parseExpectedUserRoleCommand({ targetUserId: "user", role: "operator", operation: "grant", changed: false }, { targetUserId: "user", role: "operator", operation: "grant" })).toMatchObject({ changed: false });
    expect(parseExpectedUserRoleCommand({ targetUserId: "other", role: "operator", operation: "grant", changed: true }, { targetUserId: "user", role: "operator", operation: "grant" })).toBeNull();
    expect(projectUserRoleCommand(page, { targetUserId: "user", role: "operator", operation: "grant", changed: false })).toBe(page);
    expect(projectUserRoleCommand(page, { targetUserId: "user", role: "operator", operation: "grant", changed: true }).items[0]?.roles).toEqual(["admin", "operator"]);
  });

  test("admits the direct model catalog only for exact-admin browser sessions and retires the root owner", async () => {
    const guard = new AdminCapabilityGuard({ getAllAndOverride: (key: string) => key === "admin-capability" ? "admin.ai-model-catalog.write" : true } as unknown as Reflector);
    const context = (principal: unknown) => ({ getHandler: () => () => {}, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ principal, requestId: "catalog" }) }) } as never);
    expect(() => guard.canActivate(context({ transport: "browser_session", roles: ["operator"] }))).toThrow();
    expect(guard.canActivate(context({ transport: "browser_session", roles: ["admin"] }))).toBe(true);
    const catalog = { list: vi.fn(async () => []), create: vi.fn(async () => ({ id: "model", gatewayModelName: "cx/model", displayLabel: "Model", purpose: "ai_ask_initial_answer" as AiGatewayModelPurpose, active: true, defaultForPurpose: false, supportsTextInput: true, supportsImageInput: false, supportsImageOutput: false, supportsEmbeddings: false, supportsExtraction: false, supportsEvaluation: false, supportsStreaming: false, supportsCachePricing: false, pricingCurrency: null, inputTokenPriceMicros: null, outputTokenPriceMicros: null, cacheReadTokenPriceMicros: null, cacheWriteTokenPriceMicros: null, pricingUnitTokens: 1_000_000, pricingVersion: null, pricingEffectiveAt: new Date().toISOString() })), update: vi.fn(), setDefault: vi.fn(), archive: vi.fn() } satisfies AdminAiModelCatalogPort;
    const controller = new AdminAiModelsController(catalog);
    await expect(controller.list()).resolves.toEqual([]);
    expect(existsSync(join(process.cwd(), "src/app/admin/ai-gateway/page.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/features/admin/ai-gateway.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/features/admin/actions.ts"))).toBe(false);
    const source = readFileSync(join(process.cwd(), "apps/admin/app/ai-models/ai-model-catalog.tsx"), "utf8");
    expect(source).toContain("/v1/admin/ai-models");
    expect(source).toContain("/auth/csrf");
    expect(source).toContain("csrfResponse.status === 401");
    expect(source).toContain("/auth/google?");
    expect(source).toContain("await load();");
    expect(source).not.toContain("/api/ai-models");
  });

  test("admits aggregate-only overview reads for operator browser sessions and retires its root owner", async () => {
    const guard = new AdminCapabilityGuard({ getAllAndOverride: (key: string) => key === "admin-capability" ? "admin.workspace.read" : true } as unknown as Reflector);
    const context = (principal: unknown) => ({ getHandler: () => () => {}, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ principal, requestId: "overview" }) }) } as never);
    expect(guard.canActivate(context({ transport: "browser_session", roles: ["operator"] }))).toBe(true);
    expect(() => guard.canActivate(context({ transport: "browser_session", roles: ["traveler"] }))).toThrow();
    const overview = { getOverview: vi.fn(async () => ({ sourcesReadyForProcessing: 0, processingJobs: 0, failedProcessingJobs: 0, draftsAwaitingReview: 0, openRecommendations: 0, activeKnowledgeCards: 0, coverage: { targetActiveCards: 100, activeEvidenceGroundedCards: 0, remainingActiveCards: 100, isComplete: false, activeCommunityObservations: 0, activeCommunityPatterns: 0, caveatOnlyHighRiskCards: 0, pendingReviewCards: 0, pendingVerificationCards: 0, actionableWork: [], byType: [], byRouteOrLocation: [] } })) } satisfies AdminOverviewPort;
    await expect(new AdminOverviewController(overview).get()).resolves.toMatchObject({ coverage: { targetActiveCards: 100 } });
    const unsafeOverview = { getOverview: vi.fn(async () => ({ sourcesReadyForProcessing: 0, processingJobs: 0, failedProcessingJobs: 0, draftsAwaitingReview: 0, openRecommendations: 0, activeKnowledgeCards: 0, coverage: { targetActiveCards: 100, activeEvidenceGroundedCards: 0, remainingActiveCards: 100, isComplete: false, activeCommunityObservations: 0, activeCommunityPatterns: 0, caveatOnlyHighRiskCards: 0, pendingReviewCards: 0, pendingVerificationCards: 0, actionableWork: [], byType: [], byRouteOrLocation: [] }, rawSourceText: "must not serialize" })) };
    await expect(new AdminOverviewController(unsafeOverview as AdminOverviewPort).get()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(existsSync(join(process.cwd(), "src/app/admin/page.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/features/admin/overview.ts"))).toBe(false);
    const source = readFileSync(join(process.cwd(), "apps/admin/app/overview.tsx"), "utf8");
    expect(source).toContain("/v1/admin/overview");
    expect(source).toContain("credentials: \"include\"");
    expect(source).toContain("response.status === 401");
    expect(source).not.toContain("/api/overview");
  });

  test("converts decimal catalog pricing exactly to safe integer micros", () => {
    expect(decimalToMicros("1.25")).toBe(1_250_000);
    expect(decimalToMicros("0.000001")).toBe(1);
    expect(decimalToMicros("")).toBeNull();
    expect(() => decimalToMicros("0.0000001")).toThrow();
    expect(() => decimalToMicros("2147.483648")).toThrow();
  });

  test("allows direct overview and catalog OAuth return URLs", () => {
    expect(readFileSync(join(process.cwd(), "apps/api/.env.example"), "utf8")).toContain("https://admin.xuyenviet.app/ai-models");
    expect(readFileSync(join(process.cwd(), "apps/api/.env.example"), "utf8")).toContain("https://admin.xuyenviet.app/");
    expect(readFileSync(join(process.cwd(), "apps/api/.env.example"), "utf8")).toContain("https://admin.xuyenviet.app/knowledge/intake");
  });

  test("admits operator browser intake, validates strict safe contracts, and retires the root owner", async () => {
    const guard = new AdminCapabilityGuard({ getAllAndOverride: (key: string) => key === "admin-capability" ? "admin.knowledge.write" : true } as unknown as Reflector);
    const context = (principal: unknown) => ({ getHandler: () => () => {}, getClass: () => class Test {}, switchToHttp: () => ({ getRequest: () => ({ principal, requestId: "intake" }) }) } as never);
    expect(guard.canActivate(context({ transport: "browser_session", roles: ["operator"] }))).toBe(true);
    expect(() => guard.canActivate(context({ transport: "browser_session", roles: ["traveler"] }))).toThrow();
    expect(parseAdminKnowledgeSeedBatchRequest({ urls: ["https://example.com"], rawText: "secret" })).toBeNull();
    expect(parseAdminKnowledgeIntake({ sources: [{ id: "s", displayUrl: "https://example.com", displayTitle: "Safe", kind: "url", eligibility: "eligible", removalReason: null, createdAt: new Date().toISOString(), rawText: "secret" }], recentBatches: [] })).toBeNull();
    const intake = { list: vi.fn(async () => ({ sources: [], recentBatches: [] })), submitBatch: vi.fn(async () => ({ batchId: "batch", totalItems: 1, pendingCount: 1, failedCount: 0, duplicateCount: 0 })), removeSource: vi.fn(async () => ({ status: "completed" as const, sourceId: "source", changedCardCount: 0 })) } satisfies AdminKnowledgeIntakePort;
    const controller = new AdminKnowledgeIntakeController(intake);
    await expect(controller.list()).resolves.toEqual({ sources: [], recentBatches: [] });
    await expect(controller.submit({ urls: [] }, { principal: { userId: "operator", sessionId: "session", roles: ["operator"], authorizationVersion: 1, transport: "browser_session" } })).rejects.toBeInstanceOf(BadRequestException);
    expect(existsSync(join(process.cwd(), "src/app/admin/knowledge/intake/page.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "src/app/admin/knowledge/intake/intake-url-modal.tsx"))).toBe(false);
    const source = readFileSync(join(process.cwd(), "apps/admin/app/knowledge/intake/knowledge-intake.tsx"), "utf8");
    expect(source).toContain("/v1/admin/knowledge/intake"); expect(source).toContain("/v1/admin/knowledge/seed-batches"); expect(source).toContain("/auth/csrf"); expect(source).toContain("credentials: \"include\""); expect(source).not.toContain("/api/knowledge"); expect(source).not.toContain("rawText");
  });
});
