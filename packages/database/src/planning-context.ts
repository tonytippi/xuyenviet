import { and, eq } from "drizzle-orm";
import { parsePlanningContextSession, type PlanningContextSession } from "@xuyenviet/contracts";

import { getDb } from "./client";
import { conversations, planningContextSessions } from "./schema";

type Transaction = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (transaction: infer T) => unknown ? T : never;

export type PlanningContextSaveResult =
  | { status: "saved"; session: PlanningContextSession }
  | { status: "stale" }
  | { status: "not_found" }
  | { status: "invalid" };

const materialSlots = ["origin", "destination", "start_date", "adults"] as const;

export type PlanningClarification =
  | { kind: "not_applicable" }
  | { kind: "question"; session: PlanningContextSession; question: string }
  | { kind: "ready"; session: PlanningContextSession }
  | { kind: "retry" };

/** A bounded, code-owned profile for the only planning intent supported in this story. */
export function isPlanningClarificationCandidate(question: string) {
  return /(?:đi|đến|tới|du lịch|chuyến đi|lịch trình|road trip|phượt)/iu.test(question);
}

export function reducePlanningClarification(input: { session: PlanningContextSession | null; question: string; sourceMessageId: string }): PlanningClarification {
  const question = input.question.trim().replace(/\s+/g, " ");
  if (!question || !input.sourceMessageId) return { kind: "retry" };
  const extracted = extractExplicitSlots(question);
  if (!input.session && !isPlanningClarificationCandidate(question)) return { kind: "not_applicable" };

  if (input.session?.status === "collecting" && Object.keys(extracted).length === 0) {
    return { kind: "question", session: input.session, question: clarificationQuestion(input.session.missingSlots.find((slot): slot is (typeof materialSlots)[number] => materialSlots.includes(slot as (typeof materialSlots)[number])) ?? "origin") };
  }

  let slots: Partial<Record<PlanningContextSession["missingSlots"][number], string>> = input.session ? { ...input.session.slots } : {};
  let superseded = false;
  for (const [slot, value] of Object.entries(extracted) as Array<[keyof typeof slots, string]>) {
    if (slots[slot] && slots[slot] !== value) {
      // A newly stated destination starts a different plan. Other conflicts must
      // be corrected explicitly rather than silently preferring the latest reply.
      if (slot === "destination") {
        slots = { destination: value };
        superseded = true;
      } else {
        delete slots[slot];
      }
    } else {
      slots[slot] = value;
    }
  }
  const missingSlots = materialSlots.filter((slot) => !slots[slot]);
  const session: PlanningContextSession = {
    intent: "trip_planning",
    slots,
    missingSlots,
    status: missingSlots.length === 0 ? "ready" : "collecting",
    sourceMessageIds: [...(superseded ? [] : input.session?.sourceMessageIds ?? []), input.sourceMessageId].slice(-40),
    revision: (input.session?.revision ?? 0) + 1,
  };
  if (missingSlots.length === 0) return { kind: "ready", session };
  return { kind: "question", session, question: clarificationQuestion(missingSlots[0]!)};
}

export function isPlanningClarificationBlocked(session: PlanningContextSession | null, question: string) {
  const reduced = reducePlanningClarification({ session, question, sourceMessageId: "admission" });
  return reduced.kind === "question" || reduced.kind === "retry";
}

export async function prepareOwnedPlanningClarification(userId: string, conversationId: string, question: string, sourceMessageId: string): Promise<PlanningClarification> {
  const current = await loadOwnedPlanningContextSession(userId, conversationId);
  const reduced = reducePlanningClarification({ session: current, question, sourceMessageId });
  if (reduced.kind === "not_applicable" || reduced.kind === "retry") return reduced;
  if (reduced.kind === "ready" && current?.status === "ready" && JSON.stringify(current.slots) === JSON.stringify(reduced.session.slots)) {
    return { kind: "ready", session: current };
  }
  const saved = await saveOwnedPlanningContextSession(userId, conversationId, current?.revision ?? null, reduced.session);
  if (saved.status !== "saved") return { kind: "retry" };
  return reduced.kind === "ready" ? { kind: "ready", session: saved.session } : { ...reduced, session: saved.session };
}

function extractExplicitSlots(question: string): Partial<Record<(typeof materialSlots)[number], string>> {
  const slots: Partial<Record<(typeof materialSlots)[number], string>> = {};
  const origin = question.match(/(?:xuất phát\s+từ|đi\s+từ)\s+([\p{L}\s-]{2,80}?)(?=\s+(?:đi|đến|vào|ngày)|[,.!?]|$)/iu)?.[1]?.trim();
  const destination = question.match(/(?:đi|đến|tới)\s+([\p{L}\s-]{2,80}?)(?=\s+(?:vào|ngày|từ)|[,.!?]|$)/iu)?.[1]?.trim();
  const startDate = question.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  const adults = question.match(/\b(\d{1,2})\s*(?:người lớn|người)\b/iu)?.[1];
  if (origin) slots.origin = origin;
  if (destination) slots.destination = destination;
  if (startDate && validDate(startDate)) slots.start_date = startDate;
  if (adults && Number(adults) >= 1 && Number(adults) <= 20) slots.adults = adults;
  return slots;
}

function validDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function clarificationQuestion(slot: (typeof materialSlots)[number]) {
  return ({ origin: "Bạn sẽ xuất phát từ đâu?", destination: "Bạn muốn đến đâu?", start_date: "Bạn dự định khởi hành ngày nào?", adults: "Có bao nhiêu người lớn cùng đi?" })[slot];
}

export async function loadOwnedPlanningContextSession(userId: string, conversationId: string): Promise<PlanningContextSession | null> {
  const [row] = await getDb().select({ payload: planningContextSessions.payload }).from(planningContextSessions).where(and(eq(planningContextSessions.userId, userId), eq(planningContextSessions.conversationId, conversationId))).limit(1);
  return row ? parsePlanningContextSession(row.payload) : null;
}

export async function saveOwnedPlanningContextSession(userId: string, conversationId: string, expectedRevision: number | null, payload: unknown): Promise<PlanningContextSaveResult> {
  const session = parsePlanningContextSession(payload);
  if (!session || (expectedRevision === null ? session.revision !== 1 : !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || session.revision !== expectedRevision + 1)) return { status: "invalid" };
  return getDb().transaction((transaction) => saveInTransaction(transaction, userId, conversationId, expectedRevision, session));
}

async function saveInTransaction(transaction: Transaction, userId: string, conversationId: string, expectedRevision: number | null, session: PlanningContextSession): Promise<PlanningContextSaveResult> {
  const [conversation] = await transaction.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId))).limit(1).for("update");
  if (!conversation) return { status: "not_found" };
  if (expectedRevision === null) {
    const [created] = await transaction.insert(planningContextSessions).values({ userId, conversationId, payload: session, revision: session.revision }).onConflictDoNothing().returning({ conversationId: planningContextSessions.conversationId });
    return created ? { status: "saved", session } : { status: "stale" };
  }
  const [updated] = await transaction.update(planningContextSessions).set({ payload: session, revision: session.revision, updatedAt: new Date() }).where(and(eq(planningContextSessions.userId, userId), eq(planningContextSessions.conversationId, conversationId), eq(planningContextSessions.revision, expectedRevision))).returning({ conversationId: planningContextSessions.conversationId });
  return updated ? { status: "saved", session } : { status: "stale" };
}
