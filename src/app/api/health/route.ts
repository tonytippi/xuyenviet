import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { assertProductionLaunchEnv } from "@/server/env";
import { isWebDeploymentReady } from "@/server/web-schema-admission";

export const dynamic = "force-dynamic";

export async function GET() {
  const ready = await isWebDeploymentReady({
    assertEnvironment: assertProductionLaunchEnv,
    probeDatabase: async () => { await getDb().execute(sql`select 1`); },
    readReleaseVersions: () => getDb().execute(sql<{ version: string }>`select version from release_schema_versions`),
  });
  return ready ? NextResponse.json({ status: "ok" }) : NextResponse.json({ status: "unavailable" }, { status: 503 });
}
