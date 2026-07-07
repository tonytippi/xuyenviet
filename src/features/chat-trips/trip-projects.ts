import "server-only";

import { and, asc, count, desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { chatContext, conversations, messages, tripProjects } from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
import { getAuthenticatedSession } from "@/server/auth";

import { formatTripProjectLabel } from "./labels";

export { formatTripProjectLabel };

const previewMaxLength = 60;
const maxTitleLength = 160;
const maxTripFieldLength = 500;
const maxNotesLength = 2_000;
const maxOwnedTripProjectsLimit = 100;
const maxRelatedChatsRowLimit = 1_000;
const tripDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export type TripProjectInput = {
  title: string;
  origin?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  travelers?: string | null;
  notes?: string | null;
};

export type OwnedTripProjectSummary = {
  id: string;
  title: string;
  origin: string | null;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  travelers: string | null;
  notes: string | null;
  updatedAt: Date;
};

export type DeleteOwnedTripProjectResult = {
  success: boolean;
  reason?: "unauthenticated" | "not_found" | "failed";
};

export async function createTripProject(input: TripProjectInput): Promise<OwnedTripProjectSummary> {
  const session = await getAuthenticatedSession();

  if (!session) {
    throw new Error("Authentication required to create a trip project.");
  }

  const values = normalizeTripProjectInput(input);
  const db = getDb();

  return db.transaction(async (transaction) => {
    const [project] = await transaction.insert(tripProjects).values({ userId: session.userId, ...values }).returning({
      id: tripProjects.id,
      title: tripProjects.title,
      origin: tripProjects.origin,
      destination: tripProjects.destination,
      startDate: tripProjects.startDate,
      endDate: tripProjects.endDate,
      travelers: tripProjects.travelers,
      notes: tripProjects.notes,
      updatedAt: tripProjects.updatedAt,
    });

    await recordAuditEvent({
      actor: session,
      operation: "create",
      targetType: "trip_project",
      targetId: project.id,
      afterSummary: formatTripProjectAuditSummary(project),
    }, transaction);

    return project;
  });
}

export async function listOwnedTripProjects(): Promise<OwnedTripProjectSummary[] | null> {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  return getDb()
    .select({
      id: tripProjects.id,
      title: tripProjects.title,
      origin: tripProjects.origin,
      destination: tripProjects.destination,
      startDate: tripProjects.startDate,
      endDate: tripProjects.endDate,
      travelers: tripProjects.travelers,
      notes: tripProjects.notes,
      updatedAt: tripProjects.updatedAt,
    })
    .from(tripProjects)
    .where(eq(tripProjects.userId, session.userId))
    .orderBy(desc(tripProjects.updatedAt), desc(tripProjects.id))
    .limit(maxOwnedTripProjectsLimit);
}

export async function getOwnedTripProject(tripProjectId: string) {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  return getOwnedTripProjectForSession(session, tripProjectId);
}

export async function getOwnedTripProjectSummary(tripProjectId: string) {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

  const project = await getOwnedTripProjectForSession(session, tripProjectId);

  if (!project) {
    return null;
  }

  const rows = await getDb()
    .select({ id: conversations.id, updatedAt: conversations.updatedAt, messageContent: messages.content })
    .from(conversations)
    .leftJoin(messages, and(eq(messages.conversationId, conversations.id), eq(messages.userId, session.userId), eq(messages.role, "user")))
    .where(and(eq(conversations.userId, session.userId), eq(conversations.tripProjectId, tripProjectId)))
    .orderBy(desc(conversations.updatedAt), desc(conversations.id), asc(messages.createdAt), asc(messages.id))
    .limit(maxRelatedChatsRowLimit);

  const seenConversationIds = new Set<string>();
  const relatedChats: Array<{ id: string; updatedAt: Date; preview: string }> = [];

  for (const row of rows) {
    if (seenConversationIds.has(row.id)) {
      continue;
    }

    seenConversationIds.add(row.id);
    relatedChats.push({ id: row.id, updatedAt: row.updatedAt, preview: formatPreview(row.messageContent) });
  }

  return { ...project, relatedChats };
}

export async function deleteOwnedTripProject(tripProjectId: string): Promise<DeleteOwnedTripProjectResult> {
  const session = await getAuthenticatedSession();

  if (!session) {
    return { success: false, reason: "unauthenticated" };
  }

  try {
    return await getDb().transaction(async (transaction) => {
      const [project] = await transaction
        .select({ id: tripProjects.id })
        .from(tripProjects)
        .where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId)))
        .limit(1)
        .for("update");

      if (!project) {
        return { success: false, reason: "not_found" };
      }

      const [linkedConversationCount] = await transaction.select({ count: count() }).from(conversations).where(and(eq(conversations.tripProjectId, project.id), eq(conversations.userId, session.userId)));
      const [projectContextCount] = await transaction.select({ count: count() }).from(chatContext).where(and(eq(chatContext.tripProjectId, project.id), eq(chatContext.userId, session.userId)));

      const deletedRows = await transaction
        .delete(tripProjects)
        .where(and(eq(tripProjects.id, project.id), eq(tripProjects.userId, session.userId)))
        .returning({ id: tripProjects.id });

      if (deletedRows.length !== 1) {
        return { success: false, reason: "not_found" };
      }

      await recordAuditEvent({
        actor: session,
        operation: "delete",
        targetType: "trip_project",
        targetId: project.id,
        beforeSummary: JSON.stringify({
          tripProjectId: project.id,
          linkedConversationCount: linkedConversationCount?.count ?? 0,
          chatContextCount: projectContextCount?.count ?? 0,
        }),
        afterSummary: JSON.stringify({ deleted: true, linkedConversationsDetached: true }),
      }, transaction);

      return { success: true };
    });
  } catch (error) {
    console.error("Failed to delete owned trip project.", { tripProjectId, userId: session.userId, error });
    return { success: false, reason: "failed" };
  }
}

