import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

import { getDb } from "@/db/client";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
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
  providers: [Google],
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
    },
  },
}));

function assertAuthEnvironment() {
  assertProductionLaunchEnv();

  return {};
}
