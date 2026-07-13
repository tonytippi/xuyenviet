import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth, { customFetch } from "next-auth";
import Google from "next-auth/providers/google";

import { getDb } from "@/db/client";
import { accounts, sessions, userRoles, users, verificationTokens } from "@/db/schema";
import { captureFirstTouchReferralAttribution } from "@/features/referrals/attribution";
import { assertProductionLaunchEnv } from "@/server/env";

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  ...assertAuthEnvironment(),
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google({ [customFetch]: authDebugFetch })],
  session: {
    strategy: "database",
  },
  pages: {
    signIn: "/sign-in",
    error: "/sign-in",
  },
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }

      return session;
    },
  },
  events: {
    async signIn({ user, isNewUser }) {
      if (isNewUser && user.id) {
        await captureFirstTouchReferralAttribution(user.id);
      }

      await provisionConfiguredAdminRoles(user.id, user.email);
    },
  },
}));

async function provisionConfiguredAdminRoles(userId: string | undefined, email: string | null | undefined) {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  const signedInEmail = normalizeEmail(email);

  if (!userId || !adminEmail || signedInEmail !== adminEmail) {
    return;
  }

  await getDb()
    .insert(userRoles)
    .values([
      { userId, role: "admin" },
      { userId, role: "operator" },
    ])
    .onConflictDoNothing({ target: [userRoles.userId, userRoles.role] });
}

function normalizeEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();

  return normalized || undefined;
}

function assertAuthEnvironment() {
  assertProductionLaunchEnv();

  if (isAuthDebugEnabled()) {
    console.warn("Auth debug enabled", {
      appEnv: process.env.APP_ENV ?? "local",
      authUrl: process.env.AUTH_URL ?? null,
      hasAuthSecret: Boolean(process.env.AUTH_SECRET),
      hasGoogleId: Boolean(process.env.AUTH_GOOGLE_ID),
      hasGoogleSecret: Boolean(process.env.AUTH_GOOGLE_SECRET),
      httpProxy: Boolean(process.env.HTTP_PROXY ?? process.env.http_proxy),
      httpsProxy: Boolean(process.env.HTTPS_PROXY ?? process.env.https_proxy),
      nodeOptions: process.env.NODE_OPTIONS ?? null,
      nodeVersion: process.version,
    });
  }

  return {};
}

async function authDebugFetch(input: RequestInfo | URL, init?: RequestInit) {
  if (!isAuthDebugEnabled()) {
    return fetch(input, init);
  }

  const startedAt = Date.now();
  const request = getDebugRequest(input, init);

  console.warn("Auth provider fetch started", request);

  try {
    const response = await fetch(input, init);

    console.warn("Auth provider fetch completed", {
      ...request,
      durationMs: Date.now() - startedAt,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    });

    return response;
  } catch (error) {
    console.error("Auth provider fetch failed", {
      ...request,
      durationMs: Date.now() - startedAt,
      error: getDebugError(error),
    });

    throw error;
  }
}

function isAuthDebugEnabled() {
  return process.env.AUTH_DEBUG === "true";
}

function getDebugRequest(input: RequestInfo | URL, init?: RequestInit) {
  const url = getDebugUrl(input);

  return {
    method: init?.method ?? (input instanceof Request ? input.method : "GET"),
    url: url ? `${url.origin}${url.pathname}` : "unknown",
    host: url?.host ?? "unknown",
  };
}

function getDebugUrl(input: RequestInfo | URL) {
  try {
    if (input instanceof Request) {
      return new URL(input.url);
    }

    return new URL(input.toString());
  } catch {
    return null;
  }
}

function getDebugError(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const cause = error.cause instanceof Error ? error.cause : null;

  return {
    name: error.name,
    message: error.message,
    cause: cause
      ? {
          name: cause.name,
          message: cause.message,
          code: "code" in cause ? cause.code : undefined,
        }
      : error.cause,
  };
}
