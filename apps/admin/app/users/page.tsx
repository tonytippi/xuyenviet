import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { readAdminUsers } from "../../server/users";

import { UserRoster } from "./user-roster";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ search?: string; cursor?: string }> }) {
  const identityHeaders = await headers();
  const params = await searchParams;
  const result = await readAdminUsers(new Request("https://admin.local", { headers: identityHeaders }), params.search, params.cursor);
  if (!result.ok) {
    if (result.error.code === "unauthorized") redirect("/sign-in");
    return <main><h1>Không thể mở danh sách người dùng</h1><p role="alert">{result.error.message}</p></main>;
  }
  return <UserRoster initialPage={result.value} />;
}
