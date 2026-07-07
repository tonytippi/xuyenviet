"use server";

import { redirect } from "next/navigation";

import { createTripProject } from "@/features/chat-trips/trip-projects";

export type CreateTripProjectFormState = { error?: string };

const stringFieldNames = ["title", "origin", "destination", "startDate", "endDate", "travelers", "notes"] as const;

export async function createTripProjectFromForm(
  _previous: CreateTripProjectFormState | undefined,
  formData: FormData,
): Promise<CreateTripProjectFormState> {
  const values: Record<(typeof stringFieldNames)[number], string> = {
    title: "",
    origin: "",
    destination: "",
    startDate: "",
    endDate: "",
    travelers: "",
    notes: "",
  };

  for (const name of stringFieldNames) {
    const value = formData.get(name);

    if (typeof value !== "string") {
      return { error: "Dữ liệu dự án không hợp lệ. Vui lòng gửi lại bằng biểu mẫu." };
    }

    values[name] = value;
  }

  let project: { id: string };

  try {
    project = await createTripProject(values);
  } catch (error) {
    if (error instanceof Error && /Authentication required/.test(error.message)) {
      redirect("/sign-in?next=/ai-ask");
    }

    return { error: "Không thể tạo dự án chuyến đi. Vui lòng kiểm tra tên dự án và các trường ngày (định dạng YYYY-MM-DD)." };
  }

  redirect(`/ai-ask?tripProjectId=${encodeURIComponent(project.id)}`);
}
