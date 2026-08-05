import type { Metadata } from "next";
import { AdminAccessGate } from "./admin-access-gate";
import "./globals.css";

export const metadata: Metadata = { title: "XuyenViet Điều hành" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <AdminAccessGate>{children}</AdminAccessGate>
      </body>
    </html>
  );
}
