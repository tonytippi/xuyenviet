import { beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { planningContextCatalogRecords, planningContextPolicyVersions, planningContextProfileVersions, planningContextValueSchemaVersions } from "@xuyenviet/database";
import { resetTestDatabase, testDb } from "./helpers/db";

describe("planning context profile version records", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("seeds exact immutable v6 catalog records and enforces their constraints", async () => {
    await testDb.insert(planningContextProfileVersions).values(planningContextCatalogRecords.profile);
    await testDb.insert(planningContextPolicyVersions).values(planningContextCatalogRecords.policy);
    await testDb.insert(planningContextValueSchemaVersions).values(planningContextCatalogRecords.valueSchemas);
    const [profile] = await testDb.select().from(planningContextProfileVersions).where(eq(planningContextProfileVersions.id, planningContextCatalogRecords.profile.id));
    const [policy] = await testDb.select().from(planningContextPolicyVersions).where(eq(planningContextPolicyVersions.id, planningContextCatalogRecords.policy.id));
    const schemas = await testDb.select().from(planningContextValueSchemaVersions);
    expect(profile).toMatchObject(planningContextCatalogRecords.profile);
    expect(policy).toMatchObject(planningContextCatalogRecords.policy);
    expect(schemas.map((row) => ({ id: row.id, key: row.key, version: row.version, definition: row.definition, digest: row.digest })).sort((left, right) => left.key.localeCompare(right.key))).toEqual(planningContextCatalogRecords.valueSchemas);
    await expect(testDb.update(planningContextProfileVersions).set({ digest: "d".repeat(64) }).where(eq(planningContextProfileVersions.id, "planning-profile:v6"))).rejects.toThrow();
    await expect(testDb.delete(planningContextPolicyVersions).where(eq(planningContextPolicyVersions.id, "planning-policy:v6"))).rejects.toThrow();
    await expect(testDb.insert(planningContextValueSchemaVersions).values({ id: "bad", key: "Invalid", version: 1, digest: "e".repeat(64), definition: {} })).rejects.toThrow();
    await expect(testDb.insert(planningContextProfileVersions).values({ id: "duplicate", version: 6, digest: "f".repeat(64), definition: {} })).rejects.toThrow();
  });
});
