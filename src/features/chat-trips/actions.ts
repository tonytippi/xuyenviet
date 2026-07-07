"use server";

import { redirect } from "next/navigation";

import { createTripProject } from "@/features/chat-trips/trip-projects";

export async function createTripProjectFromForm(formData: FormData) {
  const project = await createTripProject({
    title: String(formData.get("title") ?? ""),
    origin: String(formData.get("origin") ?? ""),
    destination: String(formData.get("destination") ?? ""),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    travelers: String(formData.get("travelers") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });

  redirect(`/ai-ask?tripProjectId=${encodeURIComponent(project.id)}`);
}
