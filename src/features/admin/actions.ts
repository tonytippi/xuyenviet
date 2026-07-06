"use server";

import { requireAdminSession } from "@/server/auth";

export async function validateAdminActionAccess() {
  await requireAdminSession();
}
