import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { answerUsefulnessFeedback, conversations, messages, users } from "@/db/schema";

import { testDb } from "./helpers/db";

async function createTestUser(userId: string) {
  await testDb.insert(users).values({ id: userId, email: `${userId}@example.com` });
}

async function seedConversationMessages(userId = "user-1") {
  const [conversation] = await testDb.insert(conversations).values({ userId }).returning({ id: conversations.id });
  const [userMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId, role: "user", content: "Hà Nội đi Huế 5 ngày." }).returning({ id: messages.id });
  const [assistantMessage] = await testDb.insert(messages).values({ conversationId: conversation.id, userId, role: "assistant", content: "Nên chia chặng và nghỉ sớm." }).returning({ id: messages.id });

  return { conversation, userMessage, assistantMessage };
}

async function mockSession(userId: string | null) {
  vi.resetModules();
  vi.doMock("@/server/auth", () => ({
    getAuthenticatedSession: vi.fn().mockResolvedValue(userId ? { userId, email: `${userId}@example.com` } : null),
  }));
}

async function getFeedbackRows() {
  return testDb.select().from(answerUsefulnessFeedback);
}

describe("answer usefulness feedback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test("inserts and updates one current rating for an owned assistant answer", async () => {
    await createTestUser("user-1");
    const { assistantMessage } = await seedConversationMessages();
    await mockSession("user-1");
    const { saveAnswerUsefulnessFeedback } = await import("@/features/feedback/answer-usefulness");

    const firstResult = await saveAnswerUsefulnessFeedback({ assistantMessageId: assistantMessage.id, rating: "useful", comment: " Rất đúng nhu cầu gia đình. " });
    const secondResult = await saveAnswerUsefulnessFeedback({ assistantMessageId: assistantMessage.id, rating: "not_useful", comment: "Thiếu thời gian di chuyển." });
    const rows = await getFeedbackRows();

    expect(firstResult.success).toBe(true);
    expect(firstResult.feedback).toMatchObject({ rating: "useful", comment: "Rất đúng nhu cầu gia đình." });
    expect(secondResult.success).toBe(true);
    expect(secondResult.feedback).toMatchObject({ rating: "not_useful", comment: "Thiếu thời gian di chuyển." });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: "user-1", assistantMessageId: assistantMessage.id, rating: "not_useful", comment: "Thiếu thời gian di chuyển." });
  });

  test("normalizes blank comments and rejects comments over the limit", async () => {
    await createTestUser("user-1");
    const { assistantMessage } = await seedConversationMessages();
    await mockSession("user-1");
    const { saveAnswerUsefulnessFeedback } = await import("@/features/feedback/answer-usefulness");

    const blankResult = await saveAnswerUsefulnessFeedback({ assistantMessageId: assistantMessage.id, rating: "useful", comment: "   " });
    const longResult = await saveAnswerUsefulnessFeedback({ assistantMessageId: assistantMessage.id, rating: "useful", comment: "x".repeat(501) });
    const rows = await getFeedbackRows();

    expect(blankResult.success).toBe(true);
    expect(blankResult.feedback?.comment).toBeNull();
    expect(longResult).toMatchObject({ success: false, reason: "comment_too_long" });
    expect(rows).toHaveLength(1);
    expect(rows[0].comment).toBeNull();
  });

  test("does not write unauthenticated, cross-user, or user-message feedback", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const { assistantMessage, userMessage } = await seedConversationMessages("user-1");

    await mockSession(null);
    const unauthenticatedModule = await import("@/features/feedback/answer-usefulness");
    await expect(unauthenticatedModule.saveAnswerUsefulnessFeedback({ assistantMessageId: assistantMessage.id, rating: "useful" })).resolves.toMatchObject({ success: false, reason: "unauthenticated" });

    await mockSession("user-2");
    const crossUserModule = await import("@/features/feedback/answer-usefulness");
    await expect(crossUserModule.saveAnswerUsefulnessFeedback({ assistantMessageId: assistantMessage.id, rating: "useful" })).resolves.toMatchObject({ success: false, reason: "not_found" });

    await mockSession("user-1");
    const ownUserModule = await import("@/features/feedback/answer-usefulness");
    await expect(ownUserModule.saveAnswerUsefulnessFeedback({ assistantMessageId: userMessage.id, rating: "useful" })).resolves.toMatchObject({ success: false, reason: "invalid_target" });
    await expect(getFeedbackRows()).resolves.toHaveLength(0);
  });

  test("loads feedback only on owned assistant messages and cascades with conversation deletion", async () => {
    await createTestUser("user-1");
    await createTestUser("user-2");
    const userOneData = await seedConversationMessages("user-1");
    const userTwoData = await seedConversationMessages("user-2");
    await testDb.insert(answerUsefulnessFeedback).values([
      { userId: "user-1", conversationId: userOneData.conversation.id, assistantMessageId: userOneData.assistantMessage.id, rating: "useful", comment: "Tốt" },
      { userId: "user-2", conversationId: userTwoData.conversation.id, assistantMessageId: userTwoData.assistantMessage.id, rating: "not_useful", comment: "Thiếu nguồn" },
    ]);
    await mockSession("user-1");

    const { getOwnedConversation } = await import("@/features/chat-trips/conversations");
    const conversation = await getOwnedConversation(userOneData.conversation.id);

    expect(conversation?.messages.find((message) => message.id === userOneData.userMessage.id)?.feedback).toBeNull();
    expect(conversation?.messages.find((message) => message.id === userOneData.assistantMessage.id)?.feedback).toMatchObject({ rating: "useful", comment: "Tốt" });
    expect(JSON.stringify(conversation)).not.toContain("Thiếu nguồn");

    await testDb.delete(conversations).where(and(eq(conversations.id, userOneData.conversation.id), eq(conversations.userId, "user-1")));
    const remainingRows = await getFeedbackRows();

    expect(remainingRows).toHaveLength(1);
    expect(remainingRows[0].userId).toBe("user-2");
  });
});
