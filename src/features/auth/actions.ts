"use server";

import { signOut } from "@/auth";

export async function signOutCurrentUser() {
  await signOut({ redirectTo: "/sign-in" });
}
