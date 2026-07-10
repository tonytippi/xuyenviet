"use server";

import { signIn, signOut } from "@/auth";
import { storePendingReferralCode } from "@/features/referrals/attribution";
import { getSafeRedirectPath } from "./redirects";

export async function signInWithGoogle(formData: FormData) {
  await storePendingReferralCode(formData.get("ref"));
  const redirectTo = getSafeRedirectPath(formData.get("next"), { draft: formData.get("draft") });

  await signIn("google", { redirectTo });
}

export async function signOutCurrentUser() {
  await signOut({ redirectTo: "/sign-in" });
}
