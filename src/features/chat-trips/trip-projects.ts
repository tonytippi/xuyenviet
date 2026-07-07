import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { conversations, messages, tripProjects } from "@/db/schema";
import { recordAuditEvent } from "@/features/audit/events";
import { getAuthenticatedSession } from "@/server/auth";

const previewMaxLength = 60;

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
    .orderBy(desc(tripProjects.updatedAt), desc(tripProjects.id));
}

export async function getOwnedTripProject(tripProjectId: string) {
  const session = await getAuthenticatedSession();

  if (!session) {
    return null;
  }

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

export async function getOwnedTripProjectSummary(tripProjectId: string) {
  const project = await getOwnedTripProject(tripProjectId);
  const session = await getAuthenticatedSession();

  if (!project || !session) {
    return null;
  }

  const rows = await getDb()
    .select({ id: conversations.id, updatedAt: conversations.updatedAt, messageContent: messages.content })
    .from(conversations)
    .leftJoin(messages, and(eq(messages.conversationId, conversations.id), eq(messages.userId, session.userId), eq(messages.role, "user")))
    .where(and(eq(conversations.userId, session.userId), eq(conversations.tripProjectId, tripProjectId)))
    .orderBy(desc(conversations.updatedAt), desc(conversations.id), asc(messages.createdAt), asc(messages.id));

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

export function formatTripProjectLabel(project: Pick<OwnedTripProjectSummary, "title" | "origin" | "destination">) {
  const route = [project.origin, project.destination].filter(Boolean).join(" → ");

  return route ? `${project.title} (${route})` : project.title;
}

function normalizeTripProjectInput(input: TripProjectInput) {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Trip project title is required.");
  }

  return {
    title,
    origin: normalizeOptionalText(input.origin),
    destination: normalizeOptionalText(input.destination),
    startDate: normalizeOptionalText(input.startDate),
    endDate: normalizeOptionalText(input.endDate),
    travelers: normalizeOptionalText(input.travelers),
    notes: normalizeOptionalText(input.notes),
  };
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function formatTripProjectAuditSummary(project: Pick<OwnedTripProjectSummary, "title" | "origin" | "destination" | "startDate" | "endDate">) {
  return JSON.stringify({
    titleLength: project.title.length,
    hasOrigin: Boolean(project.origin),
    hasDestination: Boolean(project.destination),
    hasStartDate: Boolean(project.startDate),
    hasEndDate: Boolean(project.endDate),
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
