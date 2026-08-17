import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { knowledgeProvinceReferences, schema, users } from "@/db/schema";
import { knowledgeProvinceReferenceEffectiveDate, knowledgeProvinceReferenceFixture, knowledgeProvinceReferenceProvenance, knowledgeProvinceReferenceVersion } from "@/db/knowledge-geography";

import { getTestDatabaseUrl } from "./env-file";

const testDatabaseUrl = new URL(getTestDatabaseUrl());
// The fixture connection represents the coordinated v1 writer. Production
// connections never receive this test-only admission parameter.
testDatabaseUrl.searchParams.set("options", "-c xuyenviet.provenance_writer_contract=v1");
const testSql = postgres(testDatabaseUrl.toString(), { max: 1 });

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
  const currentUnits = knowledgeProvinceReferenceFixture.filter((reference) => reference.id === reference.currentUnitId);
  const legacyAliases = knowledgeProvinceReferenceFixture.filter((reference) => reference.id !== reference.currentUnitId);
  await testDb.insert(knowledgeProvinceReferences).values([...currentUnits, ...legacyAliases].map((reference) => ({ ...reference, version: knowledgeProvinceReferenceVersion, effectiveDate: knowledgeProvinceReferenceEffectiveDate, officialSourceUrl: knowledgeProvinceReferenceProvenance })));
}

export async function seedTestOperator() {
  await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
}

export async function closeTestDatabase() {
  await testSql.end();
}
