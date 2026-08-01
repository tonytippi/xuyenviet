import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOperator } from "../server/identity";

export default async function AdminHome() {
  const identity = await requireOperator();
  if (!identity) redirect("/sign-in");
  return <main><h1>Không gian điều hành XuyenViet</h1><p>Đăng nhập với quyền vận hành hợp lệ.</p><nav aria-label="Điều hành"><Link href="/">Tổng quan</Link></nav></main>;
}
