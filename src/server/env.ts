import "server-only";

export const appEnvironments = ["local", "staging", "production"] as const;

export type AppEnvironment = (typeof appEnvironments)[number];

const productionRequiredVariables = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_URL",
  "AI_GATEWAY_BASE_URL",
  "AI_GATEWAY_API_KEY",
  "TAVILY_API_KEY",
] as const;


export class ServerEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerEnvError";
  }
}

export function getAppEnv(): AppEnvironment {
  const appEnv = process.env.APP_ENV ?? "local";

  if (isAppEnvironment(appEnv)) {
    return appEnv;
  }

  throw new ServerEnvError("APP_ENV must be one of: local, staging, production.");
}

export function isProductionEnv() {
  return getAppEnv() === "production";
}

export function getRequiredServerEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new ServerEnvError(`${name} is required for server operations.`);
  }

  assertAllowedProductionValue(name, value);

  return value;
}

export function assertProductionLaunchEnv() {
  assertProductionVariables(productionRequiredVariables);
}

function isAppEnvironment(value: string): value is AppEnvironment {
  return appEnvironments.includes(value as AppEnvironment);
}

function assertProductionVariables(names: readonly string[]) {
  if (!isProductionEnv()) {
    return;
  }

  for (const name of names) {
    getRequiredServerEnv(name);
  }
}

function assertAllowedProductionValue(name: string, value: string) {
  if (!isProductionEnv()) {
    return;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue || isPlaceholderValue(normalizedValue) || isLocalProductionDatabaseUrl(name, normalizedValue)) {
    throw new ServerEnvError(`${name} must be set to a non-placeholder production value.`);
  }
}

function isPlaceholderValue(value: string) {
  return (
    value.includes("replace-with-") ||
    value.includes("placeholder") ||
    value.includes("example") ||
    value === "changeme" ||
    value === "change-me"
  );
}

function isLocalProductionDatabaseUrl(name: string, value: string) {
  return name === "DATABASE_URL" && (value.includes("localhost") || value.includes("127.0.0.1") || value.includes("[::1]") || value.includes("::1"));
}
