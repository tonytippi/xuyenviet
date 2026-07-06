import { redirect } from "next/navigation";

import { getAuthenticatedSession } from "@/server/auth";

type AiAskPageProps = {
  searchParams?: Promise<{
    ref?: string | string[];
  }>;
};

function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AiAskPage({ searchParams }: AiAskPageProps) {
  const params = await searchParams;
  const referralCode = getFirstParam(params?.ref);
  const session = await getAuthenticatedSession();

  if (!session) {
    const signInParams = new URLSearchParams({ next: "/ai-ask" });

    if (referralCode) {
      signInParams.set("ref", referralCode);
    }

    redirect(`/sign-in?${signInParams.toString()}`);
  }

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-4xl flex-col justify-center gap-6 rounded-[2rem] border border-[#d8c9ad] bg-[#fbf7ed]/90 p-6 shadow-[0_24px_80px_rgba(41,33,18,0.14)] sm:p-8 lg:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#8c4f13]">AI Ask</p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[#17342c] sm:text-6xl">
          Cổng hỏi AI đã sẵn sàng cho phiên đăng nhập.
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-[#4f625a]">
          Xin chào {session.email}. Khu vực hỏi AI sẽ được nối với hội thoại, ngữ cảnh hành trình, truy xuất và nhà cung cấp AI trong các story sau.
        </p>
      </section>
    </main>
  );
}
