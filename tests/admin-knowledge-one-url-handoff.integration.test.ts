import { beforeEach, describe, expect, test } from "vitest";
import type { RequestPrincipal } from "@xuyenviet/contracts";
import { createPostgresAdminKnowledgeIntakePort, knowledgeOneUrlHandoffs, sources, users } from "@xuyenviet/database";
import { resetTestDatabase, seedTestOperator, testDb } from "./helpers/db";

const actor: RequestPrincipal = { userId: "operator", email: "operator@example.com", roles: ["operator"], sessionId: "session-operator", authorizationVersion: 1 };
const canonicalUrl = "https://www.youtube.com/watch?v=abcDEF12345";

describe.sequential("Knowledge one-URL handoff ledger", () => {
  beforeEach(async () => { await resetTestDatabase(); await seedTestOperator(); await testDb.insert(users).values({ id: "operator-two", email: "operator-two@example.com" }); });

  test("binds opaque references to the original actor and canonical URL and returns only closed outcomes", async () => {
    const handoff = createPostgresAdminKnowledgeIntakePort().handoff;
    await expect(handoff.submit({ reference: "handoff-1", canonicalUrl, actorUserId: actor.userId })).resolves.toBe("submitted");
    await expect(handoff.lookup("handoff-1")).resolves.toBe("submitted");
    await expect(handoff.submit({ reference: "handoff-1", canonicalUrl, actorUserId: actor.userId })).resolves.toBe("submitted");
    expect(await testDb.select().from(knowledgeOneUrlHandoffs)).toHaveLength(1);
    expect(await testDb.select().from(sources)).toHaveLength(1);
  });

  test("persists a terminal duplicate only for its original opaque handoff", async () => {
    const handoff = createPostgresAdminKnowledgeIntakePort().handoff;
    await handoff.submit({ reference: "handoff-original", canonicalUrl, actorUserId: actor.userId });
    await expect(handoff.submit({ reference: "handoff-duplicate", canonicalUrl, actorUserId: actor.userId })).resolves.toBe("duplicate");
    await expect(handoff.lookup("handoff-duplicate")).resolves.toBe("duplicate");
  });

  test("returns the durable outcome to simultaneous submissions of a new reference", async () => {
    const handoff = createPostgresAdminKnowledgeIntakePort().handoff;
    const input = { reference: "handoff-concurrent", canonicalUrl, actorUserId: actor.userId };

    await expect(Promise.all([handoff.submit(input), handoff.submit(input)])).resolves.toEqual(["submitted", "submitted"]);
    await expect(handoff.lookup(input.reference)).resolves.toBe("submitted");
    expect(await testDb.select().from(knowledgeOneUrlHandoffs)).toHaveLength(1);
    expect(await testDb.select().from(sources)).toHaveLength(1);
  });
});
