import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { aiGatewayModels, aiPurposes, knowledgeProvinceReferences, schema, users, type AiGatewayModelPurpose } from "@/db/schema";
import { knowledgeProvinceReferenceEffectiveDate, knowledgeProvinceReferenceFixture, knowledgeProvinceReferenceProvenance, knowledgeProvinceReferenceVersion } from "@/db/knowledge-geography";

import { getTestDatabaseUrl } from "./env-file";

const testDatabaseUrl = new URL(getTestDatabaseUrl());
// The fixture connection represents the coordinated v1 writer. Production
// connections never receive this test-only admission parameter.
testDatabaseUrl.searchParams.set("options", "-c xuyenviet.provenance_writer_contract=v1");
const testSql = postgres(testDatabaseUrl.toString(), { max: 1 });

export const testDb = drizzle(testSql, { schema });

let publicBaseTables: string[] | undefined;

export function invalidateTestDatabaseTableCache() {
  publicBaseTables = undefined;
}

export async function resetTestDatabase() {
  if (!publicBaseTables) {
    const tables = await testSql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `;
    publicBaseTables = tables.map(({ table_name: tableName }) => tableName);
  }

  if (publicBaseTables.length === 0) {
    return;
  }

  const tableList = publicBaseTables.map((tableName) => `"${tableName.replaceAll('"', '""')}"`).join(", ");

  await testSql.unsafe(`truncate table ${tableList} restart identity cascade`);
  const currentUnits = knowledgeProvinceReferenceFixture.filter((reference) => reference.id === reference.currentUnitId);
  const legacyAliases = knowledgeProvinceReferenceFixture.filter((reference) => reference.id !== reference.currentUnitId);
  await testDb.insert(knowledgeProvinceReferences).values([...currentUnits, ...legacyAliases].map((reference) => ({ ...reference, version: knowledgeProvinceReferenceVersion, effectiveDate: knowledgeProvinceReferenceEffectiveDate, officialSourceUrl: knowledgeProvinceReferenceProvenance })));
}

export async function seedTestOperator() {
  await testDb.insert(users).values({ id: "operator", email: "operator@example.com" });
}

export async function seedAiPurposeModel(input: {
  id: string;
  gatewayModelName: string;
  displayLabel: string;
  purpose: AiGatewayModelPurpose;
  active?: boolean;
  supportsTextInput?: boolean;
  supportsImageInput?: boolean;
  supportsStreaming?: boolean;
  supportsEmbeddings?: boolean;
  supportsExtraction?: boolean;
  supportsEvaluation?: boolean;
  pricingUnitTokens?: number;
  pricingEffectiveAt?: Date;
  mapPurpose?: boolean;
}) {
  const { purpose, mapPurpose = true, ...model } = input;
  await testDb.insert(aiGatewayModels).values(model);
  if (mapPurpose) await testDb.insert(aiPurposes).values({ purpose, aiGatewayModelId: input.id });
}

export async function closeTestDatabase() {
  await testSql.end();
}
