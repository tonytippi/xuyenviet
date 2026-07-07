import { afterAll, beforeEach, vi } from "vitest";

import { getTestDatabaseUrl } from "./helpers/env-file";
import { closeTestDatabase, resetTestDatabase } from "./helpers/db";

const testDatabaseUrl = getTestDatabaseUrl();

process.env.APP_ENV = "local";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.AUTH_SECRET = "test-secret";
process.env.AUTH_URL = "http://localhost:3000";
process.env.AUTH_GOOGLE_ID = "test-google-client-id";
process.env.AUTH_GOOGLE_SECRET = "test-google-client-secret";
process.env.AI_GATEWAY_BASE_URL = "https://test-gateway.example";
process.env.AI_GATEWAY_API_KEY = "test-ai-gateway-key";
process.env.TAVILY_API_KEY = "test-tavily-key";

vi.stubGlobal(
  "fetch",
  vi.fn(async (input: RequestInfo | URL) => {
    throw new Error(`Unexpected network request in test: ${String(input)}`);
  }),
);

beforeEach(async () => {
  vi.doMock("next/navigation", () => {
    const router = {
      push: vi.fn(),
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    };

    return {
      redirect: vi.fn((url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      }),
      useRouter: vi.fn(() => router),
    };
  });
  vi.resetModules();
  vi.clearAllMocks();
  await resetTestDatabase();
});

afterAll(async () => {
  await closeTestDatabase();
});
