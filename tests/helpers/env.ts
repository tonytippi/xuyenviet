export async function withEnv<TResult>(vars: Record<string, string | undefined>, fn: () => TResult | Promise<TResult>) {
  const previousValues = new Map<string, string | undefined>();

  for (const name of Object.keys(vars)) {
    previousValues.set(name, process.env[name]);
    const value = vars[name];

    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [name, value] of previousValues) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

export function validProductionEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    APP_ENV: "production",
    DATABASE_URL: "postgresql://prod_user:prod_password@db.xuyenviet.vn:5432/xuyenviet",
    AUTH_SECRET: "real-production-secret-value",
    AUTH_URL: "https://xuyenviet.vn",
    AUTH_GOOGLE_ID: "real-google-client-id",
    AUTH_GOOGLE_SECRET: "real-google-client-secret",
    AI_GATEWAY_BASE_URL: "https://ai-gateway.xuyenviet.vn",
    AI_GATEWAY_API_KEY: "real-ai-gateway-key",
    TAVILY_API_KEY: "real-tavily-key",
    ...overrides,
  };
}
