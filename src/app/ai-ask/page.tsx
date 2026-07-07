import { redirect } from "next/navigation";

import { AiAskComposer } from "@/features/ai/ai-ask-composer";
import { signOutCurrentUser } from "@/features/auth/actions";
import { getOwnedConversation, listOwnedConversations } from "@/features/chat-trips/conversations";
import { createTripProjectFromForm } from "@/features/chat-trips/actions";
import { getOwnedTripProjectSummary, listOwnedTripProjects } from "@/features/chat-trips/trip-projects";
import { getAuthenticatedSession } from "@/server/auth";

type AiAskPageProps = {
  searchParams?: Promise<{
    ref?: string | string[];
    conversationId?: string | string[];
    tripProjectId?: string | string[];
  }>;
};

function getFirstParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.find((item) => item.trim());
  }

  return value;
}

const examplePrompts = [
  "Hà Nội đi Đà Nẵng 7 ngày cùng gia đình nên dừng ở đâu?",
  "Đi Tây Bắc bằng ô tô tự lái mùa mưa cần lưu ý gì?",
  "TP. HCM đi Đà Lạt cuối tuần, lịch trình nào đỡ mệt?",
];

export default async function AiAskPage({ searchParams }: AiAskPageProps) {
  const params = await searchParams;
  const referralCode = getFirstParam(params?.ref);
  const requestedConversationId = getFirstParam(params?.conversationId)?.trim();
  const requestedTripProjectId = getFirstParam(params?.tripProjectId)?.trim();
  const session = await getAuthenticatedSession();

  if (!session) {
    const signInParams = new URLSearchParams({ next: "/ai-ask" });

    if (referralCode) {
      signInParams.set("ref", referralCode);
    }

    redirect(`/sign-in?${signInParams.toString()}`);
  }

  let loadedConversation = requestedConversationId ? await getOwnedConversation(requestedConversationId) : null;
  let selectedTripProject = requestedTripProjectId ? await getOwnedTripProjectSummary(requestedTripProjectId) : null;

  if (loadedConversation?.tripProjectId) {
    if (selectedTripProject && selectedTripProject.id !== loadedConversation.tripProjectId) {
      loadedConversation = null;
    } else if (!selectedTripProject) {
      selectedTripProject = await getOwnedTripProjectSummary(loadedConversation.tripProjectId);
    }
  }

  if (loadedConversation && selectedTripProject && loadedConversation.tripProjectId !== selectedTripProject.id) {
    loadedConversation = null;
  }

  const initialTripProjects = (await listOwnedTripProjects()) ?? [];
  const initialSessions = selectedTripProject ? selectedTripProject.relatedChats : (await listOwnedConversations()) ?? [];

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col gap-6 rounded-[2rem] border border-[#d8c9ad] bg-[#fbf7ed]/90 p-5 shadow-[0_24px_80px_rgba(41,33,18,0.14)] sm:p-8 lg:p-10">
        <header className="flex flex-col gap-4 border-b border-[#d8c9ad] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">AI Ask</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#17342c] sm:text-5xl">Hỏi trợ lý chuyến đi Việt Nam</h1>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <p className="rounded-full border border-[#d8c9ad] bg-white/70 px-4 py-2 text-sm font-semibold text-[#17342c]">{session.email}</p>
            <form action={signOutCurrentUser}>
              <button
                className="min-h-11 rounded-2xl border border-[#d8c9ad] bg-white/75 px-4 py-3 text-sm font-semibold text-[#17342c] transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-[#e5bd82]"
                type="submit"
              >
                Đăng xuất
              </button>
            </form>
          </div>
        </header>

        <div className="grid flex-1 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)_22rem]">
          <AiAskComposer
            key={loadedConversation?.id || "new-conversation"}
            initialConversationId={loadedConversation?.id}
            initialMessages={loadedConversation?.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              imageAttachments: message.imageAttachments.map((attachment) => ({
                id: attachment.id,
                originalFileName: attachment.originalFileName,
                mimeType: attachment.mimeType,
                byteSize: attachment.byteSize,
              })),
            }))}
            initialSessions={initialSessions}
            initialTripProjects={initialTripProjects}
            selectedTripProject={selectedTripProject ? {
              id: selectedTripProject.id,
              title: selectedTripProject.title,
              origin: selectedTripProject.origin,
              destination: selectedTripProject.destination,
              startDate: selectedTripProject.startDate,
              endDate: selectedTripProject.endDate,
              travelers: selectedTripProject.travelers,
              notes: selectedTripProject.notes,
            } : null}
            createTripProjectAction={createTripProjectFromForm}
          />

          <aside className="flex flex-col gap-4">
            <section className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5">
              <h2 className="text-lg font-semibold text-[#17342c]">Gợi ý câu hỏi</h2>
              <div className="mt-4 grid gap-3">
                {examplePrompts.map((prompt) => (
                  <p className="rounded-2xl border border-[#c47a24]/35 bg-[#fff8ec] p-4 text-sm font-semibold leading-6 text-[#8c4f13]" key={prompt}>
                    {prompt}
                  </p>
                ))}
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-[#d8c9ad] bg-white/75 p-5">
              <h2 className="text-lg font-semibold text-[#17342c]">Lưu trữ hội thoại</h2>
              <p className="mt-3 text-sm leading-6 text-[#4f625a]">
                Thông tin chuyến đi có thể được lưu để tiếp tục kế hoạch trong các bước sau. Thông báo này không chặn việc đặt câu hỏi.
              </p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
