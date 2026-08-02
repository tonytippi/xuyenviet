import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db/client";
import { assertProductionLaunchEnv } from "@/server/env";
import { isWebDeploymentReady, readWebReleasePhasePolicy } from "@/server/web-schema-admission";

export const dynamic = "force-dynamic";

export async function GET() {
  const ready = await isWebDeploymentReady({
    assertEnvironment: assertProductionLaunchEnv,
    probeDatabase: async () => { await getDb().execute(sql`select 1`); },
    readReleaseVersions: () => getDb().execute(sql<{ version: string }>`select version from release_schema_versions`),
    async readReleaseAdmission() {
      const rows = await getDb().execute(sql<{ version: string | null; identity: string }>`select release_schema_versions.version, target.identity from (select 'database=' || current_database() || ';host=' || coalesce(host(inet_server_addr()), 'local') || ';port=' || coalesce(inet_server_port()::text, '5432') as identity) target left join release_schema_versions on true`);
      const identity = rows[0]?.identity;
      if (typeof identity !== "string") throw new Error("Database identity unavailable.");
      return { rows: rows.flatMap((row) => typeof row.version === "string" ? [{ version: row.version }] : []), resolvedTargetIdentity: identity };
    },
    releasePhasePolicy: readWebReleasePhasePolicy(),
  });
  return ready ? NextResponse.json({ status: "ok" }) : NextResponse.json({ status: "unavailable" }, { status: 503 });
}
