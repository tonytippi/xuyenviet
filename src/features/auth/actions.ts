"use server";

import { signIn, signOut } from "@/auth";

function getSafeRedirectPath(value: FormDataEntryValue | null) {
  if (value === "/ai-ask") {
    return "/ai-ask";
  }

  return "/ai-ask";
}

function getReferralCode(value: FormDataEntryValue | null) {
  return typeof value === "string" && value ? value : undefined;
}

function buildRedirectPath(path: string, referralCode: string | undefined) {
  if (!referralCode) {
    return path;
  }

  const params = new URLSearchParams({ ref: referralCode });

  return `${path}?${params.toString()}`;
}

export async function signInWithGoogle(formData: FormData) {
  const redirectTo = buildRedirectPath(getSafeRedirectPath(formData.get("next")), getReferralCode(formData.get("ref")));

  await signIn("google", { redirectTo });
}

export async function signOutCurrentUser() {
  await signOut({ redirectTo: "/sign-in" });
}
