import "server-only";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb } from "@/db/client";
import { referralAttributions, referralCodes } from "@/db/schema";

const pendingReferralCookieName = "xv_pending_ref";
const pendingReferralMaxAgeSeconds = 10 * 60;
const maxReferralCodeLength = 64;

type ReferralDatabase = Pick<ReturnType<typeof getDb>, "insert" | "select">;

export function normalizeReferralCode(value: FormDataEntryValue | string | null | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();

  if (!normalized || normalized.length > maxReferralCodeLength || !/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
}

export async function storePendingReferralCode(value: FormDataEntryValue | string | null | undefined) {
  const code = normalizeReferralCode(value);
  const cookieStore = await cookies();

  if (!code) {
    cookieStore.delete(pendingReferralCookieName);
    return undefined;
  }

  cookieStore.set(pendingReferralCookieName, code, {
    httpOnly: true,
    maxAge: pendingReferralMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return code;
}

export async function getPendingReferralCode() {
  const cookieStore = await cookies();

  return normalizeReferralCode(cookieStore.get(pendingReferralCookieName)?.value);
}

export async function clearPendingReferralCode() {
  try {
    const cookieStore = await cookies();

    cookieStore.delete(pendingReferralCookieName);
  } catch {
    return;
  }
}

export async function captureFirstTouchReferralAttribution(userId: string, database: ReferralDatabase = getDb()) {
  try {
    const code = await getPendingReferralCode();

    if (!code) {
      return;
    }

    const existingAttribution = await database
      .select({ id: referralAttributions.id })
      .from(referralAttributions)
      .where(eq(referralAttributions.userId, userId))
      .limit(1);

    if (existingAttribution.length > 0) {
      await clearPendingReferralCode();
      return;
    }

    const activeReferralCodes = await database
      .select({ id: referralCodes.id, referrerUserId: referralCodes.referrerUserId })
      .from(referralCodes)
      .where(and(eq(referralCodes.code, code), eq(referralCodes.active, true)))
      .limit(1);
    const activeReferralCode = activeReferralCodes.find((referralCode) => referralCode.referrerUserId !== userId);

    if (!activeReferralCode) {
      await clearPendingReferralCode();
      return;
    }

    await database
      .insert(referralAttributions)
      .values({
        userId,
        referralCodeId: activeReferralCode.id,
        referrerUserId: activeReferralCode.referrerUserId,
      })
      .onConflictDoNothing({ target: referralAttributions.userId });

    await clearPendingReferralCode();
  } catch {
    return;
  }
}
