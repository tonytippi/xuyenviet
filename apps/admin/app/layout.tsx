import type { Metadata } from "next";

export const metadata: Metadata = { title: "XuyenViet Điều hành" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
