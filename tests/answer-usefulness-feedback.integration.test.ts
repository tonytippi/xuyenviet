import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { createPostgresTravelerCommandPort } from "../packages/database/src";
import { answerUsefulnessFeedback, conversations, messages, users } from "@/db/schema";
import { resetTestDatabase, testDb } from "./helpers/db";

async function seed() {
  await testDb.insert(users).values([
    { id: "owner", email: "owner@example.com" },
    { id: "other", email: "other@example.com" },
  ]);
  await testDb.insert(conversations).values([
    { id: "owner-conversation", userId: "owner" },
    { id: "other-conversation", userId: "other" },
  ]);
  await testDb.insert(messages).values([
    { id: "assistant-message", userId: "owner", conversationId: "owner-conversation", role: "assistant", content: "Trả lời" },
    { id: "user-message", userId: "owner", conversationId: "owner-conversation", role: "user", content: "Câu hỏi" },
    { id: "other-assistant-message", userId: "other", conversationId: "other-conversation", role: "assistant", content: "Riêng tư" },
  ]);
}

describe("answer usefulness feedback persistence", () => {
  beforeEach(async () => { await resetTestDatabase(); });

  test("inserts, trims, updates one owner row, and clears a negative comment on useful", async () => {
    await seed();
    const commands = createPostgresTravelerCommandPort();

    await expect(commands.saveAnswerUsefulnessFeedback("owner", { assistantMessageId: "assistant-message", rating: "not_useful", comment: "  Cần rõ hơn  " })).resolves.toMatchObject({ success: true, feedback: { rating: "not_useful", comment: "Cần rõ hơn" } });
    await expect(commands.saveAnswerUsefulnessFeedback("owner", { assistantMessageId: "assistant-message", rating: "useful", comment: "  " })).resolves.toMatchObject({ success: true, feedback: { rating: "useful", comment: null } });
    await expect(testDb.select().from(answerUsefulnessFeedback).where(eq(answerUsefulnessFeedback.assistantMessageId, "assistant-message"))).resolves.toEqual([
      expect.objectContaining({ userId: "owner", rating: "useful", comment: null }),
    ]);
  });

  test("rejects foreign, missing, non-assistant, and overlong feedback without a row", async () => {
    await seed();
    const commands = createPostgresTravelerCommandPort();

    await expect(commands.saveAnswerUsefulnessFeedback("other", { assistantMessageId: "assistant-message", rating: "useful" })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(commands.saveAnswerUsefulnessFeedback("owner", { assistantMessageId: "missing", rating: "useful" })).resolves.toEqual({ success: false, reason: "not_found" });
    await expect(commands.saveAnswerUsefulnessFeedback("owner", { assistantMessageId: "user-message", rating: "useful" })).resolves.toEqual({ success: false, reason: "invalid_target" });
    await expect(commands.saveAnswerUsefulnessFeedback("owner", { assistantMessageId: "assistant-message", rating: "not_useful", comment: "a".repeat(501) })).resolves.toEqual({ success: false, reason: "comment_too_long" });
    await expect(testDb.select().from(answerUsefulnessFeedback)).resolves.toEqual([]);
  });

  test("serializes concurrent owner updates into one complete feedback row", async () => {
    await seed();
    const commands = createPostgresTravelerCommandPort();
    const results = await Promise.all([
      commands.saveAnswerUsefulnessFeedback("owner", { assistantMessageId: "assistant-message", rating: "useful" }),
      commands.saveAnswerUsefulnessFeedback("owner", { assistantMessageId: "assistant-message", rating: "not_useful", comment: "Cần thêm ví dụ" }),
    ]);

    expect(results.every((result) => result.success)).toBe(true);
    const rows = await testDb.select().from(answerUsefulnessFeedback).where(and(eq(answerUsefulnessFeedback.userId, "owner"), eq(answerUsefulnessFeedback.assistantMessageId, "assistant-message")));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ rating: expect.stringMatching(/^(useful|not_useful)$/) }));
    if (rows[0]!.rating === "useful") expect(rows[0]!.comment).toBeNull();
    else expect(rows[0]!.comment).toBe("Cần thêm ví dụ");
  });
});
