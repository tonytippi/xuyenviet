import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { schema } from "@/db/schema";

import { getTestDatabaseUrl } from "./env-file";

const testSql = postgres(getTestDatabaseUrl(), { max: 1 });

export const testDb = drizzle(testSql, { schema });

export async function resetTestDatabase() {
  const tables = await testSql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
    order by table_name
  `;

  if (tables.length === 0) {
    return;
  }

  const tableList = tables.map(({ table_name: tableName }) => `"${tableName.replaceAll('"', '""')}"`).join(", ");

  await testSql.unsafe(`truncate table ${tableList} restart identity cascade`);
}

export async function closeTestDatabase() {
  await testSql.end();
}
