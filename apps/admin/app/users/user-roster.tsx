"use client";

import { useEffect, useRef, useState } from "react";

import type { AdminUserRosterPage, ManagedUserRole } from "@xuyenviet/contracts";

export function UserRoster({ initialPage }: { initialPage: AdminUserRosterPage }) {
  const [page, setPage] = useState(initialPage);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState(initialPage.search);
  const [loadingPage, setLoadingPage] = useState(false);
  const rosterRequest = useRef<AbortController | null>(null);
  const rosterGeneration = useRef(0);

  useEffect(() => () => rosterRequest.current?.abort(), []);

  async function load(cursor: string | null, nextSearch: string) {
    const generation = ++rosterGeneration.current;
    rosterRequest.current?.abort();
    const controller = new AbortController();
    rosterRequest.current = controller;
    setLoadingPage(true);
    setStatus("");
    try {
      const parameters = new URLSearchParams();
      if (nextSearch.trim()) parameters.set("search", nextSearch.trim());
      if (cursor) parameters.set("cursor", cursor);
      const response = await fetch(`/api/users?${parameters.toString()}`, { credentials: "same-origin", signal: controller.signal });
      const result: unknown = await response.json().catch(() => null);
      if (generation !== rosterGeneration.current) return;
      if (!response.ok || !result || typeof result !== "object") throw new Error("roster unavailable");
      const nextPage = result as AdminUserRosterPage;
      setPage((current) => cursor
        ? { ...nextPage, items: [...current.items, ...nextPage.items.filter((item) => !current.items.some((existing) => existing.id === item.id))] }
        : nextPage);
    } catch {
      if (generation === rosterGeneration.current && !controller.signal.aborted) setStatus("Không thể tải danh sách người dùng. Vui lòng thử lại.");
    } finally {
      if (generation === rosterGeneration.current) {
        rosterRequest.current = null;
        setLoadingPage(false);
      }
    }
  }

  async function change(userId: string, role: ManagedUserRole, operation: "grant" | "revoke") {
    setBusy(`${userId}:${role}`);
    setStatus("");
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { credentials: "same-origin", cache: "no-store" });
      const csrfBody: unknown = await csrfResponse.json().catch(() => null);
      const csrf = csrfBody && typeof csrfBody === "object" && typeof (csrfBody as { token?: unknown }).token === "string" ? (csrfBody as { token: string }).token : null;
      if (!csrfResponse.ok || !csrf) throw new Error("csrf unavailable");
      const response = await fetch(operation === "grant" ? `/api/users/${encodeURIComponent(userId)}/roles` : `/api/users/${encodeURIComponent(userId)}/roles/${role}`, { method: operation === "grant" ? "POST" : "DELETE", credentials: "same-origin", headers: { "content-type": "application/json", "X-XuyenViet-Admin-CSRF": csrf }, ...(operation === "grant" ? { body: JSON.stringify({ role }) } : {}) });
       const result: unknown = await response.json().catch(() => null);
       if (!response.ok || !result || typeof result !== "object") throw new Error("mutation failed");
       // A completed mutation supersedes every roster snapshot requested before it.
       ++rosterGeneration.current;
       rosterRequest.current?.abort();
       rosterRequest.current = null;
       setLoadingPage(false);
       setPage((current) => ({
        ...current,
        items: current.items.map((user) => {
          if (user.id !== userId) return user;
          const roles = user.roles.filter((item) => item !== role);
          if (operation === "grant") roles.push(role);
          return { ...user, roles: roles.sort() };
        }),
      }));
      setStatus("Đã cập nhật quyền người dùng.");
    } catch {
      setStatus("Không thể cập nhật quyền. Vui lòng tải lại trang và thử lại.");
    } finally {
      setBusy(null);
    }
  }

  return <main className="mx-auto max-w-6xl p-4 text-slate-900 sm:p-8">
    <header><p className="text-sm font-semibold text-emerald-800">KIỂM SOÁT TRUY CẬP</p><h1 className="mt-2 text-3xl font-bold">Người dùng và vai trò</h1><p className="mt-2">Chỉ quản trị viên có thể quản lý quyền vận hành.</p></header>
    <p className="mt-4" role="status">{status}</p>
    <form className="mt-6 flex max-w-xl gap-2" onSubmit={(event) => { event.preventDefault(); void load(null, search); }}>
      <label className="sr-only" htmlFor="user-search">Tìm kiếm người dùng theo tên hoặc email</label>
      <input className="min-w-0 flex-1 rounded border px-3 py-2" id="user-search" name="search" onChange={(event) => setSearch(event.target.value)} placeholder="Tìm theo tên hoặc email" type="search" value={search} />
      <button className="rounded border px-3 py-2 disabled:opacity-50" disabled={loadingPage} type="submit">Tìm kiếm</button>
    </form>
    <section className="mt-6 overflow-x-auto rounded-xl border"><table className="min-w-full text-left"><thead><tr><th className="p-3">Người dùng</th><th className="p-3">Vai trò</th><th className="p-3">Sử dụng AI</th><th className="p-3">Thao tác</th></tr></thead><tbody>{page.items.map((user) => <tr className="border-t" key={user.id}><td className="p-3"><strong>{user.name || "Chưa đặt tên"}</strong><br /><span>{user.email || "Không có email"}</span></td><td className="p-3">{user.roles.join(", ") || "traveler"}</td><td className="p-3">{user.usage.aiRequestCount} yêu cầu</td><td className="p-3"><div className="flex gap-2">{(["operator", "admin"] as const).map((role) => <button className="rounded border px-2 py-1 disabled:opacity-50" disabled={busy === `${user.id}:${role}`} key={role} onClick={() => void change(user.id, role, user.roles.includes(role) ? "revoke" : "grant")}>{user.roles.includes(role) ? `Thu hồi ${role}` : `Cấp ${role}`}</button>)}</div></td></tr>)}</tbody></table></section>
    {page.nextCursor ? <div className="mt-4"><button className="rounded border px-3 py-2 disabled:opacity-50" disabled={loadingPage} onClick={() => void load(page.nextCursor, page.search)} type="button">Tải thêm người dùng</button></div> : null}
  </main>;
}
