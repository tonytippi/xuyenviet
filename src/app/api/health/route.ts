import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { assertProductionLaunchEnv } from "@/server/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertProductionLaunchEnv();
    await getDb().execute(sql`select 1`);

    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
