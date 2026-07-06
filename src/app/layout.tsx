import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XuyenViet - AI road-trip companion",
  description: "Vietnamese-first AI assistant for planning road trips across Vietnam.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