async function getOwnedTripProjectForSession(session: { userId: string }, tripProjectId: string) {
  const [project] = await getDb()
    .select({
      id: tripProjects.id,
      title: tripProjects.title,
      origin: tripProjects.origin,
      destination: tripProjects.destination,
      startDate: tripProjects.startDate,
      endDate: tripProjects.endDate,
      travelers: tripProjects.travelers,
      notes: tripProjects.notes,
      updatedAt: tripProjects.updatedAt,
    })
    .from(tripProjects)
    .where(and(eq(tripProjects.id, tripProjectId), eq(tripProjects.userId, session.userId)))
    .limit(1);

  return project ?? null;
}

function normalizeTripProjectInput(input: TripProjectInput) {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Trip project title is required.");
  }

  if (title.length > maxTitleLength) {
    throw new Error(`Trip project title must be ${maxTitleLength} characters or fewer.`);
  }

  const startDate = normalizeTripDate(input.startDate);
  const endDate = normalizeTripDate(input.endDate);

  if (startDate && endDate && startDate > endDate) {
    throw new Error("Trip project end date cannot be before the start date.");
  }

  return {
    title,
    origin: normalizeOptionalText(input.origin, maxTripFieldLength),
    destination: normalizeOptionalText(input.destination, maxTripFieldLength),
    startDate,
    endDate,
    travelers: normalizeOptionalText(input.travelers, maxTripFieldLength),
    notes: normalizeOptionalText(input.notes, maxNotesLength),
  };
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new Error(`Trip project field must be ${maxLength} characters or fewer.`);
  }

  return trimmed;
}

function normalizeTripDate(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  if (!tripDatePattern.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
    throw new Error("Trip project dates must use the YYYY-MM-DD format.");
  }

  return trimmed;
}

function formatTripProjectAuditSummary(project: Pick<OwnedTripProjectSummary, "title" | "origin" | "destination" | "startDate" | "endDate" | "travelers" | "notes">) {
  return JSON.stringify({
    titleLength: project.title.length,
    hasOrigin: Boolean(project.origin),
    hasDestination: Boolean(project.destination),
    hasStartDate: Boolean(project.startDate),
    hasEndDate: Boolean(project.endDate),
    hasTravelers: Boolean(project.travelers),
    hasNotes: Boolean(project.notes),
  });
}

function formatPreview(content: string | null): string {
  if (!content) {
    return "Hội thoại mới";
  }

  const trimmed = content.trim();

  if (trimmed.length <= previewMaxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, previewMaxLength).trimEnd()}…`;
}
